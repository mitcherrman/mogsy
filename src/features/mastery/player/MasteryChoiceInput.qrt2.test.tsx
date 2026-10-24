/**
 * QRT2 - the choice rows' word tabs are opt-in, and the shared tabs component
 * words itself the same everywhere.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerTabs } from "@/components/question-feedback/AnswerTabs";
import { MasteryChoiceInput } from "./MasteryBooleanInput";

afterEach(cleanup);

const OPTIONS = [
  { value: "9", label: "9" }, { value: "10", label: "10" },
  { value: "11", label: "11" }, { value: "12", label: "12" },
];
const REVEAL = { correctValue: "11", selectedValue: "9" };

const mount = (props: Record<string, unknown>) => render(
  <MasteryChoiceInput options={OPTIONS} value={null} onSelect={vi.fn()} {...props} />);

describe("MasteryChoiceInput - verdictTabs is opt-in", () => {
  it("a caller that has not adopted it renders exactly what it did: no tabs, no relative row", () => {
    mount({ reveal: REVEAL });
    expect(screen.queryByTestId("answer-result-tags")).toBeNull();
    expect(screen.getByTestId("mastery-choice-row-11").className).not.toContain("relative");
    expect(screen.getByTestId("mastery-choice-row-11")).toHaveAttribute("data-tone", "correct");
    expect(screen.getByTestId("mastery-choice-row-9")).toHaveAttribute("data-tone", "chosen-wrong");
  });

  it("adopted: the answer's row and the player's row are tabbed, nothing else", () => {
    mount({ reveal: REVEAL, verdictTabs: true });
    expect(screen.getAllByTestId("answer-result-tags")).toHaveLength(2);
    expect(within(screen.getByTestId("mastery-choice-row-11")).getByTestId("answer-correct-tag")).toBeTruthy();
    expect(within(screen.getByTestId("mastery-choice-row-9")).getByTestId("answer-your-pick")).toBeTruthy();
    expect(screen.getByTestId("mastery-choice-row-10").querySelector('[data-testid="answer-result-tags"]')).toBeNull();
    expect(screen.getByTestId("mastery-choice-row-11").className).toContain("relative");
  });

  it("an answerable group (no reveal) is never tabbed, even when adopted", () => {
    mount({ reveal: null, verdictTabs: true, value: "9" });
    expect(screen.queryByTestId("answer-result-tags")).toBeNull();
  });

  it("a reveal naming no offered value, and no pick, tabs nothing", () => {
    mount({ reveal: { correctValue: "13", selectedValue: null }, verdictTabs: true });
    expect(screen.queryByTestId("answer-result-tags")).toBeNull();
  });
});

describe("AnswerTabs", () => {
  it("renders nothing when the option is neither the answer nor the pick", () => {
    const { container } = render(<div className="relative"><AnswerTabs correct={false} pick={false} /></div>);
    expect(container.querySelector('[data-testid="answer-result-tags"]')).toBeNull();
  });

  it("says Correct answer / Your pick, one line each", () => {
    render(<div className="relative"><AnswerTabs correct pick /></div>);
    expect(screen.getByTestId("answer-correct-tag")).toHaveTextContent("Correct answer");
    expect(screen.getByTestId("answer-your-pick")).toHaveTextContent("Your pick");
    for (const id of ["answer-correct-tag", "answer-your-pick"]) {
      expect(screen.getByTestId(id).className).toContain("whitespace-nowrap");
    }
  });

  it("compact shortens the answer's tab only when the pick shares the edge", () => {
    const { unmount } = render(<div className="relative"><AnswerTabs correct pick compact /></div>);
    expect(screen.getByTestId("answer-correct-tag")).toHaveTextContent(/^Correct$/);
    unmount();
    render(<div className="relative"><AnswerTabs correct pick={false} compact /></div>);
    expect(screen.getByTestId("answer-correct-tag")).toHaveTextContent("Correct answer");
  });
});
