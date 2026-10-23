/**
 * CC2 — turn a browser export into a complete, honest run: ordered PNGs,
 * per-group metadata.json, summary.json, failures.json, manifest.json and the
 * index.html contact sheet, in the SAME directory layout a Playwright run
 * writes under `quiz_content_exports/runs/`.
 *
 * Nothing here decides what a card looks like or whether it passed QA — the
 * runner (`./runBrowserExport.ts`) did that with the shared gates. This module
 * only REPORTS, through the same builders the CLI uses (`./runReport.ts`,
 * `./layoutGates.ts`, `./metadata.ts`), and never reports a failed capture as
 * a success:
 *   - only captured cards appear in `manifest.slides`;
 *   - every failed card, every failing QA finding and every layout-shift is a
 *     row in failures.json and counts toward `failure_count`;
 *   - a PNG whose real IHDR size is not its format's size is a failure;
 *   - the run status is `failed` if anything failed, nothing was captured, or
 *     the run was aborted.
 *
 * DOM-free apart from `Blob`, so it is unit-tested in jsdom.
 */
import JSZip from "jszip";
import type { ExportPlan } from "./exportPlan";
import type { RunFailure } from "./finalize";
import { getFormat } from "./formats";
import { evaluateLayoutStability, type LayoutsByFormat } from "./layoutGates";
import type { ManifestSlide, RunManifest } from "./manifest";
import { buildQuestionMetadata, type CaptureRecord, type QaFinding, type QuestionMetadata } from "./metadata";
import { pngDimensionsFromBytes } from "./pngInfo";
import { buildRunReports } from "./runReport";
import type { ExportCardOutcome, ExportRunResult } from "./runBrowserExport";
import type { RenderQuestion, RenderState } from "./types";

/** Recorded as `manifest.generator.version` for every browser-made run. */
export const BROWSER_GENERATOR_VERSION = "browser-export-1";

export type BrowserRunStatus = "succeeded" | "succeeded-with-warnings" | "failed";

export type BrowserRunReport = {
  runId: string;
  status: BrowserRunStatus;
  manifest: RunManifest;
  summary: Record<string, unknown>;
  failures: RunFailure[];
  metadata: QuestionMetadata[];
  contactSheetHtml: string;
  /** Captured PNGs only, in canonical order, at their run-relative paths. */
  images: Array<{ path: string; blob: Blob; width: number; height: number }>;
  counts: { planned: number; captured: number; skipped: number; failed: number; warnings: number };
};

async function blobBytes(blob: Blob, length?: number): Promise<Uint8Array> {
  const part = length ? blob.slice(0, length) : blob;
  if (typeof part.arrayBuffer === "function") return new Uint8Array(await part.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("could not read blob"));
    reader.readAsArrayBuffer(part);
  });
}

function questionFor(
  outcome: ExportCardOutcome,
  byId: Map<string, RenderQuestion>,
): RenderQuestion | undefined {
  return byId.get(String(outcome.card.questionId));
}

/** The id a report should carry: the question's own (numeric for a stored row). */
function reportId(outcome: ExportCardOutcome, byId: Map<string, RenderQuestion>): number | string {
  return questionFor(outcome, byId)?.id ?? outcome.card.questionId;
}

export async function buildBrowserRunReport(args: {
  plan: ExportPlan;
  run: ExportRunResult;
  /** Every question the plan references, adapted (the runner's own input). */
  questions: readonly RenderQuestion[];
  sourceDescription?: string;
  platform?: string;
  /** Build commit, when the host knows it; never guessed. */
  commit?: string | null;
}): Promise<BrowserRunReport> {
  const { plan, run } = args;
  const byId = new Map(args.questions.map((q) => [String(q.id), q]));
  const failures: RunFailure[] = [];
  const manifestSlides: ManifestSlide[] = [];
  const images: BrowserRunReport["images"] = [];
  let warningCount = 0;

  type GroupAcc = {
    dirSlug: string;
    anchorId: string;
    screenshots: CaptureRecord[];
    statesSkipped: Array<{ state: string; reason: string }>;
    warnings: QaFinding[];
    overflow: QaFinding[];
    missingAssets: string[];
    layoutsByFormat: LayoutsByFormat;
  };
  const groups = new Map<string, GroupAcc>();
  const groupOf = (outcome: ExportCardOutcome): GroupAcc => {
    const key = outcome.card.dirSlug;
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        dirSlug: key,
        anchorId: outcome.card.questionId,
        screenshots: [],
        statesSkipped: [],
        warnings: [],
        overflow: [],
        missingAssets: [],
        layoutsByFormat: new Map(),
      };
      groups.set(key, acc);
    }
    return acc;
  };
  // Every planned group gets an entry even if all its cards failed, so the
  // contact sheet and metadata account for it.
  for (const card of plan.cards) {
    groupOf({ card, status: "skipped", reason: "" } as ExportCardOutcome);
  }

  const recordLayout = (acc: GroupAcc, outcome: ExportCardOutcome, layout: unknown) => {
    if (!layout) return;
    const { formatKey, slug, slide } = outcome.card;
    if (!acc.layoutsByFormat.has(formatKey)) acc.layoutsByFormat.set(formatKey, new Map());
    acc.layoutsByFormat.get(formatKey)!.set(slug, { layout: layout as never, slide });
  };

  let captured = 0;
  let skipped = 0;
  let failed = 0;

  for (const outcome of run.outcomes) {
    const acc = groupOf(outcome);
    const { card } = outcome;
    const question = questionFor(outcome, byId);
    if (outcome.status === "skipped") {
      skipped++;
      acc.statesSkipped.push({ state: card.slug, reason: outcome.reason });
      continue;
    }
    if (outcome.status === "failed") {
      failed++;
      const failing = (outcome.findings ?? []).filter((f) => f.severity === "failure");
      if (failing.length) {
        for (const f of failing) {
          failures.push({
            question_id: reportId(outcome, byId),
            question_key: question?.question_key ?? null,
            format: card.formatKey,
            state: card.slug,
            classification: f.code,
            message: f.message,
          });
        }
      } else {
        failures.push({
          question_id: reportId(outcome, byId),
          question_key: question?.question_key ?? null,
          format: card.formatKey,
          state: card.slug,
          classification: outcome.classification,
          message: outcome.reason,
        });
      }
      acc.overflow.push(...(outcome.overflow ?? []));
      acc.missingAssets.push(...(outcome.missingAssets ?? []));
      recordLayout(acc, outcome, outcome.layout);
      continue;
    }

    // Captured: measure the file actually produced, not the size requested.
    let dims: { width: number; height: number };
    try {
      dims = pngDimensionsFromBytes(await blobBytes(outcome.file.blob, 24));
    } catch {
      failed++;
      failures.push({
        question_id: reportId(outcome, byId),
        question_key: question?.question_key ?? null,
        format: card.formatKey,
        state: card.slug,
        classification: "invalid-png",
        message: "the exported file is not a readable PNG",
      });
      continue;
    }
    const format = getFormat(card.formatKey);
    if (format && (dims.width !== format.width || dims.height !== format.height)) {
      failed++;
      failures.push({
        question_id: reportId(outcome, byId),
        question_key: question?.question_key ?? null,
        format: card.formatKey,
        state: card.slug,
        classification: "dimension-mismatch",
        message: `exported ${dims.width}×${dims.height}, expected ${format.width}×${format.height}`,
      });
      continue;
    }

    captured++;
    warningCount += outcome.findings.length;
    acc.warnings.push(...outcome.findings);
    acc.overflow.push(...outcome.overflow);
    acc.missingAssets.push(...outcome.missingAssets);
    recordLayout(acc, outcome, outcome.layout);
    acc.screenshots.push({
      format: card.formatKey,
      state: card.slug as RenderState,
      file: card.fileName,
      ...dims,
    });
    manifestSlides.push({
      index: card.index,
      slide_kind: card.slide,
      slug: card.slug,
      state: card.state,
      format: card.formatKey,
      file: `${card.dirSlug}/${card.fileName}`,
      ...(card.slide === "quiz" || card.slide === "recap" ? { question_id: reportId(outcome, byId) } : {}),
      width: dims.width,
      height: dims.height,
      ...(card.difficulty ? { difficulty: card.difficulty } : {}),
    });
    images.push({ path: `${card.dirSlug}/${card.fileName}`, blob: outcome.file.blob, ...dims });
  }

  // Cross-slide geometry, through the generator's own gate.
  const carousel = plan.mode !== "classic";
  for (const acc of groups.values()) {
    const anchor = byId.get(acc.anchorId);
    const stability = evaluateLayoutStability({
      layoutsByFormat: acc.layoutsByFormat,
      carousel,
      questionId: plan.mode === "multi-question" ? "challenge" : anchor?.id ?? acc.anchorId,
    });
    failures.push(...stability.failures);
  }

  // The run's own questions, in plan order (missing rows are reported, not invented).
  const runQuestions = plan.questionIds
    .map((id) => byId.get(String(id)))
    .filter((q): q is RenderQuestion => !!q);

  const generatedAt = run.finishedAt.toISOString();
  const metadata: QuestionMetadata[] = [];
  for (const acc of groups.values()) {
    const anchor = byId.get(acc.anchorId);
    if (!anchor) continue;
    const metaQuestion: RenderQuestion =
      plan.mode === "multi-question"
        ? {
            id: "challenge",
            question_text: `Multi-question challenge: ${runQuestions.length} questions — ${anchor.question_text}`,
            choices: anchor.choices,
            correct_index: anchor.correct_index,
            category: anchor.category,
          }
        : anchor;
    metadata.push(
      buildQuestionMetadata({
        question: metaQuestion,
        sourceMode: "browser-export",
        statesRequested: [...plan.requestedSlugs],
        formatsRequested: [...plan.formats],
        screenshots: acc.screenshots,
        statesSkipped: acc.statesSkipped,
        warnings: acc.warnings,
        // Not observable from inside a page: the browser export has no
        // equivalent of Playwright's console/pageerror/requestfailed hooks.
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
        missingAssets: [...new Set(acc.missingAssets)],
        overflowFindings: acc.overflow,
        generatedAt,
      }),
    );
  }

  const aborted = run.aborted;
  const reports = buildRunReports({
    runId: plan.runDir,
    outputDir: plan.runDir,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    mode: plan.mode,
    sourceDescription: args.sourceDescription ?? "browser export (Admin)",
    questions: runQuestions,
    skippedAtLoad: plan.questionIds
      .filter((id) => !byId.has(String(id)))
      .map((id) => ({ id, reason: "question was not loaded for export" })),
    post: plan.post,
    challengeSpecs: plan.challengeSpecs,
    multiQuestion: plan.challenge,
    states: plan.states,
    requestedSlugs: plan.requestedSlugs,
    formats: plan.formats,
    difficulty: plan.difficulty,
    difficultyOverrides: plan.difficultyOverrides,
    manifestSlides,
    metadata,
    captureCount: captured,
    failures,
    warningCount,
    aborted,
    packageType: plan.packageType,
    packagePrefix: plan.packagePrefix,
    platform: args.platform ?? "generic",
    // Browser export never offers the diagnostic overrides.
    allowIncompletePresentation: false,
    allowMissingAssets: false,
    generator: { version: BROWSER_GENERATOR_VERSION, commit: args.commit ?? null },
  });

  const status: BrowserRunStatus =
    aborted !== null || failures.length > 0 || captured === 0
      ? "failed"
      : warningCount > 0
        ? "succeeded-with-warnings"
        : "succeeded";

  return {
    runId: plan.runDir,
    status,
    manifest: reports.manifest,
    summary: reports.summary,
    failures,
    metadata,
    contactSheetHtml: reports.contactSheetHtml,
    images,
    counts: { planned: plan.cards.length, captured, skipped, failed, warnings: warningCount },
  };
}

/** Daily-package manifest, the same shape `runDailyPackage` writes. */
export function buildDailyPackageManifest(args: {
  prefix: string;
  featuredQuestionId: string;
  reuseFeaturedAsOpener: boolean;
  createdAt: Date;
  posts: Array<{ key: string; report: BrowserRunReport }>;
}) {
  return {
    schema_version: 1,
    package_prefix: args.prefix,
    created_at: args.createdAt.toISOString(),
    featured_question_id: args.featuredQuestionId,
    reuse_featured_as_opener: args.reuseFeaturedAsOpener,
    posts: args.posts.map((p) => ({
      key: p.key,
      run_id: p.report.runId,
      capture_count: p.report.counts.captured,
      failure_count: p.report.failures.length,
      warning_count: p.report.counts.warnings,
    })),
  };
}

export type RunArchive = { blob: Blob; fileName: string; entries: string[] };

/**
 * One ZIP holding every run (and, for a daily package, `<prefix>-package.json`
 * beside them) — the `runs/` directory a CLI run would leave on disk.
 */
export async function buildRunArchive(args: {
  runs: readonly BrowserRunReport[];
  fileName: string;
  packageManifest?: { package_prefix: string } & Record<string, unknown>;
}): Promise<RunArchive> {
  const zip = new JSZip();
  const entries: string[] = [];
  const add = (path: string, content: string | Blob) => {
    zip.file(path, content);
    entries.push(path);
  };
  for (const run of args.runs) {
    const root = run.runId;
    for (const image of run.images) add(`${root}/${image.path}`, image.blob);
    for (const meta of run.metadata) {
      add(`${root}/${meta.stable_slug}/metadata.json`, JSON.stringify(meta, null, 2));
    }
    add(`${root}/summary.json`, JSON.stringify(run.summary, null, 2));
    add(`${root}/failures.json`, JSON.stringify(run.failures, null, 2));
    add(`${root}/manifest.json`, JSON.stringify(run.manifest, null, 2));
    add(`${root}/index.html`, run.contactSheetHtml);
  }
  if (args.packageManifest) {
    add(`${args.packageManifest.package_prefix}-package.json`, JSON.stringify(args.packageManifest, null, 2));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, fileName: args.fileName, entries };
}
