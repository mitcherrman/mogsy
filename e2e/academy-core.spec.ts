/**
 * The production home, /lol — browser inspection of its contracts.
 *
 * `/lol` is Academy Core V3.5, the Living Hextech Orrery (it replaced the V3
 * Four-Book Core). This spec keeps the home's contracts from V3 — routes,
 * one-click activation, modified clicks, rapid clicks, reduced motion, the
 * crystal readout, Daily / Ranked / Patch links, the preview redirects, the
 * Hall and its Commons, the Landing hand-off, the account-only Daily read,
 * silence before a gesture and when muted, what art loads — against the new
 * presentation. The Orrery's own scene (orbit, drag, selector, projections,
 * quality tiers) is measured in e2e/academy-core-v35.spec.ts.
 *
 * Runs against the frontend-only config (playwright.frontend.config.ts):
 *   npx playwright test -c playwright.frontend.config.ts e2e/academy-core.spec.ts
 *
 * MOCKS (disclosed): the remote reads the page makes — Patch Reports list +
 * detail, the champion manifest, the Daily status, Supabase app settings —
 * are intercepted with deterministic bodies so captures are stable and no
 * production service is touched. Every manifest splash / icon is served as
 * one real 128 px champion icon from the repo. Everything else is the real app.
 *
 * The books orbit, so they are aimed by their current position: a pointer
 * resting on a book holds the orbit (by design), then the press lands on it.
 * (A locator click would wait for an orbiting book to stop moving.)
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROUTE = "/lol";
/** The home's root: the Living Hextech Orrery (Academy Core V3.5). */
const HOME = "academy-core-v35";
// Run captures go to the (untracked) test output, never over committed evidence.
const OUT = path.resolve("test-results/academy-core-home");
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
/** The crystal projections' manifest icons: Leaguecraft's Lux and the Pro Play 5 v 5 lineup. */
const PROJECTION_CHAMPS = ["Lux", "Gnar", "Lee Sin", "Azir", "Jinx", "Thresh", "K'Sante", "Vi", "Orianna", "Kai'Sa", "Nautilus"];

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
      body: JSON.stringify({ ok: true, champions: Object.fromEntries([...new Set([...CHAMPS, ...PROJECTION_CHAMPS])].map((n) => [n, {
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
  await expect(page.getByTestId(HOME)).toBeVisible();
  await expect(page.getByTestId("academy-core-daily")).toBeVisible();
  // ACADEMY STARTUP RC2: the direct-visit startup veil lifts first (cap 1.8 s after mount).
  await expect(page.getByTestId("academy-veil")).toHaveCount(0);
  // Fonts, the covers and the first spring settle.
  await page.waitForTimeout(1400);
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "horizontal overflow (px)").toBeLessThanOrEqual(0);
}

const bookLink = (page: Page, id: string) => page.getByTestId(`academy-core-slot-${id}`).getByRole("link");

/** Rest the pointer on a book where it is now; the resting pointer holds the orbit and focuses the book. */
async function aimBook(page: Page, id: string) {
  const b = (await page.getByTestId(`academy-core-slot-${id}`).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height * 0.4;
  await page.mouse.move(x, y, { steps: 6 });
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", id);
  // aim again where it settled (it may have drifted a little while the pointer travelled)
  const c = (await page.getByTestId(`academy-core-slot-${id}`).boundingBox())!;
  const at = { x: c.x + c.width / 2, y: c.y + c.height * 0.4 };
  await page.mouse.move(at.x, at.y);
  return at;
}
/** One plain press on a book (a real pointer click where the book is). */
async function pressBook(page: Page, id: string) {
  const at = await aimBook(page, id);
  await page.mouse.down();
  await page.mouse.up();
  return at;
}

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

  test("hover focuses a book, projects its room in the crystal and moves Mogzy", async ({ page }) => {
    await open(page, 1366, 768);
    const stage = page.getByTestId("academy-core-stage");
    const mogzy = page.getByTestId("academy-core-mogzy");
    await expect(stage).toHaveAttribute("data-focus", "idle");
    await expect(page.getByTestId("academy-core-v35-lux-portrait")).toHaveCount(1, { timeout: 8000 });
    for (const [id, pose] of [["leaguecraft", "holdingBook"], ["pro-play", "peeking"], ["combat-lab", "raisingHand"], ["archives", "explaining"]] as const) {
      await aimBook(page, id);
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
    await aimBook(page, "combat-lab");
    // Record the activation window inside the page: polling for a 240 ms
    // attribute from the test process is racy on a loaded machine.
    await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="academy-core-stage"]')!;
      const rec = { on: null as number | null, nav: null as number | null };
      (window as unknown as { __act: typeof rec }).__act = rec;
      new MutationObserver(() => {
        if (rec.on === null && stage.getAttribute("data-activating") === "combat-lab") rec.on = performance.now();
      }).observe(stage, { attributes: true, attributeFilter: ["data-activating"] });
      const push = history.pushState.bind(history);
      history.pushState = (...a: Parameters<History["pushState"]>) => { rec.nav = performance.now(); return push(...a); };
    });
    await page.mouse.down();
    await page.mouse.up();
    await page.screenshot({ path: path.join(OUT, "desktop-1366x768-activation-combat.png") }).catch(() => {});
    await page.waitForURL(/\/combat-lab$/);
    const act = await page.evaluate(() => (window as unknown as { __act: { on: number | null; nav: number | null } }).__act);
    expect(act.on, "the stage entered its activating state").not.toBeNull();
    expect(act.nav, "navigation happened").not.toBeNull();
    const activation = act.nav! - act.on!;
    expect(activation, "activation beat before navigating (ms)").toBeGreaterThanOrEqual(200);
    expect(activation, "activation beat before navigating (ms)").toBeLessThanOrEqual(350);
    await page.goBack();
    await expect(page.getByTestId(HOME)).toBeVisible();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "");
  });

  test("rapid clicks route once; a modified click is the browser's; Enter routes", async ({ page }) => {
    await open(page, 1366, 768);
    // rapid: a second press during the activation changes nothing
    await pressBook(page, "archives");
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForURL(/\/lol\/docs$/);
    expect(await page.evaluate(() => history.length), "one navigation for two presses").toBeLessThanOrEqual(3);
    await page.goBack();
    await expect(page.getByTestId(HOME)).toBeVisible();
    await page.mouse.move(10, 400);
    const popup = page.context().waitForEvent("page", { timeout: 5000 }).catch(() => null);
    const at = await aimBook(page, "pro-play");
    await page.keyboard.down("Control");
    await page.mouse.click(at.x, at.y);
    await page.keyboard.up("Control");
    const newPage = await popup;
    expect(newPage, "ctrl-click opened a new page").not.toBeNull();
    await expect(page).toHaveURL(/\/lol$/);
    await newPage?.close();
    await page.mouse.move(10, 400);
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

  test("Daily, the book's own link and the alias behave as before; no Ranked shortcut", async ({ page }) => {
    await open(page, 1366, 768);
    await expect(page.getByTestId("academy-core-ranked")).toHaveCount(0);
    await expect(page.getByTestId("academy-core-daily")).toBeVisible();
    await page.getByTestId("academy-core-daily").click();
    await expect(page).toHaveURL(/\/quiz\/daily-challenge$/);
    await page.goBack();
    await expect(page.getByTestId("academy-core-book")).toBeVisible();
    await page.getByTestId("academy-core-book").getByRole("link", { name: /Read full report/i }).click();
    await expect(page).toHaveURL(/\/lol\/patch-reports\?patch=26\.20$/);
  });

  test("the preview URLs redirect to the home", async ({ context }) => {
    // One fresh page per URL: Firefox against the Vite dev server reports a
    // goto issued from a page whose app then redirects as NS_BINDING_ABORTED.
    // (The production build does not: verified separately in Firefox.)
    for (const from of ["/dev/academy-core", "/lol/dev/academy-core"]) {
      const page = await context.newPage();
      await stubRemote(page);
      await page.goto(from, { waitUntil: "commit" });
      await expect(page).toHaveURL(/\/lol$/);
      await expect(page.getByTestId(HOME)).toBeVisible();
      await page.close();
    }
  });

  test("legacy /lol#academy-commons is forwarded to the Hall's Commons", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubRemote(page);
    await page.goto("/lol#academy-commons");
    await expect(page).toHaveURL(/\/lol\/hall#academy-commons$/);
    await expect(page.getByTestId(HOME)).toHaveCount(0);
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
    await expect(page.getByTestId(HOME)).toBeVisible();
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
    await expect(page.getByTestId(HOME)).toBeVisible();
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

  test("audio: no sound before a gesture, and none at all when muted", async ({ page, browser }) => {
    // Count every sound the Web Audio graph is asked to start.
    const COUNT = `(() => {
      window.__starts = 0;
      for (const name of ["OscillatorNode", "AudioBufferSourceNode"]) {
        const proto = window[name] && window[name].prototype;
        if (!proto || !proto.start) continue;
        const orig = proto.start;
        proto.start = function (...a) { window.__starts += 1; return orig.apply(this, a); };
      }
    })();`;
    const starts = (p: Page) => p.evaluate(() => (window as unknown as { __starts: number }).__starts);

    // 1. unmuted, nobody has touched the page: arrival must be silent.
    await page.addInitScript(COUNT);
    await open(page, 1366, 768);
    await page.waitForTimeout(2500);
    expect(await starts(page), "no playback before a user gesture").toBe(0);

    // 2. muted (the app's own mute key), then every interaction: still silent.
    const muted = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const mp = await muted.newPage();
    await mp.addInitScript(COUNT);
    await mp.addInitScript(() => { localStorage.setItem("mogsy-sounds-muted", "1"); });
    await open(mp, 1366, 768);
    await mp.getByTestId("academy-core-crystal").click();
    await aimBook(mp, "pro-play");
    await mp.waitForTimeout(400);
    await aimBook(mp, "combat-lab");
    await mp.waitForTimeout(400);
    expect(await starts(mp), "muted: hover, crystal and focus cues make no sound").toBe(0);
    await pressBook(mp, "archives");
    await mp.waitForURL(/\/lol\/docs$/);
    expect(await starts(mp), "muted: the book-open cue makes no sound").toBe(0);
    await muted.close();
  });

  test("loads one frame, four splashes, no Hall-only art, and only the expected manifest icons", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await open(page, 1366, 768);
    await page.waitForTimeout(2500);
    const real = requested.filter((u) => !/\?import$/.test(u));
    expect(real.filter((u) => /academy-library-(desktop|mobile)|book-spine|academy-commons-desktop/.test(u))).toEqual([]);
    expect(real.filter((u) => /academy-book-frame.*\.webp/.test(u))).toHaveLength(1);
    expect(real.filter((u) => /\/splash\//.test(u)).length).toBe(4);
    // Champion icons come only from the live Patch Brief (the Patch Report island and the
    // Archives projection reuse them) and the two crystal projections (Leaguecraft's Lux,
    // the Pro Play lineup); the destination books use cover art, never manifest icons.
    const allowed = new Set([...CHAMPS, ...PROJECTION_CHAMPS].map((n) => `/champions/${n}/icon.png`));
    const icons = [...new Set(real.filter((u) => /\/champions\/[^/]+\/icon\.png/.test(u)).map((u) => decodeURIComponent(new URL(u).pathname).replace(/^.*(\/champions\/)/, "$1")))];
    for (const icon of icons) expect(allowed.has(icon), icon).toBe(true);
    expect(icons.some((u) => u.includes("/Lux/")), "the Lux projection's icon").toBe(true);
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
      // the phone arrangement: an upper tier, the Core, a lower tier (the stage holds all three)
      const core = (await page.locator(".acore-crystal").boundingBox())!;
      const lo = (await page.getByTestId("academy-core-slot-combat-lab").boundingBox())!;
      const book = (await page.getByTestId("academy-core-book-mobile").boundingBox())!;
      expect(daily.y + daily.height).toBeLessThanOrEqual(vp.height);
      expect(up.y, "upper pair visible promptly").toBeLessThan(vp.height);
      expect(up2.y, "upper tier visible promptly").toBeLessThan(vp.height);
      expect(core.y, "the Core below the upper tier").toBeGreaterThan(up.y);
      expect(lo.y, "the lower tier below the Core").toBeGreaterThan(core.y);
      expect(book.y, "the mobile book follows the lower pair").toBeGreaterThan(lo.y);
      expect(lo.width / up.width).toBeGreaterThanOrEqual(0.8);
      await expect(page.getByTestId("academy-core-book-mobile").getByTestId("academy-broadcast-surface-mobile")).toBeAttached();
      await expect(page.getByTestId("academy-core-ranked")).toHaveCount(0);
      for (const id of ["academy-core-daily", "academy-core-slot-leaguecraft", "academy-core-slot-pro-play",
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

  test("a tap focuses, then routes; the crystal cycles by tap", async ({ page }) => {
    await open(page, 390, 844);
    // the phone scene levitates gently, so scroll and tap by position (actionability waits for stillness)
    const tap = async (sel: string) => {
      await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(250);
      const b = (await page.locator(sel).first().boundingBox())!;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    };
    await tap('[data-testid="academy-core-crystal"]');
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "leaguecraft");
    const link = bookLink(page, "combat-lab");
    await link.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(250);
    await link.dispatchEvent("pointerdown", { pointerType: "touch" });
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "combat-lab");
    // the phone books levitate a little: tap where the book is
    const b = (await link.boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.4);
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
    await expect(page.getByRole("link", { name: "Play Daily Challenge" })).toBeVisible();
    await expect(page.getByText("Ranked", { exact: true })).toHaveCount(0);
    for (const r of ROOMS) await expect(bookLink(page, r.id)).toBeVisible();
    await page.screenshot({ path: path.join(OUT, "mobile-390x844-text-zoom-200.png"), fullPage: true });
  });
});
