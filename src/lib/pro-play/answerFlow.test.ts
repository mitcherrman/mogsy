/**
 * PPQ0C — the answer submission decision table, against the PPQ0A contract.
 *
 * The transport is injected, so each case states exactly which failure the
 * server produced and asserts what the client does next: resend the IDENTICAL
 * request, resynchronize with GET, restart, or stop.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  answerProPlayQuestion,
  ProPlayApiError,
  type ProPlayAnswerTurn,
  type ProPlayTurn,
} from "./api";
import {
  isRetryableAnswerError,
  PRO_PLAY_ANSWER_RETRY_DELAYS_MS,
  submitProPlayAnswer,
} from "./answerFlow";

const REQ = { sessionId: "s1", questionId: "q1digest", selectedAnswer: "Faker" };

const session = (answered: number, complete = false) => ({
  session_id: "s1",
  total: 10,
  answered,
  score: answered,
  complete,
});

const TURN: ProPlayAnswerTurn = {
  result: {
    is_correct: true,
    selected_answer: "Faker",
    correct_answer: "Faker",
    explanation: "e",
    reveal: {},
  },
  replayed: false,
  session: session(1),
  question: {
    index: 1,
    number: 2,
    total: 10,
    topic: "Player",
    question_id: "q2digest",
    question_text: "Q2?",
    choices: ["x", "y"],
    presentation: {},
  },
};

const GET_TURN: ProPlayTurn = { session: session(1), question: TURN.question };

const net = () => new ProPlayApiError("PP_NETWORK", "down", 0);
const typed = (code: string, status: number) => new ProPlayApiError(code, code, status);
const noSleep = () => Promise.resolve();

describe("submitProPlayAnswer", () => {
  it("returns the server's turn on success, sending question_id + selected_answer", async () => {
    const answer = vi.fn().mockResolvedValue(TURN);
    const out = await submitProPlayAnswer(REQ, { answer, sleep: noSleep });
    expect(out).toEqual({ kind: "answered", turn: TURN });
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith("s1", "q1digest", "Faker");
  });

  it("resends the IDENTICAL request after a lost response and accepts the replay", async () => {
    const replay = { ...TURN, replayed: true };
    const answer = vi.fn().mockRejectedValueOnce(net()).mockResolvedValueOnce(replay);
    const out = await submitProPlayAnswer(REQ, { answer, sleep: noSleep });
    expect(out).toEqual({ kind: "answered", turn: replay });
    expect(answer.mock.calls).toEqual([
      ["s1", "q1digest", "Faker"],
      ["s1", "q1digest", "Faker"],
    ]);
  });

  it("recovers a grade whose next draw failed (503) by replaying it", async () => {
    const answer = vi
      .fn()
      .mockRejectedValueOnce(typed("PP_AUTHORITY_UNAVAILABLE", 503))
      .mockResolvedValueOnce({ ...TURN, replayed: true });
    const out = await submitProPlayAnswer(REQ, { answer, sleep: noSleep });
    expect(out.kind).toBe("answered");
    expect(answer).toHaveBeenCalledTimes(2);
  });

  it("stops after the bounded resends and leaves the request retryable", async () => {
    const answer = vi.fn().mockRejectedValue(net());
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const out = await submitProPlayAnswer(REQ, { answer, sleep });
    expect(out).toMatchObject({ kind: "failed", retryable: true });
    expect(answer).toHaveBeenCalledTimes(PRO_PLAY_ANSWER_RETRY_DELAYS_MS.length + 1);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([...PRO_PLAY_ANSWER_RETRY_DELAYS_MS]);
    for (const call of answer.mock.calls) expect(call).toEqual(["s1", "q1digest", "Faker"]);
  });

  it.each([
    ["PP_ANSWER_CONFLICT"],
    ["PP_QUESTION_MISMATCH"],
    ["PP_SESSION_COMPLETE"],
    ["PP_NOTHING_TO_ANSWER"],
  ])("resynchronizes with GET on 409 %s and never resends", async (code) => {
    const answer = vi.fn().mockRejectedValue(typed(code, 409));
    const getSession = vi.fn().mockResolvedValue(GET_TURN);
    const out = await submitProPlayAnswer(REQ, { answer, getSession, sleep: noSleep });
    expect(out).toEqual({ kind: "resynced", turn: GET_TURN, code });
    expect(answer).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledWith("s1");
  });

  it("reports an expired session and neither resends nor resyncs", async () => {
    const answer = vi.fn().mockRejectedValue(typed("PP_SESSION_NOT_FOUND", 404));
    const getSession = vi.fn();
    const out = await submitProPlayAnswer(REQ, { answer, getSession, sleep: noSleep });
    expect(out.kind).toBe("expired");
    expect(answer).toHaveBeenCalledTimes(1);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("reports expiry discovered during the resync", async () => {
    const answer = vi.fn().mockRejectedValue(typed("PP_QUESTION_MISMATCH", 409));
    const getSession = vi.fn().mockRejectedValue(typed("PP_SESSION_NOT_FOUND", 404));
    const out = await submitProPlayAnswer(REQ, { answer, getSession, sleep: noSleep });
    expect(out.kind).toBe("expired");
  });

  it("does not resend a non-retryable 4xx", async () => {
    const answer = vi.fn().mockRejectedValue(typed("PP_QUESTION_ID_REQUIRED", 422));
    const out = await submitProPlayAnswer(REQ, { answer, sleep: noSleep });
    expect(out).toMatchObject({ kind: "failed", retryable: false });
    expect(answer).toHaveBeenCalledTimes(1);
  });

  it("classifies transport and 5xx as retryable, 4xx as not", () => {
    expect(isRetryableAnswerError(net())).toBe(true);
    expect(isRetryableAnswerError(typed("PP_NO_QUESTION_AVAILABLE", 503))).toBe(true);
    expect(isRetryableAnswerError(typed("PP_ERROR", 500))).toBe(true);
    expect(isRetryableAnswerError(typed("PP_ANSWER_CONFLICT", 409))).toBe(false);
    expect(isRetryableAnswerError(typed("PP_QUESTION_ID_REQUIRED", 422))).toBe(false);
  });
});

describe("answerProPlayQuestion wire format", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs exactly { question_id, selected_answer } and carries the HTTP status on errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => TURN })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ detail: { code: "PP_ANSWER_CONFLICT", message: "m" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await answerProPlayQuestion("s 1", "q1digest", "Faker");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/pro-play\/quiz\/sessions\/s%201\/answer$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ question_id: "q1digest", selected_answer: "Faker" });

    const err = await answerProPlayQuestion("s1", "q1digest", "Other").catch((e) => e);
    expect(err).toBeInstanceOf(ProPlayApiError);
    expect(err).toMatchObject({ code: "PP_ANSWER_CONFLICT", status: 409 });
  });
});
