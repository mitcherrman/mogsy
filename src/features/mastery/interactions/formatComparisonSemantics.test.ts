/**
 * GR1 Matchup rank identity — the player-facing half.
 *
 * `formatComparisonSemantics.ts` writes every sentence a Matchup Mastery
 * question is read as, and until now it had no test file at all. It also held
 * three defects the capability audit measured:
 *
 *  1. it dropped `context.abilityRank`, so "Which has the shorter cooldown:
 *     Aatrox Q or Ahri Q?" was a question with more than one right answer —
 *     27.6% of cooldown comparisons have a different winner at a higher rank;
 *  2. it never named an ability, so the sentence read "Aatrox Q" while the
 *     media band directly above it printed the canonical name;
 *  3. its base-stat template hardcoded "base " and then title-cased a slug
 *     that already began `base_`, producing "more base Base Armor".
 *
 * These tests are about the SENTENCE, not about League values: every semantics
 * object below is hand-built, and nothing here asserts a cooldown.
 */
import { describe, expect, it } from "vitest";

import type { MasteryComparisonSemantics } from "../contracts/comparisonSemantics";
import { readComparisonSemantics } from "../contracts/comparisonSemantics";
import {
  formatComparisonPrompt,
  MasteryUnknownComparisonTemplateError,
} from "./formatComparisonSemantics";

const NO_CONTEXT = { abilityRank: null, championLevel: null, form: null } as const;

function semantics(
  over: Partial<MasteryComparisonSemantics> = {},
): MasteryComparisonSemantics {
  return {
    template: "compare_ability_cooldown",
    championADisplay: "Aatrox",
    championBDisplay: "Ahri",
    metric: "ability_cooldown",
    dimension: "duration",
    subjectRef: "Q",
    context: { ...NO_CONTEXT, abilityRank: 3 },
    unit: "seconds",
    abilityNameA: "The Darkin Blade",
    abilityNameB: "Orb of Deception",
    rankIndependent: false,
    ...over,
  };
}

describe("the rank is stated", () => {
  it("opens an ability comparison with the rank it is judged at", () => {
    expect(formatComparisonPrompt(semantics())).toBe(
      "At rank 3, which has the shorter cooldown: " +
        "Aatrox Q (The Darkin Blade) or Ahri Q (Orb of Deception)?",
    );
  });

  it("states a different rank for a different rank", () => {
    const one = formatComparisonPrompt(semantics({ context: { ...NO_CONTEXT, abilityRank: 1 } }));
    const five = formatComparisonPrompt(semantics({ context: { ...NO_CONTEXT, abilityRank: 5 } }));
    expect(one).toContain("At rank 1,");
    expect(five).toContain("At rank 5,");
    // The whole point: two ranks are two different sentences, so a player can
    // tell which question they are answering.
    expect(one).not.toBe(five);
  });

  it("states the rank on a cost comparison too", () => {
    expect(
      formatComparisonPrompt(
        semantics({ template: "compare_ability_cost", subjectRef: "W", unit: "mana" }),
      ),
    ).toBe(
      "At rank 3, which costs less: Aatrox W (The Darkin Blade) or Ahri W (Orb of Deception)?",
    );
  });

  it("does NOT fabricate a rank for a rank-independent comparison", () => {
    const prompt = formatComparisonPrompt(semantics({ rankIndependent: true }));
    expect(prompt).not.toContain("rank");
    expect(prompt).toBe(
      "Which has the shorter cooldown: " +
        "Aatrox Q (The Darkin Blade) or Ahri Q (Orb of Deception)?",
    );
  });

  it("states no rank where the payload carries none", () => {
    expect(
      formatComparisonPrompt(semantics({ context: NO_CONTEXT })),
    ).not.toContain("rank");
  });
});

describe("both abilities are named", () => {
  it("keeps the slot and adds each side's own canonical name", () => {
    const prompt = formatComparisonPrompt(semantics());
    expect(prompt).toContain("Aatrox Q (The Darkin Blade)");
    expect(prompt).toContain("Ahri Q (Orb of Deception)");
  });

  it("falls back to the bare slot when the store does not name it", () => {
    expect(
      formatComparisonPrompt(semantics({ abilityNameA: "", abilityNameB: "" })),
    ).toBe("At rank 3, which has the shorter cooldown: Aatrox Q or Ahri Q?");
  });

  it("does not render the backend's slot-letter fallback as a parenthetical", () => {
    expect(
      formatComparisonPrompt(semantics({ abilityNameA: "Q", abilityNameB: "Q" })),
    ).not.toContain("(Q)");
  });

  it("names one side even when only one side is named", () => {
    // The PROMPT may do this — unlike the media band, a sentence naming one
    // ability and not the other is asymmetric wording, not visual emphasis.
    const prompt = formatComparisonPrompt(semantics({ abilityNameB: "" }));
    expect(prompt).toContain("Aatrox Q (The Darkin Blade)");
    expect(prompt).toContain("Ahri Q");
    expect(prompt).not.toContain("Ahri Q (");
  });
});

describe("the base qualifier is stated once", () => {
  const stat = (metric: string) =>
    formatComparisonPrompt(
      semantics({
        template: "compare_champion_base_stat",
        metric,
        subjectRef: "",
        context: NO_CONTEXT,
      }),
    );

  it("does not say base twice", () => {
    expect(stat("base_armor")).toBe("Which has more base Armor: Aatrox or Ahri?");
    expect(stat("base_health_regen")).toBe(
      "Which has more base Health Regen: Aatrox or Ahri?",
    );
  });

  it("omits base where the metric has no base-vs-scaled distinction", () => {
    expect(stat("movement_speed")).toBe("Which has more Movement Speed: Aatrox or Ahri?");
    expect(stat("attack_range")).toBe("Which has more Attack Range: Aatrox or Ahri?");
  });

  it("still states the level for a level-stat comparison", () => {
    expect(
      formatComparisonPrompt(
        semantics({
          template: "compare_champion_stat_at_level",
          metric: "armor",
          subjectRef: "",
          context: { ...NO_CONTEXT, championLevel: 11 },
        }),
      ),
    ).toBe("At level 11, which has more Armor: Aatrox or Ahri?");
  });
});

describe("the contract reader", () => {
  it("reads the new fields off the wire", () => {
    const read = readComparisonSemantics({
      template: "compare_ability_cooldown",
      champion_a_display: "Aatrox",
      champion_b_display: "Ahri",
      metric: "ability_cooldown",
      dimension: "duration",
      subject_ref: "Q",
      context: { ability_rank: 4, champion_level: null, form: null },
      unit: "seconds",
      ability_name_a: "The Darkin Blade",
      ability_name_b: "Orb of Deception",
      rank_independent: false,
    });
    expect(read.abilityNameA).toBe("The Darkin Blade");
    expect(read.abilityNameB).toBe("Orb of Deception");
    expect(read.rankIndependent).toBe(false);
    expect(formatComparisonPrompt(read)).toContain("At rank 4,");
  });

  it("treats a pre-fix payload as unnamed and rank-dependent", () => {
    // A segment frozen before the backend carried these: no names, and its
    // cooldown comparison was always drawn at rank 1, so stating rank 1 is
    // true of it as well.
    const read = readComparisonSemantics({
      template: "compare_ability_cooldown",
      champion_a_display: "Aatrox",
      champion_b_display: "Ahri",
      metric: "ability_cooldown",
      dimension: "duration",
      subject_ref: "Q",
      context: { ability_rank: 1, champion_level: null, form: null },
      unit: "seconds",
    });
    expect(read.abilityNameA).toBe("");
    expect(read.rankIndependent).toBe(false);
    expect(formatComparisonPrompt(read)).toBe(
      "At rank 1, which has the shorter cooldown: Aatrox Q or Ahri Q?",
    );
  });
});

describe("fail-closed", () => {
  it("refuses a template it has no phrasing for", () => {
    expect(() =>
      formatComparisonPrompt(semantics({
        template: "compare_nothing" as MasteryComparisonSemantics["template"],
      })),
    ).toThrow(MasteryUnknownComparisonTemplateError);
  });
});
