// ---------------------------------------------------------------------------
// Reading a `mastery_slice` segment back out of a finished match.
//
// The backend has emitted `kind: "mastery_slice"` review rounds since the
// slice module shipped; this reader REJECTED them outright
// (`rounds[i].kind is unknown`), which failed the parse of the ENTIRE match
// review — every other round included — for any match containing one. The same
// was true of the settlement transcript, whose card reader would have thrown on
// a Mastery challenge that has no `left_item_id`.
//
// Both are read here under the round's own kind. The two multi-challenge
// contracts share the wire key `challenges` and nothing beneath it, so
// dispatching on a field probe rather than on the kind is exactly how a Mastery
// question would end up coerced into a card shape it has no sides for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import { readMatchReview, readSegmentReveal } from "./contracts";

function reviewChallengeWire(index: number, over: Record<string, unknown> = {}) {
  return {
    challenge_index: index,
    prompt: `A generated question #${index}`,
    interaction_kind: "legacy_combat",
    question_family: "post_mitigation_single_type_damage",
    answer_type: "single_choice",
    answer_options: ["115", "134", "144", "199"],
    prompt_semantics: null,
    comparison_semantics: null,
    correct_answer: "144",
    explanation: "The worked explanation, frozen with the round.",
    viewer_answer: "144",
    is_correct: true,
    ...over,
  };
}

/** The same envelope shape `contracts.review.test.ts` builds. */
function envelope(rounds: unknown[]) {
  return {
    schema_version: "ranked_duel.match_review.v1",
    projection_type: "match_review",
    match_id: "m1",
    round_number: null,
    server_time: "2026-08-20T12:00:00+00:00",
    payload: {
      match_id: "m1",
      final_round_number: rounds.length,
      round_count: rounds.length,
      rounds,
    },
  };
}

function masteryRound(over: Record<string, unknown> = {}) {
  return {
    round_number: 1,
        kind: "mastery_slice",
        module_id: "mastery_slice",
        category: null,
        canonical_question_ref: null,
        revealed: true,
        icon_hint: { kind: "generic", key: null, icon: null },
        question: null,
        challenges: [reviewChallengeWire(0), reviewChallengeWire(1, {
          prompt: "A second generated question",
          correct_answer: "168", viewer_answer: "149", is_correct: false,
          answer_options: ["115", "149", "168", "221"],
        })],
        viewer_submission: {
          answer_index: null, is_correct: null,
          correct_count: 1, answered_count: 2, challenge_count: 2,
        },
    ...over,
  };
}

function reviewBody(over: Record<string, unknown> = {}) {
  return envelope([masteryRound(over)]);
}

describe("match review — a mastery_slice round", () => {
  it("parses instead of failing the whole review", () => {
    const review = readMatchReview(reviewBody());
    expect(review.rounds).toHaveLength(1);
    expect(review.rounds[0].kind).toBe("mastery_slice");
  });

  it("reads every frozen challenge verbatim", () => {
    const [round] = readMatchReview(reviewBody()).rounds;
    const challenges = round.masteryChallenges ?? [];
    expect(challenges).toHaveLength(2);
    expect(challenges[0].prompt).toBe("A generated question #0");
    expect(challenges[0].answerOptions).toEqual(["115", "134", "144", "199"]);
    expect(challenges[0].correctAnswer).toBe("144");
    expect(challenges[0].viewerAnswer).toBe("144");
    expect(challenges[0].isCorrect).toBe(true);
    expect(challenges[0].explanation)
      .toBe("The worked explanation, frozen with the round.");
    expect(challenges[1].isCorrect).toBe(false);
  });

  it("keeps the card shape empty — the two contracts never merge", () => {
    const [round] = readMatchReview(reviewBody()).rounds;
    expect(round.challenges).toBeNull();
  });

  it("carries the counted submission summary", () => {
    const [round] = readMatchReview(reviewBody()).rounds;
    expect(round.viewerSubmission.correctCount).toBe(1);
    expect(round.viewerSubmission.challengeCount).toBe(2);
    // A slice is not one answer, so there is no single verdict to report.
    expect(round.viewerSubmission.isCorrect).toBeNull();
  });

  it("refuses an unresolved round that carries an answer", () => {
    // The inverse guard every other reader here applies: the source Mastery
    // set can be served again, so an unrevealed round must stay sealed.
    expect(() => readMatchReview(reviewBody({
      revealed: false,
      viewer_submission: {
        answer_index: null, is_correct: null,
        correct_count: null, answered_count: null, challenge_count: 2,
      },
    }))).toThrow(/not revealed but carried a correct answer/);
  });

  it("reads an unresolved round that correctly withholds its answers", () => {
    const [round] = readMatchReview(reviewBody({
      revealed: false,
      challenges: [reviewChallengeWire(0, {
        correct_answer: null, explanation: null,
        viewer_answer: null, is_correct: null,
      })],
      viewer_submission: {
        answer_index: null, is_correct: null,
        correct_count: null, answered_count: null, challenge_count: 1,
      },
    })).rounds;
    expect(round.revealed).toBe(false);
    // The question itself is still shown; only the answer is sealed.
    expect(round.masteryChallenges?.[0].prompt).toBe("A generated question #0");
    expect(round.masteryChallenges?.[0].correctAnswer).toBeNull();
  });

  it("still reads a quiz round unchanged beside a slice", () => {
    const body = envelope([masteryRound(), {
      round_number: 2, kind: "quiz", module_id: "quiz",
      category: "Item Costs", canonical_question_ref: "ranked:c2",
      revealed: true, icon_hint: { kind: "generic", key: null, icon: null },
      question: {
        prompt: "How much?", options: ["1", "2"],
        correct_option_index: 0, explanation: null,
      },
      viewer_submission: {
        answer_index: 0, is_correct: true,
        correct_count: null, answered_count: null, challenge_count: null,
      },
    }]);
    const review = readMatchReview(body);
    expect(review.rounds.map((r) => r.kind)).toEqual(["mastery_slice", "quiz"]);
    expect(review.rounds[1].question?.prompt).toBe("How much?");
    expect(review.rounds[1].masteryChallenges).toBeNull();
  });
});

// ------------------------------------------------ settlement transcript

function settlementBody(moduleId: string, challenges: unknown[]) {
  return {
    segment_reveal: {
      module_id: moduleId,
      module_version: 1,
      challenge_count: challenges.length,
      challenges,
      players: {
        userA: {
          segment_result: "win", correct: 2, incorrect: 0, unanswered: 0,
          total_response_ms: 4200, per_challenge_ms: [2000, 2200],
          answers: ["144", "168"],
        },
        userB: {
          segment_result: "loss", correct: 0, incorrect: 2, unanswered: 0,
          total_response_ms: 5100, per_challenge_ms: [2500, 2600],
          answers: ["115", "115"],
        },
      },
    },
  };
}

describe("segment settlement — a mastery_slice transcript", () => {
  it("parses the answered questions instead of throwing on missing cards", () => {
    const reveal = readSegmentReveal(settlementBody("mastery_slice", [
      { challenge_index: 0, correct_answer: "144", explanation: "Because." },
      { challenge_index: 1, correct_answer: "168", explanation: "And so." },
    ]));
    expect(reveal?.moduleId).toBe("mastery_slice");
    expect(reveal?.masteryChallenges).toHaveLength(2);
    expect(reveal?.masteryChallenges[0].correctAnswer).toBe("144");
    expect(reveal?.masteryChallenges[1].explanation).toBe("And so.");
    // The card shape stays empty; they are never merged.
    expect(reveal?.challenges).toEqual([]);
  });

  it("reads the head-to-head scoreline the arena beat renders", () => {
    const reveal = readSegmentReveal(settlementBody("mastery_slice", [
      { challenge_index: 0, correct_answer: "144", explanation: null },
    ]));
    expect(reveal?.players.userA.segmentResult).toBe("win");
    expect(reveal?.players.userA.correct).toBe(2);
    expect(reveal?.players.userB.segmentResult).toBe("loss");
  });

  it("still reads an item_cost_duel transcript unchanged", () => {
    const reveal = readSegmentReveal(settlementBody("item_cost_duel", [{
      challenge_index: 0, left_item_id: "a", right_item_id: "b",
      correct_item_id: "a", left_cost: 100, right_cost: 200,
    }]));
    expect(reveal?.challenges).toHaveLength(1);
    expect(reveal?.challenges[0].correctId).toBe("a");
    expect(reveal?.masteryChallenges).toEqual([]);
  });
});
