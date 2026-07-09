/**
 * Adapter: real Mogsy quiz questions → QuizVideoData for the Remotion
 * pipeline (see ./types.ts).
 *
 * Source shape is the Quiz Review Console's ReviewQuestion
 * (src/lib/quiz/api.ts) — the only quiz read that ships the correct
 * answer + explanation inline. The public /api/quiz/playlist deliberately
 * hides answers, so it cannot feed a batch video export.
 *
 * Pure module: no fetch, no fs — consumed by both the CLI script
 * (scripts/prepare-quiz-video.ts) and unit tests.
 */
import type { QuizVideoData, QuizVideoQuestion } from "./types";

/** Structural subset of ReviewQuestion the adapter needs (duck-typed so
 *  locally exported JSON dumps work too). */
export type SourceQuestion = {
  id: number | string;
  question_text?: string | null;
  format?: string;
  category?: string;
  difficulty?: number;
  choices?: Array<string | { label?: string }>;
  correct_answer?: string | { type?: string; value?: string } | null;
  explanation?: string | null;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
};

export type SkippedQuestion = { id: number | string; reason: string };

export type AdaptResult = {
  data: QuizVideoData;
  skipped: SkippedQuestion[];
};

export type AdaptOptions = {
  title?: string;
  subtitle?: string;
  website?: string;
  patch?: string;
  /** Cap the number of questions in the video. */
  limit?: number;
};

function choiceLabel(c: string | { label?: string } | undefined): string | null {
  if (typeof c === "string") return c;
  if (c && typeof c.label === "string") return c.label;
  return null;
}

function correctValue(q: SourceQuestion): string | null {
  const ca = q.correct_answer;
  if (typeof ca === "string") return ca;
  if (ca && typeof ca === "object" && typeof ca.value === "string") return ca.value;
  // Mock/broadcast-style questions carry it in metadata instead.
  const metaAnswer = q.metadata?.correct_answer;
  return typeof metaAnswer === "string" ? metaAnswer : null;
}

function metaString(meta: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = meta?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Convert one source question; returns a string reason when unusable. */
export function adaptQuestion(q: SourceQuestion): QuizVideoQuestion | string {
  if (q.format && q.format !== "multiple_choice") return `unsupported format "${q.format}"`;
  const text = q.question_text?.trim();
  if (!text) return "missing question_text";

  const choices = (q.choices ?? []).map(choiceLabel).filter((c): c is string => Boolean(c?.trim()));
  if (choices.length < 2) return `needs at least 2 choices (got ${choices.length})`;

  const answer = correctValue(q);
  if (!answer?.trim()) return "missing correct answer";
  const correctIndex = choices.findIndex((c) => norm(c) === norm(answer));
  if (correctIndex < 0) return `correct answer "${answer}" not among choices`;

  const meta = q.metadata ?? {};
  const explanation =
    q.explanation?.trim() || metaString(meta, "explanation") || undefined;

  return {
    id: q.id,
    question: text,
    choices,
    correct_index: correctIndex,
    explanation,
    category: q.category,
    difficulty: q.difficulty,
    champion_name: metaString(meta, "champion", "champion_name"),
    item_name: metaString(meta, "item", "item_name"),
    ability_name: metaString(meta, "ability", "ability_name"),
    patch: metaString(meta, "patch", "patch_version"),
    // Verbatim passthrough: the shared broadcast ScenarioCard framework
    // classifies subjects (splash/item/combat-calc cards) from metadata.
    metadata: Object.keys(meta).length ? meta : undefined,
  };
}

/** Convert a batch of source questions into render-ready QuizVideoData. */
export function adaptQuestions(questions: SourceQuestion[], opts: AdaptOptions = {}): AdaptResult {
  const adapted: QuizVideoQuestion[] = [];
  const skipped: SkippedQuestion[] = [];

  for (const q of questions) {
    if (opts.limit !== undefined && adapted.length >= opts.limit) break;
    const result = adaptQuestion(q);
    if (typeof result === "string") skipped.push({ id: q.id, reason: result });
    else adapted.push(result);
  }

  // Video-level patch label: explicit option, else the one shared by all questions.
  const patches = new Set(adapted.map((q) => q.patch).filter(Boolean));
  const patch = opts.patch ?? (patches.size === 1 ? [...patches][0] : undefined);

  return {
    data: {
      title: opts.title ?? "Mogsy League Quiz",
      subtitle:
        opts.subtitle ??
        `${adapted.length} question${adapted.length === 1 ? "" : "s"} — how many can you get?`,
      website: opts.website ?? "mogsy.net/quiz",
      patch,
      questions: adapted,
    },
    skipped,
  };
}
