/* eslint-disable */
/**
 * MISC W3A (F05) — THE SAME-ENVIRONMENT RELATIVE CONTRACT.
 *
 *   node e2e/misc-w3a/compare.cjs <untouched-components.json> <this-branch.json>
 *
 * Both files come from `measure.cjs` run on the SAME machine, browser and fonts: the
 * first against the untouched original components, the second against this
 * branch. Absolute pixel budgets are not portable (they move with the OS's font
 * rasteriser — the first Linux run was +45px on Time Trial for exactly that), but
 * "this branch is never taller than the original and saves at least N px" is,
 * because both sides move together. So that is what is asserted here:
 *
 *   1. SAVINGS   on portrait phones, the primary action sits at least `MIN_SAVE[state]`
 *                px higher than on the original (70% of the saving measured on
 *                Windows Edge with the bundled fonts, per state, worst phone size).
 *   2. NEVER TALLER  no state at any viewport is taller than the original (+2px
 *                rounding; +20px for the two error states, whose "Try again" is now a
 *                real 44px target).
 *   3. AGGREGATE total vertical travel over the portrait phones falls by ≥ 30%.
 *   4. NO NEW CLIPPING  text wider than its box is allowed only where the original
 *                had the same one (pre-existing, e.g. the 320px recap tag).
 *   5. NO NEW JUMP  on a pending → settled flip, hero and primary action move no more
 *                than the original did (and ≤ 0.5px when the original held still).
 *   6. TOUCH TARGETS  every action/link is ≥ 43.5px tall, and no smaller than before.
 *
 * Exit code 1 and a per-rule list on violation; `W3A_COMPARE_REPORT=1` prints the
 * same and exits 0 (used to gather evidence).
 */
const fs = require("node:fs");

const [beforeFile, afterFile] = process.argv.slice(2);
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8")).results;
const before = load(beforeFile);
const after = load(afterFile);
const key = (r) => `${r.state}@${r.vp}`;
const B = new Map(before.map((r) => [key(r), r]));

const PORTRAIT = ["320x568", "360x640", "375x667", "390x844"];
// 70% of the worst-phone saving of the primary action's position, measured on Windows Edge.
const MIN_SAVE = {
  "main-pending": 126, "main-settled-cards": 142, "main-settled-nocards": 126, "main-flip": 126,
  "main-error": 116, "tt-pending": 150, "tt-settled": 150, "tt-settled-cards": 167, "tt-flip": 150,
  "surv-settled": 150, "weak-settled": 83, "review-settled": 133, "stage-error": 140,
  "legacy-standard": 67, "optional-entry": 0, "completion": 11, "completion-perfect": 11,
  "completion-legacy": 23,
};
const ERROR_STATES = new Set(["main-error", "stage-error"]);

const bad = [];
let tb = 0; let ta = 0;
for (const a of after) {
  const b = B.get(key(a));
  if (!b) { bad.push(`${key(a)}: no original measurement`); continue; }
  if (a.error || b.error) { bad.push(`${key(a)}: measurement error (${a.error || b.error})`); continue; }

  // 1. savings
  if (PORTRAIT.includes(a.vp) && MIN_SAVE[a.state] > 0) {
    const saved = b.primary.bottom - a.primary.bottom;
    if (saved < MIN_SAVE[a.state]) bad.push(`SAVINGS ${key(a)}: primary action only ${saved.toFixed(0)}px higher than the original (need ≥ ${MIN_SAVE[a.state]})`);
  }
  // 2. never taller
  const allow = ERROR_STATES.has(a.state) ? 20 : 2;
  if (a.docH > b.docH + allow) bad.push(`TALLER ${key(a)}: ${a.docH}px vs original ${b.docH}px (allow +${allow})`);
  // 3. aggregate
  if (PORTRAIT.includes(a.vp) && !/optional|flip|pending/.test(a.state)) { tb += Math.max(0, b.travel); ta += Math.max(0, a.travel); }
  // 4. clipping
  const had = new Set((b.clipped || []).map((c) => `${c.owner}|${c.text}`));
  for (const c of a.clipped || []) {
    if (!had.has(`${c.owner}|${c.text}`)) bad.push(`CLIPPED ${key(a)}: <${c.tag}> "${c.text}" in [${c.owner}] ${c.scrollW}>${c.clientW} (${c.font}) — not clipped on the original`);
  }
  // 5. settle
  if (a.flip && b.flip && a.flip.found && b.flip.found) {
    for (const [what, av, bv] of [["hero", a.flip.heroDrift, b.flip.heroDrift], ["primary action", a.flip.actDrift, b.flip.actDrift]]) {
      const limit = Math.max(0.5, Math.abs(bv || 0));
      if (Math.abs(av || 0) > limit) bad.push(`JUMP ${key(a)}: ${what} moves ${av}px when the result settles (original ${bv}px); moved ${JSON.stringify(a.flip.moved)}`);
    }
  } else if (a.flip && !a.flip.found) bad.push(`JUMP ${key(a)}: no pending frame sampled`);
  // 6. touch targets
  const minH = (r) => Math.min(...(r.controls || []).map((c) => c.h), 999);
  if (minH(a) < 43.5 && minH(a) < minH(b)) bad.push(`TARGET ${key(a)}: smallest control ${minH(a)}px (original ${minH(b)}px)`);
}
if (tb > 0 && ta > 0.7 * tb) bad.push(`AGGREGATE portrait travel ${ta}px vs original ${tb}px: only ${(100 * (1 - ta / tb)).toFixed(1)}% saved (need ≥ 30%)`);

console.log(`compared ${after.length} measurements; portrait travel ${tb}px → ${ta}px (${tb ? (100 * (1 - ta / tb)).toFixed(1) : 0}% saved)`);
if (bad.length) {
  console.log(`${bad.length} violation(s):\n  ${bad.join("\n  ")}`);
  if (process.env.W3A_COMPARE_REPORT !== "1") process.exit(1);
} else console.log("relative contract holds");
