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
   * Turning it false drops any status already held, immediately.
   */
  enabled?: boolean;
  /**
   * Whose status this is (e.g. the signed-in user id). A different identity
   * starts a new read and never shows the previous identity's answer, even for
   * the render before the new read lands. Omitted: one identity for the life of
   * the mount, which is the `/quiz` behaviour.
   */
  identity?: string | null;
}

export function useDailyChallengeStatus(
  { enabled = true, identity = null }: DailyChallengeStatusOptions = {},
): DailyStatusView {
  // A status belongs to the identity it was read for. `null` = no read allowed.
  const key = enabled ? `id:${identity ?? ""}` : null;
  const [held, setHeld] = useState<{ key: string; status: DailyStatusView } | null>(null);
  useEffect(() => {
    if (key === null) { setHeld(null); return; }
    const controller = new AbortController();
    let cancelled = false;
    readDailyStatus(controller.signal)
      .then((next) => { if (!cancelled) setHeld({ key, status: next }); })
      .catch((e) => { if (!isDailyRunAborted(e) && !cancelled) setHeld({ key, status: UNKNOWN_DAILY_STATUS }); });
    return () => { cancelled = true; controller.abort(); };
  }, [key]);
  // Derived at render: a stale or disabled status is never returned, not even
  // for the frame before the effect above runs.
  return key !== null && held !== null && held.key === key ? held.status : UNKNOWN_DAILY_STATUS;
}
