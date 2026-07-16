/**
 * Multi-question challenge expansion + daily-package model. Pure module —
 * shared by the generation service, the render harness, the Content Studio
 * server, and unit tests.
 *
 * A challenge is one ordered carousel spanning N questions:
 *
 *   1 opening slide
 *   + N question slides ("QUESTION i OF n" / "LOCK IN YOUR ANSWER")
 *   + 1..k answer-summary slides (paginated blueprint of correct answers)
 *   + 1 ending slide ("HOW DID YOU DO?")
 *
 * All copy variants live here as fixed, approved configuration — no free-text
 * prose generation, no invented handles, no random difficulty.
 */
import type { RenderState } from "./types";
import type { SlideKind } from "./content-posts";

export const CHALLENGE_MIN_QUESTIONS = 2;
export const CHALLENGE_MAX_QUESTIONS = 10;
export const CHALLENGE_DEFAULT_QUESTIONS = 5;

/** Max answer rows per summary slide — keeps rows legible at 1080×1350.
 *  More questions paginate onto additional numbered summary slides. */
export const SUMMARY_ROWS_PER_SLIDE = 6;

/** Approved repeated-opener copy variants (shown on challenge Q1 when the
 *  featured single-question post is reused as the opener). Never reveals the
 *  answer. */
export const REPEAT_COPY_VARIANTS = [
  { id: 1, line1: "Already answered this one?", line2: "Keep your original answer." },
  { id: 2, line1: "Already answered this one?", line2: "Are you sure it was right?" },
] as const;
export type RepeatVariantId = (typeof REPEAT_COPY_VARIANTS)[number]["id"];

/** Approved optional mid-challenge CTA lines (disabled by default). Rendered
 *  as one small secondary line on the midpoint question slide only. */
export const MID_CTA_VARIANTS = [
  { id: 1, text: "Follow for more League challenges." },
  { id: 2, text: "Think you can beat other players? Keep going." },
  { id: 3, text: "Halfway there. Lock in your score." },
] as const;
export type MidCtaVariantId = (typeof MID_CTA_VARIANTS)[number]["id"];

/** Approved summary titles; index 0 is the default. */
export const SUMMARY_TITLES = ["TODAY'S ANSWERS", "ANSWER CHECK"] as const;

export function isRepeatVariantId(v: unknown): v is RepeatVariantId {
  return v === 1 || v === 2;
}
export function isMidCtaVariantId(v: unknown): v is MidCtaVariantId {
  return v === 1 || v === 2 || v === 3;
}
export function repeatCopy(id: RepeatVariantId) {
  return REPEAT_COPY_VARIANTS.find((v) => v.id === id)!;
}
export function midCtaCopy(id: MidCtaVariantId) {
  return MID_CTA_VARIANTS.find((v) => v.id === id)!;
}

export type ChallengeOptions = {
  /** Number of questions (CHALLENGE_MIN..CHALLENGE_MAX). */
  questionCount: number;
  /** Repeated-opener copy on question 1; null/undefined = no repeat copy. */
  repeatVariant?: RepeatVariantId | null;
  /** Optional mid-challenge CTA (midpoint question slide); default disabled. */
  midCtaVariant?: MidCtaVariantId | null;
  /** Summary title index into SUMMARY_TITLES (default 0). */
  summaryTitleIndex?: 0 | 1;
};

export type ChallengeSlideSpec = {
  /** 1-based position in the carousel. */
  index: number;
  slideKind: SlideKind;
  state: RenderState;
  /** Filename slug: opening | q01.. | answers[-N] | ending. */
  slug: string;
  showDifficulty: boolean;
  /** 0-based index into the ordered challenge question list (quiz slides). */
  questionIndex?: number;
  /** Visible progress ("QUESTION number OF total") on quiz slides. */
  progress?: { number: number; total: number };
  /** Repeated-opener copy variant (only on question 1 when configured). */
  repeatVariant?: RepeatVariantId;
  /** Mid-challenge CTA variant (only on the midpoint question slide). */
  midCtaVariant?: MidCtaVariantId;
  /** Summary pagination (summary slides only). */
  summary?: { page: number; pageCount: number; startIndex: number; count: number };
};

/** Paginate N answer rows into summary slides of SUMMARY_ROWS_PER_SLIDE. */
export function summaryPages(
  questionCount: number,
): Array<{ page: number; pageCount: number; startIndex: number; count: number }> {
  const pageCount = Math.max(1, Math.ceil(questionCount / SUMMARY_ROWS_PER_SLIDE));
  const pages = [];
  for (let p = 0; p < pageCount; p++) {
    const startIndex = p * SUMMARY_ROWS_PER_SLIDE;
    pages.push({
      page: p + 1,
      pageCount,
      startIndex,
      count: Math.min(SUMMARY_ROWS_PER_SLIDE, questionCount - startIndex),
    });
  }
  return pages;
}

export function assertChallengeCount(count: number): void {
  if (
    !Number.isInteger(count) ||
    count < CHALLENGE_MIN_QUESTIONS ||
    count > CHALLENGE_MAX_QUESTIONS
  ) {
    throw new Error(
      `Challenge question count must be an integer ${CHALLENGE_MIN_QUESTIONS}-${CHALLENGE_MAX_QUESTIONS} (got ${count})`,
    );
  }
}

/** Expand a challenge into its ordered slide specs. */
export function expandChallenge(opts: ChallengeOptions): ChallengeSlideSpec[] {
  assertChallengeCount(opts.questionCount);
  if (opts.repeatVariant != null && !isRepeatVariantId(opts.repeatVariant)) {
    throw new Error(`Unknown repeat copy variant ${opts.repeatVariant}`);
  }
  if (opts.midCtaVariant != null && !isMidCtaVariantId(opts.midCtaVariant)) {
    throw new Error(`Unknown mid-challenge CTA variant ${opts.midCtaVariant}`);
  }
  const n = opts.questionCount;
  // Midpoint question (1-based): ceil(n/2) — e.g. Q3 of 5.
  const midpoint = Math.ceil(n / 2);
  const slides: ChallengeSlideSpec[] = [];
  let index = 1;

  slides.push({
    index: index++,
    slideKind: "opening",
    state: "question",
    slug: "opening",
    showDifficulty: false,
  });

  for (let i = 0; i < n; i++) {
    const num = i + 1;
    slides.push({
      index: index++,
      slideKind: "quiz",
      state: "question",
      slug: `q${String(num).padStart(2, "0")}`,
      showDifficulty: true,
      questionIndex: i,
      progress: { number: num, total: n },
      ...(num === 1 && opts.repeatVariant ? { repeatVariant: opts.repeatVariant } : {}),
      ...(num === midpoint && opts.midCtaVariant ? { midCtaVariant: opts.midCtaVariant } : {}),
    });
  }

  const pages = summaryPages(n);
  for (const page of pages) {
    slides.push({
      index: index++,
      slideKind: "summary",
      state: "question",
      slug: pages.length === 1 ? "answers" : `answers-${page.page}`,
      showDifficulty: false,
      summary: page,
    });
  }

  slides.push({
    index: index++,
    slideKind: "ending",
    state: "question",
    slug: "ending",
    showDifficulty: false,
  });

  return slides;
}

// ── Daily package ───────────────────────────────────────────────────────────

export const DAILY_POST_KEYS = [
  "post-1-single-question",
  "post-2-answer-reveal",
  "post-3-multi-question",
] as const;
export type DailyPostKey = (typeof DAILY_POST_KEYS)[number];

export type DailyPackageOptions = {
  /** The featured question (posts 1 + 2). */
  featuredQuestionId: string;
  /** Ordered challenge questions (post 3), excluding any reused opener. */
  challengeQuestionIds: string[];
  /** Reuse the featured question as challenge Question 1. */
  reuseFeaturedAsOpener: boolean;
  repeatVariant?: RepeatVariantId | null;
  midCtaVariant?: MidCtaVariantId | null;
};

export type DailyPackagePost = {
  key: DailyPostKey;
  runId: string;
  mode: "single-question" | "answer-reveal" | "multi-question";
  /** Ordered question ids for this post. */
  questionIds: string[];
};

/** Longest run-id suffix is "-post-1-single-question" (23 chars); run ids are
 *  capped at 64, so package prefixes are capped accordingly. */
export const DAILY_PREFIX_MAX = 64 - "-post-1-single-question".length;

/**
 * Expand a daily package into its three coordinated post runs. Deterministic
 * run ids: `<prefix>-<postKey>`. The challenge question list is
 * [featured, ...challengeQuestionIds] when reuse is enabled.
 */
export function expandDailyPackage(
  runPrefix: string,
  opts: DailyPackageOptions,
): DailyPackagePost[] {
  if (!/^[A-Za-z0-9][A-Za-z0-9-_]*$/.test(runPrefix) || runPrefix.length > DAILY_PREFIX_MAX) {
    throw new Error(
      `Invalid package run prefix "${runPrefix}" — 1-${DAILY_PREFIX_MAX} letters, digits, hyphens, underscores`,
    );
  }
  if (!opts.featuredQuestionId) throw new Error("Daily package needs a featured question");
  const challengeIds = opts.reuseFeaturedAsOpener
    ? [opts.featuredQuestionId, ...opts.challengeQuestionIds]
    : [...opts.challengeQuestionIds];
  assertChallengeCount(challengeIds.length);
  if (new Set(challengeIds).size !== challengeIds.length) {
    throw new Error("Daily package challenge question list contains duplicates");
  }
  return [
    {
      key: "post-1-single-question",
      runId: `${runPrefix}-post-1-single-question`,
      mode: "single-question",
      questionIds: [opts.featuredQuestionId],
    },
    {
      key: "post-2-answer-reveal",
      runId: `${runPrefix}-post-2-answer-reveal`,
      mode: "answer-reveal",
      questionIds: [opts.featuredQuestionId],
    },
    {
      key: "post-3-multi-question",
      runId: `${runPrefix}-post-3-multi-question`,
      mode: "multi-question",
      questionIds: challengeIds,
    },
  ];
}
