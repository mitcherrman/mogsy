/**
 * GM-R1 — the Rangefinder playtest harness. DEVELOPMENT ONLY: registered in
 * App.tsx behind `import.meta.env.DEV`, so a production build drops it and the
 * path 404s.
 *
 * It is the HOST for the prototype. It builds a round from the frozen
 * authority capture, keeps the canonical stop in a ref the primitive never
 * receives, and after Lock stands in for the server by grading in that
 * closure and passing only the resulting `RangefinderReveal` down.
 *
 * It mounts the primitive inside the REAL `CanonicalArena` — the production
 * shell, header plate, 23/54/23 grid and `ranked-question-stage` folio — by
 * handing the arena a lab-local `ModuleRenderer` whose Viewport draws the
 * primitive. No registry, transport or contract seam is touched: the arena's
 * view model already carries the renderer as a field. So the prototype lives
 * in the exact pixel budget a Ranked module gets, from day one.
 *
 *   /dev/rangefinder?round=janna-w
 *     &state=open|placed|locked|revealed-right|revealed-wrong   (pre-arranged states for capture)
 *     &seed=<any>                                               (token minting + pool order)
 *     &motion=reduce                                            (force the reduced-motion path)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import { useSearchParams } from "react-router-dom";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { Rangefinder } from "@/components/interaction-grammar/Rangefinder";
import type { InteractionPhase, RangefinderResponse, RangefinderReveal, RangefinderValue } from "@/lib/interaction-grammar/types";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS, type CombatantView } from "@/lib/ranked-core/viewTypes";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { buildLabRound, findRecord, gradeLabRound, roundId, roundOrder, type LabRound, type LabSecret } from "./labAuthority";

const SERVER_LATENCY_MS = 420;
type Prearranged = "open" | "placed" | "locked" | "revealed-right" | "revealed-wrong";

/** What the lab's viewport draws. The arena never sees it; the renderer's Viewport reads it. */
interface LabStage {
  round: LabRound;
  generation: number;
  phase: InteractionPhase;
  value: RangefinderValue;
  reveal: RangefinderReveal | null;
  onChange: (token: string) => void;
  onLock: (response: RangefinderResponse) => void;
  onRevealComplete: () => void;
}
const LabStageContext = createContext<LabStage | null>(null);

function LabViewport() {
  const s = useContext(LabStageContext);
  const ref = useRef<HTMLDivElement>(null);
  // The host measures the stage and hands the primitive a definite height, as a Ranked module does.
  const maxHeight = useStageRoom(ref);
  if (!s) return null;
  return (
    <div ref={ref} data-testid="rangefinder-lab-viewport" className="flex min-h-0 flex-col">
      <Rangefinder key={`${s.round.id}:${s.generation}`}
        content={s.round.content} phase={s.phase} value={s.value} maxHeight={maxHeight}
        onChange={s.onChange} onLock={s.onLock} reveal={s.reveal} onRevealComplete={s.onRevealComplete} />
    </div>
  );
}

/** A lab-local renderer: the arena mounts its Viewport in the question stage like any module's. */
const LAB_RENDERER: ModuleRenderer = {
  moduleId: "rangefinder-lab", moduleVersion: 1, servesVersion: () => true,
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
function labArenaView(phase: InteractionPhase): ArenaViewModel {
  const round = readPublicRound(publicRoundV2());
  return {
    header: {
      eyebrow: "Rangefinder", title: "Playtest", transitionNote: null, playtestNote: null, presenceNote: null,
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

export default function RangefinderLab() {
  const [params, setParams] = useSearchParams();
  const seed = params.get("seed") ?? "academy";
  const order = useMemo(() => roundOrder(seed), [seed]);
  const requested = params.get("round");
  const record = (requested ? findRecord(requested) : null) ?? order[0];
  const forceReduce = params.get("motion") === "reduce";
  const prearranged = (params.get("state") as Prearranged | null) ?? "open";

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  // ---- the round. The secret lives in a ref; the primitive gets only `content`.
  const [generation, setGeneration] = useState(0);
  const round = useMemo(() => buildLabRound(record, `${seed}:${generation}`), [record, seed, generation]);
  const secretRef = useRef<LabSecret | null>(null);
  secretRef.current = round.secret;

  const [value, setValue] = useState<RangefinderValue>(null);
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [reveal, setReveal] = useState<RangefinderReveal | null>(null);
  const [lastResponse, setLastResponse] = useState<RangefinderResponse | null>(null);
  const [revealDone, setRevealDone] = useState(false);

  // Reset on a new round, and apply a pre-arranged state when asked.
  useEffect(() => {
    const { content, secret } = round;
    setReveal(null);
    setLastResponse(null);
    setRevealDone(false);
    if (prearranged === "open") { setValue(null); setPhase("open"); return; }
    // A deterministic placement: the truth, or the truth two stops long (wrong).
    const stops = content.field.stops;
    const canonI = stops.findIndex((s) => s.token === secret.canonicalToken);
    const token = prearranged === "revealed-wrong" ? stops[Math.min(stops.length - 1, canonI + 2)].token : stops[canonI].token;
    setValue(token);
    if (prearranged === "placed") { setPhase("open"); return; }
    const response: RangefinderResponse = { stop: token };
    setLastResponse(response);
    setPhase("locked");
    if (prearranged === "locked") return;
    const t = window.setTimeout(() => { setReveal(gradeLabRound(secret, response)); setPhase("revealed"); }, 300);
    return () => window.clearTimeout(t);
  }, [round, prearranged]);

  const onLock = useCallback((response: RangefinderResponse) => {
    setLastResponse(response);
    setPhase("locked");
    const secret = secretRef.current;
    // Stand-in for the server round trip: grade in the host's closure, hand down only the reveal.
    window.setTimeout(() => {
      if (!secret) return;
      setReveal(gradeLabRound(secret, response));
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
    const i = order.findIndex((r) => roundId(r) === roundId(record));
    go({ round: roundId(order[(i + 1) % order.length]), state: null });
  };

  const stage: LabStage = useMemo(() => ({
    round, generation, phase, value, reveal, onChange: setValue, onLock, onRevealComplete,
  }), [round, generation, phase, value, reveal, onLock, onRevealComplete]);
  const view = useMemo(() => labArenaView(phase), [phase]);

  const chrome = (
    // `arenaHeaderRowClass` insets the row clear of the GlobalHud's fixed chips (the hat and the identity cluster),
    // which otherwise sit over the row's ends and swallow clicks.
    <div data-testid="rangefinder-lab-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <span className="ranked-eyebrow shrink-0">Rangefinder · R1 lab</span>
      <span className="shrink-0 font-mono opacity-70" data-testid="lab-round">{roundId(record)}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {(["open", "placed", "locked", "revealed-right", "revealed-wrong"] as Prearranged[]).map((s) => (
          <button key={s} type="button" onClick={() => go({ state: s === "open" ? null : s })} data-active={prearranged === s ? "" : undefined}
            className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110] data-[active]:text-[#f6e6bb]">
            {s}
          </button>
        ))}
        <button type="button" onClick={() => go({ motion: forceReduce ? null : "reduce" })} data-active={forceReduce ? "" : undefined}
          className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110]">Reduced motion</button>
        <button type="button" onClick={() => { setGeneration((g) => g + 1); go({ state: null }); }} className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Reset</button>
        <button type="button" onClick={nextRound} data-testid="lab-next" className="whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-2 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14]">Next</button>
        {/* Reserved: these indicators toggle by opacity so the chrome row never reflows (a 15px wrap moved the whole arena at 1280px). */}
        <span data-testid="lab-response" data-on={lastResponse ? "true" : "false"} className="inline-block w-[7.5rem] overflow-hidden text-ellipsis whitespace-nowrap font-mono opacity-70 data-[on=false]:opacity-0">
          {lastResponse?.stop ?? "—"}
        </span>
        <span data-testid="lab-reveal-done" data-on={revealDone ? "true" : "false"} className="inline-block w-[5.5rem] whitespace-nowrap opacity-70 data-[on=false]:opacity-0">reveal done</span>
      </span>
    </div>
  );

  return (
    <div data-testid="rangefinder-lab">
      <LabStageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </LabStageContext.Provider>
    </div>
  );
}
