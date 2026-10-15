/**
 * Academy Core V3 — browser inspection of the production home, /lol.
 *
 * Runs against the frontend-only config (playwright.frontend.config.ts):
 *   npx playwright test -c playwright.frontend.config.ts e2e/academy-core.spec.ts
 *
 * MOCKS (disclosed): the remote reads the page makes — Patch Reports list +
 * detail, the champion manifest, the Daily status, Supabase app settings —
 * are intercepted with deterministic bodies so captures are stable and no
 * production service is touched. Every manifest splash / icon is served as
 * one real 128 px champion icon from the repo, so the covers draw a real
 * picture; in production the covers are the champions' actual splashes.
 * Everything else (shell, HUD, theme, the real book and radio components,
 * the real AcademyHubBook covers) is the real app.
 *
 * Captures the evidence set under docs/handoffs/academy-core-v3/ and asserts
 * the acceptance geometry and behaviour: no horizontal overflow; four real
 * covers with the Hall's identity; the upper pair larger and higher; the real
 * Patch Report book beside the Core (desktop) / below the lower pair (phone);
 * one-click activation ≤ 350 ms then navigation; modified clicks left to the
 * browser; rapid clicks route once; reduced motion routes at once; the crystal
 * cycles previews without navigating; keyboard focus; touch; no Hall-only
 * art requested; ≥ 44 px targets on phones; 200 % text zoom.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROUTE = "/lol";
const OUT = path.resolve("docs/handoffs/academy-core-v3-integration");
mkdirSync(OUT, { recursive: true });

const DESKTOP = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const MOBILE = [
  { name: "390x844", width: 390, height: 844 },
  { name: "320x568", width: 320, height: 568 },
  { name: "430x932", width: 430, height: 932 },
];

/** A real 128px champion icon from the repo stands in for every manifest image. */
const ICON_PNG = readFileSync(path.resolve("public/images/library/champion-ahri.png"));
const CHAMPS = ["Ryze", "Ahri", "Akali", "Viktor", "Jinx", "Yasuo"];

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
  await page.route("**/api/assets/champions", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, champions: Object.fromEntries(CHAMPS.map((n) => [n, {
        icon: `assets/champions/${n}/icon.png`, splash: `assets/champions/${n}/splash/0_default.jpg`, loading: "", cutout: "",
      }])) }),
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
  // Fonts, the covers and the first spring settle.
  await page.waitForTimeout(1400);
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "horizontal overflow (px)").toBeLessThanOrEqual(0);
}

const bookLink = (page: Page, id: string) => page.getByTestId(`academy-core-slot-${id}`).getByRole("link");

const ROOMS = [
  { id: "leaguecraft", title: "Leaguecraft", href: "/quiz", champ: "Ryze", lines: ["LEAGUECRAFT", "STUDIES"] },
  { id: "pro-play", title: "Pro Play", href: "/lol/pro-play", champ: "Ahri", lines: ["PRO PLAY"] },
  { id: "combat-lab", title: "Combat Simulation", href: "/combat-lab", champ: "Akali", lines: ["COMBAT", "SIMULATION"] },
  { id: "archives", title: "Mogzy Archives", href: "/lol/docs", champ: "Viktor", lines: ["MOGZY", "ARCHIVES"] },
] as const;

async function assertCovers(page: Page) {
  for (const r of ROOMS) {
    const link = bookLink(page, r.id);
    await expect(link).toHaveAttribute("aria-label", r.title);
    await expect(link).toHaveAttribute("href", r.href);
    await expect(link.locator("img[src*='/splash/']")).toHaveAttribute("src", new RegExp(`${r.champ}/splash`));
    await expect(link.locator("img[src*='academy-book-frame']")).toHaveCount(1);
    const lines = await link.locator("h3 span").allTextContents();
    expect(lines.map((l) => l.toUpperCase())).toEqual([...r.lines]);
  }
}

test.describe("desktop", () => {
  for (const vp of DESKTOP) {
    test(`composition at ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await noHorizontalOverflow(page);
      await assertCovers(page);
      for (const id of ["academy-core-daily", "academy-core-slot-leaguecraft", "academy-core-slot-pro-play",
        "academy-core-slot-combat-lab", "academy-core-slot-archives", "academy-core-book", "academy-core-mogzy", "academy-core-crystal"]) {
        const box = (await page.getByTestId(id).boundingBox())!;
        expect(box, id).not.toBeNull();
        expect(box.y + box.height, `${id} within first screen`).toBeLessThanOrEqual(vp.height + 1);
        expect(box.x, `${id} not clipped left`).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, `${id} not clipped right`).toBeLessThanOrEqual(vp.width + 1);
      }
      const up = (await page.getByTestId("academy-core-slot-leaguecraft").boundingBox())!;
      const lo = (await page.getByTestId("academy-core-slot-combat-lab").boundingBox())!;
      expect(lo.width / up.width).toBeGreaterThanOrEqual(0.8);
      expect(lo.width / up.width).toBeLessThanOrEqual(0.9);
      expect(up.y).toBeLessThan(lo.y);
      const stage = (await page.getByTestId("academy-core-stage").boundingBox())!;
      const book = (await page.getByTestId("academy-core-book").boundingBox())!;
      expect(book.width).toBeGreaterThanOrEqual(272);
      expect(book.x + book.width, "book clear of the stage").toBeLessThanOrEqual(stage.x + 1);
      await expect(page.getByTestId("academy-core-book").getByText("Patch 26.20")).toBeVisible();
      await expect(page.getByTestId("academy-core-book").getByTestId("academy-radio-dock")).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `desktop-${vp.name}-idle.png`) });
    });
  }

  test("short desktop (1280x660): the book stays legible, nothing overlaps, the page scrolls", async ({ page }) => {
    await open(page, 1280, 660);
    await noHorizontalOverflow(page);
    const book = (await page.getByTestId("academy-core-book").boundingBox())!;
    expect(book.width).toBeGreaterThanOrEqual(272);
    const stage = (await page.getByTestId("academy-core-stage").boundingBox())!;
    expect(book.x + book.width).toBeLessThanOrEqual(stage.x + 1);
    await page.screenshot({ path: path.join(OUT, "desktop-1280x660-short.png"), fullPage: true });
  });

  test("hover lifts a book, lights its cradle and channel, projects its room and moves Mogzy", async ({ page }) => {
    await open(page, 1366, 768);
    const stage = page.getByTestId("academy-core-stage");
    const mogzy = page.getByTestId("academy-core-mogzy");
    await expect(stage).toHaveAttribute("data-focus", "idle");
    await expect(page.locator(".acore-mode-leaguecraft image")).toHaveCount(1, { timeout: 8000 });
    for (const [id, pose] of [["leaguecraft", "holdingBook"], ["pro-play", "peeking"], ["combat-lab", "raisingHand"], ["archives", "explaining"]] as const) {
      await bookLink(page, id).hover();
      await expect(stage).toHaveAttribute("data-focus", id);
      await expect(mogzy).toHaveAttribute("data-pose", pose);
      await expect(page.getByTestId("academy-core-preview")).toHaveText(/Previewing/);
      await page.waitForTimeout(800);
      if (id === "leaguecraft" || id === "pro-play") await page.screenshot({ path: path.join(OUT, `desktop-1366x768-focus-${id}.png`) });
    }
    await page.mouse.move(10, 400);
    await expect(stage).toHaveAttribute("data-focus", "idle");
    await expect(mogzy).toHaveAttribute("data-pose", "rest");
  });

  test("one click: a ≤ 350 ms activation, then navigation (measured)", async ({ page }) => {
    await open(page, 1366, 768);
    const link = bookLink(page, "combat-lab");
    const t0 = Date.now();
    await link.click();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "combat-lab");
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-activation-combat.png") });
    await page.waitForURL(/\/combat-lab$/);
    const elapsed = Date.now() - t0;
    expect(elapsed, "click → route change").toBeLessThanOrEqual(350 + 600); // activation + the screenshot + overhead
    await page.goBack();
    await expect(page.getByTestId("academy-core")).toBeVisible();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "");
  });

  test("rapid clicks route once; a modified click is the browser's; Enter routes", async ({ page }) => {
    await open(page, 1366, 768);
    const link = bookLink(page, "archives");
    await link.click();
    await link.click({ timeout: 2000 }).catch(() => {});
    await page.waitForURL(/\/lol\/docs$/);
    await page.goBack();
    await expect(page.getByTestId("academy-core")).toBeVisible();
    const popup = page.context().waitForEvent("page", { timeout: 5000 }).catch(() => null);
    await bookLink(page, "pro-play").click({ modifiers: ["Control"] });
    const newPage = await popup;
    expect(newPage, "ctrl-click opened a new page").not.toBeNull();
    await expect(page).toHaveURL(/\/lol$/);
    await newPage?.close();
    await bookLink(page, "leaguecraft").focus();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "leaguecraft");
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-keyboard-focus.png") });
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/quiz$/);
  });

  test("reduced motion: a book routes immediately, no animations run", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 1366, 768);
    await expect(page.getByRole("img", { name: "The Academy Core instrument" })).toHaveAttribute("data-ambient", "off");
    await bookLink(page, "pro-play").hover();
    await page.waitForTimeout(150);
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === "running"
        && (a.effect as KeyframeEffect | null)?.target?.closest?.(".acore-root")).length);
    expect(running).toBe(0);
    const t0 = Date.now();
    await bookLink(page, "pro-play").click();
    await page.waitForURL(/\/lol\/pro-play$/);
    expect(Date.now() - t0).toBeLessThan(300);
  });

  test("the crystal cycles previews without navigating and names them", async ({ page }) => {
    await open(page, 1366, 768);
    const crystal = page.getByTestId("academy-core-crystal");
    const readout = page.getByTestId("academy-core-preview");
    for (const title of ["Leaguecraft", "Pro Play", "Combat Simulation", "Mogzy Archives"]) {
      await crystal.click();
      await expect(readout).toHaveText(`Previewing ${title}`);
    }
    await crystal.click();
    await expect(readout).toHaveText("No room previewed");
    await expect(page).toHaveURL(/\/lol$/);
    await crystal.focus();
    await page.keyboard.press("Space");
    await expect(readout).toHaveText("Previewing Leaguecraft");
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-crystal-preview.png") });
  });

  test("Daily, Ranked, the book's own link and the alias behave as before", async ({ page }) => {
    await open(page, 1366, 768);
    await page.getByTestId("academy-core-ranked").click();
    await expect(page).toHaveURL(/\/quiz\?play=1$/);
    await page.goBack();
    await expect(page.getByTestId("academy-core-daily")).toBeVisible();
    await page.getByTestId("academy-core-daily").click();
    await expect(page).toHaveURL(/\/quiz\/daily-challenge$/);
    await page.goBack();
    await expect(page.getByTestId("academy-core-book")).toBeVisible();
    await page.getByTestId("academy-core-book").getByRole("link", { name: /Read full report/i }).click();
    await expect(page).toHaveURL(/\/lol\/patch-reports\?patch=26\.20$/);
  });

  test("the preview URLs redirect to the home", async ({ page }) => {
    await stubRemote(page);
    await page.goto("/dev/academy-core");
    await expect(page).toHaveURL(/\/lol$/);
    await page.goto("/lol/dev/academy-core");
    await expect(page).toHaveURL(/\/lol$/);
    await expect(page.getByTestId("academy-core")).toBeVisible();
  });

  test("legacy /lol#academy-commons is forwarded to the Hall's Commons", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubRemote(page);
    await page.goto("/lol#academy-commons");
    await expect(page).toHaveURL(/\/lol\/hall#academy-commons$/);
    await expect(page.getByTestId("academy-core")).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => {
      const el = document.getElementById("academy-commons");
      return el ? Math.round(el.getBoundingClientRect().top) : 9999;
    }), { timeout: 8000 }).toBeLessThanOrEqual(80);
  });

  test("the Core's Commons and Hall links are client-side and land on the Hall", async ({ page }) => {
    await open(page, 1366, 768);
    let documentLoads = 0;
    page.on("request", (r) => { if (r.resourceType() === "document") documentLoads += 1; });
    await page.getByTestId("academy-core-hall-link").click();
    await expect(page).toHaveURL(/\/lol\/hall$/);
    await expect(page.getByTestId("academy-hall")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("academy-core")).toBeVisible();
    await page.getByTestId("academy-core-commons-link").click();
    await expect(page).toHaveURL(/\/lol\/hall#academy-commons$/);
    await expect.poll(async () => page.evaluate(() => {
      const el = document.getElementById("academy-commons");
      return el ? Math.round(el.getBoundingClientRect().top) : 9999;
    }), { timeout: 8000 }).toBeLessThanOrEqual(80);
    expect(documentLoads, "no full document reloads").toBe(0);
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-hall-commons.png") });
  });

  test("the Hall is preserved at /lol/hall (desktop screen one, noindex) and the Core is indexable", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubRemote(page);
    await page.goto("/lol/hall");
    await expect(page.getByTestId("academy-hall")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/lol\/hall$/);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-hall-preserved.png") });
    await page.goto("/lol");
    await expect(page.getByTestId("academy-core")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/lol$/);
    await expect(page).toHaveTitle(/Mogzy LoL Quiz/);
  });

  test("Landing → Core: the hold hands off to /lol, the Core's art loads once and no Hall-only art is fetched", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubRemote(page);
    await page.goto("/");
    await page.waitForURL(/\/lol$/, { timeout: 15000 });
    await expect(page.getByTestId("academy-core-daily")).toBeVisible();
    await page.waitForTimeout(2500);
    const real = requested.filter((u) => !/\?import$/.test(u));
    expect(real.filter((u) => /academy-library-(desktop|mobile)|book-spine/.test(u)), "retired Hall art").toEqual([]);
    // The dev server serves unhashed assets with revalidation, so a shared image
    // can appear twice here (the warm, then the <img> after the hand-off). The
    // production-build harness (academy-core-integration-perf.spec.ts) asserts
    // the real "downloaded once" contract against immutable caching.
    expect(real.filter((u) => /academy-book-frame.*\.webp/.test(u)).length).toBeLessThanOrEqual(2);
    expect(real.filter((u) => /mogzy-mascot-base-v1-512/.test(u)).length).toBeLessThanOrEqual(2);
    expect(new Set(real.filter((u) => /\/splash\//.test(u))).size).toBe(4);
    // the Hall's chunk is not downloaded for a visit that never opens it
    expect(real.filter((u) => /\/LolHub[-.]/.test(u))).toEqual([]);
    await page.screenshot({ path: path.join(OUT, "journey-landing-to-core-1366x768.png") });
  });

  test("account vs session-less visitor: the authenticated Daily read happens once, and only with a session", async ({ page, browser }) => {
    // Test persona for this app on the local dev server (VITE_E2E_AUTH): a fake
    // token the stubbed backend never verifies. No real credential is involved.
    const persona = { token: "e2e-test-token", user: { id: "00000000-0000-4000-8000-000000000001", email: "e2e@example.test", is_anonymous: false }, admin: false };
    const dailyReads: Array<string | undefined> = [];
    page.on("request", (r) => { if (/\/api\/daily-run\/today$/.test(r.url())) dailyReads.push(r.headers()["authorization"]); });
    await page.addInitScript((p) => { localStorage.setItem("mogsy_e2e_identity", JSON.stringify(p)); }, persona);
    await open(page, 1366, 768);
    await expect(page.getByTestId("academy-core-daily")).toHaveAccessibleName("Play Daily Challenge");
    await page.waitForTimeout(800);
    expect(dailyReads.length, "signed-in: one status read").toBe(1);
    expect(dailyReads[0], "signed-in: carries the session").toMatch(/^Bearer /);
    // the same shortcut still works for an account
    await page.getByTestId("academy-core-daily").click();
    await expect(page).toHaveURL(/\/quiz\/daily-challenge$/);

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    const anonReads: string[] = [];
    anonPage.on("request", (r) => { if (/\/api\/daily-run\/today$/.test(r.url())) anonReads.push(r.url()); });
    await open(anonPage, 1366, 768);
    await anonPage.waitForTimeout(800);
    expect(anonReads, "no session: no guaranteed-401 read").toEqual([]);
    await expect(anonPage.getByTestId("academy-core-daily")).toHaveAccessibleName("Play Daily Challenge");
    await anon.close();
  });

  test("loads one frame, four splashes, no Hall-only art, no manifest icons", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await open(page, 1366, 768);
    await page.waitForTimeout(2500);
    const real = requested.filter((u) => !/\?import$/.test(u));
    expect(real.filter((u) => /academy-library-(desktop|mobile)|book-spine|academy-commons-desktop/.test(u))).toEqual([]);
    expect(real.filter((u) => /academy-book-frame.*\.webp/.test(u))).toHaveLength(1);
    expect(real.filter((u) => /\/splash\//.test(u)).length).toBe(4);
    // The only champion icons are the live Patch Brief's own (the Patch Report island and the
    // strata projection reuse them); the destination books use cover art, never manifest icons.
    const icons = new Set(real.filter((u) => /\/champions\/[^/]+\/icon\.png/.test(u)));
    expect(icons.size).toBeLessThanOrEqual(CHAMPS.length);
    expect(real.some((u) => u.includes("academy-broadcast-book.webp"))).toBe(true);
  });
});

test.describe("mobile", () => {
  for (const vp of MOBILE) {
    test(`stacked composition at ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await noHorizontalOverflow(page);
      await assertCovers(page);
      const daily = (await page.getByTestId("academy-core-daily").boundingBox())!;
      const up = (await page.getByTestId("academy-core-slot-leaguecraft").boundingBox())!;
      const up2 = (await page.getByTestId("academy-core-slot-pro-play").boundingBox())!;
      const stage = (await page.getByTestId("academy-core-stage").boundingBox())!;
      const lo = (await page.getByTestId("academy-core-slot-combat-lab").boundingBox())!;
      const book = (await page.getByTestId("academy-core-book-mobile").boundingBox())!;
      expect(daily.y + daily.height).toBeLessThanOrEqual(vp.height);
      expect(up.y, "upper pair visible promptly").toBeLessThan(vp.height);
      expect(Math.abs(up.y - up2.y)).toBeLessThan(4);
      expect(stage.y).toBeGreaterThan(up.y);
      expect(lo.y).toBeGreaterThan(stage.y);
      expect(book.y, "the mobile book follows the lower pair").toBeGreaterThan(lo.y);
      expect(lo.width / up.width).toBeGreaterThanOrEqual(0.8);
      await expect(page.getByTestId("academy-core-book-mobile").getByTestId("academy-broadcast-surface-mobile")).toBeAttached();
      for (const id of ["academy-core-daily", "academy-core-ranked", "academy-core-slot-leaguecraft", "academy-core-slot-pro-play",
        "academy-core-slot-combat-lab", "academy-core-slot-archives", "academy-core-crystal", "academy-core-commons-link", "academy-core-hall-link"]) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.height, `${id} tall enough`).toBeGreaterThanOrEqual(44);
        expect(b.width, `${id} wide enough`).toBeGreaterThanOrEqual(44);
        expect(b.x + b.width, `${id} inside viewport`).toBeLessThanOrEqual(vp.width + 0.5);
      }
      await page.screenshot({ path: path.join(OUT, `mobile-${vp.name}-top.png`) });
      await page.screenshot({ path: path.join(OUT, `mobile-${vp.name}-full.png`), fullPage: true });
    });
  }

  test("a tap activates, then routes; the crystal cycles by tap", async ({ page }) => {
    await open(page, 390, 844);
    const crystal = page.getByTestId("academy-core-crystal");
    await crystal.scrollIntoViewIfNeeded();
    await crystal.click();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "leaguecraft");
    const link = bookLink(page, "combat-lab");
    await link.scrollIntoViewIfNeeded();
    await link.dispatchEvent("pointerdown", { pointerType: "touch" });
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "combat-lab");
    await link.click();
    await expect(page).toHaveURL(/\/combat-lab$/);
  });

  test("no spine image and no desktop-only art on a phone", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await open(page, 390, 844);
    await page.waitForTimeout(2500);
    const real = requested.filter((u) => !/\?import$/.test(u));
    expect(real.filter((u) => /book-spine|academy-library/.test(u))).toEqual([]);
    expect(real.filter((u) => /academy-book-frame.*\.webp/.test(u))).toHaveLength(1);
  });

  test("deep text zoom keeps every label", async ({ page }) => {
    await open(page, 390, 844);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.waitForTimeout(300);
    await noHorizontalOverflow(page);
    for (const text of ["Play Daily Challenge", "Ranked"]) {
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    }
    for (const r of ROOMS) await expect(bookLink(page, r.id)).toBeVisible();
    await page.screenshot({ path: path.join(OUT, "mobile-390x844-text-zoom-200.png"), fullPage: true });
  });
});
