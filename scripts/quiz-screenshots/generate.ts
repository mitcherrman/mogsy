/**
 * Shared generation service — the single screenshot engine behind both the
 * CLI (scripts/quiz-screenshots/index.ts) and the local Content Studio server
 * (scripts/content-studio). Extracted from the CLI runner so there is exactly
 * ONE implementation of question loading, slide expansion, capture, QA,
 * parity gates, reports, and manifests.
 *
 * Modes:
 *   classic          — state-driven screenshots per question (unchanged)
 *   single-question  — 2-slide post per question (unchanged)
 *   answer-reveal    — 3-slide post per question (unchanged)
 *   multi-question   — ONE challenge carousel across the ordered questions
 *   daily package    — three coordinated runs (post-1/2/3) via runDailyPackage
 *
 * No secrets ever reach reports/manifests: config.adminKey is consumed by
 * source.ts for the backend fetch and never serialized.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import type { ScreenshotCliConfig } from "../../src/lib/quiz-screenshot/cli";
import { resolveAnswerPlan } from "../../src/lib/quiz-screenshot/states";
import { runDirName } from "../../src/lib/quiz-screenshot/paths";
import {
  expandDailyPackage,
  type MidCtaVariantId,
  type RepeatVariantId,
} from "../../src/lib/quiz-screenshot/challenge";
import type { DifficultyTier } from "../../src/lib/quiz-screenshot/difficulty";
import type { RenderQuestion, RenderState } from "../../src/lib/quiz-screenshot/types";
import {
  buildQuestionMetadata,
  type CaptureRecord,
  type QaFinding,
  type QuestionMetadata,
} from "../../src/lib/quiz-screenshot/metadata";
import type { ManifestSlide, RunManifest, StudioMode } from "../../src/lib/quiz-screenshot/manifest";
import type { RunFailure } from "../../src/lib/quiz-screenshot/finalize";
import { planCaptureJobs } from "../../src/lib/quiz-screenshot/captureJobs";
import { evaluateLayoutStability, type LayoutsByFormat } from "../../src/lib/quiz-screenshot/layoutGates";
import { buildRunReports } from "../../src/lib/quiz-screenshot/runReport";
import { pngDimensionsFromBytes } from "../../src/lib/quiz-screenshot/pngInfo";
import { loadQuestions } from "./source";
import { ensureServer } from "./server";
import { captureOne, launchBrowser } from "./capture";

export const GENERATOR_VERSION = "quiz-screenshots-2";

/** Copy variants recorded in every manifest — one table, shared with the
 *  browser export (src/lib/quiz-screenshot/copyVariants.ts). */
export { COPY_VARIANTS } from "../../src/lib/quiz-screenshot/copyVariants";

export type GenerationRequest = ScreenshotCliConfig & {
  /** Multi-question challenge mode: ONE carousel across all questions. */
  multiQuestion?: {
    repeatVariant?: RepeatVariantId | null;
    midCtaVariant?: MidCtaVariantId | null;
  };
  /** Per-question difficulty overrides (question id → tier). Precedence:
   *  override → run-level config.difficulty → question metadata → none. */
  difficultyOverrides?: Record<string, DifficultyTier>;
  /** Daily-package membership recorded in the manifest. */
  packageType?: string | null;
  packagePrefix?: string | null;
  /** CTA wording context; "generic" for MVP (recorded, not yet branching). */
  platform?: string;
};

export type ProgressEvent = { phase: string; message: string };
export type GenerationHooks = {
  /** Structured progress (studio job log). */
  onProgress?: (e: ProgressEvent) => void;
  /** Plain log line sink (CLI console). Defaults to console.log. */
  log?: (msg: string) => void;
  /** Register spawned resources (vite server, browser) with an external
   *  cleanup registry so CLI signal handlers can tear them down. */
  registerCleanup?: (name: string, fn: () => Promise<void> | void) => void;
};

export type GenerationResult = {
  runId: string;
  runDir: string;
  captureCount: number;
  failureCount: number;
  warningCount: number;
  failures: RunFailure[];
  skippedAtLoad: Array<{ id: number | string; reason: string }>;
  aborted: string | null;
  reportsOk: boolean;
  manifest: RunManifest;
};

/** Read width/height straight from the PNG IHDR header. */
export function pngDimensions(buf: Buffer): { width: number; height: number } {
  return pngDimensionsFromBytes(buf);
}

/** Resolve + guard the run directory inside the export root. */
export function resolveRunDir(outRoot: string, runId: string): string {
  const runDir = resolve(join(outRoot, "runs", runId));
  const exportRootAbs = resolve(outRoot);
  if (!runDir.startsWith(exportRootAbs)) {
    throw new Error(`Run directory ${runDir} escapes the export root — refusing`);
  }
  return runDir;
}

function gitCommit(): Promise<string | null> {
  return new Promise((res) => {
    execFile("git", ["rev-parse", "--short", "HEAD"], { timeout: 5000 }, (err, stdout) => {
      res(err ? null : stdout.trim() || null);
    });
  });
}

// CC2 — capture-job expansion lives in src/lib/quiz-screenshot/captureJobs.ts,
// shared with the browser export so the two cannot describe different runs.

export function studioModeOf(config: GenerationRequest): StudioMode {
  if (config.multiQuestion) return "multi-question";
  if (config.post) return config.post;
  return "classic";
}

/**
 * Execute one generation run end-to-end. Behavior for classic and post modes
 * is the extracted CLI behavior, unchanged: same filenames, per-question
 * metadata.json, parity gates, summary.json / failures.json / index.html.
 * Adds: multi-question challenge runs and a run-root manifest.json.
 */
export async function runGeneration(
  config: GenerationRequest,
  hooks: GenerationHooks = {},
): Promise<GenerationResult> {
  const log = hooks.log ?? ((m: string) => console.log(m));
  const emit = (phase: string, message: string) => {
    hooks.onProgress?.({ phase, message });
    log(message);
  };

  const startedAt = new Date();
  const mode = studioModeOf(config);

  emit("load", "Loading questions...");
  const { questions, skipped, sourceDescription } = await loadQuestions(config);
  if (skipped.length) {
    emit("load", `Skipped ${skipped.length} unusable question(s):`);
    for (const s of skipped) emit("load", `  - #${s.id}: ${s.reason}`);
  }
  if (!questions.length) throw new Error("No usable questions — nothing to capture.");

  // Multi-question runs must keep the requested order and need every question.
  if (config.multiQuestion) {
    if (config.source.mode === "question-id" && questions.length !== config.source.ids.length) {
      throw new Error(
        `Challenge needs every requested question; ${config.source.ids.length - questions.length} were unusable — see skipped list.`,
      );
    }
  }

  // The ONE expansion (src/lib/quiz-screenshot/captureJobs.ts) — the browser
  // export plans with the same function.
  const { groups, challengeSpecs, requestedSlugs } = planCaptureJobs(
    {
      states: config.states,
      post: config.post ?? null,
      multiQuestion: config.multiQuestion ?? null,
      difficulty: config.difficulty ?? null,
      difficultyOverrides: config.difficultyOverrides,
    },
    questions,
  );

  emit("plan", `Rendering ${questions.length} question(s) from ${sourceDescription}`);
  if (challengeSpecs) {
    emit("plan", `Challenge slides: ${requestedSlugs.join(", ")}`);
  } else if (config.post) {
    emit("plan", `Post: ${config.post} → slides: ${requestedSlugs.join(", ")}`);
  } else {
    emit("plan", `States: ${config.states.join(", ")}`);
  }
  if (config.difficulty) emit("plan", `Difficulty override: ${config.difficulty}`);
  emit("plan", `Formats: ${config.formats.map((f) => f.key).join(", ")}`);

  // ── Run directory (refuses to overwrite unless asked) ────────────────────
  const runId = runDirName(config.runId, startedAt);
  const runDir = resolveRunDir(config.outRoot, runId);
  if (existsSync(runDir)) {
    if (!config.overwrite) {
      throw new Error(`Run directory already exists: ${runDir}\nPass overwrite to replace it.`);
    }
    rmSync(runDir, { recursive: true, force: true });
  }
  mkdirSync(runDir, { recursive: true });

  emit("server", "Ensuring render server...");
  const server = await ensureServer(config.baseUrl);
  hooks.registerCleanup?.("vite-server", () => server.stop());
  const browser = await launchBrowser();
  hooks.registerCleanup?.("browser", () => browser.close());

  const allMetadata: QuestionMetadata[] = [];
  const runFailures: RunFailure[] = [];
  const manifestSlides: ManifestSlide[] = [];
  let captureCount = 0;
  let warningCount = 0;
  let captureError: unknown = null;

  const totalCaptures = groups.reduce((n, g) => n + g.jobs.length, 0) * config.formats.length;
  let doneCaptures = 0;

  try {
    for (const group of groups) {
      const qDir = join(runDir, group.dirSlug);
      mkdirSync(qDir, { recursive: true });
      emit(
        "capture",
        challengeSpecs
          ? `\nchallenge — ${questions.length} question(s), ${group.jobs.length} slide(s)`
          : `\n${group.dirSlug} — ${group.question.question_text.slice(0, 70)}`,
      );

      const screenshots: CaptureRecord[] = [];
      const statesSkipped: Array<{ state: string; reason: string }> = [];
      const warnings: QaFinding[] = [];
      const overflow: QaFinding[] = [];
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];
      const missingAssets: string[] = [];
      // format key -> job slug -> {layout, slide}, for the stability gates.
      const layoutsByFormat: LayoutsByFormat = new Map();
      // One state-independent zoom per (format) for the classic/post
      // question-correct pair of a SINGLE question. Challenge slides span
      // different questions, so each fits independently (frame parity still
      // gates the chrome).
      const scaleByFormat = new Map<string, number>();

      for (const job of group.jobs) {
        // Plan quiz/recap slides (recap forces the unanswered state); other
        // content slides carry no answer plan.
        let expected: { selectedIndex: number | null; showExplanation: boolean } = {
          selectedIndex: null,
          showExplanation: false,
        };
        if (job.slide === "quiz" || job.slide === "recap") {
          const planState: RenderState = job.slide === "recap" ? "question" : job.state;
          try {
            const plan = resolveAnswerPlan(job.question, planState, config.answerIndex);
            if (plan.kind === "skip") {
              statesSkipped.push({ state: job.slug, reason: plan.reason });
              emit("capture", `  ~ ${job.slug}: skipped (${plan.reason})`);
              continue;
            }
            expected = plan.plan;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            runFailures.push({
              question_id: job.question.id,
              format: null,
              state: job.slug,
              classification: "invalid-state-for-question",
              message: msg,
            });
            emit("capture", `  ✗ ${job.slug}: ${msg}`);
            continue;
          }
        }

        for (const format of config.formats) {
          const file = job.fileFor(format.key);
          // Reuse the fitted zoom only for quiz slides of the SAME question +
          // format, so the classic question/correct pair stays pixel-stable.
          //
          // CON1 Step 4 — EXCEPT the explanation state, which is excluded in
          // both directions (it neither takes the shared zoom nor sets it).
          //
          // The reserved result area gives question/selected/correct/incorrect
          // one identical card height, which is what makes forcing one zoom
          // across them correct. `explanation` is the one state that genuinely
          // is taller: it prints the rationale paragraph. Forcing the question
          // state's zoom onto it did not shrink it to fit — it overflowed, and
          // before this change EVERY explanation capture in EVERY format failed
          // `cta-overlap`, with the card sitting on top of the QR. The
          // explanation is its own publishable card (see the handoff's Part 7),
          // so it fits itself; the parity pair is unaffected because the gate
          // compares question against correct, and neither is this state.
          const reuseScale = job.sharesZoom ? scaleByFormat.get(format.key) : undefined;
          try {
            const { png, qa, layout, usedScale } = await captureOne({
              browser,
              baseUrl: server.baseUrl,
              question: job.question,
              state: job.state,
              format,
              answerIndex: config.answerIndex,
              expectedSelectedIndex: expected.selectedIndex,
              expectExplanation: expected.showExplanation,
              forcedScale: reuseScale,
              slide: job.slide,
              difficulty: job.difficulty ?? undefined,
              injectQuestions: job.injectAll || challengeSpecs ? questions : undefined,
              extraParams: job.extraParams,
              allowIncompletePresentation: config.allowIncompletePresentation === true,
              allowMissingAssets: config.allowMissingAssets === true,
            });
            if (job.sharesZoom && !scaleByFormat.has(format.key) && usedScale !== null) {
              scaleByFormat.set(format.key, usedScale);
            }
            writeFileSync(join(qDir, file), png);
            const dims = pngDimensions(png);
            screenshots.push({ format: format.key, state: job.slug as RenderState, file, ...dims });
            captureCount++;
            doneCaptures++;
            if (!layoutsByFormat.has(format.key)) layoutsByFormat.set(format.key, new Map());
            layoutsByFormat.get(format.key)!.set(job.slug, { layout, slide: job.slide });

            manifestSlides.push({
              index: job.index,
              slide_kind: job.slide,
              slug: job.slug,
              state: job.state,
              format: format.key,
              file: `${group.dirSlug}/${file}`,
              ...(job.slide === "quiz" || job.slide === "recap"
                ? { question_id: job.question.id }
                : {}),
              width: dims.width,
              height: dims.height,
              ...(job.difficulty ? { difficulty: job.difficulty } : {}),
            });

            consoleErrors.push(...qa.consoleErrors);
            pageErrors.push(...qa.pageErrors);
            failedRequests.push(...qa.failedRequests);
            missingAssets.push(...qa.missingAssets);
            overflow.push(...qa.overflowFindings);
            warnings.push(...qa.warnings);
            warningCount += qa.warnings.length;
            for (const f of qa.failures) {
              runFailures.push({
                question_id: job.question.id,
                question_key: job.question.question_key ?? null,
                format: format.key,
                state: job.slug,
                classification: f.code,
                message: f.message,
                screenshot: `${group.dirSlug}/${file}`,
              });
            }
            const flag = qa.failures.length ? "✗" : qa.warnings.length ? "!" : "✓";
            emit(
              "capture",
              `  ${flag} ${format.key} ${job.slug} (${dims.width}×${dims.height}) [${doneCaptures}/${totalCaptures}]`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            runFailures.push({
              question_id: job.question.id,
              format: format.key,
              state: job.slug,
              classification: "capture-error",
              message: msg.slice(0, 500),
            });
            emit("capture", `  ✗ ${format.key} ${job.slug}: ${msg.slice(0, 200)}`);
          }
        }
      }

      // ── Geometry-stability gates (shared with the browser export) ────────
      emit("qa", "  Running geometry-stability gates...");
      const stability = evaluateLayoutStability({
        layoutsByFormat,
        carousel: !!(config.post || challengeSpecs),
        questionId: group.question.id,
      });
      runFailures.push(...stability.failures);
      for (const note of stability.notes) emit("qa", note);

      // ── Per-group metadata.json (challenge uses a synthetic group id) ───
      const metaQuestion: RenderQuestion = challengeSpecs
        ? {
            id: "challenge",
            question_text: `Multi-question challenge: ${questions.length} questions — ${group.question.question_text}`,
            choices: group.question.choices,
            correct_index: group.question.correct_index,
            category: group.question.category,
          }
        : group.question;
      const metadata = buildQuestionMetadata({
        question: metaQuestion,
        sourceMode: config.source.mode,
        statesRequested: requestedSlugs,
        formatsRequested: config.formats.map((f) => f.key),
        screenshots,
        statesSkipped,
        warnings,
        consoleErrors: [...new Set(consoleErrors)],
        pageErrors: [...new Set(pageErrors)],
        failedRequests: [...new Set(failedRequests)],
        missingAssets: [...new Set(missingAssets)],
        overflowFindings: overflow,
        generatedAt: new Date().toISOString(),
      });
      writeFileSync(join(qDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
      allMetadata.push(metadata);
    }
  } catch (err) {
    captureError = err;
    emit(
      "error",
      `\nCapture aborted: ${err instanceof Error ? err.stack ?? err.message : err}`,
    );
  }

  // ── Run-level reports (before teardown) ───────────────────────────────────
  // Assembled by the shared builder (src/lib/quiz-screenshot/runReport.ts), so
  // a browser run writes the same report shapes.
  emit("finalize", "Writing run reports + manifest...");
  const finishedAt = new Date();
  const { summary, manifest, contactSheetHtml } = buildRunReports({
    runId,
    outputDir: runDir,
    startedAt,
    finishedAt,
    mode,
    sourceDescription,
    questions,
    skippedAtLoad: skipped,
    post: config.post ?? null,
    challengeSpecs,
    multiQuestion: config.multiQuestion ?? null,
    states: config.states,
    requestedSlugs,
    formats: config.formats.map((f) => f.key),
    difficulty: config.difficulty ?? null,
    difficultyOverrides: config.difficultyOverrides ?? {},
    manifestSlides,
    metadata: allMetadata,
    captureCount,
    failures: runFailures,
    warningCount,
    aborted: captureError
      ? String(captureError instanceof Error ? captureError.message : captureError)
      : null,
    packageType: config.packageType ?? null,
    packagePrefix: config.packagePrefix ?? null,
    platform: config.platform ?? "generic",
    allowIncompletePresentation: config.allowIncompletePresentation === true,
    allowMissingAssets: config.allowMissingAssets === true,
    generator: { version: GENERATOR_VERSION, commit: await gitCommit() },
  });

  let reportsOk = true;
  const attempt = (file: string, content: string) => {
    try {
      writeFileSync(join(runDir, file), content, "utf8");
    } catch (err) {
      reportsOk = false;
      emit("error", `Failed to write ${file}: ${err instanceof Error ? err.message : err}`);
    }
  };
  attempt("summary.json", JSON.stringify(summary, null, 2));
  attempt("failures.json", JSON.stringify(runFailures, null, 2));
  attempt("manifest.json", JSON.stringify(manifest, null, 2));
  attempt("index.html", contactSheetHtml);

  // ── Teardown ──────────────────────────────────────────────────────────────
  emit("teardown", "Stopping browser/server...");
  try {
    await browser.close();
  } catch {
    /* already gone */
  }
  await server.stop();

  emit(
    "done",
    `Run ${runId}: ${captureCount} capture(s), ${runFailures.length} failure(s), ${warningCount} warning(s)${captureError ? " — ABORTED EARLY" : ""}`,
  );

  return {
    runId,
    runDir,
    captureCount,
    failureCount: runFailures.length,
    warningCount,
    failures: runFailures,
    skippedAtLoad: skipped,
    aborted: summary.aborted as string | null,
    reportsOk,
    manifest,
  };
}

// ── Daily package ───────────────────────────────────────────────────────────

export type DailyPackageRequest = {
  runPrefix: string;
  featuredQuestionId: string;
  challengeQuestionIds: string[];
  reuseFeaturedAsOpener: boolean;
  repeatVariant?: RepeatVariantId | null;
  midCtaVariant?: MidCtaVariantId | null;
  difficulty?: DifficultyTier;
  difficultyOverrides?: Record<string, DifficultyTier>;
  formats: ScreenshotCliConfig["formats"];
  outRoot: string;
  overwrite: boolean;
  baseUrl?: string;
  api?: string;
  adminKey?: string;
  platform?: string;
};

export type DailyPackageResult = {
  prefix: string;
  posts: Array<{ key: string; runId: string; result: GenerationResult }>;
  packageManifestPath: string;
};

/**
 * Generate the three coordinated daily posts. One render server is shared
 * across all three runs; run ids are `<prefix>-<postKey>`; a package manifest
 * is written to runs/<prefix>-package.json listing the child runs.
 */
export async function runDailyPackage(
  req: DailyPackageRequest,
  hooks: GenerationHooks = {},
): Promise<DailyPackageResult> {
  const log = hooks.log ?? ((m: string) => console.log(m));
  const emit = (phase: string, message: string) => {
    hooks.onProgress?.({ phase, message });
    log(message);
  };

  const posts = expandDailyPackage(req.runPrefix, {
    featuredQuestionId: req.featuredQuestionId,
    challengeQuestionIds: req.challengeQuestionIds,
    reuseFeaturedAsOpener: req.reuseFeaturedAsOpener,
    repeatVariant: req.repeatVariant,
    midCtaVariant: req.midCtaVariant,
  });

  emit("package", `Daily package "${req.runPrefix}": ${posts.map((p) => p.key).join(", ")}`);
  // One shared render server for all three child runs.
  const server = await ensureServer(req.baseUrl);
  const results: DailyPackageResult["posts"] = [];
  try {
    for (const post of posts) {
      emit("package", `\n── ${post.key} ──`);
      const base: GenerationRequest = {
        source: { mode: "question-id", ids: post.questionIds },
        states: ["question", "correct"],
        formats: req.formats,
        post: post.mode === "multi-question" ? undefined : post.mode,
        multiQuestion:
          post.mode === "multi-question"
            ? {
                repeatVariant: req.reuseFeaturedAsOpener ? req.repeatVariant ?? null : null,
                midCtaVariant: req.midCtaVariant ?? null,
              }
            : undefined,
        difficulty: req.difficulty,
        difficultyOverrides: req.difficultyOverrides,
        outRoot: req.outRoot,
        runId: post.runId,
        overwrite: req.overwrite,
        baseUrl: server.baseUrl,
        allowRemote: false,
        // The daily package publishes; it never enables the diagnostic
        // override. Explicit, so an incomplete presentation cannot slip into a
        // package run because someone widened a shared default.
        allowIncompletePresentation: false,
        // Same rule for the asset override, and stated separately so widening
        // one can never silently widen the other.
        allowMissingAssets: false,
        api: req.api,
        adminKey: req.adminKey,
        packageType: post.key,
        packagePrefix: req.runPrefix,
        platform: req.platform,
      };
      const result = await runGeneration(base, hooks);
      results.push({ key: post.key, runId: post.runId, result });
    }
  } finally {
    await server.stop();
  }

  const packageManifest = {
    schema_version: 1,
    package_prefix: req.runPrefix,
    created_at: new Date().toISOString(),
    featured_question_id: req.featuredQuestionId,
    reuse_featured_as_opener: req.reuseFeaturedAsOpener,
    posts: results.map((r) => ({
      key: r.key,
      run_id: r.runId,
      capture_count: r.result.captureCount,
      failure_count: r.result.failureCount,
      warning_count: r.result.warningCount,
    })),
  };
  const packageManifestPath = join(
    resolve(req.outRoot, "runs"),
    `${req.runPrefix}-package.json`,
  );
  writeFileSync(packageManifestPath, JSON.stringify(packageManifest, null, 2), "utf8");
  emit("done", `Daily package complete → ${packageManifestPath}`);
  return { prefix: req.runPrefix, posts: results, packageManifestPath };
}
