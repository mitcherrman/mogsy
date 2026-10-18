/**
 * UX-1 — the non-game screens of the synthetic Dynasty flow: home, org, stars,
 * roster, season hub, recruitment, preparation, scouting, draft, results.
 * Presentational: all state lives in `DynastyV2Prototype.tsx`.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  applyPrep, availableChamps, readComposition, recruitOffers, previewSigning, revealedOppLanes, TACTICS,
  type Game, type GameSummary, type PrepPick, type Run,
} from "./engine";
import {
  CHAMP_BY_ID, CHAMPS_BY_ROLE, ORGS, PREP_ACTIONS, ROLES, ROLE_LABEL, SEASON, STAGE_LABEL, TAG_LABEL, TAGS,
  type Org, type Player, type Role,
} from "./fixtures";
import { EventCard } from "./GameView";
import {
  Btn, ConfidenceDiamonds, Delta, Eyebrow, Pips, PlayerRow, ProtoBanner, RolePill, Screen, SourceChip, StateLabel, SURFACE,
} from "./parts";

// ───────────────────────────────────────────────────────────── home

export function HomeScreen({ run, seed, onSeed, onNew, onResume }: { run: Run | null; seed: string; onSeed: (s: string) => void; onNew: () => void; onResume: () => void }) {
  return (
    <Screen testId="screen-home" eyebrow="Worlds Dynasty" title="Build a roster. Take it to Worlds.">
      <ProtoBanner />
      {run ? (
        <div className={cn(SURFACE, "flex flex-col gap-2 p-4")} data-testid="resume-card">
          <Eyebrow>Resume run</Eyebrow>
          <p className="text-lg font-semibold text-white">{run.org.name}</p>
          <p className="text-sm text-white/65">{run.finished ? "Run finished" : `Next: ${SEASON[Math.min(run.nodeIdx, SEASON.length - 1)].label}`} · Cohesion <Pips n={run.cohesion} max={5} label="Cohesion" /></p>
          <div><Btn primary testId="home-resume" onClick={onResume}>Continue</Btn></div>
        </div>
      ) : null}
      <div className={cn(SURFACE, "flex flex-col gap-3 p-4")}>
        <p className="text-sm text-white/75">A short esports roguelike: sign players, prepare, draft, and play best-of-five series across eight steps. Every run varies with its seed.</p>
        <label className="flex flex-col gap-1 text-xs text-white/60">Run seed (same seed and same choices replay identically)
          <input data-testid="seed-input" value={seed} onChange={(e) => onSeed(e.target.value)} className="min-h-[44px] rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white" />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Btn primary testId="home-new" onClick={onNew}>New run</Btn>
          <Btn testId="home-legacy" disabled>Legacy shelf (later)</Btn>
        </div>
        <p className="text-[11px] text-white/45">Version pin: <code>syn.ux1</code> · prototype rules, synthetic catalog, event fixtures.</p>
      </div>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── org

export function OrgScreen({ onChoose }: { onChoose: (o: Org) => void }) {
  return (
    <Screen testId="screen-org" eyebrow="New run · 1 of 2" title="Choose your organization">
      <div className="grid gap-3 sm:grid-cols-3">
        {ORGS.map((o) => (
          <div key={o.id} className={cn(SURFACE, "flex flex-col gap-2 p-4")} data-testid={`org-${o.id}`}>
            <p className="text-lg font-semibold text-white">{o.name}</p>
            <p className="text-[11px] uppercase tracking-wider text-white/45">{o.region}</p>
            <p className="text-sm text-white/80">{o.trait}</p>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {o.strengths.map((s) => <span key={s} className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">▲ {s}</span>)}
              <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-rose-200">▼ {o.weakness}</span>
            </div>
            <p className="text-[12px] text-white/55">Star candidates: {o.starCandidates.map((p) => `${p.name.replace("SYN-", "")} (${ROLE_LABEL[p.role]})`).join(", ")}</p>
            <SourceChip kind="rules" />
            <Btn primary testId={`org-choose-${o.id}`} className="mt-auto" onClick={() => onChoose(o)}>Choose {o.name.replace("SYN ", "")}</Btn>
          </div>
        ))}
      </div>
    </Screen>
  );
}

export function StarsScreen({ org, selected, onToggle, onConfirm }: { org: Org; selected: string[]; onToggle: (id: string) => void; onConfirm: () => void }) {
  return (
    <Screen testId="screen-stars" eyebrow="New run · 2 of 2" title="Pick your two stars"
      actions={<Btn primary testId="stars-confirm" disabled={selected.length !== 2} onClick={onConfirm}>Build the roster ({selected.length}/2)</Btn>}>
      <p className="text-sm text-white/70">The other three starting roles are filled by academy stand-ins. You will recruit more as the season goes.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {org.starCandidates.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button key={p.id} type="button" data-testid={`star-${p.id}`} aria-pressed={on} onClick={() => onToggle(p.id)} className={cn("rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]", on && "ring-2 ring-[#e3c66f]")}>
              <PlayerRow p={p} compact>
                <p className="text-[11px] text-white/55">{on ? "Selected" : "Tap to select"} · pool of {p.prof.filter(Boolean).length} comfortable champions</p>
              </PlayerRow>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── roster

export function RosterList({ run }: { run: Run }) {
  return (
    <div className="flex flex-col gap-2" data-testid="roster-list">
      {ROLES.map((r) => <PlayerRow key={r} p={run.starters[r]} testId={`roster-${r}`} />)}
      <Eyebrow tone="muted">Bench ({run.bench.length}/2)</Eyebrow>
      {[0, 1].map((i) => run.bench[i] ? <PlayerRow key={i} p={run.bench[i]} compact /> : <div key={i} className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-sm text-white/40">Open bench slot</div>)}
      <p className="text-[12px] text-white/55">Team cohesion <Pips n={run.cohesion} max={5} label="Cohesion" /></p>
    </div>
  );
}

export function RosterScreen({ run, onNext }: { run: Run; onNext: () => void }) {
  return (
    <Screen testId="screen-roster" eyebrow={run.org.name} title="Your starting roster" actions={<Btn primary testId="roster-continue" onClick={onNext}>Enter the season</Btn>}>
      <p className="text-sm text-white/70">Two stars, three academy stand-ins, and an open bench. Early / Mid / Late bars show each player's phase strength (synthetic).</p>
      <RosterList run={run} />
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── season hub

export function SeasonScreen({ run, onBegin }: { run: Run; onBegin: () => void }) {
  const cur = run.nodeIdx;
  return (
    <Screen testId="screen-season" eyebrow={run.org.name} title="The season" actions={run.finished ? null : <Btn primary testId="season-begin" onClick={onBegin}>Begin {SEASON[cur].label}</Btn>}>
      <p className="text-sm text-white/70">Eight illustrative series, all best-of-five. Regular-season losses cost you condition; playoff and Worlds losses end the run. (Counts and rules are open decisions.)</p>
      <ol className="grid gap-2 sm:grid-cols-2" aria-label="Season path">
        {SEASON.map((n, i) => {
          const res = run.results[i];
          const state = res ? "done" : i === cur && !run.finished ? "current" : "upcoming";
          return (
            <li key={n.label} data-testid={`node-${i}`} data-state={state} aria-current={state === "current" ? "step" : undefined}
              className={cn("flex flex-col gap-1 rounded-xl border p-3", state === "current" ? "border-[#e3c66f]/60 bg-[#e3c66f]/[0.08]" : "border-white/10 bg-white/[0.03]", state === "upcoming" && "opacity-70")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{n.label}</span>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/50">{n.kind === "regular" ? "Season" : n.kind === "playoff" ? "Playoffs · elimination" : "Worlds · elimination"}</span>
              </div>
              <span className="text-[13px] text-white/70">vs {n.opp.name}</span>
              <span className="text-[11px] text-white/50">{res ? (res === "W" ? "Won the series" : "Lost the series") : n.window ? "Transfer window before this series" : "Preparation before this series"}</span>
              <span className="sr-only">{state}</span>
            </li>
          );
        })}
      </ol>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── recruit

export function RecruitScreen({ run, picked, onPick, onSign, onSkip }: { run: Run; picked: string | null; onPick: (id: string) => void; onSign: (p: Player) => void; onSkip: () => void }) {
  const offers = useMemo(() => recruitOffers(run), [run]);
  const sel = offers.find((o) => o.id === picked) ?? null;
  const prev = sel ? previewSigning(run, sel) : null;
  return (
    <Screen testId="screen-recruit" eyebrow="Transfer window" title="Recruit a player"
      actions={<><Btn testId="recruit-skip" onClick={onSkip}>Skip the window</Btn><Btn primary testId="recruit-sign" disabled={!sel} onClick={() => sel && onSign(sel)}>{sel ? `Sign ${sel.name.replace("SYN-", "")}` : "Pick an offer"}</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        {offers.map((o) => (
          <button key={o.id} type="button" data-testid={`offer-${o.id}`} aria-pressed={picked === o.id} onClick={() => onPick(o.id)}
            className={cn("rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]", picked === o.id && "ring-2 ring-[#e3c66f]")}>
            <PlayerRow p={o} compact><p className="text-[11px] text-white/55">{o.note}</p></PlayerRow>
          </button>
        ))}
      </div>
      {prev ? (
        <div className={cn(SURFACE, "flex flex-col gap-1.5 p-3 text-sm")} data-testid="sign-preview">
          <Eyebrow>Swap preview</Eyebrow>
          <p className="text-white/85">{prev.incoming.name} replaces {prev.displaced.name} in {ROLE_LABEL[prev.incoming.role]}. {prev.displaced.name} {prev.displacedGoesTo === "bench" ? "moves to the bench." : "is released (bench is full)."}</p>
          <p className="text-white/70">Cohesion <Pips n={prev.cohesionBefore} max={5} label="Cohesion before" /> → <Pips n={prev.cohesionAfter} max={5} label="Cohesion after" /> (new pairings need time). Honeymoon: Confidence +1.</p>
          <SourceChip kind="rules" />
        </div>
      ) : null}
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── prep

export function PrepScreen({ run, picks, onToggle, onTarget, onConfirm }: {
  run: Run; picks: PrepPick[]; onToggle: (id: string) => void; onTarget: (id: string, playerId: string) => void; onConfirm: () => void;
}) {
  const full = picks.length >= 2;
  const needsTarget = picks.some((p) => PREP_ACTIONS.find((a) => a.id === p.id)?.target === "player" && !p.playerId);
  const preview = useMemo(() => applyPrep(run, picks.filter((p) => !(PREP_ACTIONS.find((a) => a.id === p.id)?.target === "player" && !p.playerId))), [run, picks]);
  return (
    <Screen testId="screen-prep" eyebrow={`Before ${SEASON[run.nodeIdx].label}`} title={`Preparation · ${2 - picks.length} action${2 - picks.length === 1 ? "" : "s"} left`}
      actions={<Btn primary testId="prep-confirm" disabled={needsTarget} onClick={onConfirm}>{picks.length ? "Run preparation" : "Skip preparation"}</Btn>}>
      <div className="grid gap-2 sm:grid-cols-2">
        {PREP_ACTIONS.map((a) => {
          const sel = picks.find((p) => p.id === a.id);
          return (
            <div key={a.id} className={cn("flex flex-col gap-1.5 rounded-xl border p-3", sel ? "border-[#e3c66f]/60 bg-[#e3c66f]/[0.08]" : "border-white/10 bg-white/[0.03]")} data-testid={`prep-${a.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{a.name}</span>
                {a.knowledge ? <span className="rounded-full border border-sky-400/35 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-200">Knowledge</span> : null}
              </div>
              <p className="text-[12px] text-white/65">{a.blurb}</p>
              <p className="text-[11px] text-white/50">{a.helps.length ? `Helps ${a.helps.map((h) => STAGE_LABEL[h]).join(" / ")}` : "Condition / cohesion"} · {a.cost}</p>
              {a.knowledge ? <p className="text-[11px] text-white/40">In the real product this opens a hosted Mogzy activity; here it resolves instantly.</p> : null}
              {sel && a.target === "player" ? (
                <label className="flex flex-col gap-1 text-[11px] text-white/60">Who?
                  <select data-testid={`prep-target-${a.id}`} value={sel.playerId ?? ""} onChange={(e) => onTarget(a.id, e.target.value)} className="min-h-[44px] rounded-lg border border-white/15 bg-[#0b1727] px-2 text-sm text-white">
                    <option value="">Choose a player</option>
                    {ROLES.map((r) => <option key={r} value={run.starters[r].id}>{run.starters[r].name} ({ROLE_LABEL[r]})</option>)}
                  </select>
                </label>
              ) : null}
              <Btn testId={`prep-toggle-${a.id}`} ariaLabel={`${sel ? "Remove" : "Choose"} ${a.name}`} disabled={!sel && full} onClick={() => onToggle(a.id)} className="mt-auto min-h-[40px]">{sel ? "Remove" : "Choose"}</Btn>
            </div>
          );
        })}
      </div>
      <div className={cn(SURFACE, "flex flex-col gap-2 p-3")} data-testid="condition-preview">
        <Eyebrow>Condition preview</Eyebrow>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {preview.changes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12.5px] text-white/80">
              <span className="truncate">{c.name}</span>
              <span className="flex items-center gap-2">Conf <Delta v={c.confDelta} /> Fatigue <Delta v={c.fatigueDelta} invert /> {c.phaseNote ? <span className="text-white/50">{c.phaseNote}</span> : null}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-white/65">Cohesion <Delta v={preview.cohesionDelta} /> · Scouting tier <Delta v={preview.scoutDelta} /> · {preview.notes.join(" ") || "No diminishing returns yet."}</p>
      </div>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── scout

export function ScoutScreen({ run, onNext }: { run: Run; onNext: () => void }) {
  const node = SEASON[run.nodeIdx];
  const tier = run.series!.scoutTier;
  const lanes = revealedOppLanes(tier);
  return (
    <Screen testId="screen-scout" eyebrow={node.label} title={`Scouting: ${node.opp.name}`} actions={<Btn primary testId="scout-continue" onClick={onNext}>To the draft</Btn>}>
      <div className={cn(SURFACE, "flex flex-col gap-3 p-4")}>
        <p className="text-[12px] text-white/60" data-testid="scout-tier">Scouting tier {tier} of 3 <Pips n={tier} max={3} label="Scouting tier" tone="blue" /> · their draft is already committed; scouting only reveals it.</p>
        <div><Eyebrow tone="muted">Identity (tier 1)</Eyebrow><div className="mt-1 flex flex-wrap gap-1.5">{node.opp.tags.map((t) => <span key={t} className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-white/85">{t}</span>)}</div></div>
        <div><Eyebrow tone="muted">Weakness (tier 2)</Eyebrow><p className="mt-1 text-sm text-white/85" data-testid="scout-warning">{tier >= 2 ? node.opp.warning : "Locked: needs one more scouting tier (VOD Review)."}</p></div>
        <div><Eyebrow tone="muted">Likely first-game picks (tier 2+ reveals two lanes per tier)</Eyebrow>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">{ROLES.map((r) => <li key={r} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm"><RolePill role={r} /><span data-testid={`scout-pick-${r}`} className={lanes.includes(r) ? "text-white" : "text-white/30"}>{lanes.includes(r) ? CHAMP_BY_ID[CHAMPS_BY_ROLE[r][(node.opp.offset + run.series!.games.length + ROLES.indexOf(r)) % 5].id].name : "Hidden"}</span></li>)}</ul></div>
      </div>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── draft

export function DraftScreen({ run, picks, onPick, onLock }: { run: Run; picks: Partial<Record<Role, string>>; onPick: (r: Role, id: string) => void; onLock: () => void }) {
  const node = SEASON[run.nodeIdx];
  const s = run.series!;
  const chosen = ROLES.map((r) => picks[r]).filter(Boolean) as string[];
  const ro = readComposition(chosen, node.opp.tags);
  const lanes = revealedOppLanes(s.scoutTier);
  return (
    <Screen testId="screen-draft" eyebrow={`Game ${s.games.length + 1} of up to 5 · Fearless`} title="Draft your champions"
      actions={<Btn primary testId="draft-lock" disabled={chosen.length < 5} onClick={onLock}>{chosen.length < 5 ? `Pick ${5 - chosen.length} more` : "Lock draft and play"}</Btn>}>
      <div className={cn(SURFACE, "flex flex-col gap-1 p-3 text-[12px] text-white/65")} data-testid="fearless-strip">
        <Eyebrow tone="muted">Fearless: used earlier this series</Eyebrow>
        <p>{s.used.length ? s.used.join(", ") : "Nothing used yet."}</p>
        {lanes.length ? <p className="text-white/50">Scouted: they are expected to play {lanes.map((r) => `${ROLE_LABEL[r]} ${CHAMPS_BY_ROLE[r][(node.opp.offset + s.games.length + ROLES.indexOf(r)) % 5].name}`).join(", ")}.</p> : null}
      </div>
      <div className="flex flex-col gap-3">
        {ROLES.map((r) => {
          const p = run.starters[r];
          const pool = CHAMPS_BY_ROLE[r];
          const avail = new Set(availableChamps(run, r).map((c) => c.id));
          return (
            <fieldset key={r} data-testid={`draft-row-${r}`} className={cn(SURFACE, "flex flex-col gap-2 p-3")}>
              <legend className="sr-only">{ROLE_LABEL[r]} pick for {p.name}</legend>
              <div className="flex items-center justify-between gap-2"><RolePill role={r} /><span className="truncate text-sm text-white">{p.name}</span></div>
              <div className="flex flex-wrap gap-2">
                {pool.map((c, ci) => {
                  const ok = avail.has(c.id);
                  const prof = p.prof[ci] ?? 0;
                  return (
                    <label key={c.id} className={cn("relative", !ok && "opacity-40")}>
                      <input type="radio" name={`pick-${r}`} className="peer sr-only" disabled={!ok} checked={picks[r] === c.id} onChange={() => onPick(r, c.id)} data-testid={`pick-${r}-${c.id}`} />
                      <span className="flex min-h-[44px] min-w-[118px] cursor-pointer flex-col justify-center rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-white/85 peer-checked:border-[#e3c66f] peer-checked:bg-[#e3c66f]/12 peer-focus-visible:ring-2 peer-focus-visible:ring-[#e3c66f] peer-disabled:cursor-not-allowed">
                        <span className="font-semibold">{c.name}{!ok ? " (used)" : ""}</span>
                        <span className="text-white/55">{c.cls} · {prof === 2 ? "Great" : prof === 1 ? "Fine" : "Off-pool"}</span>
                        <span className="text-white/45">E{c.phase.early} M{c.phase.mid} L{c.phase.late}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className={cn(SURFACE, "flex flex-col gap-2 p-3")} data-testid="comp-readout">
        <div className="flex flex-wrap items-center justify-between gap-2"><Eyebrow>Composition</Eyebrow><span className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-white/85" data-testid="comp-identity">{ro.identity}</span></div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
          {TAGS.map((t) => <li key={t} className="flex items-center justify-between gap-2 text-white/75"><span>{TAG_LABEL[t]}</span><Pips n={ro.tagLevels[t]} max={2} label={TAG_LABEL[t]} /></li>)}
        </ul>
        {ro.strengths.map((x, i) => <p key={i} className="text-[13px] text-emerald-200" data-testid="comp-strength">✔ {x.text} <span className="text-white/45">({STAGE_LABEL[x.stage]})</span></p>)}
        {ro.warnings.map((x, i) => <p key={i} className="text-[13px] text-amber-200" data-testid="comp-warning">⚠ {x.text}{x.stage ? <span className="text-white/45"> ({STAGE_LABEL[x.stage]})</span> : null}</p>)}
        {chosen.length < 3 ? <p className="text-[12px] text-white/45">Pick three or more champions for a read-out.</p> : null}
        <SourceChip kind="rules" />
      </div>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── results

export function BoPips({ wins, losses }: { wins: number; losses: number }) {
  return <span className="inline-flex items-center gap-2 text-sm text-white/80" data-testid="bo-pips">You <Pips n={wins} max={3} label="Your wins" /> <b className="text-white">{wins}–{losses}</b> <Pips n={losses} max={3} label="Their wins" tone="red" /> Them{wins === 2 && losses < 2 ? <span className="rounded-full bg-[#e3c66f] px-2 py-0.5 text-[10px] font-bold uppercase text-[#1a1406]">Match point</span> : losses === 2 && wins < 2 ? <span className="rounded-full bg-rose-400/80 px-2 py-0.5 text-[10px] font-bold uppercase text-black">They have match point</span> : null}</span>;
}

export function GameResultScreen({ run, game, summary, onNext }: { run: Run; game: Game; summary: GameSummary; onNext: () => void }) {
  const s = run.series!;
  return (
    <Screen testId="screen-result" eyebrow={`Game ${game.idx} · ${SEASON[run.nodeIdx].label}`} title={summary.won ? "Game won" : "Game lost"}
      actions={<Btn primary testId="result-continue" onClick={onNext}>{summary.seriesOver ? "Series result" : "Between-game decision"}</Btn>}>
      <div className={cn(SURFACE, "flex flex-col gap-2 p-3")} data-testid="game-timeline" data-won={summary.won} data-ended={summary.endedAt}>
        <div className="flex flex-wrap items-center gap-2">{game.stages.map((st) => <span key={st.stage} className="flex items-center gap-1.5 text-[12px] text-white/70"><b className="text-white">{STAGE_LABEL[st.stage]}</b> {st.ours}–{st.theirs} <StateLabel label={st.label} /></span>)}</div>
        <p className="text-sm text-white/80" data-testid="game-reason">{summary.reason}.{summary.endedAt === "mid" ? " No Late stage was played." : ""}</p>
        <BoPips wins={s.wins} losses={s.losses} />
      </div>
      <div className={cn(SURFACE, "flex flex-col gap-1.5 p-3")} data-testid="deltas">
        <Eyebrow>Player condition · before → after</Eyebrow>
        <ul className="flex flex-col gap-1.5">
          {summary.deltas.map((d) => (
            <li key={d.id} data-testid={`delta-${d.role}`} className="flex flex-col gap-1 rounded-lg border border-white/10 px-3 py-2 text-[13px] text-white/85 sm:flex-row sm:items-center sm:justify-between">
              <span className="truncate font-medium">{d.name} <span className="text-white/45">({ROLE_LABEL[d.role]})</span></span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">Conf <ConfidenceDiamonds n={d.confBefore} /> → <ConfidenceDiamonds n={d.confAfter} /> <Delta v={d.confAfter - d.confBefore} /></span>
                <span className="inline-flex items-center gap-1">Fatigue {d.fatBefore} → {d.fatAfter} <Delta v={d.fatAfter - d.fatBefore} invert /></span>
                {d.traitAdded ? <span className="rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#e3c66f]">New: {d.traitAdded} next game</span> : null}
                {d.traitRemoved ? <span className="text-[11px] text-white/50">{d.traitRemoved} cleared</span> : null}
              </span>
              <span className="text-[11px] text-white/45">{d.causes.join(", ")}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-white/70">Team cohesion <Pips n={summary.cohesionBefore} max={5} label="Cohesion before" /> → <Pips n={summary.cohesionAfter} max={5} label="Cohesion after" /> <Delta v={summary.cohesionAfter - summary.cohesionBefore} /></p>
      </div>
      <details className={cn(SURFACE, "p-3")} data-testid="ledger">
        <summary className="cursor-pointer text-sm font-semibold text-white">Event ledger ({game.ledger.length})</summary>
        <div className="mt-2 flex flex-col gap-2">{game.ledger.map((l, i) => <div key={i}><p className="mb-1 text-[10.5px] uppercase tracking-wider text-white/40">{STAGE_LABEL[l.stage]}</p><EventCard item={l} /></div>)}</div>
      </details>
    </Screen>
  );
}

export function TacticScreen({ run, onChoose }: { run: Run; onChoose: (id: string | null) => void }) {
  const s = run.series!;
  return (
    <Screen testId="screen-tactic" eyebrow={`Between games · ${s.wins}–${s.losses}`} title="One adjustment before the next game"
      actions={<Btn testId="tactic-skip" onClick={() => onChoose(null)}>No change</Btn>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {TACTICS.map((t) => (
          <div key={t.id} className={cn(SURFACE, "flex flex-col gap-2 p-3")} data-testid={`tactic-${t.id}`}>
            <p className="text-sm font-semibold text-white">{t.name}</p>
            <p className="text-[12.5px] text-white/65">{t.blurb}</p>
            <div className="flex flex-wrap gap-1.5">{t.chips.map((c) => <span key={c} className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-white/80">{c}</span>)}</div>
            <Btn primary className="mt-auto" testId={`tactic-pick-${t.id}`} onClick={() => onChoose(t.id)}>Choose</Btn>
          </div>
        ))}
      </div>
    </Screen>
  );
}

export function SeriesScreen({ run, onNext }: { run: Run; onNext: () => void }) {
  const s = run.series!;
  const won = s.wins >= 3;
  const node = SEASON[run.nodeIdx];
  const elim = !won && node.kind !== "regular";
  return (
    <Screen testId="screen-series" eyebrow={node.label} title={won ? `Series won ${s.wins}–${s.losses}` : `Series lost ${s.wins}–${s.losses}`}
      actions={<Btn primary testId="series-continue" onClick={onNext}>{elim ? "See your run" : "Back to the season"}</Btn>}>
      <div className={cn(SURFACE, "flex flex-col gap-2 p-4")}>
        <BoPips wins={s.wins} losses={s.losses} />
        <ul className="text-sm text-white/75">{s.games.map((g) => <li key={g.idx}>Game {g.idx}: {g.won ? "Won" : "Lost"} · {g.endedAt === "mid" ? "closed at Mid" : "decided in Late"}</li>)}</ul>
        <p className="text-sm text-white/70">{elim ? "This was an elimination series. The run ends here." : won ? "Your condition carries forward. Players recover a little between series." : "A regular-season loss costs momentum, not the run."}</p>
      </div>
    </Screen>
  );
}

export function EndScreen({ run, onHome }: { run: Run; onHome: () => void }) {
  const wins = run.results.filter((r) => r === "W").length;
  const champion = run.alive && run.results[SEASON.length - 1] === "W";
  return (
    <Screen testId="screen-end" eyebrow="Run complete" title={champion ? "Worlds champions (synthetic)" : "Run over"} actions={<Btn primary testId="end-home" onClick={onHome}>Back to Dynasty home</Btn>}>
      <div className={cn(SURFACE, "flex flex-col gap-3 border-[#e3c66f]/30 p-4")} data-testid="legacy-card">
        <Eyebrow>Legacy card · synthetic</Eyebrow>
        <p className="text-xl font-semibold text-white">{run.org.name}</p>
        <p className="text-sm text-white/75">{wins} of {SEASON.length} series won · cohesion <Pips n={run.cohesion} max={5} label="Cohesion" /></p>
        <ul className="grid gap-1.5 sm:grid-cols-2">{ROLES.map((r) => <li key={r} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[13px] text-white/85">{ROLE_LABEL[r]}: {run.starters[r].name}{run.starters[r].traits.length ? ` · ${run.starters[r].traits.join(", ")}` : ""}</li>)}</ul>
        <p className="text-[11px] text-white/45">Invented players and results. Only stored facts appear on a real legacy card.</p>
      </div>
    </Screen>
  );
}
