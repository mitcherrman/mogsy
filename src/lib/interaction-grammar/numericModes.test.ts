import { describe, expect, it } from "vitest";
import {
  formatPlayerValue, fractionOf, parseEstimate, sliderKey, snapToScale, stepDecimals, valueAtFraction,
  type NumericScale,
} from "./numericModes";

const HP: NumericScale = { min: 400, max: 800, step: 5, unitLabel: "HP" };
const CD: NumericScale = { min: 0, max: 30, step: 0.5, unitLabel: "s" };

describe("numeric input mechanics", () => {
  it("derives decimals from the step", () => {
    expect(stepDecimals(5)).toBe(0);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
  });

  it("clamps and snaps to the step grid anchored at min", () => {
    expect(snapToScale(643, HP)).toBe(645);
    expect(snapToScale(642, HP)).toBe(640);
    expect(snapToScale(10, HP)).toBe(400);
    expect(snapToScale(9999, HP)).toBe(800);
    expect(snapToScale(12.3, CD)).toBe(12.5);
    expect(snapToScale(0.1 + 0.2, CD)).toBe(0.5);
  });

  it("maps track fractions both ways", () => {
    expect(valueAtFraction(0, HP)).toBe(400);
    expect(valueAtFraction(1, HP)).toBe(800);
    expect(valueAtFraction(0.5, HP)).toBe(600);
    expect(valueAtFraction(-1, HP)).toBe(400);
    expect(fractionOf(600, HP)).toBe(0.5);
    expect(fractionOf(9999, HP)).toBe(1);
  });

  it("implements the WAI slider keys and places an unplaced marker first", () => {
    expect(sliderKey("ArrowRight", null, HP)).toBe(600);
    expect(sliderKey("Home", null, HP)).toBe(400);
    expect(sliderKey("End", null, HP)).toBe(800);
    expect(sliderKey("a", null, HP)).toBeNull();
    expect(sliderKey("ArrowRight", 600, HP)).toBe(605);
    expect(sliderKey("ArrowDown", 600, HP)).toBe(595);
    expect(sliderKey("PageUp", 600, HP)).toBe(640);
    expect(sliderKey("PageDown", 420, HP)).toBe(400);
    expect(sliderKey("ArrowRight", 800, HP)).toBe(800);
    expect(sliderKey("Enter", 600, HP)).toBeNull();
  });

  it("parses typed estimates without rewriting them", () => {
    expect(parseEstimate("645", HP)).toEqual({ ok: true, value: 645 });
    expect(parseEstimate(" 1,240 ", { ...HP, max: 2000 })).toEqual({ ok: true, value: 1240 });
    expect(parseEstimate("12.5", CD)).toEqual({ ok: true, value: 12.5 });
    expect(parseEstimate("", HP)).toEqual({ ok: false, reason: "empty" });
    expect(parseEstimate("12abc", HP)).toEqual({ ok: false, reason: "not-a-number" });
    expect(parseEstimate("1e3", HP)).toEqual({ ok: false, reason: "not-a-number" });
    expect(parseEstimate("12.25", CD)).toEqual({ ok: false, reason: "too-precise" });
    expect(parseEstimate("399", HP)).toEqual({ ok: false, reason: "below-range" });
    expect(parseEstimate("801", HP)).toEqual({ ok: false, reason: "above-range" });
  });

  it("formats only the player's own value, at the step's precision", () => {
    expect(formatPlayerValue(645, HP)).toBe("645 HP");
    expect(formatPlayerValue(12, CD)).toBe("12.0 s");
    expect(formatPlayerValue(1240, { ...HP, max: 2000, unitLabel: "" })).toBe("1,240");
  });
});
