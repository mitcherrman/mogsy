// W26Q visual certification (owner-approved run, 2026-10-20).
// Bundled headless Chromium shell ONLY (no channel, no executablePath), one
// page at a time, an owned static server, try/finally teardown, hard timeout.
const path = require("path");
const fs = require("fs");
const http = require("http");
const FE = process.env.FE;
const { chromium } = require(path.join(FE, "node_modules", "playwright"));

const DIR = __dirname;
const BUILD = process.env.BUILD;
const ROUTE = "/lol/pro-play/tournament/worlds-2026";
const STATES = { pre: "feed-pre.json", playin: "feed-playin.json", swiss_r3: "feed-swiss_r3.json", qf: "feed-qf.json", full: "feed-full.json" };
const VIEWPORTS = [
  [1920, 1080], [1440, 900], [1280, 800], [1280, 600], [1024, 768],
  [768, 1024], [390, 844], [360, 640], [844, 390], [740, 360],
];
const HARD_TIMEOUT_MS = 10 * 60 * 1000;
const ONLY = process.env.ONLY_STATES ? process.env.ONLY_STATES.split(",") : null;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon" };
function serve() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(BUILD, u);
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(BUILD, "index.html");
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function measure(page, isPhone) {
  return page.evaluate((isPhone) => {
    const r = (el) => (el ? el.getBoundingClientRect().toJSON() : null);
    const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const se = document.scrollingElement;
    const bar = document.querySelector('[data-testid="command-bar"]');
    const cta = document.querySelector('[data-testid="worlds-quiz-cta"]');
    const chip = document.querySelector('[data-testid="phase-chip"]');
    const h1 = bar && bar.querySelector("h1");
    const nav = bar && bar.querySelector('[data-testid="primary-nav"]');
    const scrollers = [...document.querySelectorAll('[data-testid="worlds-experience"] *')].filter((el) => {
      const s = getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowY + s.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    }).length;
    const b = r(bar), c = r(cta), p = r(chip), h = r(h1), n = r(nav);
    return {
      docScrollH: se.scrollHeight, docScrollW: se.scrollWidth, vw: innerWidth, vh: innerHeight,
      bar: b && { h: Math.round(b.height), layout: bar.dataset.layout, landscape: bar.dataset.landscape || null },
      cta: c && { w: Math.round(c.width), h: Math.round(c.height), inView: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight, text: cta.textContent, href: cta.getAttribute("href") },
      collideTitle: Boolean(hit(c, h)), collideChip: Boolean(hit(c, p)), collideNav: Boolean(hit(c, n)),
      // Pre-existing shell check, independent of the CTA: nav vs phase chip.
      navMeetsChip: Boolean(hit(n, p)),
      titleClipped: h1 ? h1.scrollWidth > h1.clientWidth + 1 : null,
      overflowingScrollers: scrollers,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      isPhone,
    };
  }, isPhone);
}

(async () => {
  const killer = setTimeout(() => { console.error("HARD TIMEOUT"); process.exit(2); }, HARD_TIMEOUT_MS);
  let server, browser;
  const results = [];
  const stop = async () => { try { if (browser) await browser.close(); } catch {} try { if (server) server.close(); } catch {} };
  process.on("SIGINT", async () => { await stop(); process.exit(130); });
  process.on("SIGTERM", async () => { await stop(); process.exit(143); });
  try {
    server = await serve();
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    for (const [state, file] of Object.entries(STATES)) {
      if (ONLY && !ONLY.includes(state)) continue;
      const body = fs.readFileSync(path.join(DIR, file), "utf8");
      for (const [w, h] of VIEWPORTS) {
        const isPhone = w < 1024;
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: isPhone, hasTouch: isPhone, reducedMotion: "reduce", deviceScaleFactor: 1 });
        try {
          const page = await ctx.newPage();
          // Everything off-box fails fast except the one feed we serve; the
          // layout under test needs no other network.
          await page.route("**/*", (route) => {
            const u = route.request().url();
            if (u.startsWith(base)) return route.continue();
            if (u.includes("/api/live-esports/tournament/worlds-2026")) return route.fulfill({ status: 200, contentType: "application/json", body });
            return route.abort();
          });
          await page.goto(base + ROUTE, { waitUntil: "domcontentloaded", timeout: 60000 });
          await page.waitForSelector('[data-testid="worlds-quiz-cta"]', { timeout: 30000 });
          await page.waitForTimeout(600);
          const m = await measure(page, isPhone);
          const shot = `${state}_${w}x${h}.png`;
          await page.screenshot({ path: path.join(DIR, "shots", shot) });
          const expectBar = !isPhone ? 56 : m.bar && m.bar.landscape ? 44 : null;
          const fails = [];
          if (m.docScrollH > m.vh + 1 || m.docScrollW > m.vw + 1) fails.push("page scrolls");
          if (expectBar && m.bar.h !== expectBar) fails.push(`bar ${m.bar.h} != ${expectBar}`);
          if (!m.cta || !m.cta.inView) fails.push("cta not in view");
          if (m.collideTitle || m.collideChip || m.collideNav) fails.push("cta collides");
          if (m.titleClipped) fails.push("title clipped");
          if (m.navMeetsChip) fails.push("nav meets phase chip");
          if (m.overflowingScrollers) fails.push(`${m.overflowingScrollers} overflowing scroller(s)`);
          if (!m.reduced) fails.push("reduced motion not applied");
          results.push({ state, viewport: `${w}x${h}`, ok: fails.length === 0, fails, ...m, shot });
          console.log(`${fails.length ? "FAIL" : "ok  "} ${state} ${w}x${h} bar=${m.bar && m.bar.h} cta=${m.cta && `${m.cta.w}x${m.cta.h}`} ${fails.join("; ")}`);
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
    fs.writeFileSync(path.join(DIR, "cert-results.json"), JSON.stringify(results, null, 1));
    const passed = results.filter((r) => r.ok).length;
    console.log(`SUMMARY ${passed}/${results.length}`);
  }
})();
