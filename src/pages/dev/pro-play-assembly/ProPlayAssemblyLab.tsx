/**
 * PAV1 — the Pro Play Assembly playtest harness. DEVELOPMENT ONLY: registered
 * in App.tsx behind `import.meta.env.DEV`, so a production build drops it
 * and the path 404s.
 *
 * It is the HOST for the prototype. It builds a round from PA1's frozen
 * capture, keeps the answer map in a ref the primitive never receives, and
 * after Lock stands in for the server by grading in that closure and passing
 * only the resulting `PositionalAssemblyReveal` down.
 *
 * It mounts the primitive inside the REAL `CanonicalArena` by handing the
 * arena a lab-local `ModuleRenderer` whose Viewport draws the primitive
 * (Rangefinder's trick). No registry, transport or contract seam is touched.
 *
 *   /dev/pro-play-assembly?family=roster|draft
 *     &round=<id>                     (see labAuthority.labRounds)
 *     &size=10|15                     (tray size)
 *     &bench=0|1                      (Roster Lock: bench-tier distractors; default 1)
 *     &state=open|filled|locked|revealed-right|revealed-wrong
 *     &seed=<any>                     (token minting, tray pick, round order)
 *     &motion=reduce                  (force the reduced-motion path)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { PositionalAssembly } from "@/components/interaction-grammar/PositionalAssembly";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import type {
  InteractionPhase, PositionalAssemblyResponse, PositionalAssemblyReveal, PositionalAssemblyValue,
} from "@/lib/interaction-grammar/types";
import { emptyBoard } from "@/lib/interaction-grammar/positionalAssembly";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS, type CombatantView } from "@/lib/ranked-core/viewTypes";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import type { AssemblyFamily } from "@/lib/pro-play-assembly/capture";
import { arrangedBoard, buildLabRound, findRound, gradeLabRound, roundOrder, type LabRound, type LabSecret } from "./labAuthority";

const SERVER_LATENCY_MS = 420;
type Prearranged = "open" | "filled" | "locked" | "revealed-right" | "revealed-wrong";
const FAMILY_PARAM: Record<string, AssemblyFamily> = { roster: "roster_lock", draft: "draft_memory" };

interface LabStage {
  round: LabRound;
  generation: number;
  phase: InteractionPhase;
  value: PositionalAssemblyValue;
  reveal: PositionalAssemblyReveal | null;
  onChange: (next: Record<string, string | null>) => void;
  onLock: (response: PositionalAssemblyResponse) => void;
  onRevealComplete: () => void;
}
const LabStageContext = createContext<LabStage | null>(null);

function LabViewport() {
  const s = useContext(LabStageContext);
  const ref = useRef<HTMLDivElement>(null);
  const maxHeight = useStageRoom(ref);
  if (!s) return null;
  const lockLabel = s.round.secret.round.family === "roster_lock" ? "Lock lineup" : "Lock draft";
  return (
    <div ref={ref} data-testid="assembly-lab-viewport" className="flex min-h-0 flex-col">
      <PositionalAssembly key={`${s.round.id}:${s.generation}`}
        content={s.round.content} phase={s.phase} value={s.value} maxHeight={maxHeight} lockLabel={lockLabel}
        onChange={s.onChange} onLock={s.onLock} reveal={s.reveal} onRevealComplete={s.onRevealComplete} />
    </div>
  );
}

const LAB_RENDERER: ModuleRenderer = {
  moduleId: "pro-play-assembly-lab", moduleVersion: 1, servesVersion: () => true,
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

function labArenaView(phase: InteractionPhase, eyebrow: string): ArenaViewModel {
  const round = readPublicRound(publicRoundV2());
  return {
    header: {
      eyebrow, title: "Playtest", transitionNote: null, playtestNote: null, presenceNote: null,
      timer: { durationSeconds: 90, remainingSeconds: 75, paused: true, urgent: false }, timerLabel: "Timer",
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

const BTN = "whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110] data-[active]:text-[#f6e6bb]";

export default function ProPlayAssemblyLab() {
  const [params, setParams] = useSearchParams();
  const seed = params.get("seed") ?? "academy";
  const family: AssemblyFamily = FAMILY_PARAM[params.get("family") ?? "roster"] ?? "roster_lock";
  const size = params.get("size") === "15" ? 15 : 10;
  const bench = params.get("bench") !== "0";
  const order = useMemo(() => roundOrder(seed, family), [seed, family]);
  const requested = params.get("round");
  const record = (requested ? findRound(requested) : null) ?? order[0];
  const forceReduce = params.get("motion") === "reduce";
  const prearranged = (params.get("state") as Prearranged | null) ?? "open";

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  const [generation, setGeneration] = useState(0);
  const round = useMemo(() => buildLabRound(record, `${seed}:${generation}`, { size, bench }), [record, seed, generation, size, bench]);
  const secretRef = useRef<LabSecret | null>(null);
  secretRef.current = round.secret;

  const [value, setValue] = useState<PositionalAssemblyValue>(() => emptyBoard(round.content));
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [reveal, setReveal] = useState<PositionalAssemblyReveal | null>(null);
  const [lastResponse, setLastResponse] = useState<PositionalAssemblyResponse | null>(null);
  const [revealDone, setRevealDone] = useState(false);

  useEffect(() => {
    const { content, secret } = round;
    setReveal(null);
    setLastResponse(null);
    setRevealDone(false);
    if (prearranged === "open") { setValue(emptyBoard(content)); setPhase("open"); return; }
    const board = arrangedBoard(round, prearranged === "revealed-wrong" ? "wrong" : "right");
    setValue(board);
    if (prearranged === "filled") { setPhase("open"); return; }
    const response: PositionalAssemblyResponse = { assignment: board };
    setLastResponse(response);
    setPhase("locked");
    if (prearranged === "locked") return;
    const t = window.setTimeout(() => { setReveal(gradeLabRound(secret, response)); setPhase("revealed"); }, 300);
    return () => window.clearTimeout(t);
  }, [round, prearranged]);

  const onLock = useCallback((response: PositionalAssemblyResponse) => {
    setLastResponse(response);
    setPhase("locked");
    const secret = secretRef.current;
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
    const i = order.findIndex((r) => r.id === record.id);
    go({ round: order[(i + 1) % order.length].id, state: null });
  };

  const stage: LabStage = useMemo(() => ({
    round, generation, phase, value, reveal, onChange: setValue, onLock, onRevealComplete,
  }), [round, generation, phase, value, reveal, onLock, onRevealComplete]);
  const view = useMemo(() => labArenaView(phase, family === "roster_lock" ? "Roster Lock" : "Draft Memory"), [phase, family]);

  const chrome = (
    <div data-testid="assembly-lab-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <span className="ranked-eyebrow shrink-0">Pro Play Assembly · PAV1 lab</span>
      <span className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => go({ family: "roster", round: null, state: null })} data-active={family === "roster_lock" ? "" : undefined} data-testid="lab-family-roster" className={BTN}>Roster Lock</button>
        <button type="button" onClick={() => go({ family: "draft", round: null, state: null })} data-active={family === "draft_memory" ? "" : undefined} data-testid="lab-family-draft" className={BTN}>Draft Memory</button>
      </span>
      <span className="shrink-0 font-mono opacity-70" data-testid="lab-round">{record.id}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => go({ size: size === 10 ? "15" : "10", state: null })} data-testid="lab-size" className={BTN}>{size} cards</button>
        {family === "roster_lock" ? (
          <button type="button" onClick={() => go({ bench: bench ? "0" : "1", state: null })} data-active={bench ? "" : undefined} data-testid="lab-bench" className={BTN}>Bench tier</button>
        ) : null}
        {(["open", "filled", "locked", "revealed-right", "revealed-wrong"] as Prearranged[]).map((s) => (
          <button key={s} type="button" onClick={() => go({ state: s === "open" ? null : s })} data-active={prearranged === s ? "" : undefined} className={BTN}>{s}</button>
        ))}
        <button type="button" onClick={() => go({ motion: forceReduce ? null : "reduce" })} data-active={forceReduce ? "" : undefined} className={BTN}>Reduced motion</button>
        <button type="button" onClick={() => { setGeneration((g) => g + 1); go({ state: null }); }} className={BTN}>Reset</button>
        <button type="button" onClick={nextRound} data-testid="lab-next" className="whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-2 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14]">Next</button>
        {/* Reserved: these indicators toggle by opacity so the chrome row never reflows. */}
        <span data-testid="lab-response" data-on={lastResponse ? "true" : "false"} className="inline-block w-[5.5rem] overflow-hidden text-ellipsis whitespace-nowrap font-mono opacity-70 data-[on=false]:opacity-0">
          {lastResponse ? "locked" : "—"}
        </span>
        <span data-testid="lab-reveal-done" data-on={revealDone ? "true" : "false"} className="inline-block w-[5.5rem] whitespace-nowrap opacity-70 data-[on=false]:opacity-0">reveal done</span>
      </span>
    </div>
  );

  return (
    <div data-testid="pro-play-assembly-lab">
      <LabStageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </LabStageContext.Provider>
    </div>
  );
}
