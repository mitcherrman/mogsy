/**
 * HUB6.3D — how History words a comparison, a record, a streak and a series.
 *
 * Formatting and view models only: every number comes from the server (or,
 * for the current attempt's own facts, from the record). Owner terminology:
 *
 *   * never "pp": "89% vs 79%" and "10 points higher" / "Accuracy +10 points";
 *     the displayed points are the difference of the two DISPLAYED (rounded)
 *     percentages, so "90% vs 79%" can never read "10 points";
 *   * "questions played" (never "settled"), with correct plurals:
 *     "1 fewer question played", "5 more questions played";
 *   * outcomes read "25 / 28 correct" — timeouts are in the denominator.
 */
import type { PersonalRecord, PersonalSnapshot, RecordStatus } from "@/lib/history/contracts";

// ─────────────────────────────────────────────────────────── counts

export function plural(n: number, one: string, many: string): string {
  return `${n} ${Math.abs(n) === 1 ? one : many}`;
}

/** "25 / 28 correct". */
export function correctOfPlayed(correct: number, played: number): string {
  return `${correct} / ${played} correct`;
}

/** "28 questions played" / "1 question played". */
export function questionsPlayed(n: number): string {
  return plural(n, "question played", "questions played");
}

/** "1 fewer question played", "5 more questions played", "Same number of
 *  questions played". */
export function questionsPlayedDelta(delta: number): string {
  if (delta === 0) return "Same number of questions played";
  const n = Math.abs(delta);
  return `${n} ${delta > 0 ? "more" : "fewer"} ${n === 1 ? "question" : "questions"} played`;
}

/** "2 more correct", "1 fewer correct", "Same number correct". */
export function correctDelta(delta: number): string {
  if (delta === 0) return "Same number correct";
  return `${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} correct`;
}

/** A generic signed count: "+3", "−2", "0". */
export function signedCount(delta: number): string {
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

// ─────────────────────────────────────────────────────────── accuracy

export const wholePercent = (ratio: number): number => Math.round(ratio * 100);

export interface AccuracyComparison {
  /** "89%". */
  current: string;
  /** "79%". */
  previous: string;
  /** Points between the two DISPLAYED percentages. */
  points: number;
  /** "10 points higher", "3 points lower", "Same accuracy". */
  change: string;
  /** "Accuracy +10 points", "Accuracy −3 points", "Accuracy unchanged". */
  compact: string;
  /** "89% vs 79%". */
  versus: string;
}

export function accuracyComparison(current: number, previous: number): AccuracyComparison {
  const c = wholePercent(current);
  const p = wholePercent(previous);
  const points = c - p;
  const n = Math.abs(points);
  const unit = n === 1 ? "point" : "points";
  return {
    current: `${c}%`,
    previous: `${p}%`,
    points,
    change: points === 0 ? "Same accuracy" : `${n} ${unit} ${points > 0 ? "higher" : "lower"}`,
    compact: points === 0 ? "Accuracy unchanged" : `Accuracy ${points > 0 ? "+" : "−"}${n} ${unit}`,
    versus: `${c}% vs ${p}%`,
  };
}

// ─────────────────────────────────────────────────────────── records

export const RECORD_LABEL: Record<RecordStatus, string> = {
  first_attempt: "First attempt",
  new_record: "New record",
  tied_record: "Tied record",
  below_record: "Below record",
};

/** The name of a recorded metric ("Most correct", "Deepest run"). */
export const RECORD_METRIC_LABEL: Record<string, string> = {
  score: "Best score",
  correct: "Most correct",
  questions_played: "Most questions played",
  longest_streak: "Longest streak",
  depth: "Deepest run",
};

export interface RecordView {
  metric: string;
  label: string;
  status: RecordStatus | null;
  statusLabel: string | null;
  current: number | null;
  priorBest: number | null;
  /** First attempt: the value alone, no medal. */
  medal: "new" | "tied" | null;
}

export function recordView(record: PersonalRecord): RecordView {
  return {
    metric: record.metric,
    label: RECORD_METRIC_LABEL[record.metric] ?? record.metric,
    status: record.status,
    statusLabel: record.status ? RECORD_LABEL[record.status] : null,
    current: record.current,
    priorBest: record.priorBest,
    medal: record.status === "new_record" ? "new" : record.status === "tied_record" ? "tied" : null,
  };
}

// ─────────────────────────────────────────────────────────── streaks

/** "Longest streak 14". */
export function streakLabel(length: number | null): string | null {
  return length === null ? null : `Longest streak ${length}`;
}

// ─────────────────────────────────────────────────────────── series

export interface SeriesPointView {
  runId: string;
  planDate: string;
  isCurrent: boolean;
  value: number | null;
}

/** One metric of a server series (oldest first, current last). */
export function seriesOf(series: PersonalSnapshot[], metric: keyof PersonalSnapshot): SeriesPointView[] {
  return series.map((p) => {
    const v = p[metric];
    return { runId: p.runId, planDate: p.planDate, isCurrent: p.isCurrent === true, value: typeof v === "number" ? v : null };
  });
}

// ─────────────────────────────────────────────────────────── completion

/** The terminal, in the Daily recap's words; a finished stage says nothing. */
export const COMPLETION_LABEL: Record<string, string> = {
  time_bank_exhausted: "Bank ran out",
  strikes_exhausted: "Out of strikes",
};
