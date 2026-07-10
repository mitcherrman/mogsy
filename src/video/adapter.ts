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
  /** Top-level asset path (e.g. "assets/items/3161.png") — the live
   *  classifySubject's final subject fallback. */
  image_path?: string | null;
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

/**
 * Normalize legacy metadata into the KOS `assets.subject` shape the broadcast
 * ScenarioCard framework selects on.
 *
 * Newer generator batches ship metadata.assets.subject (and the live
 * broadcast renders its rich Item Analysis / champion / ability cards from
 * it), but several categories still carry only legacy fields — item_name +
 * asset_path/image_path (Item Costs, Item Recognition), spell_name
 * (Summoner Spells), rune_name (Runes). The live classifySubject has
 * fallbacks for some of these; synthesizing the subject here lets the SAME
 * shared cards render their designed variants (e.g. the Item Analysis card
 * with the cost pill) instead of degrading to placeholder/monogram tiles.
 *
 * Never overwrites an existing assets.subject. Spoiler gating is unaffected:
 * isSpoilerSubject sees the same label/choices relationship the live
 * broadcast sees when its data is rich.
 */
export function normalizeSubjectMetadata(
  meta: Record<string, unknown>,
  imagePath?: string | null,
): Record<string, unknown> {
  const assets = (meta.assets ?? {}) as Record<string, unknown>;
  if (assets.subject && typeof assets.subject === "object") return meta;

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v : undefined;
  const iconFallback = str(meta.asset_path) ?? str(imagePath);

  let subject: Record<string, unknown> | undefined;
  if (str(meta.item_name)) {
    const itemId = typeof meta.item_id === "number" ? meta.item_id : undefined;
    const icon = iconFallback ?? (itemId !== undefined ? `assets/items/${itemId}.png` : undefined);
    subject = { type: "item", id: itemId, name: meta.item_name, icon };
  } else if (str(meta.spell_name)) {
    subject = { type: "spell", name: meta.spell_name, slot: str(meta.spell_key), icon: iconFallback };
  } else if (str(meta.rune_name)) {
    subject = { type: "rune", name: meta.rune_name, icon: iconFallback };
  }

  if (!subject) return meta;
  return { ...meta, assets: { ...assets, subject } };
}

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
    // Passthrough for the shared broadcast ScenarioCard framework, with
    // legacy icon fields normalized into assets.subject (see above).
    metadata: Object.keys(meta).length ? normalizeSubjectMetadata(meta, q.image_path) : undefined,
    // Live classifySubject's final fallback — must survive adaptation.
    image_path: q.image_path ?? undefined,
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
