/**
 * RFX1 — ONE reduced-motion answer for both places a player can ask for it.
 *
 * Mogzy has two independent switches and, until now, no single reader of both:
 *
 *   * the OS `prefers-reduced-motion: reduce` media query;
 *   * the app's own Settings → Reduce Motion, which puts `reduce-motion` on
 *     `<html>` (applied pre-paint in `index.html`, toggled live by Settings).
 *
 * `usePrefersReducedMotion` (welcome) reads only the first, and the local
 * helpers in `AcademyBulletin` / `LolHub` read both but only once. This hook is
 * live for both: a media-query listener for the OS signal and a class observer
 * on `<html>` for the app's, so flipping either while a match is running is
 * reflected on the next beat.
 *
 * Safe in jsdom and SSR: a missing `window`, `matchMedia` or
 * `MutationObserver` reads as "not reduced".
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
export const APP_REDUCE_MOTION_CLASS = "reduce-motion";

export function readReducedMotionPreference(): boolean {
  if (typeof window === "undefined") return false;
  const os = Boolean(window.matchMedia?.(QUERY)?.matches);
  const app = typeof document !== "undefined"
    && document.documentElement.classList.contains(APP_REDUCE_MOTION_CLASS);
  return os || app;
}

export function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(readReducedMotionPreference);

  useEffect(() => {
    const sync = () => setReduced(readReducedMotionPreference());
    sync();
    const mq = window.matchMedia?.(QUERY);
    mq?.addEventListener?.("change", sync);
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(sync);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
    return () => {
      mq?.removeEventListener?.("change", sync);
      observer?.disconnect();
    };
  }, []);

  return reduced;
}
