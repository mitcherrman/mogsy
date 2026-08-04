/**
 * Phase 1.1 engine tests — cumulative wins/losses, latest-entity context,
 * seek reconstruction of both metrics, ranking independence from wins,
 * and Remotion frame mapping over the extended state.
 */
import { describe, expect, it } from "vitest";

import { stateAt } from "./engine";
import { buildRaceIndex } from "./raceIndex";
import { buildCadence, positionAtFrame, positionAtTime } from "./timeline";
import { makeDataset, type EventSpec } from "./testFixtures";

const CFG = { topN: 10 };

const SPEC: EventSpec[] = [
  ["player:A", "2015-01-01T10:00:00Z", 1, { gameId: "G0", team: "T1", region: "Korea" }],
  ["player:A", "2015-01-02T10:00:00Z", 0, { gameId: "G1", team: "T1", region: "Korea" }],
  ["player:B", "2015-01-03T10:00:00Z", 1, { gameId: "G2", team: "FNC", region: "Europe" }],
  ["player:A", "2015-01-04T10:00:00Z", 0, { gameId: "G3", team: "Gen.G", region: "Korea" }],
  ["player:B", "2015-01-05T10:00:00Z", 0, { gameId: "G4", team: "C9", region: "North America" }],
];

function rowsById(index: ReturnType<typeof buildRaceIndex>, p: number) {
  return Object.fromEntries(
    stateAt(index, p, CFG).rows.map((r) => [r.entityId, r]),
  );
}

describe("cumulative wins and derived losses", () => {
  const index = buildRaceIndex(makeDataset(SPEC));

  it("wins accumulate only on winsDelta=1; losses are derived", () => {
    const rows = rowsById(index, 5);
    expect(rows["player:A"].displayValue).toBe(3);
    expect(rows["player:A"].displayWins).toBe(1);
    expect(rows["player:A"].displayLosses).toBe(2);
    expect(rows["player:B"].displayValue).toBe(2);
    expect(rows["player:B"].displayWins).toBe(1);
    expect(rows["player:B"].displayLosses).toBe(1);
  });

  it("wins + losses === totalGames at every integer position", () => {
    for (let k = 0; k <= 5; k++) {
      for (const r of stateAt(index, k, CFG).rows) {
        expect(r.displayWins + r.displayLosses).toBe(r.displayValue);
      }
    }
  });

  it("win overlay nests inside the total bar on the same scale", () => {
    const rows = rowsById(index, 5);
    for (const r of Object.values(rows)) {
      expect(r.winBarFraction).toBeLessThanOrEqual(r.barFraction);
      expect(r.winBarFraction).toBeGreaterThanOrEqual(0);
    }
  });

  it("equal games with different wins do not reorder (rank = total games only)", () => {
    // A: 2 games 1 win (attained seq 1); B: 2 games 2 wins (attained seq 3)
    const idx = buildRaceIndex(
      makeDataset([
        ["player:A", "2015-01-01T10:00:00Z", 1],
        ["player:A", "2015-01-02T10:00:00Z", 0],
        ["player:B", "2015-01-03T10:00:00Z", 1],
        ["player:B", "2015-01-04T10:00:00Z", 1],
      ]),
    );
    const order = stateAt(idx, 4, CFG).rows.map((r) => r.entityId);
    // equal totals -> earlier attainment first, regardless of wins
    expect(order).toEqual(["player:A", "player:B"]);
  });

  it("exact and backward seeks reconstruct BOTH metrics", () => {
    const at3 = rowsById(index, 3);
    const late = rowsById(index, 5);
    const at3Again = rowsById(index, 3); // backward
    expect(at3Again).toEqual(at3);
    expect(late["player:A"].displayWins).toBe(1);
    expect(at3["player:A"].displayWins).toBe(1);
    expect(at3["player:A"].displayLosses).toBe(1);
  });

  it("mid-step interpolation moves winsValue only for a winning in-flight event", () => {
    // event 2 (G2) is a WIN for B entering the board
    const rows = rowsById(index, 2.5);
    expect(rows["player:B"].winsValue).toBeGreaterThan(0);
    expect(rows["player:B"].winsValue).toBeLessThan(1);
    expect(rows["player:B"].displayWins).toBe(0); // integer steps at k
    // event 4 (G4) is a LOSS: winsValue stays integral mid-step
    const rows4 = rowsById(index, 4.5);
    expect(rows4["player:B"].winsValue).toBe(1);
    expect(rows4["player:B"].value).toBeGreaterThan(1);
  });
});

describe("latest-entity context", () => {
  const index = buildRaceIndex(makeDataset(SPEC));

  it("each row carries the context of its latest counted event", () => {
    const rows = rowsById(index, 3); // A: G0,G1 counted; B: G2 counted
    expect(rows["player:A"].latestContext?.team).toBe("T1");
    expect(rows["player:B"].latestContext?.team).toBe("FNC");
    expect(rows["player:B"].latestContext?.region).toBe("Europe");
  });

  it("context updates exactly at the event where the team changes", () => {
    expect(rowsById(index, 3)["player:A"].latestContext?.team).toBe("T1");
    expect(rowsById(index, 4)["player:A"].latestContext?.team).toBe("Gen.G");
    // and reverts on backward seek
    expect(rowsById(index, 3)["player:A"].latestContext?.team).toBe("T1");
  });

  it("the in-flight event supplies context for the incrementing entity", () => {
    const rows = rowsById(index, 3.5); // G3 in flight: A moving to Gen.G
    expect(rows["player:A"].latestContext?.team).toBe("Gen.G");
    expect(rows["player:B"].latestContext?.team).toBe("FNC");
  });

  it("frame header exposes the driving event's full context", () => {
    const frame = stateAt(index, 3, CFG);
    expect(frame.currentContext.gameId).toBe("G3");
  });
});

describe("Remotion frame mapping over extended state", () => {
  const index = buildRaceIndex(makeDataset(SPEC));
  const cadence = buildCadence(index, { baseMsPerEvent: 100, yearPauseMs: 0 });

  it("frame -> position -> stateAt equals direct position calls, metrics and context included", () => {
    for (const frame of [0, 7, 15, 23, 30]) {
      const viaFrame = stateAt(index, positionAtFrame(cadence, frame, 60), CFG);
      const direct = stateAt(
        index,
        positionAtTime(cadence, (frame / 60) * 1000),
        CFG,
      );
      expect(viaFrame).toEqual(direct);
    }
  });

  it("8x and 10x scale time only — state at a given position is unchanged", () => {
    // speed folds into the time axis, never into the engine
    const p8 = positionAtFrame(cadence, 10, 60, 8);
    const p10 = positionAtFrame(cadence, 8, 60, 10);
    expect(p8).toBeCloseTo(positionAtTime(cadence, (10 / 60) * 1000 * 8));
    expect(p10).toBeCloseTo(positionAtTime(cadence, (8 / 60) * 1000 * 10));
    const a = stateAt(index, 2.5, CFG);
    const b = stateAt(index, 2.5, CFG);
    expect(a).toEqual(b);
  });
});
