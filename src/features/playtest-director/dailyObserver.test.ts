/**
 * PLAY1 — the Daily adapter is a PASS-THROUGH. These cases pin that it
 * forwards exactly what it is given, returns exactly what it receives (the same
 * object), propagates the same errors, and only derives a projection.
 */
import { describe, expect, it, vi } from "vitest";
import type { DailyRunTransport } from "@/lib/daily-challenge/run/client";
import {
  FOUR_STAGE_DAY, createFixtureTransport, fixtureRun, wireResult,
} from "@/lib/daily-challenge/run/fixtures";
import {
  isDailyTerminal, isStageTerminal, observeDailyTransport, projectDaily, returnConditionMet,
} from "./dailyObserver";

const ACTIVE = fixtureRun(FOUR_STAGE_DAY);
const STAGE0_DONE = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 1 },
  { 0: { status: "completed", result: wireResult() } });
const STAGE0_SKIPPED = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 1 }, { 0: { status: "skipped" } });
const DONE = fixtureRun(FOUR_STAGE_DAY, { status: "completed", outcome: "reviewed", current_stage_index: null },
  Object.fromEntries(FOUR_STAGE_DAY.map((_, i) => [i, { status: "completed", result: wireResult() }])));

function spyTransport(result = ACTIVE) {
  const calls: unknown[][] = [];
  const t: DailyRunTransport = {
    readToday: vi.fn(async (...a) => { calls.push(["readToday", ...a]); return result; }),
    startToday: vi.fn(async (...a) => { calls.push(["startToday", ...a]); return result; }),
    readRun: vi.fn(async (...a) => { calls.push(["readRun", ...a]); return result; }),
    launchStage: vi.fn(async (...a) => { calls.push(["launchStage", ...a]); return result; }),
    syncRun: vi.fn(async (...a) => { calls.push(["syncRun", ...a]); return result; }),
  };
  return { t, calls };
}

describe("observeDailyTransport — pass-through", () => {
  it("forwards every request unchanged, in order, with the same signal", async () => {
    const direct = spyTransport();
    const wrapped = spyTransport();
    const observed = observeDailyTransport(wrapped.t, () => {});
    const signal = new AbortController().signal;
    for (const tr of [direct.t, observed]) {
      await tr.readToday(signal);
      await tr.startToday(signal);
      await tr.readRun("dr_abc", signal);
      await tr.launchStage("dr_abc", 2, signal);
      await tr.syncRun("dr_abc", signal);
    }
    expect(wrapped.calls).toEqual(direct.calls);
    expect(wrapped.calls[3]).toEqual(["launchStage", "dr_abc", 2, signal]);
  });

  it("returns the very same response object, unmodified", async () => {
    const { t } = spyTransport(ACTIVE);
    const before = structuredClone(ACTIVE);
    const seen: unknown[] = [];
    const observed = observeDailyTransport(t, (run) => seen.push(run));
    const results = [
      await observed.readToday(), await observed.startToday(), await observed.readRun("x"),
      await observed.launchStage("x", 0), await observed.syncRun("x"),
    ];
    for (const r of results) expect(r).toBe(ACTIVE);
    expect(ACTIVE).toEqual(before);
    expect(seen).toHaveLength(5);
  });

  it("passes a null readToday through without observing it", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY);
    const observe = vi.fn();
    expect(await observeDailyTransport(t, observe).readToday()).toBeNull();
    expect(observe).not.toHaveBeenCalled();
  });

  it("propagates the inner error untouched and observes nothing", async () => {
    const boom = new Error("backend");
    const { t } = spyTransport();
    t.syncRun = vi.fn(async () => { throw boom; });
    const observe = vi.fn();
    await expect(observeDailyTransport(t, observe).syncRun("x")).rejects.toBe(boom);
    expect(observe).not.toHaveBeenCalled();
  });

  it("contains an observer that throws, so Daily never fails because Playtest did", async () => {
    const { t } = spyTransport();
    const observed = observeDailyTransport(t, () => { throw new Error("playtest bug"); });
    await expect(observed.readToday()).resolves.toBe(ACTIVE);
  });

  it("drives the canonical fixture engine identically to the bare transport", async () => {
    const bare = createFixtureTransport(FOUR_STAGE_DAY);
    const inner = createFixtureTransport(FOUR_STAGE_DAY);
    const observed = observeDailyTransport(inner, () => {});
    for (const tr of [bare, observed]) {
      const run = await tr.startToday();
      await tr.launchStage(run.runId, 0);
    }
    bare.finishActiveChild(wireResult());
    inner.finishActiveChild(wireResult());
    const a = await bare.syncRun(bare.wire().run_id as string);
    const b = await observed.syncRun(inner.wire().run_id as string);
    expect({ ...b, serverNow: null }).toEqual({ ...a, serverNow: null });
    expect(inner.calls).toEqual(bare.calls);
  });
});

describe("projection and return points", () => {
  it("projects identity, stage and run status", () => {
    const p = projectDaily(STAGE0_DONE);
    expect(p).toMatchObject({
      runId: STAGE0_DONE.runId, planDate: "2026-09-21", runStatus: "active",
      currentStageIndex: 1, focusStageIndex: 1, focusStageStatus: "pending",
    });
    expect(projectDaily(DONE)).toMatchObject({ runStatus: "completed", currentStageIndex: null, focusStageIndex: 3 });
  });

  it("a nonterminal snapshot does not return control", () => {
    const inProgress = fixtureRun(FOUR_STAGE_DAY, {}, { 0: { status: "in_progress", child_match_id: "c0" } });
    for (const run of [ACTIVE, inProgress]) {
      expect(returnConditionMet({ type: "stage_terminal", stageIndex: 0 }, projectDaily(run))).toBe(false);
    }
  });

  it("the configured stage going completed or skipped returns control", () => {
    for (const run of [STAGE0_DONE, STAGE0_SKIPPED]) {
      const p = projectDaily(run);
      expect(isStageTerminal(p, 0)).toBe(true);
      expect(returnConditionMet({ type: "stage_terminal", stageIndex: 0 }, p)).toBe(true);
    }
  });

  it("return points are manifest-controlled: stage 1 is not stage 0", () => {
    const p = projectDaily(STAGE0_DONE);
    expect(returnConditionMet({ type: "stage_terminal", stageIndex: 1 }, p)).toBe(false);
    expect(returnConditionMet({ type: "daily_terminal" }, p)).toBe(false);
  });

  it("recognises the overall Daily terminal snapshot", () => {
    const p = projectDaily(DONE);
    expect(isDailyTerminal(p)).toBe(true);
    expect(returnConditionMet({ type: "daily_terminal" }, p)).toBe(true);
    expect(returnConditionMet({ type: "stage_terminal", stageIndex: 2 }, p)).toBe(true);
    expect(isDailyTerminal(projectDaily(ACTIVE))).toBe(false);
  });
});
