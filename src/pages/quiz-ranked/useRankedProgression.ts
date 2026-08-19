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
 */

import { useEffect, useState } from "react";
import * as api from "@/lib/ranked-public/client";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";

export type ProgressionLoadState = "loading" | "ready" | "unavailable";

export interface ProgressionController {
  loadState: ProgressionLoadState;
  progression: RankedProgressionView | null;
}

export function useRankedProgression(): ProgressionController {
  const [loadState, setLoadState] = useState<ProgressionLoadState>("loading");
  const [progression, setProgression] = useState<RankedProgressionView | null>(null);

  useEffect(() => {
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
  }, []);

  return { loadState, progression };
}
