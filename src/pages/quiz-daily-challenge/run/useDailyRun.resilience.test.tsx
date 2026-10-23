/**
 * GRES1 — the Daily parent through an outage.
 *
 * Drives the REAL controller (`useDailyRun`) over the fixture transport with
 * faults wrapped around it: a Railway-style 502 window, an uncoded 404 from a
 * route the backend does not have (the PR #119 lease against a backend
 * without PR #87), and a refusal that must still surface.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sfxApi = vi.hoisted(() => ({ play: () => {}, stop: () => {}, preload: () => {} }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfxApi }));

import { DailyRunApiError, type DailyRunTransport } from "@/lib/daily-challenge/run/client";
import {
  FOUR_STAGE_DAY, createFixtureTransport, wireRun, type FixtureTransport,
} from "@/lib/daily-challenge/run/fixtures";
import { readDailyRun } from "@/lib/daily-challenge/run/contracts";
import { SYNC_OUTAGE_BUDGET_MS, useDailyRun } from "./useDailyRun";

const edge502 = () => new DailyRunApiError("backend", 502, "request failed (502)");
const noRoute = () => new DailyRunApiError("backend", 404, "Not Found");

/** Wrap one transport verb so it fails while `down()` is true. */
function flaky<K extends keyof DailyRunTransport>(t: FixtureTransport, verb: K,
                                                  down: () => Error | null) {
  const real = (t[verb] as (...a: unknown[]) => Promise<unknown>).bind(t);
  (t as unknown as Record<string, unknown>)[verb] = async (...a: unknown[]) => {
    const fault = down();
    if (fault) { t.calls.push(`${String(verb)}:fault`); throw fault; }
    return real(...a);
  };
}

/**
 * Advance in small steps: React commits (and runs effects) only when an `act`
 * scope ends, and this controller's chains are effect-driven (intro → tag →
 * launch). One long `act` would freeze them at the first render.
 */
const settle = async (ms = 20) => {
  for (let left = ms; left > 0; left -= 500) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(500, left)); });
  }
};

/** A run whose stage 0 is already in progress (a recovered arrival). */
function inProgress(): FixtureTransport {
  const wire = wireRun(FOUR_STAGE_DAY);
  const stages = wire.stages as Record<string, unknown>[];
  stages[0].status = "in_progress";
  stages[0].child_match_id = "child-0";
  return createFixtureTransport(FOUR_STAGE_DAY, { existing: wire });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); });

describe("GRES1 Daily — scoring sync rides through a redeploy", () => {
  it("a ~12 s 502 window no longer strands the stage result behind Retry", async () => {
    const t = inProgress();
    let downUntil = 0;
    flaky(t, "syncRun", () => (Date.now() < downUntil ? edge502() : null));
    const { result } = renderHook(() => useDailyRun(t));
    await settle(50);
    expect(result.current.run?.stages[0].status).toBe("in_progress");
    t.finishActiveChild();
    downUntil = Date.now() + 12_000;
    act(() => result.current.onChildSettled("child-0"));
    await settle(16_000);
    expect(result.current.error).toBeNull();
    expect(result.current.run?.stages[0].status).toBe("completed");
    expect(t.calls.filter((c) => c === "syncRun:fault").length).toBeGreaterThan(2);
  });

  it("an outage longer than the budget still ends in the honest error, not a silent spin", async () => {
    const t = inProgress();
    flaky(t, "syncRun", () => edge502());
    const { result } = renderHook(() => useDailyRun(t));
    await settle(50);
    act(() => result.current.onChildSettled("child-0"));
    await settle(SYNC_OUTAGE_BUDGET_MS + 5_000);
    expect(result.current.error).toBe("Scoring this stage is taking longer than expected.");
  });

  it("a server that keeps ANSWERING 'in progress' keeps the old bound (not turned into a poll)", async () => {
    const t = inProgress();
    const { result } = renderHook(() => useDailyRun(t));
    await settle(50);
    act(() => result.current.onChildSettled("child-0"));   // child never finishes
    await settle(10_000);
    expect(t.calls.filter((c) => c === "sync")).toHaveLength(6);
    expect(result.current.error).toBe("Scoring this stage is taking longer than expected.");
  });
});

describe("GRES1 Daily — entry and launch", () => {
  it("a reload during a redeploy rides out the entry read instead of offering Begin", async () => {
    const t = inProgress();
    let faults = 2;
    flaky(t, "readToday", () => (faults-- > 0 ? edge502() : null));
    const { result } = renderHook(() => useDailyRun(t));
    await settle(4_000);
    expect(result.current.error).toBeNull();
    expect(result.current.load).toBe("run");
    expect(t.calls).not.toContain("startToday");
  });

  it("the stage launch is retried in place through a short outage (same interaction id)", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, { existing: wireRun(FOUR_STAGE_DAY) });
    let faults = 3;
    flaky(t, "launchStage", () => (faults-- > 0 ? edge502() : null));
    const { result } = renderHook(() => useDailyRun(t));
    await settle(20_000);
    expect(result.current.error).toBeNull();
    expect(result.current.run?.stages[0].childMatchId).toBe("child-0");
    const ids = new Set(t.launchInteractions);
    expect(ids.size).toBe(1);   // one logical launch, however many sends
  });

  it("a launch REFUSAL still surfaces at once (no outage budget spent on it)", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, { existing: wireRun(FOUR_STAGE_DAY) });
    t.failNextLaunch = true;
    const { result } = renderHook(() => useDailyRun(t));
    await settle(6_000);
    expect(result.current.error).toBe("This stage couldn't open. Try again.");
  });
});

describe("GRES1 Daily — the activity lease against a backend without the route", () => {
  it("stops after an uncoded 404 instead of POSTing one every 30 s", async () => {
    const t = inProgress();
    let leaseCalls = 0;
    (t as unknown as DailyRunTransport).noteActivity = async () => { leaseCalls += 1; throw noRoute(); };
    const { result } = renderHook(() => useDailyRun(t));
    await settle(50);
    expect(leaseCalls).toBe(1);
    await settle(95_000);
    expect(leaseCalls).toBe(1);
    expect(result.current.error).toBeNull();     // best-effort, never a player-facing error
  });

  it("keeps renewing through TRANSIENT failures, one renewal in flight at a time", async () => {
    const t = inProgress();
    let leaseCalls = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    (t as unknown as DailyRunTransport).noteActivity = (runId: string) => {
      leaseCalls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Hangs for 40 s (longer than the 30 s cadence), then fails transiently.
      return new Promise((_res, rej) => setTimeout(() => { inFlight -= 1; rej(edge502()); }, 40_000))
        .then(() => readDailyRun(wireRun(FOUR_STAGE_DAY)), (e) => { throw e; }) as never;
      void runId;
    };
    renderHook(() => useDailyRun(t));
    await settle(125_000);
    expect(maxInFlight).toBe(1);
    expect(leaseCalls).toBeGreaterThanOrEqual(2);
  });
});
