/**
 * Phase 4A — discrete progression (level) axis over the SAME race engine.
 *
 * The invariants under test:
 *  1. chronological datasets are bit-identical to pre-4A behaviour (identity
 *     step map) — the broader existing suites also enforce this unchanged;
 *  2. a progression dataset applies ALL of a step's events together, so the
 *     state at every integer position is exactly the canonical level state;
 *  3. a malformed/stale progression falls back to per-event playback instead
 *     of mislabelling levels;
 *  4. cadence paces one step per msPerStep with no year pauses.
 */
import { describe, expect, it } from "vitest";

import { resolveProgression } from "./contract";
import { stateAt } from "./engine";
import { buildRaceIndex } from "./raceIndex";
import { alternatingDataset, makeStatGrowthDataset } from "./testFixtures";
import { buildCadence, DEFAULT_CADENCE, positionAtFrame, positionAtTime, timeAtPosition } from "./timeline";

/** Alpha grows fast (overtakes), Beta starts high and flat, Gamma stays low
 * but joins the ranking universe. Values are display units (centi-AD). */
const UNITS = {
  Alpha: [6000, 6360, 7100, 8000, 9000, 10000],
  Beta: [7000, 7100, 7250, 7450, 7700, 8000],
  Gamma: [4000, 4100, 4210, 4330, 4460, 4600],
};

describe("resolveProgression", () => {
  it("accepts the backend shape", () => {
    const ds = makeStatGrowthDataset(UNITS);
    expect(resolveProgression(ds)?.stepLabels).toHaveLength(6);
  });

  it("is null for chronological datasets", () => {
    expect(resolveProgression(alternatingDataset(6))).toBeNull();
  });

  it("rejects a step map that does not cover the events (stale after filtering)", () => {
    const ds = makeStatGrowthDataset(UNITS);
    ds.events = ds.events.slice(0, ds.events.length - 1);
    expect(resolveProgression(ds)).toBeNull();
    // and the index degrades to per-event steps rather than trusting it
    const index = buildRaceIndex(ds);
    expect(index.progression).toBeNull();
    expect(index.stepCount).toBe(ds.events.length);
  });

  it("rejects non-positive or non-integer counts and label mismatches", () => {
    const broken = makeStatGrowthDataset(UNITS);
    broken.definition.progression!.stepEventCounts[0] = 0;
    expect(resolveProgression(broken)).toBeNull();
    const mismatched = makeStatGrowthDataset(UNITS);
    mismatched.definition.progression!.stepLabels.pop();
    expect(resolveProgression(mismatched)).toBeNull();
  });
});

describe("step-space engine", () => {
  const ds = makeStatGrowthDataset(UNITS);
  const index = buildRaceIndex(ds);

  it("indexes one step per level covering every champion", () => {
    expect(index.stepCount).toBe(6);
    expect(Array.from(index.stepStartIndices)).toEqual([0, 3, 6, 9, 12, 15, 18]);
  });

  it("integer positions are EXACT canonical level states", () => {
    for (let level = 1; level <= 6; level++) {
      const frame = stateAt(index, level, { topN: 10 });
      const values = Object.fromEntries(
        frame.rows.map((r) => [r.entityId, r.value]),
      );
      for (const [name, units] of Object.entries(UNITS)) {
        expect(values[`champion:${name}`]).toBe(units[level - 1]);
      }
    }
  });

  it("labels every position with its level", () => {
    expect(stateAt(index, 0, { topN: 10 }).stepLabel).toBe("Level 1");
    expect(stateAt(index, 2.4, { topN: 10 }).stepLabel).toBe("Level 3");
    expect(stateAt(index, 6, { topN: 10 }).stepLabel).toBe("Level 6");
    expect(stateAt(index, 6, { topN: 10 }).stepCount).toBe(6);
  });

  it("applies a whole step simultaneously during the transition", () => {
    // between level 1 and 2 every champion interpolates at the same fraction
    const frame = stateAt(index, 1.5, { topN: 10 });
    const byId = Object.fromEntries(frame.rows.map((r) => [r.entityId, r]));
    expect(byId["champion:Alpha"].value).toBeCloseTo(6000 + 0.5 * 360, 6);
    expect(byId["champion:Beta"].value).toBeCloseTo(7000 + 0.5 * 100, 6);
    expect(byId["champion:Gamma"].value).toBeCloseTo(4000 + 0.5 * 100, 6);
    // displayed integers hold the fully-applied level-1 state
    expect(byId["champion:Alpha"].displayValue).toBe(6000);
  });

  it("reorders at the exact level where canonical values cross", () => {
    // Alpha (6000→10000) passes Beta (7000→8000) at level 4 (8000 > 7450)
    const rankOf = (level: number, id: string) =>
      stateAt(index, level, { topN: 10 }).rows.find((r) => r.entityId === id)!
        .rank;
    expect(rankOf(3, "champion:Alpha")).toBe(2);
    expect(rankOf(3, "champion:Beta")).toBe(1);
    expect(rankOf(4, "champion:Alpha")).toBe(1);
    expect(rankOf(4, "champion:Beta")).toBe(2);
  });

  it("crossing ranks interpolate mid-step (no snap, no flicker)", () => {
    const mid = stateAt(index, 3.5, { topN: 10 });
    const alpha = mid.rows.find((r) => r.entityId === "champion:Alpha")!;
    const beta = mid.rows.find((r) => r.entityId === "champion:Beta")!;
    // y positions are strictly between the two slots while crossing
    expect(alpha.y).toBeGreaterThan(0);
    expect(alpha.y).toBeLessThan(1);
    expect(beta.y).toBeGreaterThan(0);
    expect(beta.y).toBeLessThan(1);
  });

  it("handles top-N entry and exit at a step boundary", () => {
    const frame = stateAt(index, 3.5, { topN: 2 });
    const ids = frame.rows.map((r) => r.entityId);
    // Gamma is never in the top 2; Alpha/Beta both are on both sides
    expect(ids).toContain("champion:Alpha");
    expect(ids).toContain("champion:Beta");
    expect(ids).not.toContain("champion:Gamma");
    // widen: Gamma appears with a real rank
    const wide = stateAt(index, 3.5, { topN: 3 });
    expect(wide.rows.map((r) => r.entityId)).toContain("champion:Gamma");
  });

  it("equal totals rank lexically (builder emission order == attainment)", () => {
    const tied = makeStatGrowthDataset({
      Zed: [6000, 6300],
      Ahri: [6000, 6300],
    });
    const frame = stateAt(buildRaceIndex(tied), 2, { topN: 10 });
    expect(frame.rows.map((r) => r.entityId)).toEqual([
      "champion:Ahri",
      "champion:Zed",
    ]);
    expect(frame.rows[0].rank).toBe(1);
    expect(frame.rows[1].rank).toBe(2);
  });

  it("backward seeks equal fresh forward computation (deterministic replay)", () => {
    const late = stateAt(index, 5.25, { topN: 10 });
    stateAt(index, 1.75, { topN: 10 });
    const again = stateAt(index, 5.25, { topN: 10 });
    expect(again).toEqual(late);
  });

  it("chronological datasets keep the identity step map", () => {
    const chrono = buildRaceIndex(alternatingDataset(8));
    expect(chrono.progression).toBeNull();
    expect(chrono.stepCount).toBe(8);
    expect(Array.from(chrono.stepStartIndices)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const frame = stateAt(chrono, 3.5, { topN: 10 });
    expect(frame.eventIndex).toBe(3);
    expect(frame.stepIndex).toBe(3);
    expect(frame.stepLabel).toBeNull();
  });
});

describe("step cadence", () => {
  it("paces one level per msPerStep with no year pauses", () => {
    const index = buildRaceIndex(makeStatGrowthDataset(UNITS, { msPerStep: 1000 }));
    const cadence = buildCadence(index, DEFAULT_CADENCE);
    expect(cadence.stepCount).toBe(6);
    // the synthetic level years increase every step; a year pause would add
    // 900ms per level — assert it does not
    expect(cadence.totalMs).toBe(6000);
    expect(positionAtTime(cadence, 1500)).toBeCloseTo(1.5, 9);
    expect(timeAtPosition(cadence, 4)).toBe(4000);
  });

  it("defaults msPerStep when the dataset omits it", () => {
    const index = buildRaceIndex(makeStatGrowthDataset(UNITS));
    const cadence = buildCadence(index, DEFAULT_CADENCE);
    expect(cadence.totalMs).toBe(6000); // DEFAULT_MS_PER_STEP = 1000
  });

  it("maps Remotion frames into step space deterministically", () => {
    const index = buildRaceIndex(makeStatGrowthDataset(UNITS, { msPerStep: 1000 }));
    const cadence = buildCadence(index, DEFAULT_CADENCE);
    expect(positionAtFrame(cadence, 0, 30)).toBe(0);
    expect(positionAtFrame(cadence, 45, 30)).toBeCloseTo(1.5, 9);
    expect(positionAtFrame(cadence, 180, 30)).toBe(6);
    // playback speed scales time, not structure
    expect(positionAtFrame(cadence, 45, 30, 2)).toBeCloseTo(3, 9);
  });

  it("keeps chronological cadence byte-identical (base 220ms + year pauses)", () => {
    const index = buildRaceIndex(alternatingDataset(10));
    const cadence = buildCadence(index, DEFAULT_CADENCE);
    // 10 events * 220ms + one 2015->2016 boundary pause of 900ms
    expect(cadence.totalMs).toBe(10 * 220 + 900);
    expect(cadence.advanceMs).toBe(220);
  });
});
