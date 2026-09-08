/**
 * LC1 — the account's own recent Ranked results, read once per mount.
 *
 * The hub needs the same rows twice (the personal history list, and the
 * per-role tally under the role carousel), so this hook owns the ONE fetch
 * and hands the rows down; the hub components themselves still fetch nothing.
 *
 * Best-effort, exactly like the lobby's `RankedMatchHistory` widget: any
 * failure — a backend without the endpoint, a guest, a rate limit, a
 * malformed body — resolves to "no rows to show". The hub renders its empty
 * state and the queue is never blocked over it. Nothing here derives a
 * rating, a tier or a record; it only carries the backend's own rows.
 *
 * `enabled` mirrors `useRankedProgression`'s, and exists for the same reason:
 * `/lol` is the front page, and asking this endpoint about an account that
 * does not exist answered 403 for every anonymous visitor. `enabled: false`
 * resolves to `unavailable` with no rows and no request. It suppresses nothing
 * for a real account — an authenticated failure still travels the normal path.
 */

import { useEffect, useState } from "react";
import { getMatchHistory, isAborted } from "@/lib/ranked-public/client";
import type { MatchHistoryEntryView } from "@/lib/ranked-public/contracts";

export type MatchHistoryLoadState = "loading" | "ready" | "unavailable";

export interface MatchHistoryController {
  loadState: MatchHistoryLoadState;
  entries: MatchHistoryEntryView[];
  /** The limit actually requested, so callers can state the scope truthfully. */
  limit: number;
}

export function useRankedMatchHistory(
  limit = 20,
  { enabled = true }: { enabled?: boolean } = {},
): MatchHistoryController {
  const [loadState, setLoadState] = useState<MatchHistoryLoadState>(
    enabled ? "loading" : "unavailable",
  );
  const [entries, setEntries] = useState<MatchHistoryEntryView[]>([]);

  useEffect(() => {
    // Nothing to ask about: same outcome the guest 403 produced, minus the
    // request and the console error.
    if (!enabled) {
      setEntries([]);
      setLoadState("unavailable");
      return;
    }
    setLoadState("loading");
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const view = await getMatchHistory(limit, controller.signal);
        if (cancelled) return;
        setEntries(view.entries);
        setLoadState("ready");
      } catch (e) {
        if (cancelled || isAborted(e)) return;
        setEntries([]);
        setLoadState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [limit, enabled]);

  return { loadState, entries, limit };
}
