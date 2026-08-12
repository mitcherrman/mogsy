/**
 * Phase 4A polish — Exact-Levels vs Smooth value display.
 *
 * The engine now exposes, per row, the canonical checkpoint units
 * (`checkpointValue`) alongside the interpolated `value`, plus the settled
 * step label. The invariants:
 *
 *  - checkpointValue NEVER interpolates: through the whole Level N → N+1
 *    transition it holds Level N's exact units, switching directly at the
 *    N+1 checkpoint;
 *  - `value` (the smooth ticker) keeps its Phase 4A behavior bit-for-bit;
 *  - both agree at every checkpoint;
 *  - rankings/rows are identical regardless of which one a renderer prints —
 *    the mode is pure presentation;
 *  - settledStepLabel matches the checkpoint the held values describe, so
 *    Exact mode can label the board without a level/value mismatch.
 */
import { describe, expect, it } from "vitest";

import { stateAt } from "./engine";
import { buildRaceIndex } from "./raceIndex";
import { alternatingDataset, makeStatGrowthDataset } from "./testFixtures";

/** 9 levels so the spec's Level 7 → Level 8 transition exists literally.
 * Alpha: 100.4 AD at level 7, 104.1 at level 8 (the example values). */
const UNITS = {
  Alpha: [6000, 6500, 7100, 7800, 8600, 9500, 10040, 10410, 10800],
  Beta: [7000, 7400, 7900, 8500, 9200, 10000, 10900, 11000, 11100],
};
const LEVEL7_ALPHA = UNITS.Alpha[6]; // 10040 units = 100.4 AD
const LEVEL8_ALPHA = UNITS.Alpha[7]; // 10410 units = 104.1 AD

const index = buildRaceIndex(makeStatGrowthDataset(UNITS));
const alphaAt = (position: number) =>
  stateAt(index, position, { topN: 10 }).rows.find(
    (r) => r.entityId === "champion:Alpha",
  )!;

describe("checkpointValue (Exact Levels)", () => {
  it("holds the exact Level 7 value through the whole 7→8 transition", () => {
    // settled at level 7
    expect(alphaAt(7).checkpointValue).toBe(LEVEL7_ALPHA);
    // start, midpoint, and immediately before the level-8 checkpoint
    expect(alphaAt(7.01).checkpointValue).toBe(LEVEL7_ALPHA);
    expect(alphaAt(7.5).checkpointValue).toBe(LEVEL7_ALPHA);
    expect(alphaAt(7.999).checkpointValue).toBe(LEVEL7_ALPHA);
    // the checkpoint itself switches directly to the level-8 value
    expect(alphaAt(8).checkpointValue).toBe(LEVEL8_ALPHA);
  });

  it("never emits an intermediate number anywhere in the race", () => {
    // position 0 is the empty pre-race board (no rows at all); every later
    // sample must print one of the canonical level values, nothing between
    const canonical = new Set(UNITS.Alpha);
    for (let position = 0.13; position <= index.stepCount; position += 0.13) {
      expect(canonical.has(alphaAt(position).checkpointValue)).toBe(true);
    }
  });

  it("names the first checkpoint during the pre-race rise, not zero", () => {
    // nothing is settled yet; the bars are rising to level 1 and the value
    // label names the level-1 stat they are rising to
    expect(alphaAt(0.5).checkpointValue).toBe(UNITS.Alpha[0]);
    expect(alphaAt(0.5).displayValue).toBe(0); // the count-race semantic keeps its zero
  });
});

describe("value (Smooth) is unchanged", () => {
  it("interpolates strictly between the level 7 and 8 values mid-transition", () => {
    const mid = alphaAt(7.5);
    expect(mid.value).toBeGreaterThan(LEVEL7_ALPHA);
    expect(mid.value).toBeLessThan(LEVEL8_ALPHA);
    expect(mid.value).toBeCloseTo((LEVEL7_ALPHA + LEVEL8_ALPHA) / 2, 6);
  });

  it("agrees with checkpointValue at every checkpoint", () => {
    for (let level = 1; level <= index.stepCount; level++) {
      const row = alphaAt(level);
      expect(row.value).toBe(row.checkpointValue);
    }
  });
});

describe("mode is pure presentation", () => {
  it("rankings, y positions and opacity are one computation for both modes", () => {
    // stateAt has no mode input at all — a frame carries BOTH values and the
    // renderer chooses which to print, so rankings cannot diverge
    const frame = stateAt(index, 7.4, { topN: 10 });
    for (const row of frame.rows) {
      expect(typeof row.checkpointValue).toBe("number");
      expect(typeof row.value).toBe("number");
    }
    expect(frame.rows.map((r) => r.entityId)).toEqual(
      stateAt(index, 7.4, { topN: 10 }).rows.map((r) => r.entityId),
    );
  });
});

describe("settled step label", () => {
  it("stays on Level 7 through the transition and flips at the checkpoint", () => {
    expect(stateAt(index, 7, { topN: 10 }).settledStepLabel).toBe("Level 7");
    expect(stateAt(index, 7.5, { topN: 10 }).settledStepLabel).toBe("Level 7");
    expect(stateAt(index, 7.999, { topN: 10 }).settledStepLabel).toBe("Level 7");
    expect(stateAt(index, 8, { topN: 10 }).settledStepLabel).toBe("Level 8");
    // while the smooth (destination) label already names Level 8 mid-flight
    expect(stateAt(index, 7.5, { topN: 10 }).stepLabel).toBe("Level 8");
  });

  it("matches the held checkpoint values at every sampled position", () => {
    for (let position = 1; position <= index.stepCount; position += 0.37) {
      const frame = stateAt(index, position, { topN: 10 });
      const settledLevel = frame.settledStepIndex + 1;
      const alpha = frame.rows.find((r) => r.entityId === "champion:Alpha")!;
      expect(alpha.checkpointValue).toBe(UNITS.Alpha[settledLevel - 1]);
    }
  });

  it("labels the pre-race rise as Level 1", () => {
    expect(stateAt(index, 0.5, { topN: 10 }).settledStepLabel).toBe("Level 1");
    expect(stateAt(index, 0.5, { topN: 10 }).settledStepIndex).toBe(0);
  });

  it("is inert for chronological datasets", () => {
    const chrono = buildRaceIndex(alternatingDataset(6));
    const frame = stateAt(chrono, 3.5, { topN: 10 });
    expect(frame.settledStepLabel).toBeNull();
    expect(frame.stepLabel).toBeNull();
  });
});
