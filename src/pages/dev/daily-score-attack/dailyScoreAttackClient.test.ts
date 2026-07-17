import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: vi.fn(async () => "test-token"),
  getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test-token" })),
}));

import {
  DsaApiError,
  fetchCurrentRun,
  fetchToday,
  startOfficialRun,
  submitAnswer,
} from "./dailyScoreAttackClient";
import { activeRunFixture, resolutionFixture, todayFixture, terminalRunFixture } from "./testFixtures";

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const errJson = (status: number, detail: unknown) =>
  new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dailyScoreAttackClient", () => {
  it("fetches today with GET and bearer header", async () => {
    const spy = stubFetch(async () => okJson(todayFixture));
    await fetchToday();
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain("/api/daily-score-attack/today");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("official start POSTs with no body fields", async () => {
    const spy = stubFetch(async () => okJson(activeRunFixture()));
    await startOfficialRun();
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain("/api/daily-score-attack/runs");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("answer request sends only sequence and selected_index", async () => {
    const spy = stubFetch(async () => okJson(resolutionFixture()));
    await submitAnswer("run-1", 1, 0);
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain("/api/daily-score-attack/runs/run-1/answers");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ sequence: 1, selected_index: 0 });
    for (const banned of [
      "user_id", "score", "combo", "speed_bonus", "elapsed_ms", "elapsed_time",
      "time_taken_ms", "challenge_date", "is_correct", "correctness", "timestamp",
    ]) {
      expect(body).not.toHaveProperty(banned);
    }
  });

  it("parses typed backend errors", async () => {
    stubFetch(async () => errJson(409, { code: "STALE_QUESTION", message: "stale" }));
    await expect(submitAnswer("run-1", 3, 0)).rejects.toMatchObject({
      code: "STALE_QUESTION",
      status: 409,
    });
  });

  it("attaches the terminal run projection on RUN_EXPIRED", async () => {
    stubFetch(async () =>
      errJson(410, { code: "RUN_EXPIRED", message: "expired", run: terminalRunFixture() }),
    );
    try {
      await submitAnswer("run-1", 1, 0);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DsaApiError);
      expect((error as DsaApiError).run?.status).toBe("expired");
    }
  });

  it("treats unknown error shapes as MALFORMED_RESPONSE", async () => {
    stubFetch(async () => new Response("not-json", { status: 500 }));
    await expect(fetchToday()).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("fails closed on malformed success payloads", async () => {
    stubFetch(async () => okJson({ nonsense: true }));
    await expect(fetchToday()).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("wraps network failures as typed NETWORK errors", async () => {
    stubFetch(async () => {
      throw new TypeError("failed to fetch");
    });
    await expect(fetchCurrentRun(true)).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("propagates abort signals", async () => {
    stubFetch(async (_url, init) => {
      init?.signal?.throwIfAborted();
      return okJson(todayFixture);
    });
    const controller = new AbortController();
    controller.abort();
    await expect(fetchToday(controller.signal)).rejects.toThrow();
  });
});
