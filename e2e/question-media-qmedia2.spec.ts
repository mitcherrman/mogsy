/** QMEDIA2 — option/board art that fails to load never leaves a broken image.
 *
 * Match Grid's seals and sigils had no error handler, so a dead rune asset
 * left the browser's broken-image glyph on the board. With every image on the
 * page answered 404, the board must show monograms instead, keep every sigil
 * and seal, and stay playable.
 *
 * Mounted through the frontend-only Match Grid lab (`roster=frontend`), so
 * the run needs no backend. CI only (GitHub Actions, bundled Chromium); see
 * AGENTS.md.
 */
import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1280, height: 800 }, mobile: false },
  { name: "phone", viewport: { width: 390, height: 844 }, mobile: true },
] as const;

const BOARD = '[data-mig-primitive="match-grid"]';

for (const vp of VIEWPORTS) {
  test.describe(`match grid missing art ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, isMobile: vp.mobile, hasTouch: vp.mobile });

    test("every failed image becomes its monogram and the board stays whole", async ({ page }, info) => {
      let refused = 0;
      await page.route(/\.(png|webp|jpe?g|svg)(\?.*)?$/i, (route) => {
        if (route.request().resourceType() !== "image") return route.continue();
        refused += 1;
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("/dev/match-grid?round=academy&roster=frontend");
      await page.waitForSelector(`${BOARD} .mg-sigil-disc`);

      // No visible <img> on the board is a failed load.
      await expect.poll(() => page.locator(`${BOARD} img`).evaluateAll(
        (els: HTMLImageElement[]) => els.filter((el) => el.complete && el.naturalWidth === 0
          && getComputedStyle(el).display !== "none").length)).toBe(0);

      const sigils = page.locator(`${BOARD} .mg-sigil-disc`);
      const count = await sigils.count();
      expect(count).toBeGreaterThan(0);
      // Each sigil shows either art that loaded (none can, here) or its monogram.
      await expect(page.locator(`${BOARD} .mg-sigil-mono`)).toHaveCount(count);
      for (const mono of await page.locator(`${BOARD} .mg-sigil-mono`).allInnerTexts()) {
        expect(mono.trim().length).toBeGreaterThan(0);
      }
      expect(refused, "the lab requested no art, so the fallback was not exercised").toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath(`match-grid-broken-${vp.name}.png`) });
    });
  });
}
