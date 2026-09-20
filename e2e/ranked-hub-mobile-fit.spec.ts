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

test.describe("shared three-parchment stage", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("switches one stable mobile stage without stacking inactive panels", async ({ page }) => {
    await page.goto("/quiz", { waitUntil: "domcontentloaded" });
    const role = page.getByTestId("hero-play-column");
    const standing = page.getByTestId("hero-standing-column");
    const record = page.getByTestId("hero-profile-column");
    const rail = page.getByTestId("quiz-category-rail");
    await expect(role).toBeVisible();
    await page.waitForTimeout(650);

    await expect(role).toHaveAttribute("data-mobile-active", "true");
    await expect(standing).toHaveAttribute("aria-hidden", "true");
    await expect(record).toHaveAttribute("aria-hidden", "true");

    const initial = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>("[data-testid='ranked-hero']")!;
      const rail = document.querySelector<HTMLElement>("[data-testid='quiz-category-rail']")!;
      const panels = [...document.querySelectorAll<HTMLElement>(".ranked-hero-slide")];
      return {
        heroHeight: hero.getBoundingClientRect().height,
        panelTops: panels.map((panel) => panel.getBoundingClientRect().top),
        panelHeights: panels.map((panel) => panel.scrollHeight),
        railTop: rail.getBoundingClientRect().top,
        documentHeight: document.documentElement.scrollHeight,
        scrollY,
      };
    });
    expect(new Set(initial.panelTops)).toHaveProperty("size", 1);
    expect(initial.heroHeight).toBe(Math.max(...initial.panelHeights));

    const previous = page.getByRole("button", { name: "Previous Ranked panel" });
    const next = page.getByRole("button", { name: "Next Ranked panel" });
    await previous.click();
    await expect(standing).toHaveAttribute("data-mobile-active", "true");
    await expect(previous).toBeDisabled();
    await next.click();
    await next.click();
    await expect(record).toHaveAttribute("data-mobile-active", "true");
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(role).toHaveAttribute("data-mobile-active", "true");

    const swipe = async (
      from: { x: number; y: number },
      to: { x: number; y: number },
      pointerId: number,
    ) => {
      await page.getByTestId("ranked-hero").dispatchEvent("pointerdown", {
        pointerId, pointerType: "touch", clientX: from.x, clientY: from.y,
      });
      await page.getByTestId("ranked-hero").dispatchEvent("pointerup", {
        pointerId, pointerType: "touch", clientX: to.x, clientY: to.y,
      });
    };
    await swipe({ x: 120, y: 320 }, { x: 205, y: 324 }, 11);
    await expect(standing).toHaveAttribute("data-mobile-active", "true");
    await swipe({ x: 120, y: 320 }, { x: 205, y: 324 }, 12);
    await expect(standing).toHaveAttribute("data-mobile-active", "true");
    await swipe({ x: 250, y: 320 }, { x: 165, y: 324 }, 13);
    await expect(role).toHaveAttribute("data-mobile-active", "true");
    await swipe({ x: 250, y: 250 }, { x: 175, y: 350 }, 14);
    await swipe({ x: 250, y: 320 }, { x: 220, y: 322 }, 15);
    await expect(role).toHaveAttribute("data-mobile-active", "true");
    await swipe({ x: 250, y: 320 }, { x: 165, y: 324 }, 16);
    await expect(record).toHaveAttribute("data-mobile-active", "true");

    const final = await page.evaluate(() => ({
      heroHeight: document.querySelector<HTMLElement>("[data-testid='ranked-hero']")!.getBoundingClientRect().height,
      railTop: document.querySelector<HTMLElement>("[data-testid='quiz-category-rail']")!.getBoundingClientRect().top,
      scrollY,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    }));
    expect(final.heroHeight).toBe(initial.heroHeight);
    expect(final.railTop).toBe(initial.railTop);
    expect(final.scrollY).toBe(initial.scrollY);
    expect(final.horizontalOverflow).toBe(0);
  });
});
