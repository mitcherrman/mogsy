import { describe, expect, it } from "vitest";
import {
  MINUS,
  formatDelta,
  formatImpactNumber,
  formatParameterValue,
  formatRelative,
  formatStatValue,
  parameterLabel,
  projectedStatLabel,
} from "./format";

describe("number formatting", () => {
  it("uses the real minus sign and trims a trailing .0", () => {
    expect(formatImpactNumber(-5.1, 1)).toBe(`${MINUS}5.1`);
    expect(formatStatValue(620)).toBe("620");
    expect(formatStatValue(128.9)).toBe("128.9");
    expect(formatStatValue(2303.0000000001)).toBe("2303");
    expect(formatImpactNumber(100, 1)).toBe("100");
  });

  it("never prints -0 or +0", () => {
    expect(formatImpactNumber(-0, 1, { signed: true })).toBe("0");
    expect(formatImpactNumber(1e-12, 1, { signed: true })).toBe("0");
    expect(formatImpactNumber(-1e-12, 1, { signed: true })).toBe("0");
  });

  it("a real but tiny difference is not rounded to a misleading zero", () => {
    expect(formatDelta(-0.062, "flat", "projected")).toBe(`${MINUS}0.1`);
    expect(formatDelta(-0.04, "flat", "projected")).toBe(`${MINUS}0.04`);
    expect(formatDelta(0.04, "flat", "projected")).toBe("+0.04");
  });

  it("is safe for non-finite input", () => {
    expect(formatImpactNumber(Number.NaN, 1)).toBe("—");
    expect(formatImpactNumber(Number.POSITIVE_INFINITY, 1)).toBe("—");
    expect(formatRelative(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatRelative(null)).toBeNull();
  });

  it("parameter values keep Riot's precision; attack-speed growth is a percentage", () => {
    expect(formatParameterValue(2.35, "percent_points")).toBe("2.35%");
    expect(formatParameterValue(0.658, "flat")).toBe("0.658");
    expect(formatDelta(1.5 - 2.35, "percent_points", "parameter")).toBe(`${MINUS}0.85 pts`);
    expect(formatDelta(3.4 - 3.7, "flat", "parameter")).toBe(`${MINUS}0.3`);
  });

  it("relative changes are signed percentages with one decimal at most", () => {
    expect(formatRelative(-0.25)).toBe(`${MINUS}25%`);
    expect(formatRelative(-0.3617)).toBe(`${MINUS}36.2%`);
    expect(formatRelative(0.0443)).toBe("+4.4%");
    expect(formatRelative(0)).toBe("0%");
  });
});

describe("labels", () => {
  it("name the parameter, never 'power'", () => {
    expect(parameterLabel("armor", "growth")).toBe("Armor growth");
    expect(parameterLabel("ad", "base")).toBe("Base AD");
    expect(parameterLabel("health", "growth")).toBe("Health growth");
    expect(parameterLabel("mr", "base")).toBe("Base MR");
    expect(parameterLabel("attack_speed", "growth")).toBe("Attack speed growth");
    expect(projectedStatLabel("ad")).toBe("base AD");
    expect(projectedStatLabel("health")).toBe("base health");
  });
});
