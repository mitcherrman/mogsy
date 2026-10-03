// node summarize.cjs <label> -> markdown tables (median over reps)
const path = require("path");
const label = process.argv[2];
const R = require(path.join(__dirname, "results", label, "results.json"));
const med = (xs) => { const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b); if (!v.length) return "—"; return v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2); };
const keys = [...new Set(R.map((r) => r.key))];
const hubKeys = keys.filter((k) => !k.includes(" "));
const destKeys = keys.filter((k) => k.includes(" "));
const bytes = (run, re) => run.requests.filter((q) => re.test(q.url) && q.bytes).reduce((a, q) => a + q.bytes, 0);
for (const which of ["cold", "warm"]) {
  console.log(`\n### ${label} — ${which} (ms from navigation start, median of ${R.filter((r) => r.key === hubKeys[0]).length})\n`);
  console.log("| viewport | FCP | Landing Mogzy | auto start | at /lol | /lol bg | shell/spines | covers (4) | Patch book (desktop) | Hub Mogzy | image bytes by hand-off+3s |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const k of hubKeys) {
    const runs = R.filter((r) => r.key === k).map((r) => r[which]);
    const m = (f) => med(runs.map((r) => f(r.marks)));
    const lm = runs.map((r) => (r.marks.landingMogzy !== undefined && r.marks.landingMogzy < (r.marks.hubPath ?? 1e9) ? r.marks.landingMogzy : null));
    const lmS = lm.every((x) => x === null) ? "not before hand-off" : med(lm);
    const imgB = med(runs.map((r) => r.requests.filter((q) => q.type === "Image" && q.bytes && q.end !== null && q.end <= (r.marks.hubPath ?? 0) + 3000).reduce((a, q) => a + q.bytes, 0)));
    console.log(`| ${k} | ${m((x) => x.fcp)} | ${lmS} | ${m((x) => x.autoStart)} | ${m((x) => x.hubPath)} | ${m((x) => x.hubBg)} | ${m((x) => x.hubFrame ?? x.hubSpine)} | ${m((x) => x.hubSplashAll)} | ${m((x) => x.hubBroadcast)} | ${m((x) => x.hubMogzy)} | ${typeof imgB === "number" ? (imgB / 1e6).toFixed(2) + " MB" : imgB} |`);
  }
  console.log(`\n| journey (${which}) | click→URL | click→content | route fallback seen | images pending at content | click→visible images settled | Leaguecraft guide Mogzy (click→) |`);
  console.log("|---|---|---|---|---|---|---|");
  for (const k of destKeys) {
    const ds = R.filter((r) => r.key === k).map((r) => (which === "cold" ? r.cold.dest : r.warm.dest)).filter(Boolean);
    if (!ds.length) continue;
    const d = (f) => med(ds.map((x) => (x.clickAt === undefined ? null : f(x))));
    console.log(`| ${k} | ${d((x) => x.pathAt - x.clickAt)} | ${d((x) => x.contentAt - x.clickAt)} | ${ds.map((x) => (x.fallbackFrom !== undefined ? `yes ${x.fallbackFrames}f/${x.fallbackLast - x.fallbackFrom + 16}ms` : "no")).join(", ")} | ${ds.map((x) => (x.pendingAtContent || []).length).join("/")} | ${d((x) => x.imagesSettledAt - x.clickAt)} | ${k.includes("/quiz") ? d((x) => (x.lcGuideMogzy ?? NaN) - x.clickAt) : "n/a"} |`);
  }
}
