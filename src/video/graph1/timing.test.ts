/**
 * Graph1 race video timing — the frame counts the composition, the
 * calculateMetadata hook and the render script all share.
 */
import { describe, expect, it } from "vitest";

import { alternatingDataset } from "../../graph1/testFixtures";
import { buildRaceIndex } from "../../graph1/raceIndex";
import { buildCadence, DEFAULT_CADENCE } from "../../graph1/timeline";
import {
  GRAPH1_FPS,
  raceVideoTiming,
  raceVideoTimingForDataset,
  resolveRaceVideoOptions,
} from "./timing";

// alternatingDataset(10): 10 events at 220ms + one 900ms year pause = 3100ms.
const DATASET = alternatingDataset(10);

function cadenceOf(ds = DATASET) {
  return buildCadence(buildRaceIndex(ds), DEFAULT_CADENCE);
}

describe("resolveRaceVideoOptions", () => {
  it("applies documented defaults", () => {
    expect(resolveRaceVideoOptions({})).toEqual({
      speed: 1,
      topN: 10,
      leadInSeconds: 2,
      outroSeconds: 4,
      // exact checkpoint values by default — consistent with the browser
      smoothValues: false,
    });
  });

  it("rejects non-positive speed and topN", () => {
    expect(() => resolveRaceVideoOptions({ speed: 0 })).toThrow(/speed/);
    expect(() => resolveRaceVideoOptions({ speed: -2 })).toThrow(/speed/);
    expect(() => resolveRaceVideoOptions({ topN: 0 })).toThrow(/topN/);
    expect(() => resolveRaceVideoOptions({ topN: 2.5 })).toThrow(/topN/);
  });
});

describe("raceVideoTiming", () => {
  it("frames = lead-in + ceil(cadence/speed) + outro at 1x", () => {
    const t = raceVideoTiming(cadenceOf(), { dataset: DATASET }, 30);
    // 3100ms → ceil(3.1s * 30) = 93 race frames; 2s lead = 60; 4s outro = 120
    expect(t.raceMsAtUnitSpeed).toBe(3100);
    expect(t.leadInFrames).toBe(60);
    expect(t.raceFrames).toBe(93);
    expect(t.outroFrames).toBe(120);
    expect(t.totalFrames).toBe(273);
    expect(t.totalSeconds).toBeCloseTo(273 / 30, 10);
  });

  it("speed divides race time before the frame ceil", () => {
    const t = raceVideoTiming(
      cadenceOf(),
      { dataset: DATASET, speed: 2 },
      30,
    );
    // 3100/2 = 1550ms → ceil(1.55 * 30) = ceil(46.5) = 47
    expect(t.raceFrames).toBe(47);
    expect(t.totalFrames).toBe(60 + 47 + 120);
  });

  it("honours zero lead-in/outro and never emits zero race frames", () => {
    const t = raceVideoTiming(
      cadenceOf(),
      { dataset: DATASET, speed: 1e9, leadInSeconds: 0, outroSeconds: 0 },
      30,
    );
    expect(t.leadInFrames).toBe(0);
    expect(t.outroFrames).toBe(0);
    expect(t.raceFrames).toBe(1);
    expect(t.totalFrames).toBe(1);
  });

  it("dataset convenience wrapper matches the explicit cadence path", () => {
    const direct = raceVideoTiming(cadenceOf(), { dataset: DATASET }, GRAPH1_FPS);
    const viaDataset = raceVideoTimingForDataset({ dataset: DATASET });
    expect(viaDataset).toEqual(direct);
  });
});
