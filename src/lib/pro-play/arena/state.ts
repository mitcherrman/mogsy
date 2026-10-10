/**
 * PPQ2-B — the Pro Play run as a pure state machine.
 *
 * The controller hook (`useProPlayArenaController`) owns transport and timing;
 * this module owns only what each server response DOES to the client's view,
 * so every rule below is testable without React or a network.
 *
 * Three rules carry the whole design:
 *
 *  1. THE SERVER IS THE ONLY AUTHORITY. Score, total, answered, grade, correct
 *     answer and evidence are copied from responses verbatim. Nothing here
 *     compares a selection with anything.
 *  2. ONE SUBMISSION PER QUESTION. `answerSent` is refused unless a question is
 *     on the stage, ungraded, with nothing in flight and no locked selection.
 *     The selection stays locked through every resend; only a non-retryable
 *     failure or the server's own resync releases it.
 *  3. A RESPONSE APPLIES ONLY TO THE QUESTION IT ANSWERS. A graded turn whose
 *     session or question id is not the one on the stage is dropped, so a late
 *     response can never paint a grade onto a different question.
 */
import type { ProPlayAnswerTurn, ProPlayTurn } from "../api";
import type { ProPlayApiError } from "../api";
import type { ProPlayAnswerOutcome, ProPlayAnswerRequest } from "../answerFlow";
import type { ProPlayArenaState } from "./types";

export const INITIAL_PRO_PLAY_ARENA_STATE: ProPlayArenaState = Object.freeze({
  session: null,
  question: null,
  result: null,
  resultReplayed: false,
  pendingNext: null,
  selected: null,
  busy: null,
  error: null,
  recovery: null,
  expired: false,
  outcomes: Object.freeze({}),
}) as ProPlayArenaState;

export type ProPlayArenaAction =
  | { type: "startSent" }
  | { type: "started"; turn: ProPlayTurn }
  | { type: "startFailed"; error: ProPlayApiError }
  | { type: "answerSent"; request: ProPlayAnswerRequest }
  | { type: "answerSettled"; request: ProPlayAnswerRequest; outcome: ProPlayAnswerOutcome }
  | { type: "resyncSent"; sessionId: string }
  | {
    type: "resyncSettled";
    sessionId: string;
    outcome:
      | { kind: "resynced"; turn: ProPlayTurn }
      | { kind: "expired"; error: ProPlayApiError }
      | { kind: "failed"; error: ProPlayApiError };
  }
  | { type: "advance" };

const errorOf = (error: ProPlayApiError) => ({
  message: error.message,
  code: error.code,
  status: error.status,
});

/** May this request be sent now? The exactly-once gate, as a pure predicate. */
export function canSubmitAnswer(state: ProPlayArenaState, request: ProPlayAnswerRequest): boolean {
  return (
    state.busy === null
    && state.result === null
    && !state.expired
    && state.session !== null
    && !state.session.complete
    && state.question !== null
    && state.session.session_id === request.sessionId
    && state.question.question_id === request.questionId
    && state.question.choices.includes(request.selectedAnswer)
    // A locked selection is released only by the server (resync) or by a
    // non-retryable failure; a retryable failure keeps it, and its resend
    // goes through `canResendAnswer` instead.
    && state.selected === null
  );
}

/** May the recorded retryable request be resent? Identical request only. */
export function canResendAnswer(state: ProPlayArenaState, request: ProPlayAnswerRequest): boolean {
  const pending = state.recovery?.kind === "answer" ? state.recovery.request : null;
  return (
    state.busy === null
    && state.result === null
    && pending !== null
    && pending.sessionId === request.sessionId
    && pending.questionId === request.questionId
    && pending.selectedAnswer === request.selectedAnswer
    && state.question?.question_id === request.questionId
    && state.session?.session_id === request.sessionId
  );
}

/** Adopt the server's own view of the session. No local turn state survives. */
function adopt(state: ProPlayArenaState, turn: ProPlayTurn): ProPlayArenaState {
  return {
    ...state,
    session: turn.session,
    question: turn.question,
    result: null,
    resultReplayed: false,
    pendingNext: null,
    selected: null,
    busy: null,
    error: null,
    recovery: null,
    expired: false,
  };
}

function applyGraded(
  state: ProPlayArenaState,
  request: ProPlayAnswerRequest,
  turn: ProPlayAnswerTurn,
): ProPlayArenaState {
  const question = state.question;
  // Rule 3: a grade for anything but the question on the stage is dropped.
  if (
    !question
    || question.question_id !== request.questionId
    || state.session?.session_id !== request.sessionId
    || turn.session?.session_id !== request.sessionId
  ) {
    return { ...state, busy: null };
  }
  return {
    ...state,
    session: turn.session,
    result: turn.result,
    resultReplayed: turn.replayed === true,
    pendingNext: turn.question,
    // The server's record of what it graded, which on a replay is the choice
    // it recorded the first time.
    selected: turn.result.selected_answer,
    busy: null,
    error: null,
    recovery: null,
    outcomes: {
      ...state.outcomes,
      [question.number]: turn.result.is_correct ? "correct" : "incorrect",
    },
  };
}

export function proPlayArenaReducer(
  state: ProPlayArenaState,
  action: ProPlayArenaAction,
): ProPlayArenaState {
  switch (action.type) {
    case "startSent":
      // A fresh run: nothing from the previous session survives, outcomes
      // included — they belong to the session that produced them.
      return { ...INITIAL_PRO_PLAY_ARENA_STATE, busy: "starting" };

    case "started":
      return adopt({ ...state, outcomes: {} }, action.turn);

    case "startFailed":
      return {
        ...INITIAL_PRO_PLAY_ARENA_STATE,
        error: errorOf(action.error),
        recovery: { kind: "restart" },
      };

    case "answerSent":
      if (!canSubmitAnswer(state, action.request) && !canResendAnswer(state, action.request)) {
        return state;
      }
      return {
        ...state,
        busy: "answering",
        selected: action.request.selectedAnswer,
        error: null,
        recovery: null,
      };

    case "answerSettled": {
      const { outcome, request } = action;
      if (state.session?.session_id !== request.sessionId) return state;
      switch (outcome.kind) {
        case "answered":
          return applyGraded(state, request, outcome.turn);
        case "resynced":
          return outcome.turn.session?.session_id === request.sessionId
            ? adopt(state, outcome.turn)
            : { ...state, busy: null };
        case "expired":
          return {
            ...state,
            busy: null,
            expired: true,
            error: errorOf(outcome.error),
            recovery: { kind: "restart" },
          };
        case "failed":
          return outcome.retryable
            ? {
              ...state,
              busy: null,
              error: errorOf(outcome.error),
              recovery: { kind: "answer", request },
            }
            : {
              ...state,
              busy: null,
              selected: null,
              error: errorOf(outcome.error),
              recovery: { kind: "restart" },
            };
      }
      return state;
    }

    case "resyncSent":
      if (state.busy !== null || state.session?.session_id !== action.sessionId) return state;
      return { ...state, busy: "resyncing", error: null, recovery: null };

    case "resyncSettled": {
      if (state.session?.session_id !== action.sessionId) return state;
      const { outcome } = action;
      if (outcome.kind === "resynced") {
        return outcome.turn.session?.session_id === action.sessionId
          ? adopt(state, outcome.turn)
          : { ...state, busy: null };
      }
      return {
        ...state,
        busy: null,
        expired: outcome.kind === "expired",
        error: errorOf(outcome.error),
        recovery: outcome.kind === "expired"
          ? { kind: "restart" }
          : { kind: "resync", sessionId: action.sessionId },
      };
    }

    case "advance":
      // Only from a reveal, only with nothing in flight, and only onto the
      // question the server already delivered — or onto the end summary.
      if (state.busy !== null || state.result === null) return state;
      if (!state.pendingNext && !state.session?.complete) return state;
      return {
        ...state,
        question: state.pendingNext,
        pendingNext: null,
        result: null,
        resultReplayed: false,
        selected: null,
      };
  }
  return state;
}

/**
 * Next was pressed on a reveal that did not carry the next question although
 * the session is not complete. The page must ask the server for its current
 * question rather than sit on an empty stage.
 */
export function advanceNeedsResync(state: ProPlayArenaState): boolean {
  return state.result !== null && !state.pendingNext && state.session !== null && !state.session.complete;
}
