/**
 * THE OUTRO IS THE INTRO'S BOOKEND — MEASURED, NOT ASSUMED.
 *
 * The arena hosts the match outro on an overlay layer that is a direct child
 * of `.ranked-shell`. For a whole phase that layer carried `absolute inset-0`
 * and every structural test passed — while `.ranked-shell > *` (same
 * specificity, later in the cascade) reset it to `position: relative`. In a
 * browser the layer was a 0px flex item at the shell's BOTTOM edge and the
 * outro spilled downward from there: at 1440x900 the score sat at y≈931,
 * below the fold, and the document grew to 1009px. `?beat=outro` hid it,
 * because that preview is hosted `fixed inset-0` outside the shell.
 *
 * So this file drives the REAL arena-hosted outro (the probe's `sfx=1`
 * fixture ends the match live) and compares rects against the intro's:
 *
 *   - the layer covers the shell (it is not collapsed),
 *   - the outro composes in the intro's own box, so its centre is the intro's,
 *   - the score lands near where the VS medallion stood,
 *   - result and score are inside the viewport and the page does not grow.
 */
import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { w: 1440, h: 900, extra: "" },
  { w: 1024, h: 768, extra: "" },
  { w: 390, h: 844, extra: "" },
  // The phone one-screen arena (`data-phone-arena`), as the fit spec drives it.
  { w: 390, h: 844, extra: "&frame=0" },
];

type Rect = { top: number; bottom: number; cy: number };

async function rect(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, cy: b.top + b.height / 2 };
  });
}

for (const vp of VIEWPORTS) {
  test(`outro resolves on the intro's axis at ${vp.w}x${vp.h}${vp.extra}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    // Transforms are part of the entrance, not the resting composition.
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto(`/dev/ranked-shell-probe?entry=fresh&lead=60000${vp.extra}`);
    await page.locator(".ranked-entry-intro__versus").waitFor();
    const introBox = await rect(page, ".ranked-entry-intro");
    const versus = await rect(page, ".ranked-entry-intro__versus");

    await page.goto(`/dev/ranked-shell-probe?sfx=1${vp.extra}`);
    await page.getByTestId("ranked-match").waitFor();
    const docBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    const advance = page.getByTestId("probe-sfx-advance");
    for (let step = 0; step < 5; step += 1) {
      await advance.click();
      if (step < 4) await page.waitForTimeout(2200);
    }
    // MATCH_OUTRO_MS is 1200: measure as soon as it is up.
    await page.getByTestId("ranked-match-outro").waitFor({ timeout: 10_000 });

    const shell = await rect(page, '[data-testid="ranked-match"]');
    const layer = await rect(page, '[data-testid="ranked-warning-layer"]');
    const stage = await rect(page, ".ranked-match-outro > .ranked-beat__inner");
    const result = await rect(page, '[data-testid="match-outro-result"]');
    const score = await rect(page, '[data-testid="match-outro-score"]');
    const docDuring = await page.evaluate(() => document.documentElement.scrollHeight);

    // 1. Not collapsed: the overlay IS the shell.
    expect(Math.abs(layer.top - shell.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(layer.bottom - shell.bottom)).toBeLessThanOrEqual(1);

    // 2. One duel stage: the outro composes in a box the intro's height,
    //    from the shell's top — its centre is the intro's centre.
    expect(Math.abs((stage.bottom - stage.top) - (introBox.bottom - introBox.top)))
      .toBeLessThanOrEqual(2);
    expect(Math.abs(stage.top - shell.top)).toBeLessThanOrEqual(1);

    // 3. The score lands where the VS was (the outro stacks its result word
    //    above the board, so it sits a little lower — never a region lower).
    expect(Math.abs(score.cy - versus.cy)).toBeLessThanOrEqual(vp.h * 0.08);

    // 4. In the primary field, and costs no scroll.
    for (const r of [result, score]) {
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.bottom).toBeLessThanOrEqual(vp.h * 0.6);
    }
    expect(docDuring).toBe(docBefore);
  });
}
