// PPQ2-D keyboard / screen-reader check in a real browser (headless Edge).
// Run with cwd = the capture worktree:  node a11y.cjs [fixture] [WxH]
const path = require("path");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const BASE = process.env.PPQ_BASE || "http://localhost:5264";
const [fixture = "champion_player", vp = "1440x900"] = process.argv.slice(2);
const [width, height] = vp.split("x").map(Number);

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route(/supabase\.co\/|railway\.app\/|fonts\.(gstatic|googleapis)\.com\//, (r) => r.abort());
    await page.goto(`${BASE}/src/components/pro-play/arena/reveal/__preview__/index.html?fixture=${fixture}&grade=real`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("[data-pp-reveal-footer]", { timeout: 120000 });
    await page.waitForTimeout(1000);
    const out = {};
    // Revealed tablets: disabled buttons, names stay "A. Label".
    out.tablets = await page.$$eval("[data-quiz-choice]", (bs) => bs.map((b) => ({ name: b.getAttribute("aria-label"), disabled: b.disabled })));
    // Tab order: collect every stop until the Source trigger.
    const stops = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const s = await page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("aria-label") || a.textContent || a.tagName).trim().slice(0, 40) : null; });
      stops.push(s);
      if (await page.evaluate(() => !!document.activeElement?.matches("[data-pp-reveal-source]"))) break;
    }
    out.tabStopsToSource = stops;
    out.focusVisibleRing = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow !== "none");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    out.openedByEnter = await page.evaluate(() => ({
      open: !!document.querySelector("[data-pp-reveal-source-panel]"),
      expanded: document.querySelector("[data-pp-reveal-source]").getAttribute("aria-expanded"),
      role: document.querySelector("[data-pp-reveal-source-panel]")?.getAttribute("role"),
      focusInPanel: !!document.activeElement?.closest("[data-pp-reveal-source-panel]"),
    }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    out.afterEscape = await page.evaluate(() => ({
      open: !!document.querySelector("[data-pp-reveal-source-panel]"),
      focusOnTrigger: !!document.activeElement?.matches("[data-pp-reveal-source]"),
    }));
    await page.keyboard.press("Tab");
    out.nextStop = await page.evaluate(() => document.activeElement?.textContent?.trim());
    // What a screen reader gets from the footer.
    out.status = await page.$eval("[data-pp-reveal-verdict]", (e) => ({ role: e.getAttribute("role"), text: e.textContent }));
    out.readout = await page.$$eval("[data-pp-reveal-readout] li", (ls) => ls.map((l) => l.textContent));
    out.footerName = await page.$eval("[data-pp-reveal-footer]", (e) => e.getAttribute("aria-label"));
    console.log(JSON.stringify(out, null, 1));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
