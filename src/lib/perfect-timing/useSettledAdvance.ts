/**
 * PT5.1 — the way-on key for any screen that sits between two playable states
 * (the reveal, the Mastery Slice's between-stage transition).
 *
 * Once the screen has had `settleMs` to be read, focus moves to its way-on
 * button and Space/Enter anywhere on the document advance it — once, never on a
 * repeat (a held key), never when a control or text field owns the key
 * (`documentKeyIsForTimer`). Before it settles nothing advances, so a double-tap
 * that arrived with the previous screen cannot skip this one.
 *
 * It is the ONE document listener those screens share; the timer's own
 * listener is only subscribed while a round is armed or running, so the two can
 * never both be live. The host guards the next round's keys (a short
 * `keyGuard`) when it is told the advance came from a key.
 *
 * PT5.3 — AUTOMATIC PROGRESSION. With `autoAdvanceMs`, once the screen has
 * settled it also moves on by itself after that dwell (source `"auto"`), still
 * at most once: whichever comes first — the dwell, a key or a click — is the
 * only advance. The dwell runs only while the page is visible (hidden, it
 * stops; visible again, it starts over) and never while `paused` (the
 * player's hold). `autoPass` numbers each running dwell, so a presenter can
 * restart its progress cue; it is 0 while no dwell runs.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { documentKeyIsForTimer } from "./useTimingEngine";

/** How a settled screen was left: a key, the button's click (no source), or (PT5.3) its own dwell. */
export type AdvanceSource = "key" | "auto";

export interface UseSettledAdvanceOptions {
  /** The way-on button; focused once the screen has settled. */
  buttonRef: RefObject<HTMLElement>;
  /** How long after mount the screen counts as readable. */
  settleMs: number;
  /** Called at most once. `"key"` when Space/Enter (document or the focused button) did it; `"auto"` for the dwell. */
  onAdvance: (source?: AdvanceSource) => void;
  /** Off: nothing is focused and no key is heard. */
  enabled?: boolean;
  /** PT5.3: move on by itself this long after settling. Null/absent: only the player advances. */
  autoAdvanceMs?: number | null;
  /** PT5.3: the player's hold — no dwell runs while true. */
  paused?: boolean;
}

export interface SettledAdvance {
  /** True once `settleMs` has passed. */
  settled: boolean;
  /**
   * The button's own click, gated: a no-op before the screen settles and after
   * the first advance. `detail === 0` (a keyboard-generated click) counts as a key.
   */
  advanceFromClick: (detail: number) => void;
  /** PT5.3: > 0 while an automatic dwell is running (a new number per dwell); 0 otherwise. */
  autoPass: number;
}

export function useSettledAdvance({ buttonRef, settleMs, onAdvance, enabled = true, autoAdvanceMs = null, paused = false }: UseSettledAdvanceOptions): SettledAdvance {
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  const advanced = useRef(false);
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => { onAdvanceRef.current = onAdvance; });

  useEffect(() => {
    if (!enabled) return;
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    const t = window.setTimeout(() => {
      settledRef.current = true;
      setSettled(true);
      buttonRef.current?.focus({ preventScroll: true });
      onKey = (e: KeyboardEvent) => {
        if (e.repeat || advanced.current || !documentKeyIsForTimer(e)) return;
        e.preventDefault();
        advanced.current = true;
        onAdvanceRef.current("key");
      };
      document.addEventListener("keydown", onKey);
    }, settleMs);
    return () => {
      window.clearTimeout(t);
      if (onKey) document.removeEventListener("keydown", onKey);
    };
  }, [enabled, settleMs, buttonRef]);

  // PT5.3: the automatic dwell, from the moment the screen settles.
  const [autoPass, setAutoPass] = useState(0);
  const passCount = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    if (!enabled || !settled || autoAdvanceMs === null || paused) { setAutoPass(0); return; }
    let timer = 0;
    const stop = () => { if (timer) window.clearTimeout(timer); timer = 0; setAutoPass(0); };
    const fire = () => {
      timer = 0;
      if (advanced.current || pausedRef.current || document.visibilityState === "hidden") return;
      advanced.current = true;
      setAutoPass(0);
      onAdvanceRef.current("auto");
    };
    const start = () => {
      if (advanced.current || document.visibilityState === "hidden") return;
      if (timer) window.clearTimeout(timer);
      passCount.current += 1;
      setAutoPass(passCount.current);
      timer = window.setTimeout(fire, autoAdvanceMs);
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") stop(); else start(); };
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, settled, autoAdvanceMs, paused]);

  const advanceFromClick = useCallback((detail: number) => {
    if (!settledRef.current || advanced.current) return;
    advanced.current = true;
    onAdvanceRef.current(detail === 0 ? "key" : undefined);
  }, []);

  return { settled, advanceFromClick, autoPass };
}
