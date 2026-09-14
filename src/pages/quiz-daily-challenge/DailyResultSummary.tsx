/**
 * THE FINISHED DAY'S NUMBERS (DC1 Phase 5, ARENA1 Step 5) — through the
 * shared result model.
 *
 * It began as a whole result SCREEN with its own frame, heading and back link;
 * ARENA1 reduced it to the part that was genuinely the Daily's and mounted it
 * in `MatchOverFrame`'s summary slot. This finishes that move: the grade is
 * still the Daily's own and is still drawn here, and everything around it —
 * the figures, the rewards, Mogzy's report, the actions — is now the same
 * `GameResultsBody` Ranked and Time Trial render.
 *
 * The question it answers is unchanged: HOW WELL DID I DO TODAY, never "you
 * got them all right eventually", which is true of every completed run by
 * design. So the grade and the first-attempt figures lead.
 *
 * Every number is READ from the backend's `result` and `summary`. Nothing is
 * recomputed — a grade the player was shown this morning must not move because
 * a threshold was retuned this afternoon.
 */

import { Zap } from "lucide-react";
import { GameResultsBody } from "@/components/game-results/GameResultsBody";
import { buildMatchReport } from "@/components/game-results/matchReport";
import type {
  GameResultsModel, ResultProgressItem, ResultStat,
} from "@/components/game-results/model";
import type { DcResult, DcSummary } from "@/lib/daily-challenge/contracts";

const GRADE_TONE: Record<string, string> = {
  S: "from-amber-300 to-amber-500 text-amber-950",
  A: "from-emerald-300 to-emerald-500 text-emerald-950",
  B: "from-sky-300 to-sky-500 text-sky-950",
  C: "from-slate-300 to-slate-400 text-slate-900",
  D: "from-stone-400 to-stone-500 text-stone-900",
};

export function buildDailyResults(
  result: DcResult, summary: DcSummary, score: number, maxScore: number,
): GameResultsModel {
  const accuracy = summary.firstAttemptAccuracyBp === null
    ? "—" : `${(summary.firstAttemptAccuracyBp / 100).toFixed(0)}%`;

  const snapshot: ResultStat[] = [
    {
      key: "first-try", label: "First try", testId: "dc-result-first-try",
      value: `${summary.firstAttemptCorrectCount}/${summary.cardCount}`,
      hint: `${summary.firstAttemptMissCount} missed for score`,
      tone: summary.firstAttemptMissCount === 0 ? "good" : "plain",
    },
    { key: "accuracy", label: "Accuracy", value: accuracy, testId: "dc-result-accuracy" },
  ];
  if (summary.reflexCardCount > 0) {
    snapshot.push({
      key: "reflex", label: "Meta Reflex", testId: "dc-result-reflex",
      value: `${summary.reflexFirstAttemptCorrect}/${summary.reflexCardCount}`,
      hint: summary.perfectReflexBlocks > 0 ? "Perfect block" : undefined,
      tone: summary.perfectReflexBlocks > 0 ? "good" : "plain",
    });
  }
  if (summary.timeoutCount > 0) {
    snapshot.push({
      key: "timeouts", label: "Timed out", testId: "dc-result-timeouts",
      value: String(summary.timeoutCount), tone: "bad",
    });
  }

  const { rewards } = result;
  const progress: ResultProgressItem[] = [
    {
      key: "xp-answers", label: "XP from answers", icon: "xp",
      testId: "dc-result-xp-answers",
      value: String(rewards.xpFromAnswers),
    },
    {
      key: "xp-bonus", label: "Completion bonus", icon: "xp",
      testId: "dc-result-xp-bonus",
      value: String(rewards.completionBonusXp),
    },
    {
      key: "xp-total", label: "Total XP", icon: "xp", testId: "dc-result-xp-total",
      value: String(rewards.totalXp), delta: rewards.totalXp,
    },
    {
      key: "streak", label: "Daily streak", icon: "streak", testId: "dc-result-streak",
      value: rewards.streakAfter === 1 ? "1 day" : `${rewards.streakAfter} days`,
    },
  ];

  // The Daily publishes per-card figures in aggregate only — a count of
  // first-attempt misses and of timeouts, never which CARD each belonged to —
  // so there is no per-card timeline to draw and none is invented. The report
  // therefore speaks only to what the summary actually states.
  const report = buildMatchReport({ entries: [], timeoutCount: summary.timeoutCount });
  if (summary.firstAttemptMissCount === 0) {
    report.unshift("Every card solved on the first attempt.");
  }

  return {
    state: "complete",
    mode: "Daily Challenge",
    standing: "official",
    headline: "Challenge complete",
    score: { you: score, outOf: maxScore, label: `${result.scorePercent}% of today's best` },
    snapshot,
    progress,
    report,
    timeline: null,
  };
}

export function DailyResultSummary({
  result, summary, score, maxScore,
}: {
  result: DcResult;
  summary: DcSummary;
  score: number;
  maxScore: number;
}) {
  const model = buildDailyResults(result, summary, score, maxScore);
  return (
    <section
      aria-label="Daily Challenge result"
      data-testid="dc-result"
      className="space-y-4"
    >
      {/* THE GRADE is the Daily's own object and stays drawn here: no other
          mode has one, and folding it into a shared stat tile would turn the
          day's verdict into a figure among four. */}
      <header className="ranked-panel flex items-center gap-4 p-4">
        <div
          data-testid="dc-result-grade"
          data-grade={result.grade ?? "none"}
          aria-label={`Grade ${result.grade ?? "unavailable"}`}
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg
                      bg-gradient-to-br text-3xl font-black shadow-lg ${
            GRADE_TONE[result.grade ?? "D"] ?? GRADE_TONE.D}`}
        >
          {result.grade ?? "—"}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Score
          </p>
          <p data-testid="dc-result-score" className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {score} / {maxScore}
            </span>
            {" · "}
            <span data-testid="dc-result-percent" className="tabular-nums">
              {result.scorePercent}%
            </span>
          </p>
        </div>
      </header>

      {/* The perfect-block banner is the Daily's own celebration, like the
          grade, and stays an element rather than a report line: it is a
          named surface the mode has always had. */}
      {summary.perfectReflexBlocks > 0 && (
        <p
          data-testid="dc-result-perfect-reflex"
          className="flex items-center gap-1.5 rounded-md border border-amber-400/30
                     bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200"
        >
          <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Perfect Meta Reflex block — every card on the first try.
        </p>
      )}

      <GameResultsBody model={model} />

      {/* No "back" control here: the terminal frame's own primary action is
          the way out, and two of them would be two answers to one question. */}
      <p className="text-[11px] text-muted-foreground">
        A new challenge is composed each day. Come back tomorrow.
      </p>
    </section>
  );
}
