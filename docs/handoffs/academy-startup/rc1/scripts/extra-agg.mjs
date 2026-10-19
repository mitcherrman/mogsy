// FCP, hand-off time, vendor-charts / Quiz request timing per scenario file (ms from navigation start).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const med = (v) => { const x = v.filter((n) => typeof n === "number").sort((a, b) => a - b); if (!x.length) return "—"; const m = Math.floor(x.length / 2); const md = Math.round(x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2); return x.length > 1 ? `${md} (${x[0]}–${x.at(-1)})` : String(md); };
console.log("| scenario | n | landing FCP | hand-off (navLol) | vendor-charts start→end | Quiz chunk start→end | LobbyChart | JS bytes before hand-off (kB, same-origin) |");
console.log("|---|---|---|---|---|---|---|---|");
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
  const { scenario: sc, results } = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const runs = results.filter((r) => r.A);
  const M = {};
  const push = (k, v) => (M[k] ??= []).push(v);
  for (const r of runs) {
    const fcp = r.A.paint.find((p) => p[0] === "first-contentful-paint");
    push("fcp", fcp ? fcp[1] : null);
    const nav = r.A.marks.navLol ?? null;
    push("nav", nav != null ? Math.round(nav) : null);
    const ch = r.res.find((x) => /vendor-charts-/.test(x.n));
    push("chS", ch ? ch.s : null); push("chE", ch ? ch.e : null);
    const q = r.res.find((x) => /\/assets\/Quiz-[^/]*\.js/.test(x.n));
    push("qS", q ? q.s : null); push("qE", q ? q.e : null);
    const lc = r.res.find((x) => /LobbyChart-/.test(x.n));
    push("lc", lc ? lc.s : null);
    if (nav != null) push("js", Math.round(r.res.filter((x) => /127\.0\.0\.1.*\.js$/.test(x.n) && x.e <= nav).reduce((s, x) => s + (x.ts || 0), 0) / 1024));
  }
  const pair = (a, b) => (M[a].some((x) => x != null) ? `${med(M[a])} → ${med(M[b])}` : "not requested");
  console.log(`| ${sc.label} | ${runs.length} | ${med(M.fcp)} | ${sc.path === "/lol" ? "direct" : med(M.nav)} | ${pair("chS", "chE")} | ${pair("qS", "qE")} | ${M.lc.some((x) => x != null) ? med(M.lc) : "—"} | ${med(M.js ?? [])} |`);
}
