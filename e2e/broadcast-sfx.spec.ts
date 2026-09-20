import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __broadcastSfxBufferStarts: number;
    __broadcastSfxQaAdvance: (phase: "question" | "reveal" | "transition", startedAt: number, duration?: number) => void;
    __broadcastSfxQaMute: (muted: boolean) => void;
  }
}

async function instrumentAssets(page: Page) {
  await page.addInitScript(() => {
    window.__broadcastSfxBufferStarts = 0;
    const Native = window.AudioContext;
    if (!Native) return;
    const create = Native.prototype.createBufferSource;
    Native.prototype.createBufferSource = function (...args) {
      const source = create.apply(this, args);
      const start = source.start.bind(source);
      source.start = (...startArgs) => {
        window.__broadcastSfxBufferStarts += 1;
        return start(...startArgs);
      };
      return source;
    };
  });
}

const count = (page: Page) => page.evaluate(() => window.__broadcastSfxBufferStarts);

for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile touch" : "desktop", () => {
    test.use(mobile
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 1280, height: 720 } });

    test("canonical unlock, single reveal, dedupe, mute and continuous phases", async ({ page }) => {
      await instrumentAssets(page);
      await page.goto("/e2e/broadcast-sfx-harness.html", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("broadcast-sfx-harness")).toBeVisible();

      // A presentation-timed transition before a gesture reports the canonical
      // lock without creating a second Broadcast AudioContext.
      await page.evaluate(() => window.__broadcastSfxQaAdvance("question", 10));
      await expect(page.getByRole("button", { name: /enable broadcast audio/i })).toBeVisible();
      expect(await count(page)).toBe(0);
      await page.getByRole("button", { name: /enable broadcast audio/i }).click();

      await page.evaluate(() => window.__broadcastSfxQaAdvance("reveal", 20));
      await expect.poll(() => count(page)).toBe(1); // correctAnswer replaces reveal
      await page.evaluate(() => window.__broadcastSfxQaAdvance("reveal", 20));
      await page.waitForTimeout(200);
      expect(await count(page)).toBe(1); // rerender does not replay

      await page.evaluate(() => window.__broadcastSfxQaAdvance("transition", 30));
      await expect.poll(() => count(page)).toBe(2);

      await page.evaluate(() => window.__broadcastSfxQaMute(true));
      await page.evaluate(() => window.__broadcastSfxQaAdvance("question", 40));
      await page.waitForTimeout(250);
      expect(await count(page)).toBe(2);

      await page.evaluate(() => window.__broadcastSfxQaMute(false));
      await page.evaluate(() => window.__broadcastSfxQaAdvance("transition", 50));
      await expect.poll(() => count(page)).toBe(3);
    });
  });
}
