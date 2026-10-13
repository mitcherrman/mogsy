/**
 * MPE — ONE count-up for every reward number on the end screen.
 *
 * The earned-XP figure and the collection's "420 → 423" both count from a
 * known start to a known end. They share this hook so they ease the same way,
 * finish on the exact target (never a rounding neighbour), and answer reduced
 * motion identically: `animate: false` prints the target at once.
 *
 * It animates NUMBERS it is handed. It never decides what the numbers are —
 * the caller passes the adapter's settled values, and the hook's only promise
 * is that `value === target` once `done` is true.
 */
import { useEffect, useState } from "react";

export interface CountUpOptions {
  /** Where the count starts. Defaults to 0. */
  from?: number;
  durationMs?: number;
  /** Time before the count begins, so it can wait for the row it sits in. */
  delayMs?: number;
  /** false → the true value is shown at once (reduced motion, no window). */
  animate?: boolean;
}

export interface CountUpState {
  value: number;
  /** The count has reached `target`. */
  done: boolean;
  /** The delay has elapsed and the count is running (or finished). */
  started: boolean;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCountUp(target: number, options: CountUpOptions = {}): CountUpState {
  const { from = 0, durationMs = 640, delayMs = 0, animate = true } = options;
  const [state, setState] = useState<CountUpState>(() => (
    animate && typeof window !== "undefined"
      ? { value: from, done: false, started: false }
      : { value: target, done: true, started: true }
  ));

  useEffect(() => {
    if (!animate || typeof window === "undefined") {
      setState({ value: target, done: true, started: true });
      return;
    }
    const raf: (cb: (now: number) => void) => number = typeof window.requestAnimationFrame === "function"
      ? (cb) => window.requestAnimationFrame(cb)
      : (cb) => window.setTimeout(() => cb(performance.now()), 16);
    const cancel: (id: number) => void = typeof window.cancelAnimationFrame === "function"
      ? (id) => window.cancelAnimationFrame(id)
      : (id) => window.clearTimeout(id);

    let frame = 0;
    let startedAt = 0;
    const tick = (now: number) => {
      const t = durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);
      if (t >= 1) {
        setState({ value: target, done: true, started: true });
        return;
      }
      setState({ value: Math.round(from + (target - from) * easeOutCubic(t)), done: false, started: true });
      frame = raf(tick);
    };
    setState({ value: from, done: false, started: false });
    const startTimer = window.setTimeout(() => {
      startedAt = performance.now();
      setState({ value: from, done: false, started: true });
      frame = raf(tick);
    }, Math.max(0, delayMs));
    return () => {
      window.clearTimeout(startTimer);
      if (frame) cancel(frame);
    };
  }, [target, from, durationMs, delayMs, animate]);

  return state;
}
