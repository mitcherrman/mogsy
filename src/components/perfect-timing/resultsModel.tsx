/**
 * PERFECT TIMING — the results ADAPTER: a run summary into the shared
 * `GameResultsModel`, so the end screen is the one every other mode ends on.
 *
 * THE ONE SUM. The score is the sum of the reveals' points. Nothing else is
 * computed from a duration the server did not already state. The data line
 * prints the patch label WITH its source, never a bare patch.
 */
import type { GameResultsModel, ResultStat, ResultTimelineEntry } from "@/components/game-results/model";
import type { PtRunSummary } from "@/lib/perfect-timing/viewModel";
import {
  TIER_WORD, dataLabelText, formatMs, formatSeconds, rankText, roundLabel, runStats, signedErrorText, tierIsHit,
} from "./presentation";
import { RunLadder } from "./RunLadder";

export interface PerfectTimingResultsActions {
  onPlayAgain: () => void;
  /** An optional quiet exit ("Back to the lab"). */
  onExit?: (() => void) | null;
}

export function buildPerfectTimingResultsModel(summary: PtRunSummary, actions: PerfectTimingResultsActions): GameResultsModel {
  const stats = runStats(summary);
  const snapshot: ResultStat[] = [
    { key: "rounds", label: "Rounds", value: `${stats.played} / ${stats.dealt}`, hint: stats.voided ? `${stats.voided} voided` : "all played" },
    { key: "hits", label: "Landed", value: String(stats.hits), hint: `${stats.perfect} perfect`, tone: stats.hits === stats.played && stats.played > 0 ? "good" : "plain" },
  ];
  if (stats.meanAbsErrorMs !== null) {
    snapshot.push({ key: "mean-error", label: "Mean error", value: formatMs(stats.meanAbsErrorMs), hint: "absolute" });
  }
  if (stats.bestAbsErrorMs !== null) {
    snapshot.push({ key: "best", label: "Closest", value: formatMs(stats.bestAbsErrorMs), tone: stats.bestAbsErrorMs <= 100 ? "good" : "plain" });
  }
  const entries: ResultTimelineEntry[] = summary.rounds.map(({ round, reveal }) => ({
    index: round.index,
    label: roundLabel(round),
    outcome: reveal ? (tierIsHit(reveal.tier) ? "correct" : "incorrect") : "unanswered",
    points: reveal ? reveal.points : null,
    detail: reveal
      ? `Stopped at ${formatSeconds(reveal.elapsedMs)} against a true cooldown of ${formatSeconds(reveal.targetMs)} — ${signedErrorText(reveal.errorMs).toLowerCase()}. ${TIER_WORD[reveal.tier]}.`
      : "Voided — the run was interrupted or the round expired before it was locked.",
    detailHint: reveal ? `${rankText(reveal.rank, round.rankCount)} · cooldown ${reveal.cooldownRaw} s` : rankText(round.rank, round.rankCount),
  }));

  return {
    state: "complete",
    mode: "Perfect Timing",
    standing: "practice",
    headline: "Run complete",
    subheading: dataLabelText(summary.patchLabel, summary.patchSource),
    score: { you: stats.totalPoints, outOf: stats.maxPoints, label: "Points", testId: "pt-total-points" },
    snapshot,
    timeline: { unitLabel: "Rounds", entries },
    review: <RunLadder summary={summary} />,
    actions: {
      primary: { label: "Play again", onClick: actions.onPlayAgain, testId: "pt-play-again" },
      ...(actions.onExit ? { tertiary: { label: "Back to the lab", onClick: actions.onExit, testId: "pt-exit" } } : {}),
    },
  };
}
