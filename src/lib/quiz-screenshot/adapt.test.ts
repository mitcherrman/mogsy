import { describe, expect, it } from "vitest";
import { adaptScreenshotQuestion, adaptScreenshotQuestions } from "./adapt";

const source = {
  id: 42,
  question_text: "Which item?",
  format: "multiple_choice",
  category: "items",
  difficulty: 2,
  choices: ["Thornmail", { label: "Sunfire", image_path: "assets/items/3068.png" }],
  correct_answer: { type: "exact", value: "thornmail" },
  explanation: "It grants the most armor.",
};

describe("adaptScreenshotQuestion", () => {
  it("adapts a review question, preserving choice order and images", () => {
    const q = adaptScreenshotQuestion(source);
    expect(typeof q).not.toBe("string");
    if (typeof q === "string") return;
    expect(q.choices.map((c) => c.label)).toEqual(["Thornmail", "Sunfire"]);
    expect(q.choices[1].image_path).toBe("assets/items/3068.png");
    expect(q.correct_index).toBe(0); // case-insensitive match, order untouched
    expect(q.explanation).toBe("It grants the most armor.");
  });

  it("prefers a valid pre-resolved correct_index", () => {
    const q = adaptScreenshotQuestion({ ...source, correct_index: 1, correct_answer: null });
    if (typeof q === "string") throw new Error(q);
    expect(q.correct_index).toBe(1);
  });

  it("rejects unusable questions with reasons", () => {
    expect(adaptScreenshotQuestion({ ...source, format: "fill_blank" })).toMatch(/unsupported format/);
    expect(adaptScreenshotQuestion({ ...source, question_text: "" })).toMatch(/question_text/);
    expect(adaptScreenshotQuestion({ ...source, choices: ["only"] })).toMatch(/2 choices/);
    expect(adaptScreenshotQuestion({ ...source, correct_answer: null })).toMatch(/missing correct answer/);
    expect(adaptScreenshotQuestion({ ...source, correct_answer: "Not There" })).toMatch(/not among choices/);
  });

  it("falls back to metadata.correct_answer and metadata.explanation", () => {
    const q = adaptScreenshotQuestion({
      ...source,
      correct_answer: null,
      explanation: null,
      metadata: { correct_answer: "Sunfire", explanation: "From metadata." },
    });
    if (typeof q === "string") throw new Error(q);
    expect(q.correct_index).toBe(1);
    expect(q.explanation).toBe("From metadata.");
  });
});

describe("adaptScreenshotQuestions", () => {
  it("applies the limit and collects skips", () => {
    const rows = [source, { ...source, id: 43, question_text: "" }, { ...source, id: 44 }];
    const { adapted, skipped } = adaptScreenshotQuestions(rows, 2);
    expect(adapted.map((q) => q.id)).toEqual([42, 44]);
    expect(skipped).toEqual([{ id: 43, reason: "missing question_text" }]);
  });
});
