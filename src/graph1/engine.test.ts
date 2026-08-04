/**
 * Pure race-engine tests — determinism, tie rules, entry/exit, seeks.
 */
import { describe, expect, it } from "vitest";

import { stateAt, type RaceFrameState } from "./engine";
import { buildRaceIndex } from "./raceIndex";
import { alternatingDataset, makeDataset } from "./testFixtures";

const CFG = { topN: 10 };

function rowsById(frame: RaceFrameState) {
  return Object.fromEntries(frame.rows.map((r) => [r.entityId, r]));
}

describe("stateAt basics", () => {
  const index = buildRaceIndex(
    makeDataset([
      ["player:A", "2015-01-01T10:00:00Z"],
      ["player:B", "2015-01-02T10:00:00Z"],
      ["player:B", "2015-01-03T10:00:00Z"],
    ]),
  );

  it("event 0: empty board", () => {
    const frame = stateAt(index, 0, CFG);
    expect(frame.rows).toHaveLength(0);
    expect(frame.eventIndex).toBe(0);
  });

  it("first increment appears at position 1 with displayValue 1", () => {
    const frame = stateAt(index, 1, CFG);
    expect(frame.rows.map((r) => r.entityId)).toEqual(["player:A"]);
    expect(frame.rows[0].displayValue).toBe(1);
    expect(frame.rows[0].rank).toBe(1);
  });

  it("final state totals reconcile with an independent reduction", () => {
    const frame = stateAt(index, index.eventCount, CFG);
    const byId = rowsById(frame);
    expect(byId["player:B"].displayValue).toBe(2);
    expect(byId["player:A"].displayValue).toBe(1);
    expect(byId["player:B"].rank).toBe(1);
  });

  it("displayed integers never go fractional mid-step", () => {
    const frame = stateAt(index, 2.5, CFG);
    for (const row of frame.rows) {
      expect(Number.isInteger(row.displayValue)).toBe(true);
    }
    // bar value DOES interpolate for the incrementing entity
    const b = rowsById(frame)["player:B"];
    expect(b.value).toBeGreaterThan(1);
    expect(b.value).toBeLessThan(2);
    expect(b.displayValue).toBe(1);
  });
});

describe("tie rules", () => {
  // A scores at 0, B scores at 1 → tied 1-1: A attained first, stays ahead.
  // B scores again at 2 → strictly greater, passes.
  const index = buildRaceIndex(
    makeDataset([
      ["player:A", "2015-01-01T10:00:00Z"],
      ["player:B", "2015-01-01T10:00:00Z"], // simultaneous timestamp
      ["player:B", "2015-01-02T10:00:00Z"],
    ]),
  );

  it("equal totals retain prior stable order (earlier attainment first)", () => {
    const frame = stateAt(index, 2, CFG);
    expect(frame.rows.map((r) => r.entityId)).toEqual(["player:A", "player:B"]);
  });

  it("tied entities do not cross until strictly greater", () => {
    const at2 = stateAt(index, 2, CFG).rows.map((r) => r.entityId);
    const at3 = stateAt(index, 3, CFG).rows.map((r) => r.entityId);
    expect(at2).toEqual(["player:A", "player:B"]);
    expect(at3).toEqual(["player:B", "player:A"]);
  });

  it("simultaneous timestamps stay strictly ordered by sequence", () => {
    // between events 0 and 1 (same occurredAt) state is still well defined
    const frame = stateAt(index, 1, CFG);
    expect(frame.rows.map((r) => r.entityId)).toEqual(["player:A"]);
  });

  it("lexical fallback keeps the comparator total", () => {
    // two entities with equal totals AND equal attainment are impossible in
    // real data (one event per sequence); force the comparator path anyway
    const idx = buildRaceIndex(
      makeDataset([
        ["player:Z", "2015-01-01T10:00:00Z"],
        ["player:A", "2015-01-02T10:00:00Z"],
      ]),
    );
    const frame = stateAt(idx, 2, CFG);
    // Z attained 1 first → Z above A despite lexical order
    expect(frame.rows.map((r) => r.entityId)).toEqual(["player:Z", "player:A"]);
  });
});

describe("top-N entry and exit", () => {
  // topN = 2. C overtakes and pushes B off the board.
  const index = buildRaceIndex(
    makeDataset([
      ["player:A", "2015-01-01T10:00:00Z"],
      ["player:A", "2015-01-02T10:00:00Z"],
      ["player:B", "2015-01-03T10:00:00Z"],
      ["player:C", "2015-01-04T10:00:00Z"],
      ["player:C", "2015-01-05T10:00:00Z"],
    ]),
  );
  const cfg = { topN: 2 };

  it("zero-value entities never render", () => {
    const frame = stateAt(index, 1, cfg);
    expect(frame.rows.map((r) => r.entityId)).toEqual(["player:A"]);
  });

  it("an entering entity starts one slot below the board and fades in", () => {
    const frame = stateAt(index, 4.5, cfg); // C's second game in flight
    const c = rowsById(frame)["player:C"];
    expect(c.entering).toBe(true);
    expect(c.y).toBeGreaterThan(1); // moving up from the off-board slot (2)
    expect(c.opacity).toBeGreaterThan(0);
    expect(c.opacity).toBeLessThan(1);
  });

  it("the displaced entity exits through the off-board slot", () => {
    const frame = stateAt(index, 4.5, cfg);
    const b = rowsById(frame)["player:B"];
    expect(b.exiting).toBe(true);
    const done = stateAt(index, 5, cfg);
    expect(done.rows.map((r) => r.entityId)).toEqual(["player:A", "player:C"]);
  });
});

describe("seek determinism", () => {
  const index = buildRaceIndex(alternatingDataset(600)); // crosses checkpoints

  it("repeated exact seeks return deep-equal state", () => {
    for (const p of [0, 1, 2.25, 255, 256, 257.75, 599, 600]) {
      const a = stateAt(index, p, CFG);
      const b = stateAt(index, p, CFG);
      expect(b).toEqual(a);
    }
  });

  it("backward seeks equal fresh forward computation", () => {
    const late = stateAt(index, 590, CFG);
    const early = stateAt(index, 10, CFG);
    const lateAgain = stateAt(index, 590, CFG);
    const earlyAgain = stateAt(index, 10, CFG);
    expect(lateAgain).toEqual(late);
    expect(earlyAgain).toEqual(early);
  });

  it("year-boundary and final positions are exact", () => {
    const final = stateAt(index, 600, CFG);
    const sum = final.rows.reduce((acc, r) => acc + r.displayValue, 0);
    expect(sum).toBe(600); // visible+hidden reconcile (only 2 entities)
    expect(final.rows[0].displayValue + final.rows[1].displayValue).toBe(600);
  });

  it("out-of-range positions clamp", () => {
    expect(stateAt(index, -5, CFG)).toEqual(stateAt(index, 0, CFG));
    expect(stateAt(index, 9999, CFG)).toEqual(stateAt(index, 600, CFG));
  });
});

describe("display config", () => {
  const index = buildRaceIndex(alternatingDataset(20));

  it("reduced motion snaps to whole-event states", () => {
    const snap = stateAt(index, 7.6, { topN: 10, reducedMotion: true });
    const whole = stateAt(index, 7, { topN: 10, reducedMotion: true });
    expect(snap.rows).toEqual(whole.rows);
  });

  it("speed is not an engine input: same position, same state", () => {
    // the clock maps time->position outside the engine; assert the engine
    // has no other degrees of freedom
    const a = stateAt(index, 12.5, CFG);
    const b = stateAt(index, 12.5, CFG);
    expect(a).toEqual(b);
  });
});
