/**
 * DD1 — `comparison_values.v1` reader: a typed allowlist that fails closed to
 * null and never throws (F-10).
 */
import { describe, expect, it } from "vitest";
import { readComparisonValues, withUnitLabel } from "./comparisonValues";
import { readComparisonSemantics } from "./comparisonSemantics";
import { parseMasteryPlayerQuestion, parseMasteryPlayerReveal } from "./parsers";
import {
  comparisonQuestionEnvelopes, comparisonRevealEnvelopes,
} from "../interactions/comparisonFixtures";
import { toQuestionReveal } from "../interactions/toQuestionReveal";

const WIRE = {
  contract: "comparison_values.v1",
  sides: [
    { token: "leona", value: 90.0, display: "90" },
    { token: "pantheon", value: 180.0, display: "180" },
  ],
  unit: "seconds",
  unit_label: "seconds",
  display_precision: 0,
  operator: "lesser",
  delta: 90.0,
  delta_display: "90",
};

const clone = () => JSON.parse(JSON.stringify(WIRE)) as Record<string, unknown>;

describe("readComparisonValues — the served block", () => {
  it("reads the DD1 §5 shape exactly", () => {
    expect(readComparisonValues(WIRE)).toEqual({
      contract: "comparison_values.v1",
      sides: [
        { token: "leona", value: 90, display: "90" },
        { token: "pantheon", value: 180, display: "180" },
      ],
      unit: "seconds",
      unitLabel: "seconds",
      displayPrecision: 0,
      operator: "lesser",
      delta: 90,
      deltaDisplay: "90",
    });
  });

  it("reads decimals, a tie and a unitless block", () => {
    const dec = clone();
    dec.sides = [{ token: "a", value: 0.625, display: "0.63" }, { token: "b", value: 0.658, display: "0.66" }];
    dec.display_precision = 2;
    expect(readComparisonValues(dec)?.sides[0].display).toBe("0.63");

    const tie = clone();
    tie.sides = [{ token: "a", value: 9, display: "9" }, { token: "b", value: 9, display: "9" }];
    tie.delta = 0;
    tie.delta_display = "0";
    expect(readComparisonValues(tie)?.delta).toBe(0);

    const unitless = clone();
    unitless.unit = "";
    unitless.unit_label = "";
    const cv = readComparisonValues(unitless)!;
    expect(withUnitLabel(cv.sides[0].display, cv)).toBe("90");
  });

  it("tolerates the optional fields being absent or null", () => {
    const min = { contract: "comparison_values.v1", sides: WIRE.sides };
    expect(readComparisonValues(min)).toMatchObject({
      unit: null, unitLabel: null, displayPrecision: null, operator: null, delta: null, deltaDisplay: null,
    });
    expect(readComparisonValues({ ...WIRE, delta: null, delta_display: null })?.deltaDisplay).toBeNull();
  });

  it("is absent-safe", () => {
    expect(readComparisonValues(undefined)).toBeNull();
    expect(readComparisonValues(null)).toBeNull();
  });
});

describe("readComparisonValues — fails closed, never throws", () => {
  const cases: Array<[string, (o: Record<string, unknown>) => unknown]> = [
    ["wrong contract", (o) => ({ ...o, contract: "comparison_values.v2" })],
    ["missing contract", ({ contract: _c, ...o }) => o],
    ["missing sides", ({ sides: _s, ...o }) => o],
    ["one side", (o) => ({ ...o, sides: [(o.sides as unknown[])[0]] })],
    ["three sides", (o) => ({ ...o, sides: [...(o.sides as unknown[]), { token: "c", value: 1, display: "1" }] })],
    ["NaN value", (o) => ({ ...o, sides: [{ token: "a", value: NaN, display: "1" }, (o.sides as unknown[])[1]] })],
    ["Infinity value", (o) => ({ ...o, sides: [{ token: "a", value: Infinity, display: "1" }, (o.sides as unknown[])[1]] })],
    ["string value", (o) => ({ ...o, sides: [{ token: "a", value: "90", display: "90" }, (o.sides as unknown[])[1]] })],
    ["empty token", (o) => ({ ...o, sides: [{ token: "", value: 1, display: "1" }, (o.sides as unknown[])[1]] })],
    ["numeric token", (o) => ({ ...o, sides: [{ token: 1, value: 1, display: "1" }, (o.sides as unknown[])[1]] })],
    ["duplicate tokens", (o) => ({ ...o, sides: [(o.sides as unknown[])[0], (o.sides as unknown[])[0]] })],
    ["empty display", (o) => ({ ...o, sides: [{ token: "a", value: 1, display: "" }, (o.sides as unknown[])[1]] })],
    ["numeric display", (o) => ({ ...o, sides: [{ token: "a", value: 1, display: 1 }, (o.sides as unknown[])[1]] })],
    ["extra side key (a winner flag)", (o) => ({ ...o, sides: [{ token: "a", value: 1, display: "1", winner: true }, (o.sides as unknown[])[1]] })],
    ["extra top-level key (a winner copy)", (o) => ({ ...o, winner: "leona" })],
    ["extra top-level key (tie_state)", (o) => ({ ...o, tie_state: "decisive" })],
    ["negative precision", (o) => ({ ...o, display_precision: -1 })],
    ["fractional precision", (o) => ({ ...o, display_precision: 1.5 })],
    ["NaN delta", (o) => ({ ...o, delta: NaN })],
    ["numeric delta_display", (o) => ({ ...o, delta_display: 90 })],
    ["array", () => [WIRE]],
    ["string", () => "comparison_values.v1"],
  ];
  for (const [name, mutate] of cases) {
    it(`drops ${name}`, () => {
      expect(() => readComparisonValues(mutate(clone()))).not.toThrow();
      expect(readComparisonValues(mutate(clone()))).toBeNull();
    });
  }
});

describe("withUnitLabel", () => {
  it("writes the backend's unit label, and a percent sign tight", () => {
    expect(withUnitLabel("90", { unit: "seconds", unitLabel: "seconds" })).toBe("90 seconds");
    expect(withUnitLabel("590", { unit: "hitpoints", unitLabel: "health" })).toBe("590 health");
    expect(withUnitLabel("25.0", { unit: "percent", unitLabel: "%" })).toBe("25.0%");
    expect(withUnitLabel("3", { unit: null, unitLabel: null })).toBe("3");
  });
});

describe("the pre-reveal contract has no slot for values (F-1)", () => {
  it("comparison_semantics carrying a values block does not surface it", () => {
    const cs = readComparisonSemantics({
      template: "compare_ability_cooldown",
      champion_a_display: "Leona",
      champion_b_display: "Pantheon",
      metric: "ability_cooldown",
      comparison_values: WIRE,
    });
    expect(cs).not.toHaveProperty("comparison_values");
    expect(cs).not.toHaveProperty("comparisonValues");
    expect(JSON.stringify(cs)).not.toContain("180");
  });
});

describe("standalone Mastery reveal (mastery_player_reveal) — DD1 pass-through", () => {
  const withBlock = (block: unknown) => {
    const env = comparisonRevealEnvelopes()[0] as { data: Record<string, unknown> };
    return { ...env, data: { ...env.data, comparison_values: block } };
  };
  const question = parseMasteryPlayerQuestion(comparisonQuestionEnvelopes()[0]);

  it("reads the block and hands it to the in-place reveal", () => {
    const block = { ...WIRE, sides: [
      { token: "ahri", value: 8.4, display: "8.4" }, { token: "syndra", value: 15, display: "15.0" },
    ] };
    const reveal = parseMasteryPlayerReveal(withBlock(block));
    expect(reveal.comparisonValues?.sides[0].display).toBe("8.4");
    expect(toQuestionReveal(question, reveal, "ahri").comparisonValues?.sides[1].display).toBe("15.0");
  });

  it("an older server (no block) or a malformed block reads as no values", () => {
    const old = parseMasteryPlayerReveal(comparisonRevealEnvelopes()[0]);
    expect(old).not.toHaveProperty("comparisonValues");
    expect(toQuestionReveal(question, old, "ahri")).not.toHaveProperty("comparisonValues");
    expect(parseMasteryPlayerReveal(withBlock({ ...WIRE, sides: "x" }))).not.toHaveProperty("comparisonValues");
  });

  it("the question payload refuses the block (hidden-info guard)", () => {
    const env = comparisonQuestionEnvelopes()[0] as { data: Record<string, unknown> };
    expect(() => parseMasteryPlayerQuestion({ ...env, data: { ...env.data, comparison_values: WIRE } }))
      .toThrow();
  });
});
