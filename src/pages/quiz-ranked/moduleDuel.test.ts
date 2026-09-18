/**
 * RE1 — the head-to-head module axis. Pure, so every placement rule is pinned
 * here without a render: canonical module numbers decide columns, holes stay
 * holes, and nothing is ever summed or zero-filled.
 */
import { describe, expect, it } from "vitest";
import type { RoundHistoryEntry } from "@/lib/ranked-core/viewTypes";
import { buildModuleDuel, moduleAxisLength } from "./moduleDuel";

const entry = (roundNumber: number, basePoints: number | null, speed = 0): RoundHistoryEntry => ({
  roundNumber, outcome: basePoints ? "correct" : "incorrect",
  pointsAwarded: basePoints === null ? null : basePoints + speed,
  basePoints, speedBonusPoints: basePoints === null ? null : speed,
  dealt: 0, taken: 0, absorbed: 0, hpBefore: 0, hpAfter: 0, timeExpired: false,
});

const full = (bases: number[]) => bases.map((b, i) => entry(i + 1, b));

describe("buildModuleDuel", () => {
  it("builds one slot per module on a 1..matchLength axis, both rows filled", () => {
    const slots = buildModuleDuel({
      matchLength: 10, modulesPlayed: 10,
      viewer: full([2, 0, 3, 2, 4, 2, 2, 3, 0, 2]),
      opponent: full([0, 2, 2, 0, 2, 0, 2, 3, 2, 0]),
    });
    expect(slots.map((s) => s.module)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(slots[0].viewer?.basePoints).toBe(2);
    expect(slots[0].opponent?.basePoints).toBe(0);
    expect(slots[9].viewer?.basePoints).toBe(2);
    expect(slots.every((s) => s.viewerState === "scored" && s.opponentState === "scored"))
      .toBe(true);
  });

  it("places by the entry's OWN module number, not its array position", () => {
    // Out of order and with a hole: an index zip would pair these wrongly.
    const slots = buildModuleDuel({
      matchLength: 5, modulesPlayed: 5,
      viewer: [entry(5, 4), entry(1, 2), entry(3, 3)],
      opponent: [entry(2, 2), entry(5, 0)],
    });
    expect(slots.map((s) => s.viewer?.basePoints ?? null)).toEqual([2, null, 3, null, 4]);
    expect(slots.map((s) => s.opponent?.basePoints ?? null)).toEqual([null, 2, null, null, 0]);
  });

  it("keeps a missing module's slot as `missing`, never a zero, and shifts nothing", () => {
    const viewer = full([2, 0, 3, 2, 4, 2, 2, 3, 0, 2]).filter((e) => e.roundNumber !== 4);
    const slots = buildModuleDuel({
      matchLength: 10, modulesPlayed: 10, viewer, opponent: full(Array(10).fill(2)),
    });
    expect(slots).toHaveLength(10);
    expect(slots[3].viewer).toBeNull();
    expect(slots[3].viewerState).toBe("missing");
    // Module 5 is still in slot 5.
    expect(slots[4].module).toBe(5);
    expect(slots[4].viewer?.basePoints).toBe(4);
  });

  it("marks modules past a forfeit as `unplayed`, not missing", () => {
    const slots = buildModuleDuel({
      matchLength: 10, modulesPlayed: 6,
      viewer: full([2, 2, 2, 2, 2, 2]), opponent: full([0, 0, 0, 0, 0, 0]),
    });
    expect(slots).toHaveLength(10);
    expect(slots.slice(6).every((s) => s.viewerState === "unplayed" && s.viewer === null))
      .toBe(true);
    expect(slots[5].viewerState).toBe("scored");
  });

  it("reports a settlement with no award as `unscored` (neutral), not zero", () => {
    const slots = buildModuleDuel({
      matchLength: 2, modulesPlayed: 2,
      viewer: [entry(1, null), entry(2, 0)], opponent: [],
    });
    expect(slots[0].viewerState).toBe("unscored");
    expect(slots[0].viewer?.basePoints).toBeNull();
    // A real zero is scored, and stays a zero.
    expect(slots[1].viewerState).toBe("scored");
    expect(slots[1].viewer?.basePoints).toBe(0);
  });

  it("carries base and speed separately, never merged", () => {
    const [slot] = buildModuleDuel({
      matchLength: 1, modulesPlayed: 1, viewer: [entry(1, 2, 1)], opponent: [],
    });
    expect(slot.viewer).toEqual({ basePoints: 2, speedBonusPoints: 1 });
  });
});

describe("moduleAxisLength", () => {
  it("uses the frozen match length, never a hard-coded ten", () => {
    expect(moduleAxisLength({ matchLength: 7, modulesPlayed: 7, viewer: [], opponent: [] }))
      .toBe(7);
    expect(moduleAxisLength({ matchLength: 12, modulesPlayed: 3, viewer: [], opponent: [] }))
      .toBe(12);
  });

  it("falls back to modules played, then to the highest module either log names", () => {
    expect(moduleAxisLength({ matchLength: null, modulesPlayed: 6, viewer: [], opponent: [] }))
      .toBe(6);
    expect(moduleAxisLength({
      matchLength: null, modulesPlayed: null, viewer: [entry(3, 2)], opponent: [entry(8, 2)],
    })).toBe(8);
  });

  it("never drops a settlement past the declared length", () => {
    expect(moduleAxisLength({
      matchLength: 10, modulesPlayed: 10, viewer: [entry(11, 2)], opponent: [],
    })).toBe(11);
  });
});
