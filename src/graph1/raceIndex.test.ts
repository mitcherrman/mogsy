/** Checkpoint index correctness vs naive full replay. */
import { describe, expect, it } from "vitest";

import { buildRaceIndex, stateAfter } from "./raceIndex";
import { alternatingDataset } from "./testFixtures";

describe("buildRaceIndex / stateAfter", () => {
  const dataset = alternatingDataset(700); // > 2 checkpoint intervals
  const index = buildRaceIndex(dataset);

  function naiveTotals(k: number): Map<string, number> {
    const totals = new Map<string, number>();
    for (let i = 0; i < k; i++) {
      const e = dataset.events[i];
      totals.set(e.rankedEntityId, (totals.get(e.rankedEntityId) ?? 0) + e.delta);
    }
    return totals;
  }

  it("matches naive replay at arbitrary positions incl. checkpoint edges", () => {
    for (const k of [0, 1, 17, 255, 256, 257, 511, 512, 513, 699, 700]) {
      const { totals } = stateAfter(index, k);
      const naive = naiveTotals(k);
      for (let e = 0; e < index.entityIds.length; e++) {
        expect(totals[e]).toBe(naive.get(index.entityIds[e]) ?? 0);
      }
    }
  });

  it("final totals equal the event count (delta always 1)", () => {
    const sum = Array.from(index.finalTotals).reduce((a, b) => a + b, 0);
    expect(sum).toBe(700);
    expect(index.eventCount).toBe(700);
  });

  it("returns fresh arrays (immutability of the index)", () => {
    const a = stateAfter(index, 300);
    a.totals[0] = 999999;
    const b = stateAfter(index, 300);
    expect(b.totals[0]).not.toBe(999999);
  });

  it("attain tracks the sequence that set the current total", () => {
    const { attain, totals } = stateAfter(index, 10);
    for (let e = 0; e < index.entityIds.length; e++) {
      if (totals[e] > 0) {
        expect(index.eventEntityIdx[attain[e]]).toBe(e);
        expect(attain[e]).toBeLessThan(10);
      } else {
        expect(attain[e]).toBe(-1);
      }
    }
  });
});
