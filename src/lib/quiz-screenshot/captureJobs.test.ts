/**
 * CC2 — `planCaptureJobs` IS the generator's expansion.
 *
 * `LEGACY_*` below are the pre-CC2 builders from
 * `scripts/quiz-screenshots/generate.ts` (`classicAndPostJobs`, `challengeJobs`,
 * the requested-slug rule, and the capture loop's difficulty + zoom-reuse
 * rules), copied verbatim at d809f836 so this file proves the extraction
 * changed nothing about what a Playwright run captures.
 */
import { describe, expect, it } from "vitest";
import { planCaptureJobs, type CaptureJobsRequest } from "./captureJobs";
import { expandPost, type PostType, type SlideKind } from "./content-posts";
import {
  expandChallenge,
  type ChallengeSlideSpec,
  type MidCtaVariantId,
  type RepeatVariantId,
} from "./challenge";
import { resolveQuestionDifficulty, type DifficultyTier } from "./difficulty";
import { questionSlug, screenshotFileName, slideFileName } from "./paths";
import type { RenderState } from "./types";

type Q = { id: number | string; metadata?: Record<string, unknown> };
type LegacyConfig = {
  states: RenderState[];
  post?: PostType;
  multiQuestion?: { repeatVariant?: RepeatVariantId | null; midCtaVariant?: MidCtaVariantId | null };
  difficulty?: DifficultyTier;
  difficultyOverrides?: Record<string, DifficultyTier>;
};
type LegacyJob = {
  slide: SlideKind;
  state: RenderState;
  slug: string;
  index: number;
  showDifficulty: boolean;
  question: Q;
  dirSlug: string;
  fileFor: (formatKey: string) => string;
  extraParams?: Record<string, string>;
  injectAll?: boolean;
};

// ── verbatim legacy (generate.ts @ d809f836) ─────────────────────────────────
function LEGACY_classicAndPostJobs(config: LegacyConfig, question: Q): LegacyJob[] {
  const override = config.difficultyOverrides?.[String(question.id)] ?? config.difficulty;
  const hasDifficulty = !!resolveQuestionDifficulty(question.metadata, override);
  const dirSlug = questionSlug(question.id);
  if (config.post) {
    return expandPost(config.post).map((s) => ({
      slide: s.slideKind,
      state: s.state,
      slug: s.slug,
      index: s.index,
      showDifficulty: s.showDifficulty && hasDifficulty,
      question,
      dirSlug,
      fileFor: (formatKey: string) => slideFileName(formatKey, s.index, s.slug),
    }));
  }
  return config.states.map((state, i) => ({
    slide: "quiz" as SlideKind,
    state,
    slug: state,
    index: i + 1,
    showDifficulty: hasDifficulty,
    question,
    dirSlug,
    fileFor: (formatKey: string) => screenshotFileName(formatKey, state),
  }));
}

function LEGACY_challengeJobs(config: LegacyConfig, questions: Q[], specs: ChallengeSlideSpec[]): LegacyJob[] {
  const dirSlug = questionSlug("challenge");
  return specs.map((spec) => {
    const question =
      spec.questionIndex !== undefined ? questions[spec.questionIndex] : questions[0];
    const extraParams: Record<string, string> = {};
    let injectAll = false;
    if (spec.progress) {
      extraParams.progress = `${spec.progress.number}of${spec.progress.total}`;
      if (spec.repeatVariant) extraParams.repeat = String(spec.repeatVariant);
      if (spec.midCtaVariant) extraParams.mid = String(spec.midCtaVariant);
    }
    if (spec.summary) {
      const pageQuestions = questions.slice(
        spec.summary.startIndex,
        spec.summary.startIndex + spec.summary.count,
      );
      extraParams.qids = pageQuestions.map((q) => String(q.id)).join(",");
      extraParams.sumStart = String(spec.summary.startIndex);
      extraParams.sumPage = String(spec.summary.page);
      extraParams.sumPages = String(spec.summary.pageCount);
      injectAll = true;
    }
    const override =
      spec.questionIndex !== undefined
        ? config.difficultyOverrides?.[String(question.id)] ?? config.difficulty
        : undefined;
    const hasDifficulty =
      spec.showDifficulty && !!resolveQuestionDifficulty(question.metadata, override);
    return {
      slide: spec.slideKind,
      state: spec.state,
      slug: spec.slug,
      index: spec.index,
      showDifficulty: hasDifficulty,
      question,
      dirSlug,
      fileFor: (formatKey: string) => slideFileName(formatKey, spec.index, spec.slug),
      extraParams: Object.keys(extraParams).length ? extraParams : undefined,
      injectAll,
    };
  });
}

/** The capture loop's per-job rules, verbatim. */
function LEGACY_loop(config: LegacyConfig, job: LegacyJob, challenge: boolean) {
  const override = config.difficultyOverrides?.[String(job.question.id)] ?? config.difficulty;
  const difficultyInfo = resolveQuestionDifficulty(job.question.metadata, override);
  return {
    difficulty: job.showDifficulty ? difficultyInfo?.tier ?? null : null,
    reusesScale: !challenge && job.slide === "quiz" && job.state !== "explanation",
  };
}

function LEGACY_plan(config: LegacyConfig, questions: Q[]) {
  const challengeSpecs = config.multiQuestion
    ? expandChallenge({
        questionCount: questions.length,
        repeatVariant: config.multiQuestion.repeatVariant ?? null,
        midCtaVariant: config.multiQuestion.midCtaVariant ?? null,
      })
    : null;
  const requestedSlugs = challengeSpecs
    ? challengeSpecs.map((s) => s.slug)
    : config.post
      ? expandPost(config.post).map((s) => s.slug)
      : config.states;
  const groups = challengeSpecs
    ? [{ dirSlug: questionSlug("challenge"), question: questions[0], jobs: LEGACY_challengeJobs(config, questions, challengeSpecs) }]
    : questions.map((q) => ({ dirSlug: questionSlug(q.id), question: q, jobs: LEGACY_classicAndPostJobs(config, q) }));
  return { groups, requestedSlugs, challenge: !!challengeSpecs };
}
// ─────────────────────────────────────────────────────────────────────────────

const FORMATS = ["mobile-social", "vertical", "square", "landscape"];

function questions(n: number, withMeta = true): Q[] {
  const tiers = ["iron", "gold", "diamond", undefined];
  return Array.from({ length: n }, (_, i) => ({
    id: i % 3 === 2 ? `review:key/${i}` : 100 + i,
    metadata: withMeta && tiers[i % 4] ? { content_difficulty: tiers[i % 4] } : undefined,
  }));
}

function project(config: LegacyConfig, qs: Q[]) {
  const legacy = LEGACY_plan(config, qs);
  const req: CaptureJobsRequest = {
    states: config.states,
    post: config.post ?? null,
    multiQuestion: config.multiQuestion ?? null,
    difficulty: config.difficulty ?? null,
    difficultyOverrides: config.difficultyOverrides,
  };
  const shared = planCaptureJobs(req, qs);
  const flatLegacy = legacy.groups.flatMap((g) =>
    g.jobs.map((j) => ({
      dirSlug: g.dirSlug,
      groupQuestion: g.question.id,
      slide: j.slide,
      state: j.state,
      slug: j.slug,
      index: j.index,
      showDifficulty: j.showDifficulty,
      question: j.question.id,
      files: FORMATS.map((f) => j.fileFor(f)),
      extraParams: j.extraParams,
      injectAll: j.injectAll ?? false,
      difficulty: LEGACY_loop(config, j, legacy.challenge).difficulty,
      sharesZoom: LEGACY_loop(config, j, legacy.challenge).reusesScale,
    })),
  );
  const flatShared = shared.groups.flatMap((g) =>
    g.jobs.map((j) => ({
      dirSlug: g.dirSlug,
      groupQuestion: g.question.id,
      slide: j.slide,
      state: j.state,
      slug: j.slug,
      index: j.index,
      showDifficulty: j.showDifficulty,
      question: j.question.id,
      files: FORMATS.map((f) => j.fileFor(f)),
      extraParams: j.extraParams,
      injectAll: j.injectAll ?? false,
      difficulty: j.difficulty,
      sharesZoom: j.sharesZoom,
    })),
  );
  return { legacy, shared, flatLegacy, flatShared };
}

const CONFIGS: Array<[string, LegacyConfig, number]> = [
  ["classic question+correct", { states: ["question", "correct"] }, 3],
  ["classic every state", { states: ["question", "selected", "correct", "incorrect", "explanation"] }, 2],
  ["classic + run difficulty", { states: ["question", "correct"], difficulty: "diamond" }, 4],
  ["classic + overrides", { states: ["question"], difficultyOverrides: { "101": "iron", "review:key/2": "gold" } }, 3],
  ["single-question post", { states: ["question", "correct"], post: "single-question" }, 3],
  ["answer-reveal post", { states: ["question", "correct"], post: "answer-reveal" }, 4],
  ["answer-reveal + run difficulty", { states: [], post: "answer-reveal", difficulty: "gold" }, 2],
  ["challenge of 2", { states: [], multiQuestion: {} }, 2],
  ["challenge of 5 + both variants", { states: [], multiQuestion: { repeatVariant: 1, midCtaVariant: 1 } }, 5],
  ["challenge of 7 (two answer pages)", { states: [], multiQuestion: { repeatVariant: 2 } }, 7],
  ["challenge of 10 + overrides", { states: [], multiQuestion: { midCtaVariant: 1 }, difficultyOverrides: { "100": "diamond" } }, 10],
];

describe("planCaptureJobs reproduces the pre-CC2 generator expansion", () => {
  for (const [name, config, n] of CONFIGS) {
    it(name, () => {
      const { legacy, shared, flatLegacy, flatShared } = project(config, questions(n));
      expect(shared.requestedSlugs).toEqual([...legacy.requestedSlugs]);
      expect(shared.groups.map((g) => g.dirSlug)).toEqual(legacy.groups.map((g) => g.dirSlug));
      expect(flatShared).toEqual(flatLegacy);
      expect(shared.challengeSpecs !== null).toBe(legacy.challenge);
    });
  }

  it("rejects what expandChallenge rejects", () => {
    expect(() => planCaptureJobs({ states: [], multiQuestion: {} }, questions(1))).toThrow(/2-10/);
    expect(() => planCaptureJobs({ states: [], multiQuestion: {} }, questions(11))).toThrow(/2-10/);
  });

  it("explanation never shares the zoom; challenge slides never do", () => {
    const classic = planCaptureJobs({ states: ["question", "explanation", "correct"] }, questions(1));
    expect(classic.groups[0].jobs.map((j) => [j.state, j.sharesZoom])).toEqual([
      ["question", true],
      ["explanation", false],
      ["correct", true],
    ]);
    const challenge = planCaptureJobs({ states: [], multiQuestion: {} }, questions(3));
    expect(challenge.groups[0].jobs.every((j) => j.sharesZoom === false)).toBe(true);
  });
});
