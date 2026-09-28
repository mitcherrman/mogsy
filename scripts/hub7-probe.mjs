// HUB7 before/after composition probe.
// usage: node hub7-probe.mjs <label> <baseUrl> <outDir> [preview]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [label, base, out, mode] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "320", width: 320, height: 640, mobile: true },
  { name: "390-200", width: 390, height: 844, mobile: true, scale: 2 },
  { name: "320-200", width: 320, height: 640, mobile: true, scale: 2 },
];

const browser = await chromium.launch({ channel: "msedge" });
const results = [];
for (const s of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
    deviceScaleFactor: 1,
  });
  // The first-visit gate sends a new visitor to the landing page; a returning
  // visitor lands on the hub, which is what is being certified.
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("quiz:gate:hub_visited", "1"); } catch { /* */ }
  });
  const page = await ctx.newPage();
  const url = mode === "preview" ? `${base}/dev/lobby-preview` : `${base}/quiz`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[data-testid="hub-record-section"]', { timeout: 120000 });
  if (s.scale) await page.addStyleTag({ content: `html { font-size: ${16 * s.scale}px !important; }` });
  await page.waitForTimeout(2500);

  if (mode === "preview") {
    const rows = page.locator('[data-testid="daily-run-row"]');
    await rows.first().waitFor({ timeout: 60000 });
    const toggle = rows.first().locator("button").first();
    await toggle.click();
    await page.waitForTimeout(1200);
  }

  const m = await page.evaluate(() => {
    const top = (sel) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
    };
    const text = document.body.innerText;
    return {
      heroTop: top('[data-testid="hub-ranked-section"]'),
      quickStudyTop: top('[data-testid="hub-quick-study"]'),
      railTop: top('[data-testid="quiz-category-rail"]'),
      packsTop: top('[data-testid="hub-practice-section"]'),
      recordTop: top('[data-testid="hub-record-section"]'),
      dailyTop: top('[data-testid="daily-run-row"]'),
      hasQuickStudy: /quick study/i.test(text),
      hasPracticePacks: text.includes("Practice Packs") || /PRACTICE PACKS/.test(text),
      hasPracticeBuilder: /practice builder/i.test(text),
      railTiles: document.querySelectorAll('[data-testid="quiz-category-rail-tile"]').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      docHeight: document.documentElement.scrollHeight,
    };
  });
  const from = Math.max(0, (m.railTop ?? 0) - 80);
  const to = mode === "preview" && m.dailyTop
    ? m.dailyTop + (s.mobile ? 1800 : 1100)
    : (m.recordTop ?? from) + (s.mobile ? 700 : 500);
  const height = Math.min(Math.max(400, to - from), m.docHeight - from);
  await page.screenshot({
    path: `${out}/${label}-${s.name}.png`,
    fullPage: true,
    clip: { x: 0, y: from, width: s.width, height },
  });
  if (mode !== "preview") {
    await page.screenshot({ path: `${out}/${label}-${s.name}-first-screen.png` });
  }
  results.push({ label, size: s.name, gapRailToRecord: m.recordTop - m.railTop, ...m });
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/${label}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map((r) => ({
  size: r.size, qs: r.hasQuickStudy, packs: r.hasPracticePacks, builder: r.hasPracticeBuilder,
  tiles: r.railTiles, railTop: r.railTop, recordTop: r.recordTop, gap: r.gapRailToRecord, ovx: r.overflowX,
}))));
