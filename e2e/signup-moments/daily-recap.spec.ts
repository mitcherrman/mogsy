import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`finished guest Daily remains usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/e2e/misc-w3a/harness.html?view=completion&guest=1");
    const completion = page.getByTestId("daily-run-complete");
    const offer = page.getByTestId("daily-save-offer");
    const home = page.getByTestId("daily-run-home");
    await expect(completion).toBeVisible();
    await expect(offer).toBeVisible();
    await expect(home).toBeVisible();
    await expect(page.getByTestId("daily-run-recap")).toBeVisible();
    await expect(page.getByTestId("daily-save-gate")).toHaveCount(0);
    await expect(page.getByTestId("daily-save-create-account")).toHaveAttribute(
      "href", "/auth?mode=signup&returnTo=%2Fquiz%2Fdaily-challenge");
    const dims = await page.evaluate(() => {
      const offer = document.querySelector('[data-testid="daily-save-offer"]')?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        left: offer?.left ?? -99,
        right: offer?.right ?? 99999,
        width: window.innerWidth,
      };
    });
    expect(dims.overflow, "no page-level horizontal overflow").toBeLessThanOrEqual(12);
    expect(dims.left).toBeGreaterThanOrEqual(-2);
    expect(dims.right).toBeLessThanOrEqual(dims.width + 2);
    await page.getByTestId("daily-save-create-account").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("daily-save-create-account")).toBeInViewport();
    await home.scrollIntoViewIfNeeded();
    await expect(home).toBeInViewport();
  });
}

test("registered player's complete Daily has no signup offer", async ({ page }) => {
  await page.goto("/e2e/misc-w3a/harness.html?view=completion");
  await expect(page.getByTestId("daily-run-complete")).toBeVisible();
  await expect(page.getByTestId("daily-save-offer")).toHaveCount(0);
});
