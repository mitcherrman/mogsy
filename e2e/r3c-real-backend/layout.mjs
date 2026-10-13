// DEV ONLY (RECONSTRUCT-R3C). Reads the *.frames.json files play-match.mjs wrote and reports the
// shared-arena geometry the R3C brief names, per run:
//   header   height range over the live match (end screen excluded) and every change of it
//   board    largest top jump of the board / left rail / module while the header changed
//   grid     the arena grid row's own overflow (scrollHeight - clientHeight), max over the match
//   outro    the match outro's box vs the viewport, and the document's scroll extent meanwhile
//   page     max scrollY and document overflow (scrollHeight - clientHeight) during play
//
//   node e2e/r3c-real-backend/layout.mjs <dir> [--json out.json]
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".frames.json")).sort();
const r1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const report = {};

for (const fn of files) {
  const frames = JSON.parse(fs.readFileSync(path.join(dir, fn), "utf8"));
  const live = frames.filter((f) => !f.host.includes("over"));
  const hdr = live.filter((f) => f.r.header);
  const heights = hdr.map((f) => f.r.header[3]);
  const changes = [];
  let jump = { board: 0, railL: 0, module: 0 };
  for (let i = 1; i < hdr.length; i++) {
    const a = hdr[i - 1], b = hdr[i];
    if (Math.abs(a.r.header[3] - b.r.header[3]) > 0.5) {
      changes.push({ t: b.t, step: b.step, host: b.host, from: a.r.header[3], to: b.r.header[3] });
      for (const k of Object.keys(jump)) {
        if (a.r[k] && b.r[k]) jump[k] = Math.max(jump[k], Math.abs(a.r[k][0] - b.r[k][0]));
      }
    }
  }
  const outroFrames = frames.filter((f) => f.r.outro);
  const outro = outroFrames.length ? {
    box: outroFrames[outroFrames.length - 1].r.outro,
    bottomMax: r1(Math.max(...outroFrames.map((f) => f.r.outro[0] + f.r.outro[3]))),
    topMin: r1(Math.min(...outroFrames.map((f) => f.r.outro[0]))),
    viewportH: outroFrames[0].ih,
    belowFold: r1(Math.max(...outroFrames.map((f) => f.r.outro[0] + f.r.outro[3] - f.ih))),
    docOverflow: Math.max(...outroFrames.map((f) => f.docSH - f.docCH)),
    scrollYMax: Math.max(...outroFrames.map((f) => f.sy)),
    result: outroFrames.at(-1).r.outroResult ?? null,
    score: outroFrames.at(-1).r.outroScore ?? null,
  } : null;
  const grid = live.filter((f) => typeof f.gridOv === "number");
  report[fn.replace(".frames.json", "")] = {
    header: { min: heights.length ? Math.min(...heights) : null, max: heights.length ? Math.max(...heights) : null,
      changes: changes.slice(0, 12), nChanges: changes.length },
    jumpWhileHeaderChanged: { board: r1(jump.board), railL: r1(jump.railL), module: r1(jump.module) },
    grid: grid.length ? { overflowMax: Math.max(...grid.map((f) => f.gridOv)),
      box: grid[grid.length - 1].r.grid ?? null } : null,
    outro,
    page: { scrollYMax: Math.max(0, ...live.map((f) => f.sy)),
      docOverflowMax: Math.max(0, ...live.map((f) => f.docSH - f.docCH)) },
    frames: frames.length,
  };
}
for (const [k, v] of Object.entries(report)) {
  console.log(`\n=== ${k}`);
  console.log(`  header  ${v.header.min}..${v.header.max} px, ${v.header.nChanges} change(s)`,
    v.header.changes.slice(0, 4).map((c) => `${c.from}->${c.to}@${c.step}[${c.host}]`).join("  "));
  console.log(`  jump    board ${v.jumpWhileHeaderChanged.board}  railL ${v.jumpWhileHeaderChanged.railL}  module ${v.jumpWhileHeaderChanged.module}`);
  console.log(`  grid    overflow max ${v.grid?.overflowMax ?? "-"}  box ${JSON.stringify(v.grid?.box ?? null)}`);
  console.log(`  outro   ${v.outro ? `box ${JSON.stringify(v.outro.box)} bottom ${v.outro.bottomMax}/${v.outro.viewportH} (below fold ${v.outro.belowFold}) doc overflow ${v.outro.docOverflow} scrollY ${v.outro.scrollYMax} result ${JSON.stringify(v.outro.result)} score ${JSON.stringify(v.outro.score)}` : "-"}`);
  console.log(`  page    scrollY max ${v.page.scrollYMax}  doc overflow max ${v.page.docOverflowMax}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
