/**
 * Content Creator — what the operator asked for, turned into a CC2 export
 * request. Pure: no React, no fetch, no DOM.
 *
 * Every vocabulary here is read from the Content Factory module that owns it
 * (formats, states, difficulty tiers, copy variants, challenge limits), and the
 * request is built by the CC2 planners (`buildExportPlan`,
 * `buildDailyPackagePlan`) — so the page cannot describe a run the engine and
 * the CLI would not produce. Rows are the backend's own review rows; nothing
 * here writes to them.
 */
import type { ReviewQuestion } from "@/lib/quiz/api";
import { adaptScreenshotQuestion } from "@/lib/quiz-screenshot/adapt";
import {
  CHALLENGE_MAX_QUESTIONS,
  CHALLENGE_MIN_QUESTIONS,
  DAILY_PREFIX_MAX,
  MID_CTA_VARIANTS,
  REPEAT_COPY_VARIANTS,
  type MidCtaVariantId,
  type RepeatVariantId,
} from "@/lib/quiz-screenshot/challenge";
import type { ContentExportRequest } from "@/lib/quiz-screenshot/contentExport";
import { DIFFICULTY_TIERS, type DifficultyTier } from "@/lib/quiz-screenshot/difficulty";
import { buildDailyPackagePlan, buildExportPlan } from "@/lib/quiz-screenshot/exportPlan";
import { getFormat } from "@/lib/quiz-screenshot/formats";
import { promptPreview } from "@/lib/quiz-screenshot/metadata";
import { evaluateContentReadiness, type ContentReadiness } from "@/lib/quiz-screenshot/readiness";
import type { StudioPlatform } from "@/lib/quiz-screenshot/studio-request";
import type { RenderQuestion, RenderState } from "@/lib/quiz-screenshot/types";

export const CREATOR_MODES = [
  "classic",
  "single-question",
  "answer-reveal",
  "multi-question",
  "daily-package",
] as const;
export type CreatorMode = (typeof CREATOR_MODES)[number];

export const MODE_COPY: Record<CreatorMode, { title: string; blurb: string; slides: string }> = {
  classic: {
    title: "Classic quiz",
    blurb: "One card per answer state for each question.",
    slides: "Question, reveal, explanation — your pick of states",
  },
  "single-question": {
    title: "Single-question post",
    blurb: "The question, then a play-in-Mogzy push.",
    slides: "Question → App CTA",
  },
  "answer-reveal": {
    title: "Answer reveal",
    blurb: "A suspense recap, the answer, then a community prompt.",
    slides: "Recap → Answer → Community",
  },
  "multi-question": {
    title: "Multi-question challenge",
    blurb: `One carousel across ${CHALLENGE_MIN_QUESTIONS}–${CHALLENGE_MAX_QUESTIONS} questions, in your order.`,
    slides: "Opening → Questions → Answers → Ending",
  },
  "daily-package": {
    title: "Daily content package",
    blurb: "Three coordinated posts: a featured single, its reveal, and a challenge.",
    slides: "Post 1 · Post 2 · Post 3",
  },
};

/** The four publishable social shapes, in the order the panel offers them. */
export const CREATOR_FORMATS: Array<{ key: string; label: string; hint: string }> = [
  { key: "mobile-social", label: "Instagram portrait", hint: "4:5 feed" },
  { key: "square", label: "Square", hint: "1:1 feed" },
  { key: "vertical", label: "Story / Reels / TikTok", hint: "9:16" },
  { key: "landscape", label: "X / Reddit", hint: "16:9" },
].filter((f) => getFormat(f.key)?.kind === "social");

export const CLASSIC_STATES: Array<{ state: RenderState; label: string }> = [
  { state: "question", label: "Question" },
  { state: "correct", label: "Reveal" },
  { state: "incorrect", label: "Wrong answer" },
  { state: "explanation", label: "Explanation" },
];

export const PLATFORMS: Array<{ id: StudioPlatform; label: string }> = [
  { id: "generic", label: "Any platform" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X" },
  { id: "reddit", label: "Reddit" },
  { id: "facebook", label: "Facebook" },
  { id: "twitch", label: "Twitch" },
];

export { DIFFICULTY_TIERS, MID_CTA_VARIANTS, REPEAT_COPY_VARIANTS };

export type CreatorSettings = {
  mode: CreatorMode;
  formats: string[];
  states: RenderState[];
  /** Run-wide badge tier; null uses each question's own content difficulty. */
  difficulty: DifficultyTier | null;
  /** Per-question badge overrides, by question id. */
  overrides: Record<string, DifficultyTier>;
  repeatVariant: RepeatVariantId | null;
  midCtaVariant: MidCtaVariantId | null;
  /** Daily package: the featured question (must be in the selection). */
  featuredId: string | null;
  reuseFeaturedAsOpener: boolean;
  /** Run name (or daily package prefix); a timestamp is used when blank. */
  runName: string;
  platform: StudioPlatform;
};

export const DEFAULT_SETTINGS: CreatorSettings = {
  mode: "single-question",
  formats: ["mobile-social"],
  states: ["question", "correct"],
  difficulty: null,
  overrides: {},
  repeatVariant: null,
  midCtaVariant: null,
  featuredId: null,
  reuseFeaturedAsOpener: true,
  runName: "",
  platform: "generic",
};

/** One selected question, as the operator ordered it. */
export type CreatorItem = { id: string; row: ReviewQuestion };

export type ItemInsight = {
  id: string;
  /** "#123 · Which item grants…" */
  label: string;
  prompt: string;
  category: string | null;
  /** The correct option's text, or null when the row cannot be rendered. */
  correctLabel: string | null;
  choiceCount: number;
  readiness: ContentReadiness;
  /** The adapted render row, or the adapter's reason it cannot render. */
  adapted: RenderQuestion | string;
  contentDifficulty: string | null;
};

export function describeItem(row: ReviewQuestion): ItemInsight {
  const adapted = adaptScreenshotQuestion(row as never);
  const prompt = row.question_text ?? "";
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    label: `#${row.id} · ${promptPreview(prompt, 60)}`,
    prompt,
    category: row.category ?? null,
    correctLabel:
      typeof adapted === "string" ? null : adapted.choices[adapted.correct_index]?.label ?? null,
    choiceCount: typeof adapted === "string" ? row.choices?.length ?? 0 : adapted.choices.length,
    readiness: evaluateContentReadiness(row as never),
    adapted,
    contentDifficulty: typeof meta.content_difficulty === "string" ? meta.content_difficulty : null,
  };
}

/** Selection limits per mode — the engine's own, stated before the operator hits them. */
export function selectionLimits(mode: CreatorMode): { min: number; max: number } {
  if (mode === "multi-question") return { min: CHALLENGE_MIN_QUESTIONS, max: CHALLENGE_MAX_QUESTIONS };
  // Daily: one featured + a challenge of 2–10 (the featured may be reused as Q1).
  if (mode === "daily-package") return { min: 2, max: CHALLENGE_MAX_QUESTIONS + 1 };
  return { min: 1, max: 25 };
}

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export type CreatorRequest = {
  request: ContentExportRequest | null;
  questions: RenderQuestion[];
  errors: string[];
  cardCount: number;
  /** The archive the run will produce. */
  zipFileName: string;
};

/**
 * Build the engine request. Never throws: everything wrong is an operator-facing
 * error, and a request is only returned when it can run as planned.
 */
export function buildCreatorRequest(
  settings: CreatorSettings,
  items: readonly CreatorItem[],
  now: Date = new Date(),
): CreatorRequest {
  const errors: string[] = [];
  const insights = items.map((item) => describeItem(item.row));
  const limits = selectionLimits(settings.mode);
  if (items.length < limits.min) {
    errors.push(`${MODE_COPY[settings.mode].title} needs at least ${limits.min} question${limits.min === 1 ? "" : "s"}.`);
  }
  if (items.length > limits.max) {
    errors.push(`${MODE_COPY[settings.mode].title} takes at most ${limits.max} questions.`);
  }
  if (settings.formats.length === 0) errors.push("Pick at least one image size.");
  if (settings.mode === "classic" && settings.states.length === 0) errors.push("Pick at least one card state.");

  const blocked = insights.filter((i) => i.readiness.blocking);
  for (const b of blocked) errors.push(`${b.label} cannot be rendered: ${b.readiness.detail || b.readiness.label}.`);
  const unusable = insights.filter((i) => typeof i.adapted === "string" && !i.readiness.blocking);
  for (const u of unusable) errors.push(`${u.label} cannot be rendered: ${u.adapted as string}.`);

  const questions = insights
    .map((i) => i.adapted)
    .filter((a): a is RenderQuestion => typeof a !== "string");
  const labels = Object.fromEntries(insights.map((i) => [i.id, i.label]));
  const ids = items.map((i) => String(i.row.id));
  const overrides = Object.fromEntries(
    Object.entries(settings.overrides).filter(([id]) => ids.includes(id)),
  ) as Record<string, DifficultyTier>;

  if (settings.mode === "daily-package") {
    const featured = settings.featuredId && ids.includes(settings.featuredId) ? settings.featuredId : null;
    if (!featured) errors.push("Choose the featured question (★) for the daily package.");
    const prefix = settings.runName.trim() || `daily-${stamp(now)}`;
    if (prefix.length > DAILY_PREFIX_MAX) errors.push(`The package name is limited to ${DAILY_PREFIX_MAX} characters.`);
    if (errors.length) return { request: null, questions, errors, cardCount: 0, zipFileName: `${prefix}-package.zip` };
    const plan = buildDailyPackagePlan({
      prefix,
      featuredQuestionId: featured!,
      challengeQuestionIds: ids.filter((id) => id !== featured),
      reuseFeaturedAsOpener: settings.reuseFeaturedAsOpener,
      repeatVariant: settings.repeatVariant,
      midCtaVariant: settings.midCtaVariant,
      formats: settings.formats,
      difficulty: settings.difficulty,
      difficultyOverrides: overrides,
      questions,
      labels,
    });
    if (plan.errors.length) return { request: null, questions, errors: plan.errors, cardCount: 0, zipFileName: plan.zipFileName };
    return { request: { kind: "daily", plan }, questions, errors: [], cardCount: plan.cardCount, zipFileName: plan.zipFileName };
  }

  const runId = settings.runName.trim() || `${settings.mode}-${stamp(now)}`;
  if (errors.length) return { request: null, questions, errors, cardCount: 0, zipFileName: `${runId}.zip` };
  const plan = buildExportPlan({
    selection: insights.map((i) => ({ id: i.id, label: i.label })),
    formats: settings.formats,
    states: settings.states,
    post: null,
    mode: settings.mode,
    runId,
    now,
    questions,
    difficulty: settings.difficulty,
    difficultyOverrides: overrides,
    challenge:
      settings.mode === "multi-question"
        ? { repeatVariant: settings.repeatVariant, midCtaVariant: settings.midCtaVariant }
        : undefined,
  });
  if (plan.errors.length) return { request: null, questions, errors: plan.errors, cardCount: 0, zipFileName: plan.zipFileName };
  return { request: { kind: "run", plan }, questions, errors: [], cardCount: plan.cards.length, zipFileName: plan.zipFileName };
}
