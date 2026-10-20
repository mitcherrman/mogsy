/**
 * PM1 — production verification on https://mogzy.lol (GitHub Actions only).
 *
 * READ-ONLY BY CONSTRUCTION. Every request that is not a GET is answered
 * locally and never reaches production: the history session, the attempt,
 * analytics beacons and any anonymous sign-in. The pages, the bundle, the
 * League art and the Practice QUESTIONS are the real production ones (GETs),
 * so this proves the deployed presentation against real content. The grade
 * shown after answering is a local stand-in, labelled as such below; grading
 * itself is unchanged by PM1.
 *
 * It also confirms the deployed bundle is the merged one: the hub must show
 * the PM1 markers (the Quick Study heading inside the rail plate, the More
 * Challenges invitation art) and Practice must render in the canonical arena.
 */
import { expect, test, type Page } from "@playwright/test";

const ROOT = process.env.PM1_PROD_URL || "https://mogzy.lol";
const SHOTS = "test-results/pm1-prod";

async function readOnly(page: Page) {
  const blocked: string[] = [];
  await page.addInitScript(() => sessionStorage.setItem("quiz:gate:hub_visited", "1"));
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD" || req.method() === "OPTIONS") return route.continue();
    const url = new URL(req.url());
    blocked.push(`${req.method()} ${url.host}${url.pathname}`);
    if (url.pathname === "/api/quiz/sessions") return route.fulfill({ json: { ok: true, session_id: 1 } });
    if (url.pathname === "/api/quiz/attempts") {
      // Local stand-in grade: production grading is not exercised (no write).
      return route.fulfill({ json: { is_correct: false, correct_answer: "", explanation: "PM1 production check: grading not exercised." } });
    }
    return route.fulfill({ status: 204, body: "" });
  });
  return blocked;
}

for (const vp of [
  { name: "1440x900", width: 1440, height: 900, desktop: true },
  { name: "390x844", width: 390, height: 844, desktop: false },
]) {
  test.describe(`production @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`hub and Practice arena are live (${vp.name})`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const blocked = await readOnly(page);
      await page.goto(`${ROOT}/quiz`, { waitUntil: "domcontentloaded" });

      const rail = page.getByRole("navigation", { name: "Practice by subject" });
      await expect(rail).toBeVisible({ timeout: 30_000 });
      // PM1 markers: the heading lives INSIDE the rail plate now.
      await expect(rail.getByRole("heading", { name: "Quick Study" })).toBeVisible();
      await expect(rail.getByRole("button")).toHaveCount(6);
      const frames = await rail.locator("[data-rail-frame]").count();
      expect(frames, "gilded frames (PM1)").toBe(6);
      await page.screenshot({ path: `${SHOTS}/${vp.name}-hub.png` });

      const more = page.getByTestId("hub-more-challenges");
      await more.scrollIntoViewIfNeeded();
      await expect(more.getByTestId("hub-more-challenges-art")).toBeVisible();
      await expect(more.getByRole("link", { name: /Browse More Challenges/ })).toHaveAttribute("href", "/quiz/more-challenges");
      await expect(more.getByTestId("hub-more-challenges-unrated")).toBeVisible();
      await more.screenshot({ path: `${SHOTS}/${vp.name}-more-challenges.png` });

      // Real production questions, in the canonical arena.
      await rail.scrollIntoViewIfNeeded();
      await rail.getByRole("button").nth(2).click(); // Summoner Spells
      await expect(page.getByTestId("practice-arena")).toBeVisible({ timeout: 30_000 });
      const stage = page.getByTestId("ranked-question");
      await expect(stage).toBeVisible({ timeout: 30_000 });
      await expect(stage).toHaveClass(/ranked-question-stage/);
      await expect(page.getByTestId("ranked-header-title")).toContainText(/Question 1 \/ \d+/);
      const prompt = stage.locator('[data-surface-region="prompt"] h2');
      await expect(prompt).toBeVisible();
      const tablets = stage.locator("[data-quiz-choice]");
      expect(await tablets.count()).toBeGreaterThan(1);
      const fit = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="ranked-question"]')!.getBoundingClientRect();
        const tablets = [...document.querySelectorAll<HTMLElement>("[data-quiz-choice]")];
        const match = document.querySelector('[data-testid="ranked-match"]')!.getBoundingClientRect();
        return {
          tabletsInside: tablets.every((t) => t.getBoundingClientRect().bottom <= s.bottom + 1),
          matchBottom: match.bottom, vh: window.innerHeight,
          hScroll: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      console.log(`[pm1-prod] ${vp.name} ${JSON.stringify(fit)} prompt=${JSON.stringify(await prompt.innerText())}`);
      expect(fit.tabletsInside).toBe(true);
      expect(fit.hScroll).toBe(false);
      if (vp.desktop) expect(fit.matchBottom).toBeLessThanOrEqual(fit.vh + 1);
      await page.screenshot({ path: `${SHOTS}/${vp.name}-practice-question.png`, fullPage: !vp.desktop });

      // Answering locks the grid and shows the reveal footer + Next (the grade
      // itself is the local stand-in above).
      await tablets.first().click();
      await expect(page.locator("[data-practice-reveal-footer]")).toBeVisible();
      await expect(page.getByTestId("practice-next")).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/${vp.name}-practice-after-answer.png`, fullPage: !vp.desktop });

      // The leave guard still owns the way out.
      await page.getByRole("link", { name: "Back to League hub" }).click();
      await expect(page.getByRole("alertdialog", { name: "Leave practice?" })).toBeVisible();

      console.log(`[pm1-prod] ${vp.name} intercepted writes: ${JSON.stringify(blocked)}`);
      expect(errors).toEqual([]);
    });
  });
}
