/** Cadence mapping tests — monotonicity, year pauses, Remotion bridge. */
import { describe, expect, it } from "vitest";

import { buildRaceIndex } from "./raceIndex";
import {
  buildCadence,
  positionAtFrame,
  positionAtTime,
  timeAtPosition,
} from "./timeline";
import { alternatingDataset } from "./testFixtures";

const CADENCE_CFG = { baseMsPerEvent: 100, yearPauseMs: 400 };

describe("cadence", () => {
  const index = buildRaceIndex(alternatingDataset(10)); // year flips at 5
  const cadence = buildCadence(index, CADENCE_CFG);

  it("total duration = events * base + one year pause", () => {
    expect(cadence.totalMs).toBe(10 * 100 + 400);
  });

  it("position advances within a step then holds through the pause", () => {
    expect(positionAtTime(cadence, 0)).toBe(0);
    expect(positionAtTime(cadence, 50)).toBeCloseTo(0.5);
    expect(positionAtTime(cadence, 100)).toBeCloseTo(1);
    // event 4 ends at 500ms; year pause holds position 5 until 900ms
    expect(positionAtTime(cadence, 500)).toBeCloseTo(5);
    expect(positionAtTime(cadence, 700)).toBeCloseTo(5);
    expect(positionAtTime(cadence, 900 + 50)).toBeCloseTo(5.5);
    expect(positionAtTime(cadence, cadence.totalMs)).toBe(10);
  });

  it("is monotonic and clamped", () => {
    let prev = -1;
    for (let t = -100; t <= cadence.totalMs + 200; t += 7) {
      const p = positionAtTime(cadence, t);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(10);
      prev = p;
    }
  });

  it("timeAtPosition inverts positionAtTime on the advancing segments", () => {
    for (const p of [0, 0.25, 1, 3.5, 5, 7.75, 10]) {
      expect(positionAtTime(cadence, timeAtPosition(cadence, p))).toBeCloseTo(p);
    }
  });

  it("Remotion bridge is deterministic per frame at fixed fps", () => {
    const at = (frame: number) => positionAtFrame(cadence, frame, 60);
    expect(at(0)).toBe(0);
    expect(at(30)).toBe(at(30));
    expect(at(30)).toBeCloseTo(positionAtTime(cadence, 500));
    // speed maps through time, not through engine state
    expect(positionAtFrame(cadence, 15, 60, 2)).toBeCloseTo(at(30));
  });
});
