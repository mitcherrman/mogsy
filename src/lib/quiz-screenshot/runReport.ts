/**
 * CC2 — run-level reports (summary.json, manifest.json, index.html), shared by
 * the Playwright generator and the browser export.
 *
 * Moved from the tail of `runGeneration` in `scripts/quiz-screenshots/generate.ts`
 * so a browser run and a CLI run of the same selection write the same report
 * shapes. Pure: everything it needs is passed in, including the generator
 * identity, so the CLI records `quiz-screenshots-2` + its git commit and the
 * browser records its own renderer — provenance is never guessed.
 */
import type { ChallengeSlideSpec } from "./challenge";
import { SUMMARY_TITLES } from "./challenge";
import { buildContactSheet } from "./contact-sheet";
import { COPY_VARIANTS } from "./copyVariants";
import type { DifficultyTier } from "./difficulty";
import type { RunFailure } from "./finalize";
import {
  buildRunManifest,
  manifestSourceEntry,
  type ManifestSlide,
  type RunManifest,
  type StudioMode,
} from "./manifest";
import { promptPreview, type QuestionMetadata } from "./metadata";
import type { RenderQuestion, RenderState } from "./types";

export type RunReportInput = {
  runId: string;
  /** Where the run lives: an absolute dir (CLI) or the run-relative name (browser). */
  outputDir: string;
  startedAt: Date;
  finishedAt: Date;
  mode: StudioMode;
  sourceDescription: string;
  questions: readonly RenderQuestion[];
  skippedAtLoad: Array<{ id: number | string; reason: string }>;
  post: string | null;
  challengeSpecs: ChallengeSlideSpec[] | null;
  multiQuestion: { repeatVariant?: number | null; midCtaVariant?: number | null } | null;
  states: readonly RenderState[];
  requestedSlugs: readonly string[];
  formats: readonly string[];
  difficulty: DifficultyTier | null;
  difficultyOverrides: Record<string, DifficultyTier>;
  manifestSlides: ManifestSlide[];
  metadata: QuestionMetadata[];
  captureCount: number;
  failures: RunFailure[];
  warningCount: number;
  aborted: string | null;
  packageType: string | null;
  packagePrefix: string | null;
  platform: string;
  allowIncompletePresentation: boolean;
  allowMissingAssets: boolean;
  generator: { version: string; commit: string | null };
};

export type RunReports = {
  summary: Record<string, unknown>;
  manifest: RunManifest;
  contactSheetHtml: string;
};

export function buildRunReports(input: RunReportInput): RunReports {
  const challenge = input.challengeSpecs !== null;
  const summary = {
    schema_version: 1,
    run_id: input.runId,
    source: input.sourceDescription,
    post: input.post ?? (challenge ? "multi-question" : null),
    difficulty: input.difficulty ?? null,
    states_requested: [...input.requestedSlugs],
    formats_requested: [...input.formats],
    question_count: input.questions.length,
    questions_skipped_at_load: input.skippedAtLoad,
    capture_count: input.captureCount,
    success_count: input.captureCount,
    failure_count: input.failures.length,
    warning_count: input.warningCount,
    /** CON1 Step 1D — true when this run was made with the diagnostic
     *  presentation override. A run recorded true is NOT a publishable run. */
    allow_incomplete_presentation: input.allowIncompletePresentation === true,
    /** CON1 Step 1E — true when this run was made with the diagnostic asset
     *  override. Recorded separately so the summary says WHICH class of
     *  completeness was waived. A run recorded true is NOT publishable. */
    allow_missing_assets: input.allowMissingAssets === true,
    aborted: input.aborted,
    output_dir: input.outputDir,
    started_at: input.startedAt.toISOString(),
    finished_at: input.finishedAt.toISOString(),
  };

  const manifest = buildRunManifest({
    run_id: input.runId,
    created_at: input.startedAt.toISOString(),
    mode: input.mode,
    package_type: input.packageType ?? null,
    package_prefix: input.packagePrefix ?? null,
    formats: [...input.formats],
    question_ids: input.questions.map((q) => q.id),
    // CON1 Step 3B — generated sources stop losing their identity here.
    sources: input.questions.map(manifestSourceEntry),
    questions: input.questions.map((q) => ({
      id: q.id,
      prompt_preview: promptPreview(q.question_text),
      correct_label: q.choices[q.correct_index]?.label,
    })),
    states: input.post || challenge ? null : [...input.states],
    difficulty_default: input.difficulty ?? null,
    difficulty_overrides: input.difficultyOverrides ?? {},
    slides: input.manifestSlides,
    capture_count: input.captureCount,
    failure_count: input.failures.length,
    warning_count: input.warningCount,
    challenge: challenge
      ? {
          question_count: input.questions.length,
          repeat_variant: input.multiQuestion?.repeatVariant ?? null,
          mid_cta_variant: input.multiQuestion?.midCtaVariant ?? null,
          summary_title: SUMMARY_TITLES[0],
        }
      : null,
    copy_variants: COPY_VARIANTS,
    allow_incomplete_presentation: input.allowIncompletePresentation === true,
    allow_missing_assets: input.allowMissingAssets === true,
    platform: input.platform ?? "generic",
    generator: input.generator,
    completed: input.aborted === null,
  });

  const contactSheetHtml = buildContactSheet(
    {
      runId: input.runId,
      generatedAt: input.finishedAt.toISOString(),
      sourceDescription: input.sourceDescription,
      statesRequested: [...input.requestedSlugs],
      formatsRequested: [...input.formats],
      totalQuestions: input.questions.length,
      captureCount: input.captureCount,
      failureCount: input.failures.length,
      warningCount: input.warningCount,
    },
    input.metadata,
  );

  return { summary, manifest, contactSheetHtml };
}
