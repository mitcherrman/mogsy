import { describe, expect, it } from "vitest";
import { FIVE_STAGE_DAY, FOUR_STAGE_DAY, fixtureRun, wireResult } from "./fixtures";
import { buildDailyStageResult } from "./stageResultModel";

const done = (specs = FOUR_STAGE_DAY, index: number, result = wireResult()) =>
  fixtureRun(specs, { current_stage_index: Math.min(index + 1, specs.length - 1) },
    { [index]: { status: "completed", result } });

describe("DC-LANE-C — a Daily stage result in the shared result model", () => {
  it("is never Victory / Defeat / Draw, for any stage kind", () => {
    for (const [specs, i] of [[FOUR_STAGE_DAY, 0], [FOUR_STAGE_DAY, 1], [FOUR_STAGE_DAY, 2],
      [FIVE_STAGE_DAY, 3], [FOUR_STAGE_DAY, 3]] as const) {
      const run = done(specs, i);
      const m = buildDailyStageResult(run, run.stages[i]);
      expect(m.state).toBe("complete");
      expect(`${m.headline} ${m.mode}`).not.toMatch(/victory|defeat|draw|ranked|rating/i);
      expect(m.actions).toBeUndefined();
    }
  });

  it("Standard: correct out of answered, stage position in the eyebrow", () => {
    const run = done(FOUR_STAGE_DAY, 1);
    const m = buildDailyStageResult(run, run.stages[1]);
    expect(m.headline).toBe("Stage complete");
    expect(m.mode).toBe("Daily Challenge · Stage 2 of 4");
    expect(m.subheading).toBe("Items — Mythic Build Paths");
    expect(m.score).toMatchObject({ you: 8, outOf: 10 });
    expect(m.snapshot!.map((s) => s.key)).toEqual(["answered", "accuracy", "points", "misses"]);
  });

  it("Time Trial: a drained bank reads as Time's up and names the finish", () => {
    const run = done(FOUR_STAGE_DAY, 0, wireResult({ ended_by: "time_bank_exhausted" }));
    const m = buildDailyStageResult(run, run.stages[0]);
    expect(m.headline).toBe("Time's up");
    expect(m.snapshot!.find((s) => s.key === "ended")?.value).toBe("The bank ran out");
  });

  it("Survival: no denominator anywhere", () => {
    const run = done(FOUR_STAGE_DAY, 2, wireResult({ ended_by: "strikes_exhausted", correct: 9, answered: 12 }));
    const m = buildDailyStageResult(run, run.stages[2]);
    expect(m.headline).toBe("Out of strikes");
    expect(m.score).toMatchObject({ you: 9, outOf: null });
    expect(m.snapshot!.find((s) => s.key === "ended")?.value).toBe("Out of mistakes");
    const survived = done(FOUR_STAGE_DAY, 2, wireResult());
    expect(buildDailyStageResult(survived, survived.stages[2]).headline).toBe("Survived");
  });

  it("Weak Areas uses the standard shape", () => {
    const run = done(FIVE_STAGE_DAY, 3);
    const m = buildDailyStageResult(run, run.stages[3]);
    expect(m.headline).toBe("Stage complete");
    expect(m.mode).toBe("Daily Challenge · Stage 4 of 5");
  });

  it("Review: Final stage, and nothing is 'saved for Review' from Review itself", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { status: "completed", outcome: "reviewed", current_stage_index: null }, {
      0: { status: "completed", result: wireResult() }, 1: { status: "completed", result: wireResult() },
      2: { status: "completed", result: wireResult() }, 3: { status: "completed", result: wireResult({ misses: 3 }) },
    });
    const m = buildDailyStageResult(run, run.stages[3]);
    expect(m.headline).toBe("Review complete");
    expect(m.mode).toBe("Daily Challenge · Final stage");
    expect(m.snapshot!.some((s) => s.key === "misses")).toBe(false);
  });

  it("pending: a hero with no numbers", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, {}, { 0: { status: "in_progress", child_match_id: "c" } });
    const m = buildDailyStageResult(run, run.stages[0]);
    expect(m.score).toBeUndefined();
    expect(m.snapshot).toBeUndefined();
  });
});
