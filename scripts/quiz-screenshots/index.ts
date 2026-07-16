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
 * Thin CLI over the shared generation service (./generate.ts) — the Content
 * Studio server calls the exact same service, so there is one screenshot
 * engine. Read-only against the backend; writes only under the export root
 * (default quiz_content_exports/, gitignored). See README.md next to this
 * file.
 *
 * Lifecycle guarantees: run-level reports are written BEFORE teardown, the
 * managed Vite tree is killed by tracked PID on success/failure/signals, and
 * the process always exits explicitly.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseScreenshotCli, CLI_USAGE, type ScreenshotCliConfig } from "../../src/lib/quiz-screenshot/cli";
import type { QuestionMetadata } from "../../src/lib/quiz-screenshot/metadata";
import {
  finalizeRun,
  type ScannedQuestionDir,
} from "../../src/lib/quiz-screenshot/finalize";
import {
  createCleanupRegistry,
  installSignalHandlers,
} from "../../src/lib/quiz-screenshot/cleanup";
import { runGeneration, resolveRunDir, pngDimensions } from "./generate";

// Re-exported for existing tests/tooling that import them from the CLI entry.
export { pngDimensions, resolveRunDir };

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
  let allWrote = true;
  const attempt = (file: string, content: string) => {
    try {
      writeFileSync(join(runDir, file), content, "utf8");
    } catch (err) {
      allWrote = false;
      console.error(`Failed to write ${file}: ${err instanceof Error ? err.message : err}`);
    }
  };
  attempt("summary.json", JSON.stringify(reports.summary, null, 2));
  attempt("failures.json", JSON.stringify(reports.failures, null, 2));
  attempt("index.html", reports.contactSheetHtml);

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

  let exitCode = 0;
  try {
    const result = await runGeneration(config, {
      registerCleanup: (name, fn) => registry.register(name, fn),
    });
    console.log(`\n──────────────────────────────────────────`);
    console.log(`Output:        ${result.runDir}`);
    console.log(`Contact sheet: ${join(result.runDir, "index.html")}`);
    if (result.failureCount) {
      console.log(`Failures:      ${join(result.runDir, "failures.json")}`);
    }
    exitCode = result.aborted || !result.reportsOk || result.failureCount ? 1 : 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    exitCode = 1;
  }

  // Idempotent: runGeneration tears down its own resources on the normal
  // path; the registry is the signal-time safety net.
  await registry.runAll();
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
