/* eslint-disable */
/**
 * MISC W3A (F05) — per-state, per-viewport geometry of the Daily result pages.
 *
 * Plain `playwright` script, run against a Vite dev server:
 *
 *   node e2e/misc-w3a/measure.cjs
 *   W3A_BASE=http://127.0.0.1:8131  W3A_OUT=<file.json>  W3A_SHOTS=<dir>
 *   W3A_ONLY=<substring of state id>  W3A_VP=<substring of viewport id>
 *   W3A_REDUCED=1          prefers-reduced-motion: reduce
 *   W3A_FONTS=system       measure the OS fallback faces instead of bundled Inter/Cinzel
 *   W3A_CHANNEL=           browser channel; default "msedge" (set to "" for bundled Chromium, as CI does)
 *   W3A_PARALLEL=4         pages measured at once (each in its own context)
 *
 * The measurement itself lives in `lib.cjs`, shared with the regression spec.
 * Output: { results: [{state, vp, docH, travel, regions, primary, controls,
 * clipped, flip, ...}] }. `table.cjs` prints before/after tables; `compare.cjs`
 * asserts the same-environment relative contract used by CI.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const lib = require("./lib.cjs");

const BASE = process.env.W3A_BASE || "http://127.0.0.1:8131";
const OUT = process.env.W3A_OUT || path.join(__dirname, "measure.out.json");
const SHOTS = process.env.W3A_SHOTS || "";
const ONLY = process.env.W3A_ONLY || "";
const ONLY_VP = process.env.W3A_VP || "";
const REDUCED = process.env.W3A_REDUCED === "1";
const FONTS = process.env.W3A_FONTS === "system" ? "system" : "bundled";
const CHANNEL = process.env.W3A_CHANNEL === undefined ? "msedge" : process.env.W3A_CHANNEL;
const PARALLEL = Math.max(1, Number(process.env.W3A_PARALLEL || 1));

async function one(browser, s, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    hasTouch: vp.phone, isMobile: false, deviceScaleFactor: vp.phone ? 2 : 1,
    reducedMotion: REDUCED ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  let rec = { state: s.id, vp: vp.id };
  try {
    await lib.prepare(page, s, { reduced: REDUCED });
    await lib.open(page, BASE, s, { fonts: FONTS });
    await lib.settle(page, s, { reduced: REDUCED });
    rec = { ...rec, ...(await lib.measureState(page, s)) };
    // scrolled to the bottom: is the primary reachable, and fully clear?
    rec.atBottom = await page.evaluate((primary) => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const a = document.querySelector(`[data-testid="${primary}"]`);
      if (!a) return null;
      const b = a.getBoundingClientRect();
      return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), inView: b.top >= 0 && b.bottom <= innerHeight + 0.5 };
    }, s.primary);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (s.flip) rec.flip = await page.evaluate(lib.flipAnalysis);
    else rec.cls = await page.evaluate(() => +window.__cls.toFixed(4));
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${s.id}__${vp.id}__fold.png`) });
      if (rec.travel > 2) await page.screenshot({ path: path.join(SHOTS, `${s.id}__${vp.id}__full.png`), fullPage: true });
    }
  } catch (e) {
    rec.error = String(e).slice(0, 300);
  }
  rec.pageErrors = errors;
  await ctx.close();
  return rec;
}

(async () => {
  const browser = await chromium.launch({ ...(CHANNEL ? { channel: CHANNEL } : {}), headless: true });
  const todo = [];
  for (const s of lib.STATES) {
    if (ONLY && !s.id.includes(ONLY)) continue;
    for (const vp of lib.VIEWPORTS) {
      if (ONLY_VP && !vp.id.includes(ONLY_VP)) continue;
      todo.push([s, vp]);
    }
  }
  const results = new Array(todo.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= todo.length) return;
      const [s, vp] = todo[i];
      const rec = await one(browser, s, vp);
      results[i] = rec;
      console.log(`${s.id.padEnd(22)} ${vp.id.padEnd(13)} ${rec.error ? "ERR " + rec.error : `docH ${rec.docH} vh ${rec.vh} travel ${rec.travel} cta ${rec.primary ? rec.primary.top + "-" + rec.primary.bottom : "-"} inView ${rec.primaryInView} ovX ${rec.overflowX}${rec.clipped && rec.clipped.length ? " CLIPPED " + rec.clipped.map((c) => `${c.tag}[${c.owner}]"${c.text}" ${c.scrollW}>${c.clientW}`).join(",") : ""}${rec.flip ? ` heroDrift ${rec.flip.heroDrift} actDrift ${rec.flip.actDrift} cls ${rec.flip.cls}` : ""}`}`);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  fs.writeFileSync(OUT, JSON.stringify({ base: BASE, reduced: REDUCED, fonts: FONTS, channel: CHANNEL || "chromium", results }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
