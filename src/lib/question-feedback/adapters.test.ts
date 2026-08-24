/**
 * RG3 — the four adapters, and the one rule they exist to keep.
 *
 * The Daily block is the heart of this file. Its claim is not "a first miss
 * renders differently"; it is that a first miss produces a MODEL from which no
 * renderer could disclose the answer even if it tried, because the fields are
 * not there.
 */
import { describe, expect, it } from "vitest";
import {
  feedbackFromDailyCard,
  feedbackFromRankedRound,
  feedbackFromMetaReflexCard,
  type DailyCardFeedbackSource,
} from "./adapters";
import { NO_FEEDBACK } from "./model";
import type {
  QuestionView,
  ResolvedCombatantView,
  ResolvedRoundView,
} from "@/lib/ranked-core/viewTypes";
import type { SettledCardReveal } from "@/lib/ranked-public/contracts";

const QUESTION: QuestionView = {
  questionId: "q1",
  prompt: "What does the build cost?",
  category: "itemization",
  options: [
    { id: "0", index: 0, label: "1,500" },
    { id: "1", index: 1, label: "1,600" },
    { id: "2", index: 2, label: "1,700" },
  ],
};

const viewer = (outcome: ResolvedCombatantView["outcome"]) =>
  ({ playerId: "me", outcome } as ResolvedCombatantView);

const settlement = (correctOptionIndex: number | null,
                    questionExplanation: Record<string, unknown> | null = null) =>
  ({ roundNumber: 3, correctOptionIndex, questionExplanation } as ResolvedRoundView);

// ───────────────────────────────────────────────────────── Ranked quiz

describe("feedbackFromRankedRound", () => {
  it("discloses the verdict, the correct option and the evidence together", () => {
    const f = feedbackFromRankedRound({
      settlement: settlement(1, { calculation_steps: [{ step: "total", value: 1600 }] }),
      viewer: viewer("correct"),
      question: QUESTION,
      selectedOptionId: "1",
    });
    expect(f.verdict).toBe("correct");
    expect(f.disclosureAllowed).toBe(true);
    expect(f.correctOptionId).toBe("1");
    expect(f.evidence).toEqual({ kind: "statement", text: "Total: 1,600" });
    // Ranked has no retry: a settled round is settled for both players.
    expect(f.retryAvailable).toBe(false);
    expect(f.scoreLocked).toBe(true);
  });

  it("keeps the player's wrong choice AND names the right one", () => {
    const f = feedbackFromRankedRound({
      settlement: settlement(1), viewer: viewer("incorrect"),
      question: QUESTION, selectedOptionId: "0",
    });
    expect(f.verdict).toBe("incorrect");
    expect(f.selectedOptionId).toBe("0");
    expect(f.correctOptionId).toBe("1");
  });

  it("calls an expiry a timeout, not a wrong answer", () => {
    const f = feedbackFromRankedRound({
      settlement: settlement(1), viewer: viewer("timed_out"),
      question: QUESTION, selectedOptionId: null,
    });
    expect(f.verdict).toBe("timeout");
    expect(f.correctOptionId).toBe("1");
  });

  it("fabricates no evidence when the round froze none", () => {
    const f = feedbackFromRankedRound({
      settlement: settlement(1), viewer: viewer("correct"),
      question: QUESTION, selectedOptionId: "1",
    });
    expect(f.evidence).toBeNull();
    expect(f.explanationOptional).toBeNull();
  });

  it("resolves nothing at all before a settlement exists", () => {
    expect(feedbackFromRankedRound({
      settlement: null, viewer: null, question: QUESTION, selectedOptionId: "0",
    })).toEqual(NO_FEEDBACK);
  });

  it("leaves the tablets unresolved when the index does not address them", () => {
    // A segment round, or a pre-Phase-11 backend: the verdict still stands,
    // and there is simply no option to point at.
    const f = feedbackFromRankedRound({
      settlement: settlement(null), viewer: viewer("correct"),
      question: QUESTION, selectedOptionId: "0",
    });
    expect(f.correctOptionId).toBeNull();
  });
});

// ────────────────────────────────────────────────────── Meta Reflex card

const reveal = (over: Partial<SettledCardReveal> = {}): SettledCardReveal => ({
  challengeIndex: 2,
  kind: "magnitude",
  entityKind: "item",
  outcome: "correct",
  selectedCardId: "c2:left",
  correctCardId: "c2:left",
  left: { label: "Infinity Edge", valueDisplay: "3,450 gold" },
  right: { label: "Bloodthirster", valueDisplay: "3,400 gold" },
  ...over,
});

describe("feedbackFromMetaReflexCard", () => {
  it("publishes BOTH values, exactly as the server formatted them", () => {
    const f = feedbackFromMetaReflexCard(reveal());
    expect(f.evidence).toEqual({
      kind: "comparison",
      left: { label: "Infinity Edge", valueDisplay: "3,450 gold" },
      right: { label: "Bloodthirster", valueDisplay: "3,400 gold" },
      winner: "left",
    });
  });

  it("marks the wrong pick and still names the winning side", () => {
    const f = feedbackFromMetaReflexCard(
      reveal({ outcome: "incorrect", selectedCardId: "c2:right" }));
    expect(f.verdict).toBe("incorrect");
    expect(f.selectedOptionId).toBe("c2:right");
    expect(f.correctOptionId).toBe("c2:left");
    expect(f.evidence).toMatchObject({ winner: "left" });
  });

  it("reveals both values on a timeout, with no pick to mark", () => {
    const f = feedbackFromMetaReflexCard(
      reveal({ outcome: "timeout", selectedCardId: null }));
    expect(f.verdict).toBe("timeout");
    expect(f.selectedOptionId).toBeNull();
    expect(f.evidence).toMatchObject({ winner: "left" });
  });

  it("shows a recognition card's labels with no value row content", () => {
    const f = feedbackFromMetaReflexCard(reveal({
      kind: "recognition",
      left: { label: "Ashe", valueDisplay: null },
      right: { label: "Vayne", valueDisplay: null },
      correctCardId: "c2:right",
    }));
    // Null, not "": a card that compares nothing is a different statement
    // from a card whose value is missing.
    expect(f.evidence).toMatchObject({
      left: { valueDisplay: null }, right: { valueDisplay: null }, winner: "right",
    });
  });

  it("shows no verdict for a settled card the server did not judge", () => {
    const f = feedbackFromMetaReflexCard(
      reveal({ outcome: "unanswered", selectedCardId: null }));
    expect(f.verdict).toBeNull();
    // The comparison is still disclosed — the card is over either way.
    expect(f.disclosureAllowed).toBe(true);
  });
});

// ───────────────────────────────────────────────── Daily Challenge card

const dailyCard = (over: Partial<DailyCardFeedbackSource> = {}): DailyCardFeedbackSource => ({
  resolved: false,
  score_locked: false,
  score_outcome: null,
  eliminated: [],
  options: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }],
  ...over,
});

describe("feedbackFromDailyCard — the retry mechanic", () => {
  it("says INCORRECT and says the score is spent, and says nothing else", () => {
    const f = feedbackFromDailyCard(dailyCard({
      score_locked: true, score_outcome: "wrong_answer", eliminated: [2],
    }));
    expect(f.verdict).toBe("incorrect");
    expect(f.scoreLocked).toBe(true);
    expect(f.eliminatedOptionIds).toEqual(["2"]);
    // THE constraint. Being wrong is not being finished.
    expect(f.resolved).toBe(false);
    expect(f.disclosureAllowed).toBe(false);
    expect(f.correctOptionId).toBeNull();
    expect(f.evidence).toBeNull();
    expect(f.explanationOptional).toBeNull();
    expect(f.retryAvailable).toBe(true);
  });

  it("cannot be tricked into disclosing by a payload that leaked", () => {
    // `sealed` is the belt to the adapter's braces: even handed an unresolved
    // card carrying an answer, the model refuses to carry it forward.
    const f = feedbackFromDailyCard(dailyCard({
      score_locked: true, score_outcome: "wrong_answer", eliminated: [2],
      correct_index: 1, explanation: "Rabadon's is the flat-AP item",
      reveal: { left_label: "A", right_label: "B", left_value_display: "1g" },
    }));
    expect(f.correctOptionId).toBeNull();
    expect(f.evidence).toBeNull();
    expect(f.explanationOptional).toBeNull();
  });

  it("keeps withholding after a SECOND wrong answer", () => {
    const f = feedbackFromDailyCard(dailyCard({
      score_locked: true, score_outcome: "wrong_answer", eliminated: [2, 0],
    }));
    expect(f.disclosureAllowed).toBe(false);
    expect(f.eliminatedOptionIds).toEqual(["2", "0"]);
    expect(f.retryAvailable).toBe(true);
  });

  it("discloses on RESOLUTION, and still reports the first attempt's verdict", () => {
    const f = feedbackFromDailyCard(dailyCard({
      resolved: true, score_locked: true, score_outcome: "wrong_answer",
      eliminated: [2], correct_index: 1,
      explanation: "The build totals 1,600 gold.",
      attempts: [
        { selected_index: 2, is_correct: false },
        { selected_index: 1, is_correct: true },
      ],
    }));
    expect(f.disclosureAllowed).toBe(true);
    expect(f.correctOptionId).toBe("1");
    // The verdict remains the SCORED attempt's, which is the one that counted.
    expect(f.verdict).toBe("incorrect");
    // The option the player originally chose, so the grid can keep it marked.
    expect(f.selectedOptionId).toBe("2");
    expect(f.retryAvailable).toBe(false);
    expect(f.explanationOptional).toBe("The build totals 1,600 gold.");
  });

  it("discloses a first-time-correct card with nothing eliminated", () => {
    const f = feedbackFromDailyCard(dailyCard({
      resolved: true, score_locked: true, score_outcome: "correct",
      correct_index: 1, attempts: [{ selected_index: 1, is_correct: true }],
    }));
    expect(f.verdict).toBe("correct");
    expect(f.correctOptionId).toBe("1");
    expect(f.eliminatedOptionIds).toEqual([]);
  });

  it("withholds after a Meta Reflex window lapses, and says TIME", () => {
    const f = feedbackFromDailyCard(dailyCard({
      score_locked: true, score_outcome: "timeout",
    }));
    expect(f.verdict).toBe("timeout");
    expect(f.disclosureAllowed).toBe(false);
    expect(f.correctOptionId).toBeNull();
  });

  it("builds the comparison from a resolved reflex card's reveal", () => {
    const f = feedbackFromDailyCard(dailyCard({
      resolved: true, score_locked: true, score_outcome: "correct",
      correct_index: 0,
      reveal: {
        left_label: "Ahri", right_label: "Garen",
        left_value_display: "Ranged", right_value_display: "Melee",
        correct_entity_id: "Ahri", left_entity_id: "Ahri", right_entity_id: "Garen",
      },
    }));
    expect(f.evidence).toEqual({
      kind: "comparison",
      left: { label: "Ahri", valueDisplay: "Ranged" },
      right: { label: "Garen", valueDisplay: "Melee" },
      winner: "left",
    });
  });

  it("shows nothing at all for a card that has not been attempted", () => {
    const f = feedbackFromDailyCard(dailyCard());
    expect(f.verdict).toBeNull();
    expect(f.disclosureAllowed).toBe(false);
    expect(f.eliminatedOptionIds).toEqual([]);
  });
});
