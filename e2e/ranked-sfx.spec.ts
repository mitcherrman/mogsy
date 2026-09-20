import { expect, test } from "@playwright/test";

declare global {
  interface Window { __rankedSfxOscillators: number }
}

async function instrumentSynths(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.__rankedSfxOscillators = 0;
    const Native = window.AudioContext;
    if (!Native) return;
    const create = Native.prototype.createOscillator;
    Native.prototype.createOscillator = function (...args) {
      const oscillator = create.apply(this, args);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (...startArgs) => {
        window.__rankedSfxOscillators += 1;
        return start(...startArgs);
      };
      return oscillator;
    };
  });
}

async function dismissRules(page: import("@playwright/test").Page) {
  const gotIt = page.getByRole("button", { name: "GOT IT" });
  await gotIt.waitFor({ state: "visible", timeout: 1_500 }).catch(() => {});
  if (await gotIt.isVisible()) await gotIt.click();
}

for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile touch" : "desktop", () => {
    test.use(mobile
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 1280, height: 720 } });

    test("accepted answer and Meta action synthesize promptly without layout regression",
      async ({ page }) => {
        await instrumentSynths(page);
        await page.goto("/dev/ranked-shell-probe?q=opts4&points=1,0,0&frame=0&progression=0");
        await dismissRules(page);
        const beforeAnswer = await page.evaluate(() => window.__rankedSfxOscillators);
        await page.getByRole("button", { name: "A. Sunfire Aegis" }).click();
        await expect.poll(() => page.evaluate(() => window.__rankedSfxOscillators), {
          timeout: 750,
        }).toBeGreaterThan(beforeAnswer);
        await expect(page.getByTestId("ranked-match")).toBeVisible();

        await page.goto("/dev/ranked-shell-probe?q=metareflex&points=4,0,0&frame=0&progression=0");
        await dismissRules(page);
        const beforeMeta = await page.evaluate(() => window.__rankedSfxOscillators);
        await page.getByText("Hexdrinker", { exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__rankedSfxOscillators), {
          timeout: 750,
        }).toBeGreaterThan(beforeMeta);
        await expect(page.getByText("Locked in — next card…")).toBeVisible();
        await expect(page.getByText(/missing next_challenge_index/i)).toHaveCount(0);
        await expect(page.getByTestId("ranked-match")).toBeVisible();
      });

    test("opening an already-completed result remains terminal-cue silent", async ({ page }) => {
      await instrumentSynths(page);
      await page.goto("/dev/ranked-shell-probe?end=victory&frame=0&progression=0");
      await expect(page.getByText("VICTORY")).toBeVisible();
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => window.__rankedSfxOscillators)).toBe(0);
    });

    test("live public transitions synthesize opponent, settlement, speed, and victory cues",
      async ({ page }) => {
        await instrumentSynths(page);
        await page.goto("/dev/ranked-shell-probe?q=opts4&points=1&frame=0&progression=0&sfx=1");
        await dismissRules(page);
        const advance = async () => {
          const before = await page.evaluate(() => window.__rankedSfxOscillators);
          await page.getByTestId("probe-sfx-advance").click();
          await expect.poll(() => page.evaluate(() => window.__rankedSfxOscillators), {
            timeout: 4_000,
          }).toBeGreaterThan(before);
        };

        await advance(); // public opponent submission, local player still active
        await advance(); // round 1 correct + base award
        await advance(); // round 2 correct + base award + speed accent
        await advance(); // round 3 incorrect
        await advance(); // authoritative live transition to victory
        await expect(page.getByText("VICTORY")).toBeVisible();
      });
  });
}
