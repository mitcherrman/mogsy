import { describe, expect, it } from "vitest";

import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { projectQuestion as legacyProjectQuestion } from "@/pages/quiz-ranked/rankedViews";
import { quizModule } from "./quizModule";

const parsed = () => readPublicRound(publicRoundV2());

describe("quiz.v1 renderer parity (Phase A)", () => {
  it("projects the same QuestionView the pre-module adapter produced", () => {
    const pub = parsed();
    expect(quizModule.projectQuestion(pub)).toEqual(
      questionViewFromPublicQuestion(pub.question!));
  });

  it("is the single implementation behind the legacy rankedViews export", () => {
    const pub = parsed();
    expect(legacyProjectQuestion(pub)).toEqual(quizModule.projectQuestion(pub));
  });

  it("returns null when the round carries no question", () => {
    const pub = readPublicRound(publicRoundV2(true));
    expect(quizModule.projectQuestion(pub)).toBeNull();
    expect(quizModule.summaryLabel(pub, "0")).toBeNull();
  });

  it("summarises the selected option by its stable id", () => {
    const pub = parsed();
    const question = quizModule.projectQuestion(pub)!;
    for (const option of question.options) {
      expect(quizModule.summaryLabel(pub, option.id)).toBe(option.label);
    }
  });

  it("summarises to null when nothing is selected or the id is unknown", () => {
    const pub = parsed();
    expect(quizModule.summaryLabel(pub, null)).toBeNull();
    expect(quizModule.summaryLabel(pub, "nope")).toBeNull();
  });

  it("keeps option ids mapped to their backend submission index", () => {
    // The confirmation path submits `option.index`; ids are stringified
    // indices. Breaking this would silently submit the wrong answer.
    const question = quizModule.projectQuestion(parsed())!;
    for (const option of question.options) {
      expect(option.id).toBe(String(option.index));
    }
  });

  it("never exposes a correct answer in the projected question", () => {
    const question = quizModule.projectQuestion(parsed())!;
    const blob = JSON.stringify(question);
    expect(blob).not.toContain("correct");
  });
});
