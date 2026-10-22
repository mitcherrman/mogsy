/**
 * Daily three acts owner playtest (2026-10-21): every answer tablet is a button
 * whose accessible name is its letter and its label ("A. Ahri Q"), computed
 * from the tablet's own content -- for two-, three- and four-option questions
 * alike. (A tree printer that only reads `aria-label` shows these buttons as
 * unnamed; screen readers and `getByRole` compute the name from content.)
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnswerGrid } from "./AnswerGrid";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import { NO_INTERACTIONS, type InteractionPermissions } from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = { ...NO_INTERACTIONS, canSelectAnswer: true, canChangeAnswer: true };

function grid(options: string[]) {
  const view = questionViewFromPublicQuestion({
    questionId: "q", prompt: "Which?", options, category: "abilities", optionMedia: null });
  return render(<AnswerGrid options={view.options} selectedOptionId={null} permissions={OPEN}
    onSelectOption={() => {}} revealedCorrectOptionId={null} />);
}

describe("answer tablet accessible names", () => {
  it.each([
    [["Ahri Q", "Annie Q"]],
    [["the 1st melee minion", "the 2nd melee minion", "the 3rd melee minion"]],
    [["10.9 seconds", "12 seconds", "10 seconds", "10.4 seconds"]],
  ])("names each of %j by letter and label", (options) => {
    grid(options);
    const group = screen.getByTestId("answer-grid");
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(options.length);
    options.forEach((label, i) => {
      const letter = String.fromCharCode(65 + i);
      expect(within(group).getByRole("button", { name: `${letter}. ${label}` })).toBe(buttons[i]);
    });
  });
});
