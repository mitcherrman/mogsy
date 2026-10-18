/* eslint-disable */
/**
 * MISC W3A (F05) — per-state, per-viewport geometry of the Daily result pages.
 *
 * Plain `playwright` script (Microsoft Edge), run against a Vite dev server:
 *
 *   node e2e/misc-w3a/measure.cjs
 *   W3A_BASE=http://127.0.0.1:8131  W3A_OUT=<file.json>  W3A_SHOTS=<dir>
 *   W3A_ONLY=<substring of state id>  W3A_VP=<substring of viewport id>
 *   W3A_REDUCED=1   (prefers-reduced-motion: reduce)
 *
 * For every state × viewport it loads `harness.html` (real components, real
 * shell), waits for the result to settle (and the discoveries panel to open
 * where cards are served), then records at scroll 0:
 *   - document scrollHeight vs viewport height (the vertical travel)
 *   - the primary action's page position and whether it is inside the first viewport
 *   - the top/bottom of every region
 *   - horizontal overflow
 * and, for flip states, the layout-shift total and how far the hero / action
 * moved between the pending frame and the settled one.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const backend = require("../../src/lib/ranked-public/__fixtures__/dailyMatchDiscoveries.backend.json");

const BASE = process.env.W3A_BASE || "http://127.0.0.1:8131";
const OUT = process.env.W3A_OUT || path.join(__dirname, "measure.out.json");
const SHOTS = process.env.W3A_SHOTS || "";
const ONLY = process.env.W3A_ONLY || "";
const ONLY_VP = process.env.W3A_VP || "";
const REDUCED = process.env.W3A_REDUCED === "1";

const VIEWPORTS = [
  { id: "320x568", w: 320, h: 568, phone: true },
  { id: "360x640", w: 360, h: 640, phone: true },
  { id: "375x667", w: 375, h: 667, phone: true },
  { id: "390x844", w: 390, h: 844, phone: true },
  { id: "1280x800", w: 1280, h: 800, phone: false },
  { id: "667x375-land", w: 667, h: 375, phone: true },
  { id: "844x390-land", w: 844, h: 390, phone: true },
];

// cards: "earned" → the real backend projection (3 cards); "none"; absent → 409 (silence)
const STATES = [
  { id: "main-pending", q: "view=main&phase=pending", primary: "daily-main-continue" },
  { id: "main-settled-cards", q: "view=main&phase=settled", cards: "earned", primary: "daily-main-continue" },
  { id: "main-settled-nocards", q: "view=main&phase=settled", cards: "none", primary: "daily-main-continue" },
  { id: "main-flip", q: "view=main&phase=pending&flip=1500", cards: "none", primary: "daily-main-continue", flip: 1500 },
  { id: "main-error", q: "view=main&phase=settled&error=1", cards: "none", primary: "daily-main-continue" },
  { id: "tt-pending", q: "view=stage&kind=time_trial&phase=pending", primary: "daily-stage-result-continue" },
  { id: "tt-settled", q: "view=stage&kind=time_trial&phase=settled", cards: "none", primary: "daily-stage-result-continue" },
  { id: "tt-settled-cards", q: "view=stage&kind=time_trial&phase=settled", cards: "earned", primary: "daily-stage-result-continue" },
  { id: "tt-flip", q: "view=stage&kind=time_trial&phase=pending&flip=1500", cards: "none", primary: "daily-stage-result-continue", flip: 1500 },
  { id: "surv-settled", q: "view=stage&kind=survival&phase=settled", cards: "none", primary: "daily-stage-result-continue" },
  { id: "weak-settled", q: "view=stage&kind=weak_areas&phase=settled", cards: "none", primary: "daily-stage-result-continue" },
  { id: "review-settled", q: "view=stage&kind=review&phase=settled", cards: "none", primary: "daily-stage-result-continue" },
  { id: "stage-error", q: "view=stage&kind=time_trial&phase=settled&error=1", cards: "none", primary: "daily-stage-result-continue" },
  { id: "legacy-standard", q: "view=stage&kind=standard&legacy=1&phase=settled", cards: "none", primary: "daily-stage-result-continue" },
  { id: "optional-entry", q: "view=optional", primary: "daily-optional-continue" },
  { id: "completion", q: "view=completion", primary: "daily-run-home" },
  { id: "completion-perfect", q: "view=completion&perfect=1", primary: "daily-run-home" },
  { id: "completion-legacy", q: "view=completion&legacy=1", primary: "daily-run-home" },
];

const REGIONS = [
  "result-hero", "daily-main-result-snapshot-slot", "daily-stage-result-snapshot-slot",
  "result-snapshot", "daily-discoveries", "daily-main-optional", "daily-stage-result-next-slot",
  "daily-run-error", "result-actions", "daily-run-complete", "daily-optional-entry",
  "daily-run-recap", "daily-run-perfect", "daily-run-complete-title",
];

const INSTALL = () => {
  const w = window;
  w.__cls = 0; w.__shifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { w.__cls += e.value; w.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime) }); }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (e) { /* unsupported */ }
  w.__frames = [];
  const sel = '[data-testid="result-hero"],[data-testid="daily-run-complete"],[data-testid="daily-optional-entry"]';
  const act = '[data-testid="daily-main-continue"],[data-testid="daily-stage-result-continue"],[data-testid="daily-optional-continue"],[data-testid="daily-run-home"]';
  const tick = () => {
    const a = document.querySelector(sel); const b = document.querySelector(act);
    w.__frames.push({
      t: Math.round(performance.now()),
      hero: a ? +(a.getBoundingClientRect().top + scrollY).toFixed(1) : null,
      act: b ? +(b.getBoundingClientRect().top + scrollY).toFixed(1) : null,
      h: document.documentElement.scrollHeight,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const MEASURE = ({ primary, regions }) => {
  const de = document.documentElement;
  const rect = (el) => {
    const b = el.getBoundingClientRect();
    return { top: +(b.top + scrollY).toFixed(1), bottom: +(b.bottom + scrollY).toFixed(1), h: +b.height.toFixed(1), l: +b.left.toFixed(1), r: +b.right.toFixed(1) };
  };
  const out = { vw: innerWidth, vh: innerHeight, docH: de.scrollHeight, docW: de.scrollWidth, clientW: de.clientWidth, scrollY: Math.round(scrollY) };
  out.travel = out.docH - out.vh;
  out.overflowX = de.scrollWidth - de.clientWidth;
  out.regions = {};
  for (const id of regions) {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) out.regions[id] = rect(el);
  }
  const act = document.querySelector(`[data-testid="${primary}"]`);
  out.primary = act ? rect(act) : null;
  out.primaryInView = act ? act.getBoundingClientRect().bottom <= innerHeight + 0.5 && act.getBoundingClientRect().top >= 0 : null;
  // every action control: touch-target size
  const controls = [...document.querySelectorAll('[data-testid="result-actions"] button, [data-testid="daily-run-error"] ~ button, [data-testid="daily-run-complete"] a, [data-testid="daily-run-retry"], [data-testid="daily-optional-entry"] button')];
  out.controls = controls.map((c) => ({ id: c.getAttribute("data-testid") || c.textContent.trim().slice(0, 24), h: +c.getBoundingClientRect().height.toFixed(1), w: +c.getBoundingClientRect().width.toFixed(1) }));
  // key facts: the score figure and the snapshot tiles
  const score = document.querySelector('[data-testid="daily-main-score"],[data-testid="daily-main-score-reveal"],[data-testid="result-score"],[data-testid="daily-stage-score"]');
  out.scoreBottom = score ? +(score.getBoundingClientRect().bottom + scrollY).toFixed(1) : null;
  out.scoreEl = score ? score.getAttribute("data-testid") : null;
  // Clipping: any text-bearing box in the result whose content is wider than the box.
  out.clipped = [...document.querySelectorAll('[data-testid="result-hero"] *, [data-testid="result-snapshot"] *, [data-testid="daily-discoveries"] *, [data-testid="result-actions"] *, [data-testid="daily-run-recap"] *, [data-testid="daily-main-optional"] *')]
    .filter((e) => !e.closest(".sr-only") && !e.classList.contains("sr-only") && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
    .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("data-testid") ? "[" + e.getAttribute("data-testid") + "]" : ""}:${e.scrollWidth}>${e.clientWidth}`).slice(0, 6);
  return out;
};

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const results = [];
  const todo = [];
  for (const s of STATES) {
    if (ONLY && !s.id.includes(ONLY)) continue;
    for (const vp of VIEWPORTS) {
      if (ONLY_VP && !vp.id.includes(ONLY_VP)) continue;
      todo.push([s, vp]);
    }
  }
  for (const [s, vp] of todo) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.phone, isMobile: false, deviceScaleFactor: vp.phone ? 2 : 1,
      reducedMotion: REDUCED ? "reduce" : "no-preference",
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await page.addInitScript(() => {
      sessionStorage.setItem("quiz:gate:hub_visited", "1");
      localStorage.setItem("mogsy_e2e_identity", JSON.stringify({
        token: "t", user: { id: "userA", email: "w3a@example.test", is_anonymous: false }, admin: false }));
    });
    await page.addInitScript(INSTALL);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const m = url.pathname.match(/^\/api\/ranked\/matches\/([^/]+)\/discoveries$/);
      if (!m && /fonts\.googleapis|fonts\.gstatic|supabase\.co|railway\.app/.test(url.hostname)) {
        if (/fonts\.googleapis/.test(url.hostname)) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
        return route.abort();
      }
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!s.cards) return route.fulfill({ status: 409, json: { detail: { code: "RANKED_MATCH_NOT_TERMINAL", message: "no" } } });
        const src = s.cards === "earned" ? backend.earned : backend.none;
        await new Promise((r) => setTimeout(r, 200));
        return route.fulfill({ json: { ...src, match_id: id, payload: { ...src.payload, match_id: id } } });
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, json: {} });
      return route.continue();
    });
    let rec = { state: s.id, vp: vp.id };
    try {
      await page.goto(`${BASE}/e2e/misc-w3a/harness.html?${s.q}`, { waitUntil: "load", timeout: 90000 });
      await page.waitForSelector('[data-testid="result-hero"],[data-testid="daily-run-complete"],[data-testid="daily-optional-entry"]', { timeout: 60000 });
      const base = s.flip ? s.flip + 2600 : (REDUCED ? 800 : 2600);
      await page.waitForTimeout(base);
      if (s.cards === "earned") {
        await page.waitForSelector('[data-testid="daily-discoveries"][data-expanded="true"]', { timeout: 15000 });
        await page.waitForTimeout(700);
      }
      // wait for fonts / images that exist on the page
      await page.evaluate(() => Promise.all([document.fonts && document.fonts.ready, ...[...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))]));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      rec = { ...rec, ...(await page.evaluate(MEASURE, { primary: s.primary, regions: REGIONS })) };
      // scrolled to the bottom: is the primary reachable, and fully clear?
      rec.atBottom = await page.evaluate((primary) => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const a = document.querySelector(`[data-testid="${primary}"]`);
        if (!a) return null;
        const b = a.getBoundingClientRect();
        return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), inView: b.top >= 0 && b.bottom <= innerHeight + 0.5 };
      }, s.primary);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (s.flip) {
        const f = await page.evaluate((flip) => {
          const frames = window.__frames;
          const last = frames[frames.length - 1];
          const pre = frames.filter((x) => x.t < flip - 200).pop();
          return {
            cls: +window.__cls.toFixed(4), shifts: window.__shifts,
            preHero: pre && pre.hero, finalHero: last.hero, heroDrift: pre ? +(last.hero - pre.hero).toFixed(1) : null,
            preAct: pre && pre.act, finalAct: last.act, actDrift: pre ? +(last.act - pre.act).toFixed(1) : null,
            preH: pre && pre.h, finalH: last.h,
          };
        }, s.flip);
        rec.flip = f;
      } else {
        rec.cls = await page.evaluate(() => +window.__cls.toFixed(4));
      }
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${s.id}__${vp.id}__fold.png`) });
        if (rec.travel > 2) await page.screenshot({ path: path.join(SHOTS, `${s.id}__${vp.id}__full.png`), fullPage: true });
      }
    } catch (e) {
      rec.error = String(e).slice(0, 300);
    }
    rec.pageErrors = errors;
    results.push(rec);
    console.log(`${s.id.padEnd(22)} ${vp.id.padEnd(13)} ${rec.error ? "ERR " + rec.error : `docH ${rec.docH} vh ${rec.vh} travel ${rec.travel} cta ${rec.primary ? rec.primary.top + "-" + rec.primary.bottom : "-"} inView ${rec.primaryInView} ovX ${rec.overflowX}${rec.clipped && rec.clipped.length ? " CLIPPED " + rec.clipped.join(",") : ""}${rec.flip ? ` heroDrift ${rec.flip.heroDrift} actDrift ${rec.flip.actDrift} cls ${rec.flip.cls}` : ""}`}`);
    await ctx.close();
  }
  fs.writeFileSync(OUT, JSON.stringify({ base: BASE, reduced: REDUCED, results }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
