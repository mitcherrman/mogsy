import { describe, expect, it } from "vitest";

import { MasteryContractParseError } from "./common";
import { assertKnownTemplate, readPromptSemantics } from "./promptSemantics";

describe("readPromptSemantics", () => {
  it("parses an ability-cooldown-at-rank candidate", () => {
    const ps = readPromptSemantics({
      template: "ability_cooldown_at_rank",
      champion_display: "Ahri",
      metric: "ability_cooldown",
      subject_ref: "E",
      ability_name: "Charm",
      context: { ability_rank: 3, champion_level: null, form: null },
    });
    expect(ps.template).toBe("ability_cooldown_at_rank");
    expect(ps.championDisplay).toBe("Ahri");
    expect(ps.subjectRef).toBe("E");
    expect(ps.abilityName).toBe("Charm");
    expect(ps.context.abilityRank).toBe(3);
    expect(ps.context.championLevel).toBeNull();
  });

  it("defaults subject_ref/ability_name/context when absent (champion-level questions)", () => {
    const ps = readPromptSemantics({
      template: "champion_base_stat",
      champion_display: "Ahri",
      metric: "armor",
    });
    expect(ps.subjectRef).toBe("");
    expect(ps.abilityName).toBe("");
    expect(ps.context).toEqual({ abilityRank: null, championLevel: null, form: null });
  });

  it("rejects an unrecognised template", () => {
    expect(() =>
      readPromptSemantics({
        template: "some_future_template",
        champion_display: "Ahri",
        metric: "armor",
      }),
    ).toThrow(MasteryContractParseError);
  });

  it("rejects a non-object value", () => {
    expect(() => readPromptSemantics(null)).toThrow(MasteryContractParseError);
    expect(() => readPromptSemantics("nope")).toThrow(MasteryContractParseError);
  });
});

describe("assertKnownTemplate", () => {
  it("passes for a known template and throws for an unknown one", () => {
    expect(() => assertKnownTemplate("champion_base_stat")).not.toThrow();
    expect(() => assertKnownTemplate("comparison_left_right")).toThrow(MasteryContractParseError);
  });
});
