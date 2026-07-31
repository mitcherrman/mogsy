/**
 * Quiz WRITE paths must never leave the browser without a bearer token.
 *
 * The backend attributes these writes to the verified JWT subject and rejects
 * unverified callers, so a best-effort auth header is not sufficient: it is
 * empty during the window between page mount and the Supabase session landing.
 * These tests pin that every write awaits `ensureBackendAuthToken()` — which
 * establishes an anonymous session for guests — before calling fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureBackendAuthToken = vi.fn();
const getBackendAuthHeaders = vi.fn();

vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: (...args: unknown[]) => ensureBackendAuthToken(...args),
  getBackendAuthHeaders: (...args: unknown[]) => getBackendAuthHeaders(...args),
}));
vi.mock("@/lib/knowledge-admin/key", () => ({ getAdminKey: () => "test-admin-key" }));

import { quizApi, QuizAuthRequiredError } from "./api";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function ok(body: unknown = { ok: true }) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  fetchMock.mockReset().mockReturnValue(ok());
  // Deliberately empty: proves the write's Authorization header comes from
  // ensureBackendAuthToken and not from the best-effort header helper.
  getBackendAuthHeaders.mockReset().mockResolvedValue({});
  ensureBackendAuthToken.mockReset().mockResolvedValue("guest-jwt");
});
afterEach(() => vi.clearAllMocks());

function authHeader(callIndex = 0): string | undefined {
  const [, init] = fetchMock.mock.calls[callIndex];
  return (init.headers as Record<string, string>).Authorization;
}

const WRITES: Array<[string, () => Promise<unknown>]> = [
  ["POST /api/quiz/attempts", () =>
    quizApi.submitAnswer({ question_id: 1, selected_answer: "yes" })],
  ["POST /api/quiz/sessions", () =>
    quizApi.startSession({ mode: "standard" })],
  ["POST /api/quiz/daily-challenge/submit", () =>
    quizApi.submitDailyChallengeAnswer({ question_id: 1, selected_answer: "yes" })],
  ["POST /api/quiz/sessions/:id/complete", () =>
    quizApi.completeSession(7)],
];

describe.each(WRITES)("%s", (_label, call) => {
  it("guarantees a session before sending", async () => {
    await call();
    expect(ensureBackendAuthToken).toHaveBeenCalledTimes(1);
    expect(authHeader()).toBe("Bearer guest-jwt");
  });

  it("fails loudly instead of sending an unauthenticated write", async () => {
    ensureBackendAuthToken.mockResolvedValue(null);
    await expect(call()).rejects.toBeInstanceOf(QuizAuthRequiredError);
    // The critical assertion: nothing was sent at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("write attribution", () => {
  it("never lets a stale best-effort header override the guaranteed token", async () => {
    getBackendAuthHeaders.mockResolvedValue({ Authorization: "Bearer STALE" });
    await quizApi.submitAnswer({ question_id: 1, selected_answer: "yes" });
    expect(authHeader()).toBe("Bearer guest-jwt");
  });

  it("still sends a legacy user_id field without letting it steer identity", async () => {
    // Cached bundles may still include user_id; the backend ignores it. What
    // matters is that the request is authenticated regardless.
    await quizApi.submitAnswer({
      user_id: "someone-else",
      question_id: 1,
      selected_answer: "yes",
    });
    expect(authHeader()).toBe("Bearer guest-jwt");
  });
});

describe("read paths", () => {
  it("daily-challenge GET no longer sends a client user_id", async () => {
    fetchMock.mockReturnValue(ok({ ok: true, questions: [] }));
    await quizApi.getDailyChallenge("anonymous", "2026-07-30");
    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("user_id");
    expect(url).toContain("challenge_date=2026-07-30");
  });

  it("does not force a session for reads — guests must not be blocked", async () => {
    fetchMock.mockReturnValue(ok({ total_xp: 0 }));
    await quizApi.getProgress("anonymous");
    expect(ensureBackendAuthToken).not.toHaveBeenCalled();
  });
});
