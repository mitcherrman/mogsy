/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MISC W3A (F05) — THE DAILY RESULT PAGES, COMPACT ON A PHONE, MEASURED.
 *
 * `harness.html` renders the REAL `DailyMainResult` / `DailyStageResult` /
 * `DailyCompletion` / `OptionalEntryBeat` inside the real `ArenaShell` and
 * `DailyStageChrome`, wrapped like `Layout` + `DailyRunPage`, with the app's real
 * faces (Inter, Cinzel — vendored in `fonts/`) so glyph widths do not depend on
 * which OS runs the test. For every state × viewport this asserts:
 *
 *   1. HEIGHT BUDGET — the document is no taller than `budgets.json` (the F05
 *      "after" measurement on Windows Edge and Linux Chromium, the larger of the
 *      two, + 8px). A ratchet: a change that adds height to a Daily result fails.
 *      The OS-independent version of the same claim ("never taller than the
 *      untouched original, saves ≥ N px") is `compare.cjs`, run in CI.
 *   2. FIT — at 390×844 every settled result without earned cards fits with its
 *      primary action inside the first viewport; at 1280×800 nothing changed.
 *   3. NO SPILL — no text is wider than its box (an intentional `truncate`
 *      ellipsis is reported but allowed), and no sideways scroll beyond the
 *      pre-existing ≤12px glow bleed.
 *   4. TOUCH TARGETS — every action, link and Try again is ≥ 44px tall.
 *   5. NO JUMP — a pending result that settles on the same mount moves neither
 *      the hero nor the primary action (DRS1). The failure message names every
 *      region that moved and by how much.
 *   6. REWARDS — with earned cards the panel opens, Continue is enabled and
 *      reachable by scrolling, and reduced motion opens it without the hold.
 *   7. FALLBACK FACES — the settlement frame and the tiles also hold in a wide
 *      stand-in face (Verdana / DejaVu Sans), because a player's Inter can be late
 *      or blocked and the first CI run found a 7px jump and 2px of tile spill there.
 *
 *   PW_CHANNEL=msedge npx playwright test -c playwright.daily-result-compact.config.ts
 *   (capture/measure tool for the before/after tables: e2e/misc-w3a/measure.cjs)
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// The measurement library is CommonJS (shared with the plain-node capture tool).
const lib = createRequire(import.meta.url)("./lib.cjs");
const { STATES, VIEWPORTS } = lib as { STATES: State[]; VIEWPORTS: { id: string; w: number; h: number }[] };

type State = { id: string; q: string; primary: string; cards?: "earned" | "none"; flip?: number };

const budgets: Record<string, Record<string, number>> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "e2e/misc-w3a/budgets.json"), "utf8"));

/** Settled results with no cards, plus the closing pages, that must fit a 390×844 phone. */
const FITS_390 = new Set([
  "main-pending", "main-settled-nocards", "review-settled", "legacy-standard",
  "optional-entry", "completion", "completion-perfect", "completion-legacy",
]);
/** …and these keep the primary action inside the first 844px even though the page scrolls a little. */
const CTA_IN_VIEW_390 = new Set([...FITS_390, "tt-pending", "tt-settled", "tt-flip", "surv-settled", "weak-settled", "main-error"]);

async function load(page: Page, s: State, opts: { reduced?: boolean; fonts?: "bundled" | "wide" } = {}) {
  await lib.prepare(page, s, opts);
  await lib.open(page, "", s, opts);
}

/** Spill = text wider than its box. An intentional ellipsis is allowed; anything else is named. */
const spills = (m: any) => (m.clipped as any[])
  .filter((c) => !c.ellipsis)
  .map((c) => `<${c.tag}> "${c.text}" in [${c.owner}] ${c.scrollW}>${c.clientW}px (${c.font})`);

const settleReport = (f: any) => `${JSON.stringify(f.moved)} (docH ${JSON.stringify(f.docH)})`;

for (const vp of VIEWPORTS) {
  test.describe(`${vp.id}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.w < 640 || vp.h < 540 });
    for (const s of STATES) {
      test(`${s.id}`, async ({ page }) => {
        await load(page, s);
        await lib.settle(page, s);
        const m = await lib.measureState(page, s);

        // 1. the ratchet
        const budget = budgets[s.id]?.[vp.id];
        expect(budget, `no budget for ${s.id} @ ${vp.id}`).toBeTruthy();
        expect(m.docH, `${s.id} @ ${vp.id}: document height`).toBeLessThanOrEqual(budget);

        // 2. fit
        if (vp.id === "390x844" && FITS_390.has(s.id)) {
          expect(m.docH, "fits a 390×844 phone without scrolling").toBeLessThanOrEqual(m.vh);
        }
        if (vp.id === "390x844" && CTA_IN_VIEW_390.has(s.id)) {
          expect(m.primary.bottom, "primary action inside the first viewport").toBeLessThanOrEqual(m.vh + 0.5);
        }

        // 3. no spill / sideways scroll
        expect(spills(m), "no text wider than its box").toEqual([]);
        expect(m.overflowX, "no sideways scroll beyond the pre-existing glow bleed").toBeLessThanOrEqual(12);

        // 4. touch targets
        for (const c of m.controls) expect(c.h, `${c.id} is a 44px target`).toBeGreaterThanOrEqual(43.5);

        // 5. no jump on settle
        if (s.flip) {
          const f = await page.evaluate(lib.flipAnalysis);
          expect(f.found, "a settled-entrance pending frame was sampled").toBe(true);
          expect(Math.abs(f.heroDrift), `hero does not move when the result settles: ${settleReport(f)}`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(f.actDrift ?? 0), `primary action does not move when the result settles: ${settleReport(f)}`).toBeLessThanOrEqual(0.5);
        }

        // 6. rewards: the action stays reachable by scrolling, and enabled once settled
        if (s.cards === "earned") {
          const at = await page.evaluate((id: string) => {
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

// 7. The same frame and tiles in a face wider than Inter. Not a height budget (a
//    stand-in face has OS-specific metrics): the claims are structural.
test.describe("a wide fallback face", () => {
  const WIDE_STATES = ["main-flip", "tt-flip", "tt-settled", "surv-settled", "main-settled-nocards", "completion", "completion-perfect"];
  for (const vpId of ["320x568", "360x640"]) {
    const vp = VIEWPORTS.find((v) => v.id === vpId)!;
    test.describe(vpId, () => {
      test.use({ viewport: { width: vp.w, height: vp.h }, hasTouch: true });
      for (const s of STATES.filter((x) => WIDE_STATES.includes(x.id))) {
        test(`${s.id}`, async ({ page }) => {
          await load(page, s, { fonts: "wide" });
          await lib.settle(page, s);
          const m = await lib.measureState(page, s);
          expect(spills(m), "no text wider than its box, even in a wide face").toEqual([]);
          expect(m.overflowX).toBeLessThanOrEqual(12);
          if (s.flip) {
            const f = await page.evaluate(lib.flipAnalysis);
            expect(f.found).toBe(true);
            expect(Math.abs(f.heroDrift), `hero: ${settleReport(f)}`).toBeLessThanOrEqual(0.5);
            expect(Math.abs(f.actDrift ?? 0), `primary action: ${settleReport(f)}`).toBeLessThanOrEqual(0.5);
          }
        });
      }
    });
  }
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  for (const s of STATES.filter((x) => x.cards === "earned")) {
    test(`${s.id}: the earned cards open without the hold`, async ({ page }) => {
      await load(page, s, { reduced: true });
      const t0 = Date.now();
      await page.waitForSelector('[data-testid="daily-discoveries"][data-expanded="true"]', { timeout: 15_000 });
      expect(Date.now() - t0, "no 600–1200ms hold under reduced motion").toBeLessThan(1500);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.getByTestId(s.primary)).toBeEnabled();
      await expect(page.getByTestId("discovery-cta")).toBeVisible();
    });
  }
});
