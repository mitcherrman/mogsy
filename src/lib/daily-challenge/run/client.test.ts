/**
 * USERS2.3C-Daily — the Daily run transport's browser correlation.
 *
 * Start and stage launch are the two entity-creating writes and carry the
 * canonical browser correlation. The GETs stay pure reads: no body, no auth
 * minting, no correlation/session touch. Sync carries none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ ensure: vi.fn(async () => undefined) }));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: auth.ensure,
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-jwt" }),
}));
vi.mock("@/lib/analytics/correlation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/correlation")>();
  return { ...actual, withBrowserCorrelation: vi.fn(actual.withBrowserCorrelation) };
});

import { withBrowserCorrelation } from "@/lib/analytics/correlation";
import { resetIdentityForTests } from "@/lib/analytics/identity";
import { httpDailyRunTransport as http } from "./client";
import { FOUR_STAGE_DAY, wireRun } from "./fixtures";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Call { url: string; init: RequestInit }
let calls: Call[];

beforeEach(() => {
  resetIdentityForTests();
  calls = [];
  auth.ensure.mockClear();
  vi.mocked(withBrowserCorrelation).mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const body = String(url).endsWith("/today") && init.method === "GET"
      ? { run: wireRun(FOUR_STAGE_DAY) } : wireRun(FOUR_STAGE_DAY);
    return new Response(JSON.stringify(body), {
      status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch);
});
afterEach(() => vi.unstubAllGlobals());

const bodyOf = (c: Call) => JSON.parse(c.init.body as string) as Record<string, unknown>;

describe("Daily reads stay pure", () => {
  it("GET today / run send no body, mint no auth and touch no correlation", async () => {
    await http.readToday();
    await http.readRun("dr_1");
    expect(calls.map((c) => c.init.method)).toEqual(["GET", "GET"]);
    for (const c of calls) expect(c.init.body).toBeUndefined();
    expect(auth.ensure).not.toHaveBeenCalled();
    expect(withBrowserCorrelation).not.toHaveBeenCalled();
  });
});

describe("Daily writes carry browser correlation, never identity", () => {
  it("start sends visitor/session/interaction and nothing else", async () => {
    await http.startToday();
    const body = bodyOf(calls[0]);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(Object.keys(body).sort()).toEqual(["interaction_id", "session_id", "visitor_id"]);
    for (const v of Object.values(body)) expect(v).toMatch(UUID);
    expect(auth.ensure).toHaveBeenCalledTimes(1);
  });

  it("each start press is its own interaction on the same visitor/session", async () => {
    await http.startToday();
    await http.startToday();
    const [a, b] = calls.map(bodyOf);
    expect(a.visitor_id).toBe(b.visitor_id);
    expect(a.session_id).toBe(b.session_id);
    expect(a.interaction_id).not.toBe(b.interaction_id);
  });

  it("stage launch sends correlation and reuses a supplied interaction id across retries", async () => {
    const id = "5f0c7c1e-8a52-4d6c-9a4e-2b7f3d1c0a99";
    await http.launchStage("dr_1", 0, undefined, id);
    await http.launchStage("dr_1", 0, undefined, id);
    const [a, b] = calls.map(bodyOf);
    expect(calls[0].url).toContain("/api/daily-run/dr_1/stages/0/launch");
    expect(Object.keys(a).sort()).toEqual(["interaction_id", "session_id", "visitor_id"]);
    expect(a.interaction_id).toBe(id);
    expect(b.interaction_id).toBe(id);
    expect(a.visitor_id).toBe(b.visitor_id);
    expect(a.session_id).toBe(b.session_id);
  });

  it("a launch with no caller-supplied id still gets a fresh valid one", async () => {
    await http.launchStage("dr_1", 1);
    expect(bodyOf(calls[0]).interaction_id).toMatch(UUID);
  });

  it("sync carries no correlation body (auto-retried, creates nothing)", async () => {
    await http.syncRun("dr_1");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeUndefined();
    expect(withBrowserCorrelation).not.toHaveBeenCalled();
  });
});
