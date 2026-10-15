/**
 * The lobby's Daily status, read once on mount.
 *
 * One read, no polling: the record is a decision surface, not a live view, and
 * a lobby that re-asked every few seconds would spend requests on a number
 * that changes a handful of times a day. It is deliberately fire-and-forget —
 * see `readDailyStatus`, which cannot reject except on an abort.
 */

import { useEffect, useState } from "react";
import { isDailyRunAborted } from "./run/client";
import { UNKNOWN_DAILY_STATUS, readDailyStatus } from "./status";
import type { DailyStatusView } from "./status";

export interface DailyChallengeStatusOptions {
  /**
   * Hold the read until true (default: read on mount). A surface seen by
   * visitors with no session — the home — passes `!!user`: the read is
   * authenticated, so without a session it is a guaranteed 401 (a wasted
   * request and a console error) whose answer is `unknown` either way.
   */
  enabled?: boolean;
}

export function useDailyChallengeStatus({ enabled = true }: DailyChallengeStatusOptions = {}): DailyStatusView {
  const [status, setStatus] = useState<DailyStatusView>(UNKNOWN_DAILY_STATUS);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    readDailyStatus(controller.signal)
      .then((next) => { if (!cancelled) setStatus(next); })
      .catch((e) => { if (!isDailyRunAborted(e)) setStatus(UNKNOWN_DAILY_STATUS); });
    return () => { cancelled = true; controller.abort(); };
  }, [enabled]);
  return status;
}
