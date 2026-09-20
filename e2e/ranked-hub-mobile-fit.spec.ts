import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

const PHONE_VIEWPORTS = [
  { name: "short", width: 360, height: 740 },
  { name: "reference", width: 390, height: 844 },
  { name: "tall", width: 430, height: 932 },
] as const;

for (const viewport of PHONE_VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
    });

    test("the complete primary Ranked parchment fits below the compact HUD", async ({ page }) => {
      await page.goto("/quiz", { waitUntil: "domcontentloaded" });
      const primary = page.getByTestId("hero-play-column");
      await expect(primary).toBeVisible();
      await page.waitForTimeout(650);

      const geometry = await page.evaluate(() => {
        const primary = document.querySelector<HTMLElement>("[data-testid='hero-play-column']");
        const hud = document.querySelector<HTMLElement>(".global-hud > div");
        if (!primary || !hud) throw new Error("Ranked primary stage or HUD was not rendered");
        const parchment = primary.querySelector<HTMLElement>(".lc-scroll");
        const bottomRoll = primary.querySelector<HTMLElement>(".lc-scroll__cap--foot");
        if (!parchment || !bottomRoll) throw new Error("Primary parchment was not rendered");

        const panelBox = parchment.getBoundingClientRect();
        const bottomRollBox = bottomRoll.getBoundingClientRect();
        const hudBox = hud.getBoundingClientRect();
        return {
          panelTop: panelBox.top,
          panelBottom: panelBox.bottom,
          panelHeight: panelBox.height,
          bottomRollBottom: bottomRollBox.bottom,
          hudBottom: hudBox.bottom,
          viewportHeight: window.innerHeight,
        };
      });

      expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.hudBottom);
      expect(geometry.bottomRollBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    });
  });
}
