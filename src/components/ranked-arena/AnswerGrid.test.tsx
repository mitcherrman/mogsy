import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AnswerOptionView,
  InteractionPermissions,
  NO_INTERACTIONS,
} from "@/lib/ranked-core/viewTypes";
import { AnswerGrid } from "./AnswerGrid";
import { QuestionPanel } from "./QuestionPanel";

const OPTIONS: AnswerOptionView[] = [
  { id: "0", index: 0, label: "Fortify" },
  { id: "1", index: 1, label: "Brace" },
  { id: "2", index: 2, label: "Barrier" },
];

const OPEN: InteractionPermissions = {
  ...NO_INTERACTIONS,
  canSelectAnswer: true,
  canChangeAnswer: true,
};

describe("AnswerGrid", () => {
  it("selecting an option reports the full option view (id + backend index)", () => {
    const onSelect = vi.fn();
    render(
      <AnswerGrid
        options={OPTIONS}
        selectedOptionId={null}
        permissions={OPEN}
        onSelectOption={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /brace/i }));
    expect(onSelect).toHaveBeenCalledWith({ id: "1", index: 1, label: "Brace" });
  });

  it("selection is controlled: the selected id drives the visual state", () => {
    render(
      <AnswerGrid
        options={OPTIONS}
        selectedOptionId="2"
        permissions={OPEN}
        onSelectOption={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /barrier/i })).toHaveAttribute(
      "data-choice-state",
      "selected",
    );
    expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "open");
  });

  it("answer buttons are native buttons and keyboard-operable", () => {
    const onSelect = vi.fn();
    render(
      <AnswerGrid
        options={OPTIONS}
        selectedOptionId={null}
        permissions={OPEN}
        onSelectOption={onSelect}
      />,
    );
    const button = screen.getByRole("button", { name: /fortify/i });
    expect(button.tagName).toBe("BUTTON");
    button.focus();
    fireEvent.click(button); // native buttons fire click on Enter/Space
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("denied permissions lock the grid WITHOUT implying a reveal", () => {
    const onSelect = vi.fn();
    render(
      <AnswerGrid
        options={OPTIONS}
        selectedOptionId="0"
        permissions={NO_INTERACTIONS}
        onSelectOption={onSelect}
      />,
    );
    const grid = screen.getByTestId("answer-grid");
    expect(grid).toHaveAttribute("data-answers-state", "locked");
    fireEvent.click(screen.getByRole("button", { name: /brace/i }));
    expect(onSelect).not.toHaveBeenCalled();
    // Locked ≠ revealed: no correct/incorrect styling exists anywhere.
    for (const state of ["correct", "incorrect-selected"]) {
      expect(grid.querySelector(`[data-choice-state="${state}"]`)).toBeNull();
    }
  });

  it("canSelectAnswer without canChangeAnswer allows only the first pick", () => {
    const onSelect = vi.fn();
    render(
      <AnswerGrid
        options={OPTIONS}
        selectedOptionId="0"
        permissions={{ ...NO_INTERACTIONS, canSelectAnswer: true }}
        onSelectOption={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /brace/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("pre-reveal DOM carries no correctness information", () => {
    render(
      <AnswerGrid
        options={OPTIONS}
        selectedOptionId="1"
        permissions={OPEN}
        onSelectOption={() => {}}
      />,
    );
    const grid = screen.getByTestId("answer-grid");
    expect(grid.querySelector('[data-choice-state="correct"]')).toBeNull();
    expect(grid.innerHTML).not.toMatch(/correct/i);
  });

  it("reveal styling appears only via revealedCorrectOptionId and disables input", () => {
    const onSelect = vi.fn();
    render(
      <AnswerGrid
        options={OPTIONS}
        selectedOptionId="1"
        permissions={OPEN}
        onSelectOption={onSelect}
        revealedCorrectOptionId="0"
      />,
    );
    expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "revealed");
    expect(screen.getByRole("button", { name: /fortify/i })).toHaveAttribute(
      "data-choice-state",
      "correct",
    );
    expect(screen.getByRole("button", { name: /brace/i })).toHaveAttribute(
      "data-choice-state",
      "incorrect-selected",
    );
    fireEvent.click(screen.getByRole("button", { name: /barrier/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("QuestionPanel", () => {
  it("renders prompt, category, and hosts children in one labelled region", () => {
    render(
      <QuestionPanel
        question={{
          questionId: "q-1",
          prompt: "Which ability is Tank's starter?",
          options: OPTIONS,
          category: "abilities",
        }}
      >
        <div data-testid="child-slot" />
      </QuestionPanel>,
    );
    const region = screen.getByRole("region", { name: /question/i });
    expect(region).toHaveTextContent("Which ability is Tank's starter?");
    expect(region).toHaveTextContent("abilities");
    expect(screen.getByTestId("child-slot")).toBeInTheDocument();
  });
});
