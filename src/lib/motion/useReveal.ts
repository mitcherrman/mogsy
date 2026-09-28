/**
 * HUB6 — a one-shot reveal: 0 → 1 once, the first time an element is seen.
 *
 * Built on the GRAPH1 playback clock (`usePlaybackClock`), so a reveal
 * advances by rAF timestamp delta exactly like a race does: the same speed at
 * 60/120/144 Hz, and a hidden tab does not burn through it.
 *
 * WHEN IT RUNS
 * ────────────
 * It starts when the element first intersects the viewport, so a ring below
 * the fold draws when the reader reaches it rather than off-screen. It never
 * loops and never replays on re-render.
 *
 * WHEN IT DOES NOT
 * ────────────────
 * Progress is 1 from the first render — the final state, nothing withheld —
 * when motion is reduced (the OS preference OR the app's own Reduce Motion,
 * via `useReducedMotionPreference`), or when the environment has no
 * IntersectionObserver / requestAnimationFrame (jsdom, SSR). Motion only ever
 * describes reveal order; it never delays access to a value.
 */
import { useEffect, useRef } from "react";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { clamp01, easeOutCubic } from "@/lib/motion/easing";
import { usePlaybackClock } from "@/lib/motion/usePlaybackClock";

export function canAnimate(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.IntersectionObserver === "function" &&
    typeof window.requestAnimationFrame === "function"
  );
}

export interface Reveal<T extends Element> {
  ref: React.RefObject<T>;
  /** Eased progress, 0 → 1. Exactly 1 whenever motion is not wanted. */
  progress: number;
}

export function useReveal<T extends Element = HTMLDivElement>({
  durationMs = 700,
  delayMs = 0,
}: { durationMs?: number; delayMs?: number } = {}): Reveal<T> {
  const ref = useRef<T>(null);
  const reduced = useReducedMotionPreference();
  const animate = canAnimate() && !reduced;
  const clock = usePlaybackClock(durationMs + delayMs);
  const { play } = clock;
  const started = useRef(false);

  useEffect(() => {
    if (!animate || started.current) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          started.current = true;
          io.disconnect();
          play();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [animate, play]);

  const progress = animate ? easeOutCubic(clamp01((clock.timeMs - delayMs) / durationMs)) : 1;
  return { ref, progress };
}

/** A value's share of a reveal, for staggered pieces of one figure: the
 *  `index`-th of `count` items starts a little after the one before it. */
export function staggered(progress: number, index: number, count: number, spread = 0.5): number {
  if (count <= 1) return progress;
  const start = (index / (count - 1)) * spread;
  return clamp01((progress - start) / (1 - spread));
}

/** Whether a surface may run its own entrance motion (e.g. a chart library's
 *  mount animation): an animating environment and neither reduced-motion
 *  switch set. */
export function useMotionAllowed(): boolean {
  const reduced = useReducedMotionPreference();
  return canAnimate() && !reduced;
}
