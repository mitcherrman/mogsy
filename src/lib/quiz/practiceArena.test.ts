/**
 * PM1 — the Practice → arena projection. What these fence is answer safety
 * and honesty: nothing about correctness before the backend grades, nothing
 * shown as a verdict when the backend never answered, and no Ranked-only
 * concept (opponent, clock, rating) reaching the arena.
 */
import { describe, expect, it } from "vitest";
import type { QuizAnswerResult, QuizQuestion } from "@/lib/quiz/api";
import { REVEAL_HOLD_LEVEL_UP_MS, REVEAL_HOLD_MS } from "@/lib/ranked-core/pacing";
import {
  PRACTICE_REVEAL_HOLD_MAX_MS,
  UNVERIFIED_ANSWER,
  classifyPracticeSubmitFailure,
  practiceExplanationDensity,
  practiceRevealHoldMs,
  practiceOptionIdForLabel,
  projectPracticeArena,
  projectPracticeOptions,
  type PracticeArenaInput,
} from "./practiceArena";

const Q1: QuizQuestion = {
  id: 11,
  category: "Champion Ability Cooldowns",
  question_text: "What is the base cooldown of Flash?",
  format: "multiple_choice",
  choices: ["300s", "240s", "180s", "360s"],
};
const Q2: QuizQuestion = {
  id: 12,
  category: "Champion Recognition",
  question_text: "Which champion is this?",
  format: "multiple_choice",
  choices: [
    { label: "Ahri", image_path: "assets/champions/Ahri/icon.png" } as unknown as string,
    { label: "Lux", image_path: "assets/champions/Lux/icon.png" } as unknown as string,
  ],
};

function input(over: Partial<PracticeArenaInput> = {}): PracticeArenaInput {
  return {
    questions: [Q1, Q2],
    currentIndex: 0,
    selectedAnswer: null,
    answerResult: null,
    outcomes: [],
    score: 0,
    subject: "Summoner Spells",
    ...over,
  };
}

const GRADED_WRONG: QuizAnswerResult = {
  is_correct: false,
  correct_answer: "300s",
  explanation: "Flash is 300 seconds.",
  xp_earned: 2,
};

describe("practice arena projection", () => {
  it("keeps the served options, in served order, keyed by index", () => {
    expect(projectPracticeOptions(Q1).map((o) => [o.id, o.label])).toEqual([
      ["0", "300s"], ["1", "240s"], ["2", "180s"], ["3", "360s"],
    ]);
  });

  it("carries a picture choice's art on the option and nothing else", () => {
    const opts = projectPracticeOptions(Q2);
    expect(opts.map((o) => o.imagePath)).toEqual([
      "assets/champions/Ahri/icon.png", "assets/champions/Lux/icon.png",
    ]);
    expect(projectPracticeOptions(Q1).some((o) => "imagePath" in o)).toBe(false);
  });

  it("is open and carries no correctness before an answer", () => {
    const p = projectPracticeArena(input());
    expect(p.surface?.inputOpen).toBe(true);
    expect(p.surface?.permissions.canSelectAnswer).toBe(true);
    expect(p.surface?.reveal).toBeNull();
    expect(p.header.centralResult).toBeNull();
    expect(JSON.stringify(p.surface)).not.toContain("correct");
  });

  it("locks the moment a choice is made, before the grade arrives", () => {
    const p = projectPracticeArena(input({ selectedAnswer: "240s" }));
    expect(p.surface?.inputOpen).toBe(false);
    expect(p.surface?.permissions.canSelectAnswer).toBe(false);
    expect(p.surface?.selectedOptionId).toBe("1");
    expect(p.surface?.reveal).toBeNull();
  });

  it("reveals only the backend's grade, and puts the verdict and XP on the header", () => {
    const p = projectPracticeArena(input({
      selectedAnswer: "240s", answerResult: GRADED_WRONG,
      outcomes: [{ position: 0, isCorrect: false }],
    }));
    expect(p.surface?.reveal).toEqual({
      revealed: true, isCorrect: false, correctOptionId: "0", explanation: null,
    });
    expect(p.header.centralResult).toEqual({ verdict: "INCORRECT", points: "+2 XP" });
    expect(p.graded).toBe(true);
    expect(p.outcomesByNumber.get(1)).toBe("incorrect");
  });

  it("never draws a verdict for a submit the backend did not answer", () => {
    const p = projectPracticeArena(input({ selectedAnswer: "240s", answerResult: UNVERIFIED_ANSWER }));
    expect(p.unverified).toBe(true);
    expect(p.graded).toBe(false);
    expect(p.surface?.reveal).toBeNull();
    expect(p.header.centralResult).toBeNull();
    expect(p.answered).toBe(0);
  });

  it("states the run in Practice's terms, with no clock, opponent or rating", () => {
    const p = projectPracticeArena(input({ currentIndex: 1, score: 1, outcomes: [{ position: 0, isCorrect: true }] }));
    expect(p.header.title).toBe("Question 2 / 2");
    expect(p.header.eyebrow).toBe("Practice · Summoner Spells");
    expect(p.header.titleDetail).toBe("1 correct");
    expect(p.header.timer).toBeNull();
    expect(JSON.stringify(p.header)).not.toMatch(/opponent|rating|ranked|vs/i);
    expect(p.isLast).toBe(true);
  });

  it("keys outcomes by POSITION, so a failed submit leaves its node unresolved", () => {
    // Question 1's submit failed (no outcome), question 2 was graded correct.
    const p = projectPracticeArena(input({ currentIndex: 1, outcomes: [{ position: 1, isCorrect: true }] }));
    expect(p.outcomesByNumber.has(1)).toBe(false);
    expect(p.outcomesByNumber.get(2)).toBe("correct");
    expect(p.timeline?.nodes.length).toBe(2);
  });

  it("resolves a label to the FIRST option that carries it", () => {
    expect(practiceOptionIdForLabel(Q1, "180s")).toBe("2");
    expect(practiceOptionIdForLabel(Q1, "nope")).toBeNull();
    expect(practiceOptionIdForLabel(Q1, null)).toBeNull();
  });
});

describe("PM2 — the reveal hold and the explanation's density", () => {
  const graded = (explanation: string): QuizAnswerResult => ({ is_correct: true, correct_answer: "x", explanation });

  it("never advances by itself without a grade, or after a failed submit", () => {
    expect(practiceRevealHoldMs(null)).toBeNull();
    expect(practiceRevealHoldMs(UNVERIFIED_ANSWER)).toBeNull();
  });

  it("takes the arena's short beat for a verdict with nothing to read", () => {
    expect(practiceRevealHoldMs(graded(""))).toBe(REVEAL_HOLD_MS);
    expect(practiceRevealHoldMs(graded("   "))).toBe(REVEAL_HOLD_MS);
  });

  it("takes at least the long beat with an explanation, longer for longer text, and is capped", () => {
    const short = practiceRevealHoldMs(graded("Yes."))!;
    const median = practiceRevealHoldMs(graded("x".repeat(94)))!;
    const longest = practiceRevealHoldMs(graded("x".repeat(305)))!;
    expect(short).toBe(REVEAL_HOLD_LEVEL_UP_MS);
    expect(median).toBeGreaterThan(REVEAL_HOLD_LEVEL_UP_MS);
    expect(longest).toBeGreaterThan(median);
    expect(longest).toBeLessThanOrEqual(PRACTICE_REVEAL_HOLD_MAX_MS);
    expect(practiceRevealHoldMs(graded("x".repeat(5000)))).toBe(PRACTICE_REVEAL_HOLD_MAX_MS);
  });

  it("tiers explanations by length", () => {
    expect(practiceExplanationDensity(null)).toBe("normal");
    expect(practiceExplanationDensity("x".repeat(100))).toBe("normal");
    expect(practiceExplanationDensity("x".repeat(101))).toBe("medium");
    expect(practiceExplanationDensity("x".repeat(150))).toBe("medium");
    expect(practiceExplanationDensity("x".repeat(151))).toBe("long");
    expect(practiceExplanationDensity("x".repeat(220))).toBe("long");
    expect(practiceExplanationDensity("x".repeat(221))).toBe("dense");
  });
});

describe("PM2 — a failed submit is retried only when that cannot record it twice", () => {
  const classify = (notSent: boolean, status: number | null, idempotentAttempts = false) =>
    classifyPracticeSubmitFailure({ notSent, status, idempotentAttempts });

  it("never sent → retry is the first real send", () => {
    expect(classify(true, null)).toEqual({ kind: "not-sent", retryable: true });
  });

  it("refused before the handler records (auth, validation, rate limit) → retry is safe", () => {
    for (const status of [400, 401, 403, 404, 422, 429]) {
      expect(classify(false, status)).toEqual({ kind: "rejected", retryable: true });
    }
  });

  it("outcome unknown (dropped connection, 5xx, timeouts) → no retry against a backend without idempotency", () => {
    for (const status of [null, 500, 502, 503, 504, 408, 409]) {
      expect(classify(false, status)).toEqual({ kind: "unknown", retryable: false });
    }
  });

  it("outcome unknown → retry once the backend has proved it dedupes the same client_attempt_id", () => {
    expect(classify(false, 503, true)).toEqual({ kind: "unknown", retryable: true });
    expect(classify(false, null, true)).toEqual({ kind: "unknown", retryable: true });
  });
});
