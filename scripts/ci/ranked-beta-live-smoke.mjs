import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const root = process.env.MOGZY_E2E_URL || "https://mogzy.lol";
const out = "test-results/ranked-beta-live";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const vp of [
    { name: "desktop", width: 1366, height: 768 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      await page.goto(root + "/lol", { waitUntil: "domcontentloaded", timeout: 60000 });
      await expect(page.locator('a[href="/combat-lab"] [data-testid="feature-ribbon-beta"]').first()).toBeVisible({ timeout: 30000 });
      // Capture only after the Academy startup veil and book entrance settle.
      await page.waitForTimeout(4500);
      await page.screenshot({ path: out + "/" + vp.name + "-academy.png", fullPage: true });
      const combat = page.locator('a[href="/combat-lab"]').filter({ has: page.locator('[data-testid="feature-ribbon-beta"]') }).first();
      await expect(combat).toBeVisible();
      await combat.click({ timeout: 20000 });
      await expect(page).toHaveURL(/\/combat-lab(?:[?#]|$)/, { timeout: 30000 });
      console.log(vp.name, "BETA ribbon visible; Combat Simulator link navigated");
    } catch (error) {
      failures.push(vp.name + " combat: " + String(error));
      await page.screenshot({ path: out + "/" + vp.name + "-combat-failure.png", fullPage: true }).catch(() => {});
    }
    try {
      await page.goto(root + "/quiz", { waitUntil: "domcontentloaded", timeout: 60000 });
      const ranked = page.getByRole("tab", { name: "Ranked", exact: true });
      await expect(ranked).toBeVisible({ timeout: 30000 });
      await expect(ranked.locator('[data-testid="feature-ribbon-coming-soon"]')).toBeVisible();
      await ranked.click();
      const play = page.getByTestId("ranked-play-gem");
      await expect(play).toBeDisabled();
      await page.screenshot({ path: out + "/" + vp.name + "-quiz.png", fullPage: true });
      console.log(vp.name, "Ranked COMING SOON; PLAY disabled");
    } catch (error) {
      failures.push(vp.name + " ranked: " + String(error));
      await page.screenshot({ path: out + "/" + vp.name + "-ranked-failure.png", fullPage: true }).catch(() => {});
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
