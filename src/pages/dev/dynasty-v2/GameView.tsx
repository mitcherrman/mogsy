/**
 * UX-1 — one game, Early -> Mid -> Late, with the approved structure:
 * per reached stage 1-2 small events + the major slot, a seven-point score
 * (5 lanes + 2-point team), five labelled states, carried advantage, the
 * Early+Mid Winning closeout, and a Late stage that always decides.
 * Ordinary score reveals auto-advance quickly (skippable); every event
 * hand-off and every objective is a player click.
 */
import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  applySmallEvents, baronQualified, beginGame, planStage, resolveObjective, resolveTeamfight, scoreStage,
  type Game, type LaneRes, type LedgerItem, type Run, type StagePlan, type StageResult,
} from "./engine";
import { CHAMP_BY_ID, ROLE_LABEL, SEASON, STAGES, STAGE_LABEL, type Role, type Stage } from "./fixtures";
import { ObjectivePanel, OutcomeCard } from "./ObjectivePanel";
import type { ObjectiveKind } from "./objectives";
import { Btn, EffectChip, Eyebrow, LeadMeter, Pips, RolePill, SURFACE, SevenPips, SourceChip, StateLabel } from "./parts";

type Step = "events" | "major" | "score" | "after" | "baron" | "closed";

function majorQueue(stage: Stage, plan: StagePlan): (ObjectiveKind | "teamfight")[] {
  if (stage === "early") return ["dragon"];
  if (stage === "late") return plan.major === "elder" ? ["elder", "teamfight"] : ["teamfight"];
  return [];
}

export function EventCard({ item }: { item: LedgerItem }) {
  return (
    <article data-testid="event-card" data-rare={!!item.rare} data-kind={item.kind}
      className={cn("flex flex-col gap-1.5 rounded-xl border p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
        item.rare ? "border-[#e3c66f]/60 bg-[#e3c66f]/[0.07]" : "border-white/10 bg-white/[0.04]")}>
      <div className="flex flex-wrap items-center gap-2">
        {item.rare ? <span className="rounded-full bg-[#e3c66f] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1a1406]">Rare play</span> : null}
        <h4 className="text-sm font-semibold text-white">{item.title}</h4>
        <SourceChip kind="event" />
      </div>
      <p className="text-[13px] text-white/75">{item.text}</p>
      {item.effects.length ? <div className="flex flex-wrap gap-1.5">{item.effects.map((e, i) => <EffectChip key={i} e={e} />)}</div> : null}
    </article>
  );
}

function RollStrip({ p, roll, won }: { p: number; roll: number; won: boolean }) {
  return (
    <div className="flex flex-col gap-1" data-testid="roll-strip">
      <div className="relative h-3 rounded-full bg-rose-400/25" role="img" aria-label={`Your winning window is the first ${Math.round(p * 100)} percent. The draw was ${Math.round(roll * 100)} percent: ${won ? "inside it, you win" : "outside it, you lose"}.`}>
        <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-[#e3c66f]/70" style={{ width: `${p * 100}%` }} />
        <span aria-hidden className="absolute top-[-3px] h-[18px] w-0.5 bg-white" style={{ left: `${roll * 100}%` }} />
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
        <dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-white/55">Your team power</dt><dd className="text-right font-semibold text-white">{t.ours.toFixed(2)}</dd><dt className="text-white/55">Their team power</dt><dd className="text-right font-semibold text-white">{t.theirs.toFixed(2)}</dd></dl>
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
            <span className={cn("font-semibold tabular-nums", x.value >= 0 ? "text-emerald-300" : "text-rose-300")}>{x.value > 0 ? "+" : ""}{x.value.toFixed(2)}</span>
          </li>
        ))}
        <li className="flex justify-between px-3 py-1.5 text-[13px] font-semibold text-white"><span>Your lane power</span><span className="tabular-nums">{lane.ours.toFixed(2)}</span></li>
        <li className="flex justify-between px-3 py-1.5 text-[13px] text-white/70"><span>Their lane power</span><span className="tabular-nums">{lane.theirs.toFixed(2)}</span></li>
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
      <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-[#0b1727] text-white sm:max-w-md" data-testid="explain-sheet">
        <SheetHeader>
          <SheetTitle className="text-white">Why did this happen?</SheetTitle>
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

function LaneTile({ lane, shown, onWhy }: { lane: LaneRes; shown: boolean; onWhy: () => void }) {
  return (
    <div data-testid={`lane-tile-${lane.role}`} data-won={shown ? lane.won : undefined}
      className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", !shown ? "border-white/10 bg-white/[0.02] text-white/30" : lane.won ? "border-[#e3c66f]/40 bg-[#e3c66f]/[0.07]" : "border-rose-400/30 bg-rose-400/[0.06]")}>
      <RolePill role={lane.role} />
      <span className="min-w-0 flex-1 truncate text-xs text-white/65">{short(lane.ourChamp)} <span className="text-white/35">vs</span> {short(lane.theirChamp)}</span>
      {shown ? (
        <>
          <span className={cn("text-xs font-bold uppercase tracking-wider", lane.won ? "text-[#e3c66f]" : "text-rose-300")}>{lane.won ? "+1 Won" : "Lost"}</span>
          <button type="button" onClick={onWhy} aria-label={`Why: ${ROLE_LABEL[lane.role]} lane`} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]"><Info className="h-4 w-4" aria-hidden /></button>
        </>
      ) : <span className="text-xs">…</span>}
    </div>
  );
}

export interface GameViewProps { run: Run; picks: Record<Role, string>; onDone: (g: Game) => void }

export function GameView({ run, picks, onDone }: GameViewProps) {
  const sfx = useSfx();
  const motion = useMotionAllowed();
  const [stage, setStage] = useState<Stage>("early");
  const [g, setG] = useState<Game>(() => {
    const base = beginGame(run, picks);
    return applySmallEvents(base, "early", planStage(run, base, "early"));
  });
  const [step, setStep] = useState<Step>("events");
  const [mi, setMi] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [why, setWhy] = useState<{ role: Role | null; team: boolean } | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const plan = g.plans[stage]!;
  const queue = majorQueue(stage, plan);
  const result = g.stages.find((s) => s.stage === stage) ?? null;
  const node = SEASON[run.nodeIdx];
  const closedAtMid = g.over && g.endedAt === "mid";
  const visibleStages = STAGES.filter((s) => s !== "late" || !closedAtMid);

  useEffect(() => { headRef.current?.focus({ preventScroll: true }); }, [stage, step]);
  useEffect(() => {
    if (step !== "after" || revealed >= 6) return;
    if (!motion) { setRevealed(6); return; }
    const t = window.setTimeout(() => { setRevealed((n) => n + 1); sfx.play("ranked.discovery.reveal"); }, 330);
    return () => window.clearTimeout(t);
  }, [step, revealed, motion, sfx]);

  const enter = (next: Stage, from: Game) => {
    const gg = applySmallEvents({ ...from, stage: next }, next, planStage(run, from, next));
    setG(gg); setStage(next); setStep("events"); setMi(0); setRevealed(0);
    sfx.play(next === "late" ? "ranked.round.final" : "ranked.module.start");
  };

  const afterEvents = () => { setStep(queue.length ? "major" : "score"); setMi(0); };
  const advanceMajor = (gg: Game) => {
    setG(gg);
    if (mi + 1 < queue.length) setMi(mi + 1); else setStep("score");
  };
  const doScore = () => {
    const out = scoreStage(run, g, stage);
    setG(out.game); setRevealed(motion ? 0 : 6); setStep("after");
    if (!motion) sfx.play("ranked.discovery.reveal");
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

  const cur = queue[mi];
  const wins = run.series!.wins, losses = run.series!.losses;

  return (
    <div data-testid="game-view" data-stage={stage} data-step={step} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Eyebrow>Game {g.idx} · vs {node.opp.name}</Eyebrow>
          <h2 ref={headRef} tabIndex={-1} data-testid="game-heading" className="font-display text-2xl font-semibold text-white outline-none">{STAGE_LABEL[stage]} stage</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60" data-testid="game-series-score">Series <Pips n={wins} max={3} label="Your wins" /> <span className="font-semibold text-white">{wins}–{losses}</span> <Pips n={losses} max={3} label="Their wins" tone="red" /></div>
      </div>

      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visibleStages.length}, minmax(0, 1fr))` }} aria-label="Stage progress">
        {visibleStages.map((s) => {
          const r = g.stages.find((x) => x.stage === s);
          return (
            <li key={s} aria-current={s === stage ? "step" : undefined} data-testid={`stage-seg-${s}`} className={cn("rounded-lg border px-2 py-1.5 text-center text-[11px]", s === stage ? "border-[#e3c66f]/60 bg-[#e3c66f]/10 text-white" : "border-white/10 text-white/50")}>
              <span className="block font-bold uppercase tracking-wider">{STAGE_LABEL[s]}</span>
              <span className="block truncate">{r ? `${r.ours}–${r.theirs} ${r.label}` : "—"}</span>
            </li>
          );
        })}
      </ol>
      <LeadMeter lead={g.lead} />

      {/* Events (small) */}
      <section aria-label="Events this stage" className="flex flex-col gap-2" data-testid="events-strip">
        <Eyebrow tone="muted">Events · {plan.small.length} small{queue.length ? ` · ${queue.length} major` : ""}</Eyebrow>
        {g.ledger.filter((l) => l.stage === stage).map((l, i) => <EventCard key={i} item={l} />)}
        {step === "events" ? (
          <div className="flex justify-end"><Btn primary testId="events-continue" onClick={afterEvents}>{queue.length ? `On to the ${queue[0] === "dragon" ? "Dragon" : queue[0] === "elder" ? "Elder Dragon" : "teamfight"}` : "Score the stage"}</Btn></div>
        ) : null}
      </section>

      {/* Major */}
      {step === "major" && cur ? (
        cur === "teamfight" ? (
          <div className={cn(SURFACE, "flex flex-col gap-2 p-4")} data-testid="teamfight-card">
            <Eyebrow>Decisive teamfight · no questions</Eyebrow>
            <p className="text-sm text-white/80">The fight is decided by the advantage you carry in. Skill-free major event.</p>
            <div className="flex justify-end"><Btn primary testId="teamfight-resolve" onClick={() => advanceMajor(resolveTeamfight(g, stage).game)}>Resolve the fight</Btn></div>
          </div>
        ) : (
          <ObjectivePanel key={`${stage}-${cur}`} kind={cur} seed={`${run.seed}|g${g.idx}|${stage}`}
            reason={cur === "elder" ? "Late is tight. An Elder fight can tilt the final seven points." : undefined}
            onResolve={(c) => advanceMajor(resolveObjective(g, stage, cur, c).game)} />
        )
      ) : null}

      {step === "score" ? (
        <div className="flex justify-end"><Btn primary testId="score-stage" onClick={doScore}>Score the {STAGE_LABEL[stage]} stage</Btn></div>
      ) : null}

      {/* Score */}
      {result ? (
        <section aria-label="Stage score" className={cn(SURFACE, "flex flex-col gap-3 p-3")} data-testid="stage-score">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Seven points · five lanes + a 2-point team contest</Eyebrow>
            {revealed < 6 ? <Btn testId="skip-reveal" className="min-h-[36px] px-3 py-1 text-xs" onClick={() => setRevealed(6)}>Skip</Btn> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            {result.lanes.map((l, i) => <LaneTile key={l.role} lane={l} shown={i < revealed} onWhy={() => setWhy({ role: l.role, team: false })} />)}
            <div data-testid="team-tile" data-won={revealed >= 6 ? result.team.won : undefined}
              className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm", revealed < 6 ? "border-white/10 bg-white/[0.02] text-white/30" : result.team.won ? "border-[#e3c66f]/40 bg-[#e3c66f]/[0.07]" : "border-rose-400/30 bg-rose-400/[0.06]")}>
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-bold text-white/80">×2</span>
              <span className="flex-1 text-xs uppercase tracking-wider text-white/65">Team contest</span>
              {revealed >= 6 ? (
                <>
                  <span className={cn("text-xs font-bold uppercase tracking-wider", result.team.won ? "text-[#e3c66f]" : "text-rose-300")}>{result.team.won ? "+2 Won" : "Lost"}</span>
                  <button type="button" onClick={() => setWhy({ role: null, team: true })} aria-label="Why: team contest" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]"><Info className="h-4 w-4" aria-hidden /></button>
                </>
              ) : <span className="text-xs">…</span>}
            </div>
          </div>
          {revealed >= 6 ? (
            <div className="flex flex-col gap-2" data-testid="stage-result" data-label={result.label}>
              <div className="flex flex-wrap items-center gap-3">
                <SevenPips lanes={result.lanes.map((l) => l.won)} team={result.team.won} />
                <span className="text-lg font-bold text-white" data-testid="stage-points">{result.ours}–{result.theirs}</span>
                <StateLabel label={result.label} />
              </div>
              {stage !== "late" ? <p className="text-[13px] text-white/70" data-testid="carry-note">Advantage {result.leadBefore > 0 ? "+" : ""}{result.leadBefore} → {result.leadAfter > 0 ? "+" : ""}{result.leadAfter} entering {stage === "early" ? "Mid" : "Late"}. This is carried advantage, not extra points.</p>
                : <p className="text-[13px] text-white/70" data-testid="late-final">Late always decides: 4 or more points wins the game.</p>}
              <p className="sr-only" role="status" aria-live="polite">{STAGE_LABEL[stage]} stage: {result.ours} to {result.theirs}, {result.label}.</p>
              {step === "after" ? (
                <div className="flex justify-end"><Btn primary testId="stage-continue" onClick={afterContinue}>{stage === "late" ? "See the game result" : g.over ? "See why the game ended" : stage === "early" ? "On to Mid" : baronQualified(g) ? "A Baron window opens" : "On to Late"}</Btn></div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === "after" && stage === "mid" && !g.over && !baronQualified(g) && revealed >= 6 ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/65" data-testid="no-baron">No Baron opportunity this game: Mid was not strong enough to contest it. The Late stage is next.</p>
      ) : null}

      {step === "baron" ? (
        <ObjectivePanel key="baron" kind="baron" seed={`${run.seed}|g${g.idx}|baron`} closeoutOffered
          reason={`Mid ended ${result?.ours}–${result?.theirs} (${result?.label}). A Baron window is open, and a clean sweep here would end the game.`}
          onResolve={(c) => { const out = resolveObjective(g, "mid", "baron", c, true); setG(out.game); if (out.game.over) setStep("closed"); else enter("late", out.game); }} />
      ) : null}

      {step === "closed" ? (
        <div className={cn(SURFACE, "flex flex-col gap-3 border-[#e3c66f]/40 p-4")} data-testid="closeout" data-won={g.won}>
          <Eyebrow>{g.won ? "Game won at Mid" : "Game lost at Mid"}</Eyebrow>
          <p className="text-sm text-white/85">{g.reason}. There is no Late stage in this game, and no Late events were generated.</p>
          {g.ledger.filter((l) => l.title.includes("Baron") && l.stage === "mid" && l.kind === "major").map((l, i) => <p key={i} className="text-[13px] text-white/65">{l.text}</p>)}
          <div className="flex justify-end"><Btn primary testId="closeout-continue" onClick={() => onDone(g)}>See the game result</Btn></div>
        </div>
      ) : null}

      <ExplainSheet open={!!why} onOpenChange={(o) => { if (!o) setWhy(null); }} stage={why ? (g.stages.find((s) => s.stage === stage) ?? null) : null} role={why?.role ?? null} team={!!why?.team} />
    </div>
  );
}

export { OutcomeCard };
