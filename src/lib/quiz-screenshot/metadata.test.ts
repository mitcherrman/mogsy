import { describe, expect, it } from "vitest";
import { buildQuestionMetadata, promptPreview } from "./metadata";
import type { RenderQuestion } from "./types";

const question: RenderQuestion = {
  id: 123,
  question_text: "Which item grants the most armor?",
  choices: [{ label: "Thornmail" }, { label: "Sunfire" }],
  correct_index: 0,
  explanation: "Thornmail.",
  category: "items",
  difficulty: 2,
};

const base = {
  question,
  sourceMode: "question-id",
  statesRequested: ["question", "correct"],
  formatsRequested: ["vertical", "square"],
  screenshots: [
    { format: "vertical", state: "question" as const, file: "vertical_question.png", width: 1080, height: 1920 },
    { format: "vertical", state: "correct" as const, file: "vertical_correct.png", width: 1080, height: 1920 },
    { format: "square", state: "question" as const, file: "square_question.png", width: 1080, height: 1080 },
  ],
  statesSkipped: [],
  warnings: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  missingAssets: [],
  overflowFindings: [],
  generatedAt: "2026-07-13T00:00:00.000Z",
};

describe("buildQuestionMetadata", () => {
  it("includes all required fields", () => {
    const m = buildQuestionMetadata(base);
    expect(m.question_id).toBe(123);
    expect(m.stable_slug).toBe("question_000123");
    expect(m.question_type).toBe("multiple_choice");
    expect(m.category).toBe("items");
    expect(m.prompt_preview).toContain("Which item");
    expect(m.source_mode).toBe("question-id");
    expect(m.states_requested).toEqual(["question", "correct"]);
    expect(m.generated_at).toBe("2026-07-13T00:00:00.000Z");
  });

  it("derives rendered state and format lists from actual captures", () => {
    const m = buildQuestionMetadata(base);
    expect(m.states_rendered).toEqual(["question", "correct"]);
    expect(m.formats_rendered).toEqual(["vertical", "square"]);
  });

  it("contains no secret-bearing fields", () => {
    const m = buildQuestionMetadata(base);
    const json = JSON.stringify(m).toLowerCase();
    for (const banned of ["token", "secret", "cookie", "admin_key", "adminkey", "authorization", "supabase"]) {
      expect(json).not.toContain(banned);
    }
    expect(Object.keys(m)).not.toContain("env");
  });
});

describe("promptPreview", () => {
  it("flattens whitespace and truncates long prompts", () => {
    expect(promptPreview("a\n  b\tc")).toBe("a b c");
    const long = "x".repeat(300);
    expect(promptPreview(long).length).toBe(120);
    expect(promptPreview(long).endsWith("…")).toBe(true);
  });
});
