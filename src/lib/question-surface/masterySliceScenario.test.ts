/**
 * RR1 slice pass — the Mastery/Matchup media adapter.
 *
 * Two things are under test and they pull in opposite directions:
 *  - the adapter must expose ENOUGH for the round to announce its subject
 *    before the prompt is read (champion, ability, rank, level, metric);
 *  - it must expose NOTHING that narrows the answer.
 *
 * The payloads below are the wire shapes `MasterySliceChallengeView` actually
 * carries — `prompt_semantics` / `comparison_semantics` in the backend's own
 * snake_case, as `ranked_modules.mastery_slice._public_challenge` emits them.
 */
import { describe, expect, it } from "vitest";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import {
  metricLabel,
  scenarioSourceForMasteryChallenge,
} from "./masterySliceScenario";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";

function challenge(over: Partial<MasterySliceChallengeView>): MasterySliceChallengeView {
  return {
    challengeIndex: 0,
    interactionKind: "atomic_recall",
    questionFamily: "ability_cooldown_at_rank",
    prompt: "Ahri Q — ability_cooldown",
    answerType: "numeric",
    answerOptions: [],
    promptSemantics: null,
    comparisonSemantics: null,
    ...over,
  };
}

const ABILITY_RECALL = challenge({
  promptSemantics: {
    template: "ability_cooldown_at_rank",
    champion_display: "Ahri",
    metric: "ability_cooldown",
    subject_ref: "Q",
    ability_name: "Orb of Deception",
    context: { ability_rank: 3, champion_level: null, form: null },
  },
});

const STAT_RECALL = challenge({
  questionFamily: "champion_stat_at_level",
  promptSemantics: {
    template: "champion_stat_at_level",
    champion_display: "Ahri",
    metric: "base_armor",
    subject_ref: "",
    ability_name: "",
    context: { ability_rank: null, champion_level: 9, form: null },
  },
});

const COMPARISON = challenge({
  interactionKind: "comparison_left_right",
  questionFamily: "compare_ability_cooldown",
  answerType: "single_choice",
  answerOptions: ["Ahri", "Syndra"],
  comparisonSemantics: {
    template: "compare_ability_cooldown",
    champion_a_display: "Ahri",
    champion_b_display: "Syndra",
    metric: "ability_cooldown",
    dimension: "seconds",
    subject_ref: "W",
    unit: "s",
    context: { ability_rank: 1, champion_level: null, form: null },
  },
});

function subjectOf(view: MasterySliceChallengeView) {
  const src = scenarioSourceForMasteryChallenge(view);
  return (src?.metadata as { assets?: { subject?: Record<string, unknown> } } | undefined)
    ?.assets?.subject;
}

describe("Mastery slice → champion media", () => {
  it("makes the champion the primary subject of an ability question", () => {
    const s = subjectOf(ABILITY_RECALL)!;
    // `combat_cooldown` is REUSED, not invented: it is the frontend's identity
    // for "champion splash + ability row + condition chips", exactly as
    // presentation_render reuses it for ability_cost_rank.
    expect(s.type).toBe("combat_cooldown");
    expect(s.champion).toBe("Ahri");
    expect(s.ability_slot).toBe("Q");
    expect(s.ability_name).toBe("Orb of Deception");
    expect(s.ability_rank).toBe(3);
  });

  it("routes an ability question to the gold-standard card", () => {
    const src = scenarioSourceForMasteryChallenge(ABILITY_RECALL)!;
    expect(selectScenario(src, false, null).card).toBe("combat_calculation");
  });

  it("shows the champion and the level, and NO ability, for a stat question", () => {
    const s = subjectOf(STAT_RECALL)!;
    expect(s.champion).toBe("Ahri");
    expect(s.level).toBe(9);
    // "Do not show irrelevant media": a champion-level stat question names no
    // ability, so no ability slot, name or icon may appear.
    expect(s.ability_slot).toBeUndefined();
    expect(s.ability_name).toBeUndefined();
    expect(s.ability_icon).toBeUndefined();
    // The metric is what says which part of the champion is being tested.
    expect(s.badge).toBe("Base Armor");
  });

  it("resolves the ability icon through the shipped slot-neutral route", () => {
    const s = subjectOf(ABILITY_RECALL)!;
    // No second asset catalogue and no client-side path construction.
    expect(String(s.ability_icon)).toContain(
      "/api/ranked/media/ability-icon/Ahri/Orb%20of%20Deception.png",
    );
  });
});

describe("Matchup slice → two champions at balanced weight", () => {
  it("makes BOTH champions the subject", () => {
    const s = subjectOf(COMPARISON)!;
    expect(s.type).toBe("matchup");
    expect(s.champion_a).toBe("Ahri");
    expect(s.champion_b).toBe("Syndra");
  });

  it("routes a comparison to the matchup card", () => {
    const src = scenarioSourceForMasteryChallenge(COMPARISON)!;
    expect(selectScenario(src, false, null).card).toBe("matchup");
  });

  it("states the compared axis and the shared slot, without any value", () => {
    const s = subjectOf(COMPARISON)!;
    expect(s.metric_label).toBe("Cooldown");
    expect(s.ability_slot).toBe("W");
    expect(s.ability_rank).toBe(1);
  });

  it("cannot disclose which side is higher", () => {
    // The answer to a comparison is a champion NAME, and both names are in the
    // premise by construction. What must never appear is a measured value.
    const blob = JSON.stringify(scenarioSourceForMasteryChallenge(COMPARISON));
    for (const leak of ["seconds", "higher", "correct", "answer"]) {
      expect(blob.toLowerCase()).not.toContain(leak);
    }
    // And the adapter is never handed the options in the first place.
    const src = scenarioSourceForMasteryChallenge(COMPARISON)!;
    expect(src.choices).toEqual([]);
  });
});

describe("fail-closed behaviour", () => {
  it("returns null for a chain-sourced legacy step with no semantics", () => {
    expect(
      scenarioSourceForMasteryChallenge(
        challenge({ interactionKind: "legacy_combat", promptSemantics: null }),
      ),
    ).toBeNull();
  });

  it("returns null rather than throwing on a malformed semantics payload", () => {
    // A media adapter must never be able to take a round down.
    expect(
      scenarioSourceForMasteryChallenge(
        challenge({ promptSemantics: { template: "not_a_template" } }),
      ),
    ).toBeNull();
  });

  it("returns null when a comparison is missing a side", () => {
    expect(
      scenarioSourceForMasteryChallenge(
        challenge({
          interactionKind: "comparison_left_right",
          comparisonSemantics: { ...(COMPARISON.comparisonSemantics as object), champion_b_display: "" },
        }),
      ),
    ).toBeNull();
  });
});

describe("metricLabel", () => {
  it("maps known metrics and humanises unknown ones", () => {
    expect(metricLabel("ability_cooldown")).toBe("Cooldown");
    expect(metricLabel("base_attack_damage")).toBe("Base AD");
    expect(metricLabel("some_new_metric")).toBe("Some New Metric");
    expect(metricLabel("")).toBeUndefined();
  });
});
