/**
 * Event cadence — maps playback TIME to playback POSITION.
 *
 * Deliberately not calendar-time playback: the race advances one event per
 * fixed base duration with a small optional pause at year boundaries, giving
 * frequent movement and visible bursts. Cadence is presentation config,
 * fully separate from authoritative race state (stateAt consumes position
 * only).
 *
 * Also the Remotion bridge: a composition maps `useCurrentFrame()` through
 * `positionAtFrame(cadence, frame, fps)` into the same stateAt engine —
 * fixed fps + fixed duration, no wall clock anywhere.
 */
import type { RaceIndex } from "./raceIndex";

export interface CadenceConfig {
  baseMsPerEvent: number;
  yearPauseMs: number;
}

export const DEFAULT_CADENCE: CadenceConfig = {
  baseMsPerEvent: 220,
  yearPauseMs: 900,
};

/** Per-step duration when a progression dataset does not declare msPerStep. */
export const DEFAULT_MS_PER_STEP = 1000;

export interface Cadence {
  /** cumulative time at which step i BEGINS (ms); length stepCount+1,
   * last entry == totalMs */
  stepStartMs: Float64Array;
  /** advance duration of step i (excludes any trailing pause) */
  advanceMs: number;
  totalMs: number;
  /** position units — steps; equals the event count for chronological races */
  stepCount: number;
  /** @deprecated same value as stepCount, kept for pre-4A callers */
  eventCount: number;
}

/**
 * Chronological races: one event per base duration, plus a pause after event
 * i when event i+1 is a later year. Progression races (Phase 4A): one LEVEL
 * per `msPerStep`, no year pauses — the synthetic level timestamps would put
 * one after every step, which is a tempo decision the dataset makes through
 * msPerStep instead.
 */
export function buildCadence(
  index: RaceIndex,
  config: CadenceConfig,
): Cadence {
  const n = index.stepCount;
  const stepStartMs = new Float64Array(n + 1);
  const advanceMs = index.progression
    ? index.progression.msPerStep ?? DEFAULT_MS_PER_STEP
    : config.baseMsPerEvent;
  let t = 0;
  for (let i = 0; i < n; i++) {
    stepStartMs[i] = t;
    t += advanceMs;
    if (
      !index.progression &&
      i + 1 < n &&
      index.eventYear[i + 1] > index.eventYear[i]
    ) {
      t += config.yearPauseMs;
    }
  }
  stepStartMs[n] = t;
  return {
    stepStartMs,
    advanceMs,
    totalMs: t,
    stepCount: n,
    eventCount: n,
  };
}

/** time (ms) -> fractional position. Within a step the position advances
 * over `advanceMs` then holds through any year pause. Monotonic, clamped. */
export function positionAtTime(cadence: Cadence, timeMs: number): number {
  const { stepStartMs, advanceMs, stepCount } = cadence;
  if (timeMs <= 0) return 0;
  if (timeMs >= cadence.totalMs) return stepCount;
  // binary search: greatest i with stepStartMs[i] <= timeMs
  let lo = 0;
  let hi = stepCount;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (stepStartMs[mid] <= timeMs) lo = mid;
    else hi = mid - 1;
  }
  const within = timeMs - stepStartMs[lo];
  return Math.min(stepCount, lo + Math.min(1, within / advanceMs));
}

/** position -> earliest time (ms) that renders it; inverse for seeking. */
export function timeAtPosition(cadence: Cadence, position: number): number {
  const p = Math.max(0, Math.min(cadence.stepCount, position));
  const k = Math.floor(p);
  if (k >= cadence.stepCount) return cadence.totalMs;
  return cadence.stepStartMs[k] + (p - k) * cadence.advanceMs;
}

/** Remotion bridge: fixed fps + frame number -> deterministic position. */
export function positionAtFrame(
  cadence: Cadence,
  frame: number,
  fps: number,
  speed = 1,
): number {
  return positionAtTime(cadence, (frame / fps) * 1000 * speed);
}
