/** RL2 — the honesty rules of the two slides, tested without a chart. */
import { describe, expect, it } from "vitest";
import type { TrendReport } from "@/lib/quiz/analyticsApi";
import {
  ALL_MODES,
  barSeries,
  dimensionFor,
  donutSlices,
  modeOptions,
  sliceTotal,
} from "./analyticsSlices";

const report = {
  ok: true,
  tier: "free",
  capability: {
    can_view_snapshot: true, snapshot_window_days: 7, can_view_trends: false,
    trend_windows: [], allowed_windows: [7], can_build: false, reason: "free",
  },
  windows: [7],
  window_days: null,
  since: null,
  until: null,
  current: { attempts: 40, correct: 28, accuracy: 70, active_days: 4 },
  modes: [
    { mode: "practice", label: "Practice", known: true, attempts: 25, correct: 18, accuracy: 72 },
    { mode: "ranked", label: "Ranked", known: true, attempts: 12, correct: 8, accuracy: 67 },
    { mode: "unknown", label: "Unplaced", known: false, attempts: 3, correct: 2, accuracy: 67 },
  ],
  categories: [
    { category: "Items", attempts: 22, correct: 18, accuracy: 82 },
    { category: "Runes", attempts: 14, correct: 7, accuracy: 50 },
    { category: "Jungle", attempts: 4, correct: 3, accuracy: 75, low_sample: true },
    { category: "Empty", attempts: 0, correct: 0, accuracy: 0 },
  ],
  counts_modes: ["practice", "ranked"],
  excludes_modes: [],
  sufficiency: { has_data: true },
} as unknown as TrendReport;

describe("the mode control chooses a DIMENSION, it does not invent a cross-tab", () => {
  it("reads categories under All modes and modes under a single mode", () => {
    expect(dimensionFor(ALL_MODES)).toBe("category");
    expect(dimensionFor("ranked")).toBe("mode");
    expect(barSeries(report, ALL_MODES).map((b) => b.key)).toEqual(["Items", "Jungle", "Runes"]);
    expect(barSeries(report, "ranked").map((b) => b.key)).toEqual([
      "practice", "ranked", "unknown",
    ]);
  });

  it("marks the chosen mode rather than dropping the others", () => {
    const bars = barSeries(report, "ranked");
    expect(bars.filter((b) => b.selected).map((b) => b.key)).toEqual(["ranked"]);
    expect(bars).toHaveLength(3);
  });

  it("offers the unplaceable-mode bucket as an option, never silently drops it", () => {
    expect(modeOptions(report).map((o) => o.value)).toEqual([
      ALL_MODES, "practice", "ranked", "unknown",
    ]);
  });
});

describe("accuracy is never re-derived, and low sample keeps its true score", () => {
  it("passes the server's own percentage through", () => {
    const jungle = barSeries(report, ALL_MODES).find((b) => b.key === "Jungle")!;
    expect(jungle.accuracy).toBe(75);
    expect(jungle.lowSample).toBe(true);
  });

  it("omits a row the account has not answered at all", () => {
    expect(barSeries(report, ALL_MODES).map((b) => b.key)).not.toContain("Empty");
  });
});

describe("the donut is a true part-to-whole", () => {
  it("carries COUNTS, and they sum to the whole it draws", () => {
    const slices = donutSlices(report, ALL_MODES);
    expect(slices.map((s) => s.attempts)).toEqual([22, 14, 4]);
    expect(sliceTotal(slices)).toBe(40);
  });

  it("orders by size, largest arc first", () => {
    expect(donutSlices(report, ALL_MODES).map((s) => s.key)).toEqual([
      "Items", "Runes", "Jungle",
    ]);
  });

  it("exposes no accuracy field at all, so a rate cannot reach an arc", () => {
    for (const slice of donutSlices(report, ALL_MODES)) {
      expect(Object.keys(slice).sort()).toEqual(["attempts", "key", "label", "selected"]);
    }
  });
});

describe("a missing report is empty, never zero", () => {
  it("returns nothing rather than a chart of zeroes", () => {
    expect(barSeries(null, ALL_MODES)).toEqual([]);
    expect(donutSlices(null, ALL_MODES)).toEqual([]);
    expect(modeOptions(null).map((o) => o.value)).toEqual([ALL_MODES]);
  });
});
