// ---------------------------------------------------------------------------
// The file that writes every player-facing Champion Mastery sentence had no
// test file at all — which is how "At level 18, what is Aatrox's Base Armor?"
// shipped on 3,482 candidates and all 173 champions. These are the semantic
// claims the prompts make, asserted as claims rather than as strings.
// ---------------------------------------------------------------------------
import { describe, expect, it } from "vitest";
import { formatRecallPrompt, MasteryUnknownPromptTemplateError } from "./formatPromptSemantics";
import type { MasteryPromptSemantics, PromptTemplate } from "../contracts/promptSemantics";

function ps(over: Partial<MasteryPromptSemantics> & { template: PromptTemplate }): MasteryPromptSemantics {
  return {
    championDisplay: "Aatrox",
    metric: "ability_cooldown",
    subjectRef: "W",
    abilityName: "Infernal Chains",
    resource: "",
    context: { abilityRank: null, championLevel: null, form: null },
    // Empty for every intrinsic question, which is every question a player
    // is served. A case that wants a scenario states one.
    scenario: [],
    ...over,
  };
}

// ---- 1. level-stat terminology -------------------------------------------
//
// A `champion_stat_at_level` value is base + growth × level multiplier. It is
// NOT the base stat, and saying so about a correct number is a false claim.
describe("champion_stat_at_level never calls a level-scaled value a base stat", () => {
  const LEVEL_METRICS: ReadonlyArray<[string, string]> = [
    ["base_armor", "Armor"],
    ["base_attack_damage", "Attack Damage"],
    ["base_magic_resist", "Magic Resist"],
    ["base_health", "Health"],
    ["base_mana", "Mana"],
    ["base_health_regen", "Health Regen"],
    ["base_mana_regen", "Mana Regen"],
  ];

  it.each(LEVEL_METRICS)("%s renders as %s", (metric, shown) => {
    const text = formatRecallPrompt(ps({
      template: "champion_stat_at_level", metric, subjectRef: "", abilityName: "",
      context: { abilityRank: null, championLevel: 18, form: null },
    }));
    expect(text).toBe(`At level 18, what is Aatrox's ${shown}?`);
  });

  it.each(LEVEL_METRICS)("%s says nothing about 'base'", (metric) => {
    const text = formatRecallPrompt(ps({
      template: "champion_stat_at_level", metric, subjectRef: "", abilityName: "",
      context: { abilityRank: null, championLevel: 11, form: null },
    }));
    expect(text.toLowerCase()).not.toContain("base");
  });

  it("still states the level it is asking at", () => {
    expect(formatRecallPrompt(ps({
      template: "champion_stat_at_level", metric: "base_armor", subjectRef: "", abilityName: "",
      context: { abilityRank: null, championLevel: 6, form: null },
    }))).toContain("At level 6");
  });
});

// The base-stat template is the one place "base" is TRUE, and it must not
// double it up. (Stranded today by the family contract; one policy change
// from reaching a player.)
describe("champion_base_stat", () => {
  it("says base exactly once", () => {
    const text = formatRecallPrompt(ps({
      template: "champion_base_stat", metric: "base_armor", subjectRef: "", abilityName: "",
    }));
    expect(text).toBe("What is Aatrox's base Armor?");
    expect(text.toLowerCase().match(/base/g)).toHaveLength(1);
  });
});

// ---- 2. ability names -----------------------------------------------------
describe("an ability is named when the metadata names it", () => {
  it("cooldown at rank names the ability and keeps the slot", () => {
    expect(formatRecallPrompt(ps({
      template: "ability_cooldown_at_rank",
      context: { abilityRank: 4, championLevel: null, form: null },
    }))).toBe("At rank 4, what is Aatrox W (Infernal Chains)'s cooldown, in seconds?");
  });

  it("flat cooldown names it too", () => {
    expect(formatRecallPrompt(ps({ template: "ability_cooldown_flat" })))
      .toBe("What is Aatrox W (Infernal Chains)'s cooldown, in seconds?");
  });

  // The fallback is the pre-phase sentence, not a blank or a duplicate: the
  // backend returns the slot letter when the store does not name the ability.
  it("falls back to the slot alone when the name IS the slot", () => {
    expect(formatRecallPrompt(ps({ template: "ability_cooldown_flat", abilityName: "W" })))
      .toBe("What is Aatrox W's cooldown, in seconds?");
  });
});

// ---- 3. cost questions name their resource -------------------------------
//
// "what does Ahri Q cost?" is ambiguous between three resources, and Lee
// Sin's energy costs read identically to Ahri's mana ones.
describe("an ability cost names the resource it is denominated in", () => {
  it.each(["mana", "energy", "health"])("%s", (resource) => {
    const text = formatRecallPrompt(ps({
      template: "ability_cost_at_rank", metric: "ability_cost", resource,
      subjectRef: "Q", abilityName: "Orb of Deception", championDisplay: "Ahri",
      context: { abilityRank: 3, championLevel: null, form: null },
    }));
    expect(text).toBe(`At rank 3, how much ${resource} does Ahri Q (Orb of Deception) cost?`);
  });

  it("flat cost names it as well", () => {
    expect(formatRecallPrompt(ps({
      template: "ability_cost_flat", metric: "ability_cost", resource: "energy",
      subjectRef: "Q", abilityName: "Sonic Wave", championDisplay: "Lee Sin",
    }))).toBe("How much energy does Lee Sin Q (Sonic Wave) cost?");
  });

  // The backend refuses a cost candidate whose resource it cannot name, so an
  // empty resource is a contract violation. The renderer degrades to the old
  // ambiguous wording rather than naming a resource nobody certified.
  it("names no resource rather than guessing one", () => {
    const text = formatRecallPrompt(ps({
      template: "ability_cost_flat", metric: "ability_cost", resource: "",
      subjectRef: "Q", abilityName: "Q",
    }));
    expect(text).toBe("How much does Aatrox Q cost?");
    expect(text).not.toContain("mana");
  });
});

// ---- 4. state-aware cooldown (GR1 reusable state, Phase 3) ---------------
//
// A cooldown asked INSIDE a resolved setup state. The prompt must STATE the
// scenario the answer depends on: "what is this ability's cooldown?" has one
// answer intrinsically and a different one at 20 ability haste, and a prompt
// that omitted the haste would be unanswerable while looking answerable.
describe("ability_cooldown_under_state states the scenario it is asked in", () => {
  it("names the rank and the resolved haste", () => {
    expect(formatRecallPrompt(ps({
      template: "ability_cooldown_under_state",
      context: { abilityRank: 4, championLevel: null, form: null },
      scenario: [["ability_haste", 20]],
    }))).toBe(
      "At rank 4 with 20 Ability Haste, what is Aatrox W (Infernal Chains)'s "
      + "cooldown, in seconds?");
  });

  // A rank-invariant cooldown carries no rank, because the backend collapsed
  // it the same way the intrinsic flat template is collapsed. One template,
  // two shapes -- exactly as `champion_stat_at_level` handles a null level.
  it("omits a rank the state does not bind", () => {
    expect(formatRecallPrompt(ps({
      template: "ability_cooldown_under_state",
      scenario: [["ability_haste", 20]],
    }))).toBe(
      "With 20 Ability Haste, what is Aatrox W (Infernal Chains)'s cooldown, "
      + "in seconds?");
  });

  // Zero is a real resolved value, not an absence, and the prompt says so --
  // the same distinction the backend keeps between "read it and found zero"
  // and "did not read this axis".
  it("states a resolved zero rather than dropping the clause", () => {
    expect(formatRecallPrompt(ps({
      template: "ability_cooldown_under_state",
      context: { abilityRank: 2, championLevel: null, form: null },
      scenario: [["ability_haste", 0]],
    }))).toContain("At rank 2 with 0 Ability Haste");
  });

  // Generic over the metric vocabulary: a second bound input is joined
  // rather than the renderer knowing which ones exist.
  it("joins more than one scenario input", () => {
    expect(formatRecallPrompt(ps({
      template: "ability_cooldown_under_state",
      scenario: [["ability_haste", 20], ["some_future_metric", 3]],
    }))).toContain("With 20 Ability Haste and 3 some future metric,");
  });
});

// ---- 5. the closed union still fails closed ------------------------------
describe("an unknown template", () => {
  it("throws rather than rendering an empty or misleading prompt", () => {
    expect(() => formatRecallPrompt(ps({
      template: "champion_dance_rating" as PromptTemplate,
    }))).toThrow(MasteryUnknownPromptTemplateError);
  });
});
