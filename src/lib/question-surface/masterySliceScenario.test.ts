/**
 * RR1 Stage 1 — the Mastery/Matchup media adapter, after the policy moved.
 *
 * This file used to test that the CLIENT built the right subject out of
 * `promptSemantics` / `comparisonSemantics`: which card type a recall gets,
 * which badge, how a metric is labelled, how an ability icon URL is spelled.
 * Every one of those is now decided once, on the server, in
 * `quiz/presentation_contract.py` and `ranked_public/presentation_render.py`,
 * and is tested there (`test_rr1_mastery_presentation.py`) against the real
 * canonical tables — which is the only place the ability SLOT the premise
 * carries can be resolved to an ability name and a verified icon at all.
 *
 * What is left to test here is the whole of what this module still does:
 * forward the server's blob, or refuse. So the assertions are about the
 * refusals — an adapter that must never take a round down, and must never
 * quietly grow an opinion again.
 */
import { describe, expect, it } from "vitest";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import { scenarioSourceForMasteryChallenge } from "./masterySliceScenario";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";

function challenge(over: Partial<MasterySliceChallengeView>): MasterySliceChallengeView {
  return {
    challengeIndex: 0,
    interactionKind: "atomic_recall",
    questionFamily: "ability_cooldown",
    prompt: "Ahri W — ability_cooldown",
    answerType: "single_choice",
    answerOptions: ["9", "8", "7", "6"],
    promptSemantics: null,
    comparisonSemantics: null,
    ...over,
  };
}

/** A server payload, in the exact shape `presentation_render.render` emits. */
function served(subject: Record<string, unknown>) {
  return {
    assets: { subject },
    presentation: { role: "context", timing: "question", spoiler: false },
  };
}

const ABILITY = served({
  type: "combat_cooldown",
  champion: "Ahri",
  champion_icon: "assets/champions/Ahri/icon.png",
  champion_splash: "assets/champions/Ahri/splash/0_default.jpg",
  ability_slot: "W",
  ability_name: "Fox-Fire",
  ability_icon: "assets/champions/Ahri/W_AhriW.png",
  badge: "Champion Mastery",
  ability_rank: 4,
});

const MATCHUP = served({
  type: "matchup",
  champion_a: "Ahri",
  champion_b: "Syndra",
  champion_a_splash: "assets/champions/Ahri/splash/0_default.jpg",
  champion_b_splash: "assets/champions/Syndra/splash/0_default.jpg",
  ability_slot: "R",
  ability_name: "Ability R",
  metric_label: "Cooldown",
  badge: "Matchup",
});

describe("forwarding the server's media", () => {
  it("hands the blob through untouched", () => {
    const src = scenarioSourceForMasteryChallenge(
      challenge({ presentation: ABILITY }),
    )!;
    // Verbatim: reshaping here would be this module having an opinion again,
    // which is the thing that was removed.
    expect(src.metadata).toBe(ABILITY);
  });

  it("routes an ability question to the gold-standard card", () => {
    const src = scenarioSourceForMasteryChallenge(
      challenge({ presentation: ABILITY }),
    )!;
    expect(selectScenario(src, false, null).card).toBe("combat_calculation");
  });

  it("routes a comparison to the matchup card", () => {
    const src = scenarioSourceForMasteryChallenge(
      challenge({ interactionKind: "comparison_left_right", presentation: MATCHUP }),
    )!;
    expect(selectScenario(src, false, null).card).toBe("matchup");
  });

  it("keys the crossfade by challenge index and offers no choices of its own", () => {
    const src = scenarioSourceForMasteryChallenge(
      challenge({ challengeIndex: 2, presentation: ABILITY }),
    )!;
    expect(src.id).toBe("mastery-slice-2");
    // The answer tablets belong to the Mastery interaction renderers; the
    // media adapter is never handed the options and never emits any.
    expect(src.choices).toEqual([]);
  });
});

describe("refusing, rather than inventing", () => {
  it("returns null for a segment frozen before the server sent media", () => {
    // Every historical slice segment has this shape. It renders compact,
    // which is what it has always done.
    expect(scenarioSourceForMasteryChallenge(challenge({}))).toBeNull();
    expect(
      scenarioSourceForMasteryChallenge(challenge({ presentation: null })),
    ).toBeNull();
  });

  it("does NOT rebuild media from the semantics it can still see", () => {
    // The semantics are still on the wire for the interaction renderers. A
    // local fallback that drew from them would restore exactly the second
    // source of truth this change removed — and would draw the ability icon
    // wrong, because the client only has the slot.
    const withSemanticsButNoMedia = challenge({
      promptSemantics: {
        template: "ability_cooldown_at_rank",
        champion_display: "Ahri",
        metric: "ability_cooldown",
        subject_ref: "W",
        ability_name: "W",
        context: { ability_rank: 4, champion_level: null, form: null },
      },
    });
    expect(scenarioSourceForMasteryChallenge(withSemanticsButNoMedia)).toBeNull();
  });

  it("returns null for a payload with no subject", () => {
    for (const bad of [{}, { assets: {} }, { assets: { subject: null } }]) {
      expect(
        scenarioSourceForMasteryChallenge(challenge({ presentation: bad })),
      ).toBeNull();
    }
  });

  it("never throws on a malformed payload", () => {
    for (const bad of ["a string", 17, [], true]) {
      expect(() =>
        scenarioSourceForMasteryChallenge(
          challenge({ presentation: bad as unknown as Record<string, unknown> }),
        ),
      ).not.toThrow();
    }
  });
});
