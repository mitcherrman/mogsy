/**
 * CON1 — what an Admin export will actually produce, decided before it runs.
 *
 * Pure module. It turns the SAME `ContentCommandConfig` the CLI line and the
 * workspace handoff are built from into an ordered list of cards, so the three
 * routes cannot describe different work. Every name it produces comes from
 * `./paths` — the Content Factory's existing filename authority — so a browser
 * export and a CLI run of the same selection land the same files under the same
 * run directory shape.
 *
 * CC2 — ONE SPECIFICATION, NOT TWO
 * The cards are no longer expanded here. They come from `planCaptureJobs`
 * (`./captureJobs.ts`), the function the Playwright generator itself now runs,
 * crossed with the formats in the generator's own order (group → slide →
 * format). So every mode the Content Studio has — classic states, both post
 * types, the multi-question challenge and (via `buildDailyPackagePlan`) the
 * daily package — exports from the browser with the generator's slide order,
 * slide kinds, difficulty badges, harness parameters and zoom-envelope rules.
 * `exportPlan.equivalence.test.ts` holds the two to each other.
 *
 * It also decides the DELIVERY, because that is what the button has to promise:
 * one card is one PNG, and anything more is a ZIP. Chrome asks the operator to
 * confirm before it will save a second file from one gesture and Safari drops
 * it outright, so a "download them all" loop is a promise the browser does not
 * keep. The label says the card count AND the container, so neither is a
 * surprise.
 */
import { getFormat } from "./formats";
import { runDirName } from "./paths";
import { isPostType, type PostType, type SlideKind } from "./content-posts";
import {
  expandDailyPackage,
  type ChallengeSlideSpec,
  type DailyPostKey,
  type MidCtaVariantId,
  type RepeatVariantId,
} from "./challenge";
import { planCaptureJobs } from "./captureJobs";
import type { DifficultyTier } from "./difficulty";
import type { StudioMode } from "./manifest";
import type { RenderQuestion, RenderState } from "./types";

/** One capture: a question, a format, and the card to show. */
export type ExportCard = {
  /** Identity of the selected row, as the harness addresses it (`?q=`). */
  questionId: string;
  /** Operator-facing identity, for progress and error reporting. */
  questionLabel: string;
  formatKey: string;
  state: RenderState;
  slide: SlideKind;
  /** 1-based position in its carousel (classic: position in the state list). */
  index: number;
  /** The slug the generator records for this card (`question`, `q03`, `answers-2`…). */
  slug: string;
  /** Run-relative directory: `question_000123`, or `question_challenge`. */
  dirSlug: string;
  /** File name inside `dirSlug`. */
  fileName: string;
  /** Difficulty tier rendered on this card (`?difficulty=`), or null. */
  difficulty: DifficultyTier | null;
  /** Extra harness parameters (challenge progress, copy variants, summary pages). */
  extraParams?: Record<string, string>;
  /** Shares the fitted zoom of its question + format (see `CaptureJob.sharesZoom`). */
  sharesZoom: boolean;
  /** Path inside the ZIP, and the basis of a single file's name. */
  zipPath: string;
  /** Name used when this card is downloaded on its own. */
  flatFileName: string;
};

export type ExportPlan = {
  runDir: string;
  cards: ExportCard[];
  /** One card downloads directly; more than one is zipped. */
  delivery: "png" | "zip";
  /** Name of the ZIP, when there is one. */
  zipFileName: string;
  /** Why no plan could be made. Non-empty means the export cannot start. */
  errors: string[];
  /** What the run is, recorded in its manifest. */
  mode: StudioMode;
  post: PostType | null;
  states: RenderState[];
  formats: string[];
  /** Ordered `?q=` ids of the run's questions. */
  questionIds: string[];
  challenge: { repeatVariant: RepeatVariantId | null; midCtaVariant: MidCtaVariantId | null } | null;
  challengeSpecs: ChallengeSlideSpec[] | null;
  /** The slugs the run requested, in order. */
  requestedSlugs: string[];
  difficulty: DifficultyTier | null;
  difficultyOverrides: Record<string, DifficultyTier>;
  packageType: string | null;
  packagePrefix: string | null;
};

export type ExportSelectionRow = {
  /** `?q=` value: the stored id, or a generated row's review key. */
  id: string;
  /** What the operator sees in progress and error copy. */
  label: string;
};

export type ExportPlanInput = {
  selection: readonly ExportSelectionRow[];
  formats: readonly string[];
  states: readonly RenderState[];
  post: PostType | null;
  /** Optional run name; a timestamp is used when absent, exactly as the CLI. */
  runId?: string;
  now?: Date;
  /**
   * CC2 — the Content Studio mode. Omitted, it is derived from `post` (a post
   * type, else `classic`), which is what every pre-CC2 caller means.
   */
  mode?: StudioMode;
  /** Challenge copy variants (multi-question only). */
  challenge?: { repeatVariant?: RepeatVariantId | null; midCtaVariant?: MidCtaVariantId | null };
  /**
   * The adapted rows, when the caller has them. Only `metadata` is read, for
   * the difficulty badge — exactly the field the generator reads. Without them
   * a card renders a badge only when a run default or override names a tier.
   */
  questions?: readonly RenderQuestion[];
  difficulty?: DifficultyTier | null;
  difficultyOverrides?: Record<string, DifficultyTier>;
  /** Daily-package membership, recorded in the manifest. */
  packageType?: string | null;
  packagePrefix?: string | null;
};

/**
 * Audit formats are deliberately not exportable from the browser.
 *
 * They are not a composition — they render the harness page as a normal
 * responsive document at a device viewport, so what they capture IS the
 * viewport. Admin's viewport is the operator's monitor, so a browser "audit
 * capture" would be a picture of the wrong device at the wrong size. The CLI
 * gives each one a real viewport; that is where they stay.
 */
export const BROWSER_EXPORTABLE_KIND = "social";

export function isBrowserExportableFormat(formatKey: string): boolean {
  return getFormat(formatKey)?.kind === BROWSER_EXPORTABLE_KIND;
}

/** The question shape the shared expansion sees for one selected row. */
type PlanQuestion = {
  /**
   * `questionSlug` zero-pads NUMERIC ids (`question_000123`) and slugifies
   * anything else. The selection carries ids as strings because that is how
   * the harness addresses them (`?q=`), so a stored id has to be handed back
   * as a number here — otherwise a browser export writes `question_123`
   * where a CLI run of the same question writes `question_000123`, and the
   * two stop being interchangeable on disk.
   */
  id: number | string;
  metadata?: Record<string, unknown>;
  row: ExportSelectionRow;
};

function resolveMode(input: ExportPlanInput, errors: string[]): StudioMode {
  const mode = input.mode ?? (input.post ?? "classic");
  if (mode === "single-question" || mode === "answer-reveal") {
    if (input.post !== null && input.post !== mode) {
      errors.push(`Mode ${mode} conflicts with post ${input.post}.`);
    }
  } else if (input.post !== null) {
    errors.push(`Mode ${mode} cannot carry a post type (${input.post}).`);
  }
  return mode;
}

/** Build the ordered card list for a selection + configuration. */
export function buildExportPlan(input: ExportPlanInput): ExportPlan {
  const errors: string[] = [];
  const { selection, formats, states } = input;
  const mode = resolveMode(input, errors);
  const post: PostType | null = isPostType(mode) ? mode : null;
  const multiQuestion = mode === "multi-question";

  if (selection.length === 0) errors.push("Select at least one question.");
  if (formats.length === 0) errors.push("Pick at least one destination.");

  const unsupported = formats.filter((key) => !isBrowserExportableFormat(key));
  if (unsupported.length > 0) {
    errors.push(
      `${unsupported.join(", ")} cannot be exported from the browser — ` +
        "it captures a device viewport, which only the local renderer can supply. " +
        "Deselect it, or use Developer tools.",
    );
  }
  if (mode === "classic" && states.length === 0) {
    errors.push("Pick at least one card.");
  }
  if (multiQuestion && new Set(selection.map((row) => row.id)).size !== selection.length) {
    errors.push("A challenge cannot use the same question twice.");
  }

  let runDir = "";
  try {
    runDir = runDirName(input.runId?.trim() ? input.runId.trim() : undefined, input.now ?? new Date());
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const byId = new Map((input.questions ?? []).map((q) => [String(q.id), q]));
  const planQuestions: PlanQuestion[] = selection.map((row) => ({
    id: /^\d+$/.test(row.id) ? Number(row.id) : row.id,
    metadata: byId.get(row.id)?.metadata,
    row,
  }));

  const challenge = multiQuestion
    ? {
        repeatVariant: input.challenge?.repeatVariant ?? null,
        midCtaVariant: input.challenge?.midCtaVariant ?? null,
      }
    : null;

  const cards: ExportCard[] = [];
  let challengeSpecs: ChallengeSlideSpec[] | null = null;
  let requestedSlugs: string[] = [];
  if (errors.length === 0) {
    try {
      const jobs = planCaptureJobs(
        {
          states,
          post,
          multiQuestion: challenge,
          difficulty: input.difficulty ?? null,
          difficultyOverrides: input.difficultyOverrides,
        },
        planQuestions,
      );
      challengeSpecs = jobs.challengeSpecs;
      requestedSlugs = jobs.requestedSlugs;
      // The generator's own loop order: group → slide → format.
      for (const group of jobs.groups) {
        for (const job of group.jobs) {
          for (const formatKey of formats) {
            const fileName = job.fileFor(formatKey);
            cards.push({
              questionId: job.question.row.id,
              questionLabel: job.question.row.label,
              formatKey,
              state: job.state,
              slide: job.slide,
              index: job.index,
              slug: job.slug,
              dirSlug: job.dirSlug,
              fileName,
              difficulty: job.difficulty,
              ...(job.extraParams ? { extraParams: { ...job.extraParams } } : {}),
              sharesZoom: job.sharesZoom,
              zipPath: `${runDir}/${job.dirSlug}/${fileName}`,
              flatFileName: `${job.dirSlug}_${fileName}`,
            });
          }
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    runDir,
    cards: errors.length === 0 ? cards : [],
    delivery: cards.length === 1 ? "png" : "zip",
    zipFileName: `${runDir}.zip`,
    errors,
    mode,
    post,
    states: [...states],
    formats: [...formats],
    questionIds: selection.map((row) => row.id),
    challenge,
    challengeSpecs,
    requestedSlugs,
    difficulty: input.difficulty ?? null,
    difficultyOverrides: { ...(input.difficultyOverrides ?? {}) },
    packageType: input.packageType ?? null,
    packagePrefix: input.packagePrefix ?? null,
  };
}

export type DailyPackagePlanInput = {
  /** Package prefix; the three runs are `<prefix>-post-1-single-question` … */
  prefix: string;
  featuredQuestionId: string;
  /** Ordered challenge questions (post 3), excluding any reused opener. */
  challengeQuestionIds: readonly string[];
  reuseFeaturedAsOpener: boolean;
  repeatVariant?: RepeatVariantId | null;
  midCtaVariant?: MidCtaVariantId | null;
  formats: readonly string[];
  difficulty?: DifficultyTier | null;
  difficultyOverrides?: Record<string, DifficultyTier>;
  questions?: readonly RenderQuestion[];
  /** Operator-facing labels by id (defaults to `#<id>`). */
  labels?: Record<string, string>;
};

export type DailyPackagePlan = {
  prefix: string;
  featuredQuestionId: string;
  reuseFeaturedAsOpener: boolean;
  posts: Array<{ key: DailyPostKey; runId: string; plan: ExportPlan }>;
  errors: string[];
  zipFileName: string;
  cardCount: number;
};

/**
 * The daily package: `expandDailyPackage` decides the three posts, and each
 * post is an ordinary plan — exactly how `runDailyPackage` composes three
 * `runGeneration` calls (including its rule that the repeated-opener copy is
 * only used when the featured question is reused as the challenge opener).
 */
export function buildDailyPackagePlan(input: DailyPackagePlanInput): DailyPackagePlan {
  const errors: string[] = [];
  let posts: ReturnType<typeof expandDailyPackage> = [];
  try {
    posts = expandDailyPackage(input.prefix, {
      featuredQuestionId: input.featuredQuestionId,
      challengeQuestionIds: [...input.challengeQuestionIds],
      reuseFeaturedAsOpener: input.reuseFeaturedAsOpener,
      repeatVariant: input.repeatVariant,
      midCtaVariant: input.midCtaVariant,
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const label = (id: string) => input.labels?.[id] ?? `#${id}`;
  const planned = posts.map((post) => ({
    key: post.key,
    runId: post.runId,
    plan: buildExportPlan({
      selection: post.questionIds.map((id) => ({ id, label: label(id) })),
      formats: input.formats,
      states: ["question", "correct"],
      post: null,
      mode: post.mode,
      runId: post.runId,
      challenge:
        post.mode === "multi-question"
          ? {
              repeatVariant: input.reuseFeaturedAsOpener ? input.repeatVariant ?? null : null,
              midCtaVariant: input.midCtaVariant ?? null,
            }
          : undefined,
      questions: input.questions,
      difficulty: input.difficulty ?? null,
      difficultyOverrides: input.difficultyOverrides,
      packageType: post.key,
      packagePrefix: input.prefix,
    }),
  }));
  for (const p of planned) errors.push(...p.plan.errors.map((e) => `${p.key}: ${e}`));

  return {
    prefix: input.prefix,
    featuredQuestionId: input.featuredQuestionId,
    reuseFeaturedAsOpener: input.reuseFeaturedAsOpener,
    posts: errors.length === 0 ? planned : [],
    errors,
    zipFileName: `${input.prefix}-package.zip`,
    cardCount: errors.length === 0 ? planned.reduce((n, p) => n + p.plan.cards.length, 0) : 0,
  };
}

/**
 * The primary button's own words.
 *
 * Derived from the plan rather than from the controls, so the button can never
 * promise a count the run will not produce.
 */
export function exportActionLabel(plan: ExportPlan): string {
  if (plan.errors.length > 0 || plan.cards.length === 0) return "Export";
  if (plan.cards.length === 1) return "Export PNG";
  return `Export ${plan.cards.length} PNGs as ZIP`;
}

/** One line describing what lands on disk, shown under the button. */
export function exportDeliveryHint(plan: ExportPlan): string {
  if (plan.cards.length === 0) return "";
  if (plan.delivery === "png") return `Downloads ${plan.cards[0].flatFileName}.`;
  return `Downloads ${plan.zipFileName}, one folder per question — the same layout a local run writes.`;
}
