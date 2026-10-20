/**
 * Academy masthead redesign: the Orrery-first header (the compact crest and the Daily seal).
 *
 *   npx playwright test -c playwright.frontend.config.ts e2e/academy-core-masthead.spec.ts --workers=1
 *
 * Runs on GitHub's runner only (AGENTS.md: no local desktop browsers). Each
 * viewport asserts the redesign's geometry and writes a full-viewport
 * screenshot to test-results/masthead/ for the owner's visual review.
 *
 * MOCKS (disclosed): the Patch Report feed, the Daily status (signed out) and
 * Supabase are stubbed, as in the Orrery specs. The champion manifest and the
 * cover art are REAL (the asset host), so the screenshots show the real books;
 * if the asset host is slow the covers may still be drawing.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("test-results/masthead");
mkdirSync(OUT, { recursive: true });

const CHAMPS = ["Ryze", "Ahri", "Akali", "Viktor", "Jinx", "Yasuo"];

async function stub(page: Page) {
  await page.route("**/api/patch-reports", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ patches: [{
        patch_version: "26.20", source_url: "", built_at: "2026-10-01T00:00:00Z",
        section_titles: [], card_count: 41, change_count: 598, cards_by_type: {}, cards_by_status: {},
      }] }),
    }));
  await page.route("**/api/patch-reports/**", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        patch_version: "26.20", source_url: "", built_at: "2026-10-01T00:00:00Z", sections: [],
        cards: CHAMPS.map((n, i) => ({
          section_title: "Champions", status: "analyzed",
          entity_type: "champion", entity_name: n, entity_slug: n.toLowerCase(),
          mogzy_entity_ref: null, mogzy_image_path: null, official_image_url: null,
          editorial_direction: i < 3 ? "buff" : "nerf", editorial_direction_source: "riot_section",
          changes: [{ group_title: "Base stats", property_name: "Health", change_kind: "numeric",
            before_raw: "600", after_raw: i < 3 ? "620" : "580" }],
        })),
      }),
    }));
  await page.route("**/api/daily-run/today", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await stub(page);
  await page.goto("/lol");
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(page.getByTestId("academy-veil")).toHaveCount(0);
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>(".o35-book img")];
    return imgs.length >= 4 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, undefined, { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

type R = { x: number; y: number; width: number; height: number };
const box = async (page: Page, sel: string): Promise<R> => (await page.locator(sel).first().boundingBox())!;

async function commonChecks(page: Page, vp: { width: number; height: number }) {
  // no Ranked anywhere on the Academy, in any form
  await expect(page.getByTestId("academy-core-ranked")).toHaveCount(0);
  await expect(page.getByTestId("academy-core-masthead")).not.toContainText(/ranked|coming soon/i);
  // the identity and the seal keep their contracts
  await expect(page.getByRole("heading", { level: 1, name: "Mogzy Academy" })).toBeVisible();
  await expect(page.getByTestId("academy-core-daily")).toHaveAccessibleName("Play Daily Challenge");
  // no horizontal page scroll
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, "no horizontal overflow").toBeLessThanOrEqual(vp.width + 1);
  // Daily: in the first viewport, a comfortable target, not covered by decoration
  const d = await box(page, '[data-testid="academy-core-daily"]');
  expect(d.y, "Daily in the first viewport").toBeGreaterThanOrEqual(0);
  expect(d.y + d.height, "Daily in the first viewport").toBeLessThanOrEqual(vp.height);
  expect(d.x + d.width, "Daily not clipped").toBeLessThanOrEqual(vp.width);
  expect(d.height, "Daily target height").toBeGreaterThanOrEqual(44);
  expect(d.width, "Daily target width").toBeGreaterThanOrEqual(120);
  const covered = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="academy-core-daily"]')!;
    const r = el.getBoundingClientRect();
    const out: string[] = [];
    for (const [fx, fy] of [[0.12, 0.5], [0.5, 0.5], [0.85, 0.5]]) {
      const hit = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy);
      if (!hit || !(el === hit || el.contains(hit))) out.push(`${fx}: ${hit?.className}`);
    }
    return out;
  });
  expect(covered, "Daily hit-testable").toEqual([]);
  return d;
}

test.describe("desktop: the Orrery dominates; a compact crest and a Daily seal", () => {
  for (const vp of [{ name: "1366x768", width: 1366, height: 768 }, { name: "1920x1080", width: 1920, height: 1080 }, { name: "1280x720", width: 1280, height: 720 }]) {
    test(`desktop ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-layout", "full");
      await commonChecks(page, vp);
      const h1 = await box(page, "#acore-title");
      expect(h1.height, "the title is no longer a big header").toBeLessThanOrEqual(34);
      const stage = await box(page, '[data-testid="academy-core-stage"]');
      expect(stage.width / vp.width, "the Orrery takes most of the width").toBeGreaterThanOrEqual(0.64);
      // the Patch Report book and the Academy links are intact
      await expect(page.getByTestId("academy-core-book")).toBeVisible();
      await expect(page.getByTestId("academy-core-commons-link")).toBeVisible();
      await expect(page.getByTestId("academy-core-hall-link")).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `desktop-${vp.name}.png`) });
    });
  }

  test("desktop hover state of the Daily seal", async ({ page }) => {
    await open(page, 1366, 768);
    const d = await box(page, '[data-testid="academy-core-daily"]');
    await page.mouse.move(d.x + d.width * 0.3, d.y + d.height / 2);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-seal-hover.png"), clip: { x: 0, y: 0, width: 520, height: 260 } });
  });

  test("Daily still starts the Daily Challenge", async ({ page }) => {
    await open(page, 1366, 768);
    await page.getByTestId("academy-core-daily").click();
    await page.waitForURL(/\/quiz\/daily-challenge/);
  });
});

test.describe("phones: Orrery-first, fitted to the screen height", () => {
  for (const vp of [{ name: "360x640", width: 360, height: 640 }, { name: "390x844", width: 390, height: 844 }, { name: "320x568", width: 320, height: 568 }, { name: "430x932", width: 430, height: 932 }]) {
    test(`portrait ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-layout", "stacked");
      const d = await commonChecks(page, vp);
      const mast = await box(page, '[data-testid="academy-core-masthead"]');
      const title = await box(page, "#acore-title");
      const seal = await box(page, '[data-testid="academy-core-daily"] .o35-seal-mark');
      expect(title.x + title.width, "the seal never covers the title").toBeLessThanOrEqual(seal.x + 1);
      expect(mast.height, "the identity is one compact row").toBeLessThanOrEqual(64);
      const stage = await box(page, '[data-testid="academy-core-stage"]');
      expect(stage.y, "the Orrery starts right under the row").toBeLessThanOrEqual(mast.y + mast.height + 16);
      expect(Math.abs((d.y + d.height / 2) - (mast.y + mast.height / 2)), "Daily sits in the identity row").toBeLessThanOrEqual(8);
      const crystal = await box(page, '[data-testid="academy-core-crystal"]');
      expect(crystal.y + crystal.height / 2, "the Core is in the first viewport").toBeLessThanOrEqual(vp.height);
      const up = await box(page, '[data-testid="academy-core-slot-leaguecraft"]');
      expect(up.y, "the upper books are in the first viewport").toBeLessThan(vp.height * 0.5);
      // the whole composition (four books and the crystal) is in the first screen, not cropped
      for (const id of ["leaguecraft", "pro-play", "combat-lab", "archives"]) {
        const b = await box(page, `.o35-book[data-bay="${id}"]`);
        expect(b.y + b.height, `${id} whole on the first screen`).toBeLessThanOrEqual(vp.height + 1);
        expect(b.width, `${id} readable`).toBeGreaterThanOrEqual(96);
      }
      expect(crystal.y + crystal.height, "the crystal whole on the first screen").toBeLessThanOrEqual(vp.height);
      expect(crystal.height, "crystal target").toBeGreaterThanOrEqual(44);
      // the arrows join the first screen wherever there is room for them (>= 600 px tall)
      if (vp.height >= 600) {
        for (const id of ["academy-core-arrow-left", "academy-core-arrow-right"]) {
          const a = await box(page, `[data-testid="${id}"]`);
          expect(a.y + a.height, `${id} on the first screen`).toBeLessThanOrEqual(vp.height);
        }
      }
      const fit = await page.locator(".o35-scene").getAttribute("data-fit");
      console.log(`fit ${vp.name}: ${fit}`);
      await page.screenshot({ path: path.join(OUT, `phone-${vp.name}.png`) });
    });
  }
});

test.describe("short landscape: the whole instrument fits", () => {
  for (const vp of [{ name: "640x360", width: 640, height: 360 }, { name: "740x360", width: 740, height: 360 }, { name: "844x390", width: 844, height: 390 }, { name: "932x430", width: 932, height: 430 }]) {
    test(`landscape ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-layout", "stacked");
      await commonChecks(page, vp);
      const stage = await box(page, '[data-testid="academy-core-stage"]');
      expect(stage.y + stage.height, "the instrument fits the screen").toBeLessThanOrEqual(vp.height + 1);
      for (const id of ["leaguecraft", "pro-play", "combat-lab", "archives"]) {
        const b = await box(page, `[data-testid="academy-core-slot-${id}"]`);
        expect(b.y + b.height, `${id} on screen`).toBeLessThanOrEqual(vp.height + 1);
        expect(Math.min(b.width, b.height), `${id} target`).toBeGreaterThanOrEqual(44);
      }
      for (const id of ["academy-core-arrow-left", "academy-core-arrow-right"]) {
        const b = await box(page, `[data-testid="${id}"]`);
        expect(b.y + b.height, `${id} on screen`).toBeLessThanOrEqual(vp.height);
      }
      await page.screenshot({ path: path.join(OUT, `landscape-${vp.name}.png`) });
    });
  }
});

test.describe("tablet and reduced motion", () => {
  test("tablet 768x1024", async ({ page }) => {
    await open(page, 768, 1024);
    await commonChecks(page, { width: 768, height: 1024 });
    await page.screenshot({ path: path.join(OUT, "tablet-768x1024.png") });
  });

  test("reduced motion: the seal is still, the page works", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    try {
      await open(page, 390, 844);
      await commonChecks(page, { width: 390, height: 844 });
      const running = await page.evaluate(() => document.getAnimations().filter((a) =>
        (a.effect as KeyframeEffect | null)?.target instanceof Element
        && ((a.effect as KeyframeEffect).target as Element).closest(".o35-masthead") && a.playState === "running").length);
      expect(running, "no running masthead animation").toBe(0);
      await page.screenshot({ path: path.join(OUT, "phone-390x844-reduced-motion.png") });
    } finally {
      await ctx.close();
    }
  });
});
