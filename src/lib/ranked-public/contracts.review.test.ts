/**
 * MALT B1 — `ranked_duel.match_review.v1`.
 *
 * This is the ONE reader that expects a correct answer on the wire, so the
 * guard it owns is the inverse of every other contract's: an UNREVEALED round
 * must not carry one. These tests are mostly that guard, plus the shape the
 * two segment kinds actually arrive in.
 */
import { describe, expect, it } from "vitest";
import { readMatchReview } from "./contracts";
import { RankedPublicParseError } from "./contracts";

const QUIZ_ROUND = {
  round_number: 1,
  kind: "quiz",
  module_id: "quiz",
  category: "Item Costs",
  canonical_question_ref: "ranked:cand-007",
  revealed: true,
  icon_hint: { kind: "item", key: "Doran's Shield", icon: "assets/items/1054.png" },
  question: {
    prompt: "How much gold?",
    options: ["2400", "2500", "2450", "2300"],
    correct_option_index: 0,
    explanation: { formula_id: "f.v1", calculation_steps: ["450 + 50"] },
  },
  challenges: null,
  viewer_submission: {
    answer_index: 2, is_correct: false,
    correct_count: null, answered_count: null, challenge_count: null,
  },
};

const META_ROUND = {
  round_number: 2,
  kind: "meta_reflex",
  module_id: "item_cost_duel",
  category: null,
  canonical_question_ref: null,
  revealed: true,
  icon_hint: { kind: "meta_reflex", key: null, icon: null },
  question: null,
  challenges: [
    {
      challenge_index: 0,
      prompt: "Which champion has more base armor?",
      kind: "magnitude",
      entity_kind: "champion",
      left: { label: "Trundle", icon: "assets/champions/Trundle/icon.png", value: 37 },
      right: { label: "Gwen", icon: "assets/champions/Gwen/icon.png", value: 39 },
      correct_side: "right",
      viewer_side: "left",
      is_correct: false,
    },
  ],
  viewer_submission: {
    answer_index: null, is_correct: null,
    correct_count: 0, answered_count: 1, challenge_count: 1,
  },
};

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

describe("readMatchReview", () => {
  it("parses a quiz round into the camelCase view", () => {
    const view = readMatchReview(envelope([QUIZ_ROUND]));
    expect(view.matchId).toBe("m1");
    expect(view.finalRoundNumber).toBe(1);
    const r = view.rounds[0];
    expect(r.kind).toBe("quiz");
    expect(r.canonicalQuestionRef).toBe("ranked:cand-007");
    expect(r.question!.correctOptionIndex).toBe(0);
    expect(r.question!.explanation).toEqual({
      formula_id: "f.v1", calculation_steps: ["450 + 50"],
    });
    expect(r.viewerSubmission.answerIndex).toBe(2);
    expect(r.viewerSubmission.isCorrect).toBe(false);
    expect(r.iconHint).toEqual({
      kind: "item", key: "Doran's Shield", icon: "assets/items/1054.png",
    });
  });

  it("parses a Meta Reflex block as cards, not as one answer", () => {
    const view = readMatchReview(envelope([META_ROUND]));
    const r = view.rounds[0];
    expect(r.kind).toBe("meta_reflex");
    expect(r.question).toBeNull();
    expect(r.challenges).toHaveLength(1);
    expect(r.challenges![0].correctSide).toBe("right");
    expect(r.challenges![0].viewerSide).toBe("left");
    expect(r.challenges![0].left.value).toBe(37);
    expect(r.viewerSubmission.challengeCount).toBe(1);
    // A block has no single answer index, and must not acquire one.
    expect(r.viewerSubmission.answerIndex).toBeNull();
  });

  it("REFUSES an unrevealed round that carries a correct answer", () => {
    // The backend's per-round gate is what stops a forfeited round handing out
    // the answer to a question from a SHARED bank. If it ever regressed, this
    // is where it fails — loudly, at the client boundary.
    const leaked = {
      ...QUIZ_ROUND,
      revealed: false,
      question: { ...QUIZ_ROUND.question, explanation: null },
    };
    expect(() => readMatchReview(envelope([leaked]))).toThrow(RankedPublicParseError);
  });

  it("REFUSES an unrevealed round that carries an explanation", () => {
    const leaked = {
      ...QUIZ_ROUND,
      revealed: false,
      question: { ...QUIZ_ROUND.question, correct_option_index: null },
    };
    expect(() => readMatchReview(envelope([leaked]))).toThrow(/explanation/);
  });

  it("REFUSES an unrevealed block that names a correct card", () => {
    const leaked = { ...META_ROUND, revealed: false };
    expect(() => readMatchReview(envelope([leaked]))).toThrow(/correct card/);
  });

  it("ACCEPTS a properly sealed unrevealed round", () => {
    const sealed = {
      ...QUIZ_ROUND,
      revealed: false,
      question: {
        ...QUIZ_ROUND.question,
        correct_option_index: null,
        explanation: null,
      },
      viewer_submission: {
        answer_index: null, is_correct: null,
        correct_count: null, answered_count: null, challenge_count: null,
      },
    };
    const r = readMatchReview(envelope([sealed])).rounds[0];
    expect(r.revealed).toBe(false);
    // The question itself is not a secret; only its answer is.
    expect(r.question!.prompt).toBe("How much gold?");
    expect(r.question!.options).toHaveLength(4);
    expect(r.question!.correctOptionIndex).toBeNull();
  });

  it("rejects a wrong envelope type or schema version", () => {
    const wrongType = { ...envelope([]), projection_type: "match_history" };
    expect(() => readMatchReview(wrongType)).toThrow(RankedPublicParseError);
    const wrongSchema = { ...envelope([]), schema_version: "ranked_duel.match_review.v2" };
    expect(() => readMatchReview(wrongSchema)).toThrow(/schema_version/);
  });

  it("rejects an unknown icon-hint kind rather than rendering it", () => {
    const odd = { ...QUIZ_ROUND, icon_hint: { kind: "sparkle", key: null, icon: null } };
    expect(() => readMatchReview(envelope([odd]))).toThrow(/icon_hint.kind is unknown/);
  });

  it("rejects a card side that is neither left nor right", () => {
    const odd = {
      ...META_ROUND,
      challenges: [{ ...META_ROUND.challenges[0], viewer_side: "middle" }],
    };
    expect(() => readMatchReview(envelope([odd]))).toThrow(/left.*right/);
  });
});
