/**
 * Quiz Screenshot Content Factory — CLI runner.
 *
 *   npm run quiz:screenshots -- --question-id 123
 *   npm run quiz:screenshots -- --question-ids 123,456
 *   npm run quiz:screenshots -- --pack combat-cooldowns-v1 --limit 10
 *   npm run quiz:screenshots -- --approved --limit 20
 *   npm run quiz:screenshots -- --fixture src/lib/quiz-screenshot/fixture-dump.json
 *   npm run quiz:screenshots -- --question-id 123 --states question,correct --formats vertical,mobile-audit
 *
 * Read-only against the backend; writes only under the export root
 * (default quiz_content_exports/, gitignored). See README.md next to this file.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
import { loadQuestions } from "./source";
import { ensureServer } from "./server";
import { captureOne, launchBrowser } from "./capture";

/** Read width/height straight from the PNG IHDR header. */
export function pngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452 /* "IHDR" */) {
    throw new Error("Not a valid PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

type RunFailure = {
  question_id: number | string | null;
  format: string | null;
  state: string | null;
  classification: string;
  message: string;
  screenshot?: string;
};

async function main() {
  let config: ScreenshotCliConfig;
  try {
    config = parseScreenshotCli(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}\n`);
    console.error(CLI_USAGE);
    process.exit(2);
  }

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
  const runDir = resolve(join(config.outRoot, "runs", runId));
  const exportRootAbs = resolve(config.outRoot);
  if (!runDir.startsWith(exportRootAbs)) {
    throw new Error(`Run directory ${runDir} escapes the export root — refusing`);
  }
  if (existsSync(runDir)) {
    if (!config.overwrite) {
      console.error(`Run directory already exists: ${runDir}\nPass --overwrite to replace it.`);
      process.exit(1);
    }
    rmSync(runDir, { recursive: true, force: true });
  }
  mkdirSync(runDir, { recursive: true });

  const server = await ensureServer(config.baseUrl);
  const browser = await launchBrowser();

  const allMetadata: QuestionMetadata[] = [];
  const runFailures: RunFailure[] = [];
  let captureCount = 0;
  let warningCount = 0;

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
            const { png, qa } = await captureOne({
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
  } finally {
    await browser.close();
    await server.stop();
  }

  // ── Run-level reports ───────────────────────────────────────────────────
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
    output_dir: runDir,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  writeFileSync(join(runDir, "failures.json"), JSON.stringify(runFailures, null, 2), "utf8");
  writeFileSync(
    join(runDir, "index.html"),
    buildContactSheet(
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
    "utf8",
  );

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Run ${runId}: ${captureCount} capture(s), ${runFailures.length} failure(s), ${warningCount} warning(s)`);
  console.log(`Output:        ${runDir}`);
  console.log(`Contact sheet: ${join(runDir, "index.html")}`);
  if (runFailures.length) {
    console.log(`Failures:      ${join(runDir, "failures.json")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
