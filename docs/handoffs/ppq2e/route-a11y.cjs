// PPQ2-E — keyboard, screen-reader and reduced-motion check of the PRODUCTION
// route /lol/pro-play/quiz on the live API (one guest session per run).
//   node docs/handoffs/ppq2e/route-a11y.cjs [WxH] [reduce]
// `reduce` emulates the OS reduced-motion preference.
const path = require("path");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const BASE = process.env.PPQ_BASE || "http://localhost:5281";
const [vp = "1440x900", rm = ""] = process.argv.slice(2);
const [width, height] = vp.split("x").map(Number);

const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "BODY";
  return (a.getAttribute("data-testid") || a.getAttribute("aria-label") || a.textContent || a.tagName).trim().replace(/\s+/g, " ").slice(0, 48);
});

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: rm === "reduce" ? "reduce" : "no-preference" });
    await context.route(/supabase\.co\//, (r) => r.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/lol/pro-play/quiz`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('[data-pro-play-phase="question"] [data-quiz-choice]', { timeout: 120000 });
    await page.waitForTimeout(1500);
    const out = { viewport: vp, reducedMotion: rm === "reduce" };
    out.h1 = await page.$$eval("h1", (hs) => hs.map((h) => ({ text: h.textContent, srOnly: h.classList.contains("sr-only") })));
    out.title = await page.title();
    out.tablets = await page.$$eval("[data-quiz-choice]", (bs) => bs.map((b) => ({ name: b.getAttribute("aria-label"), disabled: b.disabled, tag: b.tagName })));
    // Tab from the top of the document until the first tablet has focus.
    const stops = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const s = await active(page);
      stops.push(s);
      if (await page.evaluate(() => !!document.activeElement?.matches("[data-quiz-choice]"))) break;
    }
    out.tabStopsToFirstTablet = stops;
    out.firstTabletFocusRing = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement);
      return cs.outlineStyle !== "none" || cs.boxShadow !== "none";
    });
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-pro-play-phase="revealed"]', { timeout: 60000 });
    await page.waitForTimeout(1200);
    out.afterEnter = {
      focus: await active(page),
      tabletsDisabled: await page.$$eval("[data-quiz-choice]", (bs) => bs.every((b) => b.disabled)),
      verdict: await page.$eval("[data-pp-reveal-verdict]", (e) => ({ role: e.getAttribute("role"), text: e.textContent })),
      readout: await page.$$eval("[data-pp-reveal-readout] li", (ls) => ls.map((l) => l.textContent)),
      readoutMode: await page.$eval("[data-pp-reveal-readout]", (e) => e.dataset.ppRevealReadout).catch(() => null),
      motion: await page.$$eval("[data-pp-reveal-motion]", (es) => [...new Set(es.map((e) => e.dataset.ppRevealMotion))]),
      animatedNodes: await page.$$eval("[data-pp-reveal-motion]", (es) => es.filter((e) => {
        const cs = getComputedStyle(e); return cs.animationName !== "none" || (cs.transitionDuration !== "0s" && cs.transitionProperty !== "none" && parseFloat(cs.transitionDuration) > 0);
      }).length),
    };
    await page.keyboard.press("Shift+Tab");
    out.shiftTab = await active(page);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    out.sourceOpen = await page.evaluate(() => ({
      open: !!document.querySelector("[data-pp-reveal-source-panel]"),
      role: document.querySelector("[data-pp-reveal-source-panel]")?.getAttribute("role"),
      expanded: document.querySelector("[data-pp-reveal-source]")?.getAttribute("aria-expanded"),
      focusInPanel: !!document.activeElement?.closest("[data-pp-reveal-source-panel]"),
    }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    out.afterEscape = { open: await page.evaluate(() => !!document.querySelector("[data-pp-reveal-source-panel]")), focus: await active(page) };
    await page.keyboard.press("Tab");
    out.tabAfterSource = await active(page);
    // Report control: reachable and operable from the keyboard.
    out.report = await page.evaluate(() => {
      const tab = document.querySelector('[data-testid="mogzy-dock-tabs-left"] button, [data-testid="mogzy-dock-tabs-left"] [role="button"]');
      if (!tab) return null;
      const b = tab.getBoundingClientRect();
      return { name: (tab.getAttribute("aria-label") || tab.textContent || "").trim(), w: Math.round(b.width), h: Math.round(b.height), tabIndex: tab.tabIndex };
    });
    // Next by keyboard: Enter on the focused Next mounts question 2.
    await page.focus('[data-testid="pro-play-next"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-pro-play-phase="question"]', { timeout: 60000 });
    await page.waitForTimeout(600);
    out.afterNext = {
      header: await page.$eval('[data-testid="ranked-header-title"]', (e) => e.textContent),
      focus: await active(page),
      tabletsEnabled: await page.$$eval("[data-quiz-choice]", (bs) => bs.every((b) => !b.disabled)),
    };
    out.errors = errors;
    console.log(JSON.stringify(out, null, 1));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
