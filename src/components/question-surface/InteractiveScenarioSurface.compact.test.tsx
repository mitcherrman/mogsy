/**
 * Phase 2 compact-layout contracts for the question surface:
 *  - compact density (competitive/speed) hard-caps the cinematic band so a
 *    text-first Ranked round never reserves oversized media space;
 *  - comfortable surfaces (standard quiz) keep the tall presentation;
 *  - short 4-option answer sets go 2-up on desktop, long labels fall back to
 *    one column, and the classic quiz grid is untouched by default.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "./InteractiveScenarioSurface";
import type { QuizQuestion } from "@/lib/quiz/api";
import type {
  InteractionPermissions,
  QuestionView,
} from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};

const SHORT_Q: QuestionView = {
  questionId: "q-short", category: "items", prompt: "How much gold?",
  options: [
    { id: "0", index: 0, label: "2400" },
    { id: "1", index: 1, label: "2500" },
    { id: "2", index: 2, label: "2600" },
    { id: "3", index: 3, label: "2700" },
  ],
};
const LONG_LABEL = "A very long explanatory answer label that keeps going well past the cap";
const LONG_Q: QuestionView = {
  ...SHORT_Q,
  questionId: "q-long",
  options: SHORT_Q.options.map((o, i) => (i === 2 ? { ...o, label: LONG_LABEL } : o)),
};
const ITEM_SCENARIO: QuizQuestion = {
  id: "q", category: "items", question_text: SHORT_Q.prompt, format: "multiple_choice",
  choices: SHORT_Q.options.map((o) => o.label),
  metadata: { assets: { subject: { type: "item", name: "Rabadon's Deathcap", icon: "assets/items/3089.png" } } },
};

function mount(
  variant: "competitive" | "standard",
  question: QuestionView = SHORT_Q,
  scenarioSource: QuizQuestion | null = null,
) {
  render(
    <InteractiveScenarioSurface
      question={question} selectedOptionId={null} permissions={OPEN}
      onSelectOption={vi.fn()} variant={variant} scenarioSource={scenarioSource}
    />,
  );
}

describe("compact media budget", () => {
  it("hard-caps the cinematic band under compact density", () => {
    mount("competitive", SHORT_Q, ITEM_SCENARIO);
    const hero = screen.getByTestId("scenario-hero");
    expect(hero.style.maxHeight).toBe("11rem");
    expect(hero.style.minHeight).toBe("8rem");
  });

  it("keeps the tall presentation for comfortable surfaces", () => {
    mount("standard", SHORT_Q, ITEM_SCENARIO);
    const hero = screen.getByTestId("scenario-hero");
    expect(hero.style.maxHeight).toBe("30rem");
    expect(hero.style.minHeight).toBe("12.5rem");
  });

  it("text-first questions get the short compact band, no hero reservation", () => {
    mount("competitive", SHORT_Q, null);
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
    expect(screen.getByTestId("scenario-compact")).toBeInTheDocument();
  });
});

describe("compact answer columns", () => {
  const grid = () => document.querySelector("[data-quiz-answer-options]")!;

  it("goes 2-up on desktop for four short labels under compact density", () => {
    mount("competitive", SHORT_Q);
    expect(grid().getAttribute("data-columns")).toBe("wide-2");
    expect(grid().className).toContain("lg:grid-cols-2");
  });

  it("falls back to one column when any label is long", () => {
    mount("competitive", LONG_Q);
    expect(grid().getAttribute("data-columns")).toBe("auto");
    expect(grid().className).not.toContain("lg:grid-cols-2");
  });

  it("leaves comfortable surfaces on the classic single column", () => {
    mount("standard", SHORT_Q);
    expect(grid().getAttribute("data-columns")).toBe("auto");
    expect(grid().className).not.toContain("lg:grid-cols-2");
  });
});
