import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`main Daily guest offer at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (/supabase\.co|railway\.app/.test(url.hostname)) return route.abort();
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, json: {} });
      return route.continue();
    });
    await page.goto("/e2e/misc-w3a/harness.html?view=main&phase=settled&guest=1");
    const offer = page.getByTestId("daily-main-save-offer");
    const slot = page.getByTestId("daily-main-save-offer-slot");
    await expect(offer).toBeVisible();
    await expect(page.getByTestId("daily-main-save-score")).toBeEnabled();
    await expect(page.getByTestId("daily-main-continue")).toBeEnabled();
    await expect(page.getByTestId("daily-done-for-now")).toBeEnabled();
    const geometry = await page.evaluate(() => {
      const pos = (id: string) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        const r = el?.getBoundingClientRect();
        return r ? { top: r.top, bottom: r.bottom, height: r.height } : null;
      };
      return { snapshot: pos("daily-main-result-snapshot-slot"),
        offer: pos("daily-main-save-offer"), slot: pos("daily-main-save-offer-slot"),
        optional: pos("daily-main-optional"),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(geometry.snapshot).not.toBeNull();
    expect(geometry.offer).not.toBeNull();
    expect(geometry.slot?.height).toBeGreaterThanOrEqual(52);
    expect(geometry.offer!.top).toBeGreaterThanOrEqual(geometry.snapshot!.top);
    if (geometry.optional) expect(geometry.offer!.top).toBeLessThan(geometry.optional.top);
    expect(geometry.overflow).toBeLessThanOrEqual(12);
    if (viewport.width === 390) {
      expect(geometry.offer!.top, "signup offer starts within first 844px").toBeLessThan(viewport.height);
    }
    await page.getByTestId("daily-main-save-score").click();
  });
}

test("registered visitor sees no save offer", async ({ page }) => {
  await page.goto("/e2e/misc-w3a/harness.html?view=main&phase=settled");
  await expect(page.getByTestId("daily-main-result")).toBeVisible();
  await expect(page.getByTestId("daily-main-save-offer-slot")).toHaveCount(0);
});
