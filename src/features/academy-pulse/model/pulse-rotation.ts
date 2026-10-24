/**
 * Academy Pulse — rotation state (pure reducer).
 *
 * Automatic rotation runs only while NOTHING holds it. Each hold has its own
 * reason so they never fight: the pointer resting on Pulse, keyboard focus
 * inside it, a meaningful interaction with the current scene, the expanded
 * view, the viewer's own Pause, the page being off screen or hidden. Releasing
 * one reason never resumes a rotation another reason still holds.
 *
 * Moving by hand (Previous / Next / a pip) ends the scene's interaction hold —
 * it belonged to the scene being left — and restarts the dwell clock.
 */

export type PulseHold =
  | "user"
  | "hover"
  | "focus"
  | "interaction"
  | "expanded"
  | "offscreen"
  | "hidden";

export interface PulseRotationState {
  index: number;
  length: number;
  /** Completed cycles; the scheduler rotates content inside categories by it. */
  cycle: number;
  holds: ReadonlySet<PulseHold>;
  /** Increments on every scene change, so the dwell clock and progress restart. */
  epoch: number;
  /** Direction of the last move, for the transition's choreography. */
  direction: 1 | -1;
}

export type PulseRotationAction =
  | { type: "advance" } // the dwell elapsed
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; index: number }
  | { type: "hold"; reason: PulseHold; on: boolean }
  | { type: "toggle-user" }
  | { type: "resize"; length: number };

export function initialRotation(length: number, startPaused = false, startIndex = 0): PulseRotationState {
  return {
    index: startIndex > 0 && startIndex < length ? startIndex : 0,
    length,
    cycle: 0,
    holds: new Set<PulseHold>(startPaused ? ["user"] : []),
    epoch: 0,
    direction: 1,
  };
}

export function isRotating(state: PulseRotationState): boolean {
  return state.length > 1 && state.holds.size === 0;
}

function withHold(holds: ReadonlySet<PulseHold>, reason: PulseHold, on: boolean): ReadonlySet<PulseHold> {
  if (holds.has(reason) === on) return holds;
  const next = new Set(holds);
  if (on) next.add(reason);
  else next.delete(reason);
  return next;
}

function move(state: PulseRotationState, to: number, direction: 1 | -1, manual: boolean): PulseRotationState {
  if (state.length === 0) return state;
  const wrappedForward = direction === 1 && to >= state.length;
  const wrappedBack = direction === -1 && to < 0;
  const index = ((to % state.length) + state.length) % state.length;
  const cycle = wrappedForward ? state.cycle + 1 : wrappedBack ? Math.max(0, state.cycle - 1) : state.cycle;
  return {
    ...state,
    index,
    cycle,
    direction,
    epoch: state.epoch + 1,
    holds: manual ? withHold(state.holds, "interaction", false) : state.holds,
  };
}

export function rotationReducer(state: PulseRotationState, action: PulseRotationAction): PulseRotationState {
  switch (action.type) {
    case "advance":
      // a stale timer that fires after something took hold is ignored
      return isRotating(state) ? move(state, state.index + 1, 1, false) : state;
    case "next":
      return state.length > 1 ? move(state, state.index + 1, 1, true) : state;
    case "prev":
      return state.length > 1 ? move(state, state.index - 1, -1, true) : state;
    case "goto":
      if (action.index === state.index || action.index < 0 || action.index >= state.length) return state;
      return move(state, action.index, action.index > state.index ? 1 : -1, true);
    case "hold": {
      const holds = withHold(state.holds, action.reason, action.on);
      return holds === state.holds ? state : { ...state, holds };
    }
    case "toggle-user":
      return { ...state, holds: withHold(state.holds, "user", !state.holds.has("user")) };
    case "resize": {
      if (action.length === state.length) return state;
      const index = action.length === 0 ? 0 : Math.min(state.index, action.length - 1);
      return { ...state, length: action.length, index, epoch: state.epoch + 1 };
    }
    default:
      return state;
  }
}
