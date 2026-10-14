/**
 * Academy Core V1 — browser inspection of /lol/dev/academy-core.
 *
 * Runs against the frontend-only config (playwright.frontend.config.ts):
 *   npx playwright test -c playwright.frontend.config.ts e2e/academy-core.spec.ts
 *
 * The two remote reads the page makes (Patch Reports list, Daily status) are
 * intercepted with deterministic bodies so the screenshots are stable and no
 * production service is touched. Everything else (shell, HUD, theme) is the
 * real app.
 *
 * Captures the evidence set under docs/handoffs/academy-core-v1/ and asserts
 * the acceptance geometry: no horizontal overflow, actions above the fold,
 * ≥44px touch targets on phones, first-click routing, keyboard focus states,
 * and reduced-motion behaviour.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ROUTE = "/lol/dev/academy-core";
const OUT = path.resolve("docs/handoffs/academy-core-v1");
mkdirSync(OUT, { recursive: true });

const DESKTOP = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const MOBILE = [
  { name: "390x844", width: 390, height: 844 },
  { name: "320x568", width: 320, height: 568 },
  { name: "430x932", width: 430, height: 932 },
];

async function stubRemote(page: Page) {
  await page.route("**/api/patch-reports", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        patches: [{
          patch_version: "26.20", source_url: "", built_at: "2026-10-01T00:00:00Z",
          section_titles: [], card_count: 41, change_count: 598, cards_by_type: {}, cards_by_status: {},
        }],
      }),
    }));
  await page.route("**/api/daily-run/today", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  // Keep the shell's Supabase reads from hanging the run when offline.
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await stubRemote(page);
  await page.goto(ROUTE);
  await expect(page.getByTestId("academy-core")).toBeVisible();
  await expect(page.getByTestId("academy-core-daily")).toBeVisible();
  // Fonts and the first spring settle.
  await page.waitForTimeout(900);
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "horizontal overflow (px)").toBeLessThanOrEqual(0);
}

test.describe("desktop", () => {
  for (const vp of DESKTOP) {
    test(`composition at ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await noHorizontalOverflow(page);
      // Both actions and all four bays inside the first screen.
      for (const id of ["academy-core-daily", "academy-core-ranked",
        "academy-core-bay-leaguecraft", "academy-core-bay-combat-lab",
        "academy-core-bay-archives", "academy-core-bay-pro-play",
        "academy-core-patch-link", "academy-core-commons-link"]) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, id).not.toBeNull();
        expect(box!.y + box!.height, `${id} within first screen`).toBeLessThanOrEqual(vp.height);
        expect(box!.x, `${id} not clipped left`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${id} not clipped right`).toBeLessThanOrEqual(vp.width);
      }
      await page.screenshot({ path: path.join(OUT, `desktop-${vp.name}-idle.png`) });
    });
  }

  test("hover drives the five instrument states and the readout", async ({ page }) => {
    await open(page, 1366, 768);
    const stage = page.getByTestId("academy-core-stage");
    await expect(stage).toHaveAttribute("data-focus", "idle");
    for (const [id, readout] of [
      ["leaguecraft", "INQUIRY"], ["combat-lab", "MEASURE"], ["archives", "STRATA"], ["pro-play", "OBSERVE"],
    ] as const) {
      await page.getByTestId(`academy-core-bay-${id}`).hover();
      await expect(stage).toHaveAttribute("data-focus", id);
      await expect(page.getByTestId("academy-core-readout")).toContainText(readout);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `desktop-1366x768-focus-${id}.png`) });
    }
    await page.mouse.move(10, 400);
    await expect(stage).toHaveAttribute("data-focus", "idle");
  });

  test("keyboard: Tab reaches every entrance, focus is visible and drives the state", async ({ page }) => {
    await open(page, 1366, 768);
    await page.getByTestId("academy-core-daily").focus();
    await expect(page.getByTestId("academy-core-daily")).toBeFocused();
    const order: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
      order.push(id);
      if (id === "academy-core-bay-pro-play") break;
    }
    expect(order).toContain("academy-core-ranked");
    expect(order).toContain("academy-core-bay-leaguecraft");
    expect(order).toContain("academy-core-bay-combat-lab");
    expect(order).toContain("academy-core-bay-archives");
    expect(order).toContain("academy-core-bay-pro-play");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "pro-play");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
    expect(outline).not.toBe("none");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-keyboard-focus.png") });
  });

  test("Enter on a focused bay navigates on the first action", async ({ page }) => {
    await open(page, 1366, 768);
    await page.getByTestId("academy-core-bay-archives").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/lol\/docs$/);
  });

  test("Daily and Ranked route into the existing Quiz contracts", async ({ page }) => {
    await open(page, 1366, 768);
    await page.getByTestId("academy-core-ranked").click();
    await expect(page).toHaveURL(/\/quiz\?play=1$/);
    await page.goBack();
    await expect(page.getByTestId("academy-core-daily")).toBeVisible();
    await page.getByTestId("academy-core-daily").click();
    await expect(page).toHaveURL(/\/quiz\/daily-challenge$/);
  });

  test("the brief's alias lands on the page", async ({ page }) => {
    await stubRemote(page);
    await page.goto("/dev/academy-core");
    await expect(page).toHaveURL(/\/lol\/dev\/academy-core$/);
    await expect(page.getByTestId("academy-core")).toBeVisible();
  });

  test("reduced motion: states remain readable with no running animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 1366, 768);
    const svg = page.getByRole("img", { name: "The Academy Core instrument" });
    await expect(svg).toHaveAttribute("data-ambient", "off");
    await page.getByTestId("academy-core-bay-combat-lab").hover();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "combat-lab");
    await page.waitForTimeout(150);
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === "running"
        && (a.effect as KeyframeEffect | null)?.target?.closest?.(".acore-root")).length);
    expect(running).toBe(0);
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-reduced-motion-combat.png") });
  });
});

test.describe("mobile", () => {
  for (const vp of MOBILE) {
    test(`stacked composition at ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await noHorizontalOverflow(page);
      // Daily and Ranked precede the instrument, and both are on the first screen.
      const daily = (await page.getByTestId("academy-core-daily").boundingBox())!;
      const ranked = (await page.getByTestId("academy-core-ranked").boundingBox())!;
      const stage = (await page.getByTestId("academy-core-stage").boundingBox())!;
      expect(daily.y + daily.height).toBeLessThanOrEqual(vp.height);
      expect(ranked.y + ranked.height).toBeLessThanOrEqual(vp.height);
      expect(stage.y).toBeGreaterThan(ranked.y);
      // Touch targets.
      const boxes = [] as { id: string; x: number; y: number; w: number; h: number }[];
      for (const id of ["academy-core-daily", "academy-core-ranked",
        "academy-core-bay-leaguecraft", "academy-core-bay-combat-lab",
        "academy-core-bay-archives", "academy-core-bay-pro-play",
        "academy-core-patch-link", "academy-core-commons-link", "academy-core-hall-link"]) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.height, `${id} tall enough`).toBeGreaterThanOrEqual(44);
        expect(b.x + b.width, `${id} inside viewport`).toBeLessThanOrEqual(vp.width + 0.5);
        boxes.push({ id, x: b.x, y: b.y, w: b.width, h: b.height });
      }
      // No overlapping targets.
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]; const b = boxes[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
        }
      }
      await page.screenshot({ path: path.join(OUT, `mobile-${vp.name}-top.png`) });
      await page.screenshot({ path: path.join(OUT, `mobile-${vp.name}-full.png`), fullPage: true });
    });
  }

  test("a tap engages the state and routes on the first action", async ({ page }) => {
    await open(page, 390, 844);
    const bay = page.getByTestId("academy-core-bay-combat-lab");
    await bay.scrollIntoViewIfNeeded();
    await bay.dispatchEvent("pointerdown", { pointerType: "touch" });
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "combat-lab");
    await bay.click();
    await expect(page).toHaveURL(/\/combat-lab$/);
  });

  test("deep text zoom keeps every label", async ({ page }) => {
    await open(page, 390, 844);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.waitForTimeout(300);
    await noHorizontalOverflow(page);
    for (const text of ["Leaguecraft", "Combat Simulation", "Mogzy Archives", "Pro Play", "Play Daily Challenge", "Ranked"]) {
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await page.screenshot({ path: path.join(OUT, "mobile-390x844-text-zoom-200.png"), fullPage: true });
  });
});
