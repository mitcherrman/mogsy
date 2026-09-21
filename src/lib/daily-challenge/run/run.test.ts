/**
 * DCMOD-E — the Daily run contract, flow projection, stage identity and the
 * Time Trial bank projection, as pure functions over fixtures.
 */
import { describe, expect, it } from "vitest";
import {
  DailyRunParseError, activeChildMatchId, currentStage, isPerfect, readDailyRun, readDailyToday,
} from "./contracts";
import {
  FIVE_STAGE_DAY, FOUR_STAGE_DAY, fixtureRun, wireResult, wireRun,
} from "./fixtures";
import { NO_LATCHES, projectDailyFlow, stageCompletedBetween } from "./flow";
import { specialStageRulesetLabel, stageContentLine, stageIdentity } from "./stageIdentity";
import { formatBank, projectTimeBank } from "./timeBank";

describe("the run contract", () => {
  it("reads B's snapshot into stages in order, with Review last", () => {
    const run = fixtureRun(FIVE_STAGE_DAY);
    expect(run.stages.map((s) => s.kind))
      .toEqual(["time_trial", "standard", "survival", "weak_areas", "review"]);
    expect(run.stages[0].ruleset).toEqual({ id: "time_trial", timeBankMs: 90_000, maxStrikes: null });
    expect(run.stages[2].ruleset).toEqual({ id: "survival", timeBankMs: null, maxStrikes: 3 });
    expect(run.stages[0].content).toEqual({ title: "Champion Mastery", focus: "Ahri" });
    expect(currentStage(run)?.index).toBe(0);
  });

  it("refuses a run whose Review is not the final stage", () => {
    const wire = wireRun(FOUR_STAGE_DAY);
    const stages = wire.stages as Record<string, unknown>[];
    [stages[2].kind, stages[3].kind] = [stages[3].kind, stages[2].kind];
    expect(() => readDailyRun(wire)).toThrow(DailyRunParseError);
  });

  it("refuses a run with no Review at all, or two", () => {
    const none = wireRun(FOUR_STAGE_DAY);
    (none.stages as Record<string, unknown>[])[3].kind = "standard";
    expect(() => readDailyRun(none)).toThrow(/Review/);
    const two = wireRun(FOUR_STAGE_DAY);
    (two.stages as Record<string, unknown>[])[0].kind = "review";
    expect(() => readDailyRun(two)).toThrow(/Review/);
  });

  it("refuses an active run that names no current stage", () => {
    expect(() => readDailyRun(wireRun(FOUR_STAGE_DAY, { current_stage_index: null })))
      .toThrow(DailyRunParseError);
  });

  it("tolerates B's base shape: no ruleset spec, content, live or result yet", () => {
    const wire = wireRun(FOUR_STAGE_DAY);
    for (const s of wire.stages as Record<string, unknown>[]) {
      delete s.ruleset; delete s.content; delete s.live; delete s.result;
    }
    delete wire.server_now;
    const run = readDailyRun(wire);
    expect(run.stages[0].ruleset).toEqual({ id: "time_trial", timeBankMs: null, maxStrikes: null });
    expect(run.stages[0].content).toBeNull();
    expect(run.serverNow).toBeNull();
  });

  it("names the active child match only while its stage is in progress", () => {
    const pending = fixtureRun(FOUR_STAGE_DAY);
    expect(activeChildMatchId(pending)).toBeNull();
    const playing = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 1 }, {
      0: { status: "completed", child_match_id: "c0", result: wireResult() },
      1: { status: "in_progress", child_match_id: "c1" },
    });
    expect(activeChildMatchId(playing)).toBe("c1");
  });

  it("represents a perfect day: Review skipped, no current stage", () => {
    const run = fixtureRun(FOUR_STAGE_DAY,
      { status: "completed", outcome: "perfect", current_stage_index: 7 },
      { 3: { status: "skipped" } });
    expect(isPerfect(run)).toBe(true);
    expect(run.currentStageIndex).toBeNull();
    expect(currentStage(run)).toBeNull();
  });

  it("reads GET /today's envelope", () => {
    expect(readDailyToday({ run: null })).toBeNull();
    expect(readDailyToday({ run: wireRun(FOUR_STAGE_DAY) })?.runId).toBeTruthy();
  });
});

describe("stage identity — the modes are always named the same way", () => {
  it("tags the reusable rulesets and the special stages", () => {
    const run = fixtureRun(FIVE_STAGE_DAY);
    expect(run.stages.map((s) => stageIdentity(s).label))
      .toEqual(["Time Trial", "Standard", "Survival", "Weak Areas", "Review"]);
    expect(run.stages.map((s) => stageIdentity(s).family))
      .toEqual(["ruleset", "ruleset", "ruleset", "special", "special"]);
  });

  it("states rules from the frozen ruleset, never a restated number", () => {
    const run = fixtureRun(FOUR_STAGE_DAY);
    expect(stageIdentity(run.stages[0]).rule).toContain("90-second bank");
    expect(stageIdentity(run.stages[2]).rule).toBe("3 mistakes end the stage.");
    expect(stageIdentity(run.stages[2]).rule).not.toMatch(/hp|health|damage/i);
  });

  it("writes the content line and a special stage's non-standard ruleset", () => {
    const run = fixtureRun(FIVE_STAGE_DAY);
    expect(stageContentLine(run.stages[0])).toBe("Champion Mastery — Ahri");
    expect(stageContentLine(run.stages[4])).toBe("Today's Mistakes");
    expect(specialStageRulesetLabel(run.stages[3])).toBeNull();
    expect(specialStageRulesetLabel({ kind: "weak_areas",
      ruleset: { id: "survival", timeBankMs: null, maxStrikes: 3 } })).toBe("Survival");
    expect(specialStageRulesetLabel(run.stages[0])).toBeNull();
  });
});

describe("the flow projection", () => {
  const pending = fixtureRun(FOUR_STAGE_DAY);
  const playing = fixtureRun(FOUR_STAGE_DAY, {}, { 0: { status: "in_progress", child_match_id: "c0" } });

  it("a pending stage is introduced; nothing is mounted", () => {
    expect(projectDailyFlow(pending, NO_LATCHES)).toMatchObject({ phase: "stage-intro", childMatchId: null });
  });

  it("the Daily intro comes first", () => {
    expect(projectDailyFlow(pending, { ...NO_LATCHES, dailyIntroUp: true }).phase).toBe("daily-intro");
  });

  it("an in-progress stage plays its child — unless its tag is still up", () => {
    expect(projectDailyFlow(playing, NO_LATCHES)).toMatchObject({ phase: "stage-play", childMatchId: "c0" });
    const id = playing.stages[0].id;
    expect(projectDailyFlow(playing, { ...NO_LATCHES, stageIntroFor: id }).phase).toBe("stage-intro");
  });

  it("a handed-back child is settling, not replayed", () => {
    expect(projectDailyFlow(playing, { ...NO_LATCHES, settledChild: "c0" }))
      .toMatchObject({ phase: "stage-settling", childMatchId: null });
  });

  it("a watched stage result precedes the next stage, and the completion", () => {
    const done = fixtureRun(FOUR_STAGE_DAY, { status: "completed", outcome: "perfect", current_stage_index: null },
      { 2: { status: "completed", result: wireResult({ misses: 0 }) }, 3: { status: "skipped" } });
    const id = done.stages[2].id;
    expect(projectDailyFlow(done, { ...NO_LATCHES, resultFor: id }).phase).toBe("stage-result");
    expect(projectDailyFlow(done, NO_LATCHES).phase).toBe("complete");
  });

  it("stageCompletedBetween sees only an advance of the stage that was current", () => {
    const after = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 1 },
      { 0: { status: "completed", child_match_id: "c0", result: wireResult() } });
    expect(stageCompletedBetween(playing, after)?.index).toBe(0);
    expect(stageCompletedBetween(null, after)).toBeNull();
    expect(stageCompletedBetween(playing, playing)).toBeNull();
  });
});

describe("the Time Trial bank is the server's number", () => {
  const asOf = "2026-09-21T12:00:00.000Z";
  const t0 = Date.parse(asOf);
  const bank = { totalMs: 90_000, remainingMs: 60_000, asOf, draining: true };

  it("projects forward only while BOTH the server and the arena say answerable", () => {
    expect(projectTimeBank({ bank, nowMs: t0 + 5000, skewMs: 0, answerable: true })).toBe(55_000);
    expect(projectTimeBank({ bank, nowMs: t0 + 5000, skewMs: 0, answerable: false })).toBe(60_000);
    expect(projectTimeBank({ bank: { ...bank, draining: false }, nowMs: t0 + 5000, skewMs: 0, answerable: true }))
      .toBe(60_000);
  });

  it("corrects for clock skew and never projects below zero", () => {
    // Device clock 2 s behind the server.
    expect(projectTimeBank({ bank, nowMs: t0 + 3000, skewMs: 2000, answerable: true })).toBe(55_000);
    expect(projectTimeBank({ bank, nowMs: t0 + 600_000, skewMs: 0, answerable: true })).toBe(0);
  });

  it("formats rounding up, so 0:00 means empty", () => {
    expect(formatBank(60_000)).toBe("1:00");
    expect(formatBank(8_100)).toBe("0:09");
    expect(formatBank(0)).toBe("0:00");
  });
});
