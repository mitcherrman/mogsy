/**
 * THE FINISHED MATCH'S MODULES, for the end screen.
 *
 * One read of the SAME `GET /api/ranked/matches/{id}/review` the Record's
 * question timeline already uses, issued once when the terminal frame mounts.
 * Nothing new was built on the backend for this: the endpoint has served the
 * per-round module, subject and verdict since MALT B1, and the only reason the
 * end screen did not show them is that it never asked.
 *
 * Fetched once, never polled: a terminal match's rounds are settled and cannot
 * change again.
 *
 * FAILURE IS SILENCE, exactly as `useMatchDiscoveries` decided for the same
 * position on the same screen. A guest, a match still settling, a rate limit,
 * a backend without the endpoint — all of them resolve to "no timeline", the
 * section renders nothing, and the result, the scoreline and the way back are
 * untouched. A module breakdown is worth having and is not worth an error
 * plate over a match result.
 */
import { useEffect, useState } from "react";
import { getMatchReview, isAborted } from "@/lib/ranked-public/client";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";

export function useMatchTimeline(
  matchId: string, enabled: boolean,
): MatchReviewView | null {
  const [review, setReview] = useState<MatchReviewView | null>(null);

  useEffect(() => {
    if (!enabled || !matchId) return;
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const next = await getMatchReview(matchId, controller.signal);
        if (!cancelled) setReview(next);
      } catch (err) {
        // Deliberately swallowed — see the module docstring. `isAborted` is
        // checked only to keep the intent explicit at the boundary.
        if (isAborted(err)) return;
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [matchId, enabled]);

  return review;
}
