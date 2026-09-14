/**
 * Time Trial's terminal screen — now the SHARED one.
 *
 * This used to be a whole end screen of its own: its own heading, its own
 * badge, its own score card, its own `<dl>` of figures, its own rewards box,
 * its own history list, its own `<details>` breakdown and its own button. None
 * of that was Time-Trial-specific except the values in it, so the layout is
 * gone and an ADAPTER is what is left: it reads the server's results into the
 * shared `GameResultsModel` and `GameResultsShell` renders it, exactly as it
 * renders Ranked's and the practice quiz's.
 *
 * Every number is still the server's. Accuracy remains the one derived value
 * and it is still derived from the authoritative counts alone.
 */

import { useEffect, useRef } from "react";
import { GameResultsShell } from "@/components/game-results/GameResultsShell";
import { buildMatchReport } from "@/components/game-results/matchReport";
import type {
  GameResultsModel, ResultProgressItem, ResultStat, ResultTimelineEntry,
} from "@/components/game-results/model";
import { DsaHistory, DsaResults, dsaChoiceLabel } from "./dailyScoreAttackTypes";

type Props = {
  results: DsaResults;
  history: DsaHistory | null;
  onPracticeAgain: () => void;
  practiceAllowed: boolean;
};

export function buildTimeTrialResults(
  results: DsaResults, history: DsaHistory | null,
): GameResultsModel {
  const accuracy = results.answered_count > 0
    ? Math.round((results.correct_count / results.answered_count) * 100)
    : null;

  const snapshot: ResultStat[] = [
    {
      key: "correct", label: "Correct",
      value: `${results.correct_count} / ${results.answered_count}`,
      hint: "answered",
      tone: accuracy !== null && accuracy >= 70 ? "good" : "plain",
    },
    {
      key: "accuracy", label: "Accuracy", testId: "dsa-accuracy",
      value: accuracy === null ? "—" : `${accuracy}%`,
    },
    { key: "combo", label: "Best combo", value: `×${results.highest_combo}` },
    { key: "seen", label: "Seen", value: `${results.presented_count} / 30` },
  ];

  const progress: ResultProgressItem[] = [];
  if (results.official) {
    progress.push({
      key: "bonus", label: "Daily completion bonus", icon: "xp",
      testId: "dsa-rewards",
      value: results.bonus_xp_awarded ? "+250 XP awarded" : "not awarded",
      delta: results.bonus_xp_awarded ? 250 : null,
      hint: results.participated
        ? undefined
        : "No answers were submitted, so this run earned no bonus XP or streak credit.",
    });
    progress.push({
      key: "streak", label: "Daily streak", icon: "streak",
      value: history ? `${history.daily_streak}` : results.streak_awarded ? "Advanced" : "Unchanged",
      hint: results.streak_awarded ? "Advanced by this run." : "Unchanged by this run.",
    });
    if (history?.personal_best) {
      progress.push({
        key: "best", label: "Personal best", icon: "rating", testId: "dsa-history",
        value: history.personal_best.score.toLocaleString(),
        hint: history.personal_best.challenge_date,
      });
    }
  }

  // The breakdown IS the timeline: one entry per presented question, with the
  // subject it asked about and what it awarded. It was a collapsed `<details>`
  // list before, which is where a study product hides its own payload.
  const timeline: ResultTimelineEntry[] = results.breakdown.map((item) => ({
    index: item.sequence,
    label: item.category ?? "Question",
    outcome: item.resolution_reason === "run_expired"
      ? "unanswered" : item.is_correct ? "correct" : "incorrect",
    points: item.is_correct ? item.awarded_score : 0,
    detail: item.question_text,
    detailHint: `Answer: ${dsaChoiceLabel(item.choices[item.correct_index])}`,
  }));

  return {
    state: "complete",
    mode: "Time Trial",
    standing: results.official ? "official" : "practice",
    standingTestId: "dsa-results-badge",
    headline: results.official ? "Time Trial complete" : "Practice run complete",
    subheading: results.completion_reason === "pool_exhausted"
      ? "All 30 questions cleared" : "Time expired",
    score: {
      you: results.total_score, label: "Final score", testId: "dsa-final-score",
    },
    snapshot,
    progress,
    report: buildMatchReport({
      entries: timeline,
      timeoutCount: timeline.filter((e) => e.outcome === "unanswered").length,
    }),
    timeline: timeline.length > 0 ? { unitLabel: "Questions", entries: timeline } : null,
  };
}

export default function DailyScoreAttackResults({
  results,
  history,
  onPracticeAgain,
  practiceAllowed,
}: Props) {
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const model = buildTimeTrialResults(results, history);
  if (practiceAllowed) {
    model.actions = {
      primary: {
        label: results.official ? "Try a practice run" : "Practice again",
        onClick: onPracticeAgain,
      },
      secondary: {
        label: "Review Questions",
        onClick: () => { window.location.assign("/quiz#review"); },
      },
      tertiary: {
        label: "Back to Leaguecraft",
        onClick: () => { window.location.assign("/quiz"); },
      },
    };
  } else {
    // A run with no practice left still needs a way onward; it just has no
    // "again". The remaining two keep their weights rather than promoting the
    // exit into a primary.
    model.actions = {
      secondary: {
        label: "Review Questions",
        onClick: () => { window.location.assign("/quiz#review"); },
      },
      tertiary: {
        label: "Back to Leaguecraft",
        onClick: () => { window.location.assign("/quiz"); },
      },
    };
  }

  if (!results.official) {
    model.progress = [{
      key: "practice", label: "Practice run", icon: "unrated",
      testId: "dsa-practice-note", value: "Unscored",
      hint: "No XP, no Daily streak, and no official record or personal best.",
    }];
  }

  return (
    <div ref={headingRef} tabIndex={-1} className="w-full px-3 outline-none">
      <GameResultsShell model={model} />
    </div>
  );
}
