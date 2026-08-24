/**
 * RG3 — turning a round's frozen review material into ONE short line.
 *
 * The Ranked bank freezes a STRUCTURED rationale with every question it serves
 * (`ranked_duel_question_bank.candidate_explanation`): the canonical formula
 * id, the rounding rule, the worked calculation steps, and why each distractor
 * is wrong. All of it is copied verbatim from the reviewed candidate — no text
 * in that pipeline is authored — which makes it authoritative and makes it
 * long.
 *
 * A gameplay answer beat lasts about a second and a half. A worked solution is
 * not readable in that time, and putting one there is exactly the mandatory
 * explanation panel this work exists to not reinstate. So this module SELECTS
 * rather than summarises: it picks the one step that produced the answer and
 * says it. Selection is not authoring — every character rendered came from the
 * reviewed candidate — and the full material stays untouched in the payload for
 * the post-match review surface that is built to hold it.
 *
 * WHY THE LAST STEP
 * ─────────────────
 * `calculation_steps` is ordered and its final entry is the one whose value IS
 * the correct answer; the generator's own tests assert that
 * (`test_purchase_total_accuracy`, `test_calculation_steps_reproduce_answer`).
 * So the last step is not a heuristic pick of "probably the interesting one" —
 * it is the step the answer is defined by.
 *
 * NOTHING IS FABRICATED
 * ─────────────────────
 * Every branch here can return null, and null means the surface shows no
 * evidence at all. A question with no frozen rationale gets a verdict and the
 * correct answer highlighted, and that is the whole feedback — which is honest.
 * The one thing this must never do is compose a plausible sentence out of
 * fields that did not say it.
 */
import type { FeedbackEvidence } from "./model";

/**
 * The frozen review material as the backend ships it, all fields optional.
 *
 * Typed loosely on purpose: this is a verbatim carry-over of a reviewed
 * candidate, so its exact population varies by question family and a strict
 * shape here would reject material the backend considers valid.
 */
export interface FrozenExplanation {
  formula_id?: unknown;
  rounding_rule?: unknown;
  calculation_steps?: unknown;
  distractor_derivations?: unknown;
  scenario_note?: unknown;
}

/** Longest evidence line we will put in a 1.5-second beat. */
const MAX_STATEMENT_CHARS = 96;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * One calculation step, said out loud.
 *
 * Two shapes reach here and both are real: the generators emit
 * `{step, value}` objects, and at least one family freezes plain strings
 * ("450 + 50"). A bare string is already a sentence fragment and is returned
 * as-is; an object becomes `Step: value`, which is the two fields joined and
 * nothing more.
 */
function stepStatement(step: unknown): string | null {
  const plain = text(step);
  if (plain) return plain;
  if (typeof step !== "object" || step === null) return null;
  const record = step as Record<string, unknown>;
  const label = text(record.step);
  const value = record.value;
  const shown =
    typeof value === "number" && Number.isFinite(value)
      ? value.toLocaleString()
      : text(value);
  if (label && shown) return `${label}: ${shown}`;
  return shown ?? label;
}

/** Sentence-case a step label without rewording it. */
function tidy(statement: string): string {
  const collapsed = statement.replace(/\s+/g, " ").trim();
  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
}

/**
 * The single evidence line for a normal question, or null.
 *
 * Order of preference, and each is a fact the candidate stated rather than a
 * claim assembled here:
 *
 *  1. the final calculation step — the one the answer is defined by;
 *  2. the reviewed scenario note — what the question is actually asking, which
 *     is the next most useful thing when a question has no arithmetic;
 *
 * and nothing else. `formula_id` is an internal identifier, `rounding_rule` is
 * a policy name, and `distractor_derivations` explains the WRONG answers — all
 * three belong to the review surface, not to a beat.
 */
export function conciseEvidence(
  explanation: FrozenExplanation | null | undefined,
): FeedbackEvidence | null {
  if (!explanation || typeof explanation !== "object") return null;

  const steps = explanation.calculation_steps;
  if (Array.isArray(steps) && steps.length > 0) {
    const statement = stepStatement(steps[steps.length - 1]);
    if (statement && statement.length <= MAX_STATEMENT_CHARS) {
      return { kind: "statement", text: tidy(statement) };
    }
  }

  const note = text(explanation.scenario_note);
  // A note is prose and can run long; an over-length one is dropped rather
  // than truncated, because a sentence cut mid-clause is worse than no
  // sentence and an ellipsis invites the player to look for the rest.
  if (note && note.length <= MAX_STATEMENT_CHARS) {
    return { kind: "statement", text: tidy(note) };
  }
  return null;
}

/**
 * The material a SECONDARY surface may offer, as one string, or null.
 *
 * Not rendered in the answer beat. This exists so the model can carry the long
 * form without the beat having to decide what to do with it — a study ledger or
 * a post-match review can show it, and the arena simply never asks.
 */
export function optionalExplanationText(
  explanation: FrozenExplanation | null | undefined,
): string | null {
  if (!explanation || typeof explanation !== "object") return null;
  const note = text(explanation.scenario_note);
  const steps = explanation.calculation_steps;
  const worked = Array.isArray(steps)
    ? steps.map(stepStatement).filter((s): s is string => s !== null)
    : [];
  const parts = [note, worked.length ? worked.join(" → ") : null].filter(
    (p): p is string => p !== null,
  );
  return parts.length ? parts.join(" · ") : null;
}
