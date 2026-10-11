// PPQ2-E x main integration smoke: SPA metadata from a noindex route to the
// public Pro Play Quiz, then question -> reveal -> Next -> completion on the
// live API.   node docs/handoffs/ppq2e/integration-smoke.cjs <outDir> [viewports]
const path = require("path");
const fs = require("fs");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const BASE = process.env.PPQ_BASE || "http://localhost:5284";
const [outDir, vpArg] = process.argv.slice(2);
const viewports = (vpArg || "390x844,1440x900").split(",").map((s) => { const [w, h] = s.split("x").map(Number); return { width: w, height: h }; });
fs.mkdirSync(outDir, { recursive: true });

const META = () => ({
  path: location.pathname,
  title: document.title,
  robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
  description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
  ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? null,
});

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const out = [];
  try {
    for (const vp of viewports) {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.route(/supabase\.co\//, (r) => r.abort());
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const r = { viewport: `${vp.width}x${vp.height}` };
      // 1. A noindex route first (the Ranked host), then SPA-navigate.
      await page.goto(`${BASE}/quiz/ranked`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.getAttribute("content")?.includes("noindex"), null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      r.before = await page.evaluate(META);
      await page.evaluate(() => { history.pushState({}, "", "/lol/pro-play/quiz"); dispatchEvent(new PopStateEvent("popstate")); });
      await page.waitForSelector('[data-pro-play-phase="question"]', { timeout: 120000 });
      await page.waitForTimeout(1200);
      r.afterSpa = await page.evaluate(META);
      r.robotsDirectives = await page.$$eval('meta[name="robots"], meta[name="googlebot"]', (ms) => ms.map((m) => `${m.getAttribute("name")}=${m.getAttribute("content")}`));
      await page.screenshot({ path: path.join(outDir, `smoke-question-${r.viewport}.jpg`), type: "jpeg", quality: 80 });
      // 2. Reveal, Next, play out, completion.
      await page.click('[data-quiz-choice="0"]');
      await page.waitForSelector('[data-pro-play-phase="revealed"]', { timeout: 60000 });
      await page.waitForTimeout(1000);
      r.reveal = await page.evaluate(() => ({ footer: !!document.querySelector("[data-pp-reveal-footer]"), values: document.querySelectorAll("[data-pp-reveal-display]").length, timeline: document.querySelector("[data-current-round]")?.getAttribute("data-current-round") }));
      await page.screenshot({ path: path.join(outDir, `smoke-reveal-${r.viewport}.jpg`), type: "jpeg", quality: 80 });
      await page.click('[data-testid="pro-play-next"]');
      await page.waitForSelector('[data-pro-play-phase="question"]', { timeout: 60000 });
      await page.waitForTimeout(500);
      r.afterNext = await page.evaluate(() => ({ header: document.querySelector('[data-testid="ranked-header-title"]')?.textContent, focusStem: !!document.activeElement?.closest('[data-surface-region="prompt"]'), timeline: document.querySelector("[data-current-round]")?.getAttribute("data-current-round") }));
      for (let n = 2; n <= 10; n++) {
        await page.waitForSelector('[data-pro-play-phase="question"] [data-quiz-choice]:not([disabled])', { timeout: 60000 });
        await page.click('[data-quiz-choice="0"]');
        await page.waitForSelector('[data-pro-play-phase="revealed"]', { timeout: 60000 });
        await page.click('[data-testid="pro-play-next"]');
      }
      await page.waitForSelector('[data-pro-play-phase="complete"]', { timeout: 60000 });
      await page.waitForTimeout(700);
      r.completion = await page.evaluate(() => {
        const hud = document.querySelector("nav.global-hud")?.getBoundingClientRect().bottom ?? 0;
        const vis = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return !!b && b.top >= hud - 0.5 && b.bottom <= innerHeight + 0.5; };
        return { focus: document.activeElement?.textContent?.trim(), heading: vis("[data-pro-play-summary-heading]"), score: document.querySelector('[data-testid="pro-play-final-score"]')?.textContent, scoreVisible: vis('[data-testid="pro-play-final-score"]'), playAgainVisible: vis('[data-testid="pro-play-restart"]') };
      });
      r.metaAtEnd = await page.evaluate(META);
      await page.screenshot({ path: path.join(outDir, `smoke-completed-${r.viewport}.jpg`), type: "jpeg", quality: 80 });
      r.errors = errors;
      out.push(r);
      console.log(JSON.stringify(r, null, 1));
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(outDir, "integration-smoke.json"), JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
