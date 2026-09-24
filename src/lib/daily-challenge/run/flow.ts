/**
 * DCMOD-E — THE DAILY CHALLENGE PRESENTATION FLOW.
 *
 * One Daily Challenge, experienced as one thing:
 *
 *   Daily intro ─► stage intro (tag) ─► canonical gameplay ─► stage result
 *              ─► next stage intro ─► … ─► REVIEW ─► ONE final completion
 *
 * AUTHORITY vs PRESENTATION — the same split RFX1 draws for Ranked. The run
 * snapshot is the authority: which stage is current, whether it has a child
 * match, whether the day is over. Everything here is a pure projection of that
 * snapshot plus a few PRESENTATION latches the controller holds — "this mount
 * is playing the Daily intro", "this stage's tag is still up", "this stage's
 * result is on screen" — none of which is a game fact, and none of which
 * survives a refresh. That is the replay rule: a refresh reads the server and
 * lands on the right stage, and replays no beat it did not watch begin.
 *
 * WHAT IS DELIBERATELY ABSENT: a Victory/Defeat outro after each stage. A
 * child match is handed back through the arena's `MatchHost` seam at the
 * instant its outro would have started.
 *
 * DC-LANE-C — the stage result reuses Ranked's end-screen language (hero,
 * snapshot, one primary action), and the player leaves it with CONTINUE, not
 * a timer. It is still a step inside the Daily: no result word, no lobby, no
 * queue. Continue only exists once the parent has advanced past the stage,
 * so it can never move the day ahead of the server. Only the parent
 * completion is a full closing state.
 */
import { ENTRY_INTRO_MIN_MS } from "@/lib/ranked-core/pacing";
import type { DailyRun, DailyStage } from "./contracts";
import { currentStage } from "./contracts";

/**
 * Pacing, borrowed from Ranked rather than invented, so the Daily and Ranked
 * keep one cadence:
 *   * the Daily intro is a MAJOR beat — Ranked's entry-intro floor plus the
 *     locked preview's worth, so the lineup can actually be read;
 *   * a stage tag holds for Ranked's entry-intro floor (and longer if the
 *     child match is still being created — it never cuts to an empty arena);
 *   * a stage result holds until the player presses Continue (DC-LANE-C).
 */
export const DAILY_INTRO_MS = ENTRY_INTRO_MIN_MS + 1000;
export const STAGE_INTRO_MIN_MS = ENTRY_INTRO_MIN_MS;

export type DailyFlowPhase =
  | "daily-intro"
  | "stage-intro"
  | "stage-play"
  /** The child handed back; the parent is syncing. Drawn as a pending result. */
  | "stage-settling"
  | "stage-result"
  | "complete";

export interface DailyFlowLatches {
  /** This mount is playing the Daily intro. */
  dailyIntroUp: boolean;
  /** The stage id whose tag is still up (its minimum has not elapsed). */
  stageIntroFor: string | null;
  /** The child match this mount has seen handed back, awaiting the parent. */
  settledChild: string | null;
  /** The completed stage whose result interstitial is on screen. */
  resultFor: string | null;
  /**
   * DC-SURV-UX — the child whose PLAYER is done (Survival's third strike)
   * though the match itself may still be settling. Presentation only: it
   * moves the page to the settling beat, and the parent still advances only
   * when the server says so.
   */
  finishedChild?: string | null;
}

export const NO_LATCHES: DailyFlowLatches = {
  dailyIntroUp: false, stageIntroFor: null, settledChild: null, resultFor: null,
  finishedChild: null,
};

export interface DailyFlowView {
  phase: DailyFlowPhase;
  /** The stage the phase is about: the one introduced, played, or just finished. */
  stage: DailyStage | null;
  /** The child match to mount, only in `stage-play`. */
  childMatchId: string | null;
  /**
   * DC-SURV-UX — in `stage-settling` only: a child whose player is done but
   * whose match has not handed back yet. The page keeps it connected, out of
   * sight, so the server can settle it; nothing of it is presented.
   */
  settlingChildMatchId?: string | null;
}

export function projectDailyFlow(run: DailyRun, latches: DailyFlowLatches): DailyFlowView {
  if (latches.dailyIntroUp) return { phase: "daily-intro", stage: currentStage(run), childMatchId: null };

  // A just-finished stage's result is shown before anything that follows it —
  // including the final completion, when that stage was the last one played.
  if (latches.resultFor) {
    const done = run.stages.find((s) => s.id === latches.resultFor) ?? null;
    if (done) return { phase: "stage-result", stage: done, childMatchId: null };
  }

  if (run.status === "completed") return { phase: "complete", stage: null, childMatchId: null };

  const stage = currentStage(run);
  if (!stage) return { phase: "complete", stage: null, childMatchId: null };

  // The child has been handed back and the parent has not advanced past it yet.
  if (latches.settledChild && stage.childMatchId === latches.settledChild) {
    return { phase: "stage-settling", stage, childMatchId: null };
  }
  if ((latches.finishedChild && stage.childMatchId === latches.finishedChild)
    || survivalStageFinished(stage)) {
    return { phase: "stage-settling", stage, childMatchId: null, settlingChildMatchId: stage.childMatchId };
  }

  const playable = stage.status === "in_progress" && stage.childMatchId !== null;
  if (!playable || latches.stageIntroFor === stage.id) {
    return { phase: "stage-intro", stage, childMatchId: null };
  }
  return { phase: "stage-play", stage, childMatchId: stage.childMatchId };
}

/**
 * DC-LANE-C — the Daily's own live read says the player's Survival stage is
 * over (`live.own_stage_finished`), though the child is still settling. The
 * same presentation move as the arena's `onPlayerFinished`, from the other
 * authority — whichever arrives first takes the player out of gameplay.
 * Survival only: a drained Time Trial bank ends on the question's deadline.
 */
export function survivalStageFinished(stage: DailyStage): boolean {
  return stage.ruleset?.id === "survival" && stage.status === "in_progress"
    && stage.childMatchId !== null && stage.live?.ownStageFinished === true;
}

/**
 * Which stage completed between two snapshots, if the parent advanced. Only a
 * transition this mount WATCHED earns a result interstitial.
 */
export function stageCompletedBetween(prev: DailyRun | null, next: DailyRun): DailyStage | null {
  if (!prev) return null;
  const before = currentStage(prev);
  if (!before) return null;
  const after = next.stages[before.index];
  if (!after || (after.status !== "completed" && after.status !== "skipped")) return null;
  return after;
}
