/**
 * CE1 — the Combat Estimate playtest harness. DEVELOPMENT ONLY: registered in
 * App.tsx behind `import.meta.env.DEV`, so a production build drops it and the
 * path 404s.
 *
 * It is the HOST for the prototype. It builds a round from the frozen
 * authority capture, keeps the authority's result in a ref the primitive
 * never receives, and after Lock stands in for the server by grading in that
 * closure and passing only the resulting `EstimateReveal` (and the authority's
 * working) down.
 *
 * It mounts the stage inside the REAL `CanonicalArena` — the production shell,
 * header plate, grid and `ranked-question-stage` folio — by handing the arena
 * a lab-local `ModuleRenderer` whose Viewport draws the stage (Rangefinder's
 * trick). No registry, transport or contract seam is touched.
 *
 *   /dev/combat-estimate?round=jarvan-q-r3-l5-dirk-vs-olaf
 *     &state=open|set|locked|revealed-exact|revealed-over|revealed-under   (pre-arranged states for capture)
 *     &seed=<any>                                                            (pool order)
 *     &motion=reduce                                                         (force the reduced-motion path)
 *     &round=synthetic-demo                                                  (the one visual-only round)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { CombatEstimateStage } from "@/components/combat-estimate/CombatEstimateStage";
import type { EstimateResponse, EstimateReveal, EstimateValue } from "@/lib/interaction-grammar/types";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS, type CombatantView } from "@/lib/ranked-core/viewTypes";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import {
  buildLabRound, buildSyntheticRound, findCaptured, gradeLabRound, roundOrder, SYNTHETIC_ROUND_ID,
  type LabGrade, type LabRound,
} from "./labAuthority";

const SERVER_LATENCY_MS = 420;
type Prearranged = "open" | "set" | "locked" | "revealed-exact" | "revealed-over" | "revealed-under";
type Phase = "open" | "locked" | "revealed";

/** What the lab's viewport draws. The arena never sees it; the renderer's Viewport reads it. */
interface LabStage {
  round: LabRound;
  generation: number;
  phase: Phase;
  value: EstimateValue;
  reveal: EstimateReveal | null;
  grade: LabGrade | null;
  onChange: (value: number) => void;
  onLock: (response: EstimateResponse) => void;
  onRevealComplete: () => void;
}
const LabStageContext = createContext<LabStage | null>(null);

function LabViewport() {
  const s = useContext(LabStageContext);
  const ref = useRef<HTMLDivElement>(null);
  // The host measures the stage and hands the primitive a definite height, as a Ranked module does.
  const stageHeight = useStageRoom(ref);
  if (!s) return null;
  return (
    <div ref={ref} data-testid="combat-estimate-lab-viewport" className="flex min-h-0 flex-col">
      <CombatEstimateStage key={`${s.round.id}:${s.generation}`}
        content={s.round.content} scenario={s.round.scenario} phase={s.phase} value={s.value}
        stageHeight={stageHeight} onChange={s.onChange} onLock={s.onLock}
        reveal={s.reveal} working={s.grade?.working ?? null} sourceLine={s.grade?.sourceLine ?? null}
        onRevealComplete={s.onRevealComplete} />
    </div>
  );
}

/** A lab-local renderer: the arena mounts its Viewport in the question stage like any module's. */
const LAB_RENDERER: ModuleRenderer = {
  moduleId: "combat-estimate-lab", moduleVersion: 1, servesVersion: () => true,
  ownsSubmission: true, ownsResultReveal: () => true,
  Viewport: LabViewport,
  projectQuestion: () => null,
  summaryLabel: () => null,
};

const combatant = (over: Partial<CombatantView>): CombatantView => ({
  playerId: "you", name: "You", tag: "Mid", side: "player", classId: "mage",
  roleId: "mid", identityMode: "role", score: 0,
  hp: 150, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});
const rail = (which: "player" | "opponent"): ArenaRail => ({
  kind: "combatant",
  combatant: which === "player" ? combatant({}) : combatant({ playerId: "opp", name: "Bot", side: "opponent", roleId: "top", tag: "Top" }),
  presentation: "banner", damage: [], outcome: null, damageDealt: null, feedback: null, reaction: null, award: null,
});

/** The production arena's input, with the lab's renderer in the surface. The round payload is an ordinary fixture; the Viewport ignores it. */
function labArenaView(phase: Phase): ArenaViewModel {
  const round = readPublicRound(publicRoundV2());
  return {
    header: {
      eyebrow: "Combat Estimate", title: "Playtest", transitionNote: null, playtestNote: null, presenceNote: null,
      timer: { durationSeconds: 60, remainingSeconds: 45, paused: true, urgent: false }, timerLabel: "Timer",
      centralResult: null, moduleTitle: null, moduleEventId: null,
    },
    roundBeat: null, segmentBeat: null, cardBeat: null,
    left: rail("player"), right: rail("opponent"),
    surface: {
      renderer: LAB_RENDERER,
      publicRound: round, segmentState: round.segmentState ?? null, selection: null,
      permissions: NO_INTERACTIONS,
      actions: { submitChallenge: () => {}, busy: false, error: null },
      skewMs: 0, reveal: null, onSelect: () => {}, ownsSubmission: true,
      inputOpen: phase === "open", hasContent: true,
    },
    abilityHud: null, status: null, hudAction: null,
    timeline: {
      visibleNodes: 1, anchorIndex: 0, windowStart: 0, currentIndex: 0, currentRoundNumber: 1, anchored: true,
      nodes: [{ roundNumber: 1, index: 0, visible: true, state: "current", segmentKind: null, outcome: null, tag: null, topic: null }],
    },
    revealHold: false, progressionEnabled: false,
  } as ArenaViewModel;
}

export default function CombatEstimateLab() {
  const [params, setParams] = useSearchParams();
  const seed = params.get("seed") ?? "academy";
  const order = useMemo(() => roundOrder(seed), [seed]);
  const requested = params.get("round");
  const synthetic = requested === SYNTHETIC_ROUND_ID;
  const captured = (requested && !synthetic ? findCaptured(requested) : null) ?? order[0];
  const forceReduce = params.get("motion") === "reduce";
  const prearranged = (params.get("state") as Prearranged | null) ?? "open";

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  // ---- the round. The secret lives in the round object the host keeps; the primitive gets only `content`.
  const [generation, setGeneration] = useState(0);
  const round = useMemo(() => (synthetic ? buildSyntheticRound() : buildLabRound(captured)), [captured, synthetic]);
  const roundRef = useRef<LabRound>(round);
  roundRef.current = round;

  const [value, setValue] = useState<EstimateValue>(null);
  const [phase, setPhase] = useState<Phase>("open");
  const [grade, setGrade] = useState<LabGrade | null>(null);
  const [lastResponse, setLastResponse] = useState<EstimateResponse | null>(null);
  const [revealDone, setRevealDone] = useState(false);
  const lockedRef = useRef(false);

  // Reset on a new round (or a regeneration), and apply a pre-arranged state when asked. Any pending reveal timer dies with the round.
  useEffect(() => {
    setGrade(null);
    setLastResponse(null);
    setRevealDone(false);
    lockedRef.current = false;
    if (prearranged === "open") { setValue(null); setPhase("open"); return; }
    const truth = round.secret.secret?.whole ?? round.secret.synthetic?.whole ?? 0;
    const max = round.content.scale.max;
    // A deterministic setting: a plain fraction of the beam, or the truth ± a quarter (wrong), or the truth itself.
    const estimate = prearranged === "revealed-exact" ? truth
      : prearranged === "revealed-over" ? Math.min(max - 1, truth + Math.max(1, Math.round(truth * 0.25)))
      : prearranged === "revealed-under" ? Math.max(0, truth - Math.max(1, Math.round(truth * 0.25)))
      : Math.round(max * 0.42);
    setValue(estimate);
    if (prearranged === "set") { setPhase("open"); return; }
    const response: EstimateResponse = { estimate };
    setLastResponse(response);
    setPhase("locked");
    lockedRef.current = true;
    if (prearranged === "locked") return;
    const t = window.setTimeout(() => { setGrade(gradeLabRound(round, response)); setPhase("revealed"); }, 300);
    return () => window.clearTimeout(t);
  }, [round, generation, prearranged]);

  const revealTimer = useRef<number | null>(null);
  useEffect(() => () => { if (revealTimer.current !== null) window.clearTimeout(revealTimer.current); }, []);
  const onLock = useCallback((response: EstimateResponse) => {
    // One submission per round: a second Lock (a double-tap, a replayed key) is ignored.
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLastResponse(response);
    setPhase("locked");
    const current = roundRef.current;
    // Stand-in for the server round trip: grade in the host's closure, hand down only the reveal.
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      revealTimer.current = null;
      if (roundRef.current !== current) return; // the round changed under the request
      setGrade(gradeLabRound(current, response));
      setPhase("revealed");
    }, SERVER_LATENCY_MS);
  }, []);
  const onRevealComplete = useCallback(() => setRevealDone(true), []);

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };
  const nextRound = () => {
    const i = order.findIndex((r) => r.id === captured.id);
    go({ round: order[(i + 1) % order.length].id, state: null });
  };

  const stage: LabStage = useMemo(() => ({
    round, generation, phase, value, reveal: grade?.reveal ?? null, grade, onChange: setValue, onLock, onRevealComplete,
  }), [round, generation, phase, value, grade, onLock, onRevealComplete]);
  const view = useMemo(() => labArenaView(phase), [phase]);

  const chrome = (
    // `arenaHeaderRowClass` insets the row clear of the GlobalHud's fixed chips, which otherwise sit over the row's ends and swallow clicks.
    <div data-testid="combat-estimate-lab-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <span className="ranked-eyebrow shrink-0">Combat Estimate · CE1 lab</span>
      <span className="shrink-0 font-mono opacity-70" data-testid="lab-round">{round.id}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {(["open", "set", "locked", "revealed-exact", "revealed-over", "revealed-under"] as Prearranged[]).map((s) => (
          <button key={s} type="button" onClick={() => go({ state: s === "open" ? null : s })} data-active={prearranged === s ? "" : undefined}
            className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110] data-[active]:text-[#f6e6bb]">
            {s}
          </button>
        ))}
        <button type="button" onClick={() => go({ motion: forceReduce ? null : "reduce" })} data-active={forceReduce ? "" : undefined}
          className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110]">Reduced motion</button>
        <button type="button" onClick={() => go({ round: synthetic ? null : SYNTHETIC_ROUND_ID, state: null })} data-active={synthetic ? "" : undefined} data-testid="lab-synthetic"
          className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#8d2f33] data-[active]:bg-[#2a1010]">Synthetic</button>
        <button type="button" onClick={() => { setGeneration((g) => g + 1); go({ state: null }); }} data-testid="lab-reset" className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Reset</button>
        <button type="button" onClick={nextRound} data-testid="lab-next" className="whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-2 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14]">Next</button>
        {/* Reserved: these indicators toggle by opacity so the chrome row never reflows. */}
        <span data-testid="lab-response" data-on={lastResponse ? "true" : "false"} className="inline-block w-[4.5rem] overflow-hidden text-ellipsis whitespace-nowrap font-mono opacity-70 data-[on=false]:opacity-0">
          {lastResponse ? `{${lastResponse.estimate}}` : "—"}
        </span>
        <span data-testid="lab-reveal-done" data-on={revealDone ? "true" : "false"} className="inline-block w-[5.5rem] whitespace-nowrap opacity-70 data-[on=false]:opacity-0">reveal done</span>
      </span>
    </div>
  );

  return (
    <div data-testid="combat-estimate-lab">
      <LabStageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </LabStageContext.Provider>
    </div>
  );
}
