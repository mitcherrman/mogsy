/**
 * QMEDIA3 — Practice draws the Varus Q ability icon the prompt names.
 *
 * The question is served exactly as the backend's `format_question_row` now
 * serves quiz_questions 126394: `image_path` is the contract subject's
 * ability icon (the same file Daily and Ranked draw), and no metadata travels
 * before the answer. The art is the backend's own file, checked in.
 *
 * GitHub Actions only (bundled Chromium, one worker, headless), per AGENTS.md.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { prepare, settle, startPractice, type Q } from "./helpers";

const VARUS_Q: Q = {
  id: 126394, category: "Champion Ability Cooldowns",
  question_text: "What is the rank 2 cooldown of Varus Q - Piercing Arrow?",
  format: "multiple_choice", image_path: "assets/champions/Varus/Q_VarusQ.png",
  choices: ["14 seconds", "18 seconds", "16 seconds", "15 seconds"],
};

for (const vp of [{ name: "1280x800", width: 1280, height: 800 },
  { name: "390x844", width: 390, height: 844 }]) {
  test(`Practice draws Varus Q's icon (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await prepare(page, { questions: [VARUS_Q] });
    await page.route(/\/assets\/champions\/Varus\/Q_VarusQ\.png/, route => route.fulfill({
      status: 200, contentType: "image/png",
      body: readFileSync("e2e/fixtures/qmedia3/Varus_Q_VarusQ.png") }));
    await startPractice(page);
    await settle(page);
    await expect(page.getByText(VARUS_Q.question_text)).toBeVisible();
    const media = page.getByTestId("practice-question-media");
    await expect(media).toBeVisible();
    const img = media.locator("img").first();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) =>
      (el.complete ? el.naturalWidth : 0))).toBeGreaterThan(0);
    expect(await img.getAttribute("src")).toContain("champions/Varus/Q_VarusQ.png");
    await page.screenshot({ path: `test-results/pm2/qmedia3-varusQ-practice-${vp.name}.png` });
  });
}
