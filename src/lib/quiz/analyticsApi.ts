/**
 * PT1.8 — the Premium personal-analytics client.
 *
 * Same posture as `builderApi`: every call is `authedRequest`, this file holds
 * NO entitlement rule and NO threshold, and it decides nothing about what a
 * trend is. The server answers "what may you see", "how much evidence is
 * there" and "which way is this moving"; a second copy of any of those here
 * would be a second answer that can disagree with the enforced one.
 *
 * The capability read is a SEPARATE, ungated call for one reason: a paywall
 * has to be drawn from a successful response. A client that only ever learns
 * its tier from a 403 cannot tell "you do not have this" apart from "the
 * request failed", and telling a paying subscriber they are Free because a
 * request did not return is the worst thing this surface can say.
 */
import { authedRequest } from "@/lib/quiz/api";

/** What this account may read about its own record. A superset of the
 *  Builder's capability — one object, one resolver, one failure policy. */
export type AnalyticsCapability = {
  /** PT1.10 — may read the FIGURES: answers, accuracy, days studied, and the
   *  same totals per category and per mode. Every account may. */
  can_view_snapshot: boolean;
  /** The single window a snapshot covers. */
  snapshot_window_days: number;
  /** May read what those figures MEAN over time. Premium. */
  can_view_trends: boolean;
  /** Trailing windows, in days, a trend reader may ask for. [] for Free. */
  trend_windows: number[];
  /** Every window this caller may ask for, whichever tier. Render the picker
   *  from THIS — a client that decides for itself that one entry means "no
   *  picker" is a client that needs a new branch for the next tier. */
  allowed_windows: number[];
  can_build: boolean;
  reason: string;
};

/** One calendar day of the current window. `accuracy` is null on a day with no
 *  attempts — nothing was got wrong on a day nothing was answered. */
export type TrendPoint = {
  date: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
};

export type TrendPeriod = {
  attempts: number;
  correct: number;
  accuracy: number;
  active_days: number;
};

export type TrendDirection = "improving" | "declining" | "steady" | "insufficient";

export type TrendDelta = {
  attempts: number;
  /** Null until BOTH periods carry enough evidence to compare. */
  accuracy_points: number | null;
  active_days: number;
  direction: TrendDirection;
  comparable: boolean;
};

/**
 * A category row.
 *
 * The four figure fields are always present. Everything else is the
 * COMPARISON, which the server withholds from a Free payload entirely — not
 * nulled, ABSENT — so they are optional here and the pane must treat "missing"
 * and "null" as the same thing: nothing to say about direction.
 */
export type TrendCategory = {
  category: string;
  attempts: number;
  correct: number;
  accuracy: number;
  /** PT1.11 — this percentage rests on very few answers. The server sets it
   *  from its own existing evidence floor; it is NOT a confidence interval and
   *  the row keeps its true score and true count either way. */
  low_sample?: boolean;
  previous_attempts?: number;
  previous_accuracy?: number | null;
  delta_points?: number | null;
  direction?: TrendDirection;
  eligible?: boolean;
  is_weak?: boolean;
  is_recurring_weak?: boolean;
};

export type TrendMode = {
  mode: string;
  label: string;
  /** False for an attempt the mode breakdown could not place. It is still in
   *  every total; only its mode is unknown. */
  known: boolean;
  attempts: number;
  correct: number;
  accuracy: number;
};

/** Which projection the server sent. Never inferred client-side. */
export type AnalyticsTier = "free" | "premium";

/**
 * PT1.10 — one payload type, two shapes.
 *
 * The figures are always there. The longitudinal half is `?` because a Free
 * payload does not carry those keys at all: the server projects them away
 * through an allow-list rather than sending nulls, so the honest client type
 * is "may be absent". `isTrendReport` below is the one place that decides
 * which shape arrived, and it asks the SERVER's `tier`, never a tier the
 * client worked out for itself.
 */
export type TrendReport = {
  ok: boolean;
  tier: AnalyticsTier;
  capability: AnalyticsCapability;
  windows: number[];
  /** Premium's trailing window length. NULL for a Free snapshot, which is
   *  bounded by answers rather than by days and so has no window length to
   *  report. */
  window_days: number | null;
  /** The first and last answer this payload actually read. */
  since: string | null;
  until: string | null;
  /** PT1.11, Free only — how many answers the snapshot read, and how many
   *  calendar days they happened to span. */
  recent_answers?: number;
  span_days?: number;
  current: TrendPeriod;
  modes: TrendMode[];
  categories: TrendCategory[];
  counts_modes: string[];
  excludes_modes: string[];
  sufficiency: {
    has_data: boolean;
    min_attempts?: number;
    category_min_attempts?: number;
    trend_points?: number;
    enough_for_trend?: boolean;
    enough_for_comparison?: boolean;
  };
  /* ---- Premium only. Absent, not null, in a Free payload. ---- */
  previous_since?: string;
  previous?: TrendPeriod;
  delta?: TrendDelta;
  series?: TrendPoint[];
  recurring_weak?: string[];
};

/** Whether this payload carries the interpretation, per the SERVER. */
export const isTrendReport = (report: TrendReport | null): boolean =>
  !!report && report.tier === "premium" && !!report.delta;

export const PREMIUM_REQUIRED = "PREMIUM_REQUIRED";

export const isPremiumRefusal = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(PREMIUM_REQUIRED);

export const analyticsApi = {
  capability: () =>
    authedRequest<{ ok: boolean; capability: AnalyticsCapability }>(
      "/api/quiz/analytics/capability",
    ),
  trends: (windowDays: number) =>
    authedRequest<TrendReport>(`/api/quiz/analytics/trends?window=${windowDays}`),
};

/**
 * PT1.11 — a category's movement, in words rather than in notation.
 *
 * `↗ +16.7` is a chart legend, not a sentence. The reader is told what the
 * server concluded and then the number behind it, in that order, because the
 * conclusion is the thing they can act on. The MATH is untouched: every branch
 * here reads a `direction` the server had already decided.
 */
export function trendLabel(entry: TrendCategory): string | null {
  const { direction, delta_points: points } = entry;
  if (direction == null) return null;              // a Free row: no comparison
  if (direction === "insufficient" || points == null) {
    return "Not enough data for a trend";
  }
  if (direction === "steady") return "Steady";
  const size = Math.abs(points).toFixed(Math.abs(points) % 1 === 0 ? 0 : 1);
  if (direction === "improving") return `Improving · +${size} pts`;
  return `Declining · −${size} pts`;
}

/** How a window is named in copy. The number is the server's; only the wording
 *  is here, because a label is not a claim about the data. */
export function windowLabel(days: number): string {
  if (days === 7) return "7 days";
  if (days === 30) return "30 days";
  if (days === 90) return "90 days";
  return `${days} days`;
}

/**
 * The one sentence a reader gets about movement.
 *
 * It never invents a direction the server did not state, and when there is not
 * enough evidence it says so rather than printing a number with a caveat next
 * to it — a delta shown at all reads as a delta that counts.
 */
/** What period a Free snapshot covered, said plainly, so "recent" is never a
 *  claim the data cannot support. */
export function recentSpanLabel(report: TrendReport): string {
  const answers = report.recent_answers ?? report.current.attempts;
  const days = report.span_days ?? 0;
  if (!answers) return "No answers recorded yet";
  const a = `${answers} answer${answers === 1 ? "" : "s"}`;
  if (days <= 1) return `Your last ${a}, all on one day`;
  return `Your last ${a}, over ${days} days`;
}

export function movementSentence(report: TrendReport): string {
  const { delta, sufficiency, current } = report;
  if (!sufficiency.has_data) {
    return "No answers in this window yet.";
  }
  // PT1.10: only ever called for a Premium payload, but a missing delta must
  // not read as "steady" — that would be a claim about movement made from the
  // absence of the data that measures it.
  if (!delta) {
    return "";
  }
  if (sufficiency.enough_for_trend === false) {
    return `${current.attempts} answer${current.attempts === 1 ? "" : "s"} so far — ${sufficiency.min_attempts} in a window is where a trend starts to mean something.`;
  }
  if (!delta.comparable) {
    return "This is your first full window, so there is nothing yet to compare it against.";
  }
  const points = delta.accuracy_points ?? 0;
  const size = Math.abs(points).toFixed(Math.abs(points) % 1 === 0 ? 0 : 1);
  if (delta.direction === "improving") return `Up ${size} points on the previous ${windowLabel(report.window_days)}.`;
  if (delta.direction === "declining") return `Down ${size} points on the previous ${windowLabel(report.window_days)}.`;
  return `Holding steady against the previous ${windowLabel(report.window_days)}.`;
}
