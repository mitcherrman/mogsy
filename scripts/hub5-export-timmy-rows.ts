/**
 * HUB5 — write Timmy's Daily persistence rows as canonical JSON.
 *
 * The rows come from the raw facts in `src/pages/dev/lobby-preview/history/`
 * through the test-only builder. `hub5-generate-timmy-history.py` seeds them
 * into HUB2.1's schema and runs the real History route over them.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/hub5-export-timmy-rows.ts <out.json>
 */
import { writeFileSync } from "node:fs";
import { timmyHistoryInput } from "../src/pages/dev/lobby-preview/history/timmyHistoryInput";

const out = process.argv[2];
if (!out) throw new Error("usage: hub5-export-timmy-rows.ts <out.json>");
writeFileSync(out, timmyHistoryInput(), "utf8");
console.log("wrote", out);
