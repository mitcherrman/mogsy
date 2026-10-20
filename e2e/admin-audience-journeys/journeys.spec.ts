import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1280]) {
  test(`overview visitor histories are readable and honest at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 400 ? 750 : 900 });
    await page.goto("/e2e/admin-audience-journeys/journeys.html");
    const root = page.getByTestId("journeys-harness");
    await expect(root.getByText("Human-signal visitors")).toBeVisible();
    await expect(root.getByRole("button", { name: /^Guest · 1/ })).toBeVisible();
    await expect(root.getByRole("button", { name: /^Registered · 1/ })).toBeVisible();
    await expect(root.getByRole("button", { name: /^Account unknown · 1/ })).toBeVisible();

    // The registered visitor's Daily child round is named only because the
    // event carries explicit parent evidence.
    await root.getByRole("button", { name: /^Registered · 1/ }).click();
    await root.locator("details > summary").first().click();
    await expect(root).toContainText("Daily Challenge child round · stage 2");
    await expect(root).toContainText("Exit and drop-off unknown");

    // An account with no profile is not presented as guest or registered.
    await root.getByRole("button", { name: /^Account unknown · 1/ }).click();
    await root.locator("details > summary").first().click();
    await expect(root.locator("details").first()).toContainText("no current profile found");
    await expect(root).not.toContainText("Registered — current profile evidence");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal viewport overflow").toBeLessThanOrEqual(12);
  });
}
