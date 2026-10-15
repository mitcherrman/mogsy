/**
 * GM-R1 — freeze the Rangefinder R1 content pool from the backend's range
 * authority. READ-ONLY on the backend: it opens one committed JSON file and
 * writes one fixture here. Nothing is fabricated: every eligible record is a
 * verbatim CAST_RANGE the wiki publishes, with the citing revision.
 *
 *   npx tsx scripts/rangefinder/captureRangeAuthority.ts <path to range_authority.json> [backend commit sha]
 *
 * Output: src/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
import { buildRangeAuthorityCapture, type RangeAuthorityRecord } from "../../src/lib/rangefinder/eligibility";

const [, , input, commit] = process.argv;
if (!input) {
  console.error("usage: captureRangeAuthority.ts <range_authority.json> [backend commit]");
  process.exit(2);
}
const rows = JSON.parse(readFileSync(resolve(input), "utf8")) as RangeAuthorityRecord[];
const capture = buildRangeAuthorityCapture(rows, {
  file: "champion_ability_canonical/data/range_authority.json",
  repoCommit: commit ?? null,
  authorityHost: "wiki.leagueoflegends.com",
}, new Date().toISOString());
const out = resolve(__dirname, "../../src/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json");
writeFileSync(out, JSON.stringify(capture, null, 1) + "\n");
console.log(`population ${capture.population} · eligible ${capture.eligible.length} · excluded ${capture.excluded.length}`);
const byReason: Record<string, number> = {};
for (const e of capture.excluded) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
console.table(byReason);
