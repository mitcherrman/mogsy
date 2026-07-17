/**
 * Deterministic frontend state machine for the Daily Score Attack
 * prototype. Holds frontend concerns plus the latest authoritative server
 * projection only — it never computes correctness, score, combo, speed
 * bonus, expiry, or rewards. Every game value rendered downstream comes
 * from `run`, `resolution`, or `results` exactly as the server sent them.
 */

import {
  DsaErrorCode,
  DsaHistory,
  DsaResolution,
  DsaResults,
  DsaRun,
  DsaToday,
} from "./dailyScoreAttackTypes";

export type DsaPhase =
  | "loading-metadata"
  | "unavailable"
  | "signed-out-entry"
  | "ready"
  | "starting"
  | "pre-run-countdown"
  | "active-question"
  | "submitting-answer"
  | "reveal"
  | "transitioning"
  | "reconnecting"
  | "expired"
  | "completed"
  | "official-results"
  | "practice-results"
  | "recoverable-error"
  | "terminal-error";

export type DsaSession = "account" | "anonymous" | "none";
export type DsaIntent = "official" | "practice";

export type DsaMachineState = {
  phase: DsaPhase;
  session: DsaSession;
  intent: DsaIntent;
  meta: DsaToday | null;
  run: DsaRun | null;
  resolution: DsaResolution | null;
  results: DsaResults | null;
  history: DsaHistory | null;
  /** Cosmetic pre-run count; the server clock starts only at run creation. */
  countdown: number;
  /** Previous server score, so the UI can animate old -> new. */
  previousScore: number;
  selectedIndex: number | null;
  error: { code: DsaErrorCode; message: string } | null;
};

export const INITIAL_STATE: DsaMachineState = {
  phase: "loading-metadata",
  session: "none",
  intent: "official",
  meta: null,
  run: null,
  resolution: null,
  results: null,
  history: null,
  countdown: 0,
  previousScore: 0,
  selectedIndex: null,
  error: null,
};

export type DsaAction =
  | { type: "SESSION_RESOLVED"; session: DsaSession }
  | { type: "METADATA_LOADED"; meta: DsaToday }
  | { type: "FEATURE_UNAVAILABLE" }
  | { type: "START_REQUESTED"; intent: DsaIntent }
  | { type: "COUNTDOWN_TICK" }
  | { type: "RUN_STARTED"; run: DsaRun }
  | { type: "ANSWER_SELECTED"; selectedIndex: number }
  | { type: "RESOLUTION_RECEIVED"; resolution: DsaResolution }
  | { type: "REVEAL_DONE" }
  | { type: "TRANSITION_DONE" }
  | { type: "RECONCILE_REQUESTED" }
  | { type: "RUN_SYNCED"; run: DsaRun }
  | { type: "NO_RUN" }
  | { type: "RESULTS_LOADED"; results: DsaResults }
  | { type: "HISTORY_LOADED"; history: DsaHistory }
  | { type: "SIGNED_OUT_GATE" }
  | { type: "RECOVERABLE_ERROR"; code: DsaErrorCode; message: string }
  | { type: "TERMINAL_ERROR"; code: DsaErrorCode; message: string }
  | { type: "RETRY" };

const COUNTDOWN_START = 3;

function terminalPhaseFor(run: DsaRun): DsaPhase {
  return run.status === "expired" ? "expired" : "completed";
}

function adoptTerminalRun(state: DsaMachineState, run: DsaRun): DsaMachineState {
  return {
    ...state,
    phase: terminalPhaseFor(run),
    run,
    previousScore: state.run?.total_score ?? 0,
    selectedIndex: null,
    error: null,
  };
}

function adoptActiveRun(state: DsaMachineState, run: DsaRun): DsaMachineState {
  return {
    ...state,
    phase: "active-question",
    run,
    previousScore: state.run?.total_score ?? 0,
    selectedIndex: null,
    error: null,
  };
}

const TERMINAL_PHASES: ReadonlySet<DsaPhase> = new Set([
  "official-results",
  "practice-results",
  "terminal-error",
]);

export function dsaReducer(state: DsaMachineState, action: DsaAction): DsaMachineState {
  if (state.phase === "terminal-error" && action.type !== "RETRY") return state;

  switch (action.type) {
    case "SESSION_RESOLVED":
      return { ...state, session: action.session };

    case "METADATA_LOADED": {
      if (!action.meta.enabled) return { ...state, meta: action.meta, phase: "unavailable" };
      const phase: DsaPhase = state.session === "account" || state.session === "anonymous"
        ? "ready"
        : "signed-out-entry";
      return { ...state, meta: action.meta, phase };
    }

    case "FEATURE_UNAVAILABLE":
      return { ...state, phase: "unavailable" };

    case "START_REQUESTED":
      if (state.phase !== "ready" && state.phase !== "signed-out-entry"
          && !TERMINAL_PHASES.has(state.phase) && state.phase !== "expired"
          && state.phase !== "completed") {
        return state;
      }
      return {
        ...state,
        intent: action.intent,
        phase: "pre-run-countdown",
        countdown: COUNTDOWN_START,
        resolution: null,
        results: null,
        selectedIndex: null,
        error: null,
      };

    case "COUNTDOWN_TICK": {
      if (state.phase !== "pre-run-countdown") return state;
      const next = state.countdown - 1;
      if (next > 0) return { ...state, countdown: next };
      return { ...state, countdown: 0, phase: "starting" };
    }

    case "RUN_STARTED": {
      if (action.run.status !== "active") return adoptTerminalRun(state, action.run);
      if (action.run.resumed) {
        return { ...adoptActiveRun(state, action.run), phase: "reconnecting" };
      }
      return adoptActiveRun(state, action.run);
    }

    case "ANSWER_SELECTED":
      if (state.phase !== "active-question") return state;
      return { ...state, phase: "submitting-answer", selectedIndex: action.selectedIndex };

    case "RESOLUTION_RECEIVED":
      return {
        ...state,
        phase: "reveal",
        resolution: action.resolution,
        run: action.resolution.run,
        previousScore: state.run?.total_score ?? 0,
        error: null,
      };

    case "REVEAL_DONE": {
      const run = state.resolution?.run ?? state.run;
      if (!run) return { ...state, phase: "reconnecting" };
      if (run.status !== "active") return adoptTerminalRun(state, run);
      return { ...state, phase: "transitioning" };
    }

    case "TRANSITION_DONE":
      if (state.phase !== "transitioning" || !state.run) return state;
      return { ...state, phase: "active-question", selectedIndex: null };

    case "RECONCILE_REQUESTED":
      if (TERMINAL_PHASES.has(state.phase)) return state;
      return { ...state, phase: "reconnecting" };

    case "RUN_SYNCED":
      if (action.run.status !== "active") return adoptTerminalRun(state, action.run);
      return adoptActiveRun(state, action.run);

    case "NO_RUN":
      return { ...state, phase: "ready", run: null, selectedIndex: null };

    case "RESULTS_LOADED":
      return {
        ...state,
        phase: action.results.official ? "official-results" : "practice-results",
        results: action.results,
        error: null,
      };

    case "HISTORY_LOADED":
      return { ...state, history: action.history };

    case "SIGNED_OUT_GATE":
      return { ...state, phase: "signed-out-entry" };

    case "RECOVERABLE_ERROR":
      return {
        ...state,
        phase: "recoverable-error",
        error: { code: action.code, message: action.message },
      };

    case "TERMINAL_ERROR":
      return {
        ...state,
        phase: "terminal-error",
        error: { code: action.code, message: action.message },
      };

    case "RETRY":
      return { ...INITIAL_STATE, session: state.session };

    default:
      return state;
  }
}
