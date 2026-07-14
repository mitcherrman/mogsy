/**
 * Adapter: ReviewQuestion-shaped source data (the Quiz Review Console
 * endpoint, a local JSON dump, or repo fixtures) → RenderQuestion for the
 * screenshot harness.
 *
 * Mirrors src/video/adapter.ts but preserves choice image objects, which the
 * video pipeline flattens to strings. Pure module: no fetch, no fs.
 */
import type { RenderChoice, RenderQuestion } from "./types";

export type ScreenshotSourceQuestion = {
  id: number | string;
  question_text?: string | null;
  format?: string;
  category?: string;
  difficulty?: number;
  choices?: Array<string | { label?: string; image_path?: string }>;
  correct_answer?: string | { type?: string; value?: string } | null;
  /** Pre-resolved index — wins over correct_answer when valid. */
  correct_index?: number;
  explanation?: string | null;
  metadata?: Record<string, unknown>;
  image_path?: string | null;
};

export type SkippedSource = { id: number | string; reason: string };

const norm = (s: string) => s.trim().toLowerCase();

function toChoice(c: string | { label?: string; image_path?: string }): RenderChoice | null {
  if (typeof c === "string") return c.trim() ? { label: c } : null;
  if (c && typeof c.label === "string" && c.label.trim()) {
    return { label: c.label, image_path: typeof c.image_path === "string" ? c.image_path : undefined };
  }
  return null;
}

function correctValue(q: ScreenshotSourceQuestion): string | null {
  const ca = q.correct_answer;
  if (typeof ca === "string") return ca;
  if (ca && typeof ca === "object" && typeof ca.value === "string") return ca.value;
  const metaAnswer = q.metadata?.correct_answer;
  return typeof metaAnswer === "string" ? metaAnswer : null;
}

/** Convert one source question; returns a string reason when unusable. */
export function adaptScreenshotQuestion(q: ScreenshotSourceQuestion): RenderQuestion | string {
  if (q.format && q.format !== "multiple_choice") return `unsupported format "${q.format}"`;
  const text = q.question_text?.trim();
  if (!text) return "missing question_text";

  const choices = (q.choices ?? []).map(toChoice).filter((c): c is RenderChoice => c !== null);
  if (choices.length < 2) return `needs at least 2 choices (got ${choices.length})`;

  let correctIndex = -1;
  if (
    typeof q.correct_index === "number" &&
    Number.isInteger(q.correct_index) &&
    q.correct_index >= 0 &&
    q.correct_index < choices.length
  ) {
    correctIndex = q.correct_index;
  } else {
    const answer = correctValue(q);
    if (!answer?.trim()) return "missing correct answer";
    correctIndex = choices.findIndex((c) => norm(c.label) === norm(answer));
    if (correctIndex < 0) return `correct answer "${answer}" not among choices`;
  }

  const meta = q.metadata ?? {};
  const metaExplanation = typeof meta.explanation === "string" ? meta.explanation : undefined;
  const explanation = q.explanation?.trim() || metaExplanation?.trim() || undefined;

  return {
    id: q.id,
    question_text: text,
    choices,
    correct_index: correctIndex,
    explanation,
    category: q.category,
    difficulty: q.difficulty,
    image_path: q.image_path ?? undefined,
    metadata: Object.keys(meta).length ? meta : undefined,
  };
}

export function adaptScreenshotQuestions(
  questions: ScreenshotSourceQuestion[],
  limit?: number,
): { adapted: RenderQuestion[]; skipped: SkippedSource[] } {
  const adapted: RenderQuestion[] = [];
  const skipped: SkippedSource[] = [];
  for (const q of questions) {
    if (limit !== undefined && adapted.length >= limit) break;
    const result = adaptScreenshotQuestion(q);
    if (typeof result === "string") skipped.push({ id: q.id, reason: result });
    else adapted.push(result);
  }
  return { adapted, skipped };
}
