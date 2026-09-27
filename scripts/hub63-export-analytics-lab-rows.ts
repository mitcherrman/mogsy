/**
 * HUB6.3D — write the Analytics Lab's production-shaped Daily persistence rows
 * as canonical JSON, for `hub63-generate-analytics-lab.py`.
 *
 *   npx tsx scripts/hub63-export-analytics-lab-rows.ts <out.json>
 */
import { writeFileSync } from "node:fs";
import { analyticsLabInput } from "../src/pages/dev/lobby-preview/history/analyticsLabInput";

const out = process.argv[2];
if (!out) throw new Error("usage: hub63-export-analytics-lab-rows.ts <out.json>");
writeFileSync(out, analyticsLabInput(), "utf8");
console.log("wrote", out);
