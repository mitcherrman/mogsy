import { describe, expect, it } from "vitest";
import type { TransactionalLeaveCandidate } from "@/lib/navigation/useTransactionalLeaveGuard";
import { FOUR_STAGE_DAY, wireResult, wireRun } from "@/lib/daily-challenge/run/fixtures";
import { readDailyRun } from "@/lib/daily-challenge/run/contracts";
import type { DailyFlowView } from "@/lib/daily-challenge/run/flow";
import {
  dailyLeaveCopy, hasLiveDailyChild, isActiveDailyRun, shouldBlockDailyNavigation,
} from "./dailyLeaveContract";

const run = (overrides: Record<string, unknown> = {}, stages: Record<number, Record<string, unknown>> = {}) =>
  readDailyRun(wireRun(FOUR_STAGE_DAY, overrides, stages));
const flow = (phase: DailyFlowView["phase"], daily = run()): DailyFlowView => ({
  phase, stage: daily.stages[daily.currentStageIndex ?? 0] ?? null,
  childMatchId: phase === "stage-play" ? daily.stages[daily.currentStageIndex ?? 0]?.childMatchId ?? null : null,
  settlingChildMatchId: null,
});

describe("Daily parent leave contract", () => {
  it("guards only a canonical active run", () => {
    expect(isActiveDailyRun(null)).toBe(false);
    expect(isActiveDailyRun(run())).toBe(true);
    expect(isActiveDailyRun(run({ status: "completed", outcome: "reviewed", current_stage_index: null }, {
      0: { status: "completed", result: wireResult() },
      1: { status: "completed", result: wireResult() },
      2: { status: "completed", result: wireResult() },
      3: { status: "completed", result: wireResult() },
    }))).toBe(false);
  });

  it("selects normal copy when no child remains live", () => {
    const daily = run();
    expect(hasLiveDailyChild(daily, flow("daily-intro", daily))).toBe(false);
    expect(dailyLeaveCopy(daily, flow("daily-intro", daily))).toEqual({
      title: "Exit Daily Challenge?",
      body: "Your completed stages are saved. You can resume before the Daily resets. This is your one run for today.",
      stayLabel: "Continue Daily",
      leaveLabel: "Exit Daily Challenge",
    });
  });

  it.each(["stage-intro", "stage-play"] as const)("treats a canonical child during %s as live", (phaseName) => {
    const daily = run({}, { 0: { status: "in_progress", child_match_id: "child-0" } });
    const view = flow(phaseName, daily);
    expect(hasLiveDailyChild(daily, view)).toBe(true);
    expect(String(dailyLeaveCopy(daily, view).body)).toContain("about 45 seconds");
  });

  it("treats a hidden Survival child as live but a terminal handback awaiting sync as normal", () => {
    const daily = run({}, { 0: { status: "in_progress", child_match_id: "child-0" } });
    const settling = flow("stage-settling", daily);
    expect(hasLiveDailyChild(daily, { ...settling, settlingChildMatchId: "child-0" })).toBe(true);
    expect(hasLiveDailyChild(daily, settling)).toBe(false);
  });

  it("adds the one-time warning only to a stage-result interstitial", () => {
    const daily = run({ current_stage_index: 1 }, { 0: { status: "completed", result: wireResult() } });
    expect(String(dailyLeaveCopy(daily, flow("stage-result", daily)).body))
      .toContain("This stage result screen will not be shown again when you return.");
    expect(String(dailyLeaveCopy(daily, flow("stage-intro", daily)).body)).not.toContain("result screen");
  });

  it("blocks route departure but not search/hash mutations owned by Daily", () => {
    const candidate = (next: string): TransactionalLeaveCandidate => ({
      currentLocation: { pathname: "/quiz/daily-challenge", search: "", hash: "", state: null, key: "a" },
      nextLocation: { pathname: next, search: "", hash: "", state: null, key: "b" },
      historyAction: "PUSH",
    } as TransactionalLeaveCandidate);
    expect(shouldBlockDailyNavigation(candidate("/quiz"))).toBe(true);
    expect(shouldBlockDailyNavigation(candidate("/lol"))).toBe(true);
    expect(shouldBlockDailyNavigation(candidate("/quiz/daily-challenge"))).toBe(false);
  });
});
