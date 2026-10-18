/**
 * ACADEMY STARTUP — summarise run.mjs output as Markdown tables.
 *
 *   node scripts/academy-startup/report.mjs <runs-dir> [<runs-dir> ...]
 *
 * Landing rows (path "/") are relative to the client-side hand-off to /lol;
 * direct rows (path "/lol") to navigation start. Medians, with (min–max).
 * Runs with fewer than 100 animation frames (a background-throttled window)
 * are counted as invalid and left out.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const median = (v) => {
  const x = v.filter((n) => typeof n === "number").sort((a, b) => a - b);
  if (!x.length) return null;
  const m = Math.floor(x.length / 2);
  return Math.round(x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2);
};
const cell = (v) => {
  const x = v.filter((n) => typeof n === "number");
  if (!x.length) return "—";
  return x.length > 1 ? `${median(x)} (${Math.min(...x)}–${Math.max(...x)})` : String(x[0]);
};
const gaps = (frames, a, b) => {
  const seg = frames.filter((f) => f >= a && f <= b);
  return seg.slice(1).map((f, i) => f - seg[i]);
};
const lastEnd = (res, rx) => {
  const hit = res.filter((r) => rx.test(r.n));
  return hit.length ? Math.max(...hit.map((r) => r.e)) : null;
};

const main = [];
const net = [];
for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && !n.endsWith("trace.json")).sort()) {
    const { scenario: sc, results } = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const runs = results.filter((r) => r.A);
    const valid = runs.filter((r) => r.A.frames.length > 100);
    if (!valid.length) continue;
    const direct = sc.path === "/lol";
    const M = {};
    const push = (k, v) => (M[k] ??= []).push(v);
    for (const r of valid) {
      const { cond: c, marks: m, frames } = r.A;
      const nav = direct ? 0 : (m.navLol ?? c.onLol);
      const rel = (k) => (c[k] != null && nav != null ? Math.round(c[k] - nav) : null);
      if (!direct) push("nav", Math.round(nav));
      for (const k of ["root", "framesLoaded", "visibleCoversLoaded", "patchLoaded", "vcNoPatch", "visuallyComplete"]) push(k, rel(k));
      if (c.root != null) {
        const g = gaps(frames, c.root, c.root + 2500);
        push("gap", g.length ? Math.round(Math.max(...g)) : null);
        push("drop", Math.round(g.filter((x) => x > 34).reduce((s, x) => s + x - 16.7, 0)));
        const steady = frames.filter((t) => t >= c.root + 3000 && t <= c.root + 8000);
        push("fps", steady.length > 10 ? Math.round((steady.length / ((steady.at(-1) - steady[0]) / 1000)) * 10) / 10 : null);
      }
      // the shell's startup surface shown after the hand-off, if any
      const s = r.A.surface ?? [];
      let surf = 0;
      for (let i = 0; i < s.length; i++) if (s[i][1] && s[i][0] >= nav - 5) surf += (s[i + 1]?.[0] ?? s[i][0]) - s[i][0];
      push("surface", direct ? null : surf);
      // network milestones, relative to the same origin as above
      const at = (rx) => { const e = lastEnd(r.res, rx); return e == null ? null : Math.round(e - nav); };
      push("n_chunk", at(/\/assets\/AcademyCorePage-[^/]*\.js$/));
      push("n_manifest", at(/\/api\/assets\/champions$/));
      push("n_frame", at(/academy-book-frame/));
      push("n_covers", at(/\/splash\/0_default/));
      push("n_patch", at(/\/api\/patch-reports\/[^/]+$/));
      push("n_quiz", at(/\/assets\/Quiz-[^/]*\.js$/));
      push("n_favicon", r.res.filter((x) => /mogsy-logo\.png|favicon-48\.png/.test(x.n)).length);
      if (m.veilLift != null) {
        push("lift", Math.round(m.veilLift - nav));
        const g2 = gaps(frames, m.veilLift, m.veilLift + 1500);
        push("post", g2.length ? Math.round(Math.max(...g2)) : null);
      }
    }
    const env = `${sc.browser}${sc.headless ? " headless" : ""} ${sc.w}×${sc.h}@${sc.dpr}${sc.mobile ? " mobile-emu" : ""}`;
    const cond = [sc.cache, sc.net !== "none" ? sc.net : null, sc.cpu > 1 ? `cpu×${sc.cpu}` : null, sc.reduced ? "reduced" : null,
      sc.cores ? `cores=${sc.cores}` : null, sc.veil ? `veil cap ${sc.veil.maxMs}` : null].filter(Boolean).join(", ");
    const n = `${valid.length}${runs.length > valid.length ? ` (+${runs.length - valid.length} invalid)` : ""}`;
    const g = (k) => cell(M[k] ?? []);
    main.push([sc.label, env, cond, sc.path, n, g("root"), g("surface"), g("framesLoaded"), g("visibleCoversLoaded"), g("patchLoaded"),
      g("vcNoPatch"), g("visuallyComplete"), g("gap"), g("drop"), g("fps"), g("lift"), g("post")]);
    net.push([sc.label, n, g("n_chunk"), g("n_manifest"), g("n_frame"), g("n_covers"), g("n_patch"), g("n_quiz"), g("n_favicon")]);
  }
}
const table = (hdr, rows) => [`| ${hdr.join(" | ")} |`, `|${"---|".repeat(hdr.length)}`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
console.log(table(["scenario", "browser", "conditions", "path", "n", "mount", "startup surface after hand-off", "frames", "visible covers", "Patch",
  "complete w/o Patch", "complete", "worst frame (mount→+2.5 s)", "dropped ms", "fps 3–8 s", "veil lift", "worst frame after lift"], main));
console.log("\nNetwork milestones (response end, same origin as above; favicon = number of favicon downloads):\n");
console.log(table(["scenario", "n", "Academy chunk", "manifest", "book frame", "covers", "Patch detail", "Quiz chunk", "favicon fetches"], net));
