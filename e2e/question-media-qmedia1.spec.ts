/** QMEDIA1 — question media acceptance through the REAL Ranked/Daily renderer.
 *
 * Mounted through `/dev/ranked-shell-probe`, which serves backend-shaped rounds
 * from an in-page fetch interceptor, so the only thing under test is the
 * production card path every bank-row mode shares (Daily, Ranked, Role
 * Challenge, Time Trial). The art is served from checked-in fixtures (copies
 * of the backend's `assets/objectives/dragon_pit.png` and
 * `assets/items_wiki/2055.png`), so the run needs no backend.
 *
 * CI only (GitHub Actions, bundled Chromium); see AGENTS.md.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const FIXTURES: Record<string, string> = {
  "objectives/dragon_pit.png": "e2e/fixtures/qmedia1/dragon_pit.png",
  "items_wiki/2055.png": "e2e/fixtures/qmedia1/control_ward_2055.png",
};

const CASES = [
  { q: "dragonRespawn", alt: "Dragon", natural: 75, answer: "5:00",
    prompt: "How long does Dragon take to respawn?" },
  { q: "visionWard", alt: "Control Ward", natural: 0, answer: "75 gold",
    prompt: "How much does a Control Ward normally cost?" },
] as const;

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1280, height: 800 }, mobile: false },
  { name: "phone", viewport: { width: 390, height: 844 }, mobile: true },
] as const;

async function serveArt(page: Page) {
  await page.route(/\/assets\/(objectives\/dragon_pit|items_wiki\/2055)\.png(\?.*)?$/, route => {
    const key = Object.keys(FIXTURES).find(k => route.request().url().includes(k))!;
    return route.fulfill({ status: 200, contentType: "image/png",
      body: readFileSync(FIXTURES[key]) });
  });
  await page.route(/\/assets\/__viscont_missing__\//, route => route.fulfill({ status: 404 }));
}

for (const vp of VIEWPORTS) {
  test.describe(`question media ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, isMobile: vp.mobile, hasTouch: vp.mobile });

    for (const c of CASES) {
      test(`${c.q} draws its premise subject and never its answer`, async ({ page }, info) => {
        await serveArt(page);
        await page.goto(`/dev/ranked-shell-probe?q=${c.q}&host=daily`);
        await page.waitForSelector('[data-testid="ranked-question"] [data-quiz-choice]');
        const img = page.locator(`[data-testid="scenario-hero"] img[alt="${c.alt}"]`);
        await expect(img).toBeVisible();
        await expect.poll(() => img.evaluate((el: HTMLImageElement) =>
          el.complete ? el.naturalWidth : 0)).toBeGreaterThan(0);
        if (c.natural) {
          expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(c.natural);
        }
        const box = await img.boundingBox();
        expect(box!.width, "subject art collapsed").toBeGreaterThanOrEqual(20);
        const band = await page.locator('[data-testid="scenario-hero"]').innerText();
        expect(band).not.toContain(c.answer);
        await expect(page.getByText(c.prompt)).toBeVisible();
        await expect(page.locator('[data-surface-region="answers"] [data-quiz-choice]'))
          .toHaveCount(4);
        await page.screenshot({ path: info.outputPath(`${c.q}-${vp.name}.png`) });
      });

      test(`${c.q} with a missing asset keeps the question and its label`, async ({ page }, info) => {
        await serveArt(page);
        await page.goto(`/dev/ranked-shell-probe?q=${c.q}&host=daily&broken=1`);
        await page.waitForSelector('[data-testid="ranked-question"] [data-quiz-choice]');
        // The card swaps a failed image for its "?" tile; no broken <img> stays.
        await expect.poll(() => page.locator('[data-testid="scenario-hero"] img').evaluateAll(
          (els: HTMLImageElement[]) => els.filter(el => el.complete && el.naturalWidth === 0
            && getComputedStyle(el).display !== "none").length)).toBe(0);
        await expect(page.locator('[data-testid="scenario-hero"]')).toContainText(c.alt);
        await expect(page.getByText(c.prompt)).toBeVisible();
        await expect(page.locator('[data-surface-region="answers"] [data-quiz-choice]'))
          .toHaveCount(4);
        await page.screenshot({ path: info.outputPath(`${c.q}-${vp.name}-broken.png`) });
      });
    }
  });
}
