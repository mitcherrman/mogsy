/**
 * A PRACTICE SESSION → the shared result model.
 *
 * The practice quiz's end screen was three stacked cards — "Quiz Complete"
 * with a score and a progress bar, a Session Breakdown of per-category bars,
 * and a Questions to Review list — each with its own heading, its own card
 * chrome and its own idea of hierarchy. The figures in them were right; the
 * screen was a third opinion about what a finished game looks like.
 *
 * This is the adapter. It reads the session's own answers — the only authority
 * a practice run has, and the same one the old breakdown folded — into the
 * model every other mode now fills.
 *
 * WHAT A PRACTICE RUN DOES NOT HAVE, and therefore does not show:
 * * **Discoveries.** Ownership is Ranked's `ranked_question_discoveries`
 *   ledger and nothing else; Practice has never granted OWNED, and a
 *   "collection grew" line here would be false.
 * * **A rating.** There is no ladder in Practice.
 * * **Speed.** No per-answer timing is recorded.
 */
import {
  buildMatchReport, bucketTimeline, strongestBucket, weakestBucket,
} from "@/components/game-results/matchReport";
import type {
  GameResultsModel, ResultProgressItem, ResultStat, ResultTimelineEntry,
} from "@/components/game-results/model";

export interface SessionResultAnswer {
  category?: string | null;
  questionText: string;
  selected: string;
  isCorrect: boolean;
  correctAnswer: string;
  explanation?: string | null;
}

export interface SessionResultsInput {
  answers: readonly SessionResultAnswer[];
  /** Correct count, as the runner counted it. Never recomputed from answers:
   *  a run whose last submit failed still has an authoritative score. */
  score: number;
  total: number;
  /** The set's name, for the mode line. */
  setName?: string | null;
  /** Account XP total after the run, when a submit reported one. */
  currentXp?: number | null;
  /** Answer streak after the run, when a submit reported one. */
  currentStreak?: number | null;
}

/** The badge the old screen printed. Kept verbatim — the thresholds are the
 *  product's and this is not the pass to retune them. */
export function practiceVerdict(score: number, total: number): string {
  if (total > 0 && score === total) return "Perfect Score";
  const rate = total > 0 ? score / total : 0;
  if (rate >= 0.7) return "Great Job";
  if (rate >= 0.4) return "Keep Practicing";
  return "Study Up";
}

export function buildSessionResults(input: SessionResultsInput): GameResultsModel {
  const { answers, score, total, setName, currentXp, currentStreak } = input;
  const accuracy = total > 0 ? Math.round((score / total) * 100) : null;

  const timeline: ResultTimelineEntry[] = answers.map((a, i) => ({
    index: i + 1,
    label: (a.category ?? "").trim() || "Uncategorized",
    outcome: a.isCorrect ? "correct" : "incorrect",
    // A practice question is right or wrong; it awards no points, so no points
    // chip is drawn. The mark's number is its position.
    points: null,
    detail: a.questionText,
    detailHint: a.isCorrect ? null : `Correct answer: ${a.correctAnswer || "—"}`,
  }));

  const snapshot: ResultStat[] = [
    {
      key: "correct", label: "Correct", value: `${score} / ${total}`,
      tone: accuracy !== null && accuracy >= 70 ? "good" : "plain",
    },
    { key: "accuracy", label: "Accuracy", value: accuracy === null ? "—" : `${accuracy}%` },
  ];
  // Strongest / weakest, from the SAME fold the report uses, so the tile and
  // the sentence can never disagree — including on a tie.
  const buckets = bucketTimeline(timeline);
  const best = strongestBucket(buckets);
  const worst = weakestBucket(buckets);
  if (best && worst && best.label !== worst.label) {
    snapshot.push({
      key: "strongest", label: "Strongest", value: best.label,
      hint: `${best.correct}/${best.total}`, tone: "good",
    });
    snapshot.push({
      key: "weakest", label: "Needs work", value: worst.label,
      hint: `${worst.correct}/${worst.total}`, tone: "bad",
    });
  }

  const progress: ResultProgressItem[] = [];
  if (typeof currentXp === "number") {
    progress.push({
      key: "xp", label: "Account XP", value: currentXp.toLocaleString(), icon: "xp",
    });
  }
  if (typeof currentStreak === "number" && currentStreak > 0) {
    progress.push({
      key: "streak", label: "Answer streak", icon: "streak",
      value: currentStreak === 1 ? "1 correct" : `${currentStreak} correct`,
    });
  }

  return {
    state: "complete",
    mode: setName?.trim() ? setName : "Practice",
    standing: "practice",
    headline: "Quiz Complete",
    subheading: practiceVerdict(score, total),
    score: { you: score, outOf: total },
    snapshot,
    progress,
    report: buildMatchReport({ entries: timeline }),
    timeline: timeline.length > 0 ? { unitLabel: "Questions", entries: timeline } : null,
  };
}
