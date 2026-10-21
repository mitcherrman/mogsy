/**
 * UX-3 — one game of the BO5, rendered from E1 snapshots.
 *
 * The VIS-F4 game stage (tunnel walkout → stadium, LED ribbon, stage strip,
 * advantage meter, event cards, seven-point tiles, closeout hero, casters,
 * crowd) is kept, but its state machine is the server's: the screen shows
 * `env.game` and its newest beat, and every control is one request:
 *
 *   Continue   → advance one transition at a time until the next pause beat
 *   Skip ahead → advance until the next tally / objective / settlement
 *
 * Tile reveal timers and the walkout are presentation only: the controls stay
 * live while they play, and nothing is inferred from them.
 *
 * UX-6: on an E3A series each published stage also lists its management-driven
 * contest components (`modifier:e3a.*`, plus the engine's `proficiency` and
 * `team:cohesion` terms), linked to the server's `management.combat_inputs`,
 * and the "Why" sheet groups them under "Management". Values are verbatim.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Info } from "lucide-react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { E1Contest, E1Event, E1Snapshot, E1StageTally, SeriesEnvelope } from "@/lib/dynasty/e1/contracts";
import { PAUSE_BEATS, SKIP_BEATS, type DynastySeries } from "@/lib/dynasty/e1/useDynastySeries";
import { playMoment } from "../audio";
import { CasterPop, CrowdMeter, ReactionPop, SimTag, ambientNewGame, crowdLevel, useStinger } from "../broadcast";
import { CLASS_COLOR, ClassGlyph } from "../cards";
import { CineFrame } from "../cinematics";
import type { EnvState } from "../environments";
import { CloseoutBanner } from "../GameView";
import type { Role } from "../fixtures";
import { Btn, Eyebrow, LABEL_TONE, LeadMeter, PLATE, Pips, RANKED_ROLE, SevenPips, SourceChip, StateLabel, useCountUp } from "../parts";
import { Scene, type StadiumVariant } from "../scenes";
import { WalkoutSequence } from "../walkout";
import { ServerEffectChip, ServerObjective } from "./ServerObjective";
import { ManagementInfluence } from "./Management";
import { componentTitle, splitComponents, starterNames } from "./managementView";
import { ROLE_ORDER, STAGE_NAME, carryNow, champClass, champNames, lastBeat, lineupById, matchPoint, meterLead, settleReason, shortName } from "./present";

export type ServerGameMood = "early" | "mid" | "late" | "baron" | "victory" | "defeat";

function orderContests(t: E1StageTally): { lanes: E1Contest[]; team: E1Contest | undefined } {
  const lanes = ROLE_ORDER.map((r) => t.contests.find((c) => c.kind === "positional" && c.role === r)).filter(Boolean) as E1Contest[];
  return { lanes, team: t.contests.find((c) => c.kind === "team") };
}

/** Your window and the draw, in your frame. A display transform of the server's own roll; `winner` decides. */
function yourDraw(c: E1Contest) { return { p: c.p_you, x: c.roll_for === "you" ? c.roll : 1 - c.roll }; }

function RollStrip({ c }: { c: E1Contest }) {
  const { p, x } = yourDraw(c);
  const won = c.winner === "you";
  return (
    <div className="flex flex-col gap-1" data-testid="roll-strip">
      <div className="relative h-3 rounded-full bg-rose-400/25" role="img" aria-label={`Your winning window is the first ${Math.round(p * 100)} percent. The server's draw landed at ${Math.round(x * 100)} percent: ${won ? "you won it" : "you lost it"}.`}>
        <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#d9b85a,#f6dd8f)]" style={{ width: `${p * 100}%` }} />
        <span aria-hidden className="absolute top-[-3px] h-[18px] w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" style={{ left: `${x * 100}%` }} />
      </div>
      <p className="text-[11px] text-white/55">Win chance {Math.round(p * 100)}% · server draw {(x * 100).toFixed(0)}{c.upset ? " · upset" : ""}. A higher rating raises the odds; it never guarantees the result.</p>
    </div>
  );
}

function ComponentRow({ x }: { x: NonNullable<E1Contest["you_components"]>[number] }) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]" data-testid="explain-part" data-source={x.source}>
      <span className="text-white/80">{componentTitle(x)} {x.evidence_type === "management_state" ? <SimTag>Management</SimTag> : <SourceChip kind={x.source.startsWith("modifier:event") ? "event" : "rules"} />}</span>
      <span className={cn("dyn-num font-semibold", x.value >= 0 ? "text-emerald-300" : "text-rose-300")}>{x.value > 0 ? "+" : ""}{x.value.toFixed(1)}</span>
    </li>
  );
}

function ExplainSheet({ open, onOpenChange, contest, stage }: { open: boolean; onOpenChange: (o: boolean) => void; contest: E1Contest | null; stage: string }) {
  const parts = contest?.you_components ? splitComponents(contest.you_components) : null;
  const theirs = contest?.opponent_components ? splitComponents(contest.opponent_components).management : [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="dyn-scroll w-full overflow-y-auto border-white/10 bg-[#0b1727] text-white sm:max-w-md" data-testid="explain-sheet">
        <SheetHeader>
          <SheetTitle className="dyn-title text-white">Why did this happen?</SheetTitle>
          <SheetDescription className="text-white/60">From the server's published tally. Optional reading.</SheetDescription>
        </SheetHeader>
        {contest ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-white/80">{contest.kind === "team" ? "Composition contest, worth 2 points" : `${contest.role?.toUpperCase()} contest, worth 1 point`} · {stage}: <b className="text-white">{contest.you_label}</b> vs {contest.opponent_label}.</p>
            {parts ? (
              <ul className="flex flex-col divide-y divide-white/10 rounded-lg border border-white/10" data-testid="explain-parts">
                {parts.rest.map((x, i) => <ComponentRow key={i} x={x} />)}
                {parts.management.length ? <li className="bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/60" data-testid="explain-management">Management</li> : null}
                {parts.management.map((x, i) => <ComponentRow key={`m${i}`} x={x} />)}
                <li className="flex justify-between px-3 py-1.5 text-[13px] font-semibold text-white"><span>Your power</span><span className="dyn-num">{contest.you_power?.toFixed(1)}</span></li>
                <li className="flex justify-between px-3 py-1.5 text-[13px] text-white/70"><span>Their power</span><span className="dyn-num">{contest.opponent_power?.toFixed(1)}</span></li>
                {theirs.length ? <li className="px-3 py-1.5 text-[11.5px] text-white/55" data-testid="explain-their-management">Their management terms: {theirs.map((x) => `${componentTitle(x)} ${x.value > 0 ? "+" : ""}${x.value.toFixed(1)}`).join(" · ")}</li> : null}
              </ul>
            ) : <p className="text-[12.5px] text-white/55">The component breakdown is published with the game's final snapshot.</p>}
            <RollStrip c={contest} />
            <SourceChip kind="synthetic" />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ContestTile({ c, shown, onWhy, motion, champ }: { c: E1Contest; shown: boolean; onWhy: () => void; motion: boolean; champ?: string }) {
  const won = c.winner === "you";
  const role = c.role as Role;
  return (
    <div data-testid={`lane-tile-${c.role}`} data-won={shown ? won : undefined}
      className={cn("dyn-tile relative flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center",
        !shown ? cn("border-white/10 bg-white/[0.02] text-white/30", motion && "dyn-tile--pending")
          : won ? cn("border-[#e3c66f]/50 bg-[linear-gradient(180deg,rgba(227,198,111,0.14),rgba(227,198,111,0.04))]", motion && "dyn-tile--win")
          : cn("border-rose-400/30 bg-rose-400/[0.06]", motion && "dyn-tile--loss"))}>
      <RoleEmblem role={RANKED_ROLE[role]} size="md" decorative className={cn(!shown && "opacity-40")} />
      <span className="hidden w-full min-w-0 truncate text-[10.5px] leading-tight text-white/60 sm:block">{champ ?? ""}</span>
      {shown ? (
        <>
          <span className={cn("dyn-title text-[15px] font-bold uppercase leading-none tracking-wider", won ? "text-[#f2dc98]" : "text-rose-300")}>{won ? "+1" : "0"}<span className="sr-only">{won ? " won" : " lost"}</span></span>
          <button type="button" onClick={onWhy} aria-label={`Why: ${c.role} contest`} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]"><Info className="h-4 w-4" aria-hidden /></button>
        </>
      ) : <span className="text-xs">…</span>}
    </div>
  );
}

function StageScore({ you, them }: { you: number; them: number }) {
  const a = useCountUp(you, 480), b = useCountUp(them, 480);
  const motion = useMotionAllowed();
  return <span className={cn("dyn-title dyn-num text-[34px] font-bold leading-none", motion && "dyn-bump")} data-testid="stage-points"><span className="text-[#f2dc98]">{a}</span><span className="mx-1 text-white/35">–</span><span className="text-white/70">{b}</span></span>;
}

export function ServerEventCard({ e, compact }: { e: E1Event; compact?: boolean }) {
  const motion = useMotionAllowed();
  const rare = /rare/.test(e.event_id);
  return (
    <article data-testid="event-card" data-event={e.event_id} data-kind={e.kind} data-rare={rare}
      className={cn("flex flex-col gap-1.5 rounded-xl border p-3", motion && "dyn-enter-fast", rare ? "border-[#e3c66f]/70 bg-[#e3c66f]/[0.08]" : e.kind === "major" ? "border-white/20 bg-white/[0.05]" : "border-white/10 bg-white/[0.035]", compact && "py-2")}>
      <div className="flex flex-wrap items-center gap-2">
        {e.kind === "major" ? <span className="rounded-full border border-white/25 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white/70">Major{e.resolution === "objective" ? "" : " · skill-free"}</span> : null}
        <h4 className="text-sm font-semibold text-white">{e.title}</h4>
        <span className="ml-auto"><SourceChip kind="event" /></span>
      </div>
      <p className="text-[13px] leading-snug text-white/75">{e.explanation.short}</p>
      {e.effects.length ? <div className="flex flex-wrap gap-1.5">{e.effects.map((x, i) => <ServerEffectChip key={i} e={x} />)}</div> : null}
    </article>
  );
}

export interface ServerGameProps {
  s: DynastySeries;
  env: SeriesEnvelope;
  teamName: string;
  accent?: string;
  mono?: string;
  onResult: () => void;
  onMood?: (m: ServerGameMood) => void;
}

export function ServerGame({ s, env, teamName, accent, mono, onResult, onMood }: ServerGameProps) {
  const motion = useMotionAllowed();
  const sting = useStinger();
  const snap = env.game as E1Snapshot;
  const series = env.series;
  const gameNo = series.status === "in_game" ? series.current_game! : series.games[series.games.length - 1]?.index ?? 1;
  const lineup = lineupById(series, series.current_lineup);
  const names = useMemo(() => champNames(lineup), [lineup]);
  const beat = lastBeat(snap);
  const stage = snap.stage;
  const tally = snap.stages.find((t) => t.stage === stage) ?? null;
  const showReveal = beat?.beat === "stage_tally";
  const [revealed, setRevealed] = useState(showReveal ? 0 : 6);
  const [why, setWhy] = useState<E1Contest | null>(null);
  const [walked, setWalked] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const oppName = shortName(series.opponent.name);
  const carry = carryNow(snap);
  const lead = meterLead(carry);
  const busy = !!s.busy;
  const settled = snap.phase === "settled";
  const closedEarly = settled && snap.settlement?.after_stage !== "late";
  const objEvent = (env.objective?.result_event_id ? snap.events.find((e) => e.instance_id === env.objective!.result_event_id) : undefined)
    ?? snap.events.find((e) => e.resolution === "objective" && e.outcome.correct_count !== null) ?? null;
  const objectiveLive = snap.phase === "awaiting_objective" || beat?.beat === "objective_result";
  // Live: the server applied the grade with the third answer; the outcome waits until the player opens it (presentation only).
  const graded = objectiveLive && env.objective?.state === "graded";
  const wins = series.wins, losses = series.losses;

  // New tally beat → replay the tile reveal (presentation only; controls stay live).
  useEffect(() => { setRevealed(showReveal && motion ? 0 : 6); }, [snap.seq, showReveal, motion]);
  useEffect(() => {
    if (!showReveal || revealed >= 6) return;
    const t = window.setTimeout(() => { setRevealed((n) => n + 1); playMoment("dyn.game.contests.tile"); }, 330);
    return () => window.clearTimeout(t);
  }, [showReveal, revealed]);
  useEffect(() => { ambientNewGame(`${series.series_id}|g${gameNo}`); }, [series.series_id, gameNo]);
  useEffect(() => { headRef.current?.focus({ preventScroll: true }); }, [stage]);

  // Broadcast reacts to the beat the server just published (keyed by seq: never twice).
  const reacted = useRef<string>("");
  useEffect(() => {
    const key = `${gameNo}|${snap.seq}`;
    if (!beat || reacted.current === key) return;
    reacted.current = key;
    if (beat.beat === "stage_open") { playMoment("dyn.game.stage_open"); if (stage === "late") playMoment("dyn.crowd.swell"); }
    if (beat.beat === "stage_tally" && tally) {
      if (stage === "late") playMoment("dyn.game.late_verdict");
      else playMoment(tally.you_points > tally.opponent_points ? "dyn.game.state_winning" : "dyn.game.state_losing");
    }
    if (beat.beat === "objective_prompt") sting({ id: "objective.baron", kicker: "After Mid", title: "Baron window opens", sub: "Three questions. Three clean answers end the game.", tone: "violet", cue: "dynasty.obj.baron_start" });
    if (beat.beat === "settlement" && snap.settlement && snap.settlement.how !== "late_decides") {
      const won = snap.settlement.winner === "you";
      sting({ id: "game.closeout", kicker: "Closeout", title: won ? "Game closed out" : "Closed out against you", sub: "Late is not played.", tone: won ? "gold" : "red", ms: 2000, cue: "dynasty.game.closeout" });
    }
  }, [beat, snap.seq, snap.settlement, stage, tally, gameNo, sting]);

  useEffect(() => {
    if (!onMood) return;
    if (objectiveLive) onMood("baron");
    else if (settled) onMood(snap.settlement?.winner === "you" ? "victory" : "defeat");
    else onMood(stage);
  }, [onMood, objectiveLive, settled, snap.settlement, stage]);

  const variant: StadiumVariant = losses === 2 || wins === 2 ? "elimination" : "normal";
  const intro = gameNo === 1 && snap.seq === 0 && !walked;
  const starters = starterNames(env.management);
  const envState: EnvState = {
    accent, mono, team: teamName, opp: oppName,
    roster: ROLE_ORDER.map((r) => ({ name: starters[r] ?? `SYN ${series.team.team_id}-${r}`, role: r, kind: "academy" as const })),
    results: series.games.map((g) => (g.winner === "you" ? "W" : "L")), lead, live: !intro, score: `${wins}–${losses}`,
    stageLabel: `Game ${gameNo} · BO5 · ${STAGE_NAME[stage]}`, variant, mood: "neutral",
  };
  const stageEvents = snap.events.filter((e) => e.stage === stage && e.resolution !== "objective");
  const newest = beat?.beat === "event_revealed" ? snap.events.find((e) => e.instance_id === beat.ref) : null;
  const quiet = snap.slots.filter((x) => x.stage === stage && (x.state === "no_eligible_major" || x.state === "no_eligible_small"));
  const visibleStages = (["early", "mid", "late"] as const).filter((x) => x !== "late" || !closedEarly);
  const primaryLabel = settled ? "See the game result"
    : snap.phase === "stage_open" ? `Begin the ${STAGE_NAME[stage]} stage`
    : snap.phase === "scoring" ? `Score the ${STAGE_NAME[stage]} stage`
    : beat?.beat === "stage_tally" ? (stage === "late" ? "Final whistle" : "Continue")
    : "Continue";
  const doPrimary = () => { if (settled) onResult(); else void s.advanceTo(PAUSE_BEATS); };
  const crowd = crowdLevel(lead, objectiveLive || settled ? 0.2 : showReveal && revealed >= 6 ? 0.12 : 0);
  const mp = matchPoint(series);

  return (
    <Scene id={intro ? "tunnel" : "stadium"} caption={false} variant={variant} env={envState}>
      <div data-testid="game-view" data-source="server" data-stage={stage} data-phase={snap.phase} data-seq={snap.seq} data-beat={beat?.beat ?? ""} data-scene={intro ? "tunnel" : "stadium"}
        className={cn("flex flex-col gap-2.5 sm:gap-3", snap.phase === "awaiting_objective" && "dyn-encounter-compact")}>
        <div className="dyn-ribbon -mx-4 flex items-center justify-between gap-2 px-4 py-1 text-[10px] uppercase tracking-[0.2em] sm:mx-0 sm:rounded-md" data-testid="led-ribbon">
          <span className="truncate text-[#f2dc98]">{teamName}</span>
          <span className="shrink-0 text-white/45">{intro ? "Walking out" : mp ? "Match point" : "Live"}</span>
          <CrowdMeter level={crowd} className="hidden sm:flex" />
          <span className="truncate text-right text-white/70">{oppName}</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <Eyebrow>Game {gameNo} · vs {oppName} <SimTag className="ml-1 hidden sm:inline">E1 server</SimTag></Eyebrow>
            <h2 ref={headRef} tabIndex={-1} data-testid="game-heading" className={cn("dyn-title dyn-game-head truncate text-[24px] font-semibold leading-tight outline-none sm:text-[28px]", motion && "dyn-enter-fast")} key={stage}>{STAGE_NAME[stage]} stage</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-white/60" data-testid="game-series-score">
            <Pips n={wins} max={3} label="Your wins" /> <span className="dyn-num dyn-title text-[16px] font-bold text-white">{wins}–{losses}</span> <Pips n={losses} max={3} label="Their wins" tone="red" />
          </div>
        </div>

        <ol className={cn("grid gap-1.5", objectiveLive && "hidden sm:grid")} style={{ gridTemplateColumns: `repeat(${visibleStages.length}, minmax(0, 1fr))` }} aria-label="Stage progress">
          {visibleStages.map((x) => {
            const r = snap.stages.find((t) => t.stage === x);
            const active = x === stage && !settled;
            return (
              <li key={x} aria-current={active ? "step" : undefined} data-testid={`stage-seg-${x}`} data-points={r ? `${r.you_points}-${r.opponent_points}` : ""}
                className={cn("relative overflow-hidden rounded-lg border px-2 py-1.5 text-center text-[11px] transition-colors", active ? "border-[#e3c66f]/60 bg-[#e3c66f]/[0.08] text-white" : r ? "border-white/15 bg-white/[0.03] text-white/70" : "border-white/10 text-white/40")}>
                <span className="dyn-title block text-[11px] font-bold uppercase tracking-[0.18em]">{STAGE_NAME[x]}</span>
                <span className="mt-0.5 flex items-center justify-center gap-1.5 truncate">
                  {r ? <><span className="dyn-num font-semibold text-white">{r.you_points}–{r.opponent_points}</span>{r.outcome_label ? <span className={cn("hidden rounded-full border px-1.5 text-[9px] font-bold uppercase tracking-wider sm:inline", LABEL_TONE[r.outcome_label])}>{r.outcome_label}</span> : null}</> : <span>{active ? "live" : "—"}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <div className={cn(objectiveLive && "hidden sm:block")}><LeadMeter lead={lead} /></div>

        {gameNo === 1 && snap.seq === 0 ? (walked
          ? <ServerLineupStrip env={env} />
          : <WalkoutSequence env={envState} picks={{}} champNames={names} gameLabel={`Game ${gameNo} · BO5`} onDone={() => setWalked(true)} />) : null}
        {snap.seq === 0 && gameNo > 1 ? <ServerLineupStrip env={env} /> : null}

        {beat?.beat === "stage_open" ? <CasterPop moment="stage.open" k={`${series.series_id}|g${gameNo}|${stage}`} ctx={{ stage: STAGE_NAME[stage], team: teamName, opp: oppName }} compact className="hidden sm:flex" /> : null}

        {!objectiveLive ? (
          <section aria-label="Events this stage" className="flex flex-col gap-2" data-testid="events-strip">
            <Eyebrow tone="muted">Events · {stageEvents.length} revealed{quiet.length ? ` · ${quiet.length} quiet slot${quiet.length > 1 ? "s" : ""}` : ""}</Eyebrow>
            {newest ? (
              <>
                {/rare/.test(newest.event_id) ? <><CineFrame kind="outplay" kicker="Rare event · generated in-run" title={newest.title} caption={newest.explanation.short} /><ReactionPop moment="event.rare" k={`${gameNo}|${newest.instance_id}`} text="CLIP IT. That is the play of the night." className="self-start" /></> : null}
                <ServerEventCard e={newest} />
              </>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {stageEvents.filter((e) => e !== newest).map((e) => (
                <span key={e.instance_id} data-testid="event-chip" data-event={e.event_id} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", e.kind === "major" ? "border-white/25 bg-white/[0.06] text-white/85" : "border-white/12 bg-white/[0.03] text-white/70")}>{e.title}</span>
              ))}
              {quiet.map((q, i) => <span key={`q${i}`} data-testid="quiet-slot" className="inline-flex items-center rounded-full border border-dashed border-white/15 px-2.5 py-1 text-[11px] text-white/45">Quiet {q.slot} slot</span>)}
            </div>
          </section>
        ) : null}

        {tally && !objectiveLive ? (
          showReveal || settled ? (
            <>
              <TallyPlate tally={tally} revealed={revealed} onSkip={() => setRevealed(6)} onWhy={setWhy} names={names} castKey={`${series.series_id}|g${gameNo}|${stage}`} />
              {env.management && revealed >= 6 ? <ManagementInfluence tally={tally} mv={env.management} /> : null}
            </>
          ) : (
            <section aria-label="Stage score" className={cn(PLATE, "flex items-center gap-x-2.5 px-3 py-2 sm:gap-x-3")} data-testid="stage-score">
              <Eyebrow>{STAGE_NAME[stage]} · published</Eyebrow>
              <span className="dyn-title dyn-num whitespace-nowrap text-[18px] font-bold leading-none" data-testid="stage-points"><span className="text-[#f2dc98]">{tally.you_points}</span><span className="mx-0.5 text-white/35">–</span><span className="text-white/70">{tally.opponent_points}</span></span>
              <SevenPips lanes={orderContests(tally).lanes.map((c) => c.winner === "you")} team={orderContests(tally).team?.winner === "you"} size="sm" />
              {tally.outcome_label ? <span className="ml-auto"><StateLabel label={tally.outcome_label} /></span> : null}
            </section>
          )
        ) : null}

        {objectiveLive ? (
          <ServerObjective
            prompt={snap.objective} session={env.objective} result={beat?.beat === "objective_result" && !graded ? objEvent : null} busy={busy} accent={accent}
            onOpen={() => snap.objective && void s.openObjective(snap.objective.encounter_id)}
            onAnswer={(i, o) => snap.objective && void s.answer(snap.objective.encounter_id, i, o)}
            onSettle={() => env.objective && void s.settleObjective(env.objective.encounter_id)}
            onContinue={() => void s.advanceTo(PAUSE_BEATS)}
            continueLabel={objEvent?.outcome.category === "baron_ace_closeout" ? "See how the game ended" : "Back to the match"} />
        ) : null}

        {settled && snap.settlement && snap.settlement.how !== "late_decides" ? (
          <CloseoutBanner won={snap.settlement.winner === "you"} reason={settleReason(snap)} notes={objEvent ? [objEvent.explanation.short] : []} />
        ) : null}
        {settled && snap.settlement?.how === "late_decides" ? (
          <p className="text-[12.5px] text-white/70" data-testid="late-final">{settleReason(snap)}. Late always decides: 4 or more of 7 points wins the game.</p>
        ) : null}

        {(!objectiveLive || settled) && !graded ? (
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-[#07111f]/92 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0" data-testid="game-controls">
            {busy ? <span className="mr-auto text-[11px] text-white/50" data-testid="game-busy" role="status">Waiting for the server…</span> : null}
            {!settled ? <Btn testId="game-skip" disabled={busy} className="min-h-[40px] px-3 text-xs" onClick={() => void s.advanceTo(SKIP_BEATS)}>Skip ahead</Btn> : null}
            <Btn primary beckon testId="game-continue" disabled={busy} onClick={doPrimary}>{primaryLabel}</Btn>
          </div>
        ) : null}

        <ExplainSheet open={!!why} onOpenChange={(o) => { if (!o) setWhy(null); }} contest={why} stage={STAGE_NAME[stage]} />
      </div>
    </Scene>
  );
}

function TallyPlate({ tally, revealed, onSkip, onWhy, names, castKey }: { tally: E1StageTally; revealed: number; onSkip: () => void; onWhy: (c: E1Contest) => void; names: Partial<Record<Role, string>>; castKey: string }) {
  const motion = useMotionAllowed();
  const { lanes, team } = orderContests(tally);
  const late = tally.stage === "late";
  const done = revealed >= 6;
  return (
    <section aria-label="Stage score" className={cn(PLATE, "dyn-plate--ornate flex flex-col gap-3 p-3")} data-testid="stage-score" data-you={tally.you_points}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{STAGE_NAME[tally.stage]} · seven points</Eyebrow>
        {!done ? <Btn testId="skip-reveal" className="min-h-[36px] px-3 py-1 text-xs" onClick={onSkip}>Skip</Btn> : null}
      </div>
      <div className="grid grid-cols-5 gap-1.5">{lanes.map((c, i) => <ContestTile key={c.role} c={c} shown={i < revealed} motion={motion} onWhy={() => onWhy(c)} champ={names[c.role as Role]} />)}</div>
      {team ? (
        <div data-testid="team-tile" data-won={done ? team.winner === "you" : undefined}
          className={cn("dyn-tile flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm", !done ? cn("border-white/10 bg-white/[0.02] text-white/30", motion && "dyn-tile--pending") : team.winner === "you" ? cn("border-[#e3c66f]/50 bg-[linear-gradient(180deg,rgba(227,198,111,0.14),rgba(227,198,111,0.04))]", motion && "dyn-tile--win") : cn("border-rose-400/30 bg-rose-400/[0.06]", motion && "dyn-tile--loss"))}>
          <span className="dyn-title rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-bold text-white/85">×2</span>
          <span className="flex-1 text-[11px] uppercase tracking-[0.16em] text-white/65">Composition contest</span>
          {done ? <>
            <span className={cn("dyn-title text-[13px] font-bold uppercase tracking-wider", team.winner === "you" ? "text-[#f2dc98]" : "text-rose-300")}>{team.winner === "you" ? "+2 Won" : "Lost"}</span>
            <button type="button" onClick={() => onWhy(team)} aria-label="Why: composition contest" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]"><Info className="h-4 w-4" aria-hidden /></button>
          </> : <span className="text-xs">…</span>}
        </div>
      ) : null}
      {done ? (
        <div className="flex flex-col gap-2.5" data-testid="stage-result" data-label={tally.outcome_label ?? (tally.you_points >= 4 ? "Game won" : "Game lost")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StageScore you={tally.you_points} them={tally.opponent_points} />
            <SevenPips lanes={lanes.map((c) => c.winner === "you")} team={team?.winner === "you"} />
            <span className="ml-auto">{late
              ? <span className={cn("dyn-title inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] font-bold uppercase tracking-[0.14em]", tally.winner === "you" ? LABEL_TONE.Winning : LABEL_TONE.Losing, motion && "dyn-stamp")} data-testid="late-verdict">{tally.winner === "you" ? "Game won" : "Game lost"}</span>
              : tally.outcome_label ? <StateLabel label={tally.outcome_label} stamp size="lg" /> : null}</span>
          </div>
          {!late ? <p className="text-[12.5px] text-white/65" data-testid="carry-note">Server carry <b className="dyn-num text-white/85">{tally.carry_in_you > 0 ? "+" : ""}{tally.carry_in_you}</b> → <b className="dyn-num text-white/85">{tally.carry_out_you > 0 ? "+" : ""}{tally.carry_out_you}</b> entering {tally.stage === "early" ? "Mid" : "Late"}. Carried advantage, not extra points.</p> : null}
          <p className="sr-only" role="status" aria-live="polite">{STAGE_NAME[tally.stage]} stage: {tally.you_points} to {tally.opponent_points}, {late ? (tally.winner === "you" ? "game won" : "game lost") : tally.outcome_label}.</p>
          <CasterPop moment="stage.result" k={`${castKey}|result`} ctx={{ stage: STAGE_NAME[tally.stage], score: `${tally.you_points}–${tally.opponent_points}`, label: late ? (tally.winner === "you" ? "game won" : "game lost") : (tally.outcome_label ?? "").toLowerCase() }} compact className="hidden sm:flex" />
        </div>
      ) : null}
    </section>
  );
}

export function ServerLineupStrip({ env, lineupId }: { env: SeriesEnvelope; lineupId?: string }) {
  const motion = useMotionAllowed();
  const l = lineupById(env.series, lineupId ?? env.series.current_lineup);
  const players = starterNames(env.management);
  if (!l) return null;
  return (
    <div data-testid="lineup-strip" data-lineup={l.lineup_id} className="flex flex-col gap-2">
      <div className={cn("grid grid-cols-5 gap-1.5", motion && "dyn-frame--motion")}>
        <div className="dyn-frame-lineup contents">
          {l.champions.map((c, i) => {
            const cls = champClass(c.class);
            return (
              <div key={c.key} style={{ "--i": i } as CSSProperties} className="relative flex min-w-0 flex-col items-center gap-1 rounded-lg border border-white/12 bg-[#0b1727]/85 px-1 py-2 text-center" data-testid="lineup-tile">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: `${CLASS_COLOR[cls]}66`, background: `${CLASS_COLOR[cls]}1a` }}><ClassGlyph cls={cls} size={20} /></span>
                <span className="dyn-title w-full truncate text-[10.5px] font-semibold text-white sm:text-[12px]">{shortName(c.name)}</span>
                <span className="text-[9px] uppercase tracking-[0.14em] text-white/45">{l.roles[i]}</span>
                {players[l.roles[i]] ? <span className="w-full truncate text-[9.5px] text-white/60" data-testid="lineup-player">{players[l.roles[i]]}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/70">
        <span className="dyn-title rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/[0.08] px-3 py-0.5 text-[12px] text-[#f2dc98]" data-testid="lineup-identity">{l.title.split(" (")[0]}</span>
        <span className="text-white/40">· synthetic c1 champions, server lineup</span>
      </div>
    </div>
  );
}
