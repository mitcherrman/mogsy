// Seamless top HUD: compares the `before` (base source) and `after` (head)
// geometry records written by e2e/academy-seamless-hud.spec.ts and fails if any
// page content box, the document size or the HUD itself moved. Prints the seam
// scores before → after. Usage: node e2e/academy-seamless-hud-compare.mjs <dir>
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "test-results/seamless-hud";
const load = (label) => JSON.parse(readFileSync(path.join(dir, label, "geometry.json"), "utf8"));
const before = load("before");
const after = load("after");

const TOL = 0.5;
const failures = [];
const lines = ["| viewport | seam across (before → after) | ordinary row step | geometry |", "|---|---|---|---|"];

for (const vp of Object.keys(after)) {
  const b = before[vp], a = after[vp];
  if (!b) { failures.push(`${vp}: no before record`); continue; }
  const moved = [];
  for (const key of Object.keys(a.geometry)) {
    const gb = b.geometry[key], ga = a.geometry[key];
    if (gb === null && ga === null) continue;
    if (typeof ga === "number") {
      if (Math.abs(ga - gb) > TOL) moved.push(`${key} ${gb} → ${ga}`);
      continue;
    }
    if (!gb || !ga) { moved.push(`${key} presence ${!!gb} → ${!!ga}`); continue; }
    for (const k of ["x", "y", "w", "h"]) if (Math.abs(ga[k] - gb[k]) > TOL) moved.push(`${key}.${k} ${gb[k]} → ${ga[k]}`);
  }
  if (moved.length) failures.push(`${vp}: ${moved.join("; ")}`);
  lines.push(`| ${vp} | ${b.seam.across} → ${a.seam.across} | ${a.seam.ordinary} | ${moved.length ? "MOVED" : "identical"} |`);
}

const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Seamless HUD: before → after\n\n${report}\n`);
if (failures.length) {
  console.error("Geometry changed:\n" + failures.join("\n"));
  process.exit(1);
}
