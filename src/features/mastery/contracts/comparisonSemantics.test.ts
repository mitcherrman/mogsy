import { describe, expect, it } from "vitest";

import { MasteryContractParseError } from "./common";
import { assertKnownComparisonTemplate, readComparisonSemantics } from "./comparisonSemantics";

describe("readComparisonSemantics", () => {
  it("parses a compare_ability_cooldown candidate", () => {
    const cs = readComparisonSemantics({
      template: "compare_ability_cooldown",
      champion_a_display: "Ahri",
      champion_b_display: "Syndra",
      metric: "ability_cooldown",
      dimension: "time",
      subject_ref: "E",
      context: { ability_rank: 3, champion_level: null, form: null },
      unit: "seconds",
    });
    expect(cs.template).toBe("compare_ability_cooldown");
    expect(cs.championADisplay).toBe("Ahri");
    expect(cs.championBDisplay).toBe("Syndra");
    expect(cs.subjectRef).toBe("E");
    expect(cs.context.abilityRank).toBe(3);
    expect(cs.unit).toBe("seconds");
  });

  it("defaults dimension/subject_ref/context/unit when absent (champion-level comparisons)", () => {
    const cs = readComparisonSemantics({
      template: "compare_champion_base_stat",
      champion_a_display: "Ahri",
      champion_b_display: "Syndra",
      metric: "armor",
    });
    expect(cs.dimension).toBe("");
    expect(cs.subjectRef).toBe("");
    expect(cs.unit).toBe("");
    expect(cs.context).toEqual({ abilityRank: null, championLevel: null, form: null });
  });

  it("rejects an unrecognised template", () => {
    expect(() =>
      readComparisonSemantics({
        template: "some_future_comparison",
        champion_a_display: "Ahri",
        champion_b_display: "Syndra",
        metric: "armor",
      }),
    ).toThrow(MasteryContractParseError);
  });

  it("rejects a non-object value", () => {
    expect(() => readComparisonSemantics(null)).toThrow(MasteryContractParseError);
    expect(() => readComparisonSemantics("nope")).toThrow(MasteryContractParseError);
  });

  it("never carries a value, winner, or tie state — only structural fields exist on the parsed shape", () => {
    const cs = readComparisonSemantics({
      template: "compare_ability_cooldown",
      champion_a_display: "Ahri",
      champion_b_display: "Syndra",
      metric: "ability_cooldown",
      subject_ref: "E",
      context: { ability_rank: 3, champion_level: null, form: null },
      unit: "seconds",
    });
    expect(Object.keys(cs).sort()).toEqual(
      ["championADisplay", "championBDisplay", "context", "dimension", "metric", "subjectRef", "template", "unit"].sort(),
    );
  });
});

describe("assertKnownComparisonTemplate", () => {
  it("passes for a known template and throws for an unknown one", () => {
    expect(() => assertKnownComparisonTemplate("compare_champion_base_stat")).not.toThrow();
    expect(() => assertKnownComparisonTemplate("some_future_comparison")).toThrow(MasteryContractParseError);
  });
});
