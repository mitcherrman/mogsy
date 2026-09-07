import { describe, expect, it } from "vitest";
import {
  GENERIC_ANSWER_PROMPT,
  MAX_ENUMERATED_OPTIONS,
  QUESTION_PROMPT,
  REVEAL_PROMPT,
  answerPromptCopy,
} from "./cta";
import { PHASE_0_DIAGNOSTIC, PRO_SCOPE_COMPARISON } from "./presentationFixtures";
import { SAMPLE_RENDER_QUESTIONS } from "./fixtures";

describe("answerPromptCopy", () => {
  it("asks for exactly the letters the question has", () => {
    expect(answerPromptCopy(2)).toBe("Comment A or B");
    expect(answerPromptCopy(3)).toBe("Comment A, B, or C");
    expect(answerPromptCopy(4)).toBe("Comment A, B, C, or D");
  });

  /**
   * The regression this module exists for. `PRO_SCOPE_COMPARISON` is a REAL
   * two-option row (a pairwise Pro Play comparison), and the card printed
   * "Comment A, B, C, or D" over it — asking readers for two options that were
   * never on screen.
   */
  it("never asks for an option the question does not have", () => {
    const copy = answerPromptCopy(PRO_SCOPE_COMPARISON.choices.length);
    expect(PRO_SCOPE_COMPARISON.choices).toHaveLength(2);
    expect(copy).toBe("Comment A or B");
    // The letters only — "Comment" has a C in it, and the point is the ASK.
    const asked = copy.replace(/^Comment /, "");
    expect(asked).not.toContain("C");
    expect(asked).not.toContain("D");
  });

  it("holds for every fixture question in the repo", () => {
    const rows = [...PHASE_0_DIAGNOSTIC, ...SAMPLE_RENDER_QUESTIONS];
    expect(rows.length).toBeGreaterThan(0);
    for (const q of rows) {
      const copy = answerPromptCopy(q.choices.length);
      const letters = q.choices.map((_, i) => String.fromCharCode(65 + i));
      if (q.choices.length <= MAX_ENUMERATED_OPTIONS) {
        // Every letter it names is a letter the grid draws…
        for (const l of copy.replace("Comment ", "").split(/,| or /).map((s) => s.trim())) {
          if (l) expect(letters).toContain(l);
        }
        // …and every letter the grid draws is named.
        for (const l of letters) expect(copy).toContain(l);
      } else {
        expect(copy).toBe(GENERIC_ANSWER_PROMPT);
      }
    }
  });

  it("drops the letters once reciting them stops helping a reader", () => {
    expect(answerPromptCopy(MAX_ENUMERATED_OPTIONS + 1)).toBe(GENERIC_ANSWER_PROMPT);
    expect(answerPromptCopy(9)).toBe(GENERIC_ANSWER_PROMPT);
  });

  it("refuses to invent letters for a count that is not a question", () => {
    // `adaptScreenshotQuestion` rejects these upstream; the prompt is not the
    // place to discover a malformed row, so it degrades rather than throws.
    for (const n of [0, 1, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(answerPromptCopy(n)).toBe(GENERIC_ANSWER_PROMPT);
    }
  });

  it("punctuates two options without a serial comma", () => {
    expect(answerPromptCopy(2)).not.toContain(",");
    expect(answerPromptCopy(3)).toContain(",");
  });
});

describe("brand prompt copy", () => {
  it("keeps the question and reveal lines distinct", () => {
    expect(QUESTION_PROMPT).not.toBe(REVEAL_PROMPT);
  });
  it("leaves the domain to the caller — the line never hardcodes one", () => {
    for (const line of [QUESTION_PROMPT, REVEAL_PROMPT, GENERIC_ANSWER_PROMPT]) {
      expect(line).not.toMatch(/mogzy|mogsy|\.lol/i);
    }
  });
});
