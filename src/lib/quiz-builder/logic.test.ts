import { describe, it, expect } from "vitest";
import {
  validateEditableQuestion,
  candidateToEditable,
  buildDraftCreatePayload,
  isProductionReady,
  pickGenerateDefaults,
  parseApiError,
  builderErrorMessage,
  isUnsafePromotion,
  type EditableQuestion,
} from "@/lib/quiz-builder/logic";
import type { QuizBuilderCandidate, QuizBuilderMeta } from "@/lib/quiz/api";

const candidate: QuizBuilderCandidate = {
  template_id: "most_picked",
  source_type: "pro_esports",
  question_text: "Which champion was picked the most in major-region professional games in 2026?",
  format: "multiple_choice",
  choices: ["Ahri", "Zed", "Lux", "Jinx"],
  correct_answer: { type: "champion_name", value: "Ahri" },
  explanation: "In 2026 major-region games: Ahri (100 picks)…",
  difficulty: 2,
  year: 2026,
  scope_name: "major",
  scope_label: "major-region",
  coverage_status: "complete",
  production_ready: true,
  coverage_warnings: [],
  evidence: [{ champion: "Ahri", picks: 100, bans: 10, presence_games: 105 }],
  source_tables: ["esports_champion_scoped_stats"],
  generation_params: { template_id: "most_picked", year: 2026 },
  warnings: [],
};

const validEdit: EditableQuestion = {
  question_text: "Q?",
  choices: ["Ahri", "Zed", "Lux", "Jinx"],
  correctAnswer: "Ahri",
  explanation: "because",
  difficulty: 2,
};

describe("validateEditableQuestion", () => {
  it("accepts a valid question", () => {
    expect(validateEditableQuestion(validEdit).ok).toBe(true);
  });

  it("rejects empty question text", () => {
    const r = validateEditableQuestion({ ...validEdit, question_text: "   " });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Question text/.test(e))).toBe(true);
  });

  it("rejects blank choices", () => {
    const r = validateEditableQuestion({ ...validEdit, choices: ["Ahri", "  ", "Lux", "Jinx"] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /blank/.test(e))).toBe(true);
  });

  it("rejects fewer than two choices", () => {
    const r = validateEditableQuestion({ ...validEdit, choices: ["Ahri"], correctAnswer: "Ahri" });
    expect(r.errors.some((e) => /two choices/.test(e))).toBe(true);
  });

  it("rejects duplicate choices after normalization", () => {
    const r = validateEditableQuestion({ ...validEdit, choices: ["Ahri", "ahri", "Lux", "Jinx"] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /unique/.test(e))).toBe(true);
  });

  it("rejects a correct answer not among choices", () => {
    const r = validateEditableQuestion({ ...validEdit, correctAnswer: "Teemo" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /one of the choices/.test(e))).toBe(true);
  });

  it("rejects out-of-range difficulty", () => {
    expect(validateEditableQuestion({ ...validEdit, difficulty: 9 }).ok).toBe(false);
    expect(validateEditableQuestion({ ...validEdit, difficulty: 0 }).ok).toBe(false);
  });
});

describe("candidateToEditable + buildDraftCreatePayload", () => {
  it("seeds an editable question from a candidate", () => {
    const e = candidateToEditable(candidate);
    expect(e.question_text).toBe(candidate.question_text);
    expect(e.correctAnswer).toBe("Ahri");
    expect(e.choices).toEqual(["Ahri", "Zed", "Lux", "Jinx"]);
    // Must be a copy, not the same array reference.
    expect(e.choices).not.toBe(candidate.choices);
  });

  it("builds a draft payload using EDITED values, preserving snapshot", () => {
    const edited: EditableQuestion = {
      question_text: "  Reworded question?  ",
      choices: [" Ahri ", "Zed", "Lux", "Jinx"],
      correctAnswer: " Ahri ",
      explanation: "  ",
      difficulty: 4,
    };
    const payload = buildDraftCreatePayload(candidate, edited);
    expect(payload.question_text).toBe("Reworded question?");
    expect(payload.choices).toEqual(["Ahri", "Zed", "Lux", "Jinx"]); // trimmed
    expect(payload.correct_answer).toEqual({ type: "champion_name", value: "Ahri" });
    expect(payload.difficulty).toBe(4);
    expect(payload.explanation).toBeNull(); // blank → null
    // Snapshot fields preserved from candidate.
    expect(payload.evidence).toBe(candidate.evidence);
    expect(payload.coverage_status).toBe("complete");
    expect(payload.source_tables).toEqual(["esports_champion_scoped_stats"]);
  });
});

describe("coverage gating", () => {
  it("only 'complete' is production ready", () => {
    expect(isProductionReady("complete")).toBe(true);
    expect(isProductionReady("in_progress")).toBe(false);
    expect(isProductionReady("partial")).toBe(false);
    expect(isProductionReady("unavailable")).toBe(false);
    expect(isProductionReady("unknown")).toBe(false);
  });
});

describe("pickGenerateDefaults", () => {
  const meta: QuizBuilderMeta = {
    source_types: ["pro_esports"],
    templates: [
      { template_id: "most_picked", label: "Most picked", default_difficulty: 2, stat_column: "picks" },
      { template_id: "most_banned", label: "Most banned", default_difficulty: 2, stat_column: "bans" },
    ],
    scopes: [
      { scope_name: "all-imported", label: "all imported" },
      { scope_name: "major", label: "major-region" },
      { scope_name: "international", label: "international" },
    ],
    years: [
      { year: 2011, scopes: ["major"], coverage_status: "in_progress", production_ready: false, champions_with_stats: 4, job_counts: {}, notes: [] },
      { year: 2026, scopes: ["all-imported", "international", "major"], coverage_status: "complete", production_ready: true, champions_with_stats: 172, job_counts: {}, notes: [] },
    ],
    difficulties: [1, 2, 3, 4, 5],
    max_candidate_count: 10,
  };

  it("prefers a production-ready year and major scope", () => {
    const d = pickGenerateDefaults(meta);
    expect(d.year).toBe(2026);
    expect(d.scope_name).toBe("major");
    expect(d.template_id).toBe("most_picked");
    expect(d.difficulty).toBe(2);
    expect(d.candidate_count).toBe(3);
  });

  it("falls back to the first year when none are production ready", () => {
    const noReady: QuizBuilderMeta = {
      ...meta,
      years: meta.years.map((y) => ({ ...y, production_ready: false })),
    };
    const d = pickGenerateDefaults(noReady);
    expect(d.year).toBe(2011); // first entry
  });
});

describe("parseApiError + builderErrorMessage", () => {
  it("extracts status and detail from a Quiz API error", () => {
    const err = new Error('Quiz API 400: {"detail":"Year 2011 coverage is \'in_progress\', not complete"}');
    const parsed = parseApiError(err);
    expect(parsed.status).toBe(400);
    expect(parsed.message).toContain("in_progress");
  });

  it("maps 409 to a duplicate message", () => {
    const err = new Error('Quiz API 409: {"detail":"A draft with question_key ... already exists"}');
    expect(builderErrorMessage(err)).toBe("A matching draft already exists.");
  });

  it("maps 404 and 403", () => {
    expect(builderErrorMessage(new Error("Quiz API 404: {}"))).toMatch(/no longer exists/);
    expect(builderErrorMessage(new Error("Quiz API 403: {}"))).toMatch(/Admin key/);
  });

  it("passes through 400 detail text", () => {
    const err = new Error('Quiz API 400: {"detail":"choices contain duplicate normalized values"}');
    expect(builderErrorMessage(err)).toBe("choices contain duplicate normalized values");
  });
});

describe("isUnsafePromotion", () => {
  it("accepts the safe inactive+unreviewed result", () => {
    expect(isUnsafePromotion({ is_active: false, review_status: "unreviewed" })).toBe(false);
  });
  it("flags an active promotion as unsafe", () => {
    expect(isUnsafePromotion({ is_active: true, review_status: "unreviewed" })).toBe(true);
  });
  it("flags a non-unreviewed status as unsafe", () => {
    expect(isUnsafePromotion({ is_active: false, review_status: "approved" })).toBe(true);
  });
});
