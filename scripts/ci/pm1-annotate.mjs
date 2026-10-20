// PM1 — surface the browser run's failures and fit measurements as GitHub
// annotations, which are readable on the public run without signing in.
// Reads test-results/pm1/report.json (Playwright JSON reporter) and
// test-results/pm1/run.log (the `[pm1]` measurement lines). Never fails.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const enc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
const strip = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");

const failures = [];
if (existsSync("test-results/pm1/report.json")) {
  const report = JSON.parse(readFileSync("test-results/pm1/report.json", "utf8"));
  const walk = (suite, trail) => {
    for (const s of suite.suites ?? []) walk(s, [...trail, s.title]);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        for (const r of t.results ?? []) {
          if (r.status === "passed" || r.status === "skipped") continue;
          const err = (r.errors ?? [r.error]).filter(Boolean).map((e) => strip(e.message ?? e.value ?? "")).join("\n");
          failures.push({ title: [...trail, spec.title].filter(Boolean).join(" › "), err });
        }
      }
    }
  };
  walk(report, []);
}
for (const f of failures.slice(0, 9)) {
  console.log(`::error title=${enc(f.title.slice(0, 200))}::${enc(f.err.slice(0, 3500))}`);
}
if (existsSync("test-results/pm1/run.log")) {
  const lines = strip(readFileSync("test-results/pm1/run.log", "utf8")).split("\n").filter((l) => l.includes("[pm1]"))
    .map((l) => l.slice(l.indexOf("[pm1]")));
  // GitHub keeps 10 notices per step: pack the measurements into chunks.
  const chunks = [];
  let cur = "";
  for (const l of lines) {
    if ((cur + l).length > 3800) { chunks.push(cur); cur = ""; }
    cur += `${l}\n`;
  }
  if (cur) chunks.push(cur);
  chunks.slice(0, 9).forEach((c, i) => console.log(`::notice title=pm1 measurements ${i + 1}/${chunks.length}::${enc(c)}`));
}

// The first-screen measurements, one notice per label (branch / main).
if (existsSync("test-results/pm1")) {
  for (const f of readdirSync("test-results/pm1").filter((n) => /^hub-measure-.*\.json$/.test(n))) {
    const data = JSON.parse(readFileSync(`test-results/pm1/${f}`, "utf8"));
    const rows = Object.entries(data).map(([vp, m]) =>
      `${vp}: lobby.bottom=${m.lobby?.bottom} quick=${m.quickStudy?.top}-${m.quickStudy?.bottom} rail=${m.rail?.top}-${m.rail?.bottom} (h${m.rail?.height}) more.top=${m.more?.top} record.top=${m.record?.top}`);
    console.log(`::notice title=${enc(f)}::${enc(rows.join(" | "))}`);
  }
}
