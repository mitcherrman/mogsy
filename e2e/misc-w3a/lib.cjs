/* eslint-disable */
/**
 * MISC W3A (F05) — the ONE implementation of "open a Daily result state, let it
 * settle, measure it", shared by `measure.cjs` (before/after tables, CI relative
 * comparison) and `daily-result-compact.spec.ts` (the regression spec), so the two
 * can never disagree about what was measured.
 *
 * FONTS. The harness page loads the app's two real faces (Inter, Cinzel — the
 * Google Fonts the production `index.html` links) from `fonts/`, so layout is
 * measured with the fonts a player sees and not with whatever system fallback the
 * test machine happens to have (Segoe UI/Georgia on Windows, DejaVu on Linux CI:
 * the first CI run's +45px "Finish" wrap was exactly that). `fonts=system` turns
 * them off, which is how the platform difference was diagnosed.
 */
const fs = require("node:fs");
const path = require("node:path");

const backend = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../../src/lib/ranked-public/__fixtures__/dailyMatchDiscoveries.backend.json"), "utf8"));

const VIEWPORTS = [
  { id: "320x568", w: 320, h: 568, phone: true },
  { id: "360x640", w: 360, h: 640, phone: true },
  { id: "375x667", w: 375, h: 667, phone: true },
  { id: "390x844", w: 390, h: 844, phone: true },
  { id: "1280x800", w: 1280, h: 800, phone: false },
  { id: "667x375-land", w: 667, h: 375, phone: true },
  { id: "844x390-land", w: 844, h: 390, phone: true },
];

const FLIP_MS = 1200;
// cards: "earned" → the real backend projection (3 cards); "none"; absent → 409 (silence)
const STATES = [
  { id: "main-pending", q: "view=main&phase=pending", primary: "daily-main-continue" },
  { id: "main-settled-cards", q: "view=main&phase=settled", cards: "earned", primary: "daily-main-continue" },
  { id: "main-settled-nocards", q: "view=main&phase=settled", cards: "none", primary: "daily-main-continue" },
  { id: "main-flip", q: `view=main&phase=pending&flip=${FLIP_MS}`, cards: "none", primary: "daily-main-continue", flip: FLIP_MS },
  { id: "main-error", q: "view=main&phase=settled&error=1", cards: "none", primary: "daily-main-continue" },
  { id: "tt-pending", q: "view=stage&kind=time_trial&phase=pending", primary: "daily-stage-result-continue" },
  { id: "tt-settled", q: "view=stage&kind=time_trial&phase=settled", cards: "none", primary: "daily-stage-result-continue" },
  { id: "tt-settled-cards", q: "view=stage&kind=time_trial&phase=settled", cards: "earned", primary: "daily-stage-result-continue" },
  { id: "tt-flip", q: `view=stage&kind=time_trial&phase=pending&flip=${FLIP_MS}`, cards: "none", primary: "daily-stage-result-continue", flip: FLIP_MS },
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

const REGION_IDS = [
  "result-hero", "daily-main-result-snapshot-slot", "daily-stage-result-snapshot-slot",
  "result-snapshot", "daily-discoveries", "daily-main-optional", "daily-stage-result-next-slot",
  "daily-section-ladder", "daily-stage-ladder", "daily-run-error", "result-actions",
  "daily-run-complete", "daily-optional-entry", "daily-run-recap", "daily-run-perfect",
  "daily-run-complete-title",
];

const HERO_SEL = '[data-testid="result-hero"],[data-testid="daily-run-complete"],[data-testid="daily-optional-entry"]';
const PRIMARY_SEL = '[data-testid="daily-main-continue"],[data-testid="daily-stage-result-continue"],[data-testid="daily-optional-continue"],[data-testid="daily-run-home"]';

// ── browser-side functions (serialised by Playwright: no closures over this module) ──

/** Init script: layout-shift observer + a per-frame sampler of every region's box. */
function install(regionIds) {
  const w = window;
  w.__cls = 0; w.__shifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { w.__cls += e.value; w.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime) }); }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (e) { /* unsupported */ }
  w.__frames = [];
  const ids = [...regionIds, "daily-main-continue", "daily-stage-result-continue", "daily-optional-continue", "daily-run-home"];
  const tick = () => {
    const r = {};
    for (const id of ids) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (el) { const b = el.getBoundingClientRect(); r[id] = [+(b.top + scrollY).toFixed(2), +(b.bottom + scrollY).toFixed(2)]; }
    }
    w.__frames.push({
      t: performance.now(),
      // Pending = the frame the result draws before the server states it.
      pending: !!document.querySelector('[data-pending="true"]'),
      docH: document.documentElement.scrollHeight,
      r,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** One settled state's geometry, at scroll 0. */
function measure(arg) {
  const { primary, regionIds } = arg;
  const de = document.documentElement;
  const rect = (el) => {
    const b = el.getBoundingClientRect();
    return { top: +(b.top + scrollY).toFixed(1), bottom: +(b.bottom + scrollY).toFixed(1), h: +b.height.toFixed(1), l: +b.left.toFixed(1), r: +b.right.toFixed(1) };
  };
  const out = { vw: innerWidth, vh: innerHeight, docH: de.scrollHeight, docW: de.scrollWidth, clientW: de.clientWidth, scrollY: Math.round(scrollY) };
  out.travel = out.docH - out.vh;
  out.overflowX = de.scrollWidth - de.clientWidth;
  out.regions = {};
  for (const id of regionIds) {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) out.regions[id] = rect(el);
  }
  const act = document.querySelector(`[data-testid="${primary}"]`);
  out.primary = act ? rect(act) : null;
  out.primaryInView = act ? act.getBoundingClientRect().bottom <= innerHeight + 0.5 && act.getBoundingClientRect().top >= 0 : null;
  out.primaryDisabled = act ? act.disabled === true : null;
  const controls = [...document.querySelectorAll('[data-testid="result-actions"] button, [data-testid="daily-run-retry"], [data-testid="daily-run-complete"] a, [data-testid="daily-optional-entry"] button')];
  out.controls = controls.map((c) => ({ id: c.getAttribute("data-testid") || c.textContent.trim().slice(0, 24), h: +c.getBoundingClientRect().height.toFixed(1), w: +c.getBoundingClientRect().width.toFixed(1) }));
  out.font = getComputedStyle(document.body).fontFamily.slice(0, 60);
  out.fontsLoaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "") + " " + f.weight);
  // Clipping: a text-bearing box whose content is wider than the box. Described
  // precisely (tag, text, nearest test id, sizes, face) so a report can be located.
  const scope = '[data-testid="result-hero"] *, [data-testid="result-snapshot"] *, [data-testid="result-actions"] *, [data-testid="daily-run-recap"] *, [data-testid="daily-main-optional"] *, [data-testid="daily-run-complete"] *, [data-testid="daily-stage-ladder"] *, [data-testid="daily-section-ladder"] *';
  out.clipped = [...document.querySelectorAll(scope)]
    .filter((e) => !e.closest(".sr-only") && !e.classList.contains("sr-only") && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
    .map((e) => {
      const owner = e.closest("[data-testid]");
      const cs = getComputedStyle(e);
      return {
        tag: e.tagName.toLowerCase(),
        text: (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48),
        owner: owner ? owner.getAttribute("data-testid") : null,
        scrollW: e.scrollWidth, clientW: e.clientWidth,
        overflow: cs.overflowX, wrap: cs.whiteSpace, font: cs.fontFamily.split(",")[0],
        cls: (e.getAttribute("class") || "").slice(0, 80),
      };
    }).slice(0, 8);
  return out;
}

/** After a pending → settled flip: how far each region moved, and which ones. */
function flipAnalysis() {
  const frames = window.__frames;
  const first = frames.find((x) => x.r["result-hero"] || x.r["daily-run-complete"]);
  const last = frames[frames.length - 1];
  // The last PENDING frame, once the entrance animation (≤ ~0.8s) has finished.
  const pre = first && [...frames].reverse().find((x) => x.pending && x.t > first.t + 800);
  if (!pre) return { found: false, cls: +window.__cls.toFixed(4) };
  const delta = {};
  for (const id of Object.keys(last.r)) {
    if (!pre.r[id]) { delta[id] = { appeared: true, top: last.r[id][0], h: +(last.r[id][1] - last.r[id][0]).toFixed(2) }; continue; }
    const dTop = +(last.r[id][0] - pre.r[id][0]).toFixed(2);
    const dH = +((last.r[id][1] - last.r[id][0]) - (pre.r[id][1] - pre.r[id][0])).toFixed(2);
    if (Math.abs(dTop) > 0.01 || Math.abs(dH) > 0.01) delta[id] = { dTop, dH };
  }
  const primaryId = Object.keys(last.r).find((k) => /continue$|run-home$/.test(k));
  const heroId = last.r["result-hero"] ? "result-hero" : "daily-run-complete";
  return {
    found: true, cls: +window.__cls.toFixed(4), shifts: window.__shifts,
    heroDrift: +(last.r[heroId][0] - pre.r[heroId][0]).toFixed(2),
    actDrift: primaryId && pre.r[primaryId] ? +(last.r[primaryId][0] - pre.r[primaryId][0]).toFixed(2) : null,
    docH: [pre.docH, last.docH], moved: delta,
  };
}

// ── node-side helpers ──

/** Page set-up shared by the capture tool and the spec: identity, sampler, network. */
async function prepare(page, state, opts = {}) {
  const reduced = !!opts.reduced;
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({
      token: "t", user: { id: "userA", email: "w3a@example.test", is_anonymous: false }, admin: false }));
  });
  await page.addInitScript(install, REGION_IDS);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const m = url.pathname.match(/^\/api\/ranked\/matches\/([^/]+)\/discoveries$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!state.cards) return route.fulfill({ status: 409, json: { detail: { code: "RANKED_MATCH_NOT_TERMINAL", message: "no" } } });
      const src = state.cards === "earned" ? backend.earned : backend.none;
      await new Promise((r) => setTimeout(r, 200));
      return route.fulfill({ json: { ...src, match_id: id, payload: { ...src.payload, match_id: id } } });
    }
    if (/fonts\.googleapis/.test(url.hostname)) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    if (/fonts\.gstatic|supabase\.co|railway\.app/.test(url.hostname)) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, json: {} });
    return route.continue();
  });
}

async function open(page, base, state, opts = {}) {
  const fonts = opts.fonts === "system" ? "&fonts=system" : "";
  await page.goto(`${base}/e2e/misc-w3a/harness.html?${state.q}${fonts}`, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(HERO_SEL, { timeout: 60000 });
}

async function settle(page, state, opts = {}) {
  await page.waitForTimeout(state.flip ? state.flip + 1600 : (opts.reduced ? 600 : 1500));
  if (state.cards === "earned") {
    await page.waitForSelector('[data-testid="daily-discoveries"][data-expanded="true"]', { timeout: 15000 });
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => Promise.all([document.fonts && document.fonts.ready, ...[...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))]));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
}

const measureState = (page, state) => page.evaluate(measure, { primary: state.primary, regionIds: REGION_IDS });

module.exports = {
  VIEWPORTS, STATES, REGION_IDS, FLIP_MS, HERO_SEL, PRIMARY_SEL, backend,
  install, measure, flipAnalysis, prepare, open, settle, measureState,
};
