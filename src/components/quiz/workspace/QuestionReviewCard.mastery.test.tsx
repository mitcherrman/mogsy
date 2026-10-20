// ---------------------------------------------------------------------------
// Quiz Review — a `mastery_slice` segment on the match record.
//
// A slice is several questions answered inside one segment, so its review body
// states the same five things every other body states — where am I, what was
// asked, what did I pick, what was right, and why — for the challenge the
// reader selected (V2.1: one at a time; the selector has its own test file).
//
// The load-bearing property proven here is that everything shown comes from the
// FROZEN round. Nothing in this path re-resolves a Mastery set, re-reads
// canonical data, or consults the current generation policy, which is what
// makes a played match's record immune to a later admin change.
// ---------------------------------------------------------------------------

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ReviewRound } from "@/lib/ranked-public/contracts";
import { questionOutcome } from "./questionIcons";
import QuestionReviewCard from "./QuestionReviewCard";

function masteryChallenge(index: number, over: Partial<
  NonNullable<ReviewRound["masteryChallenges"]>[number]> = {}) {
  return {
    challengeIndex: index,
    prompt: `A generated question #${index}`,
    interactionKind: "legacy_combat",
    questionFamily: "post_mitigation_single_type_damage",
    answerType: "single_choice" as const,
    answerOptions: ["115", "134", "144", "199"],
    promptSemantics: null,
    comparisonSemantics: null,
    correctAnswer: "144" as string | number | boolean | null,
    explanation: `The worked explanation for #${index}.`,
    viewerAnswer: "144" as string | number | boolean | null,
    isCorrect: true as boolean | null,
    ...over,
  };
}

function masteryRound(over: Partial<ReviewRound> = {}): ReviewRound {
  return {
    roundNumber: 3,
    kind: "mastery_slice",
    moduleId: "mastery_slice",
    category: null,
    canonicalQuestionRef: null,
    revealed: true,
    iconHint: { kind: "generic", key: null, icon: null },
    topic: null,
    question: null,
    challenges: null,
    masteryChallenges: [
      masteryChallenge(0),
      masteryChallenge(1, {
        prompt: "A second generated question",
        answerOptions: ["115", "149", "168", "221"],
        correctAnswer: "168", viewerAnswer: "149", isCorrect: false,
        explanation: "The worked explanation for #1.",
      }),
    ],
    viewerSubmission: {
      answerIndex: null, isCorrect: null,
      correctCount: 1, answeredCount: 2, challengeCount: 2,
    },
    ...over,
  };
}

describe("Quiz Review — a mastery slice round", () => {
  it("prints every frozen challenge, in order, one selection at a time", () => {
    render(<QuestionReviewCard round={masteryRound()} position={3} total={6} />);
    const list = screen.getByTestId("review-mastery-challenges");
    expect(within(list).getByText("A generated question #0")).toBeInTheDocument();
    expect(within(list).queryByText("A second generated question")).toBeNull();
    fireEvent.click(screen.getByTestId("review-mastery-select-2"));
    expect(within(list).getByText("A second generated question")).toBeInTheDocument();
    expect(within(list).queryByText("A generated question #0")).toBeNull();
  });

  it("prints each challenge's frozen options", () => {
    render(<QuestionReviewCard round={masteryRound()} position={3} total={6} />);
    for (const option of ["115", "134", "144", "199"]) {
      expect(screen.getAllByText(option).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByTestId("review-mastery-select-2"));
    for (const option of ["115", "149", "168", "221"]) {
      expect(screen.getAllByText(option).length).toBeGreaterThan(0);
    }
  });

  it("marks the viewer's own pick and the correct answer", () => {
    render(<QuestionReviewCard round={masteryRound()} position={3} total={6} />);
    expect(screen.getByTestId("review-mastery-your-answer-0"))
      .toHaveTextContent("144");
    expect(screen.getByTestId("review-mastery-correct-answer-0"))
      .toHaveTextContent("144");
    // The one they got wrong states both, differently.
    fireEvent.click(screen.getByTestId("review-mastery-select-2"));
    expect(screen.getByTestId("review-mastery-your-answer-1"))
      .toHaveTextContent("149");
    expect(screen.getByTestId("review-mastery-correct-answer-1"))
      .toHaveTextContent("168");
  });

  it("shows the frozen explanation for each challenge", () => {
    render(<QuestionReviewCard round={masteryRound()} position={3} total={6} />);
    expect(screen.getByTestId("review-mastery-explanation-0"))
      .toHaveTextContent("The worked explanation for #0.");
    fireEvent.click(screen.getByTestId("review-mastery-select-2"));
    expect(screen.getByTestId("review-mastery-explanation-1"))
      .toHaveTextContent("The worked explanation for #1.");
  });

  it("summarises the segment as counts, not as one verdict", () => {
    render(<QuestionReviewCard round={masteryRound()} position={3} total={6} />);
    expect(screen.getByTestId("question-review-card")).toHaveTextContent("1");
    expect(screen.getByTestId("question-review-card")).toHaveTextContent("of");
  });

  it("keeps a never-played round's answers sealed", () => {
    render(<QuestionReviewCard position={3} total={6} round={masteryRound({
      revealed: false,
      masteryChallenges: [masteryChallenge(0, {
        correctAnswer: null, explanation: null,
        viewerAnswer: null, isCorrect: null,
      })],
      viewerSubmission: {
        answerIndex: null, isCorrect: null,
        correctCount: null, answeredCount: null, challengeCount: 1,
      },
    })} />);
    // The question is still shown; only its answer is withheld.
    expect(screen.getByText("A generated question #0")).toBeInTheDocument();
    expect(screen.getByTestId("review-mastery-unresolved-0")).toBeInTheDocument();
    expect(screen.queryByTestId("review-mastery-correct-answer-0")).toBeNull();
  });

  it("renders no answerable control — review, never replay", () => {
    render(<QuestionReviewCard round={masteryRound()} position={3} total={6} />);
    // The only controls are the selector's (choose which frozen question to
    // read); nothing answers, and nothing is a radio or a form field.
    const nav = screen.getByTestId("review-mastery-nav");
    for (const button of screen.queryAllByRole("button")) expect(nav).toContainElement(button);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("does not render the card body meant for Meta Reflex", () => {
    render(<QuestionReviewCard round={masteryRound()} position={3} total={6} />);
    expect(screen.queryByTestId("review-cards")).toBeNull();
  });
});

describe("the timeline's outcome for a counted round", () => {
  it("is incorrect on anything short of a clean sweep", () => {
    // A slice reports counts and no single verdict, exactly like a Meta Reflex
    // block. Before this it fell through to the one-answer rule and reported
    // every played slice as "unanswered".
    expect(questionOutcome(masteryRound())).toBe("incorrect");
  });

  it("is correct only on a clean sweep", () => {
    expect(questionOutcome(masteryRound({
      viewerSubmission: {
        answerIndex: null, isCorrect: null,
        correctCount: 2, answeredCount: 2, challengeCount: 2,
      },
    }))).toBe("correct");
  });

  it("is unanswered when nothing was answered", () => {
    expect(questionOutcome(masteryRound({
      viewerSubmission: {
        answerIndex: null, isCorrect: null,
        correctCount: 0, answeredCount: 0, challengeCount: 2,
      },
    }))).toBe("unanswered");
  });

  it("still reports a one-answer quiz round the old way", () => {
    const quiz: ReviewRound = {
      ...masteryRound(), kind: "quiz", moduleId: "quiz",
      masteryChallenges: null,
      viewerSubmission: {
        answerIndex: 1, isCorrect: true,
        correctCount: null, answeredCount: null, challengeCount: null,
      },
    };
    expect(questionOutcome(quiz)).toBe("correct");
  });
});

describe("JOURNEY5 — a Journey Combat row's structured working in the review", () => {
  it("prints the served working above the kept prose; a row without one is unchanged", async () => {
    const { readCombatWorking } = await import("@/lib/journey/combatWorking");
    const { PANTHEON_E_WORKING_RECALLED } = await import("@/lib/journey/__fixtures__/j5/finalWindow");
    const working = readCombatWorking(structuredClone(PANTHEON_E_WORKING_RECALLED));
    render(<QuestionReviewCard round={masteryRound({
      masteryChallenges: [masteryChallenge(0, { correctAnswer: "83", viewerAnswer: "83", combatWorking: working }),
        masteryChallenge(1)],
    })} position={3} total={6} />);
    const w = screen.getByTestId("review-mastery-working-0");
    expect(w).toHaveTextContent("Leona armor 50.08 (recalled from step 1)");
    expect(w).toHaveTextContent("Answer 83");
    expect(screen.getByTestId("review-mastery-explanation-0")).toBeInTheDocument();
    expect(screen.queryByTestId("review-mastery-working-1")).toBeNull();
  });
});
