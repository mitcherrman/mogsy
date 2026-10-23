/**
 * ATL-P1-C — one motion vocabulary for the Atlas prototype.
 *
 * Same ease as the Worlds experience (quick-out, soft landing, no springs).
 * Three durations: plate (a Lens arriving or leaving the dock), facet (values
 * re-settling after a context change) and chip (a state seal appearing).
 * Under reduced motion every variant collapses to a short opacity change and
 * layout animation is switched off entirely.
 */
import type { Transition, Variants } from "framer-motion";

export const ATLAS_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const ATLAS_DURATION = { plate: 0.3, facet: 0.2, chip: 0.16, reduced: 0.12 } as const;

export function plateVariants(reduced: boolean): Variants {
  if (reduced) return { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };
  return {
    enter: { opacity: 0, y: 18, scale: 0.98 },
    center: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.985 },
  };
}

export function facetVariants(reduced: boolean): Variants {
  if (reduced) return { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };
  return { enter: { opacity: 0, y: 6 }, center: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } };
}

export function chipVariants(reduced: boolean): Variants {
  if (reduced) return { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };
  return { enter: { opacity: 0, scale: 0.85 }, center: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.9 } };
}

export function atlasTransition(duration: number, reduced: boolean): Transition {
  return { duration: reduced ? ATLAS_DURATION.reduced : duration, ease: ATLAS_EASE };
}
