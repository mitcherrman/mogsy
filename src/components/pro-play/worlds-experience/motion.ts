/**
 * The Worlds experience's motion language (UX1). One place for every
 * duration, curve and offset, so the shell, the stage switch and the detail
 * panel move as one system.
 *
 * - Screens travel the furthest (a 56px slide) because they are the biggest
 *   spatial step; stages half that; detail content a short 16px settle.
 * - One curve, a quick-out / soft-landing ease (no springs, no overshoot):
 *   motion explains where things went and gets out of the way.
 * - Entering and leaving content move at the same time (`popLayout`), so a
 *   click is answered on the next frame rather than after an exit.
 * - Reduced motion: no travel at all, a short opacity change only.
 */
import type { Transition, Variants } from "framer-motion";

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DURATION = {
  screen: 0.28,
  stage: 0.24,
  panel: 0.22,
  reduced: 0.12,
} as const;

export const OFFSET = { screen: 56, stage: 28, panel: 16 } as const;

/** Horizontal travel for content keyed by position; `custom` is the direction (-1 / 0 / 1). */
export function slideVariants(distance: number, reduced: boolean): Variants {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }
  return {
    enter: (dir: number) => ({ opacity: 0, x: dir * distance }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -distance }),
  };
}

export function slideTransition(duration: number, reduced: boolean): Transition {
  return { duration: reduced ? DURATION.reduced : duration, ease: EASE_OUT };
}
