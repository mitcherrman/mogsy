/**
 * Structured broadcast logger.
 * --------------------------------------------------------------------------
 * A tiny, dependency-free structured logger for the 24/7 broadcast engine.
 * Every line is prefixed `[broadcast]` and carries a stable `event` key plus
 * a flat data bag, so an overnight OBS run can be diagnosed from the browser
 * console (or a captured log) without a debugger attached.
 *
 * Kept deliberately minimal: no batching, no async, no throwing. Logging must
 * never be able to break the state machine it observes.
 */

export type BroadcastLogLevel = "debug" | "info" | "warn" | "error";

export type BroadcastLogEvent =
  | "init"
  | "hydrate"
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "clear"
  | "phase"
  | "timer.schedule"
  | "timer.clear"
  | "transition.start"
  | "transition.success"
  | "advance"
  | "queue.length"
  | "queue.refill"
  | "queue.empty"
  | "reveal.fetch"
  | "reveal.fetch.retry"
  | "reveal.fetch.fail"
  | "lock"
  | "listener.error"
  | "watchdog.tick"
  | "watchdog.stall"
  | "watchdog.recover"
  | "watchdog.fallback";

/**
 * Verbose mode floods the console with per-tick/per-schedule debug lines.
 * Off by default (only info+ surfaces); flip on at runtime via
 * `window.__mogsyBroadcastVerbose = true` or `?broadcastDebug=1`.
 */
function isVerbose(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { __mogsyBroadcastVerbose?: boolean };
    if (w.__mogsyBroadcastVerbose) return true;
    return /[?&]broadcastDebug=1\b/.test(window.location?.search ?? "");
  } catch {
    return false;
  }
}

/** Now, tolerant of environments where Date.now is unavailable. */
function ts(): number {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

export function blog(
  level: BroadcastLogLevel,
  event: BroadcastLogEvent,
  data?: Record<string, unknown>,
): void {
  try {
    if (level === "debug" && !isVerbose()) return;
    const payload = { t: ts(), event, ...(data ?? {}) };
    const line = `[broadcast] ${event}`;
    const sink =
      level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    sink(line, payload);
  } catch {
    /* logging must never throw */
  }
}
