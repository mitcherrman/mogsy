/**
 * PM2 — a short 390x844 recording of unassisted play: question → reveal →
 * the next question, three times. Its own file because `video` forces a new
 * worker and Playwright allows it only at the top level of a spec file.
 */
import { test } from "@playwright/test";
import {
  CORRECT,
  QUESTIONS,
  WRONG,
  expectAdvanced,
  onStage,
  prepare,
  settle,
  startPractice,
  tablet,
} from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, video: { mode: "on", size: { width: 390, height: 844 } } });

test("question → reveal → next question, unassisted", async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await startPractice(page);
  for (let n = 1; n <= 3; n += 1) {
    await settle(page);
    const q = await onStage(page);
    await page.waitForTimeout(1200);
    const labels = q.choices.map((c) => (typeof c === "string" ? c : c.label));
    await tablet(page, WRONG.has(q.id) ? labels.find((l) => l !== CORRECT[q.id])! : CORRECT[q.id]).click();
    await expectAdvanced(page, n + 1, QUESTIONS.length);
  }
  await page.waitForTimeout(1500);
});
