/**
 * PM2 — a failed attempt says whether it can have reached the server.
 *
 * Practice offers "Try again" only when a resend cannot record the attempt (or
 * award its XP) twice. That decision rests on these facts about a failure:
 * it never reached `fetch` (marked not-sent), the server refused it with a
 * status (attached to the error), or neither (outcome unknown). Messages and
 * error classes are unchanged, so every existing check still holds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureBackendAuthToken = vi.fn();
const getBackendAuthHeaders = vi.fn();

vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: (...args: unknown[]) => ensureBackendAuthToken(...args),
  getExistingBackendAuthToken: (...args: unknown[]) => ensureBackendAuthToken(...args),
  getBackendAuthHeaders: (...args: unknown[]) => getBackendAuthHeaders(...args),
}));

import { quizApi, QuizAuthRequiredError } from "./api";
import { markQuizRequestNotSent, quizRequestNotSent, quizRequestStatus } from "./requestErrors";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ATTEMPT = { question_id: 1, selected_answer: "yes", client_attempt_id: "6f1c1b7e-1d2a-4c5b-9e8f-0a1b2c3d4e5f" };

beforeEach(() => {
  fetchMock.mockReset();
  getBackendAuthHeaders.mockReset().mockResolvedValue({});
  ensureBackendAuthToken.mockReset().mockResolvedValue("guest-jwt");
});
afterEach(() => vi.clearAllMocks());

async function failure(): Promise<unknown> {
  try {
    await quizApi.submitAnswer(ATTEMPT);
  } catch (err) {
    return err;
  }
  throw new Error("expected the submit to fail");
}

describe("requestErrors", () => {
  it("marks an error object in place, and wraps a non-object", () => {
    const err = new Error("x");
    expect(markQuizRequestNotSent(err)).toBe(err);
    expect(quizRequestNotSent(err)).toBe(true);
    const wrapped = markQuizRequestNotSent("boom");
    expect(wrapped).toBeInstanceOf(Error);
    expect(quizRequestNotSent(wrapped)).toBe(true);
    expect(quizRequestNotSent(new Error("y"))).toBe(false);
    expect(quizRequestNotSent(null)).toBe(false);
  });

  it("reads a numeric status only", () => {
    expect(quizRequestStatus(Object.assign(new Error("x"), { status: 503 }))).toBe(503);
    expect(quizRequestStatus(Object.assign(new Error("x"), { status: "503" }))).toBeNull();
    expect(quizRequestStatus(undefined)).toBeNull();
  });
});

describe("POST /api/quiz/attempts failures", () => {
  it("sends the client_attempt_id in the body", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ is_correct: true }) } as Response);
    await quizApi.submitAnswer(ATTEMPT);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      client_attempt_id: ATTEMPT.client_attempt_id,
    });
  });

  it("no session → not sent (fetch never called), still a QuizAuthRequiredError", async () => {
    ensureBackendAuthToken.mockResolvedValue(null);
    const err = await failure();
    expect(err).toBeInstanceOf(QuizAuthRequiredError);
    expect(quizRequestNotSent(err)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the session step throwing → not sent", async () => {
    ensureBackendAuthToken.mockRejectedValue(new Error("supabase unreachable"));
    const err = await failure();
    expect(quizRequestNotSent(err)).toBe(true);
    expect((err as Error).message).toBe("supabase unreachable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reading the auth headers throwing → not sent", async () => {
    getBackendAuthHeaders.mockRejectedValue(new Error("headers"));
    const err = await failure();
    expect(quizRequestNotSent(err)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch rejecting (connection dropped) → NOT marked: the outcome is unknown", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await failure();
    expect(quizRequestNotSent(err)).toBe(false);
    expect(quizRequestStatus(err)).toBeNull();
  });

  it("an HTTP error carries its status and keeps its message", async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 502, statusText: "Bad Gateway", text: () => Promise.resolve("upstream"),
    } as unknown as Response);
    const err = await failure();
    expect(quizRequestNotSent(err)).toBe(false);
    expect(quizRequestStatus(err)).toBe(502);
    expect((err as Error).message).toBe("Quiz API 502: upstream");
  });
});
