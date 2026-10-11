// PPQ2-E polish — the stage swaps on the PRODUCTION route /lol/pro-play/quiz
// (live API, one ordinary guest session per viewport). Viewport screenshots
// exactly as the player sees them: NO scroll reset before any capture.
//
//   node docs/handoffs/ppq2e/transition-cap.cjs <outDir> [viewports] [tag]
//   env PPQ_BASE (default http://localhost:5281), PPQ_RM=1 (OS reduced
//   motion), PPQ_KEYS=1 (answer and advance with the keyboard: Tab + Enter)
//
// States: reveal-q1 (settled reveal), after-next (question 2 mounted),
// last-reveal (question 10 graded), after-results (summary), plus a Tab from
// the summary. Probe per state: focus (element + ARIA snapshot), whether the
// target (stem / heading, score, actions) is fully in view below the HUD,
// scroll offset, and the timeline's current marker vs the question on stage.
const path = require("path");
const fs = require("fs");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const BASE = process.env.PPQ_BASE || "http://localhost:5281";
const KEYS = process.env.PPQ_KEYS === "1";
const [outDir, vpArg, tag = ""] = process.argv.slice(2);
const viewports = (vpArg || "375x812,390x844,1024x768,1440x900").split(",").map((s) => { const [w, h] = s.split("x").map(Number); return { width: w, height: h }; });
fs.mkdirSync(outDir, { recursive: true });

const PROBE = () => {
  const hud = document.querySelector("nav.global-hud")?.getBoundingClientRect().bottom ?? 0;
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), inView: b.top >= hud - 0.5 && b.bottom <= innerHeight + 0.5 };
  };
  const a = document.activeElement;
  const strip = document.querySelector("[data-current-round]");
  return {
    scrollY: Math.round(scrollY), vh: innerHeight, hudBottom: Math.round(hud),
    phase: document.querySelector("[data-pro-play-phase]")?.dataset.proPlayPhase ?? null,
    header: document.querySelector('[data-testid="ranked-header-title"]')?.textContent ?? null,
    focus: !a || a === document.body ? "BODY"
      : `${a.tagName.toLowerCase()}${a.getAttribute("data-testid") ? "#" + a.getAttribute("data-testid") : ""}${a.hasAttribute("data-pro-play-summary-heading") ? "[summary-heading]" : ""}${a.closest('[data-surface-region="prompt"]') ? "[stem]" : ""}: ${(a.textContent || "").trim().slice(0, 60)}`,
    stem: box('[data-testid="ranked-question"] [data-surface-region="prompt"] h2'),
    summaryHeading: box("[data-pro-play-summary-heading]"),
    score: box('[data-testid="pro-play-final-score"]'),
    playAgain: box('[data-testid="pro-play-restart"]'),
    summaryPanel: box('[data-testid="pro-play-summary"]'),
    timelineCurrent: strip ? strip.getAttribute("data-current-round") : null,
    timelineStates: [...document.querySelectorAll("[data-state]")].filter((n) => n.closest("[data-current-round]")).map((n) => n.getAttribute("data-state")[0]).join(""),
  };
};

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const results = [];
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: process.env.PPQ_RM === "1" ? "reduce" : "no-preference" });
      await context.route(/supabase\.co\//, (r) => r.abort());
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const shoot = async (state) => {
        await page.waitForTimeout(900); // reveal staging ≤ 710 ms, smooth scroll
        const probe = await page.evaluate(PROBE);
        probe.aria = await page.locator(":focus").ariaSnapshot().catch(() => null);
        const name = `${tag}${state}-${vp.width}x${vp.height}`;
        await page.screenshot({ path: path.join(outDir, name + ".jpg"), type: "jpeg", quality: 82 });
        results.push({ name, state, viewport: vp, errors: [...errors], ...probe });
        console.log(name, JSON.stringify({ focus: probe.focus, scrollY: probe.scrollY, stem: probe.stem, heading: probe.summaryHeading, score: probe.score, playAgain: probe.playAgain, tl: probe.timelineCurrent, header: probe.header }));
      };
      const answer = async () => {
        await page.waitForSelector('[data-pro-play-phase="question"] [data-quiz-choice]:not([disabled])', { timeout: 60000 });
        if (KEYS) {
          await page.focus('[data-quiz-choice="0"]');
          await page.keyboard.press("Enter");
        } else {
          await page.click('[data-quiz-choice="0"]');
        }
        await page.waitForSelector('[data-pro-play-phase="revealed"]', { timeout: 60000 });
      };
      const advance = async () => {
        if (KEYS) {
          // Focus is on Next after a reveal (PPQ2-INT); Enter activates it.
          await page.keyboard.press("Enter");
        } else {
          await page.click('[data-testid="pro-play-next"]');
        }
      };
      await page.goto(`${BASE}/lol/pro-play/quiz`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector('[data-pro-play-phase="question"]', { timeout: 120000 });
      await page.waitForTimeout(1500);
      await answer();
      await shoot("reveal-q1");
      await advance();
      await page.waitForSelector('[data-pro-play-phase="question"]', { timeout: 60000 });
      await shoot("after-next");
      for (let n = 2; n <= 9; n++) {
        await answer();
        await advance();
        await page.waitForSelector('[data-pro-play-phase="question"]', { timeout: 60000 });
      }
      await answer();
      await shoot("last-reveal");
      await advance();
      await page.waitForSelector('[data-pro-play-phase="complete"]', { timeout: 60000 });
      await shoot("after-results");
      await page.keyboard.press("Tab");
      const tabbed = await page.evaluate(() => (document.activeElement?.textContent || document.activeElement?.tagName || "").trim());
      results[results.length - 1].tabAfterResults = tabbed;
      console.log(`  Tab from summary -> ${tabbed}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, `${tag}transition-probe.json`), JSON.stringify(results, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
