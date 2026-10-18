/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MISC W3A (F05) — THE DAILY RESULT PAGES, COMPACT ON A PHONE, MEASURED.
 *
 * `harness.html` renders the REAL `DailyMainResult` / `DailyStageResult` /
 * `DailyCompletion` / `OptionalEntryBeat` inside the real `ArenaShell` and
 * `DailyStageChrome`, wrapped like `Layout` + `DailyRunPage`. For every state ×
 * viewport this asserts:
 *
 *   1. HEIGHT BUDGET — the document is no taller than `budgets.json` (the F05
 *      "after" measurement + 8px). It is a ratchet: a change that adds height to
 *      a Daily result fails here. States this lane does not own (optional-entry)
 *      are pinned at their untouched baseline.
 *   2. FIT — at 390×844 every settled result without earned cards fits with its
 *      primary action inside the first viewport; at 1280×800 nothing changed.
 *   3. NO CLIPPING, NO SIDEWAYS SCROLL — no tile/hero/action text is wider than
 *      its box; horizontal overflow stays within the pre-existing ≤12px glow bleed.
 *   4. TOUCH TARGETS — every action, link and Try again is ≥ 44px tall.
 *   5. NO JUMP — a pending result that settles on the same mount moves neither
 *      the hero nor the primary action (DRS1).
 *   6. REWARDS — with earned cards the panel opens, Continue is enabled and
 *      reachable by scrolling, and reduced motion opens it without the hold.
 *
 *   PW_CHANNEL=msedge npx playwright test -c playwright.daily-result-compact.config.ts
 *   (capture/measure tool for the before/after tables: e2e/misc-w3a/measure.cjs)
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const budgets: Record<string, Record<string, number>> = JSON.parse(
  fs.readFileSync(path.join(root, "e2e/misc-w3a/budgets.json"), "utf8"));
const backend = JSON.parse(fs.readFileSync(
  path.join(root, "src/lib/ranked-public/__fixtures__/dailyMatchDiscoveries.backend.json"), "utf8"));

const VIEWPORTS = [
  { id: "320x568", w: 320, h: 568 },
  { id: "360x640", w: 360, h: 640 },
  { id: "375x667", w: 375, h: 667 },
  { id: "390x844", w: 390, h: 844 },
  { id: "1280x800", w: 1280, h: 800 },
  { id: "667x375-land", w: 667, h: 375 },
  { id: "844x390-land", w: 844, h: 390 },
];

type State = { id: string; q: string; primary: string; cards?: "earned" | "none"; flip?: number };
const STATES: State[] = [
  { id: "main-pending", q: "view=main&phase=pending", primary: "daily-main-continue" },
  { id: "main-settled-cards", q: "view=main&phase=settled", cards: "earned", primary: "daily-main-continue" },
  { id: "main-settled-nocards", q: "view=main&phase=settled", cards: "none", primary: "daily-main-continue" },
  { id: "main-flip", q: "view=main&phase=pending&flip=1200", cards: "none", primary: "daily-main-continue", flip: 1200 },
  { id: "main-error", q: "view=main&phase=settled&error=1", cards: "none", primary: "daily-main-continue" },
  { id: "tt-pending", q: "view=stage&kind=time_trial&phase=pending", primary: "daily-stage-result-continue" },
  { id: "tt-settled", q: "view=stage&kind=time_trial&phase=settled", cards: "none", primary: "daily-stage-result-continue" },
  { id: "tt-settled-cards", q: "view=stage&kind=time_trial&phase=settled", cards: "earned", primary: "daily-stage-result-continue" },
  { id: "tt-flip", q: "view=stage&kind=time_trial&phase=pending&flip=1200", cards: "none", primary: "daily-stage-result-continue", flip: 1200 },
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

/** Settled results with no cards, plus the closing pages, that must fit a 390×844 phone. */
const FITS_390 = new Set([
  "main-pending", "main-settled-nocards", "review-settled", "legacy-standard",
  "optional-entry", "completion", "completion-perfect", "completion-legacy",
]);
/** …and these keep the primary action inside the first 844px even though the page scrolls a little. */
const CTA_IN_VIEW_390 = new Set([...FITS_390, "tt-pending", "tt-settled", "tt-flip", "surv-settled", "weak-settled", "main-error"]);

async function open(page: Page, s: State, reduced = false) {
  await page.addInitScript(() => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    (window as any).__frames = [];
    const sel = '[data-testid="result-hero"],[data-testid="daily-run-complete"],[data-testid="daily-optional-entry"]';
    const act = '[data-testid="daily-main-continue"],[data-testid="daily-stage-result-continue"],[data-testid="daily-optional-continue"],[data-testid="daily-run-home"]';
    const tick = () => {
      const a = document.querySelector(sel); const b = document.querySelector(act);
      (window as any).__frames.push({
        t: performance.now(),
        // Pending = the frame the result draws before the server states it.
        pending: !!document.querySelector('[data-pending="true"]'),
        hero: a ? a.getBoundingClientRect().top + scrollY : null,
        act: b ? b.getBoundingClientRect().top + scrollY : null,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const m = url.pathname.match(/^\/api\/ranked\/matches\/([^/]+)\/discoveries$/);
    if (m) {
      if (!s.cards) return route.fulfill({ status: 409, json: { detail: { code: "RANKED_MATCH_NOT_TERMINAL", message: "no" } } });
      const src = s.cards === "earned" ? backend.earned : backend.none;
      const id = decodeURIComponent(m[1]);
      return route.fulfill({ json: { ...src, match_id: id, payload: { ...src.payload, match_id: id } } });
    }
    if (/fonts\.googleapis/.test(url.hostname)) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    if (/fonts\.gstatic|supabase\.co|railway\.app/.test(url.hostname)) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, json: {} });
    return route.continue();
  });
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/e2e/misc-w3a/harness.html?${s.q}`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="result-hero"],[data-testid="daily-run-complete"],[data-testid="daily-optional-entry"]');
}

async function settle(page: Page, s: State) {
  await page.waitForTimeout(s.flip ? s.flip + 1600 : 1500);
  if (s.cards === "earned") {
    await page.waitForSelector('[data-testid="daily-discoveries"][data-expanded="true"]', { timeout: 15_000 });
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => Promise.all((document as any).fonts ? [(document as any).fonts.ready] : []));
  await page.evaluate(() => window.scrollTo(0, 0));
}

const measure = (page: Page, primary: string) => page.evaluate((primaryId) => {
  const de = document.documentElement;
  const el = document.querySelector(`[data-testid="${primaryId}"]`) as HTMLElement | null;
  const b = el?.getBoundingClientRect();
  const controls = [...document.querySelectorAll(
    '[data-testid="result-actions"] button, [data-testid="daily-run-retry"], [data-testid="daily-run-complete"] a, [data-testid="daily-optional-entry"] button')]
    .map((c) => ({ id: c.getAttribute("data-testid") ?? c.textContent ?? "", h: c.getBoundingClientRect().height }));
  const clipped = [...document.querySelectorAll(
    '[data-testid="result-hero"] *, [data-testid="result-snapshot"] *, [data-testid="result-actions"] *, [data-testid="daily-run-recap"] *, [data-testid="daily-main-optional"] *')]
    .filter((e) => !e.closest(".sr-only") && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
    .map((e) => `${e.tagName}:${e.getAttribute("data-testid") ?? ""}`);
  return {
    docH: de.scrollHeight, vh: innerHeight, overflowX: de.scrollWidth - de.clientWidth,
    primaryBottom: b ? b.bottom + scrollY : null, primaryTop: b ? b.top + scrollY : null,
    primaryDisabled: el ? (el as HTMLButtonElement).disabled === true : null,
    controls, clipped,
  };
}, primary);

for (const vp of VIEWPORTS) {
  test.describe(`${vp.id}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.w < 640 || vp.h < 540 });
    for (const s of STATES) {
      test(`${s.id}`, async ({ page }) => {
        await open(page, s);
        await settle(page, s);
        const m = await measure(page, s.primary);

        // 1. the ratchet
        const budget = budgets[s.id]?.[vp.id];
        expect(budget, `no budget for ${s.id} @ ${vp.id}`).toBeTruthy();
        expect(m.docH, `${s.id} @ ${vp.id}: document height`).toBeLessThanOrEqual(budget);

        // 2. fit
        if (vp.id === "390x844" && FITS_390.has(s.id)) {
          expect(m.docH, "fits a 390×844 phone without scrolling").toBeLessThanOrEqual(m.vh);
        }
        if (vp.id === "390x844" && CTA_IN_VIEW_390.has(s.id)) {
          expect(m.primaryBottom, "primary action inside the first viewport").toBeLessThanOrEqual(m.vh + 0.5);
        }

        // 3. no clipping / sideways scroll
        expect(m.clipped, "no text wider than its box").toEqual([]);
        expect(m.overflowX, "no sideways scroll beyond the pre-existing glow bleed").toBeLessThanOrEqual(12);

        // 4. touch targets
        for (const c of m.controls) expect(c.h, `${c.id} is a 44px target`).toBeGreaterThanOrEqual(43.5);

        // 5. no jump on settle
        if (s.flip) {
          const f = await page.evaluate(() => {
            type Fr = { t: number; pending: boolean; hero: number | null; act: number | null };
            const frames: Fr[] = (window as any).__frames;
            const first = frames.find((x) => x.hero !== null)!;
            const last = frames[frames.length - 1];
            // The last PENDING frame, once the entrance animation (≤ ~0.8s) has finished.
            const pre = [...frames].reverse().find((x) => x.pending && x.hero !== null && x.t > first.t + 800);
            return { found: !!pre,
              dh: pre && last.hero !== null && pre.hero !== null ? last.hero - pre.hero : null,
              da: pre && last.act !== null && pre.act !== null ? last.act - pre.act : null };
          });
          expect(f.found, "a settled-entrance pending frame was sampled").toBe(true);
          expect(Math.abs(f.dh ?? 0), "hero does not move when the result settles").toBeLessThanOrEqual(0.5);
          expect(Math.abs(f.da ?? 0), "primary action does not move when the result settles").toBeLessThanOrEqual(0.5);
        }

        // 6. rewards: the action stays reachable by scrolling, and enabled once settled
        if (s.cards === "earned") {
          const at = await page.evaluate((id) => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const b = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
            return { top: b.top, bottom: b.bottom, vh: innerHeight };
          }, s.primary);
          expect(at.top).toBeGreaterThanOrEqual(0);
          expect(at.bottom).toBeLessThanOrEqual(at.vh + 0.5);
          expect(m.primaryDisabled).toBe(false);
        }
      });
    }
  });
}

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  for (const s of STATES.filter((x) => x.cards === "earned")) {
    test(`${s.id}: the earned cards open without the hold`, async ({ page }) => {
      await open(page, s, true);
      const t0 = Date.now();
      await page.waitForSelector('[data-testid="daily-discoveries"][data-expanded="true"]', { timeout: 15_000 });
      expect(Date.now() - t0, "no 600–1200ms hold under reduced motion").toBeLessThan(1500);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.getByTestId(s.primary)).toBeEnabled();
      await expect(page.getByTestId("discovery-cta")).toBeVisible();
    });
  }
});
