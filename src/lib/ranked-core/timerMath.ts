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
