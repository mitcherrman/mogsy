/**
 * Academy Pulse — the rotation clock.
 *
 * Owns the reducer (pulse-rotation.ts), builds the current cycle from the
 * cadence, and runs ONE timeout for the current scene's dwell. The timeout is
 * paused (its remaining time kept) whenever any hold appears, so a scene the
 * viewer stopped to read never loses its time. Nothing here re-renders per
 * frame: the progress bar is a CSS animation mirroring the same clock.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, type RefObject } from "react";

import { buildPulseCycle } from "./model/pulse-cadence";
import { initialRotation, isRotating, rotationReducer, type PulseHold } from "./model/pulse-rotation";
import { dwellFor, type PulseCadence, type PulseCatalogue, type PulseItem } from "./model/pulse-types";

/** How long a scene interaction holds the rotation after the last touch. */
export const INTERACTION_HOLD_MS = 10_000;

export interface PulseRotation {
  items: PulseItem[];
  current: PulseItem | null;
  index: number;
  epoch: number;
  direction: 1 | -1;
  playing: boolean;
  /** The viewer's own Pause is on. */
  userPaused: boolean;
  /** Every active hold (diagnostics). */
  holds: ReadonlySet<PulseHold>;
  dwellMs: number;
  next(): void;
  prev(): void;
  goTo(index: number): void;
  toggle(): void;
  hold(reason: PulseHold, on: boolean): void;
  /** A meaningful interaction with the current scene. */
  interact(): void;
}

export function usePulseRotation(
  catalogue: PulseCatalogue,
  cadence: PulseCadence,
  opts: { startPaused: boolean; rootRef: RefObject<HTMLElement>; startAt?: string },
): PulseRotation {
  const [state, dispatch] = useReducer(rotationReducer, undefined, () => {
    const first = buildPulseCycle(catalogue, cadence, 0);
    return initialRotation(first.length, opts.startPaused, opts.startAt ? first.findIndex((i) => i.id === opts.startAt) : 0);
  });
  const items = useMemo(() => buildPulseCycle(catalogue, cadence, state.cycle), [catalogue, cadence, state.cycle]);
  useEffect(() => {
    if (items.length !== state.length) dispatch({ type: "resize", length: items.length });
  }, [items.length, state.length]);

  const current = items[state.index] ?? null;
  const playing = isRotating(state);
  const dwellMs = current ? dwellFor(current) : 0;

  // the dwell clock: remaining time survives holds; a new scene resets it
  const clock = useRef({ epoch: -1, remaining: 0 });
  useEffect(() => {
    if (clock.current.epoch !== state.epoch) clock.current = { epoch: state.epoch, remaining: dwellMs };
    if (!playing || !current) return;
    const started = performance.now();
    const t = window.setTimeout(() => dispatch({ type: "advance" }), Math.max(0, clock.current.remaining));
    return () => {
      window.clearTimeout(t);
      clock.current.remaining = Math.max(0, clock.current.remaining - (performance.now() - started));
    };
  }, [state.epoch, playing, current, dwellMs]);

  // an interaction holds the rotation until it has been quiet for a while
  const interactionTimer = useRef<number | null>(null);
  const interact = useCallback(() => {
    dispatch({ type: "hold", reason: "interaction", on: true });
    if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(() => {
      interactionTimer.current = null;
      dispatch({ type: "hold", reason: "interaction", on: false });
    }, INTERACTION_HOLD_MS);
  }, []);
  useEffect(() => () => { if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current); }, []);
  // a manual move ends the interaction hold in the reducer; its timer goes with it
  useEffect(() => {
    if (state.holds.has("interaction") || interactionTimer.current === null) return;
    window.clearTimeout(interactionTimer.current);
    interactionTimer.current = null;
  }, [state.holds]);

  // off screen or in a hidden tab: hold
  useEffect(() => {
    const el = opts.rootRef.current;
    const io = el && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => dispatch({ type: "hold", reason: "offscreen", on: !e.isIntersecting }), { threshold: 0.25 })
      : null;
    if (el) io?.observe(el);
    const onVis = () => dispatch({ type: "hold", reason: "hidden", on: document.hidden });
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => { io?.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [opts.rootRef]);

  return {
    items,
    current,
    index: state.index,
    epoch: state.epoch,
    direction: state.direction,
    playing,
    userPaused: state.holds.has("user"),
    holds: state.holds,
    dwellMs,
    next: useCallback(() => dispatch({ type: "next" }), []),
    prev: useCallback(() => dispatch({ type: "prev" }), []),
    goTo: useCallback((index: number) => dispatch({ type: "goto", index }), []),
    toggle: useCallback(() => dispatch({ type: "toggle-user" }), []),
    hold: useCallback((reason: PulseHold, on: boolean) => dispatch({ type: "hold", reason, on }), []),
    interact,
  };
}
