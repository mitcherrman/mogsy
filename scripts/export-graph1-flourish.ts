/**
 * Export a canonical GRAPH1 dataset to a Flourish-compatible CSV bundle.
 *
 *   npx tsx scripts/export-graph1-flourish.ts --dataset path/to/<key>.json --out-dir out/flourish
 *
 * Inputs are the RAW VisualizationDataset payloads written by
 * League_Combat_Simulator scripts/build_graph1_datasets.py — the same bytes
 * the golden digest manifest (graph1/fixtures/graph1_digests.json) pins.
 *
 * Outputs (per dataset, deterministic bytes — no wall clock anywhere):
 *   <stem>.flourish-games.csv  — wide bar-race sheet, cumulative games
 *   <stem>.flourish-wins.csv   — wide bar-race sheet, cumulative wins
 *                                (same row order as the games sheet)
 *   <stem>.events.csv          — long form, full fidelity (ids, exact
 *                                timestamps, context, running cumulatives)
 *   <stem>.flourish-manifest.json — traceability: input payload sha256 +
 *                                finalTotals/finalWins digests (comparable
 *                                verbatim to the pinned golden manifest),
 *                                per-file sha256 and row/column counts.
 *
 * Nothing is uploaded anywhere; this writes local files only.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { assertDataset } from "../src/graph1/contract";
import {
  buildEventsSheet,
  buildWideSheet,
  digestLines,
  finalTotals,
  finalWins,
  toCsv,
  wideRowOrder,
  type Sheet,
} from "../src/graph1/flourishExport";

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

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const datasetArg = arg("--dataset");
if (!datasetArg) {
  console.error(
    "Usage: npx tsx scripts/export-graph1-flourish.ts --dataset <payload.json> " +
      "[--out-dir out/flourish] [--stem <name>]",
  );
  process.exit(1);
}
const datasetPath = resolve(datasetArg);
const outDir = resolve(arg("--out-dir", "out/flourish")!);

const payloadBytes = readFileSync(datasetPath);
const payloadSha256 = sha256(payloadBytes);
const dataset = assertDataset(JSON.parse(payloadBytes.toString("utf8")));
const stem = arg("--stem", basename(datasetPath).replace(/\.json$/, ""))!;

const gamesSheet = buildWideSheet(dataset, "totalGames");
const winsSheet = buildWideSheet(dataset, "wins");
const eventsSheet = buildEventsSheet(dataset);

const totals = finalTotals(dataset);
const wins = finalWins(dataset);
const finalTotalsDigest = sha256(digestLines(totals));
const finalWinsDigest = sha256(digestLines(wins));

let totalGames = 0;
for (const v of totals.values()) totalGames += v;
let totalWins = 0;
for (const v of wins.values()) totalWins += v;

mkdirSync(outDir, { recursive: true });

function writeSheet(name: string, sheet: Sheet) {
  const text = toCsv(sheet.header, sheet.rows);
  const path = join(outDir, name);
  writeFileSync(path, text, "utf8");
  return {
    path,
    entry: {
      sha256: sha256(text),
      bytes: Buffer.byteLength(text, "utf8"),
      rows: sheet.rows.length,
      columns: sheet.header.length,
    },
  };
}

const games = writeSheet(`${stem}.flourish-games.csv`, gamesSheet);
const winsOut = writeSheet(`${stem}.flourish-wins.csv`, winsSheet);
const events = writeSheet(`${stem}.events.csv`, eventsSheet);

const order = wideRowOrder(dataset);
const manifest = {
  schemaVersion: 1,
  exportKind: "graph1-flourish-bundle",
  dataset: {
    id: dataset.id,
    title: dataset.definition.title,
    schemaVersion: dataset.schemaVersion,
    payloadSha256,
    payloadBytes: payloadBytes.length,
    eligibleEventCount: dataset.coverage.eligibleEventCount,
    distinctRankedEntityCount: dataset.coverage.distinctRankedEntityCount,
    firstEventAt: dataset.coverage.firstEventAt,
    lastEventAt: dataset.coverage.lastEventAt,
    generatedAt: dataset.coverage.generatedAt,
  },
  reconciliation: {
    finalTotalsDigest,
    finalWinsDigest,
    metricTotals: {
      totalGames,
      wins: totalWins,
      losses: totalGames - totalWins,
    },
    top3FinalTotals: order.slice(0, 3).map((id) => ({
      entityId: id,
      total: totals.get(id) ?? 0,
      wins: wins.get(id) ?? 0,
    })),
  },
  files: {
    [`${stem}.flourish-games.csv`]: games.entry,
    [`${stem}.flourish-wins.csv`]: winsOut.entry,
    [`${stem}.events.csv`]: events.entry,
  },
};
const manifestPath = join(outDir, `${stem}.flourish-manifest.json`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(
  `${dataset.id}: ${eventsSheet.rows.length.toLocaleString()} events, ` +
    `${gamesSheet.rows.length.toLocaleString()} entities x ` +
    `${gamesSheet.header.length - 3} month columns`,
);
console.log(`payload sha256      ${payloadSha256}`);
console.log(`finalTotalsDigest   ${finalTotalsDigest}`);
console.log(`finalWinsDigest     ${finalWinsDigest}`);
for (const p of [games.path, winsOut.path, events.path, manifestPath]) {
  console.log(`wrote ${p}`);
}
