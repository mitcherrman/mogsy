// ---------------------------------------------------------------------------
// Pure display-timer math using the server-deadline + clock-skew discipline
// (same reconciliation approach as the Daily Score Attack timer, without
// importing that mode). Never authoritative: the backend resolves timeouts;
// these helpers only produce countdown display values.
// ---------------------------------------------------------------------------

/**
 * Local-clock skew relative to the server, seeded from one fresh projection:
 * offset the wall clock so `deadline - now` lines up with the server's view.
 * When the server gave no remaining time, skew is 0 (trust the deadline).
 */
export function computeClockSkewMs(
  deadlineIso: string,
  serverRemainingMs: number | null,
  nowMs: number,
): number {
  if (serverRemainingMs === null) return 0;
  const deadlineEpoch = Date.parse(deadlineIso);
  if (Number.isNaN(deadlineEpoch)) return 0;
  return deadlineEpoch - nowMs - serverRemainingMs;
}

/** Milliseconds left on the shared deadline, clamped at 0. */
export function remainingMs(
  deadlineIso: string,
  skewMs: number,
  nowMs: number,
): number {
  const deadlineEpoch = Date.parse(deadlineIso);
  if (Number.isNaN(deadlineEpoch)) return 0;
  return Math.max(0, deadlineEpoch - nowMs - skewMs);
}

/** Whole seconds left (ceiling, so 0 is shown only when truly expired). */
export function remainingSeconds(
  deadlineIso: string,
  skewMs: number,
  nowMs: number,
): number {
  return Math.ceil(remainingMs(deadlineIso, skewMs, nowMs) / 1000);
}

/**
 * Milliseconds until the round becomes ANSWERABLE, clamped at 0.
 *
 * The server opens a round in the future when the client is still showing the
 * previous one's result and this module's name — `started_at` is that moment,
 * and `active_deadline` is `started_at + duration`, so the configured answer
 * time begins at the boundary rather than while a player is watching an
 * animation. Before it, this is positive; at and after it, 0.
 *
 * Skew-corrected like every other reading here, and display-only in the same
 * sense: the backend refuses a submission received before the boundary
 * (`DuelRound.submit_answer`), so this decides what the UI shows and offers,
 * never what is legal.
 */
export function msUntilAnswerable(
  startedAtIso: string,
  skewMs: number,
  nowMs: number,
): number {
  const startedEpoch = Date.parse(startedAtIso);
  if (Number.isNaN(startedEpoch)) return 0;
  return Math.max(0, startedEpoch - nowMs - skewMs);
}

/**
 * RFX1 2B3 — WHEN THE DISPLAYED NUMBER NEXT CHANGES, in local ms from now.
 *
 * The countdown's visible transitions belong to the DEADLINE, not to whenever
 * a component happened to mount. `remainingSeconds` is a ceiling, so the shown
 * number changes exactly when the remaining time crosses `(shown - 1) * 1000`
 * — i.e. at `deadline - k*1000` for whole k. This returns the distance to the
 * next such instant, so a caller can schedule one timeout at it instead of
 * sampling on a free-running interval whose phase is an accident of mount.
 *
 * `null` means there is nothing left to schedule: the deadline has passed (or
 * cannot be parsed), and the display is pinned at 0 for ever.
 */
export function msUntilSecondBoundary(
  deadlineIso: string,
  skewMs: number,
  nowMs: number,
): number | null {
  const deadlineEpoch = Date.parse(deadlineIso);
  if (Number.isNaN(deadlineEpoch)) return null;
  const remaining = deadlineEpoch - nowMs - skewMs;
  if (remaining <= 0) return null;
  // The instant the ceiling drops by one. At a whole second exactly (30000)
  // that is a FULL second away (29000), which is what makes "30" occupy one
  // real second rather than vanishing the moment it appears.
  return remaining - (Math.ceil(remaining / 1000) - 1) * 1000;
}

/**
 * RFX1 2B3 — THE CLOCK-SKEW RESYNC RULE.
 *
 * `snapshotSkewMs` is `serverTime − localNowAtReceipt`. The server stamps
 * `serverTime` when it BUILDS the response, and the client reads its own
 * clock after the whole round trip, so every single reading UNDERSTATES the
 * true offset by that response's travel time — and travel time varies from
 * poll to poll by however much the network does.
 *
 * Adopting each reading verbatim is what let polling move the countdown's
 * boundaries. `remaining = deadline − now − skew`, so a 200 ms swing in the
 * skew moves every boundary by 200 ms, and one displayed second becomes 800
 * or 1200 ms long. That is a real, visible irregularity on a real network,
 * and it is invisible on localhost — which is why it survived so long.
 *
 * The rule: KEEP THE HIGHEST READING. The least-delayed round trip is the
 * most accurate one, and it is also the SAFE one — an overstated skew shows
 * the player less time than they have, never more. A genuine correction (the
 * device clock moves, the tab was suspended for a long time) is a large step
 * DOWN, and that is adopted at once; ordinary latency noise never is.
 *
 * `RESYNC_THRESHOLD_MS` is the line between the two. Small enough that a real
 * clock change is picked up immediately, large enough that no plausible
 * round-trip spread reaches it — and it bounds the displayed error either
 * way, which is why cosmetic smoothing can never make the answer window
 * wrong. The backend remains the only authority on a submission's legality.
 */
export const SKEW_RESYNC_THRESHOLD_MS = 750;

/** The skew to keep, given the one held and a fresh reading. */
export function reconciledSkewMs(current: number | null, reading: number): number {
  if (current === null) return reading;
  if (reading > current) return reading;
  // A step DOWN this large is not latency; it is the clock itself moving.
  if (current - reading > SKEW_RESYNC_THRESHOLD_MS) return reading;
  return current;
}
