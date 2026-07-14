/**
 * Quiz Screenshot Content Factory — CLI runner.
 *
 *   npm run quiz:screenshots -- --question-id 123
 *   npm run quiz:screenshots -- --question-ids 123,456
 *   npm run quiz:screenshots -- --pack combat-cooldowns-v1 --limit 10
 *   npm run quiz:screenshots -- --approved --limit 20
 *   npm run quiz:screenshots -- --fixture src/lib/quiz-screenshot/fixture-dump.json
 *   npm run quiz:screenshots -- --question-id 123 --states question,correct --formats vertical,mobile-audit
 *   npm run quiz:screenshots -- --finalize-run <run-id> [--overwrite]   # report-only recovery
 *
 * Read-only against the backend; writes only under the export root
 * (default quiz_content_exports/, gitignored). See README.md next to this file.
 *
 * Lifecycle guarantees: run-level reports are written BEFORE teardown, the
 * managed Vite tree is killed by tracked PID on success/failure/signals, and
 * the process always exits explicitly — a stuck teardown can no longer
 * swallow the reports or hang the shell.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseScreenshotCli, CLI_USAGE, type ScreenshotCliConfig } from "../../src/lib/quiz-screenshot/cli";
import { resolveAnswerPlan } from "../../src/lib/quiz-screenshot/states";
import { questionSlug, runDirName, screenshotFileName } from "../../src/lib/quiz-screenshot/paths";
import {
  buildQuestionMetadata,
  type CaptureRecord,
  type QaFinding,
  type QuestionMetadata,
} from "../../src/lib/quiz-screenshot/metadata";
import { buildContactSheet } from "../../src/lib/quiz-screenshot/contact-sheet";
import {
  finalizeRun,
  type RunFailure,
  type ScannedQuestionDir,
} from "../../src/lib/quiz-screenshot/finalize";
import {
  createCleanupRegistry,
  installSignalHandlers,
} from "../../src/lib/quiz-screenshot/cleanup";
import { loadQuestions } from "./source";
import { ensureServer } from "./server";
import { captureOne, launchBrowser, type CaptureLayout } from "./capture";

/** Read width/height straight from the PNG IHDR header. */
export function pngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452 /* "IHDR" */) {
    throw new Error("Not a valid PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Resolve + guard the run directory inside the export root. */
function resolveRunDir(outRoot: string, runId: string): string {
  const runDir = resolve(join(outRoot, "runs", runId));
  const exportRootAbs = resolve(outRoot);
  if (!runDir.startsWith(exportRootAbs)) {
    throw new Error(`Run directory ${runDir} escapes the export root — refusing`);
  }
  return runDir;
}

/** Scan an existing run directory into the pure finalizer's input shape. */
function scanRunDir(runDir: string): ScannedQuestionDir[] {
  const scanned: ScannedQuestionDir[] = [];
  for (const entry of readdirSync(runDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("question_")) continue;
    const qDir = join(runDir, entry.name);
    const pngFiles = readdirSync(qDir).filter((f) => f.toLowerCase().endsWith(".png"));
    let metadata: QuestionMetadata | null = null;
    try {
      const parsed = JSON.parse(readFileSync(join(qDir, "metadata.json"), "utf8"));
      // Minimal structural sanity: reject shapes we can't report honestly.
      if (parsed && typeof parsed === "object" && "stable_slug" in parsed && Array.isArray(parsed.screenshots)) {
        metadata = parsed as QuestionMetadata;
      }
    } catch {
      metadata = null;
    }
    scanned.push({ dirName: entry.name, metadata, pngFiles });
  }
  return scanned;
}

/**
 * Write the three run-level reports. Each write is independent: one failure
 * is reported and the others are still attempted. Returns true if all wrote.
 */
function writeReports(
  runDir: string,
  reports: { summary: unknown; failures: unknown; contactSheetHtml: string },
): boolean {
  let ok = true;
  const attempt = (file: string, content: string) => {
    try {
      writeFileSync(join(runDir, file), content, "utf8");
    } catch (err) {
      ok = false;
      console.error(`Failed to write ${file}: ${err instanceof Error ? err.message : err}`);
    }
  };
  attempt("summary.json", JSON.stringify(reports.summary, null, 2));
  attempt("failures.json", JSON.stringify(reports.failures, null, 2));
  attempt("index.html", reports.contactSheetHtml);
  return ok;
}

// ── Report-only recovery mode ────────────────────────────────────────────────

function runFinalizeOnly(config: ScreenshotCliConfig): never {
  const runId = config.finalizeRun!;
  const runDir = resolveRunDir(config.outRoot, runId);
  if (!existsSync(runDir)) {
    console.error(`Run directory not found: ${runDir}`);
    process.exit(1);
  }
  const existingReports = ["summary.json", "failures.json", "index.html"].filter((f) =>
    existsSync(join(runDir, f)),
  );
  if (existingReports.length && !config.overwrite) {
    console.error(
      `Run already has report file(s): ${existingReports.join(", ")}\nPass --overwrite to regenerate them (PNGs are never touched).`,
    );
    process.exit(1);
  }

  const scanned = scanRunDir(runDir);
  if (!scanned.length) {
    console.error(`No question_* directories found in ${runDir} — nothing to finalize.`);
    process.exit(1);
  }

  const reports = finalizeRun({
    runId,
    outputDir: runDir,
    scanned,
    generatedAt: new Date().toISOString(),
  });
  const allWrote = writeReports(runDir, {
    summary: reports.summary,
    failures: reports.failures,
    contactSheetHtml: reports.contactSheetHtml,
  });

  console.log(`\n──────────────────────────────────────────`);
  console.log(
    `Finalized run ${runId}: ${scanned.length} question dir(s), ${reports.completeCount} complete, ${reports.partialCount} partial, ${reports.failures.length} failure(s)`,
  );
  console.log(`Output:        ${runDir}`);
  console.log(`Contact sheet: ${join(runDir, "index.html")}`);
  process.exit(!allWrote || reports.failures.length ? 1 : 0);
}

// ── Capture mode ─────────────────────────────────────────────────────────────

async function main() {
  let config: ScreenshotCliConfig;
  try {
    config = parseScreenshotCli(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}\n`);
    console.error(CLI_USAGE);
    process.exit(2);
  }

  if (config.finalizeRun) runFinalizeOnly(config);

  const registry = createCleanupRegistry();
  installSignalHandlers(registry, process, (m) => console.error(m));

  const startedAt = new Date();
  const { questions, skipped, sourceDescription } = await loadQuestions(config);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} unusable question(s):`);
    for (const s of skipped) console.log(`  - #${s.id}: ${s.reason}`);
  }
  if (!questions.length) {
    console.error("No usable questions — nothing to capture.");
    process.exit(1);
  }
  console.log(`Rendering ${questions.length} question(s) from ${sourceDescription}`);
  console.log(`States: ${config.states.join(", ")}`);
  console.log(`Formats: ${config.formats.map((f) => f.key).join(", ")}`);

  // ── Run directory (refuses to overwrite unless asked) ──────────────────
  const runId = runDirName(config.runId, startedAt);
  const runDir = resolveRunDir(config.outRoot, runId);
  if (existsSync(runDir)) {
    if (!config.overwrite) {
      console.error(`Run directory already exists: ${runDir}\nPass --overwrite to replace it.`);
      process.exit(1);
    }
    rmSync(runDir, { recursive: true, force: true });
  }
  mkdirSync(runDir, { recursive: true });

  const server = await ensureServer(config.baseUrl);
  registry.register("vite-server", () => server.stop());
  const browser = await launchBrowser();
  registry.register("browser", () => browser.close());

  const allMetadata: QuestionMetadata[] = [];
  const runFailures: RunFailure[] = [];
  let captureCount = 0;
  let warningCount = 0;
  let captureError: unknown = null;

  try {
    for (const question of questions) {
      const slug = questionSlug(question.id);
      const qDir = join(runDir, slug);
      mkdirSync(qDir, { recursive: true });
      console.log(`\n${slug} — ${question.question_text.slice(0, 70)}`);

      const screenshots: CaptureRecord[] = [];
      const statesSkipped: Array<{ state: string; reason: string }> = [];
      const warnings: QaFinding[] = [];
      const overflow: QaFinding[] = [];
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];
      const missingAssets: string[] = [];
      // format key -> state -> geometry, for the cross-state stability gate.
      const layoutsByFormat = new Map<string, Map<string, CaptureLayout>>();

      for (const state of config.states) {
        // Plan first: skip/reject before spending a browser navigation.
        let expected: { selectedIndex: number | null; showExplanation: boolean };
        try {
          const plan = resolveAnswerPlan(question, state, config.answerIndex);
          if (plan.kind === "skip") {
            statesSkipped.push({ state, reason: plan.reason });
            console.log(`  ~ ${state}: skipped (${plan.reason})`);
            continue;
          }
          expected = plan.plan;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          runFailures.push({
            question_id: question.id,
            format: null,
            state,
            classification: "invalid-state-for-question",
            message: msg,
          });
          console.log(`  ✗ ${state}: ${msg}`);
          continue;
        }

        for (const format of config.formats) {
          const file = screenshotFileName(format.key, state);
          try {
            const { png, qa, layout } = await captureOne({
              browser,
              baseUrl: server.baseUrl,
              question,
              state,
              format,
              answerIndex: config.answerIndex,
              expectedSelectedIndex: expected.selectedIndex,
              expectExplanation: expected.showExplanation,
            });
            writeFileSync(join(qDir, file), png);
            const dims = pngDimensions(png);
            screenshots.push({ format: format.key, state, file, ...dims });
            captureCount++;
            if (!layoutsByFormat.has(format.key)) layoutsByFormat.set(format.key, new Map());
            layoutsByFormat.get(format.key)!.set(state, layout);

            consoleErrors.push(...qa.consoleErrors);
            pageErrors.push(...qa.pageErrors);
            failedRequests.push(...qa.failedRequests);
            missingAssets.push(...qa.missingAssets);
            overflow.push(...qa.overflowFindings);
            warnings.push(...qa.warnings);
            warningCount += qa.warnings.length;
            for (const f of qa.failures) {
              runFailures.push({
                question_id: question.id,
                format: format.key,
                state,
                classification: f.code,
                message: f.message,
                screenshot: `${slug}/${file}`,
              });
            }
            const flag = qa.failures.length ? "✗" : qa.warnings.length ? "!" : "✓";
            console.log(`  ${flag} ${format.key} ${state} (${dims.width}×${dims.height})`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            runFailures.push({
              question_id: question.id,
              format: format.key,
              state,
              classification: "capture-error",
              message: msg.slice(0, 500),
            });
            console.log(`  ✗ ${format.key} ${state}: ${msg.slice(0, 200)}`);
          }
        }
      }

      // Layout-stability gate: for social captures, the question and correct
      // states must have IDENTICAL card, CTA, and QR geometry — the only
      // allowed differences are inside the card (reveal/selection/result).
      for (const [formatKey, states] of layoutsByFormat) {
        const a = states.get("question");
        const b = states.get("correct");
        if (!a || !b) continue;
        for (const part of ["card", "cta", "qr"] as const) {
          const ra = a[part];
          const rb = b[part];
          if (ra === null && rb === null) continue;
          const same =
            !!ra && !!rb &&
            Math.abs(ra.x - rb.x) <= 1 && Math.abs(ra.y - rb.y) <= 1 &&
            Math.abs(ra.w - rb.w) <= 1 && Math.abs(ra.h - rb.h) <= 1;
          if (!same) {
            runFailures.push({
              question_id: question.id,
              format: formatKey,
              state: "correct",
              classification: "layout-shift",
              message:
                `${part} geometry differs between question and correct states: ` +
                `${JSON.stringify(ra)} vs ${JSON.stringify(rb)}`,
            });
          }
        }
        console.log(
          `  ◻ ${formatKey} layout parity — card ${JSON.stringify(a.card)} | ` +
          `cta ${JSON.stringify(a.cta)} | qr ${JSON.stringify(a.qr)}`,
        );
      }

      const metadata = buildQuestionMetadata({
        question,
        sourceMode: config.source.mode,
        statesRequested: config.states,
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
    // Unexpected loop-level error (per-capture errors are handled above).
    captureError = err;
    console.error(
      `\nCapture aborted: ${err instanceof Error ? err.stack ?? err.message : err}`,
    );
  }

  // ── Run-level reports — written BEFORE teardown so a stuck teardown can
  //    never swallow them. ─────────────────────────────────────────────────
  const finishedAt = new Date();
  const summary = {
    schema_version: 1,
    run_id: runId,
    source: sourceDescription,
    states_requested: config.states,
    formats_requested: config.formats.map((f) => f.key),
    question_count: questions.length,
    questions_skipped_at_load: skipped,
    capture_count: captureCount,
    success_count: captureCount, // captures that produced a PNG
    failure_count: runFailures.length,
    warning_count: warningCount,
    aborted: captureError ? String(captureError instanceof Error ? captureError.message : captureError) : null,
    output_dir: runDir,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
  };
  const reportsOk = writeReports(runDir, {
    summary,
    failures: runFailures,
    contactSheetHtml: buildContactSheet(
      {
        runId,
        generatedAt: finishedAt.toISOString(),
        sourceDescription,
        statesRequested: config.states,
        formatsRequested: config.formats.map((f) => f.key),
        totalQuestions: questions.length,
        captureCount,
        failureCount: runFailures.length,
        warningCount,
      },
      allMetadata,
    ),
  });

  // ── Teardown (tracked processes only), then explicit exit ───────────────
  await registry.runAll();

  console.log(`\n──────────────────────────────────────────`);
  console.log(
    `Run ${runId}: ${captureCount} capture(s), ${runFailures.length} failure(s), ${warningCount} warning(s)${captureError ? " — ABORTED EARLY" : ""}`,
  );
  console.log(`Output:        ${runDir}`);
  console.log(`Contact sheet: ${join(runDir, "index.html")}`);
  if (runFailures.length) console.log(`Failures:      ${join(runDir, "failures.json")}`);

  process.exit(captureError || !reportsOk || runFailures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
