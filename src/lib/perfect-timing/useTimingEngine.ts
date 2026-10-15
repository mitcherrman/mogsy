/**
 * PT2 — Perfect Timing: the React binding for `timingEngine.ts`.
 *
 * This hook owns the three things the pure engine must not: turning DOM input
 * into timestamps, protecting against one physical press arriving as several
 * events, and reacting to the page being hidden. It renders nothing and shows
 * no time — the elapsed value is only ever handed to `onStopped`, so a consumer
 * cannot accidentally leak it while the interval is running.
 *
 * TIME SOURCE
 * ───────────
 * `event.timeStamp` of the NATIVE event, falling back to `performance.now()`.
 * Never `Date.now()`, and never React's own `SyntheticEvent.timeStamp`: React
 * substitutes `Date.now()` when the native stamp is 0, which would put one end
 * of an interval on the wall clock.
 *
 * STATE
 * ─────
 * The authoritative state lives in a ref and is advanced synchronously, so two
 * events delivered before React re-renders (a pointer and a key for one press)
 * both see the up-to-date phase. The `useState` copy exists only to re-render.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, KeyboardEventHandler, PointerEvent as ReactPointerEvent, PointerEventHandler } from "react";

import {
  INITIAL_TIMING_STATE,
  acceptsPress,
  reduceTiming,
  type TimingEvent,
  type TimingPhase,
  type TimingState,
} from "./timingEngine";

/**
 * A second event whose timestamp falls within this window of an ACCEPTED press
 * is the same physical press (pointer + key, or a duplicated delivery) and is
 * dropped. Deliberately survives `arm()`: a duplicate that arrives after the
 * next round was armed must not start it.
 */
export const PRESS_DEDUPE_MS = 50;

/**
 * Props to spread onto exactly ONE element. Structurally identical to PT1's
 * `PtPressSurfaceProps` (`viewModel.ts`), so a value of this type is assignable
 * to it; it is declared here only because PT2 may not import a PT1-owned file.
 */
export interface TimingPressSurfaceProps {
  onPointerDown: PointerEventHandler;
  onKeyDown: KeyboardEventHandler;
  tabIndex: 0;
  role: "button";
  "aria-label": string;
  "aria-disabled": boolean;
}

/**
 * Observations for debugging and the PT4 device check. None of these affects
 * state. `press` carries the raw timestamp so the real `event.timeStamp`
 * granularity on a device can be read off a few rounds.
 */
export type TimingDiagnostic =
  | { kind: "press"; source: "pointer" | "key"; t: number; phase: TimingPhase }
  | { kind: "dedupe"; source: "pointer" | "key"; t: number; sincePreviousMs: number }
  | { kind: "blur"; phase: TimingPhase };

export interface UseTimingEngineOptions {
  /**
   * Called once, synchronously inside the stopping input event, with the
   * integer milliseconds to submit and the round it belongs to. Not called for
   * an interrupted attempt.
   */
  onStopped?: (elapsedMs: number, roundId: string) => void;
  onDiagnostic?: (diagnostic: TimingDiagnostic) => void;
}

export interface UseTimingEngine {
  state: TimingState;
  /** Begin a round: `armed`, with any previous measurement cleared. */
  arm: (roundId: string) => void;
  /** Return to `idle`. */
  reset: () => void;
  press: TimingPressSurfaceProps;
}

/**
 * Static per phase on purpose: the label may change when the attempt starts
 * (a state change the player caused) but must not vary while it runs.
 */
export const PRESS_LABEL: Readonly<Record<TimingPhase, string>> = Object.freeze({
  idle: "Timing not ready",
  armed: "Start timing",
  running: "Stop timing",
  stopped: "Timing locked",
  interrupted: "Timing interrupted",
});

function timestampOf(native: { timeStamp: number }): number {
  return native.timeStamp || performance.now();
}

function isPressKey(e: ReactKeyboardEvent): boolean {
  return e.key === " " || e.key === "Spacebar" || e.key === "Enter";
}

export function useTimingEngine(options: UseTimingEngineOptions = {}): UseTimingEngine {
  const [state, setState] = useState<TimingState>(INITIAL_TIMING_STATE);
  const stateRef = useRef<TimingState>(INITIAL_TIMING_STATE);
  const lastAcceptedRef = useRef<number | null>(null);
  const liveRef = useRef(true);

  // Callbacks are read through a ref so the handlers below keep a stable
  // identity and a changing `onStopped` never re-subscribes anything.
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const dispatch = useCallback((event: TimingEvent): boolean => {
    if (!liveRef.current) return false;
    const prev = stateRef.current;
    const next = reduceTiming(prev, event);
    if (next === prev) return false;
    stateRef.current = next;
    setState(next);
    if (next.phase === "stopped" && prev.phase !== "stopped") {
      optionsRef.current.onStopped?.(next.elapsedMs, next.roundId);
    }
    return true;
  }, []);

  const handlePress = useCallback(
    (t: number, source: "pointer" | "key") => {
      const last = lastAcceptedRef.current;
      if (last !== null && Math.abs(t - last) <= PRESS_DEDUPE_MS) {
        optionsRef.current.onDiagnostic?.({ kind: "dedupe", source, t, sincePreviousMs: t - last });
        return;
      }
      const phase = stateRef.current.phase;
      if (dispatch({ type: "PRESS", t })) {
        lastAcceptedRef.current = t;
        optionsRef.current.onDiagnostic?.({ kind: "press", source, t, phase });
      }
    },
    [dispatch],
  );

  const onPointerDown = useCallback<PointerEventHandler>(
    (e: ReactPointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      // Stops the synthesized mouse events and focus change that would
      // otherwise follow, and so a second delivery of the same press.
      e.preventDefault();
      handlePress(timestampOf(e.nativeEvent), "pointer");
    },
    [handlePress],
  );

  const onKeyDown = useCallback<KeyboardEventHandler>(
    (e: ReactKeyboardEvent) => {
      if (!isPressKey(e)) return;
      // Leave Ctrl/Cmd/Alt chords (IME switches, browser shortcuts) alone.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Space would scroll the page; Enter would activate a parent form.
      e.preventDefault();
      if (e.repeat) return;
      handlePress(timestampOf(e.nativeEvent), "key");
    },
    [handlePress],
  );

  useEffect(() => {
    liveRef.current = true;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "HIDDEN" });
    };
    const onPageHide = () => {
      dispatch({ type: "PAGEHIDE" });
    };
    // Logged only. A blur is usually a devtools click or an OS overlay, and
    // voiding the attempt for it is an owner decision (audit §3.2).
    const onBlur = () => {
      optionsRef.current.onDiagnostic?.({ kind: "blur", phase: stateRef.current.phase });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onBlur);
    return () => {
      liveRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onBlur);
    };
  }, [dispatch]);

  const arm = useCallback((roundId: string) => void dispatch({ type: "ARM", roundId }), [dispatch]);
  const reset = useCallback(() => void dispatch({ type: "RESET" }), [dispatch]);

  const phase = state.phase;
  const press = useMemo<TimingPressSurfaceProps>(
    () => ({
      onPointerDown,
      onKeyDown,
      tabIndex: 0,
      role: "button",
      "aria-label": PRESS_LABEL[phase],
      "aria-disabled": !acceptsPress(phase),
    }),
    [onPointerDown, onKeyDown, phase],
  );

  return { state, arm, reset, press };
}
