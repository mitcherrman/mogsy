/**
 * CC2 — the ONE expansion of a content run into ordered capture jobs.
 *
 * Extracted verbatim from `scripts/quiz-screenshots/generate.ts`
 * (`classicAndPostJobs` / `challengeJobs`) so the Playwright generator and the
 * browser export (`./exportPlan.ts`) are driven by the same function. Before
 * this module the browser plan was a second, partial specification: it knew
 * classic states and the two post types, but not the challenge carousel, not
 * the difficulty badge and not the zoom-envelope exclusions — and nothing could
 * notice the two disagreeing.
 *
 * Pure: no fs, no DOM, no fetch. Generic over the question shape so the browser
 * plan can expand a selection whose rows have not been fetched yet (only `id`
 * and `metadata` are read).
 */
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

/** The only fields the expansion reads from a question. */
export type CaptureJobQuestion = {
  id: number | string;
  metadata?: Record<string, unknown>;
};

/** One capture within a run: a classic state, a post slide, or a challenge slide. */
export type CaptureJob<Q extends CaptureJobQuestion = CaptureJobQuestion> = {
  slide: SlideKind;
  state: RenderState;
  slug: string;
  index: number;
  showDifficulty: boolean;
  /**
   * The difficulty tier this capture renders (`?difficulty=`) and records in
   * the manifest, or null for none. Resolved exactly as the generator's capture
   * loop resolved it: per-question override → run default → question metadata,
   * and only on a slide whose spec shows the badge.
   */
  difficulty: DifficultyTier | null;
  question: Q;
  /** Directory (under the run dir) this capture is written into. */
  dirSlug: string;
  fileFor: (formatKey: string) => string;
  extraParams?: Record<string, string>;
  injectAll?: boolean;
  /**
   * Whether this capture shares the zoom fitted for its question + format.
   *
   * Only classic/post QUIZ slides do, and never the `explanation` state (it is
   * genuinely taller — forcing the question's zoom onto it overflowed into the
   * QR, CON1 Step 4). Challenge slides span different questions, so each fits
   * itself; frame parity still gates the chrome.
   */
  sharesZoom: boolean;
};

export type CaptureGroup<Q extends CaptureJobQuestion = CaptureJobQuestion> = {
  dirSlug: string;
  question: Q;
  jobs: CaptureJob<Q>[];
};

export type CaptureJobsRequest = {
  states: readonly RenderState[];
  post?: PostType | null;
  multiQuestion?: {
    repeatVariant?: RepeatVariantId | null;
    midCtaVariant?: MidCtaVariantId | null;
  } | null;
  difficulty?: DifficultyTier | null;
  difficultyOverrides?: Record<string, DifficultyTier>;
};

export type CaptureJobPlan<Q extends CaptureJobQuestion = CaptureJobQuestion> = {
  groups: CaptureGroup<Q>[];
  /** Non-null for a multi-question challenge. */
  challengeSpecs: ChallengeSlideSpec[] | null;
  /** The slugs the run requested, in order (summary/metadata `states_requested`). */
  requestedSlugs: string[];
};

/** Slides that carry the brand-led end CTA rather than the quiz-family strip. */
export const END_SLIDES = new Set<string>(["app-cta", "community", "opening", "summary", "ending"]);

function runOverride(req: CaptureJobsRequest, id: number | string): string | undefined {
  return req.difficultyOverrides?.[String(id)] ?? req.difficulty ?? undefined;
}

/**
 * The tier the capture loop renders. `showDifficulty` is the spec's (already
 * question-aware) decision; this is the value the loop then resolved with the
 * per-question override, unchanged from `generate.ts`.
 */
function renderedTier<Q extends CaptureJobQuestion>(
  req: CaptureJobsRequest,
  question: Q,
  showDifficulty: boolean,
): DifficultyTier | null {
  if (!showDifficulty) return null;
  return resolveQuestionDifficulty(question.metadata, runOverride(req, question.id))?.tier ?? null;
}

function classicAndPostJobs<Q extends CaptureJobQuestion>(
  req: CaptureJobsRequest,
  question: Q,
): CaptureJob<Q>[] {
  const hasDifficulty = !!resolveQuestionDifficulty(question.metadata, runOverride(req, question.id));
  const dirSlug = questionSlug(question.id);
  if (req.post) {
    return expandPost(req.post).map((s) => {
      const showDifficulty = s.showDifficulty && hasDifficulty;
      return {
        slide: s.slideKind,
        state: s.state,
        slug: s.slug,
        index: s.index,
        showDifficulty,
        difficulty: renderedTier(req, question, showDifficulty),
        question,
        dirSlug,
        fileFor: (formatKey: string) => slideFileName(formatKey, s.index, s.slug),
        sharesZoom: s.slideKind === "quiz" && s.state !== "explanation",
      };
    });
  }
  return req.states.map((state, i) => ({
    slide: "quiz" as SlideKind,
    state,
    slug: state,
    index: i + 1,
    showDifficulty: hasDifficulty,
    difficulty: renderedTier(req, question, hasDifficulty),
    question,
    dirSlug,
    fileFor: (formatKey: string) => screenshotFileName(formatKey, state),
    sharesZoom: state !== "explanation",
  }));
}

/** Expand a multi-question challenge into capture jobs (one shared dir). */
function challengeJobs<Q extends CaptureJobQuestion>(
  req: CaptureJobsRequest,
  questions: readonly Q[],
  specs: ChallengeSlideSpec[],
): CaptureJob<Q>[] {
  const dirSlug = questionSlug("challenge");
  return specs.map((spec) => {
    // Non-quiz slides anchor on the first question (the harness needs a valid
    // ?q=); summary slides read the page's questions via qids.
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
    const override = spec.questionIndex !== undefined ? runOverride(req, question.id) : undefined;
    const showDifficulty =
      spec.showDifficulty && !!resolveQuestionDifficulty(question.metadata, override);
    return {
      slide: spec.slideKind,
      state: spec.state,
      slug: spec.slug,
      index: spec.index,
      showDifficulty,
      difficulty: renderedTier(req, question, showDifficulty),
      question,
      dirSlug,
      fileFor: (formatKey: string) => slideFileName(formatKey, spec.index, spec.slug),
      extraParams: Object.keys(extraParams).length ? extraParams : undefined,
      injectAll,
      sharesZoom: false,
    };
  });
}

/**
 * Expand a run into its ordered capture groups.
 *
 * Throws what `expandChallenge` throws (question count out of range, unknown
 * copy variant). The caller decides whether that is an exception (the CLI) or a
 * plan error the operator sees (the browser plan).
 */
export function planCaptureJobs<Q extends CaptureJobQuestion>(
  req: CaptureJobsRequest,
  questions: readonly Q[],
): CaptureJobPlan<Q> {
  const challengeSpecs = req.multiQuestion
    ? expandChallenge({
        questionCount: questions.length,
        repeatVariant: req.multiQuestion.repeatVariant ?? null,
        midCtaVariant: req.multiQuestion.midCtaVariant ?? null,
      })
    : null;

  const requestedSlugs = challengeSpecs
    ? challengeSpecs.map((s) => s.slug)
    : req.post
      ? expandPost(req.post).map((s) => s.slug)
      : [...req.states];

  const groups: CaptureGroup<Q>[] = challengeSpecs
    ? [
        {
          dirSlug: questionSlug("challenge"),
          question: questions[0],
          jobs: challengeJobs(req, questions, challengeSpecs),
        },
      ]
    : questions.map((q) => ({
        dirSlug: questionSlug(q.id),
        question: q,
        jobs: classicAndPostJobs(req, q),
      }));

  return { groups, challengeSpecs, requestedSlugs };
}
