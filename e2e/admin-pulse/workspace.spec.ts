// PULSE-2B — Admin Pulse Workspace in a real browser (GitHub runner only,
// per AGENTS.md). Prototype repository; screenshots go to the artifact.
import { expect, test, type Page } from "@playwright/test";

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/admin-pulse/${name}.png`, fullPage: true });

async function open(page: Page, width = 1366, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto("/e2e/admin-pulse/harness.html?still=1");
  await expect(page.getByTestId("admin-pulse-workspace")).toBeVisible();
  await expect(page.getByTestId("pulse-content-table")).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByTestId(`pulse-tab-${name}`).click();

test("prototype is labelled; the shipped editorial set is what plays", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("pulse-prototype-banner")).toBeVisible();
  await expect(page.getByTestId("pulse-live-count")).toHaveText("4");
  await expect(page.getByTestId("pulse-row-pc-sponsor-placeholder").getByTestId("pulse-row-eligibility")).toHaveText("Not live");
  await shot(page, "01-content-list");
});

test("author → preview in the real Pulse device → publish", async ({ page }) => {
  await open(page);
  await page.getByTestId("pulse-new-announcement").click();
  await page.getByTestId("pulse-field-label").fill("Halloween quiz week");
  await expect(page.getByTestId("pulse-admin-presentation-incomplete")).toBeVisible();
  await page.getByTestId("pulse-field-headline").fill("Halloween quiz week");
  await page.getByTestId("pulse-field-summary").fill("Seven days of spooky questions in the Daily.");
  await page.getByTestId("pulse-field-title").fill("Halloween quiz week is on");
  await page.getByTestId("pulse-field-href").fill("/quiz");
  const frame = page.getByTestId("pulse-item-editor").getByTestId("pulse-admin-presentation");
  await expect(frame.getByTestId("academy-pulse-scene")).toBeVisible({ timeout: 20_000 });
  await expect(frame).toContainText("Halloween quiz week");
  await page.getByTestId("pulse-editor-save").click();
  await expect(page.getByTestId("pulse-editor-dirty")).toHaveCount(0);
  await shot(page, "02-editor-preview");
  await page.getByTestId("pulse-action-publish").click();
  await expect(page.getByTestId("pulse-live-count")).toHaveText("5");
  await expect(page.getByTestId("pulse-item-editor").getByTestId("pulse-status")).toHaveText("Live");
});

test("preview tab: public projection at every Home Hub slot size", async ({ page }) => {
  await open(page);
  await tab(page, "preview");
  for (const size of ["desktop", "short", "tall", "mobile"]) {
    await page.getByTestId(`pulse-preview-size-${size}`).click();
    const frame = page.getByTestId("pulse-admin-presentation");
    await expect(frame).toHaveAttribute("data-size", size);
    await expect(frame.locator("[data-provenance]").first()).toBeVisible({ timeout: 20_000 });
    await shot(page, `03-preview-${size}`);
  }
  await expect(page.getByTestId("pulse-preview-excluded")).toContainText("placeholder-sponsor");
});

test("cadence: disabling News drops it from the computed cycle", async ({ page }) => {
  await open(page);
  await tab(page, "cadence");
  await expect(page.getByTestId("pulse-cycle-0")).toContainText("News");
  await page.getByTestId("pulse-category-enabled-news").click();
  await expect(page.getByTestId("pulse-cycle-0")).not.toContainText("News");
  await expect(page.getByTestId("pulse-live-count")).toHaveText("2");
  await shot(page, "04-cadence");
});

test("partners: allowlist + fresh approval; release gate holds the sponsor; emergency disable and fresh restore", async ({ page }) => {
  await open(page);
  await tab(page, "partners");
  await page.getByText(/Placeholder Co · Workflow rehearsal/).click();
  await expect(page.getByTestId("pulse-partner-submit")).toBeDisabled();
  await expect(page.getByTestId("pulse-partner-editor")).toContainText("not on the sponsor host allowlist");
  await expect(page.getByTestId("pulse-partner-editor").getByTestId("pulse-admin-presentation")).toBeVisible();
  await page.getByTestId("pulse-host-input").fill("example.com");
  await expect(page.getByTestId("pulse-host-add")).toContainText("fresh code");
  await page.getByTestId("pulse-host-add").click();
  await expect(page.getByTestId("pulse-host-example.com")).toBeVisible();
  await page.getByTestId("pulse-partner-submit").click();
  await expect(page.getByTestId("pulse-partner-approve")).toContainText("fresh code");
  await page.getByTestId("pulse-partner-approve").click();
  await expect(page.getByTestId("pulse-partner-status")).toHaveText("approved");
  await expect(page.getByTestId("pulse-partner-eligibility")).toContainText("release gate");
  await expect(page.getByTestId("pulse-gate-sponsor")).toHaveText("closed");
  await expect(page.getByTestId("pulse-live-count")).toHaveText("4");
  await shot(page, "05-partner-approved-gated");

  await page.getByTestId("pulse-emergency-scope").selectOption("managed");
  await page.getByTestId("pulse-emergency-reason").fill("Wrong patch number in a headline");
  await page.getByTestId("pulse-emergency-disable").click();
  await expect(page.getByTestId("pulse-emergency")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("pulse-live-count")).toHaveText("0");
  await expect(page.getByTestId("pulse-emergency-restore")).toContainText("fresh code");
  await tab(page, "preview");
  await expect(page.getByTestId("pulse-preview-fallback")).toBeVisible();
  await shot(page, "06-emergency-disabled");
  await page.getByTestId("pulse-emergency-restore").click();
  await expect(page.getByTestId("pulse-live-count")).toHaveText("4");
});

for (const width of [360, 390, 768]) {
  test(`no horizontal page overflow at ${width}px`, async ({ page }) => {
    await open(page, width, 800);
    for (const name of ["content", "cadence", "partners", "preview"]) {
      await tab(page, name);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} tab`).toBeLessThanOrEqual(1);
    }
    await shot(page, `07-phone-${width}`);
  });
}
