/**
 * PULSE-2A reads: exactly two self-scoped endpoints, through the account read
 * helper (which never mints an identity), cancellable, and strict about the
 * server's tier.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authed = vi.hoisted(() => ({ calls: [] as { path: string; init?: RequestInit }[], body: null as unknown }));
vi.mock("@/lib/quiz/api", () => ({
  authedRequest: vi.fn(async (path: string, init?: RequestInit) => {
    authed.calls.push({ path, init });
    return authed.body;
  }),
}));

import golden from "@/pages/dev/lobby-preview/history/analyticsLab.golden.json";

import { PULSE_HISTORY_LIMIT, httpPulseLiveReads, readPracticeReport } from "./live-reads";

const FREE = {
  ok: true, tier: "free", window_days: null, current: { attempts: 3, correct: 2, accuracy: 66.67, active_days: 1 },
  sufficiency: { has_data: true },
};

beforeEach(() => { authed.calls = []; authed.body = null; });

describe("what Pulse reads", () => {
  it("the caller's own History page, small, with the caller's signal", async () => {
    authed.body = (golden as unknown as { scenarios: Record<string, unknown[]> }).scenarios.lab_free[0];
    const ctl = new AbortController();
    const page = await httpPulseLiveReads.history(ctl.signal);
    expect(page.items.length).toBeGreaterThan(0);
    expect(authed.calls).toEqual([{ path: `/api/history/v1?limit=${PULSE_HISTORY_LIMIT}`, init: { signal: ctl.signal } }]);
  });

  it("the caller's own trends projection, with the caller's signal and no window named", async () => {
    authed.body = FREE;
    const ctl = new AbortController();
    await httpPulseLiveReads.practice(ctl.signal);
    expect(authed.calls).toEqual([{ path: "/api/quiz/analytics/trends", init: { signal: ctl.signal } }]);
  });

  it("never an owner, admin, internal or user-keyed route", async () => {
    authed.body = (golden as unknown as { scenarios: Record<string, unknown[]> }).scenarios.lab_free[0];
    await httpPulseLiveReads.history(new AbortController().signal);
    authed.body = FREE;
    await httpPulseLiveReads.practice(new AbortController().signal);
    for (const { path, init } of authed.calls) {
      expect(path).not.toMatch(/admin|internal|owner|population|\/users?\/|progress\/|achievements\//i);
      expect(init?.method ?? "GET").toBe("GET");
    }
  });
});

describe("the trends payload", () => {
  it("is read only with a server tier Pulse knows", () => {
    expect(readPracticeReport(FREE).tier).toBe("free");
    expect(() => readPracticeReport({ ...FREE, tier: undefined })).toThrow(/tier/);
    expect(() => readPracticeReport({ ...FREE, tier: "gold" })).toThrow(/tier/);
  });

  it("rejects a payload whose figures are missing or malformed", () => {
    expect(() => readPracticeReport(null)).toThrow();
    expect(() => readPracticeReport({ ...FREE, current: { attempts: "3" } })).toThrow(/current/);
    expect(() => readPracticeReport({ ...FREE, sufficiency: {} })).toThrow(/has_data/);
    expect(() => readPracticeReport({ ...FREE, series: [{ accuracy: "80" }] })).toThrow(/series/);
  });
});
