import { expect, test } from "@playwright/test";

// QI1 acceptance: the panel at the two owner desk widths, A1 hovered and one
// option cell hovered, with no sideways page scroll. Screenshots are written
// to test-results/question-intelligence/ for the handoff.
for (const width of [1280, 1440]) {
  test(`question intelligence at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/question-intelligence/harness.html");
    const table = page.getByTestId("qi-table");
    await expect(table).toBeVisible();
    await page.getByTestId("qi-row-A2").hover();
    await expect(page.getByTestId("qi-detail-ref")).toHaveText("mastery:ability:ahri-q-cd");
    await page.getByTestId("qi-row-A1").hover();
    await expect(page.getByTestId("qi-detail-ref")).toHaveText("quiz:item:boots-ms");
    await expect(page.getByTestId("qi-cell-A1.4")).toHaveAttribute("data-cell", "bottom-right");
    const detail = await page.getByTestId("qi-detail").boundingBox();
    const tableBox = await table.boundingBox();
    expect(detail && tableBox && detail.x > tableBox.x + tableBox.width - 1, "side panel sits beside the table").toBeTruthy();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no full-page sideways scroll").toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/question-intelligence/qi1-${width}.png`, fullPage: true });
    await page.getByTestId("qi-cell-A1.2").hover();
    await expect(page.getByTestId("qi-grid-caption")).toContainText("A1.2 · top-right");
    await page.screenshot({ path: `test-results/question-intelligence/qi1-${width}-cell-hover.png` });
  });
}
