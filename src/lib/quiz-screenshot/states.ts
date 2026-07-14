/**
 * Render-state registry + deterministic answer-selection rules.
 *
 * Deterministic rules (documented behavior):
 *  - question:    nothing selected, nothing revealed.
 *  - selected:    first displayed choice (index 0) unless an explicit
 *                 answerIndex override is supplied; not yet judged.
 *  - correct:     the actual correct choice, revealed.
 *  - incorrect:   first displayed choice that is NOT correct (override
 *                 allowed but must not equal the correct index), revealed.
 *                 A question with no incorrect option is a hard error.
 *  - explanation: same as correct, plus the explanation text. A question
 *                 without an explanation yields a documented SKIP, never
 *                 fabricated content.
 *
 * Answer order is never reshuffled — choices render in backend order.
 */
import { RENDER_STATES, type PlanResult, type RenderQuestion, type RenderState } from "./types";

export function isRenderState(s: string): s is RenderState {
  return (RENDER_STATES as readonly string[]).includes(s);
}

/** Strict CSV parser: rejects unknown or duplicate states. */
export function parseStates(csv: string): RenderState[] {
  const parts = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("No states given");
  const seen = new Set<string>();
  return parts.map((s) => {
    if (seen.has(s)) throw new Error(`Duplicate state "${s}"`);
    seen.add(s);
    if (!isRenderState(s)) {
      throw new Error(`Unknown state "${s}". Valid states: ${RENDER_STATES.join(", ")}`);
    }
    return s;
  });
}

/** Validate a question is renderable at all (independent of state). */
export function validateRenderQuestion(q: RenderQuestion): string | null {
  if (!q.question_text?.trim()) return "missing question_text";
  if (!Array.isArray(q.choices) || q.choices.length < 2) {
    return `needs at least 2 choices (got ${q.choices?.length ?? 0})`;
  }
  if (
    typeof q.correct_index !== "number" ||
    !Number.isInteger(q.correct_index) ||
    q.correct_index < 0 ||
    q.correct_index >= q.choices.length
  ) {
    return `correct_index ${q.correct_index} out of range for ${q.choices.length} choices`;
  }
  return null;
}

/**
 * Resolve the deterministic answer plan for a question + state.
 * Throws on malformed input; returns {kind:"skip"} for the documented
 * missing-explanation case.
 */
export function resolveAnswerPlan(
  question: RenderQuestion,
  state: RenderState,
  answerIndexOverride?: number,
): PlanResult {
  const invalid = validateRenderQuestion(question);
  if (invalid) throw new Error(`Question ${question.id}: ${invalid}`);

  if (answerIndexOverride !== undefined) {
    if (
      !Number.isInteger(answerIndexOverride) ||
      answerIndexOverride < 0 ||
      answerIndexOverride >= question.choices.length
    ) {
      throw new Error(
        `answerIndex ${answerIndexOverride} out of range for ${question.choices.length} choices`,
      );
    }
  }

  switch (state) {
    case "question":
      return {
        kind: "render",
        plan: { selectedIndex: null, revealed: false, isCorrectSelection: false, showExplanation: false },
      };
    case "selected": {
      const idx = answerIndexOverride ?? 0;
      return {
        kind: "render",
        plan: { selectedIndex: idx, revealed: false, isCorrectSelection: false, showExplanation: false },
      };
    }
    case "correct":
      return {
        kind: "render",
        plan: {
          selectedIndex: question.correct_index,
          revealed: true,
          isCorrectSelection: true,
          showExplanation: false,
        },
      };
    case "incorrect": {
      let idx: number;
      if (answerIndexOverride !== undefined) {
        if (answerIndexOverride === question.correct_index) {
          throw new Error(
            `answerIndex ${answerIndexOverride} is the correct answer — cannot render "incorrect" state`,
          );
        }
        idx = answerIndexOverride;
      } else {
        idx = question.choices.findIndex((_, i) => i !== question.correct_index);
        if (idx < 0) {
          throw new Error(
            `Question ${question.id} has no incorrect option — cannot render "incorrect" state`,
          );
        }
      }
      return {
        kind: "render",
        plan: { selectedIndex: idx, revealed: true, isCorrectSelection: false, showExplanation: false },
      };
    }
    case "explanation": {
      if (!question.explanation?.trim()) {
        return { kind: "skip", reason: "no explanation on this question" };
      }
      return {
        kind: "render",
        plan: {
          selectedIndex: question.correct_index,
          revealed: true,
          isCorrectSelection: true,
          showExplanation: true,
        },
      };
    }
  }
}
