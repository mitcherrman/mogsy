import { expect, test } from "@playwright/test";
for (const width of [320, 390, 1280]) {
  test(`launch pulse usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.goto("/e2e/users-launch/harness.html");
    const pulse = page.getByTestId("users-audience-pulse");
    await expect(pulse).toBeVisible();
    await expect(pulse.getByTestId("pulse-arrivals")).toContainText("1 unknown");
    await expect(pulse.getByTestId("pulse-first-plays")).toContainText("Not yet reliable");
    await expect(pulse.getByText("m.facebook.com")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth -
      document.documentElement.clientWidth);
    expect(overflow, "no full-page sideways scroll").toBeLessThanOrEqual(12);
    await pulse.getByRole("button", { name: /human-br/ }).click();
    await expect(page.getByTestId("selected-visitor")).toHaveText("Selected: human-browser-1");
  });
}
