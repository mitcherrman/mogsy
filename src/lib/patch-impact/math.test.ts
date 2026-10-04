import { describe, expect, it } from "vitest";
import {
  IMPACT_CHECKPOINTS,
  assertImpactLevel,
  clampImpactLevel,
  crossoverLevel,
  isImpactLevel,
  parameterFact,
  projectAtLevel,
  projectFlatLevels,
  relativeDelta,
  riotLevelMultiplier,
  statAtLevel,
} from "./math";
import type { ProjectionInputs, StatValue } from "./types";

const v = (value: number): StatValue => ({ value, provenance: "riot_line" });
const inputs = (bb: number, ba: number, gb: number, ga: number): ProjectionInputs => ({
  baseBefore: v(bb),
  baseAfter: v(ba),
  growthBefore: v(gb),
  growthAfter: v(ga),
});

describe("growth curve is reused, not copied", () => {
  it("g(1/6/11/18) = 0 / 3.95 / 8.775 / 17", () => {
    expect(riotLevelMultiplier(1)).toBe(0);
    expect(riotLevelMultiplier(6)).toBeCloseTo(3.95, 10);
    expect(riotLevelMultiplier(11)).toBeCloseTo(8.775, 10);
    expect(riotLevelMultiplier(18)).toBeCloseTo(17, 10);
    expect(statAtLevel(66, 3.4, 18)).toBeCloseTo(66 + 3.4 * 17, 10);
  });
});

describe("levels", () => {
  it("accepts integers 1–18 only", () => {
    for (const ok of [1, 6, 11, 18]) expect(isImpactLevel(ok)).toBe(true);
    for (const bad of [0, 19, -1, 1.5, NaN, Infinity, "3", null, undefined]) {
      expect(isImpactLevel(bad)).toBe(false);
      expect(() => assertImpactLevel(bad)).toThrow(RangeError);
    }
    expect(() => projectAtLevel(inputs(1, 1, 1, 1), 0)).toThrow(RangeError);
    expect(() => projectAtLevel(inputs(1, 1, 1, 1), 18.5)).toThrow(RangeError);
  });

  it("clamps finite UI input and still refuses non-finite", () => {
    expect(clampImpactLevel(-4)).toBe(1);
    expect(clampImpactLevel(99)).toBe(18);
    expect(clampImpactLevel(6.4)).toBe(6);
    expect(() => clampImpactLevel(NaN)).toThrow(RangeError);
  });

  it("exposes the 1/6/11/18 checkpoints", () => {
    expect(IMPACT_CHECKPOINTS).toEqual([1, 6, 11, 18]);
  });
});

describe("relative delta", () => {
  it("is null with an explicit reason when the baseline is zero", () => {
    expect(relativeDelta(0, 5)).toEqual({ value: null, reason: "zero_baseline" });
    expect(relativeDelta(0, 0)).toEqual({ value: null, reason: "zero_baseline" });
  });

  it("never emits Infinity or NaN", () => {
    const cases: Array<[number, number]> = [
      [0, 1],
      [NaN, 1],
      [1, NaN],
      [Infinity, 1],
      [1, Infinity],
    ];
    for (const [b, a] of cases) {
      const r = relativeDelta(b, a);
      expect(r.value === null || Number.isFinite(r.value)).toBe(true);
    }
  });

  it("is signed and relative to the baseline", () => {
    expect(relativeDelta(8, 6).value).toBeCloseTo(-0.25, 10);
  });
});

describe("parameter facts", () => {
  it("states the changed parameter with its own deltas", () => {
    const f = parameterFact({ property: "ad_growth", before: 3.7, after: 3.4 });
    expect(f).toMatchObject({ family: "ad", half: "growth", unit: "flat", provenance: "riot_line" });
    expect(f.absDelta).toBeCloseTo(-0.3, 10);
    expect(f.relDelta! * 100).toBeCloseTo(-8.1, 1);
  });

  it("labels attack-speed growth as percentage points with a relative change", () => {
    const f = parameterFact({ property: "attack_speed_growth", before: 2.35, after: 1.5 });
    expect(f.unit).toBe("percent_points");
    expect(f.absDelta).toBeCloseTo(-0.85, 10);
    expect(f.relDelta! * 100).toBeCloseTo(-36.2, 1);
  });

  it("handles a zero-before parameter without Infinity", () => {
    const f = parameterFact({ property: "mana_growth", before: 0, after: 5 });
    expect(f.relDelta).toBeNull();
    expect(f.relDeltaUnavailableReason).toBe("zero_baseline");
    expect(f.absDelta).toBe(5);
  });
});

describe("flat projection — worked checks", () => {
  it("Lee Sin 26.12 AD growth 3.7 → 3.4 on base 66", () => {
    const levels = projectFlatLevels(inputs(66, 66, 3.7, 3.4));
    expect(levels).toHaveLength(18);
    expect(levels[17].before).toBeCloseTo(128.9, 6);
    expect(levels[17].after).toBeCloseTo(123.8, 6);
    expect(levels[17].absDelta).toBeCloseTo(-5.1, 6);
    expect(levels[17].relDelta! * 100).toBeCloseTo(-3.957, 2);
    expect(levels[0].absDelta).toBe(0); // growth-only change: no delta at L1
  });

  it("Fiora 26.19 health growth 99 → 105 on base 620", () => {
    const l18 = projectAtLevel(inputs(620, 620, 99, 105), 18);
    expect(l18.before).toBeCloseTo(2303, 6);
    expect(l18.after).toBeCloseTo(2405, 6);
    expect(l18.absDelta).toBeCloseTo(102, 6);
    expect(l18.relDelta! * 100).toBeCloseTo(4.429, 2);
  });

  it("Smolder 26.10 base AD 60 → 58 on growth 2.3: −2 at every level", () => {
    const levels = projectFlatLevels(inputs(60, 58, 2.3, 2.3));
    for (const point of levels) expect(point.absDelta).toBeCloseTo(-2, 10);
    expect(levels[0].relDelta! * 100).toBeCloseTo(-3.333, 2);
    expect(levels[17].relDelta! * 100).toBeCloseTo(-2.02, 2);
    expect(crossoverLevel(levels)).toBeNull();
  });

  it("Vi 26.19 63 + 3.5 → 61 + 3.9 crosses over at the evidence-derived level", () => {
    const levels = projectFlatLevels(inputs(63, 61, 3.5, 3.9));
    expect(levels[0].absDelta).toBeCloseTo(-2, 10);
    expect(levels[0].relDelta! * 100).toBeCloseTo(-3.175, 2);
    expect(levels[5].absDelta).toBeCloseTo(-0.42, 6);
    expect(levels[10].absDelta).toBeCloseTo(1.51, 2);
    expect(levels[17].absDelta).toBeCloseTo(4.8, 6);
    expect(levels[17].relDelta! * 100).toBeCloseTo(3.92, 1);
    // The contract text says "between L6 and L7", but L7 is still −0.062:
    // break-even is g(L) = 5 and the first positive level is 8.
    expect(levels[6].absDelta).toBeCloseTo(-0.062, 3);
    expect(crossoverLevel(levels)).toBe(8);
  });

  it("a zero baseline at a level gives a null relative delta, not Infinity", () => {
    const p = projectAtLevel(inputs(0, 5, 0, 1), 1);
    expect(p.before).toBe(0);
    expect(p.relDelta).toBeNull();
    expect(p.relDeltaUnavailableReason).toBe("zero_baseline");
  });

  it("never reads a growth-only change's L1 zero as a crossover", () => {
    expect(crossoverLevel(projectFlatLevels(inputs(100, 100, 10, 12)))).toBeNull();
  });

  it("level 1 equals the base; level 18 uses the full multiplier", () => {
    expect(projectAtLevel(inputs(10, 12, 5, 6), 1)).toMatchObject({ before: 10, after: 12 });
    const l18 = projectAtLevel(inputs(10, 12, 5, 6), 18);
    expect(l18.before).toBeCloseTo(10 + 5 * 17, 10);
    expect(l18.after).toBeCloseTo(12 + 6 * 17, 10);
  });
});
