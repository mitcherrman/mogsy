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
  can_view_trends: boolean;
  /** Trailing windows, in days, this caller may ask for. */
  trend_windows: number[];
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

export type TrendCategory = {
  category: string;
  attempts: number;
  correct: number;
  accuracy: number;
  previous_attempts: number;
  previous_accuracy: number | null;
  delta_points: number | null;
  direction: TrendDirection;
  eligible: boolean;
  is_weak: boolean;
  is_recurring_weak: boolean;
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

export type TrendReport = {
  ok: boolean;
  capability: AnalyticsCapability;
  windows: number[];
  window_days: number;
  since: string;
  until: string;
  previous_since: string;
  current: TrendPeriod;
  previous: TrendPeriod;
  delta: TrendDelta;
  series: TrendPoint[];
  modes: TrendMode[];
  categories: TrendCategory[];
  recurring_weak: string[];
  sufficiency: {
    min_attempts: number;
    category_min_attempts: number;
    trend_points: number;
    has_data: boolean;
    enough_for_trend: boolean;
    enough_for_comparison: boolean;
  };
  counts_modes: string[];
  excludes_modes: string[];
};

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
export function movementSentence(report: TrendReport): string {
  const { delta, sufficiency, current } = report;
  if (!sufficiency.has_data) {
    return "No answers in this window yet.";
  }
  if (!sufficiency.enough_for_trend) {
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
