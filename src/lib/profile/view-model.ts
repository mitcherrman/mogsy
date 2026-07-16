import {
  progressAttempts,
  resolveQuizAssetUrl,
  type QuizCategoryStat,
  type QuizHistoryEntry,
  type QuizProgress,
} from "@/lib/quiz/api";

/**
 * Activity state for the profile history/progress area:
 * - "none": no quiz activity anywhere — genuine first-use empty state.
 * - "aggregate-only": totals/accuracy/streaks prove activity, but no stored
 *   per-session history rows exist (legacy or untracked play).
 * - "detailed": stored session history rows are available to display.
 */
export type ProfileActivityState = "none" | "aggregate-only" | "detailed";

export interface ProfileStatsViewModel {
  /** Authoritative answered-question total (backend `total_attempts`). */
  totalQuestionsAnswered: number;
  currentStreak: number;
  bestStreak: number;
  /** 0–100, from the progress endpoint. */
  accuracy: number;
  rankName: string;
  rankIconUrl: string | null;
  categoryStats: QuizCategoryStat[];
  /** Sum of per-category answered counts (may exceed 0 while totals lag). */
  categoryAnsweredTotal: number;
  recentHistory: QuizHistoryEntry[];
  hasAnyQuizActivity: boolean;
  hasDetailedStoredHistory: boolean;
  activityState: ProfileActivityState;
}

/**
 * Deterministic "best category" pick among categories that were actually
 * played: higher accuracy wins, then higher answered count, then the stable
 * original ordering. Returns null when nothing has been answered — a
 * 0-attempt category is never "best" just because its accuracy defaults to 0.
 */
export function pickBestCategory(
  categories: QuizCategoryStat[] | null | undefined,
): QuizCategoryStat | null {
  const played = (categories ?? []).filter((c) => (Number(c.attempts) || 0) > 0);
  if (played.length === 0) return null;
  return played.reduce((a, b) => {
    if ((Number(b.accuracy) || 0) !== (Number(a.accuracy) || 0)) {
      return (Number(b.accuracy) || 0) > (Number(a.accuracy) || 0) ? b : a;
    }
    if ((Number(b.attempts) || 0) !== (Number(a.attempts) || 0)) {
      return (Number(b.attempts) || 0) > (Number(a.attempts) || 0) ? b : a;
    }
    return a; // stable: keep the earlier entry on full ties
  });
}

function rankField(progress: QuizProgress | null | undefined, key: string): unknown {
  const rank = progress?.rank;
  if (rank && typeof rank === "object") return (rank as Record<string, unknown>)[key];
  return undefined;
}

/**
 * Single source of truth for what the profile page says about quiz activity.
 * Derives one internally consistent view from the three real data sources
 * (progress totals, category breakdown, stored session history) instead of
 * scattering `?? 0` fallbacks through JSX.
 *
 * `history` is `null` while unloaded/unavailable — that alone never counts
 * as "no activity"; only the aggregate signals decide that.
 */
export function deriveProfileStats(
  progress: QuizProgress | null | undefined,
  categories: QuizCategoryStat[] | null | undefined,
  history: QuizHistoryEntry[] | null | undefined,
): ProfileStatsViewModel {
  const categoryStats = categories ?? [];
  const categoryAnsweredTotal = categoryStats.reduce(
    (sum, c) => sum + (Number(c.attempts) || 0),
    0,
  );

  const reportedAnswered = progressAttempts(progress);
  // The Answered metric must never show 0 when category totals prove
  // questions were answered (e.g. a stale or partial progress row).
  const totalQuestionsAnswered = Math.max(reportedAnswered, categoryAnsweredTotal);

  const accuracy = Number(progress?.accuracy ?? 0) || 0;
  const currentStreak = Number(progress?.current_streak ?? 0) || 0;
  const bestStreak = Number(progress?.best_streak ?? 0) || 0;

  const hasAnyQuizActivity =
    totalQuestionsAnswered > 0 || accuracy > 0 || bestStreak > 0;

  const recentHistory = history ?? [];
  const hasDetailedStoredHistory = recentHistory.length > 0;

  const activityState: ProfileActivityState = hasDetailedStoredHistory
    ? "detailed"
    : hasAnyQuizActivity
      ? "aggregate-only"
      : "none";

  const rankName =
    progress?.rank_name ||
    (rankField(progress, "rank_name") as string | undefined) ||
    (typeof progress?.rank === "string" ? progress.rank : null) ||
    "Unranked";

  const rankIconUrl =
    resolveQuizAssetUrl(progress?.rank_icon) ||
    resolveQuizAssetUrl(rankField(progress, "small_icon_path") as string | undefined) ||
    resolveQuizAssetUrl(rankField(progress, "icon_path") as string | undefined) ||
    null;

  return {
    totalQuestionsAnswered,
    currentStreak,
    bestStreak,
    accuracy,
    rankName,
    rankIconUrl,
    categoryStats,
    categoryAnsweredTotal,
    recentHistory,
    hasAnyQuizActivity,
    hasDetailedStoredHistory,
    activityState,
  };
}
