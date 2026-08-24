/**
 * The lobby's Daily status, read once on mount (ARENA1 Step 5, §19).
 *
 * One read, no polling: the record is a decision surface, not a live view, and
 * a lobby that re-asked every few seconds would spend requests on a number
 * that changes at most once a day. It is deliberately fire-and-forget — see
 * `readDailyStatus`, which cannot reject except on an abort.
 */

import { useEffect, useState } from "react";
import { isDcAborted } from "./client";
import { UNKNOWN_DAILY_STATUS, readDailyStatus } from "./status";
import type { DailyStatusView } from "./status";

export function useDailyChallengeStatus(): DailyStatusView {
  const [status, setStatus] = useState<DailyStatusView>(UNKNOWN_DAILY_STATUS);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    readDailyStatus(controller.signal)
      .then((next) => { if (!cancelled) setStatus(next); })
      .catch((e) => { if (!isDcAborted(e)) setStatus(UNKNOWN_DAILY_STATUS); });
    return () => { cancelled = true; controller.abort(); };
  }, []);
  return status;
}
