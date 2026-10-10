// PPQ1 — capture the CURRENT /lol/pro-play/quiz page with the frozen fixtures
// served through mocked quiz endpoints (no production writes). Run with
// cwd = the ppq1-frontend worktree.
const path = require("path");
const fs = require("fs");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const SCR = process.argv[2];
const OUT = path.join(SCR, "current");
fs.mkdirSync(OUT, { recursive: true });
const FX = JSON.parse(fs.readFileSync(path.join(SCR, "fixtures.json"), "utf8"));
const KEYS = (process.env.KEYS || "champion_player,player_champion,team_champion,champion_team,scope_champion,recent,flex,pro_play,nuguri_clear,t1_lineage").split(",");
const SIZES = [[375, 812], [390, 844], [1024, 768], [1280, 800], [1440, 900]];
const BASE = "http://localhost:5241";

const PROBE = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom), w: Math.round(b.width) }; };
  const choices = [...document.querySelectorAll("[data-quiz-choice]")];
  const last = choices[choices.length - 1];
  const imgs = [...document.images].filter((i) => i.getBoundingClientRect().width > 0);
  return {
    vw: innerWidth, vh: innerHeight,
    docH: document.documentElement.scrollHeight,
    hOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    stem: r(document.querySelector("[data-pro-play-question]")),
    anchor: r(document.querySelector("[data-pro-play-anchor]")),
    cards: r(document.querySelector("[data-pro-play-subject-cards]")),
    firstChoice: r(choices[0]),
    lastChoice: r(last),
    lastChoiceBelowFold: last ? last.getBoundingClientRect().bottom > innerHeight : null,
    evidence: r(document.querySelector("[data-pro-play-evidence]")),
    imgsPending: imgs.filter((i) => !i.complete).length,
    imgsBroken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
  };
};

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const results = [];
  try {
    for (const key of KEYS) {
      const fx = FX[key];
      for (const [w, h] of SIZES) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
        const page = await ctx.newPage();
        const session = { session_id: "ppq1-fixture", total: 10, answered: 0, score: 0, complete: false };
        await page.route("**/api/pro-play/quiz/sessions", (route) =>
          route.fulfill({ json: { session, question: fx.question } }));
        await page.route("**/api/pro-play/quiz/sessions/*/answer", (route) =>
          route.fulfill({ json: {
            session: { ...session, answered: 1, score: fx.result.is_correct ? 1 : 0 },
            question: null,
            result: fx.result,
          } }));
        try {
          await page.goto(`${BASE}/lol/pro-play/quiz`, { waitUntil: "domcontentloaded", timeout: 120000 });
          await page.waitForSelector("[data-quiz-choice]", { timeout: 90000 });
          await page.waitForTimeout(2500);
          const pre = await page.evaluate(PROBE);
          await page.screenshot({ path: path.join(OUT, `${key}_${w}x${h}_pre.png`) });
          await page.locator("[data-quiz-choice]").first().click();
          await page.waitForSelector("[data-pro-play-evidence]", { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(1200);
          const post = await page.evaluate(PROBE);
          await page.screenshot({ path: path.join(OUT, `${key}_${w}x${h}_post_full.png`), fullPage: true });
          results.push({ key, size: `${w}x${h}`, pre, post });
          console.log(key, `${w}x${h}`, "docH", pre.docH, "lastBelowFold", pre.lastChoiceBelowFold, "hOverflow", pre.hOverflow, "postDocH", post.docH, "imgsPending", pre.imgsPending, "broken", pre.imgsBroken);
        } catch (e) {
          console.log("FAIL", key, w, h, String(e).slice(0, 200));
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, "probe.json"), JSON.stringify(results, null, 1));
  }
})();
