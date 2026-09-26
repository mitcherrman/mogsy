/**
 * Easing curves shared by animated surfaces. Pure functions of t ∈ [0, 1].
 *
 * `easeInOutCubic` was GRAPH1's race-row interpolation (`graph1/engine.ts`);
 * HUB6 lifted it here, unchanged, so History's reveals and the race share one
 * curve family rather than each carrying a private copy.
 */

export function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Fast out, gentle landing — for a value settling into place. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
