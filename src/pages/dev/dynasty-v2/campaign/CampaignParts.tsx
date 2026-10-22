/**
 * UX-7 — the campaign's building blocks, in the VIS-F4 plate language. Every
 * value is a field of the E3B campaign snapshot, rendered as served: the map
 * statuses, standings, stakes, the bye, the carried state and the story text
 * are the server's. Nothing here decides who advances or what carries.
 */
import { useState, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAP_STATUS_TEXT, champName, stageIdentity, stageTitle, isActivityList, oppShort,
  type BetweenSeries, type CampaignOpponent, type CampaignSnapshot, type CampaignStage, type Ending, type HistoryEntry, type MapNode, type RosterPlayer, type StoryBeat, type Transition,
} from "@/lib/dynasty/e1/campaignContracts";
import type { E1Role } from "@/lib/dynasty/e1/contracts";
import { SimTag } from "../broadcast";
import { TraitChip } from "../cards";
import { Btn, Eyebrow, PLATE, Plate, Sigil } from "../parts";
import { PanelArt, StoryBeat as StoryStrip } from "../story";
import { FatigueMeter } from "../bo5/Management";
import { BEAT_KICKER, beatArt, stripBeats } from "./campaignView";

const ROLES: E1Role[] = ["top", "jng", "mid", "bot", "sup"];
const ROLE_TITLE: Record<E1Role, string> = { top: "Top", jng: "Jungle", mid: "Mid", bot: "Bot", sup: "Support" };
const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`;
const pname = (c: CampaignSnapshot, pid: string | null | undefined) => (c.roster?.players.find((p) => p.player_id === pid)?.name ?? pid ?? "Team").replace(/^SYN\s+/, "");

export function CampaignBanner({ c, compact }: { c: CampaignSnapshot | null; compact?: boolean }) {
  return (
    <div role="note" data-testid="campaign-banner" className={cn("flex items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-300/[0.06] px-3 text-[11px] leading-snug text-emerald-50/85", compact ? "py-1" : "py-1.5")}>
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
      <span className={cn(compact && "truncate")}>
        <strong className="font-semibold text-emerald-50">UX-7 · live E3B campaign · </strong>
        Synthetic squad, opponents and format; provisional and uncalibrated.<span className={cn("hidden", compact ? "md:inline" : "sm:inline")}> The server decides qualification, byes, eliminations, carry and every result{c ? <> ({c.format.calibration})</> : null}.</span>
      </span>
    </div>
  );
}

/** One stage's record as the server keeps it, with its own rules (qualify / bye wins) when it has them. */
export function StandingLine({ c, stage }: { c: CampaignSnapshot; stage: CampaignStage }) {
  const st = c.standing[stage];
  if (!st) return null;
  return (
    <span className="dyn-num text-[11.5px] text-white/70" data-testid={`standing-${stage}`} data-wins={st.wins} data-losses={st.losses}>
      <b className="text-white">{st.wins}–{st.losses}</b>
      {st.kind === "record" && st.qualify_wins ? <span className="text-white/50"> · {st.qualify_wins} wins qualify{st.bye_wins ? ` · ${st.bye_wins}–0 earns a bye` : ""}</span> : null}
      {st.kind === "knockout" ? <span className="text-white/50"> · knockout</span> : null}
    </span>
  );
}

const NODE_TONE: Record<MapNode["status"], string> = {
  won: "border-emerald-300/50 bg-emerald-300/[0.08]",
  lost: "border-rose-400/50 bg-rose-400/[0.08]",
  current: "border-[#e3c66f]/80 bg-[#e3c66f]/[0.12] dyn-plate--selected",
  upcoming: "border-white/15 bg-white/[0.02]",
  skipped_bye: "border-sky-300/40 border-dashed bg-sky-300/[0.05]",
  not_reached: "border-white/10 border-dashed opacity-55",
  closed: "border-white/10 opacity-55",
};

/** The run as the server maps it: three stages, one node per round, each with its served status. */
export function CampaignMap({ c, compact }: { c: CampaignSnapshot; compact?: boolean }) {
  const stages = c.format.stages.map((s) => s.stage);
  return (
    <Plate className="flex flex-col gap-3 p-3" testId="campaign-map">
      <div className="flex flex-wrap items-center gap-2"><Eyebrow>The road</Eyebrow><span className="text-[11px] text-white/50">{c.format.title}</span><SimTag>{c.format.length.min_series}–{c.format.length.max_series} series</SimTag></div>
      <div className={cn("grid gap-3", !compact && "md:grid-cols-3")}>
        {stages.map((stage) => {
          const id = stageIdentity(stage);
          const nodes = c.map.filter((n) => n.stage === stage);
          return (
            <section key={stage} aria-label={stageTitle(stage)} className="flex min-w-0 flex-col gap-1.5" data-testid={`map-stage-${stage}`}>
              <div className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 rotate-45" style={{ background: id.accent }} />
                <span className={cn("text-[10.5px] font-bold uppercase tracking-[0.18em]", id.ink)}>{stageTitle(stage)}</span>
                <span className="ml-auto"><StandingLine c={c} stage={stage} /></span>
              </div>
              <ol className="flex flex-col gap-1.5">
                {nodes.map((n) => (
                  <li key={n.round} data-testid="map-node" data-round={n.round} data-status={n.status} aria-current={n.status === "current" ? "step" : undefined}
                    className={cn("flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px]", NODE_TONE[n.status])}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-white">{n.title}{n.knockout ? <span className="ml-1 text-[9.5px] uppercase tracking-wider text-rose-200/80">KO</span> : null}</span>
                      <span className="block truncate text-[11px] text-white/55">{n.opponent ? oppShort(n.opponent.name) : n.status === "skipped_bye" ? "Skipped: you earned the bye" : "Opponent drawn later"}</span>
                    </span>
                    {n.score ? <b className="dyn-num shrink-0 text-[13px] text-white">{n.score.you}–{n.score.opponent}</b> : null}
                    <span className={cn("shrink-0 rounded-full border px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wider",
                      n.status === "won" ? "border-emerald-300/40 text-emerald-200" : n.status === "lost" ? "border-rose-400/40 text-rose-200" : n.status === "current" ? "border-[#e3c66f]/60 text-[#f2dc98]" : "border-white/15 text-white/50")}>{MAP_STATUS_TEXT[n.status]}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </Plate>
  );
}

/** The next opponent, with the served rival/rematch context. All synthetic. */
export function OpponentCard({ c, o }: { c: CampaignSnapshot; o: CampaignOpponent }) {
  const rival = c.story.rival && c.story.rival.opponent.opponent_id === o.opponent_id ? c.story.rival : null;
  const rematch = c.story.stakes?.rematch_of ?? [];
  return (
    <Plate className="flex flex-col gap-2 p-3" testId="next-opponent" data-opponent={o.opponent_id}>
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow>Next opponent</Eyebrow><SimTag>{o.evidence_type === "synthetic_fixture_certified" ? "Synthetic team" : "Synthetic"}</SimTag>
        {rematch.length ? <span className="rounded-full border border-orange-300/50 bg-orange-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-200" data-testid="rematch-badge">Rematch</span> : null}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="dyn-title text-[20px] font-semibold text-white">{oppShort(o.name)}</span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-white/50">{o.tier.replace(/_/g, " ")}</span>
      </div>
      {o.style ? <p className="text-[12.5px] text-white/70">{o.style}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/65">
        {o.ratings ? <span className="dyn-num">Ratings E {o.ratings[0]} · M {o.ratings[1]} · L {o.ratings[2]}</span> : null}
        {o.cohesion !== undefined ? <span className="dyn-num">Cohesion {o.cohesion}</span> : null}
        <span className="text-white/45">Unmanaged; arrives fresh each series</span>
      </div>
      {rival?.meetings.some((m) => m.score) ? (
        <ul className="flex flex-col gap-0.5 text-[12px] text-orange-100/85" data-testid="rematch-history">
          {rival.meetings.filter((m) => m.score).map((m) => <li key={m.series_index}>Met in {m.round_title}: {m.result} {m.score!.you}–{m.score!.opponent}</li>)}
        </ul>
      ) : null}
    </Plate>
  );
}

/** What this series means, exactly as served (stakes text, must-win flag, the bye window). */
export function StakesPlate({ c }: { c: CampaignSnapshot }) {
  const cs = c.current_series;
  if (!cs) return null;
  const id = stageIdentity(cs.stage);
  return (
    <Plate ornate className="flex flex-col gap-2 p-3" testId="stakes" data-elimination={cs.elimination_if_lost} data-bye={cs.bye} style={{ borderColor: `${id.accent}66` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-[10.5px] font-bold uppercase tracking-[0.2em]", id.ink)}>{id.kicker} · series {cs.series_index}</span>
        {cs.elimination_if_lost ? <span className="rounded-full border border-rose-400/60 bg-rose-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-100" data-testid="must-win">Must win: a loss ends the run</span> : null}
        {cs.bye ? <span className="rounded-full border border-sky-300/50 bg-sky-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-100" data-testid="bye-badge">After a bye</span> : null}
      </div>
      <h3 className="dyn-title text-[22px] font-semibold leading-tight text-white">{cs.round_title}</h3>
      <p className="text-[13px] text-white/75" data-testid="stakes-text">{cs.stakes}</p>
      {cs.bye ? <p className="text-[12px] text-sky-100/80">The 3–0 split earned the bye: the playoff semifinal was skipped, and this window has {c.format.bye.extra_prep_slots} extra day and {c.format.bye.extra_recovery} extra recovery.</p> : null}
    </Plate>
  );
}

function PlayerLine({ p, threshold }: { p: RosterPlayer; threshold?: number }) {
  const traits = p.traits.filter((t): t is { trait: string; value: number; games_remaining: number } => typeof (t as { trait?: unknown }).trait === "string");
  const conds = Object.entries(p.conditions ?? {}).filter(([, v]) => typeof v === "number" && v);
  return (
    <li className={cn("flex min-w-0 flex-col gap-1 rounded-lg border px-2.5 py-2", p.core ? "border-white/12 bg-white/[0.03]" : "border-dashed border-white/10")} data-testid="roster-player" data-player={p.player_id} data-fatigue={p.fatigue}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="w-14 shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/45">{ROLE_TITLE[p.role]}</span>
        <span className="truncate text-[13px] font-semibold text-white">{p.name.replace(/^SYN\s+/, "")}</span>
        <span className={cn("ml-auto shrink-0 rounded-sm border px-1 text-[9px] font-bold uppercase tracking-[0.12em]", p.core ? "border-[#e3c66f]/40 text-[#f2dc98]" : "border-white/15 text-white/45")}>{p.core ? "Core" : "Reserve"}</span>
      </span>
      <FatigueMeter value={p.fatigue} power={p.fatigue_power} threshold={threshold} />
      {traits.length || conds.length || p.practiced.length ? (
        <span className="flex flex-wrap gap-1">
          {traits.map((t) => <TraitChip key={t.trait} label={`${t.trait === "in_form" ? "▲ In form" : t.trait === "rattled" ? "▼ Rattled" : t.trait} ${signed(t.value)} · ${t.games_remaining}g`} tone={t.value > 0 ? "gold" : "amber"} />)}
          {conds.map(([k, v]) => <TraitChip key={k} label={`${k} ${signed(v as number, 0)}`} tone={(v as number) > 0 ? "gold" : "amber"} />)}
          {p.practiced.map((x) => <span key={x.champion} className="rounded-sm border border-emerald-300/30 bg-emerald-300/[0.06] px-1 text-[10px] text-emerald-100" data-testid="practiced">★ {champName(x.champion)} {x.value.toFixed(2)}</span>)}
        </span>
      ) : null}
    </li>
  );
}

/** The persistent squad (live while a series is open, else as of the last settled series). */
export function RosterCondition({ c, compact }: { c: CampaignSnapshot; compact?: boolean }) {
  const [reserves, setReserves] = useState(false);
  if (!c.roster) return null;
  const roster = c.roster;
  const shown = roster.players.filter((p) => p.core || reserves);
  return (
    <Plate className="flex flex-col gap-2 p-3" testId="roster-condition" data-as-of={roster.as_of}>
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow>Squad condition</Eyebrow>
        <SimTag>{roster.as_of === "live" ? "Live" : "After the last series"}</SimTag>
        <span className="dyn-num ml-auto text-[12px] text-white/75" data-testid="roster-cohesion">Cohesion <b className="text-white">{roster.cohesion.toFixed(2)}</b></span>
      </div>
      <ul className={cn("grid gap-1.5", !compact && "sm:grid-cols-2")}>
        {ROLES.flatMap((r) => shown.filter((p) => p.role === r)).map((p) => <PlayerLine key={p.player_id} p={p} />)}
      </ul>
      <button type="button" data-testid="roster-reserves" onClick={() => setReserves((x) => !x)} className="min-h-[32px] self-start text-[11.5px] text-[#f2dc98] underline-offset-2 hover:underline">{reserves ? "Hide the reserves" : "Show the five reserves"}</button>
    </Plate>
  );
}

/** The between-series window: budget, the break, the idle-day rule and every activity by location, eligibility as served. */
export function WindowPanel({ w, action }: { w: BetweenSeries; action: ReactNode }) {
  return (
    <Plate ornate className="flex flex-col gap-3 p-3" testId="window" data-slots={w.slots} data-bye={w.bye}>
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow>Between-series window</Eyebrow>
        <span className="dyn-num rounded-full border border-[#e3c66f]/50 bg-[#e3c66f]/10 px-2 py-0.5 text-[11px] font-bold text-[#f6dd8f]" data-testid="window-slots">{w.slots} preparation day{w.slots === 1 ? "" : "s"}</span>
        {w.break ? <span className="text-[11.5px] text-sky-100/80" data-testid="window-break">{w.break.reason}: fatigue −{w.break.recovery}{w.break.bye ? " (bye)" : ""}, already applied</span> : null}
      </div>
      <p className="text-[12px] text-white/60">{w.idle_day} Plan as many days as you like; the series begins when you commit.</p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {w.locations.filter((l) => isActivityList(l.activities) && l.activities.length).map((l) => (
          <li key={l.key} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-2" data-testid={`location-${l.key}`}>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/75">{l.title}</span>
            {(isActivityList(l.activities) ? l.activities : []).map((a) => (
              <div key={a.activity} className={cn("flex flex-col gap-0.5", !a.eligible && "opacity-60")} data-testid={`activity-${a.activity}`} data-eligible={a.eligible}>
                <span className="text-[12.5px] font-semibold text-white">{a.title}</span>
                {a.effects.map((x) => <span key={x} className="text-[11px] text-emerald-100/80">• {x}</span>)}
                {!a.eligible && a.unavailable_reason ? <span className="text-[11px] text-amber-200/90">Unavailable: {a.unavailable_reason}</span> : <span className="text-[10.5px] text-white/45">{a.opportunity_cost}</span>}
              </div>
            ))}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-2">{action}</div>
    </Plate>
  );
}

function BeatPanelArt({ b, accent }: { b: StoryBeat; accent: string }) {
  const k = beatArt(b);
  if (k === "baron") return <div className="flex h-full w-full items-center justify-center bg-[#0b0820]"><Sigil kind="baron" size={64} /></div>;
  return <PanelArt kind={k} accent={accent} />;
}

/** The server's derived story beats as a comic strip (VIS-F2 `StoryBeat`): never modal, skippable, captions verbatim. */
export function CampaignStory({ c, beats, title, id, accent = "#e3c66f", tone = "gold" }: { c: CampaignSnapshot; beats: StoryBeat[]; title: string; id: string; accent?: string; tone?: "gold" | "cold" }) {
  const shown = stripBeats(beats);
  if (!shown.length) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="campaign-story" data-beats={shown.map((b) => b.kind).join(",")}>
      <StoryStrip id={id} title={title} tone={tone} holdMs={6000}
        panels={shown.map((b) => ({ art: <BeatPanelArt b={b} accent={accent} />, kicker: BEAT_KICKER[b.kind] ?? b.kind, caption: b.text }))} />
      <p className="text-[10.5px] text-white/40" data-testid="story-label">{c.story.label}</p>
    </div>
  );
}

function prepLine(c: CampaignSnapshot, a: Record<string, unknown>): string {
  const k = String(a.activity);
  if (k === "champion_practice") return `practice ${pname(c, a.player_id as string)} on ${champName(String(a.champion))}`;
  if (k === "vod_review") return `VOD review (${String(a.focus_stage)})`;
  return k === "scrim" ? "scrims" : k;
}

/** Settled series, newest first: result, score, standout, decisions and Baron grades as recorded. */
export function HistoryList({ c, limit }: { c: CampaignSnapshot; limit?: number }) {
  const rows = [...c.history].reverse().slice(0, limit ?? c.history.length);
  if (!rows.length) return null;
  return (
    <Plate className="flex flex-col gap-2 p-3" testId="campaign-history">
      <Eyebrow>Run history</Eyebrow>
      <ol className="flex flex-col gap-1.5">
        {rows.map((h) => <HistoryRow key={h.series_index} c={c} h={h} />)}
      </ol>
    </Plate>
  );
}

function HistoryRow({ c, h }: { c: CampaignSnapshot; h: HistoryEntry }) {
  const barons = h.games.flatMap((g) => g.objectives);
  const plan = h.decisions.preparation?.activities ?? [];
  return (
    <li className="flex flex-col gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12px]" data-testid="history-row" data-series={h.series_index} data-result={h.result}>
      <span className="flex flex-wrap items-center gap-2">
        <span className="dyn-title font-semibold text-white">{h.round_title}</span>
        <span className="text-white/60">vs {oppShort(h.opponent.name)}</span>
        <span className={cn("ml-auto rounded-full border px-1.5 text-[10px] font-bold uppercase", h.result === "won" ? "border-emerald-300/40 text-emerald-200" : "border-rose-400/40 text-rose-200")}>{h.result}</span>
        <b className="dyn-num text-white">{h.score.you}–{h.score.opponent}</b>
      </span>
      {h.standout ? <span className="text-white/65">Standout: {h.standout.name.replace(/^SYN\s+/, "")} ({ROLE_TITLE[h.standout.role]}) won {h.standout.contests_won} of {h.standout.contests_played} contests</span> : null}
      <span className="text-white/50">Plan: {plan.length ? plan.map((a) => prepLine(c, a)).join(", ") : "all idle"}{h.decisions.preparation?.idle_days ? ` · ${h.decisions.preparation.idle_days} idle` : ""}{h.decisions.tactics.length ? ` · backstage: ${h.decisions.tactics.map((t) => t.choice.replace("_", " ")).join(", ")}` : ""}</span>
      {barons.length ? <span className="text-violet-200/85">Baron {barons.map((b) => `${b.correct_count}/3`).join(", ")}</span> : null}
    </li>
  );
}

/** What the settlement decided and exactly what carried into the next checkpoint (`last_transition`). */
export function TransitionPanel({ c, t }: { c: CampaignSnapshot; t: Transition }) {
  const car = t.carried;
  return (
    <div className="flex flex-col gap-3" data-testid="transition" data-from={t.from_series} data-result={t.result} data-decided={t.decided.kind}>
      <Plate ornate className="flex flex-col gap-1.5 p-3" testId="transition-decided">
        <Eyebrow>{t.decided.kind === "ending" ? "The run is decided" : "The campaign moves on"}</Eyebrow>
        {t.decided.kind === "next_round" ? (
          <p className="text-[13px] text-white/80">Next: <b className="text-white">{c.map.find((n) => n.round === (t.decided as { round: string }).round)?.title ?? t.decided.round}</b>
            {t.decided.byes.length ? <span className="text-sky-100/90" data-testid="transition-bye"> · bye: {t.decided.byes.map((r) => c.map.find((n) => n.round === r)?.title ?? r).join(", ")} skipped</span> : null}</p>
        ) : <p className="text-[13px] text-white/80">{t.decided.ending.text}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1">{(Object.keys(t.standing) as CampaignStage[]).filter((s) => t.standing[s]?.played).map((s) => <span key={s} className="text-[11.5px] text-white/60">{stageTitle(s)} <StandingLine c={{ ...c, standing: t.standing }} stage={s} /></span>)}</div>
      </Plate>
      {car ? (
        <Plate className="flex flex-col gap-2 p-3" testId="carried">
          <div className="flex flex-wrap items-center gap-2"><Eyebrow>Carried into series {car.series_index}</Eyebrow><SimTag>Server carry</SimTag></div>
          <p className="text-[12px] text-sky-100/80" data-testid="carried-break">{car.break.reason}: fatigue −{car.break.recovery}{car.break.bye ? " (after the bye)" : ""}. Cohesion {car.cohesion.toFixed(2)} carries unchanged. {car.prep_slots} preparation day{car.prep_slots === 1 ? "" : "s"} ahead.</p>
          <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2" data-testid="carried-fatigue">
            {car.fatigue.filter((f) => f.at_series_end || f.after_break).map((f) => (
              <li key={f.player_id} className="flex items-baseline gap-2 text-[12px]" data-player={f.player_id}>
                <span className="min-w-0 flex-1 truncate text-white/80">{pname(c, f.player_id)}</span>
                <span className="dyn-num text-white/60">fatigue {f.at_series_end}</span><span aria-hidden className="text-white/40">→</span><b className="dyn-num text-white">{f.after_break}</b>
              </li>
            ))}
          </ul>
          {car.practiced.length ? <p className="text-[12px] text-emerald-100/85" data-testid="carried-practiced">Permanent practice: {car.practiced.map((p) => `${pname(c, p.player_id)} on ${champName(p.champion)} ${p.value.toFixed(2)}`).join(" · ")}</p> : null}
          {car.traits.length ? <p className="text-[12px] text-white/75" data-testid="carried-traits">Form: {car.traits.map((x) => `${pname(c, x.player_id)} ${x.trait.replace("_", " ")} ${signed(x.value)} (${x.games_remaining} game${x.games_remaining === 1 ? "" : "s"} left)`).join(" · ")}</p> : null}
          {car.conditions.length ? <p className="text-[12px] text-white/75" data-testid="carried-conditions">Conditions: {car.conditions.map((x) => `${x.kind} ${signed(x.value, 0)} (${x.games_remaining}g)`).join(" · ")}</p> : null}
          {car.expired_at_settlement.length ? <p className="text-[11.5px] text-white/50">Ended at the settlement: {car.expired_at_settlement.join("; ")}.</p> : null}
        </Plate>
      ) : null}
    </div>
  );
}

/** The legacy recap: the ending and everything the run recorded. */
export function LegacyRecap({ c, e }: { c: CampaignSnapshot; e: Ending }) {
  const o = c.story.objectives;
  const practiced = c.story.champion_choices.filter((x) => x.practiced && x.since_practice);
  return (
    <div className="flex flex-col gap-3" data-testid="legacy">
      <Plate ornate className="flex flex-col gap-2 p-3" testId="legacy-record">
        <Eyebrow>Legacy</Eyebrow>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {(["regular", "playoffs", "worlds"] as CampaignStage[]).map((s) => e.record[s] ? <span key={s} className="text-[12.5px] text-white/75">{stageTitle(s)} <b className="dyn-num text-white">{e.record[s]!.wins}–{e.record[s]!.losses}</b></span> : null)}
          <span className="text-[12.5px] text-white/75">Series played <b className="dyn-num text-white">{e.series_played}</b></span>
          {o ? <span className="text-[12.5px] text-violet-200/90" data-testid="legacy-baron">Baron: {o.correct} of {o.questions} answers, {o.perfect} perfect</span> : null}
        </div>
        {practiced.length ? <ul className="flex flex-col gap-0.5" data-testid="legacy-practice">{practiced.slice(0, 5).map((x) => <li key={`${x.player_id}|${x.champion}`} className="text-[12px] text-emerald-100/85">{x.name.replace(/^SYN\s+/, "")} on {x.champion_name.replace(/^SYN\s+/, "")}: {x.since_practice!.wins} of {x.since_practice!.games} won since practising it</li>)}</ul> : null}
        {c.story.standouts.length ? <p className="text-[12px] text-white/65" data-testid="legacy-standouts">Standouts: {c.story.standouts.map((s) => `series ${s.series_index} ${s.name.replace(/^SYN\s+/, "")} (${s.contests_won}/${s.contests_played})`).join(" · ")}</p> : null}
      </Plate>
      <HistoryList c={c} />
    </div>
  );
}

/** Two-step, inline (never a modal): the run ends for good, so it asks once. */
export function AbandonControl({ busy, onAbandon }: { busy: boolean; onAbandon: () => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" data-testid="abandon-open" onClick={() => setAsk(true)} className="min-h-[36px] text-[11.5px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline">Abandon this run…</button>;
  return (
    <div role="group" aria-label="Abandon the run" className={cn(PLATE, "flex flex-wrap items-center gap-2 border-rose-400/40 px-3 py-2")} data-testid="abandon-confirm">
      <span className="min-w-0 flex-1 text-[12px] text-white/80">This ends the run for good. Its history is kept; the open series can no longer be played.</span>
      <Btn testId="abandon-keep" className="min-h-[36px] px-3 py-1 text-xs" onClick={() => setAsk(false)}>Keep playing</Btn>
      <Btn testId="abandon-yes" disabled={busy} className="min-h-[36px] border-rose-400/50 px-3 py-1 text-xs text-rose-100" onClick={onAbandon}>Abandon run</Btn>
    </div>
  );
}
