/**
 * RG3 — answer resolution as a player experiences it, on the shared surface
 * every mode renders through.
 *
 * Two behaviours are proved here rather than argued, because they are the two
 * that a mode-shaped design gets wrong:
 *
 *   RANKED — a settled round shows the verdict's consequences on the tablets
 *            (the right one lit, the player's wrong one still marked) plus the
 *            round's own evidence, with no control to press;
 *   DAILY  — a first miss shows a verdict, strikes out the option the player
 *            chose, keeps the rest live, and discloses NOTHING.
 *
 * Both run through the same component with the same props shape. Nothing below
 * passes a mode.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "./InteractiveScenarioSurface";
import { feedbackFromDailyCard } from "@/lib/question-feedback/adapters";
import type { InteractionPermissions, QuestionView } from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: false,
  canReviewSubmission: false, canConfirmSubmission: false, canAdvance: false,
};

const Q: QuestionView = {
  questionId: "q1", category: "itemization",
  prompt: "What does the build cost?",
  options: [
    { id: "0", index: 0, label: "1,500" },
    { id: "1", index: 1, label: "1,600" },
    { id: "2", index: 2, label: "1,700" },
    { id: "3", index: 3, label: "1,800" },
  ],
};

function setup(props: Partial<React.ComponentProps<typeof InteractiveScenarioSurface>> = {}) {
  const onSelectOption = vi.fn();
  const view = render(
    <InteractiveScenarioSurface
      question={Q} selectedOptionId={null} permissions={OPEN}
      onSelectOption={onSelectOption} variant="competitive" {...props}
    />,
  );
  return { onSelectOption, ...view };
}

const tabletState = (label: string) =>
  screen.getByText(label).closest("[data-quiz-choice]")!
    .getAttribute("data-choice-state");

const tablet = (label: string) =>
  screen.getByText(label).closest("[data-quiz-choice]") as HTMLButtonElement;

// ════════════════════════════════════════════════ Ranked, a normal question

describe("Ranked normal question — resolution", () => {
  it("CORRECT: lights the answer the player chose and offers no control", () => {
    setup({
      selectedOptionId: "1",
      reveal: { revealed: true, correctOptionId: "1", isCorrect: true,
                evidence: { kind: "statement", text: "Total: 1,600" } },
    });
    expect(tabletState("1,600")).toBe("correct");
    expect(screen.getByTestId("answer-evidence")).toHaveTextContent("Total: 1,600");
    // No Next, no Continue, no Confirm — the loop advances on the server's
    // beat and there is nothing here to press.
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
      expect(button.textContent ?? "").not.toMatch(/next|continue|confirm/i);
    }
  });

  it("INCORRECT: keeps the wrong pick marked AND lights the real answer", () => {
    setup({
      selectedOptionId: "0",
      reveal: { revealed: true, correctOptionId: "1", isCorrect: false },
    });
    expect(tabletState("1,500")).toBe("incorrect-selected");
    expect(tabletState("1,600")).toBe("correct");
  });

  it("TIMEOUT: reveals the answer with no pick to mark", () => {
    setup({
      selectedOptionId: null,
      reveal: { revealed: true, correctOptionId: "1", isCorrect: false },
    });
    expect(tabletState("1,600")).toBe("correct");
    expect(screen.queryByText((_, el) =>
      el?.getAttribute("data-choice-state") === "incorrect-selected")).toBeNull();
  });

  it("shows NO evidence when the round froze none — nothing is fabricated", () => {
    setup({
      selectedOptionId: "1",
      reveal: { revealed: true, correctOptionId: "1", isCorrect: true },
    });
    expect(screen.queryByTestId("answer-evidence")).toBeNull();
    // ...and no empty box in its place either.
    expect(screen.queryByTestId("answer-verdict")).toBeNull();
  });

  it("does not draw a second verdict — Ranked resolves that in its top strip", () => {
    setup({
      selectedOptionId: "0",
      reveal: { revealed: true, correctOptionId: "1", isCorrect: false,
                evidence: { kind: "statement", text: "Total: 1,600" } },
    });
    expect(screen.queryByTestId("answer-verdict")).toBeNull();
    expect(screen.getByTestId("answer-evidence")).toBeInTheDocument();
  });

  it("reveals nothing at all before the round settles", () => {
    setup({ selectedOptionId: "1", reveal: null });
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-answers-state", "open");
    for (const o of Q.options) {
      expect(tabletState(o.label)).toBe(o.id === "1" ? "selected" : "idle");
    }
    expect(screen.queryByTestId("answer-evidence")).toBeNull();
  });
});

// ═════════════════════════════════════════════ Daily Challenge, the retry

const dailyCard = (over: Record<string, unknown> = {}) => ({
  resolved: false, score_locked: false, score_outcome: null,
  eliminated: [] as number[],
  options: Q.options.map((o) => ({ index: o.index })),
  ...over,
}) as Parameters<typeof feedbackFromDailyCard>[0];

describe("Daily Challenge — the first miss", () => {
  const firstMiss = () => setup({
    selectedOptionId: null,
    feedback: feedbackFromDailyCard(dailyCard({
      score_locked: true, score_outcome: "wrong_answer", eliminated: [2],
    })),
  });

  it("says Incorrect and says the score for this question is spent", () => {
    firstMiss();
    const verdict = screen.getByTestId("answer-verdict");
    expect(verdict).toHaveAttribute("data-verdict", "incorrect");
    expect(verdict).toHaveTextContent("Incorrect");
    expect(screen.getByTestId("answer-verdict-note"))
      .toHaveTextContent(/score locked/i);
  });

  it("strikes out ONLY the option the player chose", () => {
    firstMiss();
    expect(tabletState("1,700")).toBe("eliminated");
    expect(tablet("1,700")).toBeDisabled();
    for (const label of ["1,500", "1,600", "1,800"]) {
      expect(tabletState(label)).toBe("idle");
      expect(tablet(label)).toBeEnabled();
    }
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-eliminated-count", "1");
  });

  it("DOES NOT reveal the correct answer, and shows no evidence", () => {
    firstMiss();
    // No tablet is in the reveal vocabulary at all.
    for (const o of Q.options) expect(tabletState(o.label)).not.toBe("correct");
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-answers-state", "open");
    expect(screen.queryByTestId("answer-evidence")).toBeNull();
  });

  it("keeps the remaining options genuinely playable", () => {
    const { onSelectOption } = firstMiss();
    fireEvent.click(tablet("1,600"));
    expect(onSelectOption).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1" }));
  });

  it("refuses to re-send an option that is already struck out", () => {
    const { onSelectOption } = firstMiss();
    fireEvent.click(tablet("1,700"));
    // The backend rejects an eliminated index outright, so a client that sent
    // one would turn a stale render into an error the player did not cause.
    expect(onSelectOption).not.toHaveBeenCalled();
  });

  it("still withholds after a SECOND miss", () => {
    setup({
      feedback: feedbackFromDailyCard(dailyCard({
        score_locked: true, score_outcome: "wrong_answer", eliminated: [2, 0],
      })),
    });
    expect(tabletState("1,700")).toBe("eliminated");
    expect(tabletState("1,500")).toBe("eliminated");
    expect(tabletState("1,600")).toBe("idle");
    for (const o of Q.options) expect(tabletState(o.label)).not.toBe("correct");
    expect(screen.queryByTestId("answer-evidence")).toBeNull();
  });
});

describe("Daily Challenge — eventual resolution", () => {
  it("reveals the answer, keeps the first wrong pick marked, shows evidence", () => {
    setup({
      feedback: feedbackFromDailyCard(dailyCard({
        resolved: true, score_locked: true, score_outcome: "wrong_answer",
        eliminated: [2], correct_index: 1,
        attempts: [
          { selected_index: 2, is_correct: false },
          { selected_index: 1, is_correct: true },
        ],
        reveal: {
          left_label: "Infinity Edge", right_label: "Bloodthirster",
          left_value_display: "3,450 gold", right_value_display: "3,400 gold",
          correct_entity_id: "IE", left_entity_id: "IE", right_entity_id: "BT",
        },
      })),
      selectedOptionId: "2",
    });
    expect(tabletState("1,600")).toBe("correct");
    expect(tabletState("1,700")).toBe("incorrect-selected");
    expect(screen.getByTestId("evidence-left-value")).toHaveTextContent("3,450 gold");
    expect(screen.getByTestId("evidence-right-value")).toHaveTextContent("3,400 gold");
    // The verdict still reports the SCORED attempt, which is what counted.
    expect(screen.getByTestId("answer-verdict")).toHaveAttribute("data-verdict", "incorrect");
    // ...and stops claiming the score is still at stake.
    expect(screen.queryByTestId("answer-verdict-note")).toBeNull();
  });

  it("a first-time-correct card resolves with nothing struck out", () => {
    setup({
      feedback: feedbackFromDailyCard(dailyCard({
        resolved: true, score_locked: true, score_outcome: "correct",
        correct_index: 1, attempts: [{ selected_index: 1, is_correct: true }],
      })),
    });
    expect(screen.getByTestId("answer-verdict")).toHaveAttribute("data-verdict", "correct");
    expect(tabletState("1,600")).toBe("correct");
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-eliminated-count", "0");
  });

  it("never offers a Next or Continue control in any state", () => {
    for (const feedback of [
      feedbackFromDailyCard(dailyCard({ score_locked: true, score_outcome: "wrong_answer", eliminated: [2] })),
      feedbackFromDailyCard(dailyCard({ resolved: true, score_locked: true, score_outcome: "correct", correct_index: 1 })),
    ]) {
      const { unmount } = setup({ feedback });
      for (const button of screen.getAllByRole("button")) {
        expect(button.textContent ?? "").not.toMatch(/next|continue|confirm/i);
      }
      unmount();
    }
  });
});
