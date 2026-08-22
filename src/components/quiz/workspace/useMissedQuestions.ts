/**
 * MALT — the Missed Question Bank's loader, lifted out of
 * `LolMissedQuestions.tsx` so the standalone page and the workspace's Review
 * pane fetch it exactly the same way.
 *
 * Every behaviour here shipped already and is preserved deliberately:
 *
 *  - GUEST-FIRST. `/api/quiz/missed-questions` is JWT-only, so a Supabase
 *    session (anonymous if need be) is guaranteed to have a token before the
 *    call. No token is a SESSION error, never an empty bank.
 *  - A NON-OK PAYLOAD IS A BACKEND FAILURE. `ok: false` renders an error —
 *    never the paywall and never "flawless so far". Showing a Pro player a
 *    paywall because a query failed is the worst outcome available here.
 *  - PAGINATION IS ADDITIVE. `Load more` appends; a failed page keeps what is
 *    already on screen and says so.
 *
 * THE ONE THING THE HOOK ADDS is `enabled`. The Review pane is mounted inside
 * the lobby, and a Pro-gated endpoint must not be polled on every lobby load
 * by a reader who never opens Review — so the pane mounts the hook only when
 * it is actually being looked at.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { quizApi, type MissedQuestion, type MissedQuestionsResponse } from "@/lib/quiz/api";
import { useAuth } from "@/hooks/useAuth";
import { ensureBackendAuthToken } from "@/lib/backend-auth";

export const MISSED_QUESTIONS_PAGE_SIZE = 25;
export const GUEST_SESSION_ERROR = "We couldn’t start a guest session. Please try again.";

export type MissedQuestionsState = {
  data: MissedQuestionsResponse | null;
  items: MissedQuestion[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  retry: () => void;
};

export function useMissedQuestions({
  enabled = true,
  pageSize = MISSED_QUESTIONS_PAGE_SIZE,
}: { enabled?: boolean; pageSize?: number } = {}): MissedQuestionsState {
  const { loading: authLoading } = useAuth();
  const [data, setData] = useState<MissedQuestionsResponse | null>(null);
  const [items, setItems] = useState<MissedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    // Let AuthProvider finish restoring/creating the session first.
    if (authLoading) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await ensureBackendAuthToken();
        if (!token) {
          if (!cancelled) setError(GUEST_SESSION_ERROR);
          return;
        }
        const res = await quizApi.getMissedQuestions({ limit: pageSize, offset: 0 });
        if (cancelled) return;
        // A non-ok payload is a backend failure — never show the paywall or
        // an empty bank for it.
        if (res.ok === false) {
          setError("Could not load missed questions.");
        } else {
          setData(res);
          setItems(res.results);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "";
          // A 401 here means the guest token didn't take — not the user's fault.
          setError(
            /\b401\b/.test(message)
              ? GUEST_SESSION_ERROR
              : message || "Could not load missed questions.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, enabled, pageSize, reloadKey]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await quizApi.getMissedQuestions({ limit: pageSize, offset: items.length });
      setData(res);
      setItems((prev) => [...prev, ...res.results]);
    } catch {
      toast.error("Could not load more questions.");
    } finally {
      setLoadingMore(false);
    }
  }, [items.length, pageSize]);

  const totalCount = data?.total_count ?? 0;

  return {
    data,
    items,
    loading,
    loadingMore,
    error,
    hasMore: !data?.locked && items.length < totalCount,
    totalCount,
    loadMore: () => void loadMore(),
    retry: () => setReloadKey((k) => k + 1),
  };
}
