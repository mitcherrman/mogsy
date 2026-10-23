/**
 * The Tournament Arena's motion language. One curve (the Worlds experience's
 * quick-out / soft-landing ease), a few durations, and the rule that every
 * beat is short, skippable and idempotent on resume.
 *
 * Reduced motion is ONE answer everywhere: `useReducedMotionPreference` (OS
 * query OR the app's own toggle). Never framer's `useReducedMotion` alone.
 */
import type { Transition, Variants } from "framer-motion";

import { EASE_OUT } from "@/components/pro-play/worlds-experience/motion";

export { EASE_OUT };

export const TA = {
  /** A card rising into place. */
  card: 0.42,
  /** A connector drawing itself. */
  draw: 0.5,
  /** A winner travelling along a connector. */
  glide: 0.9,
  /** A title plate (stinger) on screen. */
  stinger: 1700,
  /** The finals intro's auto-dismiss. */
  finalsIntro: 3200,
  /** Stagger between rounds on first reveal. */
  roundStagger: 0.16,
  reduced: 0.12,
} as const;

export const spring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
export const ease = (duration: number, delay = 0): Transition => ({ duration, delay, ease: EASE_OUT });

/** Rise-and-fade for cards; final state only under reduced motion. */
export function riseVariants(reduced: boolean): Variants {
  if (reduced) return { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: TA.reduced } } };
  return {
    hidden: { opacity: 0, y: 18, scale: 0.97 },
    shown: (delay: number = 0) => ({ opacity: 1, y: 0, scale: 1, transition: ease(TA.card, delay) }),
  };
}

/** Horizontal travel keyed by direction (-1 / 0 / 1) for round paging. */
export function slideVariants(distance: number, reduced: boolean): Variants {
  if (reduced) return { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };
  return {
    enter: (dir: number) => ({ opacity: 0, x: dir * distance }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -distance }),
  };
}

export const slideTransition = (reduced: boolean): Transition => ({ duration: reduced ? TA.reduced : 0.26, ease: EASE_OUT });
