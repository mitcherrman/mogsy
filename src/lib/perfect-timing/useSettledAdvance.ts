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
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { documentKeyIsForTimer } from "./useTimingEngine";

export interface UseSettledAdvanceOptions {
  /** The way-on button; focused once the screen has settled. */
  buttonRef: RefObject<HTMLElement>;
  /** How long after mount the screen counts as readable. */
  settleMs: number;
  /** Called at most once. `"key"` when Space/Enter (document or the focused button) did it. */
  onAdvance: (source?: "key") => void;
  /** Off: nothing is focused and no key is heard. */
  enabled?: boolean;
}

export interface SettledAdvance {
  /** True once `settleMs` has passed. */
  settled: boolean;
  /**
   * The button's own click, gated: a no-op before the screen settles and after
   * the first advance. `detail === 0` (a keyboard-generated click) counts as a key.
   */
  advanceFromClick: (detail: number) => void;
}

export function useSettledAdvance({ buttonRef, settleMs, onAdvance, enabled = true }: UseSettledAdvanceOptions): SettledAdvance {
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

  const advanceFromClick = useCallback((detail: number) => {
    if (!settledRef.current || advanced.current) return;
    advanced.current = true;
    onAdvanceRef.current(detail === 0 ? "key" : undefined);
  }, []);

  return { settled, advanceFromClick };
}
