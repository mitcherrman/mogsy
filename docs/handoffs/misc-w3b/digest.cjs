// Prints the before/after tables quoted in MISC_W3B_PLAY_MOBILE.md from the
// JSON the capture harness wrote. Usage: node digest.cjs <logsDir> <surface> <view> [prefixBefore=before] [prefixAfter=after]
const fs = require("fs");
const path = require("path");
const [, , DIR, SURFACE, VIEW, PB = "before", PA = "after"] = process.argv;
const load = (p) => JSON.parse(fs.readFileSync(path.join(DIR, `${p}-${SURFACE}-${VIEW}.json`), "utf8"));
const b = load(PB);
const a = load(PA);
const cell = (m) => {
  if (!m || m.error) return "(could not open)";
  const vh = m.viewport.vh;
  const clipped = Math.max(0, Math.round(m.sheet.b - vh));
  const c = m.controls;
  // Controls that cannot be seen without scrolling, and whether a scroll can reach them.
  const hidden = ["close", "rolePrev", "roleNext", "mode-ranked", "mode-daily", "mode-invite", "practice"]
    .filter((k) => c[k] && !c[k].visibleWithoutScrolling);
  const scrolls = m.bodyScroll && m.bodyScroll.scrolls;
  return `${Math.round(m.sheet.h)}px sheet` +
    (clipped ? `, **${clipped}px past the screen**` : ", fits") +
    `; body ${m.bodyScroll.clientHeight}/${m.bodyScroll.scrollHeight}` +
    (hidden.length ? `; off-screen: ${hidden.join(", ")}${scrolls ? " (scrollable)" : " (NOT scrollable)"}` : "; all in view");
};
console.log("| viewport | before | after |\n|---|---|---|");
for (const id of Object.keys(a.viewports)) console.log(`| ${id} | ${cell(b.viewports[id])} | ${cell(a.viewports[id])} |`);
