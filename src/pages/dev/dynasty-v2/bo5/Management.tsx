/**
 * UX-6 — the E3A management screens of the live Dynasty BO5, on VIS-F4 visuals.
 *
 * Everything here renders the server's `management` block (API §3) and sends
 * the action in `next`, or one built from an option the server marked
 * `eligible`. Nothing is computed: fatigue, power, cohesion, proficiency,
 * eligibility and every explanation are the server's values, shown verbatim.
 * The only client choices are which option to send:
 *
 *   PreparationScreen  the whole plan (≤ slots days, in day order) → commit_preparation
 *   SquadDraftScreen   a squad player and a champion per role       → lock_lineup {champions, players}
 *   TacticsScreen      one between-game option                       → choose_tactic
 *
 * A refusal (ineligible, over budget, wrong phase) comes back as the server's
 * own readable message in the BO5 error panel; nothing is pre-validated here
 * beyond the `eligible` flags.
 */
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import type { E1Component, E1Contest, E1Role, E1Stage, E1StageTally, ManagementView, SeriesEnvelope } from "@/lib/dynasty/e1/contracts";
import { LIVE_LINEUPS, lineupChampions } from "@/lib/dynasty/e1/e2mapper";
import type { E2Champion, E2Lineup } from "@/lib/dynasty/e1/e2contracts";
import {
  STAGES, VARIABLE_TITLE, champTitle, isManagementComponent, ledgerValue, parseManagementSource, playerName, playerRow, signed, sourceTitle,
  type E3aActivity, type E3aActivityKind, type E3aCombatInputs, type E3aCombatPlayer, type E3aEffect, type E3aLedgerEntry, type E3aManagement, type E3aPlayerRow, type E3aPrepOption, type E3aScope, type E3aTacticChoice,
} from "@/lib/dynasty/e1/e3acontracts";
import type { DynastySeries } from "@/lib/dynasty/e1/useDynastySeries";
import { SimTag } from "../broadcast";
import { CLASS_COLOR, ClassGlyph, TraitChip } from "../cards";
import type { Player } from "../fixtures";
import { Btn, Eyebrow, Monogram, PLATE, Plate, RANKED_ROLE, Screen } from "../parts";
import { ROLE_ORDER, STAGE_NAME, champClass, shortName } from "./present";
import { influenceRows } from "./managementView";

const ROLE_TITLE: Record<E1Role, string> = { top: "Top", jng: "Jungle", mid: "Mid", bot: "Bot", sup: "Support" };
const SCOPE_TITLE: Record<E3aScope, string> = { permanent: "Permanent", series: "This series", game: "One game", temporary: "Temporary" };
const short = (n: string) => n.replace(/^SYN\s+/, "");
/** A ledger `at` group (`game:3`, `tactic:3`, …) in words. */
const groupTitle = (g: string) => g === "entry" ? "how the squad arrived" : g === "settlement" ? "the settlement"
  : g.startsWith("game:") ? `game ${g.slice(5)}` : g.startsWith("tactic:") ? `the break after game ${g.slice(7)}` : g;

/** A VIS-F4 monogram for a server player row (presentation only: core players ring as signed, reserves dashed). */
function MonoFor({ row, size = 40 }: { row: Pick<E3aPlayerRow, "player_id" | "name" | "role" | "core">; size?: number }) {
  const p = { id: row.player_id, name: row.name, role: row.role, kind: row.core ? "signed" : "academy", phase: { early: 0, mid: 0, late: 0 }, prof: [], conf: 0, fatigue: 0, traits: [] } as Player;
  return <Monogram p={p} size={size} />;
}

/** Fatigue 0..100 as the server reports it, with the power it costs (the server's `fatigue_power`). */
export function FatigueMeter({ value, power, threshold }: { value: number; power?: number; threshold?: number }) {
  const tone = value >= 60 ? "bg-rose-400/90" : value > (threshold ?? 30) ? "bg-amber-300/85" : "bg-sky-300/80";
  return (
    <span className="flex min-w-0 items-center gap-2 text-[10.5px] text-white/65" data-testid="fatigue" data-value={value}>
      <span className="uppercase tracking-wider text-white/50">Fatigue</span>
      <span className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`Fatigue ${value} of 100`}>
        <span aria-hidden className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${Math.min(100, value)}%` }} />
        {threshold ? <span aria-hidden className="absolute inset-y-[-1px] w-px bg-white/60" style={{ left: `${threshold}%` }} /> : null}
      </span>
      <b className="dyn-num text-white/85">{value}</b>
      {power !== undefined && power !== 0 ? <span className="dyn-num text-rose-300">{signed(power)} power</span> : null}
    </span>
  );
}

function NetPower({ net, testId }: { net: Record<E1Stage, number>; testId?: string }) {
  const any = STAGES.some((s) => net[s] !== 0);
  return (
    <span className="flex flex-wrap items-center gap-1 text-[10px]" data-testid={testId}>
      <span className="uppercase tracking-wider text-white/45">Management</span>
      {any ? STAGES.map((s) => (
        <span key={s} className={cn("dyn-num rounded-sm border px-1", net[s] > 0 ? "border-emerald-400/30 text-emerald-200" : net[s] < 0 ? "border-rose-400/30 text-rose-200" : "border-white/10 text-white/45")}>{STAGE_NAME[s][0]} {signed(net[s])}</span>
      )) : <span className="text-white/45">none</span>}
    </span>
  );
}

function Traits({ row }: { row: Pick<E3aPlayerRow, "traits" | "conditions"> }) {
  const conds = Object.entries(row.conditions ?? {}).filter(([, v]) => v);
  if (!row.traits.length && !conds.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {row.traits.map((t) => <TraitChip key={t.trait} label={`${t.trait === "in_form" ? "▲ In form" : t.trait === "rattled" ? "▼ Rattled" : t.trait} ${signed(t.value)} · ${t.games_remaining}g`} tone={t.value > 0 ? "gold" : "amber"} title={`From ${t.source}`} />)}
      {conds.map(([k, v]) => <TraitChip key={k} label={`${k} ${signed(v, 0)}`} tone={v > 0 ? "gold" : "amber"} title="E1 condition carried by the series" />)}
    </span>
  );
}

/** The VIS-F4 player card language for an E3A squad row: identity, role, ratings, fatigue, traits, management power. */
export function SquadCard({ row, m, champion, selected, onSelect, testId, children }: {
  row: E3aPlayerRow; m: E3aManagement; champion?: string; selected?: boolean; onSelect?: () => void; testId?: string; children?: ReactNode;
}) {
  const prof = champion ? row.proficiency?.find((p) => p.champion === champion) : undefined;
  const threshold = Number(m.rules.values.fatigue_threshold) || undefined;
  const body = (
    <>
      <div className="relative flex shrink-0 flex-col items-center self-start">
        <MonoFor row={row} size={42} />
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-sm border border-white/15 bg-[#07111f] px-1"><RoleEmblem role={RANKED_ROLE[row.role]} size="xs" decorative /></span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="dyn-title truncate text-[14px] font-semibold leading-tight text-white">{short(row.name)}</span>
          <span className={cn("rounded-sm border px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.14em]", row.core ? "border-[rgb(var(--dyn-accent-rgb)/0.5)] bg-[rgb(var(--dyn-accent-rgb)/0.12)] text-[var(--dyn-accent)]" : "border-white/20 bg-white/[0.05] text-white/60")}>{row.core ? "Core five" : "Reserve"}</span>
        </div>
        <span className="dyn-num text-[10.5px] text-white/55">{ROLE_TITLE[row.role]} · ratings E {row.stage_ratings[0]} · M {row.stage_ratings[1]} · L {row.stage_ratings[2]}</span>
        <FatigueMeter value={row.fatigue} power={row.fatigue_power} threshold={threshold} />
        <NetPower net={row.net_management_power} testId="net-power" />
        <Traits row={row} />
        {prof ? <span className="text-[10.5px] text-white/65" data-testid="card-proficiency">Proficiency on {short(champTitle(prof.champion))} <b className="dyn-num text-white/90">{prof.value.toFixed(2)}</b>{prof.practiced_by ? <span className="text-emerald-200"> · practiced ({prof.practiced_by})</span> : null}</span> : null}
        {!row.core && row.substitute_cohesion_cost ? <span className="text-[10.5px] text-amber-200/90" data-testid="sub-cost">Starting costs {row.substitute_cohesion_cost.toFixed(2)} cohesion for that game</span> : null}
        {children}
      </div>
    </>
  );
  const cls = cn(PLATE, "dyn-pcard relative flex w-full gap-3 overflow-hidden p-2.5 text-left", selected && "dyn-plate--selected border-[#e3c66f]/70");
  return onSelect ? (
    <button type="button" role="radio" aria-checked={!!selected} data-testid={testId} data-player={row.player_id} onClick={onSelect}
      className={cn(cls, "transition-colors hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]")}>{body}</button>
  ) : <div data-testid={testId} data-player={row.player_id} className={cls}>{body}</div>;
}

// ───────────────────────────────────────────── ledger, effects, carry-over

function entryLine(m: E3aManagement, e: E3aLedgerEntry) {
  const who = playerName(m, e.target);
  if (e.variable.startsWith("trait.")) {
    const name = e.variable.slice(6).replace("_", " ");
    if (e.before === null) return `${who} · gains ${name} (${signed(e.value ?? 0)} power, ${e.after} game${e.after === 1 ? "" : "s"})`;
    if (e.after === null) return `${who} · ${name} ended`;
    return `${who} · ${name}: ${e.before} → ${e.after} game(s) left`;
  }
  if (e.after === null) return `${who} · ${VARIABLE_TITLE(e.variable)} ${ledgerValue(e.variable, e.before)} → ended`;
  return `${who} · ${VARIABLE_TITLE(e.variable)} ${ledgerValue(e.variable, e.before)} → ${ledgerValue(e.variable, e.after)}`;
}

/** The ledger's own delta, in the variable's unit (null for gained/ended traits and expiries). */
function entryDelta(e: E3aLedgerEntry): { text: string; good: boolean } | null {
  if (e.delta === null) return e.variable.startsWith("trait.") && e.before === null && e.value ? { text: signed(e.value), good: e.value > 0 } : null;
  const hundredths = e.variable === "cohesion" || e.variable.startsWith("proficiency.");
  return { text: hundredths ? signed(e.delta / 100, 2) : e.variable.startsWith("team_power.") ? signed(e.delta) : signed(e.delta, 0), good: e.variable === "fatigue" ? e.delta < 0 : e.delta > 0 };
}

/** Ledger entries as the server wrote them: who, what, before → after, why, and how long it lasts. */
export function ChangeList({ m, entries, title, testId = "change-list", empty, side = "you", limit = 6 }: { m: E3aManagement; entries: E3aLedgerEntry[]; title: string; testId?: string; empty?: string; side?: "you" | "all"; limit?: number }) {
  const [all, setAll] = useState(false);
  const rows = side === "you" ? entries.filter((e) => e.team === "t_user") : entries;
  const theirs = side === "you" ? entries.length - rows.length : 0;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <Plate className="flex flex-col gap-2 p-3" testId={testId}>
      <div className="flex items-center gap-2"><Eyebrow>{title}</Eyebrow><SimTag>Server ledger</SimTag></div>
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-white/[0.06]">
          {shown.map((e) => {
            const d = entryDelta(e);
            return (
              <li key={e.n} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 text-[12px]" data-testid="change-entry" data-variable={e.variable} data-source={e.source}>
                <span className="min-w-0 text-white/85">{entryLine(m, e)}</span>
                {d ? <span className={cn("dyn-num rounded-sm px-1 text-[10.5px] font-bold", d.good ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300")}>{d.text}</span> : null}
                <span className="text-[10.5px] text-white/45">{SCOPE_TITLE[e.scope]}{e.clamped ? " · clamped" : ""}</span>
                <span className="w-full text-[11px] text-white/50">{e.reason}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[12px] text-white/55">{empty ?? "Nothing changed for your squad."}</p>}
      {rows.length > limit ? <button type="button" data-testid={`${testId}-toggle`} onClick={() => setAll((x) => !x)} className="min-h-[32px] self-start text-[11.5px] text-[#f2dc98] underline-offset-2 hover:underline">{all ? "Show fewer" : `Show all ${rows.length} changes`}</button> : null}
      {theirs ? <p className="text-[11px] text-white/45">{theirs} change{theirs > 1 ? "s" : ""} to the opponent's unmanaged squad (game-driven rules only).</p> : null}
    </Plate>
  );
}

function effectLine(m: E3aManagement, e: E3aEffect): string {
  const who = playerName(m, e.target);
  if (e.kind === "cohesion") return `${who}: cohesion ${e.value.toFixed(2)}`;
  if (e.kind === "champion_proficiency") return `${who}: ${short(champTitle(e.champion ?? ""))} proficiency ${e.value.toFixed(2)}`;
  if (e.kind === "fatigue") return `${who}: fatigue ${e.value}${e.power ? ` (${signed(e.power)} power)` : ""}`;
  if (e.kind === "vod_review" || e.kind === "quick_review") return `${e.kind === "vod_review" ? "VOD review" : "Quick review"}: ${signed(e.value)} team power in ${STAGE_NAME[e.stage as E1Stage] ?? e.stage}${e.for_game ? ` (game ${e.for_game})` : ""}`;
  if (e.kind.startsWith("trait.")) return `${who}: ${e.kind.slice(6).replace("_", " ")} ${signed(e.value)} · ${e.games_remaining} game(s)`;
  return `${who}: ${e.kind.replace(/_/g, " ")} ${signed(e.value, 0)}${e.games_remaining ? ` · ${e.games_remaining} game(s)` : ""}`;
}

/** Every active effect grouped by its one scope, with the server's meaning of each scope. */
export function EffectsPanel({ m, testId = "effects-panel" }: { m: E3aManagement; testId?: string }) {
  const mine = m.effects.filter((e) => e.for === "you");
  return (
    <Plate className="flex flex-col gap-2 p-3" testId={testId}>
      <div className="flex items-center gap-2"><Eyebrow>Active effects</Eyebrow><SimTag>{m.rules.calibration}</SimTag></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {m.scopes.map((sc) => {
          const rows = mine.filter((e) => e.scope === sc.scope);
          return (
            <div key={sc.scope} className="flex min-w-0 flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-2" data-testid={`scope-${sc.scope}`} data-count={rows.length}>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">{SCOPE_TITLE[sc.scope]}</span>
              <span className="text-[10.5px] text-white/45">{sc.meaning}</span>
              {rows.length ? rows.map((e, i) => <span key={i} className="truncate text-[11.5px] text-white/80" title={e.source}>{effectLine(m, e)}</span>) : <span className="text-[11px] text-white/35">none</span>}
            </div>
          );
        })}
      </div>
    </Plate>
  );
}

/** Series result: what would carry into the next series. A preview, except in a campaign series (UX-7), where the campaign carries exactly this at settlement. */
export function CarryForward({ m }: { m: E3aManagement }) {
  const c = m.carry_over.carry_out;
  const campaign = m.entry_scenario.key === "campaign";
  return (
    <Plate className="flex flex-col gap-2 p-3" testId="carry-forward" data-campaign={campaign}>
      <div className="flex items-center gap-2"><Eyebrow>What carries forward</Eyebrow><SimTag>{campaign ? "Carried at settlement" : "Preview"}</SimTag></div>
      <p className="text-[12px] text-white/60">{c.note}</p>
      <div className="grid gap-2 sm:grid-cols-3 text-[11.5px]">
        <div className="flex flex-col gap-0.5" data-testid="carry-permanent"><b className="text-[10px] uppercase tracking-[0.14em] text-white/70">Permanent</b>
          <span className="text-white/80">Cohesion {c.permanent.cohesion.toFixed(2)}</span>
          {c.permanent.practiced_proficiency.map((p) => <span key={`${p.player_id}|${p.champion}`} className="text-white/80">{playerName(m, p.player_id)}: {short(champTitle(p.champion))} {p.proficiency.toFixed(2)}</span>)}
        </div>
        <div className="flex flex-col gap-0.5" data-testid="carry-temporary"><b className="text-[10px] uppercase tracking-[0.14em] text-white/70">Temporary</b>
          {c.temporary.fatigue.filter((f) => f.now).map((f) => <span key={f.player_id} className="text-white/80">{playerName(m, f.player_id)}: fatigue {f.now} → {f.after_series_break} after a break</span>)}
          {c.temporary.traits.map((t) => <span key={`${t.player_id}|${t.trait}`} className="text-white/80">{playerName(m, t.player_id)}: {t.trait.replace("_", " ")} · {t.games_remaining}g</span>)}
          {c.temporary.conditions.map((x, i) => <span key={i} className="text-white/80">{x.kind} {signed(x.value, 0)} · {x.games_remaining}g</span>)}
        </div>
        <div className="flex flex-col gap-0.5" data-testid="carry-expire"><b className="text-[10px] uppercase tracking-[0.14em] text-white/70">Ends with the series</b>
          {c.expire_with_series.length ? c.expire_with_series.map((x, i) => <span key={i} className="text-white/80">{effectLine(m, x)}</span>) : <span className="text-white/40">nothing left active</span>}
        </div>
      </div>
    </Plate>
  );
}

// ───────────────────────────────────────────── headquarters: the squad

export function SquadScreen({ mv, onNext }: { mv: ManagementView; onNext: () => void }) {
  const m = mv.block;
  const sc = m.entry_scenario;
  return (
    <Screen testId="bo5-squad" eyebrow="Headquarters · your squad" title="Ten players, one starting five"
      kicker={<>Five core players and five reserves, as the server holds them. Entry state: <b className="text-white/85">{sc.title}</b>.</>}
      actions={<Btn primary beckon testId="squad-confirm" onClick={onNext}>To preparation</Btn>}>
      <Plate ornate className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-[12px] text-white/75" testId="entry-scenario" data-scenario={sc.key}>
        <span>Core fatigue <b className="dyn-num text-white">{sc.core_fatigue}</b></span>
        <span>Reserve fatigue <b className="dyn-num text-white">{sc.reserve_fatigue}</b></span>
        <span>Team cohesion <b className="dyn-num text-white">{m.you.cohesion.toFixed(2)}</b></span>
        <span className="text-white/50">Opponent: fatigue {sc.opponent_fatigue}, cohesion {(sc.opponent_cohesion / 100).toFixed(2)}, unmanaged</span>
      </Plate>
      <ul className="flex flex-col gap-2" data-testid="squad-roles">
        {ROLE_ORDER.map((r) => (
          <li key={r} className="grid gap-2 sm:grid-cols-2" data-testid={`squad-role-${r}`}>
            {m.you.players.filter((p) => p.role === r).map((p) => <SquadCard key={p.player_id} row={p} m={m} testId="squad-card" />)}
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] text-white/50" data-testid="squad-label">{m.squad.label}</p>
      <ChangeList m={m} entries={m.recent_changes.entries} title="How the squad arrived" testId="entry-changes" />
    </Screen>
  );
}

// ───────────────────────────────────────────── preparation

function defaultActivity(kind: E3aActivityKind, m: E3aManagement): E3aActivity {
  if (kind === "champion_practice") {
    const p = m.you.players.find((x) => x.core) ?? m.you.players[0];
    return { activity: kind, player_id: p.player_id, champion: p.proficiency?.[0]?.champion ?? "" };
  }
  if (kind === "vod_review") return { activity: kind, focus_stage: "late" };
  return { activity: kind } as E3aActivity;
}

function dayTitle(m: E3aManagement, a: E3aActivity, opts: E3aPrepOption[]): string {
  const t = opts.find((o) => o.activity === a.activity)?.title ?? a.activity;
  if (a.activity === "champion_practice") return `${t}: ${short(playerName(m, a.player_id))} on ${short(champTitle(a.champion))}`;
  if (a.activity === "vod_review") return `${t}: ${STAGE_NAME[a.focus_stage]}`;
  return t;
}

/** Three preparation days under the server's slot budget. Submitted whole, in day order; unused days are idle. */
export function PreparationScreen({ mv, s, onFocus }: { mv: ManagementView; s: DynastySeries; onFocus?: (k: E3aActivityKind | "idle") => void }) {
  const m = mv.block;
  const prep = m.decisions.preparation;
  const opts = prep.options ?? [];
  const slots = prep.slots;
  const [plan, setPlan] = useState<E3aActivity[]>([]);
  const busy = !!s.busy;
  const focus = (k: E3aActivityKind | "idle") => onFocus?.(k);
  const add = (kind: E3aActivityKind) => { if (plan.length >= slots) return; setPlan((p) => [...p, defaultActivity(kind, m)]); focus(kind); };
  const edit = (i: number, a: E3aActivity) => setPlan((p) => p.map((x, j) => (j === i ? a : x)));
  const remove = (i: number) => setPlan((p) => p.filter((_, j) => j !== i));
  const idle = slots - plan.length;
  return (
    <Screen testId="bo5-prep" eyebrow={`Preparation · ${slots} days before the series`} title="Plan the preparation days"
      kicker={<>{prep.rule} {prep.idle_day}</>}
      actions={<>
        {busy ? <span className="text-[11px] text-white/50" role="status">Sending the plan to the server…</span> : null}
        <Btn testId="prep-clear" disabled={busy || !plan.length} onClick={() => { setPlan([]); focus("idle"); }}>Clear</Btn>
        <Btn primary beckon testId="prep-commit" disabled={busy} onClick={() => void s.commitPreparation(plan)}>{plan.length ? `Commit ${plan.length}-day plan` : "Rest it out (all idle)"}</Btn>
      </>}>
      <Plate ornate className="flex flex-col gap-2 p-3" testId="prep-plan" data-planned={plan.length} data-slots={slots}>
        <div className="flex items-center gap-2"><Eyebrow>Your plan</Eyebrow><span className="dyn-num text-[11px] text-white/60" data-testid="prep-budget">{plan.length} of {slots} days planned · {idle} idle</span></div>
        <ol className="grid gap-2 sm:grid-cols-3">
          {Array.from({ length: slots }, (_, i) => {
            const a = plan[i];
            return (
              <li key={i} data-testid={`prep-day-${i + 1}`} data-activity={a?.activity ?? "idle"} className={cn("flex min-w-0 flex-col gap-1.5 rounded-lg border p-2", a ? "border-[#e3c66f]/40 bg-[#e3c66f]/[0.05]" : "border-dashed border-white/15")}>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Day {i + 1}</span>
                {a ? <>
                  <span className="text-[12.5px] font-semibold text-white">{dayTitle(m, a, opts)}</span>
                  {a.activity === "champion_practice" ? <PracticeFields m={m} a={a} onChange={(x) => edit(i, x)} /> : null}
                  {a.activity === "vod_review" ? (
                    <span className="flex flex-wrap gap-1" role="radiogroup" aria-label="Focus stage">
                      {STAGES.map((st) => <button key={st} type="button" role="radio" aria-checked={a.focus_stage === st} data-testid={`vod-stage-${st}`} onClick={() => edit(i, { activity: "vod_review", focus_stage: st })}
                        className={cn("min-h-[32px] rounded-md border px-2 text-[11px]", a.focus_stage === st ? "border-[#e3c66f]/70 bg-[#e3c66f]/15 text-white" : "border-white/15 text-white/65")}>{STAGE_NAME[st]}</button>)}
                    </span>
                  ) : null}
                  <button type="button" className="self-start text-[11px] text-white/50 underline-offset-2 hover:underline" data-testid={`prep-remove-${i + 1}`} onClick={() => remove(i)}>Remove</button>
                </> : <span className="text-[11.5px] text-white/45">{prep.idle_day}</span>}
              </li>
            );
          })}
        </ol>
      </Plate>
      <ul className="grid gap-2 sm:grid-cols-2" data-testid="prep-options">
        {opts.map((o) => (
          <li key={o.activity} data-testid={`prep-option-${o.activity}`} data-eligible={o.eligible} className={cn(PLATE, "flex flex-col gap-1.5 p-3", !o.eligible && "opacity-60")}>
            <div className="flex items-center gap-2"><b className="dyn-title text-[14px] text-white">{o.title}</b><span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-white/45">{o.cost_slots} day</span></div>
            <ul className="flex flex-col gap-0.5">{o.effects.map((x) => <li key={x} className="text-[12px] text-emerald-100/85">• {x}</li>)}</ul>
            <p className="text-[11.5px] text-white/55">Cost: {o.opportunity_cost}</p>
            {!o.eligible ? <p className="text-[11.5px] text-amber-200/90" data-testid="prep-unavailable">Unavailable: {o.unavailable_reason}</p> : null}
            <Btn testId={`prep-add-${o.activity}`} disabled={!o.eligible || plan.length >= slots || busy} className="min-h-[36px] self-start px-3 py-1 text-xs" onClick={() => add(o.activity)}>{plan.length >= slots ? "No days left" : `Add to day ${plan.length + 1}`}</Btn>
          </li>
        ))}
      </ul>
      <EffectsPanel m={m} />
    </Screen>
  );
}

function PracticeFields({ m, a, onChange }: { m: E3aManagement; a: Extract<E3aActivity, { activity: "champion_practice" }>; onChange: (a: E3aActivity) => void }) {
  const p = playerRow(m, a.player_id);
  return (
    <span className="flex flex-col gap-1">
      <select aria-label="Player to practise" data-testid="practice-player" value={a.player_id} className="min-h-[32px] rounded-md border border-white/15 bg-[#0b1727] px-1 text-[11.5px] text-white"
        onChange={(e) => { const np = playerRow(m, e.target.value); onChange({ activity: "champion_practice", player_id: e.target.value, champion: np?.proficiency?.[0]?.champion ?? a.champion }); }}>
        {m.you.players.map((x) => <option key={x.player_id} value={x.player_id}>{short(x.name)} ({x.role}{x.core ? "" : ", reserve"})</option>)}
      </select>
      <select aria-label="Champion to practise" data-testid="practice-champion" value={a.champion} className="min-h-[32px] rounded-md border border-white/15 bg-[#0b1727] px-1 text-[11.5px] text-white"
        onChange={(e) => onChange({ ...a, champion: e.target.value })}>
        {(p?.proficiency ?? []).map((x) => <option key={x.champion} value={x.champion}>{short(champTitle(x.champion))} · {x.value.toFixed(2)}{x.practiced_by ? " (practiced)" : ""}</option>)}
      </select>
    </span>
  );
}

// ───────────────────────────────────────────── draft: squad + champions

function CombatTeam({ t, title, testId }: { t: E3aCombatInputs["you"]; title: string; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid={testId}>
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">{title}</span>
      <span className="dyn-num text-[11.5px] text-white/75" data-testid={`${testId}-cohesion`}>Cohesion {t.cohesion.base.toFixed(2)}{t.cohesion.substitutes ? ` − ${t.cohesion.substitute_cost.toFixed(2)} for ${t.cohesion.substitutes} reserve${t.cohesion.substitutes > 1 ? "s" : ""}` : ""} = {t.cohesion.effective.toFixed(2)} → team power {signed(t.cohesion.team_power)}</span>
      {t.team_modifiers.map((x) => <span key={x.source} className="text-[11.5px] text-emerald-200/90">{sourceTitle(x.source)}: {signed(x.value)} team power in {x.stages.map((st) => STAGE_NAME[st]).join(", ")}{x.origin ? ` · ${x.origin}` : ""}</span>)}
      <ul className="flex flex-col gap-0.5">
        {t.players.map((p) => (
          <li key={p.player_id} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]" data-testid="input-player" data-player={p.player_id}>
            <span className="w-8 uppercase text-white/45">{p.role}</span>
            <span className="text-white/85">{short(p.name)}</span>
            <span className="text-white/55">on {short(champTitle(p.champion))} · prof {p.proficiency.toFixed(2)} ({signed(p.proficiency_power)})</span>
            {p.modifiers.map((x) => <span key={x.source} className={cn("dyn-num", x.value < 0 ? "text-rose-300" : "text-emerald-300")}>{sourceTitle(x.source)} {signed(x.value)}{x.stages.length < 3 ? ` (${x.stages.map((st) => STAGE_NAME[st]).join("/")})` : ""}</span>)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The exact combat inputs the server built (or would build) for a lineup. */
export function CombatInputsPanel({ ci, title, note, testId = "combat-inputs" }: { ci: E3aCombatInputs; title: string; note?: ReactNode; testId?: string }) {
  return (
    <Plate className="flex flex-col gap-2 p-3" testId={testId}>
      <div className="flex items-center gap-2"><Eyebrow>{title}</Eyebrow><SimTag>Server</SimTag></div>
      {note ? <p className="text-[11.5px] text-white/55">{note}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <CombatTeam t={ci.you} title="You" testId="inputs-you" />
        <CombatTeam t={ci.opponent} title="Opponent (unmanaged)" testId="inputs-opponent" />
      </div>
    </Plate>
  );
}

function ChampChip({ c, picked, prof, onPick, testId }: { c: E2Champion | { key: string; name: string; composition: null }; picked: boolean; prof?: { value: number; practiced_by: string | null }; onPick: () => void; testId: string }) {
  const cls = champClass(c.composition?.class ?? "");
  return (
    <button type="button" role="radio" aria-checked={picked} data-testid={testId} data-champion={c.key} onClick={onPick}
      className={cn("flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]", picked ? "border-[#e3c66f] bg-[#e3c66f]/15 text-white" : "border-white/14 bg-white/[0.03] text-white/75 hover:border-white/35")}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: `${CLASS_COLOR[cls]}66`, background: `${CLASS_COLOR[cls]}1a` }}><ClassGlyph cls={cls} size={13} /></span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-semibold">{shortName(c.name)}</span>
        {prof ? <span className="dyn-num text-[10px] text-white/55">prof {prof.value.toFixed(2)}{prof.practiced_by ? <span className="text-emerald-300"> ★</span> : null}</span> : null}
      </span>
    </button>
  );
}

const sameMap = (a: Record<string, string>, b: Record<string, string>) => ROLE_ORDER.every((r) => a[r] === b[r]);

/** Draft for an E3A series: one squad player and one champion per role, locked together. */
export function SquadDraftScreen({ env, mv, s, onLocked }: { env: SeriesEnvelope; mv: ManagementView; s: DynastySeries; onLocked: () => void }) {
  const m = mv.block;
  const l = mv.lineup!;
  const [players, setPlayers] = useState<Record<E1Role, string>>(() => ({ ...l.suggested_players }));
  const [champs, setChamps] = useState<E2Lineup>(() => ({ ...l.suggested }));
  const poolKeys = useMemo(() => new Set(l.champion_pool.map((c) => c.key)), [l.champion_pool]);
  const suggested = sameMap(players, l.suggested_players) && sameMap(champs, l.suggested);
  const busy = !!s.busy;
  const reserves = ROLE_ORDER.filter((r) => !playerRow(m, players[r])?.core);
  const changes = m.recent_changes;
  const presets = LIVE_LINEUPS.filter((x) => x.champions.every((k) => poolKeys.has(k)));
  return (
    <Screen testId="bo5-draft" eyebrow={`Game ${l.game} · squad and draft`} title="Pick your five and their champions"
      kicker={<>{l.rule} {env.series.current_game && env.series.current_game > 1 ? null : "Proficiency is per player and champion: a practiced pick shows ★."}</>}
      actions={<>
        {busy ? <span className="text-[11px] text-white/50" role="status">Locking with the server…</span> : null}
        <Btn testId="draft-reset" disabled={busy || suggested} onClick={() => { setPlayers({ ...l.suggested_players }); setChamps({ ...l.suggested }); }}>Back to the suggestion</Btn>
        <Btn primary beckon testId="draft-lock" disabled={busy} onClick={async () => { const out = await s.lockSquad(champs, players); if (out) onLocked(); }}>Lock in</Btn>
      </>}>
      {l.game > 1 ? <ChangeList m={m} entries={changes.entries} title={`Since your last decision: ${changes.groups.map(groupTitle).join(" and ")}`} testId="draft-changes" /> : null}
      <div className="flex flex-wrap items-center gap-2" data-testid="draft-presets">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-white/50">Champion sets</span>
        {presets.map((x) => {
          const set = lineupChampions(x.lineup_id)!;
          return <Btn key={x.lineup_id} testId={`preset-${x.lineup_id}`} className={cn("min-h-[34px] px-2.5 py-1 text-[11px]", sameMap(champs, set) && "border-[#e3c66f]/70")} onClick={() => setChamps(set)}>{x.title.split(" (")[0]}</Btn>;
        })}
      </div>
      <ul className="flex flex-col gap-2.5" data-testid="draft-roles">
        {ROLE_ORDER.map((r) => {
          const pid = players[r];
          const row = playerRow(m, pid);
          const candidates = l.players_by_role[r] ?? [];
          const champions = (row?.proficiency ?? []).filter((p) => poolKeys.has(p.champion));
          return (
            <li key={r} className={cn(PLATE, "flex flex-col gap-2 p-2.5")} data-testid={`draft-role-${r}`} data-player={pid} data-champion={champs[r]}>
              <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/65"><RoleEmblem role={RANKED_ROLE[r]} size="xs" decorative />{ROLE_TITLE[r]}</span>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`${ROLE_TITLE[r]} player`}>
                {candidates.map((p) => <SquadCard key={p.player_id} row={p} m={m} champion={champs[r]} selected={p.player_id === pid} onSelect={() => setPlayers((x) => ({ ...x, [r]: p.player_id }))} testId={`pick-player-${p.player_id}`} />)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label={`${ROLE_TITLE[r]} champion`}>
                {champions.map((p) => {
                  const c = l.champion_pool.find((x) => x.key === p.champion) ?? { key: p.champion, name: champTitle(p.champion), composition: null };
                  return <ChampChip key={p.champion} c={c} picked={champs[r] === p.champion} prof={p} onPick={() => setChamps((x) => ({ ...x, [r]: p.champion }))} testId={`pick-champ-${r}-${p.champion}`} />;
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {suggested ? (
        <CombatInputsPanel ci={l.preview} title="What this lineup brings into the game" testId="lineup-preview"
          note="The server's exact inputs for this lineup: the same function builds the game. Each value appears as a contest component on the stage." />
      ) : (
        <Plate className="flex flex-col gap-1.5 p-3" testId="lineup-preview-changed">
          <div className="flex items-center gap-2"><Eyebrow>Changed lineup</Eyebrow><SimTag>No server preview</SimTag></div>
          <p className="text-[12px] text-white/65">The server previews only its suggested lineup (owner decision U6). Each card above shows that player's own fatigue and management power; the exact inputs, including proficiency on these picks, appear as soon as you lock.</p>
          <p className="text-[12px] text-white/75" data-testid="cohesion-note">Team cohesion {m.you.cohesion.toFixed(2)}{reserves.length ? `; ${reserves.length} reserve${reserves.length > 1 ? "s" : ""} starting: ${reserves.map((r) => `${short(playerName(m, players[r]))} −${(playerRow(m, players[r])?.substitute_cohesion_cost ?? 0).toFixed(2)}`).join(", ")} for this game only` : "; no reserve starting"}.</p>
        </Plate>
      )}
    </Screen>
  );
}

// ───────────────────────────────────────────── backstage: the one decision between games

export function TacticsScreen({ mv, s, kicker }: { mv: ManagementView; s: DynastySeries; kicker: ReactNode }) {
  const m = mv.block;
  const t = m.decisions.tactics!;
  const [choice, setChoice] = useState<E3aTacticChoice>("none");
  const busy = !!s.busy;
  return (
    <Screen testId="bo5-decision" eyebrow={`Backstage · after game ${t.after_game}`} title="One adjustment before the next game" kicker={kicker}
      actions={<Btn primary beckon testId="decision-confirm" disabled={busy} onClick={() => void s.chooseTactic(t.after_game, choice)}>Confirm and go to the draft</Btn>}>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Between-game decision">
        {t.options.map((o) => (
          <button key={o.choice} type="button" role="radio" aria-checked={choice === o.choice} disabled={!o.eligible} data-testid={`tactic-${o.choice}`} data-eligible={o.eligible} onClick={() => setChoice(o.choice)}
            className={cn(PLATE, "flex flex-col gap-1 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]", choice === o.choice && "dyn-plate--selected border-[#e3c66f]/70", !o.eligible && "cursor-not-allowed opacity-55")}>
            <span className="flex items-center gap-2"><b className="text-white">{o.title}</b>{o.scope ? <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">{SCOPE_TITLE[o.scope]}</span> : null}</span>
            {o.effects.length ? o.effects.map((x) => <span key={x} className="text-[12.5px] text-emerald-100/85">{x}</span>) : <span className="text-[12.5px] text-white/60">Nothing changes.</span>}
            <span className="text-[11.5px] text-white/50">{o.opportunity_cost}</span>
            {!o.eligible ? <span className="text-[11.5px] text-amber-200/90">Unavailable: {o.unavailable_reason}</span> : null}
          </button>
        ))}
      </div>
      <ChangeList m={m} entries={m.recent_changes.entries} title={`What game ${t.after_game} did`} testId="game-changes" />
      <EffectsPanel m={m} />
    </Screen>
  );
}

// ───────────────────────────────────────────── in game: what management did to this stage

export function ManagementInfluence({ tally, mv }: { tally: E1StageTally; mv: ManagementView }) {
  const rows = influenceRows(tally, mv);
  const mine = rows.filter((r) => r.side === "you");
  const theirs = rows.filter((r) => r.side === "opponent");
  return (
    <section aria-label="Management influence" className={cn(PLATE, "flex flex-col gap-1.5 px-3 py-2")} data-testid="mgmt-influence" data-count={rows.length} data-stage={tally.stage}>
      <div className="flex items-center gap-2"><Eyebrow>Management · {STAGE_NAME[tally.stage]}</Eyebrow><SimTag>Contest components</SimTag></div>
      {mine.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {mine.map((r) => (
            <li key={r.key} data-testid="influence-row" data-value={r.value} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", r.value >= 0 ? "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-100" : "border-rose-400/30 bg-rose-400/[0.07] text-rose-100")} title={r.fact}>
              <span className="text-[9.5px] font-bold uppercase text-white/55">{r.role ?? "team"}</span>
              <span className="truncate">{r.title}</span>
              <b className="dyn-num">{signed(r.value)}</b>
              <span className="hidden truncate text-white/50 sm:inline">· {r.fact}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[11.5px] text-white/55">No management term moved your contests in this stage.</p>}
      {theirs.length ? <p className="text-[11px] text-white/50" data-testid="influence-opponent">Opponent (game-driven only): {theirs.map((r) => `${r.role ?? "team"} ${r.title} ${signed(r.value)}`).join(" · ")}</p> : null}
    </section>
  );
}
