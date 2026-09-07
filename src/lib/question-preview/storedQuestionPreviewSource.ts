/**
 * Stored review row → public-question preview payload (CON1 Step 1B). PURE.
 *
 * Admin Quiz Review holds STORED questions; the preview subtree was built for
 * RANKED CANDIDATES, which arrive from an endpoint as a public-question
 * payload. A stored row is the same question in a different envelope, so the
 * only thing missing was the envelope — not a second preview, not a second
 * adapter, and above all not a second premise or layout rule.
 *
 * This module writes that envelope and nothing else. Everything downstream is
 * the production path, untouched:
 *
 *   ReviewQuestion
 *     -> storedQuestionPreviewPayload   (this file: SHAPE only)
 *     -> readPublicQuestion             (transport normalization + safety)
 *     -> scenarioSourceFromPublicQuestion / questionViewFromPublicQuestion
 *     -> selectFamilyLayout -> the production scenario band
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * `presentation` is copied from the row's `presentation` field and from
 * NOWHERE else. The row also carries raw `metadata` — complete, with solution
 * fields — because the operator surface needs it. Reading that blob here, even
 * as a "fallback", would rebuild in TypeScript the safety projection the
 * backend already owns and would leak answers into a player-facing surface the
 * first time a family's contract narrowed. A row with no `presentation` has no
 * safe premise; it previews as text, which is the correct, honest result.
 */

import type { ReviewQuestion } from "@/lib/quiz/api";

/**
 * The minimum a stored row must be for this envelope to be written from it.
 *
 * CON1 Step 1C widened the parameter from `ReviewQuestion` to this structural
 * shape so the Content Factory render harness — whose `RenderQuestion` is the
 * same stored question in the harness's own envelope — goes through THIS
 * function rather than growing a third mapping beside it. `ReviewQuestion`
 * satisfies it unchanged; nothing about the payload written below moved.
 *
 * `presentation` is part of the shape and `metadata` deliberately is not:
 * this function has no way to read a premise out of the raw blob because it
 * is never handed one.
 */
export interface StoredPreviewRow {
  id: number | string;
  question_text?: string | null;
  category?: string | null;
  choices?: readonly unknown[];
  presentation?: Record<string, unknown> | null;
}

/** Module identity the static preview can render end to end. */
const STORED_MODULE_ID = "quiz";

/** Minimum options for a multiple-choice question to be worth previewing. */
const MIN_OPTIONS = 2;

/** A choice is either a bare string or a labelled object; both mean one label. */
function choiceLabel(choice: unknown): string {
  if (typeof choice === "string") return choice;
  if (choice && typeof choice === "object" && !Array.isArray(choice)) {
    const label = (choice as Record<string, unknown>).label;
    if (typeof label === "string") return label;
  }
  return "";
}

/**
 * The option labels of a stored row, in order — the SINGLE definition the
 * payload and the correct-index helper both read, so an empty or malformed
 * choice cannot shift the answer index away from the option it labels.
 */
function optionLabelsOf(row: StoredPreviewRow): string[] {
  return (Array.isArray(row.choices) ? row.choices : [])
    .map(choiceLabel)
    .filter((label) => label.trim() !== "");
}

/**
 * The public-question payload for one stored row, or `null` when the row is
 * not a previewable multiple-choice question.
 *
 * `null` rather than a half-payload: a stored row with no prompt or a single
 * option cannot be shown "as a player would see it", and rendering an empty
 * surface would claim otherwise.
 */
export function storedQuestionPreviewPayload(
  row: StoredPreviewRow | null | undefined,
): Record<string, unknown> | null {
  if (!row) return null;

  const prompt = (row.question_text ?? "").trim();
  if (!prompt) return null;

  const options = optionLabelsOf(row);
  if (options.length < MIN_OPTIONS) return null;

  const payload: Record<string, unknown> = {
    question_id: String(row.id),
    prompt,
    options,
    category: row.category ?? null,
    module_id: STORED_MODULE_ID,
  };

  // The safe premise, and only when the backend produced one. Omitted — not
  // nulled with a metadata substitute — otherwise.
  if (row.presentation && typeof row.presentation === "object") {
    payload.presentation = row.presentation;
  }

  return payload;
}

/**
 * Index of the correct option, for the preview's Reveal state, taken from the
 * admin row the caller already holds.
 *
 * The preview payload deliberately carries no answer. `null` when the stored
 * answer text matches no option — a real defect the bank audit reports — so
 * Reveal is simply unavailable rather than highlighting option 0 as correct.
 */
export function storedCorrectOptionIndex(
  row: ReviewQuestion | null | undefined,
): number | null {
  if (!row) return null;
  const answer = (row.correct_answer?.value ?? "").trim().toLowerCase();
  if (!answer) return null;
  const index = optionLabelsOf(row).findIndex((label) => label.trim().toLowerCase() === answer);
  return index >= 0 ? index : null;
}
