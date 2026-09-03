/**
 * PT1.3 — the post-match discovery reveal's loader.
 *
 * ONE read, when the terminal frame mounts. Not polled: the discoveries were
 * written inside the submit transaction of the rounds the player just
 * finished, so by the time a match is terminal the answer is final and cannot
 * change again.
 *
 * NOTHING IS DERIVED HERE
 * ──────────────────────
 * "Newly discovered" is the backend's answer, taken from each discovery row's
 * immutable first-match provenance. This hook does not diff a collection, does
 * not compare refs against a previous read, and does not treat "answered" or
 * "correct" as ownership. A client-side derivation would be wrong for the
 * exact case the ceremony exists to get right — a question the player has
 * owned for weeks and answered again tonight.
 *
 * FAILURE IS SILENCE, NOT AN ERROR STATE
 * ──────────────────────────────────────
 * This is a reward, hung off the end of a match whose result, rating and
 * progression are already on screen. A failed or refused read therefore
 * resolves to "nothing to celebrate" and the terminal frame renders exactly as
 * it did before PT1.3 — no toast, no retry button, no error plate competing
 * with the match outcome. That covers a guest/anonymous session (401/403), a
 * match still settling (409), and any transport failure alike.
 */
import { useEffect, useState } from "react";
import { getMatchDiscoveries, isAborted } from "@/lib/ranked-public/client";
import type { MatchDiscoveriesView } from "@/lib/ranked-public/contracts";

export type MatchDiscoveriesState = {
  /** The server's answer, or null while loading and after any failure. */
  view: MatchDiscoveriesView | null;
  loading: boolean;
};

export function useMatchDiscoveries(
  matchId: string, enabled: boolean,
): MatchDiscoveriesState {
  const [view, setView] = useState<MatchDiscoveriesView | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !matchId) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await getMatchDiscoveries(matchId, controller.signal);
        if (!cancelled) setView(next);
      } catch (err) {
        // Deliberately swallowed — see the module docstring. `isAborted` is
        // still checked so an unmount does not clear `loading` on a dead
        // component's behalf.
        if (isAborted(err)) return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [matchId, enabled]);

  return { view, loading };
}
