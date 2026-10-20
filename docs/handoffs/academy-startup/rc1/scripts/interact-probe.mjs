/**
 * RC1 interaction / failure probe (scratch; same safety rules as scripts/academy-startup/run.mjs):
 * bundled Chromium only, headless only, one browser at a time, closed in finally, SIGINT/SIGTERM handled,
 * whole-run cap. Supabase writes are answered in-page by instrument.js.
 *
 *   node interact-probe.mjs '{"label":"x","base":"https://127.0.0.1:4421","net":"slow4g","mode":"hover"|"stall-manifest"|"stall-frame","reps":2}'
 *
 * hover:          Landing journey; mount+hoverAt ms: pointer onto the Leaguecraft book; record when the Lux <image>
 *                 has an href and when its icon.png finished; then click the book and record /quiz arrival.
 * stall-manifest: the champion manifest request never answers (CDP Fetch pause, never continued).
 * stall-frame:    the book-frame image never answers.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
// resolve Playwright from the worktree that owns the harness (this file lives in a scratch dir)
const { chromium } = createRequire(process.env.ACS_WT + "/package.json")("playwright");

const S = { reps: 2, net: "none", mode: "hover", hoverAt: 800, clickAfter: 400, w: 1366, h: 768, ms: 25000, ...JSON.parse(process.argv[2] ?? "{}") };
if (!S.label || !S.base) throw new Error("label and base required");
const PROBE = readFileSync(process.env.ACS_INSTRUMENT, "utf8");
const OUT = process.env.ACS_OUT;
mkdirSync(OUT, { recursive: true });
const NET = {
  "4g": { offline: false, latency: 85, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  slow4g: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
};
const deadline = Date.now() + 15 * 60_000;
let open = null;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await open?.close().catch(() => {}); process.exit(130); });

async function once(rep) {
  const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors", "--autoplay-policy=user-gesture-required"] });
  open = browser;
  try {
    const ctx = await browser.newContext({ viewport: { width: S.w, height: S.h }, ignoreHTTPSErrors: true });
    await ctx.addInitScript({ content: PROBE });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    const reqs = [];
    cdp.on("Network.requestWillBeSent", (e) => reqs.push({ t: e.timestamp, url: e.request.url, pr: e.request.initialPriority }));
    if (S.net !== "none") await cdp.send("Network.emulateNetworkConditions", NET[S.net]);
    const stallPattern = S.mode === "stall-manifest" ? "*api/assets/champions*" : S.mode === "stall-frame" ? "*academy-book-frame*" : null;
    const stalled = [];
    if (stallPattern) {
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: stallPattern, requestStage: "Request" }] });
      cdp.on("Fetch.requestPaused", (e) => { stalled.push(e.request.url); /* never continued: a hung request */ });
    }
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(S.base + "/", { waitUntil: "commit", timeout: 120_000 });
    const t0 = Date.now();
    const rootAt = async () => page.evaluate(() => window.__acs?.cond.root ?? null).catch(() => null);
    while (Date.now() - t0 < 45_000 && (await rootAt()) == null) await page.waitForTimeout(100);
    const out = { rep, mode: S.mode, net: S.net, stalled: stalled.length, errors };
    const root = await rootAt();
    out.root = root;
    if (root == null) return out;
    if (S.mode === "hover") {
      while ((await page.evaluate(() => performance.now())) < root + S.hoverAt) await page.waitForTimeout(25);
      // install observers for the Lux portrait before hovering
      await page.evaluate(() => {
        const A = window.__acs; A.lux = {};
        const look = () => {
          const im = document.querySelector("[data-testid='academy-core-v35-lux-portrait']");
          if (im && A.lux.href == null) { A.lux.href = performance.now(); im.addEventListener("load", () => { A.lux.load ??= performance.now(); }); }
          const st = document.querySelector(".o35-stage");
          if (st && st.getAttribute("data-focus") === "leaguecraft" && A.lux.focus == null) A.lux.focus = performance.now();
          if (location.pathname === "/quiz" && A.lux.quizPath == null) A.lux.quizPath = performance.now();
          if (location.pathname === "/quiz" && A.lux.quizUi == null && document.querySelector("main") && !document.querySelector("[data-startup-surface]") && (document.body.innerText || "").length > 200) A.lux.quizUi = performance.now();
          requestAnimationFrame(look);
        };
        look();
      });
      const box = await page.evaluate(() => {
        const el = document.querySelector('.o35-book[data-bay="leaguecraft"] a') || document.querySelector('.o35-book[data-bay="leaguecraft"]');
        const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      const hoverT = await page.evaluate(() => performance.now());
      await page.mouse.move(box.x, box.y);
      await page.waitForTimeout(S.clickAfter);
      const box2 = await page.evaluate(() => {
        const el = document.querySelector('.o35-book[data-bay="leaguecraft"] a') || document.querySelector('.o35-book[data-bay="leaguecraft"]');
        const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      const clickT = await page.evaluate(() => performance.now());
      await page.mouse.click(box2.x, box2.y);
      const until = Date.now() + 20_000;
      while (Date.now() < until) {
        const l = await page.evaluate(() => window.__acs.lux).catch(() => null);
        if (l && l.quizUi != null && l.load != null) break;
        await page.waitForTimeout(100);
      }
      const l = (await page.evaluate(() => window.__acs.lux).catch(() => ({}))) ?? {};
      const luxRes = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /champions\/Lux\/icon\.png/.test(r.name)).map((r) => [Math.round(r.startTime), Math.round(r.responseEnd)])).catch(() => []);
      Object.assign(out, {
        hoverAfterMount: Math.round(hoverT - root),
        focusMs: l.focus != null ? Math.round(l.focus - hoverT) : null,
        luxHrefMs: l.href != null ? Math.round(l.href - hoverT) : null,
        luxLoadMs: l.load != null ? Math.round(l.load - hoverT) : null,
        luxRes: luxRes.map(([s, e]) => [Math.round(s - hoverT), Math.round(e - hoverT)]),
        clickToQuizPath: l.quizPath != null ? Math.round(l.quizPath - clickT) : null,
        clickToQuizUi: l.quizUi != null ? Math.round(l.quizUi - clickT) : null,
      });
    } else {
      // failure modes: watch for S.ms after mount
      while ((await page.evaluate(() => performance.now())) < root + S.ms) await page.waitForTimeout(500);
      const st = await page.evaluate(() => ({
        stageReady: document.querySelector(".o35-stage")?.getAttribute("data-ready"),
        reactions: document.querySelector("[data-testid='academy-core-mogzy']")?.getAttribute("data-reactions"),
        luxInDom: !!document.querySelector("[data-testid='academy-core-v35-lux-portrait']"),
        books: document.querySelectorAll(".o35-book").length,
        covers: [...document.querySelectorAll(".o35-book img")].filter((i) => /\/splash\//.test(i.src)).length,
        patchText: (document.querySelector('[data-testid="academy-broadcast-centerpiece"]')?.textContent || "").slice(0, 60),
        surface: !!document.querySelector("[data-startup-surface]"),
      }));
      const nowMs = await page.evaluate(() => performance.now());
      const quizReq = reqs.find((r) => /\/assets\/Quiz-[^/]*\.js/.test(r.url));
      const poseReq = reqs.find((r) => /mogzy-.*-192\.webp/.test(r.url));
      const firstT = reqs[0]?.t ?? 0;
      // focus Leaguecraft via keyboard to check interaction still works
      await page.keyboard.press("Tab").catch(() => {});
      Object.assign(out, st, {
        quizChunkRequestedAt: quizReq ? Math.round((quizReq.t - firstT) * 1000) : null,
        poseRequestedAt: poseReq ? Math.round((poseReq.t - firstT) * 1000) : null,
        rootFromFirstReq: Math.round(root), observedMs: Math.round(nowMs - root),
      });
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
    open = null;
  }
}

const results = [];
for (let r = 0; r < S.reps && Date.now() < deadline; r++) {
  try { const d = await once(r); results.push(d); console.error(`[${S.label}] rep ${r}`, JSON.stringify(d)); }
  catch (e) { results.push({ rep: r, failed: String(e) }); console.error(`[${S.label}] rep ${r} FAILED ${e}`); }
}
writeFileSync(join(OUT, `${S.label}.json`), JSON.stringify({ scenario: S, results }, null, 1));
