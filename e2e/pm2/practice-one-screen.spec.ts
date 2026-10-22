/**
 * PM2 — one-screen mobile Practice, in a real browser.
 *
 * GitHub Actions only (bundled Chromium, one worker, headless), per AGENTS.md.
 * Every backend request is answered by fixtures; League art comes from the
 * real asset host so the screenshots show the real pictures.
 *
 * Per viewport (360x640, 390x844, 430x932, 844x390, 1280x800, 1440x900) a full
 * ten-question run — plain text, item art, champion art, picture choices, a
 * long prompt, long answers, rune and summoner art, a grading failure — and,
 * for every question, unanswered AND revealed:
 *   - the one-line PRACTICE · mogzy.lol header, mogzy.lol on screen;
 *   - the full prompt and every tablet visible, unclipped, inside the stage;
 *   - no horizontal overflow, no inner scroll container;
 *   - portrait phones: no page scroll for the supported questions (all of them
 *     at 390x844 / 430x932; the two long-text stress questions may grow the
 *     page at 360x640, but never clip), desktop: the arena inside the screen;
 *   - the grid and the reveal box do not move when the answer is revealed;
 *   - no Next / See results control, ever;
 *   - the run advances by itself, exactly once per question, and enters the
 *     results exactly once (one session completion).
 * Plus: the hold's timing, keyboard play, reduced motion, the Report panel and
 * the leave guard pausing the advance, all six Quick Study launch paths, and a
 * short 390x844 video (`practice-video.spec.ts`) of the question → reveal →
 * next-question flow.
 */
import { expect, test } from "@playwright/test";
import {
  CORRECT,
  FAIL_FIRST,
  QUESTIONS,
  SHOTS,
  VIEWPORTS,
  WRONG,
  assertFits,
  expectAdvanced,
  holdReveal,
  measure,
  onStage,
  prepare,
  settle,
  startPractice,
  tablet,
} from "./helpers";

for (const vp of VIEWPORTS) {
  test.describe(`PM2 @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`a full run fits, reveals in place and advances by itself (${vp.name})`, async ({ page }) => {
      test.setTimeout(240_000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const counters = await prepare(page, { failFirst: true });
      await startPractice(page);

      for (let n = 1; n <= QUESTIONS.length; n += 1) {
        await expect(page.getByTestId("ranked-header-title")).toContainText(`Question ${n} / ${QUESTIONS.length}`);
        await settle(page);
        const q = await onStage(page);
        const tag = `${vp.name}-q${q.id}`;
        if (q.image_path || q.metadata?.champion_icon_path) {
          await expect(page.getByTestId("practice-question-media")).toBeVisible();
        }
        if (typeof q.choices[0] !== "string") {
          await expect(page.getByRole("group", { name: "Answer options" }).getByRole("img")).toHaveCount(4);
        }
        const before = await measure(page);
        assertFits(vp, q, before, `${tag} question`);
        await page.screenshot({ path: `${SHOTS}/${tag}-question.png` });

        const labels = q.choices.map((c) => (typeof c === "string" ? c : c.label));
        const pick = WRONG.has(q.id) ? labels.find((l) => l !== CORRECT[q.id])! : CORRECT[q.id];
        await tablet(page, pick).click();

        if (q.id === FAIL_FIRST) {
          // A grade the backend never gave is never drawn as one, and nothing advances.
          const footer = page.locator("[data-practice-reveal-footer]");
          await expect(footer).toHaveAttribute("data-verdict-tone", "neutral");
          await expect(footer).toContainText("Answer not verified");
          await expect(page.getByTestId("practice-advance-meter")).toHaveCount(0);
          await page.waitForTimeout(4000);
          await expect(page.getByTestId("ranked-header-title")).toContainText(`Question ${n} / ${QUESTIONS.length}`);
          assertFits(vp, q, await measure(page), `${tag} unverified`);
          await page.screenshot({ path: `${SHOTS}/${tag}-unverified.png` });
          await page.getByTestId("practice-retry-answer").click();
        }

        const release = await holdReveal(page);
        await expect(page.locator('[data-testid="answer-grid"]')).toHaveAttribute("data-answers-state", "revealed");
        await page.waitForTimeout(400);
        const after = await measure(page);
        assertFits(vp, q, after, `${tag} revealed`);
        // Revealing draws INTO held boxes: the grid and the reveal box hold still
        // (a dense explanation may grow its box a little; never the grid much).
        const dense = q.id === 9106;
        expect(Math.abs(after.grid.top - before.grid.top), `${tag}: grid moved on reveal`).toBeLessThanOrEqual(dense ? 10 : 1);
        if (before.reveal && after.reveal) {
          expect(Math.abs(after.reveal.top - before.reveal.top), `${tag}: reveal box moved`).toBeLessThanOrEqual(dense ? 10 : 1);
        }
        await expect(page.getByTestId("practice-explanation")).toBeVisible();
        if (WRONG.has(q.id) && q.id !== 9106) await expect(page.getByTestId("practice-explanation")).toContainText(CORRECT[q.id]);
        else if (!WRONG.has(q.id)) await expect(page.getByTestId("practice-xp-earned")).toContainText("+12 XP");
        await page.screenshot({ path: `${SHOTS}/${tag}-reveal.png` });
        await release();
        await expectAdvanced(page, n + 1, QUESTIONS.length);
      }

      // ── Results, exactly once ──
      await expect(page.getByText("Quiz Complete")).toBeVisible();
      await page.waitForTimeout(3000);
      const titles = await page.evaluate(() => (window as unknown as { __pm2Titles: string[] }).__pm2Titles);
      const expected = [...QUESTIONS.map((_, i) => `Question ${i + 1} / ${QUESTIONS.length}`), "RESULTS"];
      // The title also carries the running score (" · 3 correct"), which ticks
      // on a grade; the POSITION must step 1, 2, … N, then the results, once each.
      const positions = titles.filter((t) => t.startsWith("Question") || t === "RESULTS")
        .map((t) => t.split(" · ")[0])
        .filter((t, i, all) => i === 0 || all[i - 1] !== t);
      expect(positions, "advance sequence").toEqual(expected);
      expect(counters.completions, "session completed more than once").toBe(1);
      expect(counters.attempts[FAIL_FIRST], "the failed submit was retried once").toBe(2);
      for (const q of QUESTIONS) if (q.id !== FAIL_FIRST) expect(counters.attempts[q.id], `attempts for ${q.id}`).toBe(1);
      const ev = (name: string) => counters.analytics.filter((e) => e === name).length;
      console.log(`[pm2] ${vp.name} analytics ${JSON.stringify({ opened: ev("practice_quiz_opened"),
        answered: ev("quiz_question_answered"), completed: ev("quiz_completed") })}`);
      if (counters.analytics.length > 0) {
        expect(ev("practice_quiz_opened")).toBe(1);
        expect(ev("quiz_question_answered")).toBe(QUESTIONS.length);
        expect(ev("quiz_completed")).toBe(1);
      }
      await page.screenshot({ path: `${SHOTS}/${vp.name}-results.png`, fullPage: true });

      // ── Replay the misses: the same one-screen arena ──
      await page.getByTestId("practice-missed-cta").click();
      await expect(page.getByTestId("ranked-header-title")).toContainText(`Question 1 / ${WRONG.size}`);
      await settle(page);
      assertFits(vp, await onStage(page), await measure(page), `${vp.name} replay`);
      await page.screenshot({ path: `${SHOTS}/${vp.name}-replay.png` });
      expect(errors).toEqual([]);
    });
  });
}

test.describe("PM2 states @ 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("an unpaused reveal holds for its beat, then advances once", async ({ page }) => {
    await prepare(page);
    await startPractice(page);
    await settle(page);
    const q = await onStage(page);
    const pick = q.choices.map((c) => (typeof c === "string" ? c : c.label)).find((l) => l === CORRECT[q.id])
      ?? (typeof q.choices[0] === "string" ? q.choices[0] : q.choices[0].label);
    await tablet(page, pick).click();
    await expect(page.locator("[data-practice-reveal-footer]")).toBeVisible();
    const shownAt = Date.now();
    await expect(page.getByTestId("practice-advance-meter")).toBeVisible();
    await expect(page.getByTestId("ranked-header-title")).toContainText("Question 2 / 10", { timeout: 20_000 });
    const held = Date.now() - shownAt;
    console.log(`[pm2] hold measured ${held}ms`);
    expect(held).toBeGreaterThanOrEqual(1300);
    expect(held).toBeLessThanOrEqual(13_000);
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("ranked-header-title")).toContainText("Question 2 / 10");
  });

  test("keyboard: Enter answers, the run advances, focus lands on the new question", async ({ page }) => {
    await prepare(page);
    await page.goto("/quiz", { waitUntil: "domcontentloaded" });
    const first = page.getByRole("navigation", { name: "Practice by subject" }).getByRole("button").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ranked-question")).toBeVisible({ timeout: 30_000 });
    await settle(page);
    const t = page.getByRole("group", { name: "Answer options" }).getByRole("button").first();
    await t.focus();
    await page.screenshot({ path: `${SHOTS}/states-keyboard-focus.png` });
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-practice-reveal-footer]")).toBeVisible();
    await expect(page.getByTestId("ranked-header-title")).toContainText("Question 2 / 10", { timeout: 20_000 });
    await expect(page.locator('[data-testid="ranked-question"] [data-surface-region="prompt"] h2')).toBeFocused();
    await expect(page.getByTestId("practice-next")).toHaveCount(0);
  });

  test("reduced motion: no countdown animation, same arena, still advances", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepare(page);
    await startPractice(page);
    await settle(page);
    const q = await onStage(page);
    assertFits(VIEWPORTS[1], q, await measure(page), "reduced-motion question");
    await tablet(page, q.choices.map((c) => (typeof c === "string" ? c : c.label))[0]).click();
    await expect(page.locator("[data-practice-reveal-footer]")).toBeVisible();
    await expect(page.getByTestId("practice-advance-meter")).toBeHidden();
    await page.screenshot({ path: `${SHOTS}/states-reduced-motion-reveal.png` });
    await expect(page.getByTestId("ranked-header-title")).toContainText("Question 2 / 10", { timeout: 20_000 });
  });

  test("the Report panel and the leave confirmation hold the reveal", async ({ page }) => {
    const counters = await prepare(page);
    await startPractice(page);
    await settle(page);
    // Report lives in the phone's bottom bar, beside the run's timeline window.
    const report = page.getByTestId("question-report-tab");
    await expect(report).toBeVisible();
    await expect(page.getByTestId("ranked-mobile-bottombar-left").getByTestId("question-report-tab")).toHaveCount(1);
    let q = await onStage(page);
    await tablet(page, q.choices.map((c) => (typeof c === "string" ? c : c.label))[0]).click();
    const footer = page.locator("[data-practice-reveal-footer]");
    await expect(footer).toBeVisible();
    await report.click();
    await expect(page.getByTestId("question-report-panel")).toBeVisible();
    await expect(footer).toHaveAttribute("data-advance-paused", "true");
    await page.screenshot({ path: `${SHOTS}/states-report-open.png` });
    await page.waitForTimeout(8000);
    await expect(page.getByTestId("ranked-header-title")).toContainText("Question 1 / 10");
    await page.getByTestId("question-report-close").click();
    await expect(page.getByTestId("ranked-header-title")).toContainText("Question 2 / 10", { timeout: 20_000 });

    // The leave confirmation over a reveal holds it too; Stay resumes, Leave ends it.
    await settle(page);
    q = await onStage(page);
    await tablet(page, q.choices.map((c) => (typeof c === "string" ? c : c.label))[0]).click();
    await expect(footer).toBeVisible();
    await page.getByRole("link", { name: "Back to League hub" }).click();
    await expect(page.getByRole("alertdialog", { name: "Leave practice?" })).toBeVisible();
    await expect(footer).toHaveAttribute("data-advance-paused", "true");
    await page.waitForTimeout(8000);
    await expect(page.getByTestId("ranked-header-title")).toContainText("Question 2 / 10");
    await page.screenshot({ path: `${SHOTS}/states-leave-guard-over-reveal.png` });
    await page.getByRole("button", { name: "Stay in Practice" }).click();
    await expect(page.getByTestId("ranked-header-title")).toContainText("Question 3 / 10", { timeout: 20_000 });

    await settle(page);
    q = await onStage(page);
    await tablet(page, q.choices.map((c) => (typeof c === "string" ? c : c.label))[0]).click();
    await expect(footer).toBeVisible();
    await page.getByRole("link", { name: "Back to League hub" }).click();
    await page.getByRole("button", { name: "Leave Practice" }).click();
    await expect(page).toHaveURL(/\/lol/);
    const attempts = JSON.stringify(counters.attempts);
    await page.waitForTimeout(8000);
    expect(JSON.stringify(counters.attempts)).toBe(attempts);
    await expect(page).toHaveURL(/\/lol/);
    expect(counters.completions).toBe(0);
  });

  test("all six Quick Study subjects launch the one-screen arena", async ({ page }) => {
    test.setTimeout(180_000);
    const counters = await prepare(page);
    for (let tile = 0; tile < 6; tile += 1) {
      counters.served = 0;
      await page.goto("/quiz", { waitUntil: "domcontentloaded" });
      const rail = page.getByRole("navigation", { name: "Practice by subject" });
      await expect(rail.getByRole("button")).toHaveCount(6, { timeout: 30_000 });
      const name = (await rail.getByRole("button").nth(tile).innerText()).trim().split("\n")[0];
      await rail.getByRole("button").nth(tile).click();
      await expect(page.getByTestId("ranked-question")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("practice-chrome")).toBeVisible();
      await expect(page.getByTestId("practice-brand")).toHaveText("mogzy.lol");
      console.log(`[pm2] quick-study tile ${tile} "${name}" phase=${await page.getByTestId("practice-arena").getAttribute("data-practice-phase")}`);
    }
  });
});
