/**
 * UX-1 / VIS-F1 — one game, Early -> Mid -> Late, with the approved structure:
 * per reached stage 1-2 small events + the major slot, a seven-point score
 * (5 lanes + 2-point team), five labelled states, carried advantage, the
 * Early+Mid Winning closeout, and a Late stage that always decides.
 * Ordinary score reveals auto-advance quickly (skippable); every event
 * hand-off and every objective is a player click.
 *
 * VIS-F1 layout rule: the game is a FOCUS stage. The header, stage strip and
 * lead meter stay; below them exactly one thing is live at a time (events ->
 * major -> score -> objective -> closeout). Resolved events collapse into
 * chips so the screen never grows past a phone viewport.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Info } from "lucide-react";
import { playMoment } from "./audio";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  applySmallEvents, baronQualified, beginGame, planStage, resolveObjective, resolveTeamfight, scoreStage,
  type Game, type LaneRes, type LedgerItem, type Run, type StagePlan, type StageResult,
} from "./engine";
import { CHAMP_BY_ID, ROLE_LABEL, SEASON, STAGES, STAGE_LABEL, type Role, type Stage, ROLES } from "./fixtures";
import { ObjectivePanel, OutcomeCard } from "./ObjectivePanel";
import type { ObjectiveKind } from "./objectives";
import { Btn, EffectChip, Eyebrow, LABEL_TONE, LeadMeter, PLATE, Pips, RANKED_ROLE, SevenPips, Sigil, SourceChip, StateLabel, useCountUp, ORG_ACCENT } from "./parts";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { CasterPop, CrowdMeter, ReactionPop, ambientNewGame, crowdLevel, useStinger } from "./broadcast";
import { CineFrame, LineupStrip } from "./cinematics";
import type { EnvState } from "./environments";
import { WalkoutSequence } from "./walkout";
import type { StadiumVariant } from "./scenes";
import { Scene } from "./scenes";

type Step = "events" | "major" | "score" | "after" | "baron" | "closed";
export type GameMood = Stage | ObjectiveKind | "victory" | "defeat";

function majorQueue(stage: Stage, plan: StagePlan): (ObjectiveKind | "teamfight")[] {
  if (stage === "early") return ["dragon"];
  if (stage === "late") return plan.major === "elder" ? ["elder", "teamfight"] : ["teamfight"];
  return [];
}

export function EventCard({ item, compact }: { item: LedgerItem; compact?: boolean }) {
  const motion = useMotionAllowed();
  return (
    <article data-testid="event-card" data-rare={!!item.rare} data-kind={item.kind}
      className={cn("flex flex-col gap-1.5 rounded-xl border p-3", motion && "dyn-enter-fast",
        item.rare ? cn("border-[#e3c66f]/70 bg-[radial-gradient(80%_80%_at_0%_0%,rgba(227,198,111,0.18),rgba(227,198,111,0.02))]", motion && "dyn-rare") : "border-white/10 bg-white/[0.035]",
        compact && "py-2")}>
      <div className="flex flex-wrap items-center gap-2">
        {item.rare ? <span className="rounded-full bg-[linear-gradient(180deg,#f6dd8f,#d9b85a)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#1a1406]">Rare play</span> : null}
        <h4 className="text-sm font-semibold text-white">{item.title}</h4>
        <span className="ml-auto"><SourceChip kind="event" /></span>
      </div>
      <p className="text-[13px] leading-snug text-white/75">{item.text}</p>
      {item.effects.length ? <div className="flex flex-wrap gap-1.5">{item.effects.map((e, i) => <EffectChip key={i} e={e} />)}</div> : null}
    </article>
  );
}

function RollStrip({ p, roll, won }: { p: number; roll: number; won: boolean }) {
  return (
    <div className="flex flex-col gap-1" data-testid="roll-strip">
      <div className="relative h-3 rounded-full bg-rose-400/25" role="img" aria-label={`Your winning window is the first ${Math.round(p * 100)} percent. The draw was ${Math.round(roll * 100)} percent: ${won ? "inside it, you win" : "outside it, you lose"}.`}>
        <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#d9b85a,#f6dd8f)]" style={{ width: `${p * 100}%` }} />
        <span aria-hidden className="absolute top-[-3px] h-[18px] w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" style={{ left: `${roll * 100}%` }} />
      </div>
      <p className="text-[11px] text-white/55">Win chance {Math.round(p * 100)}% · draw {(roll * 100).toFixed(0)}. A higher rating raises the odds; it never guarantees the result.</p>
    </div>
  );
}

function ExplainBody({ lane, stage, team, mirrored }: { lane?: LaneRes; stage: StageResult; team?: boolean; mirrored: boolean }) {
  if (team) {
    const t = stage.team;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-white/80">Team contest, worth 2 points. It reads the whole composition, org tendency, cohesion and the lane average, not just the five duels.</p>
        <dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-white/55">Your team power</dt><dd className="dyn-num text-right font-semibold text-white">{t.ours.toFixed(2)}</dd><dt className="text-white/55">Their team power</dt><dd className="dyn-num text-right font-semibold text-white">{t.theirs.toFixed(2)}</dd></dl>
        <RollStrip p={mirrored ? 1 - t.p : t.p} roll={mirrored ? 1 - t.roll : t.roll} won={mirrored ? !t.won : t.won} />
        <SourceChip kind="rules" />
      </div>
    );
  }
  if (!lane) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/80">{ROLE_LABEL[lane.role]} lane, {STAGE_LABEL[stage.stage]}: {CHAMP_BY_ID[lane.ourChamp].name} vs {CHAMP_BY_ID[lane.theirChamp].name}.</p>
      <ul className="flex flex-col divide-y divide-white/10 rounded-lg border border-white/10" data-testid="explain-parts">
        {lane.parts.filter((x) => x.value !== 0).map((x) => (
          <li key={x.label} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
            <span className="text-white/80">{x.label} <SourceChip kind={x.source === "event" ? "event" : "rules"} /></span>
            <span className={cn("dyn-num font-semibold", x.value >= 0 ? "text-emerald-300" : "text-rose-300")}>{x.value > 0 ? "+" : ""}{x.value.toFixed(2)}</span>
          </li>
        ))}
        <li className="flex justify-between px-3 py-1.5 text-[13px] font-semibold text-white"><span>Your lane power</span><span className="dyn-num">{lane.ours.toFixed(2)}</span></li>
        <li className="flex justify-between px-3 py-1.5 text-[13px] text-white/70"><span>Their lane power</span><span className="dyn-num">{lane.theirs.toFixed(2)}</span></li>
      </ul>
      <RollStrip p={mirrored ? 1 - lane.p : lane.p} roll={mirrored ? 1 - lane.roll : lane.roll} won={mirrored ? !lane.won : lane.won} />
    </div>
  );
}

export function ExplainSheet({ open, onOpenChange, stage, role, team }: { open: boolean; onOpenChange: (o: boolean) => void; stage: StageResult | null; role: Role | null; team: boolean }) {
  const [mirrored, setMirrored] = useState(false);
  if (!stage) return null;
  const lane = role ? stage.lanes.find((l) => l.role === role) : undefined;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="dyn-scroll w-full overflow-y-auto border-white/10 bg-[#0b1727] text-white sm:max-w-md" data-testid="explain-sheet">
        <SheetHeader>
          <SheetTitle className="dyn-title text-white">Why did this happen?</SheetTitle>
          <SheetDescription className="text-white/60">Optional. The game works without reading this.</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="sim" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sim">Simulation</TabsTrigger>
            <TabsTrigger value="base">Baseline</TabsTrigger>
          </TabsList>
          <TabsContent value="sim" className="mt-3 flex flex-col gap-3">
            <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} /> Show their perspective</label>
            <ExplainBody lane={lane} stage={stage} team={team} mirrored={mirrored} />
          </TabsContent>
          <TabsContent value="base" className="mt-3 flex flex-col gap-3" data-testid="explain-baseline">
            <SourceChip kind="synthetic" />
            <p className="text-sm text-white/80">These player and champion values are invented. There is no historical evidence behind them, and none is claimed.</p>
            <p className="text-[13px] text-white/60">With a certified real catalog this tab would show, verbatim from the server: the metric (for example CSD@10 or GD@10), competition and patch window, sample size, comparison group, uncertainty and the date the catalog was frozen, each marked <SourceChip kind="verified" />.</p>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

const short = (id: string) => CHAMP_BY_ID[id].name.replace("SynChamp-", "Syn ");

/** One lane: a compact column tile on phones, a row on wide screens. */
function LaneTile({ lane, shown, onWhy, motion }: { lane: LaneRes; shown: boolean; onWhy: () => void; motion: boolean }) {
  return (
    <div data-testid={`lane-tile-${lane.role}`} data-won={shown ? lane.won : undefined}
      className={cn("dyn-tile relative flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center",
        !shown ? cn("border-white/10 bg-white/[0.02] text-white/30", motion && "dyn-tile--pending")
          : lane.won ? cn("border-[#e3c66f]/50 bg-[linear-gradient(180deg,rgba(227,198,111,0.14),rgba(227,198,111,0.04))]", motion && "dyn-tile--win")
          : cn("border-rose-400/30 bg-rose-400/[0.06]", motion && "dyn-tile--loss"))}>
      <RoleEmblem role={RANKED_ROLE[lane.role]} size="md" decorative className={cn(!shown && "opacity-40")} />
      <span className="hidden w-full min-w-0 text-[10.5px] leading-tight text-white/60 sm:block"><span className="block truncate">{short(lane.ourChamp)}</span><span className="block truncate text-white/35">vs {short(lane.theirChamp)}</span></span>
      {shown ? (
        <>
          <span className={cn("dyn-title text-[15px] font-bold uppercase leading-none tracking-wider", lane.won ? "text-[#f2dc98]" : "text-rose-300")}>{lane.won ? "+1" : "0"}<span className="sr-only">{lane.won ? " won" : " lost"}</span></span>
          <button type="button" onClick={onWhy} aria-label={`Why: ${ROLE_LABEL[lane.role]} lane`} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]"><Info className="h-4 w-4" aria-hidden /></button>
        </>
      ) : <span className="text-xs">…</span>}
    </div>
  );
}

function StageScore({ ours, theirs }: { ours: number; theirs: number }) {
  const a = useCountUp(ours, 480), b = useCountUp(theirs, 480);
  const motion = useMotionAllowed();
  return (
    <span className={cn("dyn-title dyn-num text-[34px] font-bold leading-none", motion && "dyn-bump")} data-testid="stage-points">
      <span className="text-[#f2dc98]">{a}</span><span className="mx-1 text-white/35">–</span><span className="text-white/70">{b}</span>
    </span>
  );
}

/** The Mid closeout hero: the game ends here, no Late stage. */
export function CloseoutBanner({ won, reason, notes = [], onContinue }: { won: boolean; reason: string; notes?: string[]; onContinue?: () => void }) {
  const motion = useMotionAllowed();
  return (
    <div className={cn(PLATE, "dyn-plate--ornate dyn-hero flex flex-col gap-3 p-4", won ? "dyn-hero--victory border-[#e3c66f]/60" : "dyn-hero--defeat border-rose-400/40", motion && "dyn-enter")} data-testid="closeout" data-won={won}>
      <div className="flex items-center gap-3">
        <Sigil kind={won ? "teamfight" : "baron"} size={44} />
        <div className="min-w-0">
          <Eyebrow>{won ? "Closeout" : "Closed out"}</Eyebrow>
          <p className={cn("dyn-title text-[28px] font-bold leading-none sm:text-[34px]", won ? "dyn-title--gold" : "text-rose-200", motion && "dyn-hero-word")}>{won ? "Game won at Mid" : "Game lost at Mid"}</p>
        </div>
      </div>
      <p className="text-sm text-white/85">{reason}. There is no Late stage in this game, and no Late events were generated.</p>
      {notes.map((t, i) => <p key={i} className="text-[13px] text-white/65">{t}</p>)}
      {onContinue ? <div className="flex justify-end"><Btn primary beckon testId="closeout-continue" onClick={onContinue}>See the game result</Btn></div> : null}
    </div>
  );
}

export interface GameViewProps { run: Run; picks: Record<Role, string>; onDone: (g: Game) => void; onMood?: (m: GameMood) => void }

export function GameView({ run, picks, onDone, onMood }: GameViewProps) {
  const motion = useMotionAllowed();
  const sting = useStinger();
  const [stage, setStage] = useState<Stage>("early");
  const [g, setG] = useState<Game>(() => {
    const base = beginGame(run, picks);
    return applySmallEvents(base, "early", planStage(run, base, "early"));
  });
  const [step, setStep] = useState<Step>("events");
  const [mi, setMi] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [why, setWhy] = useState<{ role: Role | null; team: boolean } | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [walked, setWalked] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const plan = g.plans[stage]!;
  const queue = majorQueue(stage, plan);
  const result = g.stages.find((s) => s.stage === stage) ?? null;
  const node = SEASON[run.nodeIdx];
  const closedAtMid = g.over && g.endedAt === "mid";
  const visibleStages = STAGES.filter((s) => s !== "late" || !closedAtMid);
  const cur = queue[mi];

  useEffect(() => { window.scrollTo?.({ top: 0 }); headRef.current?.focus({ preventScroll: true }); }, [stage, step]);
  useEffect(() => {
    if (step !== "after" || revealed >= 6) return;
    if (!motion) { setRevealed(6); return; }
    const t = window.setTimeout(() => { setRevealed((n) => n + 1); playMoment("dyn.game.contests.tile"); }, 330);
    return () => window.clearTimeout(t);
  }, [step, revealed, motion]);
  // One ambient budget per game (04 rule 6).
  useEffect(() => { ambientNewGame(`${run.seed}|g${g.idx}`); }, [run.seed, g.idx]);
  // The verdict lands when the sixth tile is in: a state cue mid-game, the gavel on Late.
  const verdictFor = useRef<Stage | null>(null);
  useEffect(() => {
    if (step !== "after" || revealed < 6 || !result || verdictFor.current === stage) return;
    verdictFor.current = stage;
    if (stage === "late") playMoment("dyn.game.late_verdict");
    else playMoment(result.ours > result.theirs ? "dyn.game.state_winning" : "dyn.game.state_losing");
  }, [step, revealed, stage, result]);
  // Signature moments: an objective appearing gets its own stinger.
  useEffect(() => {
    if (step === "baron") sting({ id: "objective.baron", kicker: "After Mid", title: "Baron window opens", sub: "Three questions. Three clean answers end the game.", tone: "violet", cue: "dynasty.obj.baron_start" });
    else if (step === "major" && cur === "dragon") sting({ id: "objective.dragon", kicker: "Early", title: "Dragon spawns", sub: "One question for the pit.", tone: "ember", cue: "dynasty.obj.dragon_start" });
    else if (step === "major" && cur === "elder") sting({ id: "objective.elder", kicker: "Late · tight game", title: "Elder Dragon", sub: "Three questions for the final stage.", tone: "ice", cue: "dynasty.obj.elder_start" });
    else if (step === "major" && cur === "teamfight") sting({ id: "objective.teamfight", kicker: "Late", title: "Decisive teamfight", tone: "gold", ms: 1300, cue: "dynasty.obj.teamfight_start" });
    else if (step === "closed") sting({ id: "game.closeout", kicker: "Closeout", title: g.won ? "Game closed out" : "Closed out against you", sub: "Late is not played.", tone: g.won ? "gold" : "red", ms: 2000, cue: "dynasty.game.closeout" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cur]);
  // Mood light follows the focus: the stage, or the objective on the table.
  useEffect(() => {
    if (!onMood) return;
    if (step === "baron") onMood("baron");
    else if (step === "major" && (cur === "dragon" || cur === "elder")) onMood(cur);
    else if (step === "closed") onMood(g.won ? "victory" : "defeat");
    else onMood(stage);
  }, [onMood, step, cur, stage, g.won]);

  const enter = (next: Stage, from: Game) => {
    const gg = applySmallEvents({ ...from, stage: next }, next, planStage(run, from, next));
    setG(gg); setStage(next); setStep("events"); setMi(0); setRevealed(0);
    playMoment("dyn.game.stage_open");
    if (next === "late") playMoment("dyn.crowd.swell");
  };

  const afterEvents = () => { setStep(queue.length ? "major" : "score"); setMi(0); };
  const advanceMajor = (gg: Game) => {
    setG(gg);
    if (mi + 1 < queue.length) setMi(mi + 1); else setStep("score");
  };
  const doScore = () => {
    const out = scoreStage(run, g, stage);
    setG(out.game); setRevealed(motion ? 0 : 6); setStep("after");
    if (!motion) playMoment("dyn.game.contests.tile");
  };
  const afterContinue = () => {
    if (stage === "late") { onDone(g); return; }
    if (stage === "mid") {
      if (g.over) { setStep("closed"); return; }
      if (baronQualified(g)) { setStep("baron"); return; }
      enter("late", g); return;
    }
    if (g.over) { setStep("closed"); return; }
    enter("mid", g);
  };

  const wins = run.series!.wins, losses = run.series!.losses;
  const stageEvents = g.ledger.filter((l) => l.stage === stage);
  // The first beat of a series' first game plays in the tunnel; everything after is on stage.
  const intro = stage === "early" && step === "events" && g.idx === 1;
  const teamName = run.org.name.replace(/^SYN /, ""), oppName = node.opp.name.replace(/^SYN /, "");
  const castKey = `${run.seed}|n${run.nodeIdx}|g${g.idx}|${stage}`;
  const eventsLive = step === "events";
  const scoreLive = step === "after" || step === "score";
  // While a question encounter is on the table, phones show only the encounter; the context rows return at sm+.
  const focusEncounter = step === "baron" || (step === "major" && cur !== "teamfight");
  // Stadium dressing: the Worlds Final gets the finals stage; an elimination game (Worlds, or facing match point) the red ribbon.
  const variant: StadiumVariant = run.nodeIdx === SEASON.length - 1 ? "finals" : node.kind === "worlds" || losses === 2 ? "elimination" : "normal";
  const inTunnel = intro && !walked;
  const accent = ORG_ACCENT[run.org.id]?.hex;
  // The stadium shows the run: both names on the board, the score, the stage, and the floor light follows the advantage.
  const env: EnvState = { accent, mono: ORG_ACCENT[run.org.id]?.mono, team: teamName, opp: oppName, roster: ROLES.map((r) => ({ name: run.starters[r].name, role: r, kind: run.starters[r].kind })), cohesion: run.cohesion, results: run.results, lead: g.lead, live: !inTunnel, score: `${wins}–${losses}`, stageLabel: `Game ${g.idx} · ${node.label} · ${STAGE_LABEL[stage]}`, variant, mood: node.kind === "worlds" ? "worlds" : "neutral" };

  return (
    <Scene id={inTunnel ? "tunnel" : "stadium"} caption={false} variant={variant} loud={node.kind === "worlds"} env={env}>
    <div data-testid="game-view" data-stage={stage} data-step={step} data-scene={inTunnel ? "tunnel" : "stadium"} data-variant={variant} className={cn("flex flex-col gap-2.5 sm:gap-3", focusEncounter && "dyn-encounter-compact")}>
      {/* LED ribbon: who is on stage */}
      <div className="dyn-ribbon -mx-4 flex items-center justify-between gap-2 px-4 py-1 text-[10px] uppercase tracking-[0.2em] sm:mx-0 sm:rounded-md" data-testid="led-ribbon">
        <span className="truncate text-[#f2dc98]">{teamName}</span>
        <span className="shrink-0 text-white/45">{inTunnel ? "Walking out" : "Live"}</span>
        <CrowdMeter level={crowdLevel(g.lead, step === "baron" || step === "closed" ? 0.2 : revealed >= 6 && step === "after" ? 0.12 : 0)} className="hidden sm:flex" />
        <span className="truncate text-right text-white/70">{oppName}</span>
      </div>
      {/* Header: game, opponent, series */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <Eyebrow>Game {g.idx} · vs {node.opp.name.replace(/^SYN /, "")}</Eyebrow>
          <h2 ref={headRef} tabIndex={-1} data-testid="game-heading" className={cn("dyn-title dyn-game-head truncate text-[24px] font-semibold leading-tight outline-none sm:text-[28px]", motion && "dyn-enter-fast")} key={stage}>{STAGE_LABEL[stage]} stage</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-white/60" data-testid="game-series-score">
          <Pips n={wins} max={3} label="Your wins" /> <span className="dyn-num dyn-title text-[16px] font-bold text-white">{wins}–{losses}</span> <Pips n={losses} max={3} label="Their wins" tone="red" />
        </div>
      </div>

      {/* Stage strip: three (or two) segments, published tallies stay */}
      <ol className={cn("grid gap-1.5", focusEncounter && "hidden sm:grid")} style={{ gridTemplateColumns: `repeat(${visibleStages.length}, minmax(0, 1fr))` }} aria-label="Stage progress">
        {visibleStages.map((s) => {
          const r = g.stages.find((x) => x.stage === s);
          const active = s === stage;
          return (
            <li key={s} aria-current={active ? "step" : undefined} data-testid={`stage-seg-${s}`}
              className={cn("relative overflow-hidden rounded-lg border px-2 py-1.5 text-center text-[11px] transition-colors",
                active ? "border-[#e3c66f]/60 bg-[#e3c66f]/[0.08] text-white" : r ? "border-white/15 bg-white/[0.03] text-white/70" : "border-white/10 text-white/40")}>
              {active ? <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#e3c66f,transparent)]" /> : null}
              <span className="dyn-title block text-[11px] font-bold uppercase tracking-[0.18em]">{STAGE_LABEL[s]}</span>
              <span className="mt-0.5 flex items-center justify-center gap-1.5 truncate">
                {r ? <><span className="dyn-num font-semibold text-white">{r.ours}–{r.theirs}</span><span className={cn("hidden rounded-full border px-1.5 text-[9px] font-bold uppercase tracking-wider sm:inline", LABEL_TONE[r.label])}>{r.label}</span></> : <span>{active ? "live" : "—"}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={cn(focusEncounter && "hidden sm:block")}><LeadMeter lead={g.lead} /></div>

      {/* Events (small): live cards while it is their beat, chips afterwards */}
      <section aria-label="Events this stage" className={cn("flex-col gap-2", focusEncounter ? "hidden sm:flex" : "flex")} data-testid="events-strip">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow tone="muted">Events · {plan.small.length} small{queue.length ? ` · ${queue.length} major` : ""}</Eyebrow>
          {!eventsLive && g.ledger.length ? <button type="button" onClick={() => setLedgerOpen(true)} className="text-[11px] text-white/55 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]">Ledger ({g.ledger.length})</button> : null}
        </div>
        {eventsLive ? (
          <>
            {intro ? (walked
              ? <LineupStrip picks={picks} oppTags={node.opp.tags} />
              : <WalkoutSequence env={env} picks={picks} gameLabel={`Game ${g.idx} · ${node.label}`} onDone={() => setWalked(true)} />) : null}
            {stageEvents.some((l) => l.rare) ? (
              <>
                <CineFrame kind="outplay" kicker="Rare event · generated in-run" title={stageEvents.find((l) => l.rare)!.title} caption="A 1v2 turned into a turret." />
                <ReactionPop moment="event.rare" k={`${run.seed}|g${g.idx}|rare`} text="CLIP IT. That is the play of the night." className="self-start" />
              </>
            ) : null}
            <CasterPop moment="stage.open" k={castKey} ctx={{ stage: STAGE_LABEL[stage], team: teamName, opp: oppName }} compact className="hidden sm:flex" />
            <div className={cn("flex flex-col gap-2", motion && "dyn-stagger")}>{stageEvents.map((l, i) => <div key={i} style={{ "--i": i } as CSSProperties}><EventCard item={l} /></div>)}</div>
            <div className="flex justify-end"><Btn primary beckon testId="events-continue" onClick={afterEvents}>{queue.length ? `On to the ${queue[0] === "dragon" ? "Dragon" : queue[0] === "elder" ? "Elder Dragon" : "teamfight"}` : "Score the stage"}</Btn></div>
          </>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {stageEvents.map((l, i) => (
              <span key={i} data-testid="event-chip" className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", l.rare ? "border-[#e3c66f]/60 bg-[#e3c66f]/10 text-[#f2dc98]" : l.kind === "major" ? "border-white/25 bg-white/[0.06] text-white/85" : "border-white/12 bg-white/[0.03] text-white/70")}>
                {l.rare ? "★ " : null}{l.title}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Major */}
      {step === "major" && cur ? (
        cur === "teamfight" ? (
          <div className={cn(PLATE, "dyn-plate--ornate flex flex-col gap-3 p-4", motion && "dyn-enter-fast")} data-testid="teamfight-card">
            <div className="flex items-center gap-3">
              <Sigil kind="teamfight" size={52} breathe />
              <div><Eyebrow>Decisive teamfight · no questions</Eyebrow><h3 className="dyn-title mt-0.5 text-[20px] font-semibold leading-tight">The fight that decides the map</h3></div>
            </div>
            <p className="text-sm text-white/80">The fight is decided by the advantage you carry in. A skill-free major event.</p>
            <div className="flex justify-end"><Btn primary beckon testId="teamfight-resolve" onClick={() => advanceMajor(resolveTeamfight(g, stage).game)}>Resolve the fight</Btn></div>
          </div>
        ) : (
          <ObjectivePanel accent={accent} key={`${stage}-${cur}`} kind={cur} seed={`${run.seed}|g${g.idx}|${stage}`}
            reason={cur === "elder" ? "Late is tight. An Elder fight can tilt the final seven points." : undefined}
            onResolve={(c) => advanceMajor(resolveObjective(g, stage, cur, c).game)} />
        )
      ) : null}

      {step === "score" ? (
        <div className={cn(PLATE, "flex items-center justify-between gap-3 p-3", motion && "dyn-enter-fast")}>
          <div className="min-w-0"><Eyebrow>Seven points</Eyebrow><p className="mt-0.5 text-[13px] text-white/70">Five lanes, one point each, and a two-point team contest.</p></div>
          <Btn primary beckon testId="score-stage" onClick={doScore}>Score the {STAGE_LABEL[stage]} stage</Btn>
        </div>
      ) : null}

      {/* Score reveal: the stage's published tally collapses to one line while a later step is live */}
      {result && !scoreLive ? (
        <section aria-label="Stage score" className={cn(PLATE, "items-center gap-x-2.5 px-3 py-2 sm:gap-x-3", focusEncounter ? "hidden sm:flex" : "flex")} data-testid="stage-score">
          <Eyebrow className="hidden sm:block">{STAGE_LABEL[stage]} · published</Eyebrow>
          <Eyebrow className="sm:hidden">{STAGE_LABEL[stage]}</Eyebrow>
          <span className="dyn-title dyn-num whitespace-nowrap text-[18px] font-bold leading-none" data-testid="stage-points"><span className="text-[#f2dc98]">{result.ours}</span><span className="mx-0.5 text-white/35">–</span><span className="text-white/70">{result.theirs}</span></span>
          <SevenPips lanes={result.lanes.map((l) => l.won)} team={result.team.won} size="sm" />
          <span className="ml-auto"><StateLabel label={result.label} /></span>
        </section>
      ) : null}
      {result && scoreLive ? (
        <section aria-label="Stage score" className={cn(PLATE, "dyn-plate--ornate flex flex-col gap-3 p-3")} data-testid="stage-score">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>{STAGE_LABEL[stage]} · seven points</Eyebrow>
            {revealed < 6 ? <Btn testId="skip-reveal" className="min-h-[36px] px-3 py-1 text-xs" onClick={() => setRevealed(6)}>Skip</Btn> : null}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {result.lanes.map((l, i) => <LaneTile key={l.role} lane={l} shown={i < revealed} onWhy={() => setWhy({ role: l.role, team: false })} motion={motion} />)}
          </div>
          <div data-testid="team-tile" data-won={revealed >= 6 ? result.team.won : undefined}
            className={cn("dyn-tile flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm",
              revealed < 6 ? cn("border-white/10 bg-white/[0.02] text-white/30", motion && "dyn-tile--pending")
                : result.team.won ? cn("border-[#e3c66f]/50 bg-[linear-gradient(180deg,rgba(227,198,111,0.14),rgba(227,198,111,0.04))]", motion && "dyn-tile--win")
                : cn("border-rose-400/30 bg-rose-400/[0.06]", motion && "dyn-tile--loss"))}>
            <span className="dyn-title rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-bold text-white/85">×2</span>
            <span className="flex-1 text-[11px] uppercase tracking-[0.16em] text-white/65">Team contest</span>
            {revealed >= 6 ? (
              <>
                <span className={cn("dyn-title text-[13px] font-bold uppercase tracking-wider", result.team.won ? "text-[#f2dc98]" : "text-rose-300")}>{result.team.won ? "+2 Won" : "Lost"}</span>
                <button type="button" onClick={() => setWhy({ role: null, team: true })} aria-label="Why: team contest" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]"><Info className="h-4 w-4" aria-hidden /></button>
              </>
            ) : <span className="text-xs">…</span>}
          </div>
          {revealed >= 6 ? (
            <div className="flex flex-col gap-2.5" data-testid="stage-result" data-label={result.label}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <StageScore ours={result.ours} theirs={result.theirs} />
                <SevenPips lanes={result.lanes.map((l) => l.won)} team={result.team.won} />
                <span className="ml-auto">{stage === "late"
                  ? <span className={cn("dyn-title inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] font-bold uppercase tracking-[0.14em]", result.ours >= 4 ? LABEL_TONE.Winning : LABEL_TONE.Losing, motion && "dyn-stamp")} data-testid="late-verdict">{result.ours >= 4 ? "Game won" : "Game lost"}</span>
                  : <StateLabel label={result.label} stamp size="lg" />}</span>
              </div>
              {stage !== "late" ? <p className="text-[12.5px] text-white/65" data-testid="carry-note">Advantage <b className="dyn-num text-white/85">{result.leadBefore > 0 ? "+" : ""}{result.leadBefore}</b> → <b className="dyn-num text-white/85">{result.leadAfter > 0 ? "+" : ""}{result.leadAfter}</b> entering {stage === "early" ? "Mid" : "Late"}. Carried advantage, not extra points.</p>
                : <p className="text-[12.5px] text-white/65" data-testid="late-final">Late always decides: 4 or more points wins the game.</p>}
              <p className="sr-only" role="status" aria-live="polite">{STAGE_LABEL[stage]} stage: {result.ours} to {result.theirs}, {stage === "late" ? (result.ours >= 4 ? "game won" : "game lost") : result.label}.</p>
              <CasterPop moment="stage.result" k={`${castKey}|result`} ctx={{ stage: STAGE_LABEL[stage], score: `${result.ours}–${result.theirs}`, label: stage === "late" ? (result.ours >= 4 ? "game won" : "game lost") : result.label.toLowerCase() }} compact className="hidden sm:flex" />
              {step === "after" ? (
                <div className="flex justify-end"><Btn primary beckon testId="stage-continue" onClick={afterContinue}>{stage === "late" ? "See the game result" : g.over ? "See why the game ended" : stage === "early" ? "On to Mid" : baronQualified(g) ? "A Baron window opens" : "On to Late"}</Btn></div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === "after" && stage === "mid" && !g.over && !baronQualified(g) && revealed >= 6 ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/65" data-testid="no-baron">No Baron opportunity this game: Mid was not strong enough to contest it. The Late stage is next.</p>
      ) : null}

      {step === "baron" ? (
        <ObjectivePanel accent={accent} key="baron" kind="baron" seed={`${run.seed}|g${g.idx}|baron`} closeoutOffered
          reason={`Mid ended ${result?.ours}–${result?.theirs} (${result?.label}). A Baron window is open, and a clean sweep here would end the game.`}
          onResolve={(c) => { const out = resolveObjective(g, "mid", "baron", c, true); setG(out.game); if (out.game.over) setStep("closed"); else enter("late", out.game); }} />
      ) : null}

      {step === "closed" ? (
        <CloseoutBanner won={!!g.won} reason={g.reason} notes={g.ledger.filter((l) => l.title.includes("Baron") && l.stage === "mid" && l.kind === "major").map((l) => l.text)} onContinue={() => onDone(g)} />
      ) : null}

      <ExplainSheet open={!!why} onOpenChange={(o) => { if (!o) setWhy(null); }} stage={why ? (g.stages.find((s) => s.stage === stage) ?? null) : null} role={why?.role ?? null} team={!!why?.team} />

      <Sheet open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <SheetContent side="right" className="dyn-scroll w-full overflow-y-auto border-white/10 bg-[#0b1727] text-white sm:max-w-md" data-testid="ledger-sheet">
          <SheetHeader><SheetTitle className="dyn-title text-white">Event ledger</SheetTitle><SheetDescription className="text-white/60">Everything that happened in this game so far.</SheetDescription></SheetHeader>
          <div className="mt-4 flex flex-col gap-2">{g.ledger.map((l, i) => <div key={i}><p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/40">{STAGE_LABEL[l.stage]}</p><EventCard item={l} compact /></div>)}</div>
        </SheetContent>
      </Sheet>
    </div>
    </Scene>
  );
}

export { OutcomeCard };
