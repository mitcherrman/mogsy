/**
 * RFX1 Phase 2B3 — THE RANKED COUNTDOWN'S TICK SOURCE.
 *
 * THE BUG THIS REPLACES
 * ─────────────────────
 * The arena's clock used to be a value computed from `Date.now()` during
 * render, sampled by a free-running `setInterval(…, 1000)` started at mount.
 * Two things followed, and both were visible:
 *
 *  1. The interval's PHASE was an accident of mount, so the boundary at which
 *     a number was *due* to change and the instant a render happened to
 *     observe it were unrelated. The transition lagged the boundary by a
 *     constant that was re-rolled on every remount.
 *  2. Worse, the interval was not the only thing that re-rendered. A poll
 *     landing between ticks recomputed `Date.now()` and flipped the digit
 *     EARLY; the interval's own tick then flipped the next one on schedule.
 *     The observed intervals therefore alternated short/long — a number that
 *     sat too long followed by one that vanished — which is exactly what
 *     "it doesn't tick like a real clock" describes.
 *
 * THE REPLACEMENT
 * ───────────────
 * The server stays authoritative and nothing here decides anything. This hook
 * returns a `nowMs` that only changes AT deadline-relative second boundaries
 * (`timerMath.msUntilSecondBoundary`), so:
 *
 *  * every projection built from it (`projectTimer`, both the desktop and the
 *    mobile clock, which read ONE `header.timer`) is a pure function of a
 *    value that is stable between boundaries — a poll, a rerender or a parent
 *    state change cannot move the digit;
 *  * each visible number occupies its own real second, because the schedule
 *    is anchored on `deadline`, never on mount;
 *  * a resync (a new deadline, or corrected skew) re-anchors rather than
 *    restarting a cadence: the boundaries are properties of the deadline, so
 *    a tiny correction moves them by that tiny amount and produces no extra
 *    transition;
 *  * a backgrounded tab, whose timers the browser clamps, snaps to the true
 *    remaining value on return — `visibilitychange` resyncs immediately and
 *    no missed second is animated through.
 */
import { useEffect, useState } from "react";

import { msUntilSecondBoundary } from "../timerMath";

/**
 * A `nowMs` that advances only at the deadline's own second boundaries.
 *
 * `deadlineIso` null (no active round) parks the hook: it returns the instant
 * of its last sample and schedules nothing.
 */
export function useCountdownNow(
  deadlineIso: string | null | undefined,
  skewMs: number,
): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineIso) return;
    let timer: number | undefined;
    const sync = () => {
      const now = Date.now();
      // Sampling `Date.now()` is the whole update. The displayed integer is
      // derived from it by the caller, so a sample that lands on the same
      // second as the last one is a wasted render and never a wrong value.
      setNowMs(now);
      const delay = msUntilSecondBoundary(deadlineIso, skewMs, now);
      if (delay === null) return;
      // A few ms past the boundary, not before it: `setTimeout` is allowed to
      // fire a hair early, and an early fire would sample a `now` that still
      // shows the OLD number and then have to schedule again — a duplicate
      // render for one digit. Overshooting by a frame cannot do that, and is
      // invisible.
      timer = window.setTimeout(sync, delay + 6);
    };
    sync();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Snap, do not catch up. The value is derived from the clock, so one
      // fresh sample IS the correct remaining time; the missed seconds are
      // not replayed.
      if (timer !== undefined) window.clearTimeout(timer);
      sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deadlineIso, skewMs]);

  return nowMs;
}
