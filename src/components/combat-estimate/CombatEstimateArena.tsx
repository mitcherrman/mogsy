/**
 * NUM-REC2 — CE1's arena host, extracted verbatim from
 * `pages/dev/combat-estimate/CombatEstimateLab.tsx` so the DEV lab and the
 * owner lab mount the stage in the same REAL `CanonicalArena` the same way.
 * It holds no capture and no answer: a host hands it a public round and,
 * after Lock, a grade.
 *
 * It mounts the stage inside the production shell by handing the arena a
 * lab-local `ModuleRenderer` whose Viewport draws the stage (Rangefinder's
 * trick). No registry, transport or contract seam is touched.
 */
import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { CombatEstimateStage } from "@/components/combat-estimate/CombatEstimateStage";
import type { CombatEstimateScenario } from "@/lib/combat-estimate/contract";
import type { RoundGrade } from "@/lib/combat-estimate/rounds";
import type { EstimatePublic, EstimateResponse, EstimateReveal, EstimateValue } from "@/lib/interaction-grammar/types";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS, type CombatantView } from "@/lib/ranked-core/viewTypes";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";

export type Phase = "open" | "locked" | "revealed";

/** The public half of a round: everything the stage may draw before Lock. */
export interface StageRound {
  id: string;
  content: EstimatePublic;
  scenario: CombatEstimateScenario;
}

/** What the lab's viewport draws. The arena never sees it; the renderer's Viewport reads it. */
export interface LabStage {
  round: StageRound;
  generation: number;
  phase: Phase;
  value: EstimateValue;
  reveal: EstimateReveal | null;
  grade: RoundGrade | null;
  onChange: (value: number) => void;
  onLock: (response: EstimateResponse) => void;
  onRevealComplete: () => void;
}
const LabStageContext = createContext<LabStage | null>(null);

/** How the viewport learns the room it may spend: a hook of the stage's element. Fixed for a host's lifetime. */
export type StageRoomHook = (ref: RefObject<HTMLElement | null>) => number | undefined;
const StageRoomContext = createContext<StageRoomHook>(useStageRoom);

function LabViewport() {
  const s = useContext(LabStageContext);
  const useRoom = useContext(StageRoomContext);
  const ref = useRef<HTMLDivElement>(null);
  // The host measures the stage and hands the primitive a definite height, as a Ranked module does.
  const stageHeight = useRoom(ref);
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

/**
 * The arena requires a `publicRound` for the surface; the stage never reads
 * it. NUM-REC2: CE1 filled it from `ranked-public/fixtures` (`publicRoundV2`),
 * which pulls a Ranked probe JSON into whatever chunk loads this host — so
 * the owner lab would have shipped a fixture. This is an inert placeholder
 * instead (MIG1's `LAB_PUBLIC_ROUND` pattern): no question, no segment state,
 * no players.
 */
const STAGE_PUBLIC_ROUND = Object.freeze({
  schemaVersion: "combat_estimate_lab.v1", serverTime: "1970-01-01T00:00:00Z", matchId: "combat-estimate-lab",
  matchStatus: "lab", matchOver: false, winnerId: null, completionReason: null,
  completedRounds: 0, players: [], activeRound: null, nextRoundDurationSeconds: 0,
  question: null, segment: { moduleId: "combat_estimate_lab", moduleVersion: 1 },
  segmentState: null, scoring: null, presence: null,
}) as unknown as PublicRoundView;

/** The production arena's input, with the lab's renderer in the surface. The round payload is an ordinary fixture; the Viewport ignores it. */
export function labArenaView(phase: Phase, header: { eyebrow: string; title: string; playtestNote?: string | null } = { eyebrow: "Combat Estimate", title: "Playtest" }): ArenaViewModel {
  const round = STAGE_PUBLIC_ROUND;
  return {
    header: {
      eyebrow: header.eyebrow, title: header.title, transitionNote: null, playtestNote: header.playtestNote ?? null, presenceNote: null,
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

/**
 * The arena with the stage in it. `chrome` is the host's control row.
 *
 * `useRoom` defaults to measuring the arena's stage, which is right for the
 * duel-banner arena the labs draw: there the phone stage grows into the
 * screen. A host whose flanks are PANELS (the public game) stacks below `lg`
 * and its stage is content-sized, so measuring it is circular — each reading
 * caps the stage 2px under itself and it shrinks away. Such a host passes a
 * room that does not read the stage on a phone (`useOwnerStageRoom`).
 */
export function CombatEstimateArena({ stage, view, chrome, useRoom = useStageRoom }: {
  stage: LabStage; view: ArenaViewModel; chrome: ReactNode; useRoom?: StageRoomHook;
}) {
  return (
    <StageRoomContext.Provider value={useRoom}>
      <LabStageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </LabStageContext.Provider>
    </StageRoomContext.Provider>
  );
}
