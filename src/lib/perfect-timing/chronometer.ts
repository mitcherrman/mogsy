/**
 * PT5.2 — the Arcane Chronometer: what the visible stopwatch shows, as pure
 * functions of the engine's own readings.
 *
 * DISPLAY ONLY. The chronometer is drawn FROM the timing engine (PT2): its
 * start is the engine's `t0` (the native input timestamp of the cast), and the
 * value it freezes on is the engine's `elapsedMs` — the integer the page sends
 * to `lock`. Nothing here measures a press, and nothing here is ever sent to
 * the server: there is no second grading clock.
 *
 * NO SECRET. The only inputs are the engine's timestamps and the round id. The
 * dealt ability, its rank, an item and the server's target never reach this
 * file, so neither the digits nor the once-a-second beat can carry them. The
 * beat lands on WHOLE ELAPSED SECONDS for every round alike; the only accent is
 * a fixed every-fifth-second mark, the same for every ability.
 */

/** What the stage hands the chronometer: the engine's two readings. */
export interface PtClockReading {
  /** The engine's start timestamp (`performance.now()` timeline), or null when not running. */
  t0: number | null;
  /** The engine's measured interval once stopped (integer ms), or null. */
  elapsedMs: number | null;
}

/**
 * A second boundary seen later than this after it passed (a dropped or late
 * animation frame, a busy main thread) is skipped, never played late: a tick
 * that lands after its second is worse than none, and a burst of catch-up
 * ticks would be worse still.
 */
export const CHRONO_TICK_LATE_MS = 180;

/** Every fifth whole second is a stronger mark: fixed, the same for every round. */
export const CHRONO_MARK_EVERY_S = 5;

/** The sweep makes one revolution per minute, whatever the ability. */
export const CHRONO_SWEEP_PERIOD_MS = 60_000;

/** Above this the readout needs three integer digits (100.00 s and up). */
export const CHRONO_WIDE_FROM_MS = 100_000;

/** Elapsed display time while running: `now − t0`, never negative. */
export function runningMs(t0: number, now: number): number {
  const d = now - t0;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * The running readout: seconds with two places, TRUNCATED, so the digits never
 * claim a hundredth that has not fully passed. 5439.9 → "5.43".
 */
export function formatRunning(ms: number): string {
  const centis = Math.floor(Math.max(0, ms) / 10);
  return `${Math.floor(centis / 100)}.${String(centis % 100).padStart(2, "0")}`;
}

/**
 * The frozen readout: the engine's submitted integer, printed exactly as the
 * reveal prints "You" (`formatSeconds` without its unit), so the clock and the
 * reveal can never disagree about the same stop.
 */
export function formatLocked(elapsedMs: number): string {
  return (Math.max(0, elapsedMs) / 1000).toFixed(2);
}

/** The sweep's angle in degrees (0 = twelve o'clock) for an elapsed time. */
export function sweepDegrees(ms: number): number {
  return ((Math.max(0, ms) % CHRONO_SWEEP_PERIOD_MS) / CHRONO_SWEEP_PERIOD_MS) * 360;
}

/** Per-round memory of the last whole second the beat answered. */
export interface SecondWatch {
  roundId: string;
  second: number;
}

export interface SecondBeat {
  /** The whole elapsed second that just passed (1, 2, 3 …). */
  second: number;
  /** True on every fifth second. */
  mark: boolean;
  /** Unique per round and second: `perfect-timing:<round>:tick:<n>`. */
  eventId: string;
}

/**
 * Observe one frame. Returns the new watch and, at most, ONE beat: the newest
 * whole second, and only when the frame arrives within `CHRONO_TICK_LATE_MS`
 * of it. A frame that jumps several seconds (a long stall) advances the watch
 * silently. A new round id starts a fresh watch at second 0 (no beat at 0).
 */
export function observeSecond(
  watch: SecondWatch | null,
  sample: { roundId: string; ms: number },
): { watch: SecondWatch; beat: SecondBeat | null } {
  const base: SecondWatch = watch && watch.roundId === sample.roundId ? watch : { roundId: sample.roundId, second: 0 };
  const second = Math.floor(Math.max(0, sample.ms) / 1000);
  if (second <= base.second) return { watch: base, beat: null };
  const next: SecondWatch = { roundId: sample.roundId, second };
  const late = sample.ms - second * 1000;
  if (late > CHRONO_TICK_LATE_MS) return { watch: next, beat: null };
  return {
    watch: next,
    beat: { second, mark: second % CHRONO_MARK_EVERY_S === 0, eventId: `perfect-timing:${sample.roundId}:tick:${second}` },
  };
}
