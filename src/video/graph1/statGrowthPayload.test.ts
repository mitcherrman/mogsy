/**
 * Phase 4A — the ONE generic Remotion composition accepts a stat-growth
 * (level progression) payload: duration comes from step cadence (one level
 * per msPerStep), frame→position lands in step space, and no calendar-date
 * dependency is involved anywhere in the math.
 */
import { describe, expect, it } from "vitest";

import { assertDataset } from "@/graph1/contract";
import { stateAt } from "@/graph1/engine";
import { buildRaceIndex } from "@/graph1/raceIndex";
import { makeStatGrowthDataset } from "@/graph1/testFixtures";
import { buildCadence, DEFAULT_CADENCE, positionAtFrame } from "@/graph1/timeline";

import { GRAPH1_FPS, raceVideoTiming, raceVideoTimingForDataset } from "./timing";

const UNITS = {
  Alpha: [6000, 6360, 7100, 8000],
  Beta: [7000, 7100, 7250, 7450],
};

describe("Remotion accepts stat-growth payloads", () => {
  it("computes duration from step cadence: levels × msPerStep", () => {
    const dataset = assertDataset(makeStatGrowthDataset(UNITS, { msPerStep: 1000 }));
    const timing = raceVideoTimingForDataset({ dataset }, GRAPH1_FPS);
    // 4 levels × 1000ms at 30fps = 120 race frames, plus 2s lead-in + 4s outro
    expect(timing.raceFrames).toBe(120);
    expect(timing.leadInFrames).toBe(60);
    expect(timing.outroFrames).toBe(120);
    expect(timing.totalFrames).toBe(300);
  });

  it("a 20-level roster-scale race is short-clip sized", () => {
    const units: Record<string, number[]> = {};
    for (let c = 0; c < 170; c++) {
      units[`Champ${String(c).padStart(3, "0")}`] = Array.from(
        { length: 20 },
        (_, level) => 5000 + c * 7 + level * 300,
      );
    }
    const dataset = assertDataset(makeStatGrowthDataset(units, { msPerStep: 1000 }));
    expect(dataset.events).toHaveLength(3400);
    const timing = raceVideoTimingForDataset({ dataset }, GRAPH1_FPS);
    // 20 s of race regardless of the 3,400 events — cadence is per LEVEL
    expect(timing.raceFrames).toBe(600);
    expect(timing.totalSeconds).toBe(26);
  });

  it("frame→position→state is deterministic and lands on exact level states", () => {
    const dataset = assertDataset(makeStatGrowthDataset(UNITS, { msPerStep: 1000 }));
    const index = buildRaceIndex(dataset);
    const cadence = buildCadence(index, DEFAULT_CADENCE);
    const timing = raceVideoTiming(cadence, { dataset }, GRAPH1_FPS);
    // the last race frame pins the final level exactly
    const position = positionAtFrame(cadence, timing.raceFrames, GRAPH1_FPS, 1);
    expect(position).toBe(index.stepCount);
    const final = stateAt(index, position, { topN: 10 });
    expect(final.stepLabel).toBe("Level 4");
    const alpha = final.rows.find((r) => r.entityId === "champion:Alpha")!;
    expect(alpha.value).toBe(8000);
    expect(alpha.rank).toBe(1);
  });

  it("the id derives a usable render stem", () => {
    const stem = `graph1-${makeStatGrowthDataset(UNITS).id.replace(
      /[^a-zA-Z0-9_-]+/g,
      "-",
    )}`;
    expect(stem).toBe("graph1-champion-stat-growth-attack-damage-base-stats");
  });
});
