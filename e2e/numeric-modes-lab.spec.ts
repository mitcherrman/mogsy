/**
 * NUM-LAB — Stat Drop + Combat Estimate prototype acceptance, in the real
 * browser against `/dev/numeric-modes` (DEV-only, no backend).
 *
 * Proves, at desktop and phone sizes: the prototype banner is always shown;
 * no answer, band or verdict is in the DOM before Lock; keyboard-only and
 * touch play reach a reveal; the page never scrolls sideways; the track does
 * not move between open and reveal. Writes the capture matrix to
 * NUMERIC_MODES_SHOTS (default <repo>/test-results/numeric-modes).
 *
 *   npx playwright test -c playwright.arena.config.ts numeric-modes-lab
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.NUMERIC_MODES_SHOTS ?? path.resolve("test-results/numeric-modes");
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, touch: false },
  { name: "390x844", width: 390, height: 844, touch: true },
  { name: "360x640", width: 360, height: 640, touch: true },
] as const;
const ROUNDS = ["sd-health", "sd-cooldown", "sd-range", "ce-ability", "ce-auto"] as const;
const STATES = ["open", "placed", "revealed-exact", "revealed-within", "revealed-outside"] as const;

async function open(page: Page, q: string) {
  await page.goto(`/dev/numeric-modes?motion=reduce&${q}`);
  await expect(page.getByTestId("lab-prototype-banner")).toBeVisible();
}

/** The lab's own DOM (not the page: Vite dev inlines every stylesheet, full of digits). */
const labHtml = (page: Page) => page.getByTestId("numeric-modes-lab").evaluate((e) => e.outerHTML);

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "horizontal overflow px").toBeLessThanOrEqual(0);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });

    test("capture matrix: every round × state, banner present, no side scroll", async ({ page }) => {
      for (const round of ROUNDS) {
        for (const state of STATES) {
          await open(page, `round=${round}&state=${state}`);
          if (state.startsWith("revealed")) {
            await expect(page.getByTestId("num-reveal")).toBeVisible();
            await expect(page.getByTestId("num-verdict")).toBeVisible();
            await expect(page.getByTestId("lab-baseline")).toBeVisible();
          }
          await noSideScroll(page);
          await page.screenshot({ path: path.join(SHOTS, `${vp.name}-${round}-${state}.png`), fullPage: true });
        }
      }
    });

    test("Stat Drop: no leak before lock, track stays put through the reveal", async ({ page }) => {
      await open(page, "round=sd-health");
      const html = await labHtml(page);
      for (const leak of ["645", "statdrop-canonical", "statdrop-band", "num-reveal", "Within the band"]) {
        expect(html, leak).not.toContain(leak);
      }
      const track = page.locator('[data-part="track"]');
      // Document coordinates: a phone scrolls to reach Lock, which is the camera moving, not the track.
      const docBox = () => track.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY }; });
      const before = await track.boundingBox();
      const beforeDoc = await docBox();
      const thumb = page.getByRole("slider");
      if (vp.touch) {
        const b = before!;
        await page.touchscreen.tap(b.x + b.width * 0.62, b.y + b.height / 2);
      } else {
        await thumb.focus();
        await page.keyboard.press("ArrowRight");
        for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
      }
      await expect(thumb).toHaveAttribute("data-placed", "");
      await page.getByTestId("statdrop-lock").click();
      await expect(page.getByTestId("statdrop-suspense")).toBeVisible();
      await expect(page.getByTestId("num-reveal")).toBeVisible();
      await expect(page.getByTestId("statdrop-canonical")).toBeVisible();
      const after = await docBox();
      expect(Math.abs(after.y - beforeDoc.y), "track moved vertically").toBeLessThanOrEqual(1);
      expect(Math.abs(after.x - beforeDoc.x), "track moved horizontally").toBeLessThanOrEqual(1);
      await noSideScroll(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-flow-statdrop-revealed.png`), fullPage: true });
    });

    test("Combat Estimate: typed entry, Enter locks, invalid refused", async ({ page }) => {
      await open(page, "round=ce-ability");
      expect(await labHtml(page)).not.toContain("178");
      const input = page.getByTestId("ce-input");
      await expect(input).toHaveAttribute("inputmode", "decimal");
      await input.fill("lots");
      await input.press("Enter");
      await expect(page.getByTestId("ce-error")).toHaveText("Enter a number.");
      await expect(page.getByTestId("num-reveal")).toHaveCount(0);
      await input.fill("190");
      await input.press("Enter");
      await expect(page.getByTestId("num-reveal")).toBeVisible();
      await expect(page.getByTestId("num-verdict")).toContainText("Within the band");
      await expect(page.getByTestId("lab-baseline")).toContainText("DISAGREE");
      await expect(input).toHaveAttribute("readonly", "");
      await noSideScroll(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-flow-combat-revealed.png`), fullPage: true });
      await page.getByTestId("lab-next").click();
      await expect(page.getByTestId("mig-combat-estimate")).toHaveAttribute("data-phase", "open");
    });
  });
}
