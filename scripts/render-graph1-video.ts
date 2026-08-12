/**
 * Render a GRAPH1 ranked-race MP4 from a backend-built dataset payload.
 *
 *   npx tsx scripts/render-graph1-video.ts --props path/to/<key>.json
 *   npx tsx scripts/render-graph1-video.ts --props azir-players.json --speed 10
 *   npx tsx scripts/render-graph1-video.ts --props faker-champions.json --timing-only
 *
 * `--props` is the RAW VisualizationDataset exactly as written by
 * League_Combat_Simulator scripts/build_graph1_datasets.py — canonical
 * bytes, so its sha256 can be checked against the pinned digest manifest.
 * The script wraps it into composition props; the checked payload is never
 * modified.
 *
 * Outputs (next to the MP4):
 *   <name>.mp4            — 1920x1080 30fps H.264
 *   <name>-metadata.json  — dataset id, payload sha256, event/entity counts,
 *                           speed and exact frame timing (same math as the
 *                           composition: src/video/graph1/timing.ts)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { assertDataset } from "../src/graph1/contract";
import {
  GRAPH1_FPS,
  raceVideoTimingForDataset,
  resolveRaceVideoOptions,
  type Graph1RaceVideoProps,
} from "../src/video/graph1/timing";

/** npm `--flag value` forwarding fallback — see scripts/render-quiz-video.ts. */
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

const propsArg = arg("--props");
if (!propsArg) {
  console.error(
    "Usage: npx tsx scripts/render-graph1-video.ts --props <dataset.json> " +
      "[--out out/<name>.mp4] [--speed N] [--top-n N] [--smooth-values] " +
      "[--timing-only]",
  );
  process.exit(1);
}
const propsPath = resolve(propsArg);
const timingOnly =
  process.argv.includes("--timing-only") || npmConfig("--timing-only") === "true";

const payloadBytes = readFileSync(propsPath);
const payloadSha256 = createHash("sha256").update(payloadBytes).digest("hex");
const dataset = assertDataset(JSON.parse(payloadBytes.toString("utf8")));

const props: Graph1RaceVideoProps = { dataset };
const speed = arg("--speed");
if (speed !== undefined) props.speed = Number(speed);
const topN = arg("--top-n");
if (topN !== undefined) props.topN = Number(topN);
const leadIn = arg("--lead-in");
if (leadIn !== undefined) props.leadInSeconds = Number(leadIn);
const outro = arg("--outro");
if (outro !== undefined) props.outroSeconds = Number(outro);
// stat races print exact checkpoint values by default; this restores the
// smooth interpolated ticker for social-clip exports
if (process.argv.includes("--smooth-values")
    || npmConfig("--smooth-values") === "true") {
  props.smoothValues = true;
}

const opts = resolveRaceVideoOptions(props);
const timing = raceVideoTimingForDataset(props, GRAPH1_FPS);

const defaultStem = `graph1-${dataset.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
const outPath = resolve(arg("--out", `out/${defaultStem}.mp4`)!);
const outDir = dirname(outPath);
mkdirSync(outDir, { recursive: true });
const stem = basename(outPath).replace(/\.[^.]+$/, "");

const metadata = {
  dataset: {
    id: dataset.id,
    title: dataset.definition.title,
    payloadSha256,
    eventCount: dataset.events.length,
    distinctRankedEntityCount: dataset.coverage.distinctRankedEntityCount,
    firstEventAt: dataset.coverage.firstEventAt,
    lastEventAt: dataset.coverage.lastEventAt,
  },
  options: opts,
  timing,
};
const metadataPath = join(outDir, `${stem}-metadata.json`);
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

const mins = Math.floor(timing.totalSeconds / 60);
const secs = Math.round(timing.totalSeconds % 60);
console.log(
  `${dataset.id}: ${dataset.events.length.toLocaleString()} events at ${opts.speed}x → ` +
    `${timing.totalFrames} frames @ ${timing.fps}fps (${mins}m${String(secs).padStart(2, "0")}s)`,
);
console.log(`Payload sha256: ${payloadSha256}`);
console.log(`Wrote ${metadataPath}`);

if (timingOnly) process.exit(0);

const wrappedPropsPath = join(outDir, `${stem}-props.tmp.json`);
writeFileSync(wrappedPropsPath, JSON.stringify(props), "utf8");

const args = ["remotion", "render", "Graph1Race", outPath, `--props=${wrappedPropsPath}`];
console.log(`\n> npx ${args.join(" ")}\n`);
const res = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
if (res.status !== 0) {
  console.error("Render failed.");
  process.exit(res.status ?? 1);
}
console.log(`\nDone: ${outPath}`);
