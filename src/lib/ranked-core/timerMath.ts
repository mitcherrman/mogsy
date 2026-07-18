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
