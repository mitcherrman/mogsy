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
import {
  questionSlug,
  runDirName,
  screenshotFileName,
  slideFileName,
} from "../../src/lib/quiz-screenshot/paths";
import { expandPost, type SlideKind } from "../../src/lib/quiz-screenshot/content-posts";
import {
  expandChallenge,
  expandDailyPackage,
  SUMMARY_TITLES,
  type ChallengeSlideSpec,
  type MidCtaVariantId,
  type RepeatVariantId,
} from "../../src/lib/quiz-screenshot/challenge";
import {
  resolveQuestionDifficulty,
} from "../../src/lib/quiz-screenshot/difficulty";
import type { DifficultyTier } from "../../src/lib/quiz-screenshot/difficulty";
import type { RenderQuestion, RenderState } from "../../src/lib/quiz-screenshot/types";
import {
  buildQuestionMetadata,
  promptPreview,
  type CaptureRecord,
  type QaFinding,
  type QuestionMetadata,
} from "../../src/lib/quiz-screenshot/metadata";
import {
  buildRunManifest,
  type ManifestSlide,
  type RunManifest,
  type StudioMode,
} from "../../src/lib/quiz-screenshot/manifest";
import { buildContactSheet } from "../../src/lib/quiz-screenshot/contact-sheet";
import type { RunFailure } from "../../src/lib/quiz-screenshot/finalize";
import { loadQuestions } from "./source";
import { ensureServer } from "./server";
import { captureOne, launchBrowser, type CaptureLayout } from "./capture";

export const GENERATOR_VERSION = "quiz-screenshots-2";

/** Copy variants currently wired into the slide components (recorded in the
 *  manifest for reproducibility — changing slide copy should bump these). */
export const COPY_VARIANTS: Record<string, string> = {
  question_cta: "comment-abcd-v1",
  app_cta: "prove-it-v2",
  community: "stack-up-v2",
  challenge_opening: "test-your-knowledge-v1",
  challenge_ending: "how-did-you-do-v1",
};

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
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452 /* "IHDR" */) {
    throw new Error("Not a valid PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
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

/** One capture within a run: a classic state, a post slide, or a challenge slide. */
type CaptureJob = {
  slide: SlideKind;
  state: RenderState;
  slug: string;
  index: number;
  showDifficulty: boolean;
  question: RenderQuestion;
  /** Directory (under the run dir) this capture is written into. */
  dirSlug: string;
  fileFor: (formatKey: string) => string;
  extraParams?: Record<string, string>;
  injectAll?: boolean;
};

function classicAndPostJobs(
  config: GenerationRequest,
  question: RenderQuestion,
): CaptureJob[] {
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

/** Expand a multi-question challenge into capture jobs (one shared dir). */
function challengeJobs(
  config: GenerationRequest,
  questions: RenderQuestion[],
  specs: ChallengeSlideSpec[],
): CaptureJob[] {
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

const END_SLIDES = new Set<string>(["app-cta", "community", "opening", "summary", "ending"]);

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
  let challengeSpecs: ChallengeSlideSpec[] | null = null;
  if (config.multiQuestion) {
    if (config.source.mode === "question-id" && questions.length !== config.source.ids.length) {
      throw new Error(
        `Challenge needs every requested question; ${config.source.ids.length - questions.length} were unusable — see skipped list.`,
      );
    }
    challengeSpecs = expandChallenge({
      questionCount: questions.length,
      repeatVariant: config.multiQuestion.repeatVariant ?? null,
      midCtaVariant: config.multiQuestion.midCtaVariant ?? null,
    });
  }

  const requestedSlugs = challengeSpecs
    ? challengeSpecs.map((s) => s.slug)
    : config.post
      ? expandPost(config.post).map((s) => s.slug)
      : config.states;

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

  // Job groups: per-question groups (classic/post) or one challenge group.
  const groups: Array<{ dirSlug: string; question: RenderQuestion; jobs: CaptureJob[] }> =
    challengeSpecs
      ? [
          {
            dirSlug: questionSlug("challenge"),
            question: questions[0],
            jobs: challengeJobs(config, questions, challengeSpecs),
          },
        ]
      : questions.map((q) => ({
          dirSlug: questionSlug(q.id),
          question: q,
          jobs: classicAndPostJobs(config, q),
        }));

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
      const layoutsByFormat = new Map<string, Map<string, { layout: CaptureLayout; slide: SlideKind }>>();
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

        const override =
          config.difficultyOverrides?.[String(job.question.id)] ?? config.difficulty;
        const difficultyInfo = resolveQuestionDifficulty(job.question.metadata, override);

        for (const format of config.formats) {
          const file = job.fileFor(format.key);
          // Reuse the fitted zoom only for quiz slides of the SAME question +
          // format, so the classic question/correct pair stays pixel-stable.
          const reuseScale =
            !challengeSpecs && job.slide === "quiz" ? scaleByFormat.get(format.key) : undefined;
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
              difficulty: job.showDifficulty ? difficultyInfo?.tier : undefined,
              injectQuestions: job.injectAll || challengeSpecs ? questions : undefined,
              extraParams: job.extraParams,
            });
            if (
              !challengeSpecs &&
              job.slide === "quiz" &&
              !scaleByFormat.has(format.key) &&
              usedScale !== null
            ) {
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
              ...(job.showDifficulty && difficultyInfo ? { difficulty: difficultyInfo.tier } : {}),
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

      // ── Geometry-stability gates ─────────────────────────────────────────
      emit("qa", "  Running geometry-stability gates...");
      for (const [formatKey, byJob] of layoutsByFormat) {
        const cmp = (
          a: CaptureLayout,
          b: CaptureLayout,
          parts: readonly string[],
          label: string,
        ) => {
          for (const part of parts) {
            const ra = (a as Record<string, CaptureLayout[keyof CaptureLayout]>)[part] ?? null;
            const rb = (b as Record<string, CaptureLayout[keyof CaptureLayout]>)[part] ?? null;
            if (ra === null && rb === null) continue;
            const same =
              !!ra && !!rb &&
              Math.abs(ra.x - rb.x) <= 1 && Math.abs(ra.y - rb.y) <= 1 &&
              Math.abs(ra.w - rb.w) <= 1 && Math.abs(ra.h - rb.h) <= 1;
            if (!same) {
              runFailures.push({
                question_id: group.question.id,
                format: formatKey,
                state: label,
                classification: "layout-shift",
                message: `${part} geometry differs (${label}): ${JSON.stringify(ra)} vs ${JSON.stringify(rb)}`,
              });
            }
          }
        };

        if (config.post || challengeSpecs) {
          // Carousel: the phone frame chrome (deterministic per format) must
          // be identical across every slide; card/result vary with content.
          // The top CTA has two deliberate variants — full strip on
          // quiz-family slides, larger brand wordmark on end slides — so CTA
          // geometry is gated WITHIN each family, not across them.
          const entries = [...byJob.entries()];
          const [firstSlug, first] = entries[0] ?? [];
          const ctaRefByFamily = new Map<string, CaptureLayout>();
          if (firstSlug && first) {
            ctaRefByFamily.set(END_SLIDES.has(first.slide) ? "end" : "quiz", first.layout);
          }
          for (let i = 1; i < entries.length; i++) {
            const [slugB, b] = entries[i];
            if (first) {
              cmp(first.layout, b.layout, ["phone", "screen", "island", "qr", "scan"], `frame:${slugB}`);
            }
            const family = END_SLIDES.has(b.slide) ? "end" : "quiz";
            const ctaRef = ctaRefByFamily.get(family);
            if (ctaRef) cmp(ctaRef, b.layout, ["cta"], `cta:${slugB}`);
            else ctaRefByFamily.set(family, b.layout);
          }
          emit("qa", `  ◻ ${formatKey} post frame parity across ${entries.length} slide(s)`);
        } else {
          // Classic: the question and correct states of the SAME card must be
          // pixel-identical everywhere (≤1px) — the core anti-drift guarantee.
          const a = byJob.get("question");
          const b = byJob.get("correct");
          if (a && b) {
            cmp(
              a.layout,
              b.layout,
              ["card", "cta", "qr", "phone", "screen", "island", "scan", "resultArea"],
              "correct",
            );
            emit(
              "qa",
              `  ◻ ${formatKey} layout parity — phone ${JSON.stringify(a.layout.phone)} | ` +
                `screen ${JSON.stringify(a.layout.screen)} | island ${JSON.stringify(a.layout.island)} | ` +
                `cta ${JSON.stringify(a.layout.cta)} | card ${JSON.stringify(a.layout.card)} | ` +
                `result ${JSON.stringify(a.layout.resultArea)} | qr ${JSON.stringify(a.layout.qr)} | ` +
                `scan ${JSON.stringify(a.layout.scan)}`,
            );
          }
        }
      }

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
  emit("finalize", "Writing run reports + manifest...");
  const finishedAt = new Date();
  const summary = {
    schema_version: 1,
    run_id: runId,
    source: sourceDescription,
    post: config.post ?? (challengeSpecs ? "multi-question" : null),
    difficulty: config.difficulty ?? null,
    states_requested: requestedSlugs,
    formats_requested: config.formats.map((f) => f.key),
    question_count: questions.length,
    questions_skipped_at_load: skipped,
    capture_count: captureCount,
    success_count: captureCount,
    failure_count: runFailures.length,
    warning_count: warningCount,
    aborted: captureError
      ? String(captureError instanceof Error ? captureError.message : captureError)
      : null,
    output_dir: runDir,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
  };

  const manifest = buildRunManifest({
    run_id: runId,
    created_at: startedAt.toISOString(),
    mode,
    package_type: config.packageType ?? null,
    package_prefix: config.packagePrefix ?? null,
    formats: config.formats.map((f) => f.key),
    question_ids: questions.map((q) => q.id),
    questions: questions.map((q) => ({
      id: q.id,
      prompt_preview: promptPreview(q.question_text),
      correct_label: q.choices[q.correct_index]?.label,
    })),
    states: config.post || challengeSpecs ? null : config.states,
    difficulty_default: config.difficulty ?? null,
    difficulty_overrides: config.difficultyOverrides ?? {},
    slides: manifestSlides,
    capture_count: captureCount,
    failure_count: runFailures.length,
    warning_count: warningCount,
    challenge: challengeSpecs
      ? {
          question_count: questions.length,
          repeat_variant: config.multiQuestion?.repeatVariant ?? null,
          mid_cta_variant: config.multiQuestion?.midCtaVariant ?? null,
          summary_title: SUMMARY_TITLES[0],
        }
      : null,
    copy_variants: COPY_VARIANTS,
    platform: config.platform ?? "generic",
    generator: { version: GENERATOR_VERSION, commit: await gitCommit() },
    completed: !captureError,
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
  attempt(
    "index.html",
    buildContactSheet(
      {
        runId,
        generatedAt: finishedAt.toISOString(),
        sourceDescription,
        statesRequested: requestedSlugs,
        formatsRequested: config.formats.map((f) => f.key),
        totalQuestions: questions.length,
        captureCount,
        failureCount: runFailures.length,
        warningCount,
      },
      allMetadata,
    ),
  );

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
    aborted: summary.aborted,
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
