/**
 * QF1.1 — `topic.motif` transport: the reader, the wire paths that carry it to
 * the question surface, and the guarantee that nothing renders it yet.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { readTimelineTopic } from "@/components/quiz/timeline/timelineNodeModel";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import {
  questionViewForChallenge, toPlayerQuestion,
} from "@/lib/ranked-core/modules/MasterySliceChallengeSurface";
import { readMasterySliceChallenge, readMatchReview } from "@/lib/ranked-public/contracts";
import type { InteractionPermissions, QuestionView } from "@/lib/ranked-core/viewTypes";
import { QUESTION_MOTIFS, readQuestionMotif } from "./questionMotif";

afterEach(cleanup);

const WIRE_TOPIC = {
  category: "abilities", tier: "hard",
  icon_hint: { kind: "category", key: "Champion Ability Cooldowns", icon: null },
  roles: ["mid"],
};

describe("readQuestionMotif", () => {
  it("accepts exactly the five approved ids", () => {
    expect(QUESTION_MOTIFS).toEqual([
      "champion_studies", "combat_workings", "items_economy",
      "rift_field_guide", "runes_summoner_arts",
    ]);
    for (const motif of QUESTION_MOTIFS) expect(readQuestionMotif(motif)).toBe(motif);
  });

  it("fails closed on anything else", () => {
    for (const bad of [undefined, null, "", "jungle", "Champion_Studies", 3, {}, ["items_economy"]]) {
      expect(readQuestionMotif(bad)).toBeNull();
    }
  });
});

describe("topic.motif on the wire", () => {
  it("reads every motif off the topic", () => {
    for (const motif of QUESTION_MOTIFS) {
      expect(readTimelineTopic({ ...WIRE_TOPIC, motif })?.motif).toBe(motif);
    }
  });

  it("an absent or unknown motif is null; nothing else changes", () => {
    const bare = readTimelineTopic(WIRE_TOPIC);
    const junk = readTimelineTopic({ ...WIRE_TOPIC, motif: "not_a_motif" });
    expect(bare?.motif ?? null).toBeNull();
    expect(junk?.motif ?? null).toBeNull();
    expect(bare && "motif" in bare).toBe(false);
    expect(junk?.category).toBe(bare?.category);
  });

  it("stays separate from category and roles", () => {
    const topic = readTimelineTopic({ ...WIRE_TOPIC, motif: "combat_workings" });
    expect(topic?.category).toBe("abilities");
    expect(topic?.roles).toEqual(["mid"]);
    expect(topic?.motif).toBe("combat_workings");
  });

  it("reaches the QuestionView the surface renders, beside the category", () => {
    const view = questionViewFromPublicQuestion({
      questionId: "qq-1#r6", prompt: "p", options: ["a", "b", "c", "d"],
      category: "Champion Ability Cooldowns",
      topic: readTimelineTopic({ ...WIRE_TOPIC, motif: "combat_workings" }),
    });
    expect(view.motif).toBe("combat_workings");
    expect(view.category).toBe("Champion Ability Cooldowns");
    expect(view.roles).toEqual(["mid"]);
    expect(Object.keys(view)).not.toContain("questionKey");
  });

  it("a topic with no motif adds no motif field", () => {
    const view = questionViewFromPublicQuestion({
      questionId: "q", prompt: "p", options: ["a"], category: null,
      topic: readTimelineTopic(WIRE_TOPIC),
    });
    expect("motif" in view).toBe(false);
  });
});

function challengeWire(over: Record<string, unknown> = {}) {
  return {
    challenge_index: 0, interaction_kind: "atomic_recall",
    question_family: "ability_cooldown", prompt: "Ahri Q cooldown at rank 3?",
    answer_type: "single_choice", answer_options: ["7", "6.5", "6", "5.5"],
    prompt_semantics: null, comparison_semantics: null, ...over,
  };
}

describe("Mastery Slice motif", () => {
  it("reads the challenge motif and keeps the family", () => {
    const c = readMasterySliceChallenge(challengeWire({ motif: "champion_studies" }), "c");
    expect(c.motif).toBe("champion_studies");
    expect(c.questionFamily).toBe("ability_cooldown");
  });

  it("a challenge from an older backend or an unknown motif is null", () => {
    expect(readMasterySliceChallenge(challengeWire(), "c").motif).toBeNull();
    expect(readMasterySliceChallenge(challengeWire({ motif: "x" }), "c").motif).toBeNull();
  });

  it("reaches both the prose surface and the structured renderers", () => {
    const c = readMasterySliceChallenge(challengeWire({ motif: "champion_studies" }), "c");
    expect(questionViewForChallenge(c).motif).toBe("champion_studies");
    expect(questionViewForChallenge(c).category).toBe("ability_cooldown");
    expect(toPlayerQuestion(c, 3, "atomic_recall").questionMotif).toBe("champion_studies");
  });

  it("post-match review challenges carry it too", () => {
    const review = readMatchReview({
      schema_version: "ranked_duel.match_review.v1", projection_type: "match_review",
      match_id: "m1", round_number: null, server_time: "2026-09-18T12:00:00+00:00",
      payload: {
        match_id: "m1", final_round_number: 1, round_count: 1,
        rounds: [{
          round_number: 1, kind: "mastery_slice", module_id: "mastery_slice",
          category: null, canonical_question_ref: null, revealed: true,
          icon_hint: { kind: "generic", key: null, icon: null }, question: null,
          challenges: [{
            ...challengeWire({
              interaction_kind: "legacy_combat",
              question_family: "post_mitigation_single_type_damage",
              motif: "combat_workings",
            }),
            correct_answer: "7", explanation: null, viewer_answer: "7", is_correct: true,
          }],
          viewer_submission: { answer_index: null, is_correct: null, correct_count: 1,
            answered_count: 1, challenge_count: 1 },
        }],
      },
    });
    expect(review.rounds[0].masteryChallenges?.[0].motif).toBe("combat_workings");
  });
});

describe("motifs with no artwork render nothing", () => {
  const OPEN: InteractionPermissions = {
    canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
    canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
  };
  const Q: QuestionView = {
    questionId: "q", category: "Item Costs", prompt: "How much does Infinity Edge cost?",
    options: ["3400", "3300", "3500", "3450"].map((label, index) => ({ id: String(index), index, label })),
  };

  it("the card DOM is identical with no motif and with every not-yet-drawn motif", () => {
    // Champion/Combat and Rift/Jungle draw (see QuestionMotifLayer.qf1 tests);
    // Items and Spells must stay byte-identical to no motif at all.
    const html = (question: QuestionView) => {
      const { container, unmount } = render(
        <InteractiveScenarioSurface question={question} selectedOptionId={null}
          permissions={OPEN} onSelectOption={vi.fn()} variant="competitive" />,
      );
      const out = container.innerHTML;
      unmount();
      return out;
    };
    const plain = html(Q);
    for (const motif of QUESTION_MOTIFS.filter((m) =>
      m !== "champion_studies" && m !== "combat_workings" && m !== "rift_field_guide")) {
      expect(html({ ...Q, motif })).toBe(plain);
    }
    expect(html({ ...Q, motif: null })).toBe(plain);
    expect(plain).not.toContain("motif");
  });
});
