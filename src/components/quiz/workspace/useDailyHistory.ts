/**
 * HUB4 — the Daily half of History, one cursor page at a time.
 *
 * The first page is read once when the record is enabled; later pages only
 * when the reader asks. Four states are kept apart because the record says
 * different things for each: first load (skeleton), loading more (the rows
 * stay), an empty account (nothing to show, no error) and a failed read
 * (retry). A failed LATER page never discards the rows already on screen.
 *
 * Records are keyed by the server's opaque run id, so a page that overlaps
 * the previous one cannot print a run twice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HISTORY_PAGE_SIZE,
  historyApi,
  isHistorySignedOut,
  type HistorySource,
} from "@/lib/history/historyApi";
import type { DailyHistoryRecord } from "@/lib/history/contracts";

export type DailyHistoryStatus = "idle" | "loading" | "ready" | "signed_out" | "error";

export interface DailyHistoryState {
  status: DailyHistoryStatus;
  records: DailyHistoryRecord[];
  /** The server gave a cursor for another page. */
  hasMore: boolean;
  loadingMore: boolean;
  /** The first page failed. */
  error: string | null;
  /** A later page failed; `records` are untouched. */
  loadMoreError: string | null;
  loadMore: () => void;
  reload: () => void;
}

const READ_FAILED = "Your Daily history could not be loaded.";

export function useDailyHistory(
  enabled: boolean,
  source: HistorySource = historyApi,
  pageSize: number = HISTORY_PAGE_SIZE,
): DailyHistoryState {
  const [status, setStatus] = useState<DailyHistoryStatus>("idle");
  const [records, setRecords] = useState<DailyHistoryRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Every read carries the generation it was issued in; an answer from an
  // earlier generation (a reload, a source change) is dropped, and the first
  // page's own read is also dropped once its effect is cleaned up.
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    let cancelled = false;
    if (!enabled) {
      setStatus("idle");
      setRecords([]);
      setCursor(null);
      return;
    }
    setStatus("loading");
    setError(null);
    setLoadMoreError(null);
    setLoadingMore(false);
    source
      .page({ cursor: null, limit: pageSize })
      .then((page) => {
        if (cancelled || generation.current !== mine) return;
        setRecords(dedupe([], page.items));
        setCursor(page.nextCursor);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled || generation.current !== mine) return;
        setRecords([]);
        setCursor(null);
        if (isHistorySignedOut(err)) {
          setStatus("signed_out");
          return;
        }
        setError(READ_FAILED);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, source, pageSize, reloadKey]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore || status !== "ready") return;
    const mine = generation.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    source
      .page({ cursor, limit: pageSize })
      .then((page) => {
        if (generation.current !== mine) return;
        setRecords((prev) => dedupe(prev, page.items));
        setCursor(page.nextCursor);
      })
      .catch(() => {
        if (generation.current !== mine) return;
        setLoadMoreError(READ_FAILED);
      })
      .finally(() => {
        if (generation.current === mine) setLoadingMore(false);
      });
  }, [cursor, loadingMore, pageSize, source, status]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    status,
    records,
    hasMore: !!cursor,
    loadingMore,
    error,
    loadMoreError,
    loadMore,
    reload,
  };
}

function dedupe(existing: DailyHistoryRecord[], incoming: DailyHistoryRecord[]): DailyHistoryRecord[] {
  const seen = new Set(existing.map((r) => r.runId));
  const next = existing.slice();
  for (const record of incoming) {
    if (seen.has(record.runId)) continue;
    seen.add(record.runId);
    next.push(record);
  }
  return next;
}
