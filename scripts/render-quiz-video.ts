/**
 * Render a Mogsy quiz video + its YouTube timestamp files in one command.
 *
 *   npx tsx scripts/render-quiz-video.ts
 *   npx tsx scripts/render-quiz-video.ts --props path/to/quiz.json --out out/my-video.mp4
 *   npx tsx scripts/render-quiz-video.ts --timestamps-only
 *
 * Outputs (next to the MP4):
 *   <name>.mp4                 — 1920x1080 60fps H.264
 *   <name>-timestamps.txt      — YouTube-description chapter list
 *   <name>-metadata.json       — full per-question timing metadata
 *
 * The timestamps come from the SAME timing model the Remotion composition
 * uses (src/video/timing.ts), so they always match the rendered frames.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { buildChapters, buildMetadata, buildTimeline, formatTimestamp } from "../src/video/timing";
import type { QuizVideoData } from "../src/video/types";

/**
 * Some npm versions/shells swallow `npm run … -- --flag value` instead of
 * forwarding it (warning: `Unknown cli config "--flag"`) and expose the value
 * as an npm_config_* env var instead. Check argv first, then that fallback,
 * so `npm run video:render -- --props x --out y` and the direct
 * `npx tsx scripts/render-quiz-video.ts …` invocation behave identically.
 */
function npmConfig(flag: string): string | undefined {
  const name = flag.replace(/^--/, "");
  for (const key of [`npm_config_${name}`, `npm_config_${name.replace(/-/g, "_")}`]) {
    const v = process.env[key];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const fromNpm = npmConfig(flag);
  return fromNpm !== undefined && fromNpm !== "true" ? fromNpm : fallback;
}

const propsPath = resolve(arg("--props", "src/video/sample-quiz-video.json")!);
const outPath = resolve(arg("--out", "out/quiz-video.mp4")!);
const timestampsOnly =
  process.argv.includes("--timestamps-only") || npmConfig("--timestamps-only") === "true";

const data = JSON.parse(readFileSync(propsPath, "utf8")) as QuizVideoData;
if (!data.questions?.length) {
  console.error(`No questions found in ${propsPath}`);
  process.exit(1);
}

const outDir = dirname(outPath);
mkdirSync(outDir, { recursive: true });
const stem = basename(outPath).replace(/\.[^.]+$/, "");

// ── Timestamp + metadata files (always written) ──────────────────────────
const timeline = buildTimeline(data);
const chapters = buildChapters(data, timeline);
const timestampsTxt = chapters.map((c) => `${c.timestamp} ${c.label}`).join("\n") + "\n";
const timestampsPath = join(outDir, `${stem}-timestamps.txt`);
const metadataPath = join(outDir, `${stem}-metadata.json`);
writeFileSync(timestampsPath, timestampsTxt, "utf8");
writeFileSync(metadataPath, JSON.stringify(buildMetadata(data), null, 2), "utf8");

console.log(`Video length: ${formatTimestamp(timeline.totalSeconds)} (${timeline.totalFrames} frames @ ${timeline.fps}fps)`);
console.log(`Wrote ${timestampsPath}`);
console.log(`Wrote ${metadataPath}`);
console.log("\nChapters:\n" + timestampsTxt);

if (timestampsOnly) process.exit(0);

// ── Render ───────────────────────────────────────────────────────────────
// Composition props are { data: QuizVideoData }; wrap the user JSON so
// checked-in quiz files stay clean.
const wrappedPropsPath = join(outDir, `${stem}-props.tmp.json`);
writeFileSync(wrappedPropsPath, JSON.stringify({ data }), "utf8");

const args = ["remotion", "render", "QuizVideo", outPath, `--props=${wrappedPropsPath}`];
console.log(`\n> npx ${args.join(" ")}\n`);
const res = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
if (res.status !== 0) {
  console.error("Render failed.");
  process.exit(res.status ?? 1);
}
console.log(`\nDone: ${outPath}`);
