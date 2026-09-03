/**
 * PT1.2 — the Personal Question Library's loader.
 *
 * Mirrors `useMissedQuestions` deliberately: same `enabled` gate, same
 * additive pagination, same "a failed page keeps what is already on screen".
 * Two panes of one workspace should not fetch in two different shapes.
 *
 * WHAT IS DIFFERENT, AND WHY
 * ──────────────────────────
 * The library is PERMANENT ACCOUNT STATE, so unlike the missed bank it cannot
 * run on a guest/anonymous session at all: the backend requires a real account
 * (401 without a token, 403 `ACCOUNT_REQUIRED` for a Supabase anonymous
 * session). So this hook does not manufacture a guest token — `hasAccount:
 * false` is answered locally with `needsAccount`, and no request is made. A
 * sign-in prompt is the honest answer; an empty collection would be a lie.
 *
 * A 401/403 coming back from the network is mapped to the same
 * `needsAccount` state rather than to an error, because the account boundary
 * is a product state, not a failure.
 *
 * The read never writes. Discovery happens when a Ranked round is submitted;
 * nothing on this surface can create, mutate or delete a discovery, so
 * retrying or paging is always safe.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RankedApiError,
  getQuestionLibrary,
  isAborted,
} from "@/lib/ranked-public/client";
import type {
  QuestionLibraryEntryView,
  QuestionLibraryPageView,
  QuestionLibrarySummaryView,
} from "@/lib/ranked-public/contracts";

/** One page. Matches the backend default so the first read is the cheap one. */
export const QUESTION_LIBRARY_PAGE_SIZE = 25;

export const LIBRARY_ERROR = "Could not load your collected questions.";

export type QuestionLibraryState = {
  summary: QuestionLibrarySummaryView | null;
  entries: QuestionLibraryEntryView[];
  pagination: QuestionLibraryPageView | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** The caller has no account (or the backend said so). Not an error. */
  needsAccount: boolean;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
};

function isAccountBoundary(err: unknown): boolean {
  if (!(err instanceof RankedApiError)) return false;
  if (err.status === 401 || err.status === 403) return true;
  return err.code === "AUTH_REQUIRED" || err.code === "ACCOUNT_REQUIRED";
}

export function useQuestionLibrary({
  enabled = true,
  hasAccount = true,
  pageSize = QUESTION_LIBRARY_PAGE_SIZE,
}: {
  /** False while the pane is closed, so a reader who never opens the Library
   *  never issues the read. */
  enabled?: boolean;
  /** False for a guest or a Supabase anonymous session. */
  hasAccount?: boolean;
  pageSize?: number;
} = {}): QuestionLibraryState {
  const [summary, setSummary] = useState<QuestionLibrarySummaryView | null>(null);
  const [entries, setEntries] = useState<QuestionLibraryEntryView[]>([]);
  const [pagination, setPagination] = useState<QuestionLibraryPageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (!hasAccount) {
      // Answered locally: no request, no token minted, no empty-collection lie.
      setNeedsAccount(true);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNeedsAccount(false);
      try {
        const view = await getQuestionLibrary(
          { limit: pageSize, offset: 0 }, controller.signal);
        if (cancelled) return;
        setSummary(view.summary);
        setEntries(view.entries);
        setPagination(view.pagination);
      } catch (err) {
        if (cancelled || isAborted(err)) return;
        if (isAccountBoundary(err)) {
          setNeedsAccount(true);
          return;
        }
        setError(err instanceof Error && err.message ? err.message : LIBRARY_ERROR);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, hasAccount, pageSize, reloadKey]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const view = await getQuestionLibrary({ limit: pageSize, offset: entries.length });
      // Append. A duplicate cannot slip in twice: the canonical ref is the
      // collection's primary key, so it is also the de-dupe key here for the
      // case where a discovery moved pages between reads (the order is
      // `last_seen_at DESC`, which a concurrent Ranked submission can change).
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.canonicalQuestionRef));
        return [...prev, ...view.entries.filter((e) => !seen.has(e.canonicalQuestionRef))];
      });
      setSummary(view.summary);
      setPagination(view.pagination);
    } catch (err) {
      if (!isAborted(err)) toast.error("Could not load more of your collection.");
    } finally {
      setLoadingMore(false);
    }
  }, [entries.length, pageSize]);

  const total = summary?.uniqueDiscovered ?? 0;

  return {
    summary,
    entries,
    pagination,
    loading,
    loadingMore,
    error,
    needsAccount,
    hasMore: !needsAccount && !error && entries.length < total,
    loadMore: () => void loadMore(),
    retry: () => setReloadKey((k) => k + 1),
  };
}
