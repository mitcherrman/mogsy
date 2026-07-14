import { describe, expect, it } from "vitest";
import { parseStates, resolveAnswerPlan, validateRenderQuestion } from "./states";
import { RENDER_STATES, type RenderQuestion } from "./types";

const q = (overrides: Partial<RenderQuestion> = {}): RenderQuestion => ({
  id: 1,
  question_text: "Which?",
  choices: [{ label: "A" }, { label: "B" }, { label: "C" }],
  correct_index: 1,
  explanation: "Because B.",
  ...overrides,
});

describe("parseStates", () => {
  it("accepts every supported state", () => {
    expect(parseStates(RENDER_STATES.join(","))).toEqual([...RENDER_STATES]);
  });
  it("rejects unknown states", () => {
    expect(() => parseStates("question,bogus")).toThrow(/Unknown state "bogus"/);
  });
  it("rejects duplicates and empty input", () => {
    expect(() => parseStates("question,question")).toThrow(/Duplicate/);
    expect(() => parseStates("")).toThrow(/No states/);
  });
});

describe("validateRenderQuestion", () => {
  it("accepts a valid question", () => {
    expect(validateRenderQuestion(q())).toBeNull();
  });
  it("rejects missing text, too few choices, bad correct_index", () => {
    expect(validateRenderQuestion(q({ question_text: " " }))).toMatch(/question_text/);
    expect(validateRenderQuestion(q({ choices: [{ label: "A" }] }))).toMatch(/2 choices/);
    expect(validateRenderQuestion(q({ correct_index: 3 }))).toMatch(/out of range/);
    expect(validateRenderQuestion(q({ correct_index: -1 }))).toMatch(/out of range/);
  });
});

describe("resolveAnswerPlan", () => {
  it("question: nothing selected, nothing revealed", () => {
    const r = resolveAnswerPlan(q(), "question");
    expect(r).toEqual({
      kind: "render",
      plan: { selectedIndex: null, revealed: false, isCorrectSelection: false, showExplanation: false },
    });
  });

  it("selected: deterministic first choice, not judged", () => {
    const r = resolveAnswerPlan(q(), "selected");
    expect(r.kind).toBe("render");
    if (r.kind === "render") {
      expect(r.plan.selectedIndex).toBe(0);
      expect(r.plan.revealed).toBe(false);
    }
  });

  it("selected: honors answerIndex override, rejects out-of-range", () => {
    const r = resolveAnswerPlan(q(), "selected", 2);
    if (r.kind === "render") expect(r.plan.selectedIndex).toBe(2);
    expect(() => resolveAnswerPlan(q(), "selected", 9)).toThrow(/out of range/);
  });

  it("correct: selects the actual correct answer, revealed", () => {
    const r = resolveAnswerPlan(q(), "correct");
    if (r.kind === "render") {
      expect(r.plan.selectedIndex).toBe(1);
      expect(r.plan.revealed).toBe(true);
      expect(r.plan.isCorrectSelection).toBe(true);
    }
  });

  it("incorrect: first non-correct choice, revealed", () => {
    const r = resolveAnswerPlan(q(), "incorrect");
    if (r.kind === "render") {
      expect(r.plan.selectedIndex).toBe(0);
      expect(r.plan.revealed).toBe(true);
      expect(r.plan.isCorrectSelection).toBe(false);
    }
    // correct answer at index 0 → picks index 1
    const r2 = resolveAnswerPlan(q({ correct_index: 0 }), "incorrect");
    if (r2.kind === "render") expect(r2.plan.selectedIndex).toBe(1);
  });

  it("incorrect: rejects an override equal to the correct index", () => {
    expect(() => resolveAnswerPlan(q(), "incorrect", 1)).toThrow(/correct answer/);
  });

  it("explanation: renders when explanation exists, skips when absent", () => {
    const r = resolveAnswerPlan(q(), "explanation");
    if (r.kind === "render") expect(r.plan.showExplanation).toBe(true);
    const skip = resolveAnswerPlan(q({ explanation: undefined }), "explanation");
    expect(skip.kind).toBe("skip");
    const skip2 = resolveAnswerPlan(q({ explanation: "  " }), "explanation");
    expect(skip2.kind).toBe("skip");
  });

  it("stable output: identical input yields identical plans", () => {
    const a = resolveAnswerPlan(q(), "incorrect");
    const b = resolveAnswerPlan(q(), "incorrect");
    expect(a).toEqual(b);
  });

  it("throws on malformed questions", () => {
    expect(() => resolveAnswerPlan(q({ choices: [{ label: "A" }] }), "question")).toThrow();
  });
});
