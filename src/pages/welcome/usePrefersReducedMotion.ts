import { useEffect, useState } from "react";

/**
 * `prefers-reduced-motion: reduce`, read at mount and kept live.
 *
 * Local rather than framer-motion's `useReducedMotion`, for two reasons.
 *
 * The introduction no longer renders a single `motion` component — every reveal
 * is CSS on freshly-applied rules — so importing the library purely to read a
 * media query would put it in the chunk a first-time visitor downloads before
 * anything else, for nothing.
 *
 * More importantly, framer-motion resolves this ONCE into module-level state
 * the first time any component asks. That is fine in a browser and wrong in a
 * suite: the first test file to render under reduced motion pins every later
 * one, whatever `matchMedia` they install, and the reduced-motion path silently
 * becomes the only path anything is tested against. Reading the query per mount
 * keeps each test honest.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(QUERY).matches),
  );

  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}
