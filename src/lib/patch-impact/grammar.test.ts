import { describe, expect, it } from "vitest";
import { parseImpactPair, parseImpactValue } from "./grammar";

describe("parseImpactValue — backend corpus parity", () => {
  it.each([
    ["34 + 5/Level", { kind: "compound", base: 34, growth: 5, growthPercent: false }],
    ["32 + 4.7/Level", { kind: "compound", base: 32, growth: 4.7, growthPercent: false }],
    ["280 + 40/level", { kind: "compound", base: 280, growth: 40, growthPercent: false }],
    ["550 + 103/Level", { kind: "compound", base: 550, growth: 103, growthPercent: false }],
    ["3.5 + .55/Level", { kind: "compound", base: 3.5, growth: 0.55, growthPercent: false }],
    [".658 + 3.3%/Level", { kind: "compound", base: 0.658, growth: 3.3, growthPercent: true }],
    ["61 + 3.3/Level", { kind: "compound", base: 61, growth: 3.3, growthPercent: false }],
    ["4.95 per level", { kind: "scalar", value: 4.95, percent: false, perLevel: true }],
    ["2.35%", { kind: "scalar", value: 2.35, percent: true, perLevel: false }],
    ["58", { kind: "scalar", value: 58, percent: false, perLevel: false }],
    ["4.5/level", { kind: "scalar", value: 4.5, percent: false, perLevel: true }],
  ])("%s", (raw, expected) => {
    expect(parseImpactValue(raw)).toEqual(expected);
  });

  it("reads a leading-dot number as a fraction, never as 658", () => {
    expect(parseImpactValue(".658 + 3.3%/Level")).toMatchObject({ kind: "compound", base: 0.658 });
    expect(parseImpactValue(".67")).toMatchObject({ kind: "scalar", value: 0.67 });
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "34 + 5/Level (halved vs minions)",
    "30 / 38 / 46 / 54 / 62",
    "58-60",
    "~55",
    "55 (approx)",
    "1,000",
    "N/A",
    "34 +",
    "+5",
    "5 + 3",
    "12 per",
  ])("refuses %j", (raw) => {
    expect(parseImpactValue(raw as string | null | undefined)).toBeNull();
  });
});

describe("parseImpactPair — per-property rules", () => {
  it("accepts a scalar pair on a base property", () => {
    expect(parseImpactPair("base_ad", "60", "58")).toEqual({ ok: true, shape: "scalar", before: 60, after: 58 });
  });

  it("accepts a per-level suffix only on growth, on both sides", () => {
    expect(parseImpactPair("armor_growth", "4.95 per level", "4.5 per level")).toMatchObject({ ok: true });
    expect(parseImpactPair("armor_growth", "4.95 per level", "4.5")).toMatchObject({ ok: false });
    expect(parseImpactPair("base_armor", "30 per level", "28 per level")).toMatchObject({ ok: false });
  });

  it("accepts % only on attack_speed_growth, on both sides", () => {
    expect(parseImpactPair("attack_speed_growth", "2.35%", "1.5%")).toMatchObject({ ok: true });
    expect(parseImpactPair("attack_speed_growth", "2.35%", "1.5")).toMatchObject({ ok: false });
    expect(parseImpactPair("health_growth", "10%", "9%")).toMatchObject({ ok: false });
  });

  it("accepts a compound pair for flat families and keeps both halves", () => {
    expect(parseImpactPair("base_ad", "63 + 3.5/Level", "61 + 3.9/Level")).toEqual({
      ok: true,
      shape: "compound",
      before: { base: 63, growth: 3.5 },
      after: { base: 61, growth: 3.9 },
    });
  });

  it("refuses scalar vs compound (COMPOUND_SHAPE_MISMATCH)", () => {
    expect(parseImpactPair("base_armor", "34 + 5/Level", "36")).toEqual({ ok: false, refusal: "shape_mismatch" });
    expect(parseImpactPair("base_armor", "36", "34 + 5/Level")).toEqual({ ok: false, refusal: "shape_mismatch" });
  });

  it("refuses a growth unit change (GROWTH_UNIT_CHANGED)", () => {
    expect(parseImpactPair("base_health", "550 + 103/Level", "580 + 2%/Level")).toEqual({
      ok: false,
      refusal: "growth_unit_changed",
    });
  });

  it("refuses percent-growth compounds and attack-speed compounds in V1", () => {
    expect(parseImpactPair("base_ad", ".658 + 3.3%/Level", ".67 + 2.8%/Level")).toEqual({
      ok: false,
      refusal: "unsupported_compound",
    });
    expect(parseImpactPair("base_attack_speed", "0.6 + 2/Level", "0.6 + 3/Level")).toEqual({
      ok: false,
      refusal: "unsupported_compound",
    });
  });

  it("refuses negatives, qualifiers, rank arrays and ranges", () => {
    expect(parseImpactPair("base_ad", "-5", "-3")).toEqual({ ok: false, refusal: "negative_value" });
    expect(parseImpactPair("base_ad", "60", "58 (halved)")).toMatchObject({ ok: false });
    expect(parseImpactPair("base_ad", "30 / 38 / 46", "28 / 36 / 44")).toMatchObject({ ok: false });
    expect(parseImpactPair("base_ad", "58-60", "55-57")).toMatchObject({ ok: false });
    expect(parseImpactPair("base_ad", null, "58")).toMatchObject({ ok: false });
  });
});
