/**
 * HUB6.3E — how the Premium analytics room words the server's figures.
 *
 * Owner terminology is locked (see `historyComparisons`): never "pp", never
 * "settled", "25 / 28 correct", "1 fewer question played". No learning-state
 * words anywhere: no weakness, strength, mastery or recovery label is ever
 * produced here — only counts, percentages, percentiles and dates.
 */
import type { HistogramBin, PopulationCohort } from "@/lib/history/contracts";

/** "1st", "2nd", "23rd", "87th". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}

/**
 * A 0–1 midrank percentile as a whole ordinal the reader can trust. Rounded,
 * then held inside 1–99: a player at 0.9997 is not "100th" (someone may be
 * tied with them), and a player at 0.002 is not "0th" — a zero here would
 * read as "no data", which this page never says with a number.
 */
export function percentileNumber(p: number): number {
  return Math.max(1, Math.min(99, Math.round(p * 100)));
}

export function percentileLabel(p: number): string {
  return `${ordinal(percentileNumber(p))} percentile`;
}

/** The metric names population and history speak in. */
export const METRIC_LABEL: Readonly<Record<string, string>> = {
  correct: "Correct",
  accuracy: "Accuracy",
  longest_streak: "Longest streak",
  score: "Score",
  questions_played: "Questions played",
  depth: "Depth",
};

/** "Standard score", "Time Trial correct answers", "Survival depth". */
export const PRIMARY_PHRASE: Readonly<Record<string, string>> = {
  standard: "score",
  time_trial: "correct answers",
  survival: "depth",
};

export function isFraction(metric: string): boolean {
  return metric === "accuracy";
}

/** A population value in its own unit: "89%", "24", "24.5". */
export function metricValue(metric: string, v: number | null): string {
  if (v === null) return "—";
  if (isFraction(metric)) return `${Math.round(v * 100)}%`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
}

/** A histogram bin's range in words: "10–11", "18 or more", "under 6",
 *  "80–100%". Integer bins are [lower, upper), so an integer bin's last
 *  value is `upper − 1`. */
export function binLabel(bin: HistogramBin, fraction: boolean): string {
  if (fraction) {
    const lo = bin.lower === null ? 0 : Math.round(bin.lower * 100);
    const hi = bin.upper === null ? 100 : Math.round(bin.upper * 100);
    return `${lo}–${hi}%`;
  }
  if (bin.lowerOpen || bin.lower === null) return `under ${bin.upper}`;
  if (bin.upperOpen || bin.upper === null) return `${bin.lower} or more`;
  const last = bin.upper - 1;
  return last <= bin.lower ? String(bin.lower) : `${bin.lower}–${last}`;
}

export const COHORT_LABEL: Readonly<Record<string, string>> = {
  rolling_28d: "Last 28 days",
  same_day: "Same day",
};

/** "1,455 players · last 28 days to Sep 14". */
export function cohortLine(c: PopulationCohort, dateLabel: (iso: string) => string): string {
  const players = c.users === null ? null : `${c.users.toLocaleString("en-US")} ${c.users === 1 ? "player" : "players"}`;
  const window = c.type === "same_day"
    ? c.asOf ? `who played ${dateLabel(c.asOf)}` : "same day"
    : c.asOf ? `last ${c.windowDays ?? 28} days to ${dateLabel(c.asOf)}` : "last 28 days";
  return [players, window].filter(Boolean).join(" · ");
}

/**
 * Why a cohort has no comparison — factual, never a zero and never an
 * upsell. `insufficient` keeps its count ("40 of the 100 players needed").
 */
export function cohortReason(c: PopulationCohort | null): string {
  if (!c) return "No comparison for this Daily.";
  switch (c.status) {
    case "insufficient": {
      const seen = c.sufficiency?.observed ?? c.users ?? 0;
      const need = c.sufficiency?.required ?? 100;
      return `Not enough players yet — ${seen} of the ${need} needed.`;
    }
    case "unavailable":
      return c.reasonCode === "aggregate_not_built"
        ? "The player comparison for this date hasn't been built yet."
        : "The player comparison is unavailable right now.";
    case "not_applicable":
      return "This stage isn't compared with other players.";
    default:
      return "";
  }
}

/** Run-level population state in words, for a Daily with no usable block. */
export function runPopulationReason(reasonCode: string | null): string {
  switch (reasonCode) {
    case "aggregate_not_built":
      return "The player comparison for this date hasn't been built yet.";
    case "insufficient_population":
      return "Not enough players have played yet to compare.";
    case "population_not_configured":
    case "population_projection_failed":
      return "The player comparison is unavailable right now.";
    default:
      return "No player comparison for this Daily.";
  }
}

/** Why no strongest mode is named — the server's reason, in words. */
export function strongestReason(reasonCode: string | null): string {
  switch (reasonCode) {
    case "margin_below_threshold":
      return "No single mode leads by 10 points or more.";
    case "mode_population_insufficient":
      return "Every mode needs enough players to name one.";
    default:
      return "No strongest mode for this Daily.";
  }
}

/** "+3", "−2", "±0". */
export function signed(n: number): string {
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** "Depth +5", "Score −12" — a plain signed difference with its name. */
export function signedNamed(name: string, n: number): string {
  return n === 0 ? `${name} unchanged` : `${name} ${signed(n)}`;
}

/** "5 floors deeper", "2 floors shallower". */
export function depthDelta(n: number): string {
  if (n === 0) return "Same depth";
  const k = Math.abs(n);
  return `${k} ${k === 1 ? "question" : "questions"} ${n > 0 ? "deeper" : "shallower"}`;
}

export const COMPLETION_WORDS: Readonly<Record<string, string>> = {
  time_bank_exhausted: "Bank ran out",
  strikes_exhausted: "Out of strikes",
  segments_complete: "Every question played",
  completed: "Every question played",
};
