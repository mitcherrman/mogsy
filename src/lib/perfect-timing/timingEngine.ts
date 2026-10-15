/**
 * PT2 — Perfect Timing: the pure timing state machine.
 *
 * WHAT THIS IS
 * ────────────
 * A deterministic reducer for one start/stop measurement: the player presses
 * to start, imagines the cooldown running, and presses again when they think it
 * is up. The elapsed interval is the difference of two input timestamps. There
 * is no timer, interval, animation frame or `Date.now()` anywhere in here — the
 * engine is a function of the timestamps it is handed, so every behaviour below
 * is reproducible with fake numbers.
 *
 * WHAT IT DOES NOT DO
 * ───────────────────
 * It does not read the DOM, decide what a "press" is, talk to the network or
 * grade anything. The server grades; this only measures. The hook that feeds it
 * events lives in `useTimingEngine.ts`.
 *
 * INTEGRITY — READ BEFORE DESCRIBING THIS TO ANYONE
 * ─────────────────────────────────────────────────
 * The value produced here is a duration measured in the player's browser. The
 * server cannot verify it, only bound it from above, and a modified client can
 * submit anything inside that bound. It is an honest *measurement*, not a
 * tamper-proof one, and nothing built on it may claim otherwise.
 *
 * TIMELINE
 * ────────
 * Every timestamp is a `DOMHighResTimeStamp` — milliseconds on the monotonic
 * timeline shared by `event.timeStamp` and `performance.now()`. The engine
 * rejects non-finite values and treats a negative interval (which can only come
 * from two readings taken on different timelines) as an interruption rather
 * than guessing which reading was wrong.
 */

/** A stop earlier than this after the start is a double-tap, not an answer. */
export const MIN_RUN_MS = 250;

/**
 * Longest interval the lock contract accepts (`elapsed_ms` is 0..600000). An
 * attempt that would round to more than this is void, not clamped: clamping
 * would turn a walked-away-from tab into a plausible-looking 10-minute answer.
 */
export const MAX_ELAPSED_MS = 600_000;

export type TimingPhase = "idle" | "armed" | "running" | "stopped" | "interrupted";

/**
 * Why a running attempt was voided.
 *  - `hidden`   the document became hidden (tab switch, minimise, lock screen)
 *  - `pagehide` the page is being unloaded or frozen
 *  - `clock`    the stop timestamp preceded the start (mixed timelines)
 *  - `timeout`  the interval exceeds `MAX_ELAPSED_MS`
 */
export type InterruptReason = "hidden" | "pagehide" | "clock" | "timeout";

interface TimingStateBase {
  readonly phase: TimingPhase;
  readonly roundId: string | null;
  readonly t0: number | null;
  readonly elapsedMs: number | null;
  readonly interruptReason: InterruptReason | null;
}

export interface IdleTimingState extends TimingStateBase {
  readonly phase: "idle";
  readonly roundId: null;
  readonly t0: null;
  readonly elapsedMs: null;
  readonly interruptReason: null;
}

export interface ArmedTimingState extends TimingStateBase {
  readonly phase: "armed";
  readonly roundId: string;
  readonly t0: null;
  readonly elapsedMs: null;
  readonly interruptReason: null;
}

export interface RunningTimingState extends TimingStateBase {
  readonly phase: "running";
  readonly roundId: string;
  readonly t0: number;
  readonly elapsedMs: null;
  readonly interruptReason: null;
}

export interface StoppedTimingState extends TimingStateBase {
  readonly phase: "stopped";
  readonly roundId: string;
  readonly t0: number;
  /** Integer milliseconds, 0..MAX_ELAPSED_MS — ready for the lock body. */
  readonly elapsedMs: number;
  readonly interruptReason: null;
}

export interface InterruptedTimingState extends TimingStateBase {
  readonly phase: "interrupted";
  readonly roundId: string;
  readonly t0: null;
  readonly elapsedMs: null;
  readonly interruptReason: InterruptReason;
}

/**
 * `{ phase, roundId, t0, elapsedMs, interruptReason }`, narrowed per phase so a
 * consumer that has checked `phase === "stopped"` gets a `number`, not
 * `number | null`.
 */
export type TimingState =
  | IdleTimingState
  | ArmedTimingState
  | RunningTimingState
  | StoppedTimingState
  | InterruptedTimingState;

export type TimingEvent =
  | { readonly type: "ARM"; readonly roundId: string }
  | { readonly type: "PRESS"; readonly t: number }
  | { readonly type: "HIDDEN" }
  | { readonly type: "PAGEHIDE" }
  | { readonly type: "RESET" };

export const INITIAL_TIMING_STATE: IdleTimingState = Object.freeze({
  phase: "idle",
  roundId: null,
  t0: null,
  elapsedMs: null,
  interruptReason: null,
});

function interrupted(roundId: string, reason: InterruptReason): InterruptedTimingState {
  return { phase: "interrupted", roundId, t0: null, elapsedMs: null, interruptReason: reason };
}

/**
 * Whether a press can currently change the state. The hook uses this for
 * `aria-disabled`; it is deliberately about *phase* only — the double-tap
 * guard is a property of a particular event, not of the state.
 */
export function acceptsPress(phase: TimingPhase): boolean {
  return phase === "armed" || phase === "running";
}

/**
 * The transition function.
 *
 * Returns the SAME object it was given whenever an event is ignored, so a
 * caller can detect "nothing happened" with `===` and does not need to
 * re-derive it.
 */
export function reduceTiming(state: TimingState, event: TimingEvent): TimingState {
  switch (event.type) {
    case "ARM": {
      // Re-arming is legal from every phase: it is how the next round starts
      // after a reveal, and how a voided round is replaced. It always clears
      // the previous measurement.
      if (typeof event.roundId !== "string" || event.roundId.length === 0) return state;
      return {
        phase: "armed",
        roundId: event.roundId,
        t0: null,
        elapsedMs: null,
        interruptReason: null,
      };
    }

    case "PRESS": {
      const { t } = event;
      // A timestamp that is not a finite, non-negative reading of a monotonic
      // clock carries no information. Ignore it rather than start or stop on it.
      if (!Number.isFinite(t) || t < 0) return state;

      if (state.phase === "armed") {
        return {
          phase: "running",
          roundId: state.roundId,
          t0: t,
          elapsedMs: null,
          interruptReason: null,
        };
      }
      // Idle, stopped and interrupted do not respond to input.
      if (state.phase !== "running") return state;

      const delta = t - state.t0;
      // Checked before the double-tap guard: a negative interval is a broken
      // timeline, not a fast tap, and must not be silently swallowed.
      if (delta < 0) return interrupted(state.roundId, "clock");
      if (delta < MIN_RUN_MS) return state;

      const elapsedMs = Math.round(delta);
      if (elapsedMs > MAX_ELAPSED_MS) return interrupted(state.roundId, "timeout");

      return {
        phase: "stopped",
        roundId: state.roundId,
        t0: state.t0,
        elapsedMs,
        interruptReason: null,
      };
    }

    case "HIDDEN":
      return state.phase === "running" ? interrupted(state.roundId, "hidden") : state;

    case "PAGEHIDE":
      return state.phase === "running" ? interrupted(state.roundId, "pagehide") : state;

    case "RESET":
      return INITIAL_TIMING_STATE;
  }
}
