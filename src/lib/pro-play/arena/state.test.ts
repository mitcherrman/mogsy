/**
 * PPQ2-B — the run's state machine, one rule per case.
 */
import { describe, expect, it } from "vitest";
import { ProPlayApiError, type ProPlayAnswerTurn, type ProPlayQuestion, type ProPlayTurn } from "../api";
import {
  advanceNeedsResync,
  canResendAnswer,
  canSubmitAnswer,
  INITIAL_PRO_PLAY_ARENA_STATE,
  proPlayArenaReducer as reduce,
} from "./state";
import type { ProPlayArenaState } from "./types";

const q = (n: number, id = `q${n}`): ProPlayQuestion => ({
  index: n - 1, number: n, total: 3, topic: "Player", question_id: id,
  question_text: `Q${n}?`, choices: ["A", "B"], presentation: {},
});
const session = (answered: number, score = 0, complete = false, id = "s1") =>
  ({ session_id: id, total: 3, answered, score, complete });
const start: ProPlayTurn = { session: session(0), question: q(1) };
const req = (selectedAnswer = "A", questionId = "q1", sessionId = "s1") =>
  ({ sessionId, questionId, selectedAnswer });
const graded = (isCorrect: boolean, next: ProPlayQuestion | null, s = session(1, isCorrect ? 1 : 0)): ProPlayAnswerTurn => ({
  session: s,
  question: next,
  result: { is_correct: isCorrect, selected_answer: "A", correct_answer: isCorrect ? "A" : "B", explanation: "e", reveal: {} },
});

const started = () => reduce(reduce(INITIAL_PRO_PLAY_ARENA_STATE, { type: "startSent" }), { type: "started", turn: start });
const sent = (s = started(), r = req()) => reduce(s, { type: "answerSent", request: r });

describe("start", () => {
  it("adopts the server's first turn", () => {
    const s = started();
    expect(s.session).toEqual(session(0));
    expect(s.question!.question_id).toBe("q1");
    expect(s.busy).toBeNull();
  });

  it("a restart drops every trace of the previous run, outcomes included", () => {
    const answered = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "answered", turn: graded(true, q(2)) } });
    expect(answered.outcomes).toEqual({ 1: "correct" });
    const again = reduce(answered, { type: "startSent" });
    expect(again).toMatchObject({ session: null, question: null, result: null, outcomes: {}, busy: "starting" });
  });

  it("a failed start offers a restart", () => {
    const s = reduce(INITIAL_PRO_PLAY_ARENA_STATE, { type: "startFailed", error: new ProPlayApiError("PP_AUTHORITY_UNAVAILABLE", "down", 503) });
    expect(s.error).toEqual({ message: "down", code: "PP_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(s.recovery).toEqual({ kind: "restart" });
  });
});

describe("exactly one submission per question", () => {
  it("locks the selection and refuses a second send", () => {
    const s = sent();
    expect(s.busy).toBe("answering");
    expect(s.selected).toBe("A");
    expect(reduce(s, { type: "answerSent", request: req("B") })).toBe(s);
    expect(reduce(s, { type: "answerSent", request: req("A") })).toBe(s);
  });

  it("refuses a request for another question, session or an unknown label", () => {
    const s = started();
    expect(canSubmitAnswer(s, req("A", "q9"))).toBe(false);
    expect(canSubmitAnswer(s, req("A", "q1", "s9"))).toBe(false);
    expect(canSubmitAnswer(s, req("Z"))).toBe(false);
    expect(canSubmitAnswer(s, req("A"))).toBe(true);
  });

  it("refuses an answer once graded", () => {
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "answered", turn: graded(true, q(2)) } });
    expect(canSubmitAnswer(s, req("B"))).toBe(false);
    expect(reduce(s, { type: "answerSent", request: req("B") })).toBe(s);
  });
});

describe("grading", () => {
  it("records the server's grade, score and next question", () => {
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "answered", turn: graded(false, q(2)) } });
    expect(s.result!.is_correct).toBe(false);
    expect(s.session).toEqual(session(1, 0));
    expect(s.pendingNext!.question_id).toBe("q2");
    expect(s.question!.question_id).toBe("q1");
    expect(s.outcomes).toEqual({ 1: "incorrect" });
    expect(s.resultReplayed).toBe(false);
  });

  it("marks a replayed grade and records it once", () => {
    const turn = { ...graded(true, q(2)), replayed: true };
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "answered", turn } });
    expect(s.resultReplayed).toBe(true);
    expect(s.outcomes).toEqual({ 1: "correct" });
    expect(s.session!.score).toBe(1);
  });

  it("drops a grade that names another question or session", () => {
    const s = sent();
    const otherQ = reduce(s, { type: "answerSettled", request: req("A", "q0"), outcome: { kind: "answered", turn: graded(true, q(2)) } });
    expect(otherQ.result).toBeNull();
    expect(otherQ.outcomes).toEqual({});
    const otherS = reduce(s, { type: "answerSettled", request: req("A", "q1", "s9"), outcome: { kind: "answered", turn: graded(true, q(2)) } });
    expect(otherS).toBe(s);
    const wrongTurn = reduce(s, {
      type: "answerSettled", request: req(),
      outcome: { kind: "answered", turn: graded(true, q(2), session(1, 1, false, "s9")) },
    });
    expect(wrongTurn.result).toBeNull();
  });
});

describe("failures", () => {
  const net = new ProPlayApiError("PP_NETWORK", "down", 0);

  it("a retryable failure keeps the selection and records the identical request", () => {
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "failed", error: net, retryable: true } });
    expect(s.selected).toBe("A");
    expect(s.recovery).toEqual({ kind: "answer", request: req() });
    expect(canSubmitAnswer(s, req("B"))).toBe(false);
    expect(canResendAnswer(s, req("B"))).toBe(false);
    expect(canResendAnswer(s, req("A"))).toBe(true);
    expect(reduce(s, { type: "answerSent", request: req() }).busy).toBe("answering");
  });

  it("a non-retryable failure releases the selection and offers a restart", () => {
    const bad = new ProPlayApiError("PP_BAD_REQUEST", "bad", 422);
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "failed", error: bad, retryable: false } });
    expect(s.selected).toBeNull();
    expect(s.recovery).toEqual({ kind: "restart" });
  });

  it("expiry offers only a restart", () => {
    const gone = new ProPlayApiError("PP_SESSION_NOT_FOUND", "expired", 404);
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "expired", error: gone } });
    expect(s.expired).toBe(true);
    expect(s.recovery).toEqual({ kind: "restart" });
    expect(canSubmitAnswer({ ...s, selected: null }, req("B"))).toBe(false);
  });

  it("a 409 resync adopts the server's current question and releases the lock", () => {
    const outcome = { kind: "resynced" as const, code: "PP_QUESTION_MISMATCH", turn: { session: session(1, 1), question: q(2) } };
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome });
    expect(s.question!.question_id).toBe("q2");
    expect(s.selected).toBeNull();
    expect(s.result).toBeNull();
    // The server graded q1 but this client never saw the grade: no verdict.
    expect(s.outcomes).toEqual({});
    expect(s.session!.score).toBe(1);
  });

  it("a resync that fails offers a resync, one that expires offers a restart", () => {
    const base = started();
    const busy = reduce(base, { type: "resyncSent", sessionId: "s1" });
    expect(busy.busy).toBe("resyncing");
    const failed = reduce(busy, { type: "resyncSettled", sessionId: "s1", outcome: { kind: "failed", error: net } });
    expect(failed.recovery).toEqual({ kind: "resync", sessionId: "s1" });
    const gone = new ProPlayApiError("PP_SESSION_NOT_FOUND", "x", 404);
    const expired = reduce(busy, { type: "resyncSettled", sessionId: "s1", outcome: { kind: "expired", error: gone } });
    expect(expired).toMatchObject({ expired: true, recovery: { kind: "restart" } });
    expect(reduce(busy, { type: "resyncSettled", sessionId: "s9", outcome: { kind: "failed", error: net } })).toBe(busy);
  });
});

describe("advance", () => {
  it("mounts the delivered next question only from a reveal", () => {
    const s0 = started();
    expect(reduce(s0, { type: "advance" })).toBe(s0);
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "answered", turn: graded(true, q(2)) } });
    const next = reduce(s, { type: "advance" });
    expect(next.question!.question_id).toBe("q2");
    expect(next).toMatchObject({ result: null, selected: null, pendingNext: null });
    expect(next.outcomes).toEqual({ 1: "correct" });
  });

  it("moves onto the summary when the session is complete", () => {
    const last: ProPlayArenaState = { ...started(), session: session(2, 2), question: q(3) };
    const s = reduce(reduce(last, { type: "answerSent", request: req("A", "q3") }), {
      type: "answerSettled", request: req("A", "q3"),
      outcome: { kind: "answered", turn: graded(true, null, session(3, 3, true)) },
    });
    expect(advanceNeedsResync(s)).toBe(false);
    const done = reduce(s, { type: "advance" });
    expect(done.question).toBeNull();
    expect(done.session).toEqual(session(3, 3, true));
  });

  it("asks for a resync when a mid-run reveal carried no next question", () => {
    const s = reduce(sent(), { type: "answerSettled", request: req(), outcome: { kind: "answered", turn: graded(true, null) } });
    expect(advanceNeedsResync(s)).toBe(true);
    expect(reduce(s, { type: "advance" })).toBe(s);
  });
});
