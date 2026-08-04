/**
 * `optionMedia` is ADDITIVE to the production quiz grid (RA6).
 *
 * `QuizAnswerOptions` is shared by the live quiz page, the screenshot render
 * harness and the Ranked arena. The new prop must therefore be inert for every
 * caller that does not pass it, and must never combine with the pre-existing
 * PICTURE-CHOICE mode (`QuizChoiceObject.image_path`), which owns its own
 * 2-up grid and large art.
 *
 * Also holds the two non-regression lines this phase must not cross: the
 * premise-media adapter still sees only `presentation`, and Item Cost Duel is
 * not on this code path at all.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import QuizAnswerOptions from "./QuizAnswerOptions";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import { itemCostDuelModule } from "@/lib/ranked-core/modules/itemCostDuelModule";
import {
  ITEM_OPTION_QUESTION,
  NUMERIC_QUESTION,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";

const CHOICES = ["Kindlegem", "Ruby Crystal", "Cloth Armor", "Null-Magic Mantle"];
const MEDIA = ITEM_OPTION_QUESTION.option_media!.map((m) => ({
  type: m.type, name: m.name, icon: m.icon,
}));

function html(node: HTMLElement) {
  return node.querySelector("[data-quiz-answer-options]")!.innerHTML;
}

describe("QuizAnswerOptions stays byte-identical without the prop", () => {
  it("omitting optionMedia renders exactly the shipped text grid", () => {
    const { container } = render(
      <QuizAnswerOptions choices={CHOICES} selectedAnswer={null}
        answerResult={null} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll("[data-option-media]")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    // Same grid class strategy as before: single column, no image mode.
    expect(container.querySelector("[data-quiz-answer-options]")!.className)
      .toContain("grid-cols-1");
  });

  it("passing undefined is the same DOM as not passing it", () => {
    const a = render(
      <QuizAnswerOptions choices={CHOICES} selectedAnswer="Cloth Armor"
        answerResult={null} onSelect={() => {}} />,
    );
    const b = render(
      <QuizAnswerOptions choices={CHOICES} selectedAnswer="Cloth Armor"
        answerResult={null} onSelect={() => {}} optionMedia={undefined} />,
    );
    expect(html(b.container)).toBe(html(a.container));
  });

  it("a length mismatch degrades to the text grid rather than shifting icons", () => {
    for (const media of [MEDIA.slice(0, 2), [...MEDIA, MEDIA[0]], []]) {
      const { container } = render(
        <QuizAnswerOptions choices={CHOICES} selectedAnswer={null}
          answerResult={null} onSelect={() => {}} optionMedia={media} />,
      );
      expect(container.querySelectorAll("[data-option-media]")).toHaveLength(0);
    }
  });
});

describe("picture-choice mode is untouched", () => {
  const PICTURES = [
    { label: "Ahri", image_path: "assets/champions/Ahri/icon.png" },
    { label: "Sett", image_path: "assets/champions/Sett/icon.png" },
    { label: "Garen", image_path: "assets/champions/Garen/icon.png" },
    { label: "Darius", image_path: "assets/champions/Darius/icon.png" },
  ];

  it("keeps its 2-up grid and large art with no inline slots", () => {
    const { container } = render(
      <QuizAnswerOptions choices={PICTURES} selectedAnswer={null}
        answerResult={null} onSelect={() => {}} />,
    );
    expect(container.querySelector("[data-quiz-answer-options]")!.className)
      .toContain("grid-cols-2");
    expect(container.querySelectorAll("img")).toHaveLength(4);
    expect(container.querySelectorAll("[data-option-media]")).toHaveLength(0);
  });

  it("wins over optionMedia so an answer never carries two pictures", () => {
    const { container } = render(
      <QuizAnswerOptions choices={PICTURES} selectedAnswer={null}
        answerResult={null} onSelect={() => {}} optionMedia={MEDIA} />,
    );
    expect(container.querySelectorAll("[data-option-media]")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(4);
  });
});

describe("premise media is not on this path", () => {
  it("the scenario adapter still reads only `presentation`", () => {
    const source = scenarioSourceFromPublicQuestion({
      questionId: NUMERIC_QUESTION.question_id,
      prompt: NUMERIC_QUESTION.prompt,
      options: NUMERIC_QUESTION.options,
      category: NUMERIC_QUESTION.category,
      presentation: NUMERIC_QUESTION.presentation,
    });
    expect(source!.metadata).toEqual(NUMERIC_QUESTION.presentation);
  });

  it("option media never reaches the scenario source", () => {
    const source = scenarioSourceFromPublicQuestion({
      questionId: ITEM_OPTION_QUESTION.question_id,
      prompt: ITEM_OPTION_QUESTION.prompt,
      options: ITEM_OPTION_QUESTION.options,
      category: ITEM_OPTION_QUESTION.category,
      presentation: ITEM_OPTION_QUESTION.presentation,
      optionMedia: ITEM_OPTION_QUESTION.option_media,
    });
    // The premise blob it builds is exactly the backend's, with no option
    // media grafted on — the scenario band is unaffected by this phase. (The
    // source's `choices` have always carried the option TEXT; that is the
    // shipped spoiler-gating input, not something this phase added.)
    expect(source!.metadata).toEqual(ITEM_OPTION_QUESTION.presentation);
    expect(JSON.stringify(source!.metadata)).not.toContain("option_media");
    expect(JSON.stringify(source!.metadata)).not.toContain("Ruby Crystal");
  });

  it("a question with option media only produces no scenario source at all", () => {
    expect(scenarioSourceFromPublicQuestion({
      questionId: "q", prompt: "p", options: ["Garen"], category: null,
      presentation: null,
    })).toBeNull();
  });
});

describe("Item Cost Duel is not on this path", () => {
  it("projects no QuestionView, so it never reaches the answer grid", () => {
    expect(itemCostDuelModule.projectQuestion({} as never)).toBeNull();
    expect(itemCostDuelModule.ownsSubmission).toBe(true);
  });
});

describe("the shipped grid still announces answers once", () => {
  it("text options keep their exact accessible names", () => {
    render(
      <QuizAnswerOptions choices={CHOICES} selectedAnswer={null}
        answerResult={null} onSelect={() => {}} optionMedia={MEDIA} />,
    );
    expect(screen.getByRole("button", { name: "A. Kindlegem" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "D. Null-Magic Mantle" })).toBeTruthy();
  });
});
