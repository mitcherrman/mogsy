/**
 * PERFECT TIMING — the arena view: what the REAL `CanonicalArena` is handed.
 *
 * Copies the Numeric Lab's production pattern (`CombatEstimateArena`): a
 * lab-local `ModuleRenderer` whose Viewport draws the stage, an inert frozen
 * public round the stage never reads, and a projected header, flanks and
 * round rail. No registry, transport or contract seam is touched;
 * `CanonicalArena` is not modified.
 *
 * NO CLOCK IN THE HEADER. The arena's centre display is a timer or a result;
 * this mode supplies neither, so the header's centre reads a one-word note —
 * and that note is blanked while the player is timing, because the arena
 * pulses it, and a rhythm is a metronome the player could count against. The
 * timeline rail under the stage shows the run's rounds and settled outcomes;
 * nothing on it moves on a period.
 */
import type { PtStageModel } from "@/lib/perfect-timing/viewModel";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import { ArchiveFlank, LabViewport, RunFlank } from "./arenaParts";

/** A lab-local renderer: the arena mounts its Viewport in the question stage like any module's. */
const LAB_RENDERER: ModuleRenderer = {
  moduleId: "perfect-timing-lab", moduleVersion: 1, servesVersion: () => true,
  ownsSubmission: true, ownsResultReveal: () => true,
  Viewport: LabViewport,
  projectQuestion: () => null,
  summaryLabel: () => null,
};

/**
 * The arena requires a `publicRound` for the surface; the stage never reads
 * it. An inert placeholder (the Numeric Lab's pattern): no question, no
 * segment state, no players, no fixture pulled into the chunk.
 */
const STAGE_PUBLIC_ROUND = Object.freeze({
  schemaVersion: "perfect_timing_lab.v1", serverTime: "1970-01-01T00:00:00Z", matchId: "perfect-timing-lab",
  matchStatus: "lab", matchOver: false, winnerId: null, completionReason: null,
  completedRounds: 0, players: [], activeRound: null, nextRoundDurationSeconds: 0,
  question: null, segment: { moduleId: "perfect_timing_lab", moduleVersion: 1 },
  segmentState: null, scoring: null, presence: null,
}) as unknown as PublicRoundView;

export interface PerfectTimingArenaHeader {
  eyebrow?: string;
  playtestNote?: string | null;
}

/**
 * The production arena's input, with the lab's renderer in the surface. The
 * round payload is an inert placeholder; the Viewport ignores it.
 */
export function perfectTimingArenaView(model: PtStageModel, header: PerfectTimingArenaHeader = {}): ArenaViewModel {
  const round = STAGE_PUBLIC_ROUND;
  const total = model.round?.total ?? model.hud?.outcomes.length ?? 1;
  const current = model.round?.index ?? null;
  const running = model.phase === "running";
  const left: ArenaRail = { kind: "panel", node: <RunFlank model={model} /> };
  const right: ArenaRail = { kind: "panel", node: <ArchiveFlank hud={model.hud ?? null} /> };
  const title = model.phase === "complete" ? "Run complete"
    : model.round ? `Round ${model.round.index} of ${model.round.total}` : "Dealing…";
  return {
    header: {
      eyebrow: header.eyebrow ?? "Perfect Timing · owner lab",
      title,
      // The arena pulses this note; it is blanked while timing (see the module note).
      transitionNote: running ? null : "Hidden clock",
      playtestNote: header.playtestNote ?? "Prototype",
      presenceNote: null,
      timer: null,
      timerLabel: "",
      centralResult: null, moduleTitle: null, moduleEventId: null,
    },
    roundBeat: null, segmentBeat: null, cardBeat: null,
    left, right,
    surface: {
      renderer: LAB_RENDERER,
      publicRound: round, segmentState: round.segmentState ?? null, selection: null,
      permissions: NO_INTERACTIONS,
      actions: { submitChallenge: () => {}, busy: false, error: null },
      skewMs: 0, reveal: null, onSelect: () => {}, ownsSubmission: true,
      inputOpen: model.phase === "armed" || model.phase === "running", hasContent: true,
    },
    abilityHud: null, status: null, hudAction: null,
    timeline: {
      visibleNodes: total, anchorIndex: 0, windowStart: 0,
      currentIndex: current === null ? null : current - 1, currentRoundNumber: current, anchored: true,
      nodes: Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const outcome = model.hud?.outcomes[i] ?? null;
        const settled = outcome !== null;
        return {
          roundNumber: n, index: i, visible: true,
          state: current !== null && n === current && model.phase !== "complete" ? "current" : settled || (current !== null && n < current) ? "resolved" : "upcoming",
          segmentKind: null,
          outcome: outcome === null || outcome === "voided" ? null : outcome === "miss" ? "incorrect" : "correct",
          tag: null, topic: null,
        };
      }),
    },
    revealHold: false, progressionEnabled: false,
  } as ArenaViewModel;
}
