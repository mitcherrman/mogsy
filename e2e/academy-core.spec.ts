/**
 * Academy Core V2 — browser inspection of /lol/dev/academy-core.
 *
 * Runs against the frontend-only config (playwright.frontend.config.ts):
 *   npx playwright test -c playwright.frontend.config.ts e2e/academy-core.spec.ts
 *
 * The remote reads the page makes (Patch Reports list + detail, champion
 * manifest, Daily status) are intercepted with deterministic bodies so the
 * screenshots are stable and no production service is touched. Everything
 * else (shell, HUD, theme, the real book component) is the real app.
 *
 * Captures the evidence set under docs/handoffs/academy-core-v2/ and asserts
 * the acceptance geometry: no horizontal overflow, actions above the fold,
 * the real Patch Report book beside the Core (desktop) / below the rooms
 * (phone), ≥44px touch targets on phones, first-click routing, keyboard
 * focus states, Mogzy's reactions, and reduced-motion behaviour.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROUTE = "/lol/dev/academy-core";
const OUT = path.resolve("docs/handoffs/academy-core-v2");
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

const ICON = (name: string) => `assets/champions/${name}/icon.png`;
/** A real 128px champion icon from the repo stands in for every manifest icon. */
const ICON_PNG = readFileSync(path.resolve("public/images/library/champion-ahri.png"));

export async function stubRemote(page: Page) {
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
        cards: ["Ryze", "Ahri", "Akali", "Viktor", "Jinx", "Yasuo"].map((n, i) => ({
          section_title: "Champions", status: "analyzed",
          entity_type: "champion", entity_name: n, entity_slug: n.toLowerCase(),
          mogzy_entity_ref: null, mogzy_image_path: null, official_image_url: null,
          editorial_direction: i < 3 ? "buff" : "nerf", editorial_direction_source: "riot_section",
          changes: [{ group_title: "Base stats", property_name: "Health", change_kind: "numeric",
            before_raw: "600", after_raw: i < 3 ? "620" : "580" }],
        })),
      }),
    }));
  await page.route("**/api/assets/champions", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, champions: Object.fromEntries(
        ["Ryze", "Ahri", "Akali", "Viktor", "Jinx", "Yasuo"].map((n) => [n, { icon: ICON(n), splash: "", loading: "", cutout: "" }]),
      ) }),
    }));
  await page.route("**/assets/champions/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: ICON_PNG }));
  await page.route("**/api/daily-run/today", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await stubRemote(page);
  await page.goto(ROUTE);
  await expect(page.getByTestId("academy-core")).toBeVisible();
  await expect(page.getByTestId("academy-core-daily")).toBeVisible();
  // Fonts, the book painting and the first spring settle.
  await page.waitForTimeout(1200);
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
      for (const id of ["academy-core-daily", "academy-core-ranked",
        "academy-core-bay-leaguecraft", "academy-core-bay-combat-lab",
        "academy-core-bay-archives", "academy-core-bay-pro-play",
        "academy-core-book", "academy-core-commons-link", "academy-core-mogzy"]) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, id).not.toBeNull();
        expect(box!.y + box!.height, `${id} within first screen`).toBeLessThanOrEqual(vp.height + 1);
        expect(box!.x, `${id} not clipped left`).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width, `${id} not clipped right`).toBeLessThanOrEqual(vp.width + 1);
      }
      // The real book: its surface, the live brief, and the radio dock.
      const book = page.getByTestId("academy-core-book");
      await expect(book.getByTestId("academy-broadcast-surface")).toBeVisible();
      await expect(book.getByText("Patch 26.20")).toBeVisible();
      await expect(book.getByTestId("academy-radio-dock")).toBeVisible();
      // and no book / bay overlap
      const b = (await book.boundingBox())!;
      const stage = (await page.getByTestId("academy-core-stage").boundingBox())!;
      expect(b.x + b.width, "book clear of the stage").toBeLessThanOrEqual(stage.x + 1);
      await page.screenshot({ path: path.join(OUT, `desktop-${vp.name}-idle.png`) });
    });
  }

  test("short desktop (1280x660): the book stays legible and nothing overlaps", async ({ page }) => {
    await open(page, 1280, 660);
    await noHorizontalOverflow(page);
    const book = (await page.getByTestId("academy-core-book").boundingBox())!;
    expect(book.width).toBeGreaterThanOrEqual(270);
    const daily = (await page.getByTestId("academy-core-daily").boundingBox())!;
    expect(daily.y + daily.height).toBeLessThanOrEqual(660);
    await page.screenshot({ path: path.join(OUT, "desktop-1280x660-short.png"), fullPage: true });
  });

  test("hover drives the five instrument states, the projections and Mogzy", async ({ page }) => {
    await open(page, 1366, 768);
    const stage = page.getByTestId("academy-core-stage");
    const mogzy = page.getByTestId("academy-core-mogzy");
    await expect(stage).toHaveAttribute("data-focus", "idle");
    await expect(mogzy).toHaveAttribute("data-pose", "rest");
    // projections arrive after the warm
    await expect(page.locator(".acore-mode-leaguecraft image")).toHaveCount(1, { timeout: 8000 });
    for (const [id, pose] of [
      ["leaguecraft", "holdingBook"], ["combat-lab", "raisingHand"], ["archives", "explaining"], ["pro-play", "peeking"],
    ] as const) {
      await page.getByTestId(`academy-core-bay-${id}`).hover();
      await expect(stage).toHaveAttribute("data-focus", id);
      await expect(mogzy).toHaveAttribute("data-pose", pose);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `desktop-1366x768-focus-${id}.png`) });
    }
    // the Archives strata carry the live patch's icons
    await expect(page.locator(".acore-mode-archives image")).toHaveCount(4);
    await page.mouse.move(10, 400);
    await expect(stage).toHaveAttribute("data-focus", "idle");
    await expect(mogzy).toHaveAttribute("data-pose", "rest");
  });

  test("keyboard: Tab reaches every entrance, focus is visible and drives the state", async ({ page }) => {
    await open(page, 1366, 768);
    await page.getByTestId("academy-core-daily").focus();
    const order: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
      order.push(id);
      if (id === "academy-core-bay-pro-play") break;
    }
    for (const id of ["academy-core-ranked", "academy-core-bay-leaguecraft", "academy-core-bay-combat-lab",
      "academy-core-bay-archives", "academy-core-bay-pro-play"]) expect(order).toContain(id);
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

  test("the book's own link opens the full Patch Report", async ({ page }) => {
    await open(page, 1366, 768);
    await page.getByTestId("academy-core-book").getByRole("link", { name: /Read full report/i }).click();
    await expect(page).toHaveURL(/\/lol\/patch-reports\?patch=26\.20$/);
  });

  test("the brief's alias lands on the page", async ({ page }) => {
    await stubRemote(page);
    await page.goto("/dev/academy-core");
    await expect(page).toHaveURL(/\/lol\/dev\/academy-core$/);
    await expect(page.getByTestId("academy-core")).toBeVisible();
  });

  test("/lol#academy-commons now lands on the Commons", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubRemote(page);
    await page.goto("/lol#academy-commons");
    await expect(page.getByTestId("academy-commons")).toBeAttached();
    await expect
      .poll(async () => page.evaluate(() => {
        const el = document.getElementById("academy-commons");
        return el ? Math.round(el.getBoundingClientRect().top) : 9999;
      }), { timeout: 6000 })
      .toBeLessThanOrEqual(80);
  });

  test("reduced motion: states remain readable with no running animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 1366, 768);
    const svg = page.getByRole("img", { name: "The Academy Core instrument" });
    await expect(svg).toHaveAttribute("data-ambient", "off");
    await page.getByTestId("academy-core-bay-combat-lab").hover();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "combat-lab");
    await page.waitForTimeout(200);
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === "running"
        && (a.effect as KeyframeEffect | null)?.target?.closest?.(".acore-root")).length);
    expect(running).toBe(0);
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-reduced-motion-combat.png") });
  });

  test("no Hall-only art is requested (library, book frame, spine)", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await open(page, 1366, 768);
    await page.waitForTimeout(2500);
    const hallOnly = requested.filter((u) => /academy-library-(desktop|mobile)|academy-book-frame|book-spine/.test(u) && !/\?import$/.test(u));
    expect(hallOnly).toEqual([]);
    expect(requested.some((u) => u.includes("academy-broadcast-book.webp"))).toBe(true);
    expect(requested.some((u) => u.includes("mogzy-mascot-base-v1-512.webp"))).toBe(true);
  });
});

test.describe("mobile", () => {
  for (const vp of MOBILE) {
    test(`stacked composition at ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await noHorizontalOverflow(page);
      const daily = (await page.getByTestId("academy-core-daily").boundingBox())!;
      const ranked = (await page.getByTestId("academy-core-ranked").boundingBox())!;
      const stage = (await page.getByTestId("academy-core-stage").boundingBox())!;
      const rooms = (await page.getByTestId("academy-core-bay-leaguecraft").boundingBox())!;
      const book = (await page.getByTestId("academy-core-book-mobile").boundingBox())!;
      expect(daily.y + daily.height).toBeLessThanOrEqual(vp.height);
      expect(ranked.y + ranked.height).toBeLessThanOrEqual(vp.height);
      expect(stage.y).toBeGreaterThan(ranked.y);
      expect(rooms.y).toBeGreaterThan(stage.y);
      expect(book.y, "the mobile book follows the rooms").toBeGreaterThan(rooms.y);
      await expect(page.getByTestId("academy-core-book-mobile").getByTestId("academy-broadcast-surface-mobile")).toBeAttached();
      const boxes = [] as { id: string; x: number; y: number; w: number; h: number }[];
      for (const id of ["academy-core-daily", "academy-core-ranked",
        "academy-core-bay-leaguecraft", "academy-core-bay-combat-lab",
        "academy-core-bay-archives", "academy-core-bay-pro-play",
        "academy-core-commons-link", "academy-core-hall-link"]) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.height, `${id} tall enough`).toBeGreaterThanOrEqual(44);
        expect(b.x + b.width, `${id} inside viewport`).toBeLessThanOrEqual(vp.width + 0.5);
        boxes.push({ id, x: b.x, y: b.y, w: b.width, h: b.height });
      }
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

  test("phone focus: a room state is reachable from a focused row", async ({ page }) => {
    await open(page, 390, 844);
    await page.getByTestId("academy-core-bay-pro-play").focus();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "pro-play");
    await page.getByTestId("academy-core-stage").scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, "mobile-390x844-focus-pro-play.png") });
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
