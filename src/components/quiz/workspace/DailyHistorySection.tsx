/**
 * HUB4 — the Daily runs in History, from `GET /api/history/v1`.
 *
 * Daily is the lobby's launch attraction, so its completed runs lead the
 * record, grouped by run with their stages. The existing Ranked and Practice
 * ledger follows unchanged. Ordinary Ranked history never carries a Daily
 * child match — the server excludes them (`load_history_rows` NOT EXISTS
 * `daily_run_stages`) — so nothing here de-duplicates by guessing ids.
 *
 * STATES
 * ──────
 * Nothing renders while the account has no Daily records, is signed out, or
 * the record is disabled: the ledger below owns the empty record and the
 * sign-in prompt, and a second empty state here would be a second answer to
 * one question. A failed read is stated with a retry. Loading more keeps the
 * rows; a failed later page keeps them too.
 */
import { useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import DailyRunRow from "@/components/quiz/workspace/DailyRunRow";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { useMatchReviews } from "@/components/quiz/workspace/useMatchReviews";
import type { DailyHistoryState } from "@/components/quiz/workspace/useDailyHistory";
import { hasExpansion } from "@/components/quiz/workspace/HistoryAnalysis";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";

export default function DailyHistorySection({
  daily,
  frozenReviews,
  openAnalysisSignal = null,
  onAnalysisTargetMissing,
}: {
  daily: DailyHistoryState;
  /** Frozen child-match reviews for a host that must not fetch. */
  frozenReviews?: Readonly<Record<string, MatchReviewView>>;
  /** Legacy `#trends`: open and focus the newest run's analysis. */
  openAnalysisSignal?: number | null;
  /** Called when a `#trends` arrival finds no run with an analysis to open. */
  onAnalysisTargetMissing?: () => void;
}) {
  const { records, status } = daily;
  const coarse = useCoarsePointer();

  /* ONE bounded loader for every stage timeline, in display order — the same
     loader the Ranked rows use, so fifty stage timelines are read two at a
     time rather than all at once. */
  const reviewIds = useMemo(
    () =>
      frozenReviews
        ? []
        : records.flatMap((r) => r.stages.map((s) => s.reviewMatchId).filter((id): id is string => !!id)),
    [frozenReviews, records],
  );
  const reviews = useMatchReviews(reviewIds);
  const reviewFor = useCallback(
    (matchId: string | null): MatchReviewView | null => {
      if (!matchId) return null;
      if (frozenReviews) return frozenReviews[matchId] ?? null;
      const loaded = reviews.get(matchId);
      return loaded?.status === "ready" ? loaded.review : null;
    },
    [frozenReviews, reviews],
  );

  const analysisTarget = records.find((r) => hasExpansion(r.capability))?.runId ?? null;
  useEffect(() => {
    if (openAnalysisSignal === null || status === "loading" || status === "idle") return;
    if (!analysisTarget) onAnalysisTargetMissing?.();
    // Only the arrival itself — not later record changes — asks for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAnalysisSignal, status]);

  if (status === "loading" && records.length === 0) {
    return (
      <div className="mb-2 space-y-1.5" data-testid="daily-history-loading" aria-busy="true">
        <Skeleton className="h-24 w-full rounded" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div
        className="mb-2 flex flex-wrap items-center gap-2 rounded border px-2.5 py-2"
        style={{ borderColor: "rgba(96,68,28,0.3)" }}
        data-testid="daily-history-error"
      >
        <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }}>
          {daily.error}
        </p>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={daily.reload}>
          Try again
        </Button>
      </div>
    );
  }
  if (records.length === 0) return null;

  return (
    <div className="mb-2" data-testid="daily-history">
      <ul className="w-full">
        {records.map((record) => (
          <DailyRunRow
            key={record.runId}
            record={record}
            reviewFor={reviewFor}
            onRetry={daily.reload}
            openAnalysisSignal={record.runId === analysisTarget ? openAnalysisSignal : null}
          />
        ))}
      </ul>
      {(daily.hasMore || daily.loadMoreError) && (
        <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="daily-history-more">
          {daily.loadMoreError && (
            <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="daily-history-more-error">
              {daily.loadMoreError}
            </p>
          )}
          {daily.hasMore && (
            <Button
              size="sm"
              variant="outline"
              className={`text-[11px] ${coarse ? "min-h-[44px]" : "h-7"}`}
              disabled={daily.loadingMore}
              aria-busy={daily.loadingMore}
              onClick={daily.loadMore}
              data-testid="daily-history-load-more"
            >
              {daily.loadingMore ? "Loading…" : daily.loadMoreError ? "Try again" : "More Daily runs"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
