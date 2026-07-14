/**
 * Pure run-finalization logic: reconstruct run-level reports (summary,
 * failures, contact sheet) from what actually exists in a run directory.
 * Used by the capture runner's normal finalization AND the --finalize-run
 * recovery mode, so both paths produce identical report shapes.
 *
 * Pure module — the scripts layer feeds it an in-memory description of the
 * run directory; no fs access here.
 */
import { buildContactSheet, type RunSummaryForSheet } from "./contact-sheet";
import type { QuestionMetadata } from "./metadata";

/** What the scripts layer found in one question_* directory. */
export type ScannedQuestionDir = {
  dirName: string;
  /** Parsed metadata.json, or null when missing/unreadable. */
  metadata: QuestionMetadata | null;
  /** PNG filenames actually present in the directory. */
  pngFiles: string[];
};

export type RunFailure = {
  question_id: number | string | null;
  format: string | null;
  state: string | null;
  classification: string;
  message: string;
  screenshot?: string;
};

export type FinalizedReports = {
  summary: Record<string, unknown>;
  failures: RunFailure[];
  contactSheetHtml: string;
  /** Question directories that were fully accounted for. */
  completeCount: number;
  /** Question directories that were partial/malformed. */
  partialCount: number;
};

/**
 * Reconstruct run reports from scanned question directories.
 * Honest about partial runs: a directory without readable metadata, or whose
 * metadata references screenshots that are not on disk, is reported as a
 * failure — never counted as fully successful and never fabricated.
 */
export function finalizeRun(args: {
  runId: string;
  outputDir: string;
  scanned: ScannedQuestionDir[];
  generatedAt: string;
  sourceDescription?: string;
}): FinalizedReports {
  const failures: RunFailure[] = [];
  const metadatas: QuestionMetadata[] = [];
  let captureCount = 0;
  let warningCount = 0;
  let partialCount = 0;

  const sorted = [...args.scanned].sort((a, b) => a.dirName.localeCompare(b.dirName));

  for (const dir of sorted) {
    if (!dir.metadata) {
      partialCount++;
      failures.push({
        question_id: dir.dirName.replace(/^question_/, "") || null,
        format: null,
        state: null,
        classification: "partial-question",
        message: `${dir.dirName}: metadata.json missing or unreadable (${dir.pngFiles.length} PNG(s) present)`,
      });
      // Represent it on the contact sheet without fabricating capture data.
      metadatas.push({
        question_id: dir.dirName.replace(/^question_/, ""),
        stable_slug: dir.dirName,
        question_type: "unknown",
        category: null,
        difficulty: null,
        prompt_preview: "(metadata missing — partial question directory)",
        source_mode: "unknown",
        states_requested: [],
        states_rendered: [],
        states_skipped: [],
        formats_requested: [],
        formats_rendered: [],
        screenshots: [],
        warnings: [],
        console_errors: [],
        page_errors: [],
        failed_requests: [],
        missing_assets: [],
        overflow_findings: [],
        generated_at: args.generatedAt,
      });
      continue;
    }

    const meta = dir.metadata;
    const pngSet = new Set(dir.pngFiles);
    let missingOnDisk = 0;
    for (const shot of meta.screenshots ?? []) {
      if (!pngSet.has(shot.file)) {
        missingOnDisk++;
        failures.push({
          question_id: meta.question_id,
          format: shot.format,
          state: shot.state,
          classification: "missing-screenshot",
          message: `${meta.stable_slug}/${shot.file} listed in metadata but not on disk`,
        });
      } else {
        captureCount++;
      }
    }
    if (missingOnDisk > 0) partialCount++;

    // Re-surface failures the capture pass already recorded in metadata
    // findings (severity: failure), so recovered reports don't hide them.
    for (const w of meta.warnings ?? []) {
      if (w.severity === "failure") {
        failures.push({
          question_id: meta.question_id,
          format: w.format ?? null,
          state: w.state ?? null,
          classification: w.code,
          message: w.message,
        });
      } else {
        warningCount++;
      }
    }
    for (const o of meta.overflow_findings ?? []) {
      if (o.severity === "failure") {
        failures.push({
          question_id: meta.question_id,
          format: o.format ?? null,
          state: o.state ?? null,
          classification: o.code,
          message: o.message,
        });
      } else {
        warningCount++;
      }
    }
    metadatas.push(meta);
  }

  const statesRequested = [...new Set(metadatas.flatMap((m) => m.states_requested))];
  const formatsRequested = [...new Set(metadatas.flatMap((m) => m.formats_requested))];
  const sourceDescription =
    args.sourceDescription ??
    ([...new Set(metadatas.map((m) => m.source_mode).filter((s) => s !== "unknown"))].join(",") ||
      "unknown");

  const summary = {
    schema_version: 1,
    run_id: args.runId,
    source: sourceDescription,
    states_requested: statesRequested,
    formats_requested: formatsRequested,
    question_count: sorted.length,
    complete_question_count: sorted.length - partialCount,
    partial_question_count: partialCount,
    capture_count: captureCount,
    failure_count: failures.length,
    warning_count: warningCount,
    output_dir: args.outputDir,
    finalized_at: args.generatedAt,
  };

  const sheetSummary: RunSummaryForSheet = {
    runId: args.runId,
    generatedAt: args.generatedAt,
    sourceDescription,
    statesRequested,
    formatsRequested,
    totalQuestions: sorted.length,
    captureCount,
    failureCount: failures.length,
    warningCount,
  };

  return {
    summary,
    failures,
    contactSheetHtml: buildContactSheet(sheetSummary, metadatas),
    completeCount: sorted.length - partialCount,
    partialCount,
  };
}
