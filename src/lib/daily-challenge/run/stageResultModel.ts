/**
 * DC-LANE-C — A DAILY STAGE'S RESULT, in the shared result vocabulary.
 *
 * The Daily stage result speaks Ranked's end-screen language — the same hero,
 * the same snapshot grid, the same action weights — by filling the SAME
 * `GameResultsModel` every other mode fills. It is still a step inside one
 * challenge, not the end of a match, so it:
 *
 *   * is always `state: "complete"` — never Victory, Defeat or Draw;
 *   * names the stage (`Stage 2 of 4`), never a queue, a rating or a lobby;
 *   * has no actions here — Continue belongs to the page, which owns the flow.
 *
 * Numbers are the parent's settled stage result, never recomputed. A figure
 * the server did not state is left out, not zeroed.
 */
import type { GameResultsModel, ResultStat } from "@/components/game-results/model";
import type { DailyRun, DailyStage, DailyStageEnd } from "./contracts";
import { stageContentLine } from "./stageIdentity";

export const DAILY_STAGE_ENDED_BY: Record<DailyStageEnd, string | null> = {
  completed: null,
  time_bank_exhausted: "The bank ran out",
  strikes_exhausted: "Out of mistakes",
};

/** The stage's place in the day, for the hero's eyebrow. */
export function stagePositionLabel(run: DailyRun, stage: DailyStage): string {
  return stage.kind === "review" ? "Final stage" : `Stage ${stage.index + 1} of ${run.stages.length}`;
}

function headlineFor(stage: DailyStage): string {
  const ended = stage.result?.endedBy ?? "completed";
  switch (stage.kind) {
    case "time_trial":
      return ended === "time_bank_exhausted" ? "Time's up" : "Stage complete";
    case "survival":
      return ended === "strikes_exhausted" ? "Out of strikes" : "Survived";
    case "review":
      return "Review complete";
    default:
      return "Stage complete";
  }
}

/**
 * The model for a stage's result screen. `stage.result === null` is the
 * pending (still-scoring) state: the hero is up, with no numbers yet.
 */
export function buildDailyStageResult(run: DailyRun, stage: DailyStage): GameResultsModel {
  const r = stage.result;
  const mode = `Daily Challenge · ${stagePositionLabel(run, stage)}`;
  const content = stageContentLine(stage);
  if (!r) {
    // A Review has one headline whatever its result, so the pending hero states
    // it now: on a phone it wraps to two lines, and a one-line "Stage over" that
    // became two lines when the score landed moved everything under it (DRS1).
    // Every other kind's headline depends on how the stage ended, which a
    // pending stage has not been told, so it stays the neutral one-liner.
    return { state: "complete", mode, headline: stage.kind === "review" ? "Review complete" : "Stage over",
      subheading: content };
  }

  // Survival has no length a player is meant to reach: no denominator.
  const survival = stage.kind === "survival";
  const snapshot: ResultStat[] = [
    { key: "answered", label: "Answered", value: String(r.answered) },
  ];
  if (r.answered > 0) {
    snapshot.push({ key: "accuracy", label: "Accuracy",
      value: `${Math.round((100 * r.correct) / r.answered)}%` });
  }
  if (r.score !== null) {
    snapshot.push({ key: "points", label: "Points", value: r.score.toLocaleString() });
  }
  const ended = DAILY_STAGE_ENDED_BY[r.endedBy];
  if (ended) {
    snapshot.push({ key: "ended", label: "Finish", value: ended, tone: "bad",
      testId: "daily-stage-result-ended" });
  }
  // DV2-P0: the stage's own miss count, said as a fact about THIS stage. It is
  // not "saved for Review": Recently Missed asks a share of the day's misses
  // (deduped across stages), not every one of them.
  if (stage.kind !== "review" && r.misses > 0) {
    snapshot.push({ key: "misses", label: "Missed", value: String(r.misses),
      hint: r.misses === 1 ? "question" : "questions",
      testId: "daily-stage-result-misses" });
  }

  return {
    state: "complete",
    mode,
    headline: headlineFor(stage),
    subheading: content,
    score: {
      you: r.correct,
      outOf: survival ? null : r.answered,
      label: "correct",
      testId: "daily-stage-result-correct",
    },
    snapshot,
  };
}
