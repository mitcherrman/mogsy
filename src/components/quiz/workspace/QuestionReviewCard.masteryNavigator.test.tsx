// ---------------------------------------------------------------------------
// Match History V2.1 — the Mastery question selector.
//
// A frozen `mastery_slice` of N challenges shows ONE at a time. The selection is
// the Mastery body's own state, so the Popover (fine pointer) and the Sheet
// (touch) behave identically; both are exercised here through the real
// `QuestionInspector`. Browser geometry is proven separately, on CI
// (`e2e/history-review`).
// ---------------------------------------------------------------------------

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewRound } from "@/lib/ranked-public/contracts";
import QuestionInspector from "./QuestionInspector";
import QuestionReviewCard from "./QuestionReviewCard";

type Challenge = NonNullable<ReviewRound["masteryChallenges"]>[number];

function challenge(index: number, over: Partial<Challenge> = {}): Challenge {
  return {
    challengeIndex: index,
    prompt: `Frozen question number ${index + 1}`,
    interactionKind: "legacy_combat",
    questionFamily: "post_mitigation_single_type_damage",
    answerType: "single_choice",
    answerOptions: ["115", "134", "144", "199"],
    promptSemantics: null,
    comparisonSemantics: null,
    correctAnswer: "144",
    explanation: `Frozen explanation ${index + 1}.`,
    viewerAnswer: "144",
    isCorrect: true,
    ...over,
  };
}

const WRONG: Partial<Challenge> = { viewerAnswer: "115", isCorrect: false };
const BLANK: Partial<Challenge> = { viewerAnswer: null, isCorrect: null };

function slice(challenges: Challenge[], over: Partial<ReviewRound> = {}): ReviewRound {
  const right = challenges.filter((c) => c.isCorrect).length;
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
    masteryChallenges: challenges,
    viewerSubmission: {
      answerIndex: null, isCorrect: null,
      correctCount: right, answeredCount: challenges.length, challengeCount: challenges.length,
    },
    ...over,
  };
}

const fiveMixed = () => slice([
  challenge(0), challenge(1, WRONG), challenge(2, BLANK), challenge(3), challenge(4, WRONG),
]);

const shown = () => Array.from(document.querySelectorAll("[data-review-mastery-challenge]"))
  .map((el) => el.getAttribute("data-review-mastery-challenge"));
const position = () => screen.getByTestId("review-mastery-position").textContent;

afterEach(cleanup);

describe("Mastery selector — which challenge is on show", () => {
  it("starts at the first challenge and renders only that one", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    expect(position()).toBe("Question 1 of 5");
    expect(shown()).toEqual(["0"]);
    expect(screen.getByText("Frozen question number 1")).toBeInTheDocument();
    for (let n = 2; n <= 5; n++) expect(screen.queryByText(`Frozen question number ${n}`)).toBeNull();
    expect(screen.getByTestId("review-mastery-select-1")).toHaveAttribute("aria-selected", "true");
  });

  it("uses the actual frozen count, not five", () => {
    const three = slice([challenge(0), challenge(1), challenge(2)]);
    const { unmount } = render(<QuestionReviewCard round={three} position={3} total={6} />);
    expect(position()).toBe("Question 1 of 3");
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    unmount();
    const seven = slice(Array.from({ length: 7 }, (_, i) => challenge(i)));
    render(<QuestionReviewCard round={seven} position={3} total={6} />);
    expect(position()).toBe("Question 1 of 7");
    expect(screen.getAllByRole("tab")).toHaveLength(7);
  });

  it("clicking a number shows that challenge at once, with its own answers and why", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    fireEvent.click(screen.getByTestId("review-mastery-select-4"));
    expect(position()).toBe("Question 4 of 5");
    expect(shown()).toEqual(["3"]);
    expect(screen.getByText("Frozen question number 4")).toBeInTheDocument();
    expect(screen.getByTestId("review-mastery-explanation-3")).toHaveTextContent("Frozen explanation 4.");
    expect(screen.getByTestId("review-mastery-select-4")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("review-mastery-select-1")).toHaveAttribute("aria-selected", "false");
    fireEvent.click(screen.getByTestId("review-mastery-select-2"));
    expect(shown()).toEqual(["1"]);
    expect(screen.getByTestId("review-mastery-your-answer-1")).toHaveAttribute("data-answer-state", "wrong");
  });

  it("names the selected tab as the panel's label", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    fireEvent.click(screen.getByTestId("review-mastery-select-3"));
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAccessibleName(/Question 3 of 5, unanswered/);
  });

  it("keeps the overall result", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    expect(screen.getByTestId("question-review-card")).toHaveTextContent(/2\s*of\s*5\s*right/);
  });
});

describe("Mastery selector — Previous / Next", () => {
  it("steps through and stops at both ends without losing the control", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    const prev = screen.getByTestId("review-mastery-prev");
    const next = screen.getByTestId("review-mastery-next");
    expect(prev).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("aria-disabled");

    fireEvent.click(prev); // already first: nothing happens
    expect(position()).toBe("Question 1 of 5");

    for (let n = 2; n <= 5; n++) {
      fireEvent.click(next);
      expect(position()).toBe(`Question ${n} of 5`);
    }
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(prev).not.toHaveAttribute("aria-disabled");
    fireEvent.click(next); // already last
    expect(position()).toBe("Question 5 of 5");
    expect(shown()).toEqual(["4"]);

    fireEvent.click(prev);
    expect(position()).toBe("Question 4 of 5");
    // Never `disabled`: a focused control must not vanish from the tab order.
    expect(prev).not.toBeDisabled();
    expect(next).not.toBeDisabled();
  });
});

describe("Mastery selector — status, without ever leaking a sealed answer", () => {
  it("shows correct, incorrect and unanswered with a glyph and a spoken word", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    const status = [1, 2, 3, 4, 5].map((n) => screen.getByTestId(`review-mastery-select-${n}`).getAttribute("data-status"));
    expect(status).toEqual(["correct", "incorrect", "unanswered", "correct", "incorrect"]);
    expect(screen.getByRole("tab", { name: "Question 2 of 5, incorrect" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Question 3 of 5, unanswered" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Question 1 of 5, correct" })).toBeInTheDocument();
    // Colour is never the only signal: each status has its own glyph.
    expect(screen.getByTestId("review-mastery-select-1").querySelector("svg.lucide-check")).not.toBeNull();
    expect(screen.getByTestId("review-mastery-select-2").querySelector("svg.lucide-x")).not.toBeNull();
    expect(screen.getByTestId("review-mastery-select-3").querySelector("svg.lucide-minus")).not.toBeNull();
  });

  it("a sealed round's selector carries no correctness in styling, data, DOM or names", () => {
    const sealed = slice([0, 1, 2].map((i) => challenge(i, {
      correctAnswer: null, explanation: null, viewerAnswer: null, isCorrect: null,
    })), {
      revealed: false,
      viewerSubmission: { answerIndex: null, isCorrect: null, correctCount: null, answeredCount: null, challengeCount: 3 },
    });
    render(<QuestionReviewCard round={sealed} position={3} total={6} />);
    const nav = screen.getByTestId("review-mastery-nav");
    for (const n of [1, 2, 3]) {
      const tab = screen.getByTestId(`review-mastery-select-${n}`);
      expect(tab).toHaveAttribute("data-status", "sealed");
      expect(tab).toHaveAccessibleName(`Question ${n} of 3`);
      expect(tab.querySelector("svg")).toBeNull();
    }
    expect(nav.outerHTML).not.toMatch(/correct|incorrect|unanswered|wrong/i);
    // The card still says the answers are withheld.
    expect(screen.getByTestId("review-mastery-unresolved-0")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("review-mastery-select-3"));
    expect(screen.getByTestId("review-mastery-unresolved-2")).toBeInTheDocument();
    expect(screen.queryByTestId("review-mastery-correct-answer-2")).toBeNull();
  });

  it("a sealed round whose answers are present is still not graded in the selector", () => {
    const odd = slice([challenge(0), challenge(1)], { revealed: false });
    render(<QuestionReviewCard round={odd} position={3} total={6} />);
    expect(screen.getByTestId("review-mastery-select-1")).toHaveAttribute("data-status", "sealed");
    expect(screen.getByTestId("review-mastery-nav").outerHTML).not.toMatch(/correct|incorrect|unanswered/i);
  });
});

describe("Mastery selector — keyboard", () => {
  it("is one tab stop; arrows, Home and End move and select, clamped at the ends", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    const tab = (n: number) => screen.getByTestId(`review-mastery-select-${n}`);
    expect(tab(1)).toHaveAttribute("tabindex", "0");
    expect(tab(2)).toHaveAttribute("tabindex", "-1");

    tab(1).focus();
    fireEvent.keyDown(tab(1), { key: "ArrowLeft" }); // clamped
    expect(position()).toBe("Question 1 of 5");
    fireEvent.keyDown(tab(1), { key: "ArrowRight" });
    expect(position()).toBe("Question 2 of 5");
    expect(tab(2)).toHaveFocus();
    expect(tab(2)).toHaveAttribute("tabindex", "0");
    expect(tab(1)).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(tab(2), { key: "End" });
    expect(position()).toBe("Question 5 of 5");
    expect(tab(5)).toHaveFocus();
    fireEvent.keyDown(tab(5), { key: "ArrowRight" }); // clamped
    expect(position()).toBe("Question 5 of 5");
    fireEvent.keyDown(tab(5), { key: "Home" });
    expect(position()).toBe("Question 1 of 5");
    expect(tab(1)).toHaveFocus();
    expect(shown()).toEqual(["0"]);
  });

  it("ignores other keys", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    fireEvent.keyDown(screen.getByTestId("review-mastery-select-1"), { key: "a" });
    expect(position()).toBe("Question 1 of 5");
  });

  it("every control is a native button, so Enter and Space work", () => {
    render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    for (const el of [...screen.getAllByRole("tab"), screen.getByTestId("review-mastery-prev"), screen.getByTestId("review-mastery-next")]) {
      expect(el.tagName).toBe("BUTTON");
      expect(el).toHaveAttribute("type", "button");
    }
  });
});

describe("Mastery selector — rounds, zero and one", () => {
  it("opening another round starts at its first challenge", () => {
    const { rerender } = render(<QuestionReviewCard round={fiveMixed()} position={3} total={6} />);
    fireEvent.click(screen.getByTestId("review-mastery-select-4"));
    expect(position()).toBe("Question 4 of 5");
    rerender(<QuestionReviewCard round={slice([challenge(0), challenge(1), challenge(2)], { roundNumber: 5 })} position={5} total={6} />);
    expect(position()).toBe("Question 1 of 3");
    expect(shown()).toEqual(["0"]);
    // And a different round with the same shape, only the position changed.
    fireEvent.click(screen.getByTestId("review-mastery-select-3"));
    rerender(<QuestionReviewCard round={slice([challenge(0), challenge(1), challenge(2)], { roundNumber: 6 })} position={6} total={6} />);
    expect(position()).toBe("Question 1 of 3");
  });

  it("a single challenge needs no selector and is shown directly", () => {
    render(<QuestionReviewCard round={slice([challenge(0)])} position={3} total={6} />);
    expect(screen.queryByTestId("review-mastery-nav")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect(shown()).toEqual(["0"]);
    expect(screen.getByText("Frozen question number 1")).toBeInTheDocument();
  });

  it("zero challenges render the result line and no selector, without crashing", () => {
    render(<QuestionReviewCard round={slice([])} position={3} total={6} />);
    expect(screen.queryByTestId("review-mastery-nav")).toBeNull();
    expect(shown()).toEqual([]);
    expect(screen.getByTestId("question-review-card")).toBeInTheDocument();
  });

  it("does not put a Mastery selector on any other question family", () => {
    const quiz: ReviewRound = {
      ...slice([]), kind: "quiz", moduleId: "quiz", category: "items", masteryChallenges: null,
      question: { prompt: "What does it cost?", options: ["1", "2"], correctOptionIndex: 0, explanation: null },
      viewerSubmission: { answerIndex: 0, isCorrect: true, correctCount: null, answeredCount: null, challengeCount: null },
    };
    render(<QuestionReviewCard round={quiz} position={1} total={2} />);
    expect(screen.queryByTestId("review-mastery-nav")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

// ── both hosts ────────────────────────────────────────────────────────────────
describe("Mastery selector — in the Popover and in the Sheet", () => {
  let coarse = false;
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(pointer: coarse)" ? coarse : false,
      media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  for (const mode of ["popover", "sheet"] as const) {
    it(`${mode}: one question at a time, switching and closing/reopening reset`, { timeout: 60000 }, async () => {
      coarse = mode === "sheet";
      render(
        <QuestionInspector round={fiveMixed()} position={3} total={6} testId="trigger">
          Q3
        </QuestionInspector>,
      );
      const open = async () => {
        fireEvent.click(screen.getByTestId("trigger"));
        return screen.findByTestId(mode === "sheet" ? "question-review-sheet" : "question-review-popover");
      };
      const host = await open();
      expect(within(host).getByTestId("review-mastery-position")).toHaveTextContent("Question 1 of 5");
      expect(host.querySelectorAll("[data-review-mastery-challenge]")).toHaveLength(1);

      fireEvent.click(within(host).getByTestId("review-mastery-select-3"));
      expect(within(host).getByTestId("review-mastery-position")).toHaveTextContent("Question 3 of 5");
      fireEvent.click(within(host).getByTestId("review-mastery-next"));
      expect(within(host).getByTestId("review-mastery-position")).toHaveTextContent("Question 4 of 5");

      fireEvent.keyDown(host, { key: "Escape" });
      await vi.waitFor(() => expect(screen.queryByTestId("question-review-card")).toBeNull());
      const again = await open();
      expect(within(again).getByTestId("review-mastery-position")).toHaveTextContent("Question 1 of 5");
    });
  }
});
