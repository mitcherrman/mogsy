/**
 * PT5.3 — drives the 3, 2, 1 count-in of a blind round and EXECUTES its
 * automatic start.
 *
 * While `active` (the engine is in `countdown` and nothing holds the run), one
 * `requestAnimationFrame` loop reads `performance.now()` against the moment the
 * count-in began and publishes the beat on screen (a state change only when the
 * beat changes: three renders per count-in, not sixty a second). On the first
 * frame at or past `COUNT_IN_MS` it reads the clock AGAIN and calls
 * `onStart(roundId, t)` with that reading — the time the start is actually
 * executed, never the scheduled 3,000 ms, the frame's own timestamp or a CSS
 * time — inside `flushSync`, so the running state (the CAST) is committed and
 * painted in that same frame and the cast cue plays from it.
 *
 * Cancelled (nothing starts, the beat clears) when the hook goes inactive (a
 * hold, a new round, a reset), on unmount, and the moment the page is hidden or
 * left. When the page is visible again and the round is still counting in, the
 * count-in starts OVER from 3 as a new pass: a round never starts silently or
 * mid-count after the player looked away.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { countInBeatAt, countInDue, countInPassId, type CountInBeat } from "./countIn";

export interface CountInView {
  /** The beat on screen (3, 2, 1), or null when no count-in is running. */
  beat: CountInBeat | null;
  /** This pass's identity (`countInPassId`), or null. A re-count is a new pass. */
  passId: string | null;
}

const IDLE: CountInView = Object.freeze({ beat: null, passId: null }) as CountInView;

export interface UseCountInOptions {
  /** The round counting in (the engine's armed round), or null. */
  roundId: string | null;
  /** Count in now: the round waits for an automatic start and nothing holds the run. */
  active: boolean;
  /** Execute the start: `t` is `performance.now()` read as the start is executed. */
  onStart: (roundId: string, t: number) => void;
}

export function useCountIn({ roundId, active, onStart }: UseCountInOptions): CountInView {
  const [view, setView] = useState<CountInView>(IDLE);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  // Pass numbers only grow, across rounds and remounts of the effect, so two
  // passes can never share an id.
  const passRef = useRef(0);

  useLayoutEffect(() => {
    const clear = () => setView((v) => (v.beat === null && v.passId === null ? v : IDLE));
    if (!active || !roundId) { clear(); return; }
    const id = roundId;
    let live = true;
    let running = false;
    let raf = 0;
    let startedAt = 0;
    let shown: CountInBeat | null = null;
    let passId = "";

    const halt = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clear();
    };
    const loop = () => {
      raf = 0;
      if (!live || !running) return;
      const elapsed = performance.now() - startedAt;
      if (countInDue(elapsed)) {
        running = false;
        if (document.visibilityState === "hidden") { clear(); return; }
        const t = performance.now();
        flushSync(() => { onStartRef.current(id, t); });
        return;
      }
      const beat = countInBeatAt(elapsed);
      if (beat !== shown) {
        shown = beat;
        setView({ beat, passId });
      }
      raf = requestAnimationFrame(loop);
    };
    const begin = () => {
      if (!live || running) return;
      if (document.visibilityState === "hidden") { clear(); return; }
      passRef.current += 1;
      passId = countInPassId(id, passRef.current);
      startedAt = performance.now();
      shown = 3;
      running = true;
      setView({ beat: 3, passId });
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") halt();
      else begin();
    };
    const onPageHide = () => halt();
    const onPageShow = () => begin();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    begin();
    return () => {
      live = false;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [roundId, active]);

  return active ? view : IDLE;
}
