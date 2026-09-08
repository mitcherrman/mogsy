/**
 * RE1 Phase 3B — the account's own Ranked five-tier standing.
 *
 * Reads `GET /api/ranked/progression` once per mount. Every number rendered
 * comes from that response: this hook re-derives no tier and knows no cutoff,
 * so the backend stays the single threshold authority.
 *
 * Availability is a first-class outcome, exactly as `useRankedRole` treats
 * role identity: a deployment that predates this endpoint answers 404/405,
 * and a guest or not-yet-eligible account answers 401/403. Both mean "there
 * is no Ranked standing to show here" — the panel renders nothing and the
 * queue is never blocked over it.
 *
 * ### `enabled`, and why it is not just an optimisation
 * A caller that already KNOWS there is no account to ask about can say so.
 * `enabled: false` resolves straight to `unavailable` — the same outcome the
 * 403 would have produced — without making the request at all.
 *
 * This exists because the Academy Record put the hook on `/lol`, which every
 * anonymous visitor loads: the endpoint answered 403 for each of them and put
 * an error in the console on the front page. The panel behaved correctly
 * throughout (fail-closed is fail-closed), but an expected 403 logged on every
 * guest page view is noise that hides real failures, and asking an endpoint
 * about an account that does not exist is not a question worth sending.
 *
 * It deliberately does NOT suppress anything for a real account. An
 * authenticated 401/403/500 still travels the normal path and still resolves
 * to `unavailable`; this switch only covers the case the caller can prove in
 * advance. Omitting the option keeps the original always-fetch behaviour, so
 * every existing caller is unchanged.
 */

import { useEffect, useState } from "react";
import * as api from "@/lib/ranked-public/client";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";

export type ProgressionLoadState = "loading" | "ready" | "unavailable";

export interface ProgressionController {
  loadState: ProgressionLoadState;
  progression: RankedProgressionView | null;
}

export interface RankedProgressionOptions {
  /**
   * Ask the backend at all. Defaults to `true`. `false` means the caller has
   * already established there is no identified account, and resolves to
   * `unavailable` without a request — never to a permanent `loading`.
   */
  enabled?: boolean;
}

export function useRankedProgression(
  { enabled = true }: RankedProgressionOptions = {},
): ProgressionController {
  const [loadState, setLoadState] = useState<ProgressionLoadState>(
    enabled ? "loading" : "unavailable",
  );
  const [progression, setProgression] = useState<RankedProgressionView | null>(null);

  useEffect(() => {
    // Nothing to ask about. Same outcome the guest 403 produced, minus the
    // request and the console error. A caller that later becomes enabled — an
    // anonymous visitor who signs in without a reload — re-runs this effect
    // and fetches then.
    if (!enabled) {
      setProgression(null);
      setLoadState("unavailable");
      return;
    }

    setLoadState("loading");
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const view = await api.getRankedProgression(controller.signal);
        if (cancelled) return;
        setProgression(view);
        setLoadState("ready");
      } catch (e) {
        if (cancelled || api.isAborted(e)) return;
        void e;
        // Every failure mode lands in the same place: no standing to show.
        // A missing endpoint, a guest, a rate limit, and a malformed body
        // are all reasons to render nothing rather than to show a guessed
        // or partial rank.
        setProgression(null);
        setLoadState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled]);

  return { loadState, progression };
}
