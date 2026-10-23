/**
 * QRT2 Phase 2A — the answer tablets say, in words, which one was right and
 * which one the player picked, and only once the server has allowed it.
 *
 * The disclosure rules are the load-bearing half of this file:
 *   * before a reveal there is NO correct tag and no correct state anywhere;
 *   * a Daily first miss (judged, score-locked, NOT disclosed) shows the
 *     verdict and the struck-out option and must never show the answer;
 *   * the tags appear on a resolved card in every case — a correct pick, a
 *     wrong pick and a timeout (no pick at all).
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "./InteractiveScenarioSurface";
import { NO_FEEDBACK, type ResolvedFeedback } from "@/lib/question-feedback/model";
import type { InteractionPermissions, QuestionView } from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: false,
  canReviewSubmission: false, canConfirmSubmission: false, canAdvance: false,
};

const Q: QuestionView = {
  questionId: "q1", category: "itemization", prompt: "What does the build cost?",
  options: [
    { id: "0", index: 0, label: "1,500" },
    { id: "1", index: 1, label: "1,600" },
    { id: "2", index: 2, label: "1,700" },
    { id: "3", index: 3, label: "1,800" },
  ],
};

function surface(props: Partial<React.ComponentProps<typeof InteractiveScenarioSurface>> = {}) {
  return render(
    <InteractiveScenarioSurface question={Q} selectedOptionId={null} permissions={OPEN}
      onSelectOption={vi.fn()} variant="competitive" verdictTabs {...props} />,
  );
}

const tablet = (label: string) =>
  screen.getByText(label).closest("[data-quiz-choice]") as HTMLButtonElement;

const resolved = (patch: Partial<ResolvedFeedback>): ResolvedFeedback => ({
  ...NO_FEEDBACK, resolved: true, disclosureAllowed: true, scoreLocked: true,
  correctOptionId: "0", ...patch,
});

describe("opt-in", () => {
  it("a surface that has not adopted the tabs renders exactly the old reveal", () => {
    surface({ verdictTabs: false, selectedOptionId: "2",
      reveal: { revealed: true, isCorrect: false, correctOptionId: "0" } });
    expect(screen.queryByTestId("answer-correct-tag")).toBeNull();
    expect(screen.queryByTestId("answer-result-tags")).toBeNull();
    // The plain label survives untouched, and the tablets still resolve.
    expect(screen.getByTestId("answer-your-pick")).toHaveTextContent("Your pick");
    expect(tablet("1,500").getAttribute("data-choice-state")).toBe("correct");
    expect(tablet("1,700").getAttribute("data-choice-state")).toBe("incorrect-selected");
    expect(document.querySelector("[data-verdict-tabs]")).toBeNull();
  });
});

describe("before a reveal", () => {
  it("shows no correct tag, no pick tag and no answer state, even with a selection", () => {
    surface({ selectedOptionId: "2" });
    expect(screen.queryByTestId("answer-correct-tag")).toBeNull();
    expect(screen.queryByTestId("answer-your-pick")).toBeNull();
    expect(tablet("1,700").getAttribute("data-choice-state")).toBe("selected");
    for (const label of ["1,500", "1,600", "1,800"]) {
      expect(tablet(label).getAttribute("data-choice-state")).toBe("idle");
    }
  });

  it("a click is only ever a selection: the verdict is never inferred from it", () => {
    surface({ selectedOptionId: "0" });
    expect(tablet("1,500").getAttribute("data-choice-state")).toBe("selected");
    expect(screen.queryByTestId("answer-correct-tag")).toBeNull();
    expect(screen.queryByTestId("answer-verdict")).toBeNull();
  });
});

describe("after a reveal (Ranked's `reveal` channel)", () => {
  it("CORRECT: the player's own tablet carries both tabs", () => {
    surface({ selectedOptionId: "0",
      reveal: { revealed: true, isCorrect: true, correctOptionId: "0" } });
    const t = tablet("1,500");
    expect(t.getAttribute("data-choice-state")).toBe("correct");
    expect(within(t).getByTestId("answer-correct-tag")).toHaveTextContent("Correct answer");
    expect(within(t).getByTestId("answer-your-pick")).toHaveTextContent("Your pick");
    expect(screen.getAllByTestId("answer-correct-tag")).toHaveLength(1);
  });

  it("INCORRECT: the right tablet says so, and the wrong pick is marked apart from it", () => {
    surface({ selectedOptionId: "2",
      reveal: { revealed: true, isCorrect: false, correctOptionId: "0" } });
    const right = tablet("1,500");
    const wrong = tablet("1,700");
    expect(right.getAttribute("data-choice-state")).toBe("correct");
    expect(wrong.getAttribute("data-choice-state")).toBe("incorrect-selected");
    expect(within(right).getByTestId("answer-correct-tag")).toBeTruthy();
    expect(within(right).queryByTestId("answer-your-pick")).toBeNull();
    expect(within(wrong).getByTestId("answer-your-pick")).toBeTruthy();
    expect(within(wrong).queryByTestId("answer-correct-tag")).toBeNull();
    // The two are told apart by words and icons, not just by colour.
    expect(right.querySelector("svg")).not.toBeNull();
    expect(wrong.querySelector("svg")).not.toBeNull();
  });

  it("TIMEOUT (no pick): only the correct tablet is tagged", () => {
    surface({ reveal: { revealed: true, isCorrect: false, correctOptionId: "1" } });
    expect(screen.getAllByTestId("answer-correct-tag")).toHaveLength(1);
    expect(within(tablet("1,600")).getByTestId("answer-correct-tag")).toBeTruthy();
    expect(screen.queryByTestId("answer-your-pick")).toBeNull();
  });

  it("the tags are real text in the tablet, not a live region", () => {
    surface({ selectedOptionId: "2",
      reveal: { revealed: true, isCorrect: false, correctOptionId: "0" } });
    const tags = screen.getAllByTestId("answer-result-tags");
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) {
      expect(t.closest("[role=status], [aria-live]")).toBeNull();
      expect(t.hasAttribute("aria-live")).toBe(false);
    }
    expect(tablet("1,500")).toHaveTextContent("Correct answer");
  });
});

describe("Daily — the judged-but-undisclosed first miss", () => {
  const firstMiss = (): ResolvedFeedback => ({
    ...NO_FEEDBACK, verdict: "incorrect", scoreLocked: true, retryAvailable: true,
    eliminatedOptionIds: ["2"],
    // Deliberately populated: a surface must still refuse to show it.
    correctOptionId: "0",
  });

  it("says INCORRECT, locks the score, strikes the pick out — and discloses nothing", () => {
    surface({ feedback: firstMiss() });
    const line = screen.getByTestId("answer-verdict");
    expect(line).toHaveAttribute("data-verdict", "incorrect");
    expect(line).toHaveTextContent("Incorrect");
    expect(screen.getByTestId("answer-verdict-note")).toHaveTextContent("score locked");
    expect(tablet("1,700").getAttribute("data-choice-state")).toBe("eliminated");
    expect(screen.queryByTestId("answer-correct-tag")).toBeNull();
    expect(screen.queryByTestId("answer-evidence")).toBeNull();
    for (const label of ["1,500", "1,600", "1,800"]) {
      expect(tablet(label).getAttribute("data-choice-state")).not.toBe("correct");
    }
  });

  it("a timeout verdict reads TIMED OUT, never INCORRECT", () => {
    surface({ feedback: { ...NO_FEEDBACK, verdict: "timeout", scoreLocked: true,
      retryAvailable: true } });
    const line = screen.getByTestId("answer-verdict");
    expect(line).toHaveAttribute("data-verdict", "timeout");
    expect(line).toHaveTextContent("Timed out");
    expect(line).not.toHaveTextContent("Incorrect");
  });

  it("the verdict line keeps a role=status and carries an icon beside its words", () => {
    surface({ feedback: firstMiss() });
    const line = screen.getByTestId("answer-verdict");
    expect(line).toHaveAttribute("role", "status");
    expect(line.querySelector("svg")).not.toBeNull();
  });

  it("once resolved, the answer is disclosed in words and the evidence appears", () => {
    surface({ selectedOptionId: "2", feedback: resolved({
      verdict: "incorrect", selectedOptionId: "2",
      evidence: { kind: "statement", text: "The build costs 1,500 gold." },
    }) });
    expect(tablet("1,500").getAttribute("data-choice-state")).toBe("correct");
    expect(within(tablet("1,500")).getByTestId("answer-correct-tag")).toBeTruthy();
    expect(within(tablet("1,700")).getByTestId("answer-your-pick")).toBeTruthy();
    expect(screen.getByTestId("answer-evidence")).toHaveTextContent("The build costs 1,500 gold.");
  });
});
