/** QMEDIA3 — an ability question that names its subject draws it.
 *
 * The owner's Daily row "What is the rank 2 cooldown of Varus Q - Piercing
 * Arrow?" (`ability_cooldown_rank:Varus:Q:r2`, quiz_questions 126394) drew an
 * empty media band: the family was undeclared in the backend presentation
 * contract. These cases mount the blob the backend now renders through the
 * REAL Ranked and Daily card path (`/dev/ranked-shell-probe`, `host=daily` for
 * Daily) and screenshot it, plus the balanced two-champion card the
 * `ability_cooldown_compare` family now gets.
 *
 * Art is served from checked-in copies of the backend's own files
 * (`assets/champions/...`), so the run needs no backend or asset host.
 *
 * CI only (GitHub Actions, bundled Chromium); see AGENTS.md.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ART: Array<[RegExp, string, string]> = [
  [/\/assets\/champions\/Varus\/Q_VarusQ\.png/, "Varus_Q_VarusQ.png", "image/png"],
  [/\/assets\/champions\/Varus\/icon\.png/, "Varus_icon.png", "image/png"],
  [/\/assets\/champions\/Varus\/splash\/0_default\.jpg/, "Varus_splash.jpg", "image/jpeg"],
  [/\/assets\/champions\/Varus\/loading\/0_default\.jpg/, "Varus_loading.jpg", "image/jpeg"],
  [/\/assets\/champions\/Aatrox\/icon\.png/, "Aatrox_icon.png", "image/png"],
  [/\/assets\/champions\/Aatrox\/splash\/0_default\.jpg/, "Aatrox_splash.jpg", "image/jpeg"],
  [/\/assets\/champions\/Ahri\/icon\.png/, "Ahri_icon.png", "image/png"],
  [/\/assets\/champions\/Ahri\/splash\/0_default\.jpg/, "Ahri_splash.jpg", "image/jpeg"],
];

async function serveQmedia3Art(page: Page) {
  await page.route(/\/assets\/champions\/(Varus|Aatrox|Ahri)\//, route => {
    const url = route.request().url();
    const hit = ART.find(([re]) => re.test(url));
    if (!hit) return route.fulfill({ status: 404 });
    return route.fulfill({ status: 200, contentType: hit[2],
      body: readFileSync(`e2e/fixtures/qmedia3/${hit[1]}`) });
  });
}

const loaded = (el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0);

const HOSTS = [
  { name: "ranked", query: "" },
  { name: "daily", query: "&host=daily" },
] as const;

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1280, height: 800 }, mobile: false },
  { name: "phone", viewport: { width: 390, height: 844 }, mobile: true },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`qmedia3 ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, isMobile: vp.mobile, hasTouch: vp.mobile });

    for (const host of HOSTS) {
      test(`Varus Q rank 2 draws Varus and Piercing Arrow (${host.name})`, async ({ page }, info) => {
        await serveQmedia3Art(page);
        await page.goto(`/dev/ranked-shell-probe?q=varusQCooldown${host.query}`);
        await page.waitForSelector('[data-testid="ranked-question"] [data-quiz-choice]');
        const hero = page.locator('[data-testid="scenario-hero"]');
        // The ability icon the prompt names, loaded and not collapsed.
        const icon = hero.locator('img[alt="Piercing Arrow"]');
        await expect(icon).toBeVisible();
        await expect.poll(() => icon.evaluate(loaded)).toBeGreaterThan(0);
        expect((await icon.boundingBox())!.width, "ability icon collapsed").toBeGreaterThanOrEqual(16);
        // The champion splash behind it.
        const splash = hero.locator('img[alt="Varus"]');
        await expect.poll(() => splash.evaluate(loaded)).toBeGreaterThan(0);
        // Rank 2 is stated by the prompt; 15 seconds (the answer) is not drawn.
        await expect(hero).toContainText("Varus");
        await expect(hero).toContainText("Piercing Arrow");
        expect(await hero.innerText()).not.toContain("15 seconds");
        await expect(page.getByText("What is the rank 2 cooldown of Varus Q - Piercing Arrow?")).toBeVisible();
        await expect(page.locator('[data-surface-region="answers"] [data-quiz-choice]')).toHaveCount(4);
        await page.screenshot({ path: info.outputPath(`varusQ-${host.name}-${vp.name}.png`) });
      });
    }

    test("an ultimate cooldown comparison draws both champions, balanced", async ({ page }, info) => {
      await serveQmedia3Art(page);
      await page.goto("/dev/ranked-shell-probe?q=ultCooldownCompare&host=daily");
      await page.waitForSelector('[data-testid="ranked-question"] [data-quiz-choice]');
      const hero = page.locator('[data-testid="scenario-hero"]');
      for (const champion of ["Aatrox", "Ahri"]) {
        const img = hero.locator(`img[alt="${champion}"]`).first();
        await expect.poll(() => img.evaluate(loaded)).toBeGreaterThan(0);
      }
      // Neither side carries an ability icon: one would single out an answer.
      await expect(hero.locator('img[alt="World Ender"], img[alt="Spirit Rush"]')).toHaveCount(0);
      await expect(page.locator('[data-surface-region="answers"] [data-quiz-choice]')).toHaveCount(2);
      await page.screenshot({ path: info.outputPath(`ultCompare-daily-${vp.name}.png`) });
    });
  });
}
