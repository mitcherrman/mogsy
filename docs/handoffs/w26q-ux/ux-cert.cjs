// W26Q-UX viewport certification — Worlds 2026 Quiz one-screen presentation.
//
// RUNS ONLY WITH THE OWNER'S EXPLICIT AUTHORIZATION FOR THAT RUN (AGENTS.md).
// Bundled headless Chromium shell ONLY (no `channel`, no `executablePath`, no
// user profile), ONE page at a time, an owned static server on 127.0.0.1, a
// hard timeout, and try/finally teardown of the context, browser and server.
// No production traffic: every request that is not the owned server is aborted,
// except the two Pro Play quiz endpoints, which are fulfilled from the captured
// real session (`src/lib/pro-play/__fixtures__/worlds2026PresetSession.json`).
//
//   FE=<worktree root> BUILD=<vite build dir> OUT=<output dir> node ux-cert.cjs
//   optional: ONLY_VIEWPORTS=360x640,390x844  ONLY_STATES=question,reveal  TIMING=0
const path = require("path");
const fs = require("fs");
const http = require("http");

const FE = process.env.FE;
const BUILD = path.resolve(process.env.BUILD);
const OUT = path.resolve(process.env.OUT);
const { chromium } = require(path.join(FE, "node_modules", "playwright"));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(FE, "src/lib/pro-play/__fixtures__/worlds2026PresetSession.json"), "utf8"));

const ROUTE = "/lol/pro-play/quiz/worlds-2026";
const VIEWPORTS = [[360, 640], [390, 844], [844, 390], [740, 360], [1024, 768], [1440, 900], [1920, 1080]];
const STATES = ["loading", "question", "reveal", "next", "end", "unavailable", "error"];
const HARD_TIMEOUT_MS = 12 * 60 * 1000;
const onlyV = process.env.ONLY_VIEWPORTS ? process.env.ONLY_VIEWPORTS.split(",") : null;
const onlyS = process.env.ONLY_STATES ? process.env.ONLY_STATES.split(",") : null;
const WITH_TIMING = process.env.TIMING !== "0";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon", ".mp3": "audio/mpeg" };
function serve() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(BUILD, u);
    if (!path.resolve(file).startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(BUILD, "index.html");
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// ---- in-page measurement ---------------------------------------------------
const MEASURE = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const hit = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  const q = (s) => document.querySelector(s);
  const se = document.scrollingElement;
  const visible = (el) => { if (!el) return false; const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && b.width > 0 && b.height > 0; };
  const inView = (b) => !!b && b.l >= -0.5 && b.r <= innerWidth + 0.5 && b.t >= -0.5 && b.b <= innerHeight + 0.5;
  const brand = q('[data-testid="pro-play-brand"]');
  const back = q('[data-testid="pro-play-back"]');
  const pos = q('[data-testid="pro-play-position"]');
  const touchable = (el) => visible(el) && getComputedStyle(el).pointerEvents !== "none";
  const hudKids = [...document.querySelectorAll("nav.global-hud *")].filter((el) => touchable(el) && el.children.length === 0).map(r);
  const hudChips = [...document.querySelectorAll("nav.global-hud *")].filter((el) => touchable(el) && getComputedStyle(el.parentElement).pointerEvents === "none").map(r);
  const rb = r(brand), rk = r(back), rp = r(pos);
  const arena = q('[data-testid="pro-play-arena"]');
  const clipped = [...(arena ? arena.querySelectorAll("[data-quiz-choice], [data-pp-reveal-footer], [data-pp-reveal-explanation], [data-surface-region='prompt'] h2") : [])]
    .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    .map((el) => el.getAttribute("data-testid") || el.tagName.toLowerCase() + (el.hasAttribute("data-pp-reveal-footer") ? "[footer]" : el.hasAttribute("data-quiz-choice") ? "[choice]" : ""));
  const scrollers = [...(arena ? arena.querySelectorAll("*") : [])].filter((el) => {
    const s = getComputedStyle(el);
    return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
  }).length;
  const reserve = q("[data-pro-play-hud-reserve]");
  const foot = q("[data-pp-reveal-footer]");
  const hudBox = foot || reserve;
  const match = q('[data-testid="ranked-match"]');
  const shell = q(".ranked-shell");
  return {
    vw: innerWidth, vh: innerHeight, docScrollH: se.scrollHeight, docScrollW: se.scrollWidth, scrollY: scrollY,
    phase: arena ? arena.getAttribute("data-pro-play-phase") : null,
    frame: { match: r(match), shell: r(shell), answers: r(q('[data-surface-region="answers"]')), stem: r(q('[data-surface-region="prompt"] h2')), hud: r(hudBox), hudKind: foot ? "footer" : reserve ? "reserve" : null, bottom: r(q('[data-testid="ranked-mobile-bottombar"]') || q(".ranked-mobile-bottombar")), timeline: r(q('[data-testid="ranked-round-timeline"]')) },
    brand: { present: !!brand, visible: visible(brand), text: brand ? brand.textContent : null, rect: rb, inView: inView(rb), hitsHud: hudKids.some((k) => hit(rb, k)) || hudChips.some((k) => hit(rb, k)) },
    back: { present: !!back, visible: visible(back), rect: rk, inView: inView(rk), hitsBrand: hit(rk, rb), hitsHud: hudKids.some((k) => hit(rk, k)) },
    position: { present: !!pos, visible: visible(pos), text: pos ? pos.textContent : null, hitsBrand: hit(rp, rb), hitsBack: hit(rp, rk) },
    diag: {
      plate: r(q('[data-surface-region="media"]')), prompt: r(q('[data-surface-region="prompt"]')), chrome: r(q('[data-testid="pro-play-chrome"]')),
      hudBand: r(q("nav.global-hud")), siteFooter: !!q('[data-testid="site-footer-nav"]'), docH: document.documentElement.scrollHeight,
      foot: r(foot), explanationLines: (() => { const e = q("[data-pp-reveal-explanation]"); if (!e) return null; const lh = parseFloat(getComputedStyle(e).lineHeight) || 16; return Math.round(e.getBoundingClientRect().height / lh); })(),
    },
    footerInView: foot ? inView(r(foot)) : null,
    answersInView: inView(r(q('[data-surface-region="answers"]'))),
    nextControls: [...document.querySelectorAll("button")].filter((b) => /^(Next|See results)$/i.test(b.textContent.trim())).length + document.querySelectorAll('[data-testid="pro-play-next"]').length,
    clipped, scrollers,
    meter: (() => { const m = q('[data-testid="pro-play-advance-meter"]'); return m ? { holdMs: parseFloat(getComputedStyle(m).getPropertyValue("--pp-hold-ms")), paused: m.dataset.paused } : null; })(),
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
};

// ---- jump check: the frame must not move between two states ---------------
const FRAME_KEYS = ["match", "shell", "answers", "hud", "bottom", "timeline"];
function jump(a, b) {
  const out = {};
  for (const k of FRAME_KEYS) {
    const x = a.frame[k], y = b.frame[k];
    if (!x || !y) continue;
    out[k] = { dTop: +(y.t - x.t).toFixed(1), dH: +(y.h - x.h).toFixed(1), dL: +(y.l - x.l).toFixed(1), dW: +(y.w - x.w).toFixed(1) };
  }
  return out;
}
const jumped = (j, tol = 0.6) => Object.entries(j).filter(([, v]) => Math.abs(v.dTop) > tol || Math.abs(v.dH) > tol || Math.abs(v.dL) > tol || Math.abs(v.dW) > tol).map(([k]) => k);

// ---- fixture routing -------------------------------------------------------
function installRoutes(page, base, mode) {
  let i = 0;
  let release;
  const gate = new Promise((ok) => { release = ok; });
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  return page.route("**/*", async (route) => {
    const req = route.request();
    const u = req.url();
    if (u.startsWith(base)) return route.continue();
    if (req.method() === "OPTIONS" && u.includes("/api/pro-play/")) return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (u.includes("/api/pro-play/quiz/sessions") && !u.includes("/answer") && req.method() === "POST") {
      i = 0;
      if (mode === "loading") await gate;
      if (mode === "unavailable") return json(route, 503, { detail: { code: "PP_PRESET_UNAVAILABLE", message: "There aren't enough verified Worlds 2026 questions for a full quiz yet." } });
      if (mode === "error") return json(route, 500, { detail: { code: "PP_ERROR", message: "Pro Play is unavailable right now." } });
      return json(route, 200, FIXTURE.start);
    }
    if (u.includes("/answer")) return json(route, 200, FIXTURE.answers[i++]);
    return route.abort();
  }).then(() => ({ release }));
}

async function clickFirstChoice(page) {
  const ok = await page.evaluate(() => { const el = document.querySelector("[data-quiz-choice]:not([disabled])"); if (!el) return false; el.click(); return true; });
  if (!ok) throw new Error("no enabled choice");
}

const stemText = (page) => page.evaluate(() => (document.querySelector('[data-surface-region="prompt"] h2') || {}).textContent || null);

(async () => {
  const killer = setTimeout(() => { console.error("HARD TIMEOUT"); process.exit(2); }, HARD_TIMEOUT_MS);
  let server, browser;
  const results = [];
  const timing = [];
  let consecutiveErrors = 0;
  const stop = async () => { try { if (browser) await browser.close(); } catch {} try { if (server) server.close(); } catch {} };
  process.on("SIGINT", async () => { await stop(); process.exit(130); });
  process.on("SIGTERM", async () => { await stop(); process.exit(143); });
  fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
  try {
    server = await serve();
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });

    for (const [w, h] of VIEWPORTS) {
      const vp = `${w}x${h}`;
      if (onlyV && !onlyV.includes(vp)) continue;
      const isPhone = w < 1024;
      for (const state of STATES) {
        if (onlyS && !onlyS.includes(state)) continue;
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: isPhone, hasTouch: isPhone, reducedMotion: "reduce", deviceScaleFactor: 1 });
        try {
          const page = await ctx.newPage();
          const mode = state === "loading" || state === "unavailable" || state === "error" ? state : "play";
          const { release } = await installRoutes(page, base, mode);
          await page.clock.install();
          await page.goto(base + ROUTE, { waitUntil: "domcontentloaded", timeout: 60000 });
          const snap = async (name) => { const m = await page.evaluate(MEASURE); await page.screenshot({ path: path.join(OUT, "shots", `${name}_${vp}.png`) }); return m; };
          let m, extra = {};
          if (state === "loading") {
            await page.waitForSelector('[data-testid="pro-play-loading"]', { timeout: 8000 });
            await page.clock.runFor(700);
            m = await snap("loading");
            release();
          } else if (state === "unavailable" || state === "error") {
            await page.waitForSelector(state === "unavailable" ? '[data-testid="pro-play-unavailable"]' : '[data-testid="pro-play-error"]', { timeout: 8000 });
            await page.clock.runFor(700);
            m = await snap(state);
          } else {
            await page.waitForSelector("[data-quiz-choice]", { timeout: 8000 });
            await page.clock.runFor(900);
            const q1 = await page.evaluate(MEASURE);
            if (state === "question") { m = await snap("question"); }
            else {
              await clickFirstChoice(page);
              await page.waitForSelector("[data-pp-reveal-footer]", { timeout: 8000 });
              await page.clock.runFor(900);
              const rev = await page.evaluate(MEASURE);
              if (state === "reveal") {
                m = await snap("reveal");
                extra.jumpQuestionToReveal = jump(q1, rev);
              } else {
                // Let the hold spend, land on question 2, and compare the frame.
                const s1 = await stemText(page);
                await page.clock.runFor(30000);
                await page.waitForFunction((s) => { const el = document.querySelector('[data-surface-region="prompt"] h2'); return el && el.textContent !== s; }, s1, { timeout: 8000 });
                await page.clock.runFor(900);
                if (state === "next") {
                  m = await snap("next");
                  extra.jumpRevealToNext = jump(rev, m);
                  extra.jumpQuestionToNext = jump(q1, m);
                } else {
                  for (let n = 2; n <= FIXTURE.answers.length; n += 1) {
                    await clickFirstChoice(page);
                    await page.waitForSelector("[data-pp-reveal-footer]", { timeout: 8000 });
                    await page.clock.runFor(900);
                    await page.clock.runFor(30000);
                  }
                  await page.waitForSelector('[data-testid="pro-play-summary"]', { timeout: 8000 });
                  await page.clock.runFor(700);
                  m = await snap("end");
                }
              }
            }
          }
          const fails = [];
          const reveal = m.frame.hudKind === "footer";
          if (m.docScrollH > m.vh + 1 || m.docScrollW > m.vw + 1) fails.push(`page scrolls (${m.docScrollW}x${m.docScrollH} in ${m.vw}x${m.vh})`);
          if (m.scrollY !== 0) fails.push(`scrollY ${m.scrollY}`);
          if (m.scrollers) fails.push(`${m.scrollers} inner scroller(s)`);
          if (!m.brand.present || !m.brand.visible || m.brand.text !== "mogzy.lol" || !m.brand.inView) fails.push("mogzy.lol not displayed in view");
          if (m.brand.hitsHud) fails.push("brand meets the HUD chips");
          if (m.back.present && m.back.visible && (m.back.hitsBrand || m.back.hitsHud)) fails.push("back link collides");
          if (m.position.visible && (m.position.hitsBrand || m.position.hitsBack)) fails.push("position collides");
          if (m.nextControls) fails.push(`${m.nextControls} Next/See results control(s)`);
          if (m.clipped.length) fails.push(`clipped: ${m.clipped.join(",")}`);
          if (["question", "reveal", "next"].includes(state) && !m.answersInView) fails.push("answers not fully in view");
          if (reveal && !m.footerInView) fails.push("reveal footer not fully in view");
          for (const [k, j] of Object.entries(extra)) { const moved = jumped(j); if (moved.length) fails.push(`${k}: ${moved.join(",")} moved`); }
          consecutiveErrors = 0;
          results.push({ viewport: vp, state, ok: fails.length === 0, fails, measure: m, ...extra });
          console.log(`${fails.length ? "FAIL" : "ok  "} ${state.padEnd(11)} ${vp} ${fails.join("; ")}`);
        } catch (e) {
          results.push({ viewport: vp, state, ok: false, fails: [`ERROR ${e && e.message}`] });
          consecutiveErrors += 1;
          if (consecutiveErrors >= 12) { console.error("ABORT: 12 consecutive harness errors, stopping the run"); throw new Error("harness abort"); }
          console.log(`FAIL ${state.padEnd(11)} ${vp} ERROR ${e && e.message}`);
        } finally {
          await ctx.close();
        }
      }
    }

    // ---- real-time check of the auto-advance (no fake clock), two viewports
    if (WITH_TIMING) {
      for (const [w, h] of [[390, 844], [1440, 900]]) {
        const vp = `${w}x${h}`;
        if (onlyV && !onlyV.includes(vp)) continue;
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1024, hasTouch: w < 1024, reducedMotion: "no-preference", deviceScaleFactor: 1 });
        try {
          const page = await ctx.newPage();
          await installRoutes(page, base, "play");
          await page.goto(base + ROUTE, { waitUntil: "domcontentloaded", timeout: 60000 });
          await page.waitForSelector("[data-quiz-choice]", { timeout: 8000 });
          await page.waitForTimeout(900);
          const s1 = await stemText(page);
          await clickFirstChoice(page);
          const t0 = Date.now();
          await page.waitForSelector("[data-pp-reveal-footer]", { timeout: 8000 });
          const tReveal = Date.now() - t0;
          const meter = await page.evaluate(() => { const m = document.querySelector('[data-testid="pro-play-advance-meter"]'); return m ? parseFloat(getComputedStyle(m).getPropertyValue("--pp-hold-ms")) : null; });
          const early = await stemText(page);
          await page.waitForFunction((s) => { const el = document.querySelector('[data-surface-region="prompt"] h2'); return el && el.textContent !== s; }, s1, { timeout: 30000, polling: 50 });
          const tAdvance = Date.now() - t0;
          const focusOnStem = await page.evaluate(() => { const a = document.activeElement; return !!a && a.tagName === "H2"; });
          const row = { viewport: vp, holdMsAdvertised: meter, revealAtMs: tReveal, advancedAtMs: tAdvance, heldUntilHoldMs: tAdvance - tReveal, stemUnchangedAtReveal: early === s1, focusOnNewStem: focusOnStem };
          timing.push(row);
          console.log("TIMING", JSON.stringify(row));
        } catch (e) {
          timing.push({ viewport: vp, error: e && e.message });
          console.log("TIMING FAIL", vp, e && e.message);
        } finally {
          await ctx.close();
        }
      }
    }
  } catch (e) {
    console.error("ERROR", e && e.message);
    process.exitCode = 1;
  } finally {
    await stop();
    clearTimeout(killer);
    fs.writeFileSync(path.join(OUT, "ux-cert-results.json"), JSON.stringify({ results, timing }, null, 1));
    const passed = results.filter((r) => r.ok).length;
    console.log(`SUMMARY ${passed}/${results.length}`);
  }
})();
