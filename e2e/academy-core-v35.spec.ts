/**
 * Academy Core V3.5 — real-browser inspection of the Living Hextech Orrery.
 *
 *   npx playwright test -c playwright.frontend.config.ts e2e/academy-core-v35.spec.ts
 *   V35_EVIDENCE=1 npx playwright test -c playwright.frontend.config.ts e2e/academy-core-v35.spec.ts -g evidence
 *
 * The Orrery is the production `/lol` home (it replaced the V3 Core); the old
 * preview URL `/lol/dev/academy-core-v35` redirects there. This runs against
 * the Vite dev server the config starts.
 *
 * MOCKS (disclosed): in the behaviour suite the remote reads (Patch Reports,
 * champion manifest and images, Daily status, Supabase) are intercepted with
 * deterministic bodies, as in the V3 spec; every manifest image is one real
 * 128 px champion icon, so covers draw a picture but not the real splash.
 * The `evidence` suite (opt-in) does NOT stub the champion manifest or images:
 * it loads the real splash art from the asset host so the captures show what
 * the owner will see, and it records the motion demonstration.
 *
 * The brief's central warning is honoured here: orbital animation is verified
 * by MEASURING the books' positions over time, never by a still.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROUTE = "/lol";
const OUT = path.resolve("docs/handoffs/academy-core-v35");
mkdirSync(OUT, { recursive: true });

// Evidence runs may pick a GPU-composited browser: Playwright's bundled headless
// Chromium renders this scene at ~8 fps while recording on this machine (Edge:
// ~70 fps), which slows the motion (the engine caps a frame step at 50 ms) and
// makes it choppy. e.g. V35_EVIDENCE_CHANNEL=msedge.
if (process.env.V35_EVIDENCE_CHANNEL) test.use({ channel: process.env.V35_EVIDENCE_CHANNEL });

const IDS = ["leaguecraft", "pro-play", "combat-lab", "archives"] as const;
type Id = (typeof IDS)[number];
const ROOMS: Record<Id, { title: string; href: string }> = {
  leaguecraft: { title: "Leaguecraft", href: "/quiz" },
  "pro-play": { title: "Pro Play", href: "/lol/pro-play" },
  "combat-lab": { title: "Combat Simulation", href: "/combat-lab" },
  archives: { title: "Mogzy Archives", href: "/lol/docs" },
};

const ICON_PNG = readFileSync(path.resolve("public/images/library/champion-ahri.png"));
const CHAMPS = ["Ryze", "Ahri", "Akali", "Viktor", "Jinx", "Yasuo"];
/** The Pro Play crystal's 5 v 5 lineup (orrery-projections-data.ts), so the stub manifest can name them. */
const LINEUP = ["Gnar", "Lee Sin", "Azir", "Thresh", "K'Sante", "Vi", "Orianna", "Kai'Sa", "Nautilus", "Lux"];

async function stubCommon(page: Page) {
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

async function stubChampions(page: Page) {
  await page.route("**/api/assets/champions", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, champions: Object.fromEntries([...CHAMPS, ...LINEUP].map((n) => [n, {
        icon: `assets/champions/${n}/icon.png`, splash: `assets/champions/${n}/splash/0_default.jpg`, loading: "", cutout: "",
      }])) }),
    }));
  await page.route("**/assets/champions/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: ICON_PNG }));
}

async function open(page: Page, width: number, height: number, opts: { real?: boolean } = {}) {
  await page.setViewportSize({ width, height });
  await stubCommon(page);
  if (!opts.real) await stubChampions(page);
  await page.goto(ROUTE);
  await expect(page.getByTestId("academy-core-v35")).toBeVisible();
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("academy-core-daily")).toBeVisible();
  // ACADEMY STARTUP RC2: a direct visit holds the startup veil until the first
  // screen is ready (cap 1.8 s after mount); coordinate clicks need it gone.
  await expect(page.getByTestId("academy-veil")).toHaveCount(0);
  if (opts.real) {
    // the real splash art comes from the asset host: wait for every cover to draw
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>("img[src*='/splash/']")];
      return imgs.length >= 4 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    }, undefined, { timeout: 60_000 }).catch(() => {});
  }
  await page.waitForTimeout(1400);
}

interface Box { x: number; y: number; w: number; h: number; cx: number; cy: number }
async function boxes(page: Page): Promise<Record<Id, Box>> {
  return page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
    const r = document.querySelector(`.o35-book[data-bay="${id}"]`)!.getBoundingClientRect();
    return [id, { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }];
  })), IDS as unknown as string[]) as Promise<Record<Id, Box>>;
}
const dist = (a: Box, b: Box) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "horizontal overflow (px)").toBeLessThanOrEqual(0);
}
const bookLink = (page: Page, id: Id) => page.getByTestId(`academy-core-slot-${id}`).getByRole("link");
const focusOf = (page: Page) => page.getByTestId("academy-core-stage").getAttribute("data-focus");
const stageAttr = (page: Page, name: string) => page.getByTestId("academy-core-stage").getAttribute(name);

/** A point on book `id` that really hits it now (it may be moving), or null. */
async function pointOn(page: Page, id: Id) {
  return page.evaluate((id2) => {
    const b = document.querySelector<HTMLElement>(`.o35-book[data-bay="${id2}"]`)!;
    const r = b.getBoundingClientRect();
    for (const fx of [0.5, 0.35, 0.65]) {
      for (const fy of [0.45, 0.3, 0.6, 0.2, 0.75]) {
        const x = r.x + r.width * fx;
        const y = r.y + r.height * fy;
        if (document.elementFromPoint(x, y)?.closest(".o35-book") === b) return { x, y };
      }
    }
    return null;
  }, id);
}
/** Reach for book `id` where it is NOW and rest the pointer there; resolves once it is the pointer's book. */
async function reachBook(page: Page, id: Id) {
  for (let i = 0; i < 40; i++) {
    const pt = await pointOn(page, id);
    if (pt) {
      await page.mouse.move(pt.x, pt.y, { steps: 3 });
      if ((await focusOf(page)) === id) return pt;
    }
    await page.waitForTimeout(150);
  }
  throw new Error(`${id} never came under a free point`);
}
/** Wait until the hover holds `id` at the front (the turn finished). */
async function heldAt(page: Page, id: Id) {
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", id, { timeout: 5000 });
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-spin", "held", { timeout: 15_000 });
}
/** Book `id` is front-centre: the lowest book on screen, centred under the Core. */
async function isFrontCentre(page: Page, id: Id) {
  const b = await boxes(page);
  const core = (await page.locator(".o35-instrument").boundingBox())!;
  const lowest = IDS.reduce((best, k) => (b[k].cy > b[best].cy ? k : best), IDS[0]);
  return lowest === id && Math.abs(b[id].cx - (core.x + core.width / 2)) < 8;
}

/* ===================================================================== */

test.describe("desktop: composition", () => {
  for (const vp of [{ name: "1366x768", width: 1366, height: 768 }, { name: "1920x1080", width: 1920, height: 1080 }]) {
    test(`open space, large Core, four real covers, floating Patch Report at ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await noHorizontalOverflow(page);
      for (const id of IDS) {
        const link = bookLink(page, id);
        await expect(link).toHaveAttribute("aria-label", ROOMS[id].title);
        await expect(link).toHaveAttribute("href", ROOMS[id].href);
        await expect(link.locator("img[src*='academy-book-frame']")).toHaveCount(1);
      }
      // none of the V3 machinery
      for (const sel of [".acore-chassis", ".acore-cradle", ".acore-room-bench", ".acore-books-mounted"]) {
        await expect(page.locator(sel)).toHaveCount(0);
      }
      // the Core is the focal point: bigger than the V3 dial, bigger than any book
      const inst = (await page.locator(".o35-instrument").boundingBox())!;
      const b = await boxes(page);
      expect(inst.width, "instrument width").toBeGreaterThanOrEqual(vp.width >= 1900 ? 560 : 380);
      for (const id of IDS) expect(inst.width, `Core wider than ${id}`).toBeGreaterThan(b[id].w * 1.6);
      // everything on the first screen
      for (const id of IDS) {
        expect(b[id].x, `${id} not clipped left`).toBeGreaterThanOrEqual(0);
        expect(b[id].x + b[id].w, `${id} not clipped right`).toBeLessThanOrEqual(vp.width);
        expect(b[id].y + b[id].h, `${id} on the first screen`).toBeLessThanOrEqual(vp.height + 1);
      }
      const patch = (await page.getByTestId("academy-core-book").boundingBox())!;
      expect(patch.width).toBeGreaterThanOrEqual(272);
      await expect(page.getByTestId("academy-core-book").getByText("Patch 26.20")).toBeVisible();
      await expect(page.getByTestId("academy-core-book").getByTestId("academy-radio-dock")).toBeVisible();
      // the Patch Report is levitating (a running animation, not a static panel)
      const lev = await page.locator(".o35-patch-float").evaluate((el) => getComputedStyle(el).animationName);
      expect(lev).toContain("o35-patch-lev");
      await page.screenshot({ path: path.join("test-results", `behaviour-desktop-${vp.name}.png`) });
    });
  }

  test("short desktop (1280x660): nothing clipped, nothing overlapping the brand column", async ({ page }) => {
    await open(page, 1280, 660);
    await noHorizontalOverflow(page);
    const patch = (await page.getByTestId("academy-core-book").boundingBox())!;
    const b = await boxes(page);
    for (const id of IDS) expect(b[id].x, `${id} clear of the Patch Report`).toBeGreaterThanOrEqual(patch.x + patch.width - 2);
  });
});

test.describe("desktop: the books genuinely orbit", () => {
  test("every book travels hundreds of px in 9 s, changes size with depth, and the books pass each other", async ({ page }) => {
    await open(page, 1366, 768);
    const samples: Record<Id, Box>[] = [];
    const orderOf = (s: Record<Id, Box>) => [...IDS].sort((a, b) => s[a].cx - s[b].cx).join(">");
    for (let i = 0; i < 7; i++) { samples.push(await boxes(page)); await page.waitForTimeout(1500); }
    // the books pass each other somewhere on the orbit: keep watching (up to ~35 s) until they have
    while (new Set(samples.map(orderOf)).size < 2 && samples.length < 24) { samples.push(await boxes(page)); await page.waitForTimeout(1500); }
    let total = 0;
    for (const id of IDS) {
      let path = 0;
      for (let i = 1; i < samples.length; i++) path += dist(samples[i][id], samples[i - 1][id]);
      total += path;
      // a book near the orbit's left / right extreme moves mostly in depth, so the floor is per-book modest ...
      expect(path, `${id} travelled`).toBeGreaterThan(60);
    }
    // ... while the four together sweep a long way
    // (about 1,300 px on an idle machine; the loop slows with the frame rate, so the floor leaves room for a busy CI box)
    expect(total, "total distance travelled by the four books").toBeGreaterThan(450);
    // depth: over ~9 s (65 degrees of the orbit) at least two books visibly change size
    const grew = IDS.filter((id) => {
      const widths = samples.map((s) => s[id].w);
      return Math.max(...widths) / Math.min(...widths) > 1.05;
    });
    expect(grew.length, "books whose apparent size changed with depth").toBeGreaterThanOrEqual(2);
    // the horizontal order of the four books changes at least once
    const orders = samples.map((s) => [...IDS].sort((a, b) => s[a].cx - s[b].cx).join(">"));
    expect(new Set(orders).size, "left-to-right order changes").toBeGreaterThan(1);
    // books stay upright: the wrapper's transform has no roll component (matrix(…) b≈0 for the 2D part)
    const upright = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".o35-book")].every((el) => !/rotate\(|rotateZ/.test(el.style.transform)));
    expect(upright).toBe(true);
  });

  test("near books are drawn in front of the Core, far books behind it", async ({ page }) => {
    await open(page, 1366, 768);
    const z = await page.evaluate(() => ({
      core: Number(getComputedStyle(document.querySelector(".o35-core")!).zIndex),
      books: [...document.querySelectorAll<HTMLElement>(".o35-book")].map((b) => ({ depth: b.dataset.depth, z: Number(b.style.zIndex) })),
    }));
    for (const b of z.books) {
      if (b.depth === "near") expect(b.z).toBeGreaterThan(z.core);
      else expect(b.z).toBeLessThan(z.core);
    }
    expect(z.books.some((b) => b.depth === "near") && z.books.some((b) => b.depth === "far")).toBe(true);
  });

  test("each book levitates on its own rhythm (independent of the orbit)", async ({ page }) => {
    await open(page, 1366, 768);
    const t = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".o35-lev")].map((el) => {
      const cs = getComputedStyle(el);
      return { dur: cs.animationDuration, delay: cs.animationDelay, name: cs.animationName, tr: cs.translate };
    }));
    expect(new Set(t.map((x) => x.dur)).size).toBe(4);
    expect(new Set(t.map((x) => x.tr)).size).toBeGreaterThan(1);
    for (const x of t) expect(x.name).toContain("o35-bob");
  });

  test("the environment and the Core are alive at rest (compositor animations running)", async ({ page }) => {
    await open(page, 1366, 768);
    const running = await page.evaluate(() => {
      const names = (sel: string) => [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).animationName);
      return {
        gyro: names(".o35-gyro-ring"), rings: names(".o35-ring"), comets: names(".o35-comet"),
        halo: names(".o35-core-halo"), frags: names(".o35-frag"), shafts: names(".o35-shaft"),
        anims: document.getAnimations().length,
      };
    });
    for (const k of ["gyro", "rings", "comets", "halo", "frags", "shafts"] as const) {
      expect(running[k].length, k).toBeGreaterThan(0);
      for (const n of running[k]) expect(n, k).not.toBe("none");
    }
    expect(running.anims).toBeGreaterThan(30);
  });
});

test.describe("desktop: interaction", () => {
  test("hover selects the book: emphasised at once, the whole orbit brings it front-centre and holds it; the others support it; the crystal projects its room", async ({ page }) => {
    // Verify each independently in a free-running orbit: after a selection the
    // previous book remains held and can occlude a different book behind the Core.
    for (const id of ["combat-lab", "leaguecraft"] as const) {
      await open(page, 1366, 768);
      await reachBook(page, id);
      await heldAt(page, id);
      expect(await isFrontCentre(page, id), `${id} front-centre`).toBe(true);
      const a = (await boxes(page))[id];
      await page.waitForTimeout(1500);
      expect(dist(a, (await boxes(page))[id]), `${id} holds still`).toBeLessThan(1.5);
      // the others are supporting; its tether is lit; the crystal projects its room
      for (const other of IDS.filter((o) => o !== id)) {
        const op = await page.getByTestId(`academy-core-slot-${other}`).evaluate((el) => Number(getComputedStyle(el).opacity));
        expect(op, `${other} supporting`).toBeLessThan(0.8);
      }
      await expect(page.locator(`.o35-tether[data-bay="${id}"]`)).toHaveAttribute("data-on", "true");
      const mode = id === "combat-lab" ? ".acore-mode-combat" : ".acore-mode-leaguecraft";
      await expect.poll(() => page.locator(mode).evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 3000 }).toBeGreaterThan(0.9);
      // really leaving ends the hover; the selection stays at the front
      await page.mouse.move(40, 300, { steps: 4 });
      await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "");
      await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "preview");
      expect(await focusOf(page)).toBe(id);
      await page.waitForTimeout(400);
    }
  });

  test("while a hovered book is held the orbit stays still, also after leaving; a press on open space lets it resume", async ({ page }) => {
    await open(page, 1366, 768);
    const travel = async (ms: number, other: Id) => {
      const a = (await boxes(page))[other];
      await page.waitForTimeout(ms);
      return dist(a, (await boxes(page))[other]);
    };
    const free = await travel(1500, "archives");
    await reachBook(page, "pro-play");
    await heldAt(page, "pro-play");
    expect(await travel(1500, "archives")).toBeLessThan(1.5);
    await page.mouse.move(40, 300, { steps: 4 });
    await page.waitForTimeout(800);
    expect(await travel(1500, "archives")).toBeLessThan(1.5);
    // an intentional press on open space (far left of the stage, below the orbit) releases it
    const stage = (await page.getByTestId("academy-core-stage").boundingBox())!;
    await page.mouse.click(stage.x + 30, stage.y + stage.height - 20);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-spin", /free|inertia|snapping|dwell/);
    await page.waitForTimeout(2600);
    expect(await travel(1500, "archives")).toBeGreaterThan(free * 0.3);
  });

  test("the crystal previews each room without navigating, and the chosen book comes toward the viewer", async ({ page }) => {
    await open(page, 1366, 768);
    const url = page.url();
    const crystal = page.getByTestId("academy-core-crystal");
    const core = (await page.locator(".o35-instrument").boundingBox())!;
    const seq = ["leaguecraft", "pro-play", "combat-lab", "archives", "idle"];
    for (const id of seq) {
      await crystal.click();
      await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", id);
      expect(page.url()).toBe(url);
      if (id === "idle") break;
      await page.waitForTimeout(1800);
      const b = (await boxes(page))[id as Id];
      const z = await page.locator(`.o35-book[data-bay="${id}"]`).evaluate((el) => Number(getComputedStyle(el).zIndex));
      expect(z, `${id} on top`).toBeGreaterThanOrEqual(60);
      // in front of the Core, below the crystal's centre, beside it (clear of the lens)
      expect(b.cy, `${id} below the crystal`).toBeGreaterThan(core.y + core.height / 2);
      expect(Math.abs(b.cx - (core.x + core.width / 2)), `${id} beside the crystal`).toBeGreaterThan(150);
      await expect(page.getByTestId("academy-core-preview")).toHaveText(`Previewing ${ROOMS[id as Id].title}`);
    }
    await expect(page.getByTestId("academy-core-preview")).toHaveText("No room previewed");
  });

  test("keyboard: Tab reaches each book, brings it forward with a visible focus ring; Enter activates", async ({ page }) => {
    await open(page, 1366, 768);
    await bookLink(page, "leaguecraft").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(bookLink(page, "leaguecraft")).toBeFocused();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "leaguecraft");
    await page.waitForTimeout(1600);
    const ring = await bookLink(page, "leaguecraft").locator(".group-focus-visible\\:ring-2").count();
    expect(ring).toBe(1);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", /pro-play|combat-lab|archives/);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/quiz$/);
  });

  test("one click: the approved 240 ms activation, then navigation (measured)", async ({ page }) => {
    await open(page, 1366, 768);
    // hover-to-front: the hovered book is turned to the front and held; click it there
    await reachBook(page, "combat-lab");
    await heldAt(page, "combat-lab");
    const at = (await pointOn(page, "combat-lab"))!;
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await expect.poll(() => focusOf(page)).toBe("combat-lab");
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
    await page.waitForURL(/\/combat-lab$/);
    const act = await page.evaluate(() => (window as unknown as { __act: { on: number | null; nav: number | null } }).__act);
    expect(act.on, "the stage entered its activating state").not.toBeNull();
    const dt = act.nav! - act.on!;
    expect(dt, `activation lasted ${dt.toFixed(0)} ms`).toBeGreaterThanOrEqual(200);
    expect(dt).toBeLessThanOrEqual(350);
  });

  test("modified clicks are the browser's own: no activation, no in-page navigation", async ({ page, context }) => {
    await open(page, 1366, 768);
    // the book is in motion, so aim by coordinates (a locator click waits for it to hold still)
    const b = (await boxes(page)).archives;
    const popup = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
    await page.keyboard.down("Control");
    await page.mouse.click(b.cx, b.cy + b.h * 0.1);
    await page.keyboard.up("Control");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "");
    expect(page.url()).toContain(ROUTE);
    const p = await popup;
    await p?.close();
  });

  test("Daily is a clear, working shortcut, and no Ranked shortcut is offered", async ({ page }) => {
    await open(page, 1366, 768);
    await expect(page.getByTestId("academy-core-daily")).toHaveAccessibleName("Play Daily Challenge");
    await expect(page.getByTestId("academy-core-ranked")).toHaveCount(0);
    await expect(page.getByTestId("academy-core-shortcuts")).not.toContainText(/ranked|coming soon/i);
    await page.getByTestId("academy-core-daily").click();
    await page.waitForURL(/\/quiz\/daily-challenge/);
  });

  test("every control is hit-testable: no decorative layer covers the shortcuts, links, crystal or Patch Report", async ({ page }) => {
    await open(page, 1366, 768);
    const covered = await page.evaluate(() => {
      const sels = ['[data-testid="academy-core-daily"]', '[data-testid="academy-core-commons-link"]',
        '[data-testid="academy-core-hall-link"]', '[data-testid="academy-core-crystal"]', '[data-testid="academy-core-book"] a', '[data-testid="academy-core-book"] button'];
      const out: string[] = [];
      for (const sel of sels) {
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5]]) {
            const hit = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy);
            if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) out.push(`${sel} covered by ${hit?.className}`);
          }
        }
      }
      return out;
    });
    expect(covered).toEqual([]);
  });

  test("hit targets: a near-side book's centre always hits that book", async ({ page }) => {
    await open(page, 1366, 768);
    for (let i = 0; i < 6; i++) {
      const bad = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".o35-book")]
        .filter((b) => b.dataset.depth === "near")
        .map((b) => {
          const r = b.getBoundingClientRect();
          const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height * 0.45);
          return el?.closest(".o35-book") === b ? null : `${b.dataset.bay} hit ${el?.className}`;
        }).filter(Boolean));
      expect(bad).toEqual([]);
      await page.waitForTimeout(1500);
    }
  });
});

test.describe("reduced motion", () => {
  test("a deliberate static composition: nothing orbits, loops or levitates, and navigation is immediate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 1366, 768);
    await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-reduced", "true");
    const a = await boxes(page);
    await page.waitForTimeout(2500);
    const b = await boxes(page);
    for (const id of IDS) expect(dist(a[id], b[id]), `${id} static`).toBeLessThan(0.5);
    const anims = await page.evaluate(() => document.getAnimations().filter((x) => x.playState === "running").length);
    expect(anims).toBe(0);
    // all four books are on screen and readable
    for (const id of IDS) await expect(bookLink(page, id)).toBeVisible();
    await page.screenshot({ path: path.join("test-results", "behaviour-desktop-reduced-motion.png") });
    const t0 = Date.now();
    await bookLink(page, "pro-play").click();
    await page.waitForURL(/\/lol\/pro-play$/);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

test.describe("mobile: a composed floating arrangement", () => {
  for (const vp of [{ name: "390x844", width: 390, height: 844 }, { name: "320x568", width: 320, height: 568 }, { name: "430x932", width: 430, height: 932 }]) {
    test(`no orbit, readable books, 44 px targets, floating Patch Report at ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await noHorizontalOverflow(page);
      await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-layout", "stacked");
      const a = await boxes(page);
      for (const id of IDS) {
        expect(a[id].w, `${id} width`).toBeGreaterThanOrEqual(100);
        expect(a[id].x, `${id} not clipped`).toBeGreaterThanOrEqual(0);
        expect(a[id].x + a[id].w, `${id} not clipped`).toBeLessThanOrEqual(vp.width);
      }
      // upper pair above the lower pair, no overlap among books
      expect(Math.max(a.leaguecraft.y + a.leaguecraft.h, a["pro-play"].y + a["pro-play"].h)).toBeLessThanOrEqual(Math.min(a["combat-lab"].y, a.archives.y) + 4);
      await page.waitForTimeout(2200);
      const b = await boxes(page);
      for (const id of IDS) expect(dist(a[id], b[id]), `${id} is not orbiting on a phone`).toBeLessThan(10); // levitation only
      const crystal = (await page.getByTestId("academy-core-crystal").boundingBox())!;
      expect(Math.min(crystal.width, crystal.height), "crystal target").toBeGreaterThanOrEqual(44);
      expect((await page.getByTestId("academy-core-daily").boundingBox())!.height, "daily").toBeGreaterThanOrEqual(44);
      await expect(page.getByTestId("academy-core-ranked"), "no Ranked shortcut on phones").toHaveCount(0);
      await page.getByTestId("academy-core-book-mobile").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("academy-core-book-mobile").getByText("Patch 26.20")).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join("test-results", `behaviour-mobile-${vp.name}.png`) });
    });
  }

  test("tap: a book activates then navigates; the crystal pins a preview", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await stubCommon(page);
    await stubChampions(page);
    await page.goto(ROUTE);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
    await page.getByTestId("academy-core-crystal").tap();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "leaguecraft");
    // the books levitate, so a locator tap would wait for them to hold still: tap the coordinates
    const ab = (await boxes(page)).archives;
    await page.touchscreen.tap(ab.cx, ab.cy + ab.h * 0.1);
    await page.waitForURL(/\/lol\/docs$/);
    await ctx.close();
  });
});

test.describe("the Orrery is the /lol home", () => {
  test("/lol is the Orrery (no V3 chassis), and the V3.5 preview URLs redirect to it", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubCommon(page);
    await stubChampions(page);
    await page.goto("/lol");
    await expect(page.getByTestId("academy-core-v35")).toBeVisible();
    await expect(page.locator(".acore-chassis")).toHaveCount(0);
    for (const from of ["/lol/dev/academy-core-v35", "/dev/academy-core-v35"]) {
      await page.goto(from);
      await expect(page).toHaveURL(/\/lol$/);
      await expect(page.getByTestId("academy-core-v35")).toBeVisible();
    }
  });
});

/* ===================================================================== */
/* EVIDENCE — opt-in (V35_EVIDENCE=1). Real art, real motion recording.   */
/* ===================================================================== */

/* ===================================================================== */
/* PHASE 2 — direct manipulation, focus choreography, quality tiers        */
/* ===================================================================== */

/** Left-to-right x of the four books, the same way every time. */
const xsOf = (b: Record<Id, Box>) => IDS.map((id) => Math.round(b[id].cx));

test.describe("phase 2: drag the orbit", () => {
  test("dragging empty space moves the books with the pointer; a fling coasts; the books settle symmetric, hold, then resume", async ({ page }) => {
    await open(page, 1366, 768);
    const start = await boxes(page);
    await page.mouse.move(640, 700);
    await page.mouse.down();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-dragging", "true");
    for (let i = 1; i <= 14; i++) { await page.mouse.move(640 + i * 36, 700); await page.waitForTimeout(16); }
    const dragged = await boxes(page);
    expect(xsOf(dragged)).not.toEqual(xsOf(start));
    await page.mouse.up();
    await expect(page.getByTestId("academy-core-stage")).not.toHaveAttribute("data-dragging");
    // park the pointer off the scene: a book that stops under a resting cursor holds the orbit (by design)
    await page.mouse.move(60, 420);
    // momentum: the books keep moving after release
    const a = await boxes(page);
    await page.waitForTimeout(350);
    const b = await boxes(page);
    expect(IDS.reduce((s, id) => s + dist(a[id], b[id]), 0), "movement after release").toBeGreaterThan(30);
    // settle: wait for the books to stop, then check the symmetric composition
    let prev = b;
    let stopped: Record<Id, Box> | null = null;
    for (let i = 0; i < 40 && !stopped; i++) {
      await page.waitForTimeout(250);
      const now = await boxes(page);
      if (IDS.every((id) => dist(now[id], prev[id]) < 1.5)) stopped = now;
      prev = now;
    }
    expect(stopped, "books come to rest").not.toBeNull();
    const xs = xsOf(stopped!).sort((p, q) => p - q);
    // two on the left, two on the right of the Core, mirrored about the stage centre
    expect(Math.abs(xs[0] + xs[3] - (xs[1] + xs[2])), "mirror symmetry of the resting composition").toBeLessThan(25);
    // after the pause the slow orbit resumes (wait on the engine's phase: headless frame rates vary a lot)
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-spin", "free", { timeout: 15_000 });
    const resumedAt = await boxes(page);
    await page.waitForTimeout(3000);
    const later = await boxes(page);
    expect(IDS.reduce((s, id) => s + dist(resumedAt[id], later[id]), 0), "orbit resumed").toBeGreaterThan(20);
  });

  test("a book is still one clean click after dragging; a drag never begins on a book", async ({ page }) => {
    await open(page, 1366, 768);
    await page.mouse.move(640, 700);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(640 + i * 30, 700);
    await page.mouse.up();
    // park the pointer off the books so nothing is hovered, let the fling settle
    await page.mouse.move(60, 420);
    let last = await boxes(page);
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      const now = await boxes(page);
      if (IDS.every((id) => dist(now[id], last[id]) < 1.5)) break;
      last = now;
    }
    // aim at a point that really hits a near-side book (far books may sit behind the dial)
    const target = await page.evaluate(() => {
      for (const b of document.querySelectorAll<HTMLElement>(".o35-book")) {
        if (b.dataset.depth !== "near") continue;
        const r = b.getBoundingClientRect();
        for (const f of [0.55, 0.65, 0.45, 0.75]) {
          const x = r.x + r.width / 2;
          const y = r.y + r.height * f;
          if (document.elementFromPoint(x, y)?.closest(".o35-book") === b) return { id: b.dataset.bay!, x, y };
        }
      }
      return null;
    });
    expect(target, "a clickable near-side book").not.toBeNull();
    await page.mouse.move(target!.x, target!.y, { steps: 4 });
    await page.mouse.down();
    await expect(page.getByTestId("academy-core-stage")).not.toHaveAttribute("data-dragging");
    await page.mouse.up();
    await page.waitForURL((u) => u.pathname === ROOMS[target!.id as Id].href);
  });

  test("the cursor says so: grab on open space, pointer on books", async ({ page }) => {
    await open(page, 1366, 768);
    const c = await page.evaluate(() => ({
      stage: getComputedStyle(document.querySelector('[data-testid="academy-core-stage"]')!).cursor,
      slot: getComputedStyle(document.querySelector('[data-testid="academy-core-slot-archives"]')!).cursor,
    }));
    expect(c.stage).toBe("grab");
    expect(c.slot).toBe("pointer");
  });

  test("off under reduced motion: no drag, nothing moves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 1366, 768);
    const a = await boxes(page);
    await page.mouse.move(640, 700);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(640 + i * 40, 700);
    await expect(page.getByTestId("academy-core-stage")).not.toHaveAttribute("data-dragging");
    await page.mouse.up();
    const b = await boxes(page);
    for (const id of IDS) expect(dist(a[id], b[id])).toBeLessThan(0.5);
  });
});

test.describe("phase 2: focus choreography", () => {
  test("the Core's rings change tempo with the room and return to rest", async ({ page }) => {
    await open(page, 1366, 768);
    const rate = () => page.evaluate(() => document.querySelector(".o35-comet-a")!.getAnimations()[0].playbackRate);
    expect(await rate()).toBeCloseTo(1, 1);
    const crystal = page.getByTestId("academy-core-crystal");
    await crystal.click(); // leaguecraft
    await crystal.click(); // pro-play
    await crystal.click(); // combat-lab: Measure races
    await expect.poll(rate, { timeout: 4000 }).toBeGreaterThan(2);
    await crystal.click(); // archives: Strata is slow
    await expect.poll(rate, { timeout: 4000 }).toBeLessThan(0.9);
    await crystal.click(); // idle
    await expect.poll(rate, { timeout: 4000 }).toBeGreaterThan(0.97);
  });

  test("the attended comet takes the room's colour; the focused cover swings on its spine and its pages light up", async ({ page }) => {
    await open(page, 1366, 768);
    const b = (await boxes(page))["pro-play"];
    await page.mouse.move(b.cx, b.cy + b.h * 0.15, { steps: 8 });
    await expect.poll(() => focusOf(page)).toBe("pro-play");
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const body = document.querySelector('[data-testid="academy-core-slot-pro-play"] .academy-hub-book-body')!;
      return {
        tf: getComputedStyle(body).transform,
        light: Number(getComputedStyle(document.querySelector('.o35-book[data-bay="pro-play"] .o35-pagelight')!).opacity),
        comet: getComputedStyle(document.querySelector(".o35-comet-a")!).getPropertyValue("--c").trim().toLowerCase(),
      };
    });
    expect(r.tf, "3D cover swing").toMatch(/^matrix3d/);
    expect(r.light, "page light").toBeGreaterThan(0.7);
    expect(r.comet).toMatch(/^(#b9a6ff|rgb\(185, 166, 255\))$/i);
  });

  test("arrow keys step focus through the books", async ({ page }) => {
    await open(page, 1366, 768);
    await bookLink(page, "leaguecraft").focus();
    await page.keyboard.press("ArrowRight");
    await expect(bookLink(page, "pro-play")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(bookLink(page, "archives")).toBeFocused();
  });
});

/** Make every frame cost ~40 ms of main-thread work (a ~25 fps machine). */
async function hogMainThread(page: Page) {
  await page.evaluate(() => {
    const burn = () => { const t = performance.now(); while (performance.now() - t < 40) { /* busy */ } requestAnimationFrame(burn); };
    requestAnimationFrame(burn);
  });
}

test.describe("phase 2: quality tiers and pausing", () => {
  const countAnims = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);

  test("?quality=lite keeps the orbit, the books and drag, with far fewer running animations", async ({ page }) => {
    await open(page, 1366, 768);
    const full = await countAnims(page);
    await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-quality", "full");
    await page.goto(`${ROUTE}?quality=lite`);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
    // count the scene, not the startup veil's own glow (a direct load holds it up to 1.8 s)
    await expect(page.getByTestId("academy-veil")).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-quality", "lite");
    const lite = await countAnims(page);
    expect(lite, `lite ${lite} vs full ${full}`).toBeLessThan(full * 0.65);
    const a = await boxes(page);
    await page.waitForTimeout(2500);
    const b = await boxes(page);
    expect(IDS.reduce((s, id) => s + dist(a[id], b[id]), 0), "the orbit still runs").toBeGreaterThan(100);
    for (const id of IDS) await expect(bookLink(page, id)).toBeVisible();
    await page.screenshot({ path: path.join("test-results", "behaviour-desktop-lite.png") });
  });

  test("a device that cannot hold its frame rate steps down to lite by itself", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, 1366, 768);
    await hogMainThread(page);
    await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-quality", "lite", { timeout: 60_000 });
  });

  test("a forced ?quality=full is never overridden", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubCommon(page);
    await stubChampions(page);
    await page.goto(`${ROUTE}?quality=full`);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
    await hogMainThread(page);
    await page.waitForTimeout(16_000);
    await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-quality", "full");
  });
});

/* ===================================================================== */
/* PHASE 2 TARGETED — the arrow selector and the larger crystal           */
/* ===================================================================== */

const arrow = (page: Page, dir: "left" | "right") => page.getByTestId(`academy-core-arrow-${dir}`);
/** The book nearest the front of the orbit (largest, lowest, top of the stack). */
async function frontBook(page: Page): Promise<Id> {
  const b = await boxes(page);
  return [...IDS].sort((x, y) => b[y].cy - b[x].cy)[0];
}
/**
 * Wait until a selector turn has finished: the engine reports `held` (a "books
 * stopped moving" heuristic misfires on a cold page, where frames can stall for
 * a few hundred ms), then return the resting positions.
 */
async function waitStill(page: Page, ms = 8000) {
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-spin", "held", { timeout: ms });
  return boxes(page);
}
const indexOf = (id: string) => IDS.indexOf(id as Id);

test.describe("selector: two arrows beneath the Core", () => {
  test("exactly two arrows, no text, comfortable and unobstructed targets, beneath the Core", async ({ page }) => {
    await open(page, 1366, 768);
    const sel = page.getByTestId("academy-core-selector");
    await expect(sel.getByRole("button")).toHaveCount(2);
    expect((await sel.innerText()).trim()).toBe("");
    await expect(arrow(page, "left")).toHaveAccessibleName("Previous book");
    await expect(arrow(page, "right")).toHaveAccessibleName("Next book");
    const core = (await page.locator(".o35-instrument").boundingBox())!;
    for (const dir of ["left", "right"] as const) {
      const b = (await arrow(page, dir).boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.y, `${dir} arrow beneath the Core`).toBeGreaterThan(core.y + core.height);
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x as number, y as number)?.closest("[data-testid^='academy-core-arrow']")?.getAttribute("data-testid"), [b.x + b.width / 2, b.y + b.height / 2]);
      expect(hit).toBe(`academy-core-arrow-${dir}`);
    }
    const l = (await arrow(page, "left").boundingBox())!;
    const r = (await arrow(page, "right").boundingBox())!;
    expect(l.x + l.width / 2).toBeLessThan(core.x + core.width / 2);
    expect(r.x + r.width / 2).toBeGreaterThan(core.x + core.width / 2);
    await noHorizontalOverflow(page);
  });

  test("right advances exactly one book per press through the orbit order, wraps after four; left reverses", async ({ page }) => {
    await open(page, 1366, 768);
    const url = page.url();
    const picks: Id[] = [];
    for (let k = 0; k < 5; k++) {
      await arrow(page, "right").click();
      await waitStill(page);
      const f = await frontBook(page);
      await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", f); // crystal / Mogzy agree
      picks.push(f);
    }
    expect(new Set(picks.slice(0, 4)).size, `all four come forward: ${picks}`).toBe(4);
    expect(picks[4]).toBe(picks[0]);
    for (let k = 1; k < picks.length; k++) expect(indexOf(picks[k])).toBe((indexOf(picks[k - 1]) + 3) % 4); // right = previous index
    await arrow(page, "left").click();
    await waitStill(page);
    expect(await frontBook(page)).toBe(picks[3]);
    expect(page.url()).toBe(url); // never navigates
  });

  test("the whole orbit turns: every book moves together, and the chosen one is held at the front", async ({ page }) => {
    await open(page, 1366, 768);
    const a = await boxes(page);
    await arrow(page, "left").click();
    // Headless Chromium on CI may advance only a few orbit frames in 450 ms.
    // Observe a meaningful portion of the turn, then still assert its endpoint.
    await page.waitForTimeout(1200);
    const mid = await boxes(page);
    // every book moves mid-turn (a short first turn moves the books at the orbit's ends only a few px)
    for (const id of IDS) expect(dist(a[id], mid[id]), `${id} turned with the orbit`).toBeGreaterThan(1.5);
    expect(IDS.reduce((sum, id) => sum + dist(a[id], mid[id]), 0), "the orbit as a whole turned").toBeGreaterThan(40);
    const still = await waitStill(page);
    const f = await frontBook(page);
    const core = (await page.locator(".o35-instrument").boundingBox())!;
    expect(Math.abs(still[f].cx - (core.x + core.width / 2)), "front and centre").toBeLessThan(4);
    await page.waitForTimeout(3000);
    const later = await boxes(page);
    for (const id of IDS) expect(dist(still[id], later[id]), `${id} held`).toBeLessThan(1);
    // the selected book is the top of the stack and one click from its room
    const z = await page.locator(`.o35-book[data-bay="${f}"]`).evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(z).toBeGreaterThanOrEqual(60);
    const p = await page.evaluate((id) => {
      const r = document.querySelector(`.o35-book[data-bay="${id}"]`)!.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height * 0.6 };
    }, f);
    await page.mouse.click(p.x, p.y);
    await page.waitForURL((u) => u.pathname === ROOMS[f].href);
  });

  test("a previously back-facing book comes all the way round to the front", async ({ page }) => {
    await open(page, 1366, 768);
    const b = await boxes(page);
    const back = [...IDS].sort((x, y) => b[x].cy - b[y].cy)[0]; // highest = farthest
    for (let k = 0; k < 4; k++) {
      await arrow(page, "right").click();
      await waitStill(page);
      if ((await frontBook(page)) === back) break;
    }
    expect(await frontBook(page)).toBe(back);
  });

  test("rapid presses: each counts exactly once, one continuous turn", async ({ page }) => {
    await open(page, 1366, 768);
    await arrow(page, "right").click();
    await waitStill(page);
    const start = await frontBook(page);
    for (let k = 0; k < 3; k++) await arrow(page, "right").click({ delay: 10 });
    const end = await (async () => { await waitStill(page); return frontBook(page); })();
    expect(indexOf(end)).toBe((indexOf(start) + 3 * 3) % 4);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", end);
  });

  test("takes over a fling (inertia) and a snap without waiting; drag still works and releases the hold", async ({ page }) => {
    await open(page, 1366, 768);
    // fling, then press during the coast
    await page.mouse.move(560, 700);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(560 + i * 40, 700); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(150);
    await arrow(page, "right").click();
    const still = await waitStill(page);
    const f = await frontBook(page);
    const core = (await page.locator(".o35-instrument").boundingBox())!;
    expect(Math.abs(still[f].cx - (core.x + core.width / 2))).toBeLessThan(4);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", f);
    // a drag takes the orbit back (and the hold with it)
    await page.mouse.move(700, 705);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(700 - i * 30, 705);
    await page.mouse.up();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "idle");
    const a = await boxes(page);
    await page.waitForTimeout(4000);
    const later = await boxes(page);
    expect(IDS.reduce((s, id) => s + dist(a[id], later[id]), 0), "the orbit runs again").toBeGreaterThan(20);
  });

  test("the crystal projects the selected room; its own cycle still works and continues from it", async ({ page }) => {
    await open(page, 1366, 768);
    await arrow(page, "right").click();
    await waitStill(page);
    const f = await frontBook(page);
    const modeClass: Record<Id, string> = { leaguecraft: "leaguecraft", "pro-play": "pro-play", "combat-lab": "combat", archives: "archives" };
    await expect.poll(() => page.locator(`.acore-mode-${modeClass[f]}`).evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
    const order: Id[] = ["leaguecraft", "pro-play", "combat-lab", "archives"];
    await page.getByTestId("academy-core-crystal").click();
    const next = order[order.indexOf(f) + 1] ?? "idle";
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", next);
    expect(page.url()).toContain(ROUTE);
  });

  test("keyboard: the arrows are reachable and operate with Enter and Space", async ({ page }) => {
    await open(page, 1366, 768);
    await arrow(page, "right").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("academy-core-stage")).not.toHaveAttribute("data-focus", "idle");
    const first = await page.getByTestId("academy-core-stage").getAttribute("data-focus");
    await page.keyboard.press(" ");
    await expect(page.getByTestId("academy-core-stage")).not.toHaveAttribute("data-focus", first!);
    await expect(arrow(page, "right")).toBeFocused();
    const ring = await arrow(page, "right").evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(ring).toBe("solid");
  });

  test("reduced motion: the selection is placed at once and navigation still works", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 1366, 768);
    await arrow(page, "right").click();
    const a = await boxes(page);
    const f = await frontBook(page);
    await page.waitForTimeout(800);
    const b = await boxes(page);
    for (const id of IDS) expect(dist(a[id], b[id])).toBeLessThan(0.5);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", f);
  });

  for (const vp of [{ name: "390x844", width: 390, height: 844 }, { name: "320x568", width: 320, height: 568 }]) {
    test(`phones (${vp.name}): two arrows under the composed books step the preview clockwise; nothing orbits`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      await noHorizontalOverflow(page);
      const sel = page.getByTestId("academy-core-selector");
      await expect(sel.getByRole("button")).toHaveCount(2);
      expect((await sel.innerText()).trim()).toBe("");
      const stageBox = (await page.getByTestId("academy-core-stage").boundingBox())!;
      for (const dir of ["left", "right"] as const) {
        const b = (await arrow(page, dir).boundingBox())!;
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height - 8);
      }
      // positions relative to the stage: the page scrolls to reach the arrows
      const rel = () => page.evaluate((ids) => {
        const s = document.querySelector('[data-testid="academy-core-stage"]')!.getBoundingClientRect();
        return ids.map((id) => { const r = document.querySelector(`.o35-book[data-bay="${id}"]`)!.getBoundingClientRect(); return [r.x - s.x + r.width / 2, r.y - s.y + r.height / 2]; });
      }, IDS as unknown as string[]);
      const a = await rel();
      const seq: string[] = [];
      for (let k = 0; k < 4; k++) {
        await arrow(page, "right").scrollIntoViewIfNeeded();
        await arrow(page, "right").click();
        seq.push((await page.getByTestId("academy-core-stage").getAttribute("data-focus"))!);
      }
      expect(seq).toEqual(["leaguecraft", "pro-play", "archives", "combat-lab"]);
      await page.waitForTimeout(800);
      const b = await rel();
      for (let i = 0; i < 4; i++) expect(Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]), `${IDS[i]} does not orbit`).toBeLessThan(20);
      await page.screenshot({ path: path.join("test-results", `selector-mobile-${vp.name}.png`), fullPage: true });
    });
  }
});

test.describe("crystal: larger inside the same Core", () => {
  test("the lens is ~23 % wider than V3's within an unchanged dial and rings", async ({ page }) => {
    await open(page, 1366, 768);
    const m = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const scene = r(".o35-scene");
      const u = scene.width / 960;
      return {
        u,
        instrument: r(".o35-instrument").width,
        crystal: r(".acore-crystal").width,
        bezel: r(".acore-bezel-outer").width,
        core: (document.querySelector(".o35-core") as HTMLElement).offsetWidth,
        ring: (document.querySelector(".o35-ring-scale") as HTMLElement).offsetWidth, // layout size: the ring itself rotates
      };
    });
    const ratio = m.crystal / m.instrument;
    expect(ratio, "crystal / instrument").toBeGreaterThan(0.48); // V3.5 before: 0.400 (0.78 lens)
    expect(ratio).toBeLessThan(0.51);
    expect(m.crystal / m.bezel, "crystal fills more of the dial").toBeGreaterThan(0.72);
    // the outer Core is unchanged: container 640 u, scale ring 92 % of it, dial = 300/460 of the instrument
    expect(m.core / m.u).toBeCloseTo(640, 0);
    expect(m.ring / m.core).toBeCloseTo(0.92, 2);
    expect(m.bezel / m.instrument).toBeCloseTo(300 / 460, 1);
  });

  test("iris, hit area and all four projections stay aligned with the larger lens", async ({ page }) => {
    await open(page, 1366, 768);
    const centre = (r: DOMRect | { x: number; y: number; width: number; height: number }) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    const crystal = (await page.locator(".acore-crystal").boundingBox())!;
    const iris = (await page.locator(".acore-iris-rim").boundingBox())!;
    const hit = (await page.getByTestId("academy-core-crystal").boundingBox())!;
    const c = centre(crystal);
    for (const [name, r] of [["iris", iris], ["hit", hit]] as const) {
      const k = centre(r);
      expect(Math.hypot(k.x - c.x, k.y - c.y), `${name} centred on the lens`).toBeLessThan(2.5);
    }
    expect(Math.abs(hit.width - crystal.width), "hit area matches the lens").toBeLessThan(8);
    expect(iris.width / crystal.width).toBeGreaterThan(1);
    expect(iris.width / crystal.width).toBeLessThan(1.1);
    const modes = ["leaguecraft", "pro-play", "combat", "archives"];
    for (const mode of modes) {
      await page.getByTestId("academy-core-crystal").click();
      await expect.poll(() => page.locator(`.acore-mode-${mode}`).evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
      // Leaguecraft parks its (transparent, lens-clipped) light beam off to one side between
      // sweeps, which a group's client rect still counts, so its footprint is the Lux window.
      const footprint = mode === "leaguecraft" ? ".acore-mode-leaguecraft .o35-lux-halo" : `.acore-mode-${mode}`;
      const box = (await page.locator(footprint).boundingBox())!;
      const k = centre(box);
      expect(Math.hypot(k.x - c.x, k.y - c.y), `${mode} projection centred`).toBeLessThan(crystal.width * 0.2);
      expect(box.width, `${mode} projection inside the lens`).toBeLessThanOrEqual(crystal.width * 1.15);
      const img = page.locator(`.acore-mode-${mode} image`).first();
      if (await img.count()) {
        const ib = (await img.boundingBox())!;
        expect(Math.hypot(centre(ib).x - c.x, centre(ib).y - c.y), `${mode} art near the centre`).toBeLessThan(crystal.width * 0.45);
      }
    }
    await page.getByTestId("academy-core-crystal").click();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "idle");
  });
});

/* ===================================================================== */
/* CRYSTAL REDESIGN — Leaguecraft (pentagon + scroll/quill), Pro Play 5v5  */
/* ===================================================================== */

/** Lens centre and radius (px) and the scale from lens-local units to px. */
async function lensGeometry(page: Page) {
  const c = (await page.locator(".acore-crystal").boundingBox())!;
  return { cx: c.x + c.width / 2, cy: c.y + c.height / 2, r: c.width / 2, k: c.width / 2 / 118 };
}
const centreOf = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test.describe("crystal redesign: Leaguecraft and Pro Play", () => {
  test("Pro Play: ten champion icons, five per side, framing Summoner's Rift — all inside the lens and the open iris", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await open(page, 1366, 768);
    const crystal = page.getByTestId("academy-core-crystal");
    await crystal.click();
    await crystal.click(); // Pro Play
    await expect.poll(() => page.locator(".acore-mode-pro-play").evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
    await page.waitForTimeout(900); // the iris spring and the sides' entry settle
    const L = await lensGeometry(page);
    const top = page.locator("[data-testid='academy-core-v35-team-top'] .o35-team-icon");
    const bottom = page.locator("[data-testid='academy-core-v35-team-bottom'] .o35-team-icon");
    await expect(top).toHaveCount(5);
    await expect(bottom).toHaveCount(5);
    for (const [name, loc, above] of [["top", top, true], ["bottom", bottom, false]] as const) {
      for (let i = 0; i < 5; i++) {
        const b = (await loc.nth(i).boundingBox())!;
        const p = centreOf(b);
        const d = Math.hypot(p.x - L.cx, p.y - L.cy);
        expect(above ? p.y < L.cy : p.y > L.cy, `${name} ${i} on its side`).toBe(true);
        // inside the iris: within the hexagon's inscribed circle (r 88), so no blade can cover it
        expect((d + b.width / 2) / L.k, `${name} ${i} clear of the iris`).toBeLessThan(88);
        // clear of the Rift disc (its ring is at r 47)
        expect((d - b.width / 2) / L.k, `${name} ${i} clear of the centre`).toBeGreaterThan(50);
        expect(b.width, `${name} ${i} readable size`).toBeGreaterThanOrEqual(18);
      }
    }
    const rift = (await page.locator("[data-testid='academy-core-v35-rift'] image").boundingBox())!;
    const rc = centreOf(rift);
    expect(Math.hypot(rc.x - L.cx, rc.y - L.cy), "Rift centred").toBeLessThan(3);
    expect(rift.width, "Rift large enough to read").toBeGreaterThanOrEqual(80);
    const ok = await page.locator("[data-testid='academy-core-v35-rift'] image").evaluate((el) => el.getAttribute("href"));
    expect(ok).toMatch(/rift-lane-turret.*\.webp/);
    const res = await page.request.get(ok!);
    expect(res.status()).toBe(200);
    expect(errors).toEqual([]);
  });

  test("all four modes switch correctly; Combat and Archives keep their V3 projections", async ({ page }) => {
    await open(page, 1366, 768);
    const crystal = page.getByTestId("academy-core-crystal");
    for (const [mode, override] of [["leaguecraft", true], ["pro-play", true], ["combat", false], ["archives", false]] as const) {
      await crystal.click();
      await expect.poll(() => page.locator(`.acore-mode-${mode}`).evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
      for (const other of ["leaguecraft", "pro-play", "combat", "archives"].filter((m) => m !== mode)) {
        await expect.poll(() => page.locator(`.acore-mode-${other}`).evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.05);
      }
      const attr = await page.locator(`.acore-mode-${mode}`).getAttribute("data-projection");
      expect(attr === "override").toBe(override);
    }
    await expect(page.locator(".acore-mode-combat .acore-jaw")).toHaveCount(2);
    await expect(page.locator(".acore-mode-archives .acore-stratum")).toHaveCount(5);
  });

  test("the selector and the crystal stay in step with the new projections", async ({ page }) => {
    await open(page, 1366, 768);
    for (let k = 0; k < 4; k++) {
      await arrow(page, "left").click();
      await waitStill(page);
      const f = await page.getByTestId("academy-core-stage").getAttribute("data-focus");
      const mode = f === "combat-lab" ? "combat" : f!;
      await expect.poll(() => page.locator(`.acore-mode-${mode}`).evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
      await expect(page.locator(".acore-svg")).toHaveAttribute("data-focus", f!);
    }
  });

  test("phones and reduced motion show the same two projections", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 390, 844);
    const crystal = page.getByTestId("academy-core-crystal");
    await crystal.click();
    await expect(page.getByTestId("academy-core-v35-lux-portrait")).toBeVisible();
    expect((await page.locator(".o35-lux-frame").boundingBox())!.width, "Lux chamber on a phone").toBeGreaterThan(40);
    await expect(page.locator(".acore-mode-leaguecraft .acore-role")).toHaveCount(5);
    // reduced motion: a still composition, Lux concealed behind the closed glass, nothing running in the projection
    const running = await page.evaluate(() => [...document.querySelectorAll(".o35-lux *")].flatMap((el) => el.getAnimations()).filter((a) => String((a as CSSAnimation).animationName ?? "").startsWith("o35-")).filter((a) => a.playState === "running").length);
    expect(running).toBe(0);
    // ... the iris closed at rest
    await page.waitForTimeout(1000);
    for (const a of await shutterAngles(page)) expect(Math.abs(a), "reduced motion: closed").toBeLessThan(0.1);
    expect((await revealed(page)).open).toBe(0);
    await crystal.click();
    await expect(page.locator(".o35-team-icon")).toHaveCount(10);
    await expect(page.locator("[data-testid='academy-core-v35-rift'] image")).toBeVisible();
    await noHorizontalOverflow(page);
  });
});

/* ===================================================================== */
/* HOVER-TO-FRONT — hovering a book turns the whole orbit to bring it forward */
/* ===================================================================== */

test.describe("hover-to-front", () => {
  test("every book, reached wherever the orbit has carried it, comes front-centre and is held", async ({ page }) => {
    await open(page, 1366, 768);
    for (const id of ["archives", "pro-play", "leaguecraft", "combat-lab"] as const) {
      // start from an arbitrary orbit position: release, let the orbit idle a while
      const stage = (await page.getByTestId("academy-core-stage").boundingBox())!;
      await page.mouse.click(stage.x + 30, stage.y + stage.height - 20);
      await page.waitForTimeout(900 + IDS.indexOf(id) * 700);
      await reachBook(page, id);
      await heldAt(page, id);
      expect(await isFrontCentre(page, id), `${id} front-centre`).toBe(true);
      await expect(page.getByTestId("academy-core-preview")).toHaveText(`Previewing ${ROOMS[id].title}`);
    }
  });

  test("a still mouse: the chosen book moves away and other books slide under it, and nothing changes (no chasing, no cancelling)", async ({ page }) => {
    await open(page, 1366, 768);
    const pt = await reachBook(page, "archives");
    // record every change of the stage's focus / hover / intent from here on
    await page.evaluate(() => {
      const st = document.querySelector('[data-testid="academy-core-stage"]')!;
      const log: string[] = [];
      (window as unknown as { __h: string[] }).__h = log;
      new MutationObserver(() => log.push(`${st.getAttribute("data-focus")}|${st.getAttribute("data-hover")}|${st.getAttribute("data-intent")}`))
        .observe(st, { attributes: true, attributeFilter: ["data-focus", "data-hover", "data-intent"] });
    });
    await heldAt(page, "archives");
    await page.waitForTimeout(2500); // the mouse never moved
    const log = await page.evaluate(() => (window as unknown as { __h: string[] }).__h);
    expect(log.every((l) => l === "archives|archives|book"), log.join(", ")).toBe(true);
    expect(await isFrontCentre(page, "archives")).toBe(true);
    const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".o35-book")?.getAttribute("data-bay") ?? "open space", [pt.x, pt.y]);
    // whatever is under the still cursor now is not chosen, nor does its cover respond
    if (under !== "archives" && under !== "open space") {
      await expect(page.getByTestId(`academy-core-slot-${under}`)).toHaveAttribute("data-active", "false");
      const tf = await page.locator(`[data-testid="academy-core-slot-${under}"] .academy-hub-book-body`).evaluate((el) => getComputedStyle(el).transform);
      expect(tf, "a book passing under the cursor keeps its resting cover").toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    }
  });

  test("real departure: following the book across open space keeps it; leaving the orrery ends the hover, not the selection", async ({ page }) => {
    await open(page, 1366, 768);
    await reachBook(page, "pro-play");
    await heldAt(page, "pro-play");
    const core = (await page.locator(".o35-instrument").boundingBox())!;
    await page.mouse.move(core.x + core.width / 2 + 260, core.y + core.height + 40, { steps: 10 }); // open space near the front
    await page.waitForTimeout(400);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "pro-play");
    await page.mouse.move(40, 300, { steps: 6 });
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "preview");
    expect(await focusOf(page)).toBe("pro-play");
    expect(await isFrontCentre(page, "pro-play")).toBe(true);
  });

  test("switching quickly between books: the last one reached is brought forward, in one continuous turn", async ({ page }) => {
    await open(page, 1366, 768);
    await reachBook(page, "combat-lab");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "combat-lab");
    await reachBook(page, "leaguecraft");
    await reachBook(page, "archives");
    await heldAt(page, "archives");
    expect(await isFrontCentre(page, "archives")).toBe(true);
  });

  test("an arrow takes precedence and continues from the hovered book; a quick pass over a book does not undo an arrow selection", async ({ page }) => {
    await open(page, 1366, 768);
    await reachBook(page, "combat-lab");
    await heldAt(page, "combat-lab");
    await page.getByTestId("academy-core-arrow-right").click();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "pro-play");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-spin", "held", { timeout: 15_000 });
    expect(await isFrontCentre(page, "pro-play")).toBe(true);
    // a fast pass over another book on the way somewhere else changes nothing
    const pt = (await pointOn(page, "archives")) ?? (await pointOn(page, "leaguecraft"));
    if (pt) {
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await page.mouse.move(40, 300, { steps: 2 });
    }
    await page.waitForTimeout(600);
    expect(await focusOf(page)).toBe("pro-play");
    expect(await stageAttr(page, "data-spin")).toBe("held");
    expect(await isFrontCentre(page, "pro-play")).toBe(true);
  });

  test("the crystal ends the hover and continues its own cycle from the hovered room, never navigating", async ({ page }) => {
    await open(page, 1366, 768);
    const url = page.url();
    await reachBook(page, "leaguecraft");
    await heldAt(page, "leaguecraft");
    await page.getByTestId("academy-core-crystal").click();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "pro-play");
    expect(page.url()).toBe(url);
  });

  test("a drag interrupts the hover and takes the orbit; no book is chosen while dragging", async ({ page }) => {
    await open(page, 1366, 768);
    await reachBook(page, "archives");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "archives");
    await page.mouse.move(640, 700);
    await page.mouse.down();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "");
    for (let i = 1; i <= 10; i++) { await page.mouse.move(640 + i * 30, 700); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(await stageAttr(page, "data-hover")).toBe("");
    await expect(page.getByTestId("academy-core-stage")).not.toHaveAttribute("data-spin", "held");
  });

  test("Leaguecraft: the Lux reveal completes during the turn and stays open while held — no restart, no flicker", async ({ page }) => {
    await open(page, 1366, 768);
    await reachBook(page, "leaguecraft");
    const t0 = Date.now();
    const means: number[] = [];
    for (let i = 0; i < 14; i++) {
      means.push((await shutterAngles(page)).reduce((x, y) => x + y, 0) / 6);
      await page.waitForTimeout(250);
    }
    expect(await stageAttr(page, "data-intent")).toBe("book");
    for (let i = 1; i < means.length; i++) expect(means[i], `opening only grows (${i}, ${Date.now() - t0} ms)`).toBeGreaterThanOrEqual(means[i - 1] - 0.5);
    await heldAt(page, "leaguecraft");
    await settlesAt(page, "open");
    await page.waitForTimeout(1500);
    for (const a of await shutterAngles(page)) expect(a, "still open while held").toBeGreaterThan(62);
    expect((await revealed(page, "face")).open, "her face revealed").toBe(1);
    // a real leave closes it
    await page.mouse.move(40, 300, { steps: 3 });
    await settlesAt(page, "closed");
  });

  test("keyboard is unchanged: Tab brings a book beside the crystal without turning the orbit; Enter opens it", async ({ page }) => {
    await open(page, 1366, 768);
    await bookLink(page, "pro-play").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "pro-play");
    await page.waitForTimeout(800);
    expect(await stageAttr(page, "data-hover")).toBe("");
    expect(await stageAttr(page, "data-spin")).not.toMatch(/steering|held/);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/lol\/pro-play$/);
  });

  test("reduced motion: hover selects in place (the scene never rearranges under the cursor) and a click navigates at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 1366, 768);
    const before = await boxes(page);
    await page.getByTestId("academy-core-slot-archives").hover();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "archives");
    await page.waitForTimeout(600);
    expect(await stageAttr(page, "data-hover")).toBe("");
    const after = await boxes(page);
    for (const id of IDS) expect(dist(before[id], after[id]), `${id} did not move`).toBeLessThan(1);
    await page.getByTestId("academy-core-slot-archives").getByRole("link").click();
    await page.waitForURL(/\/lol\/docs$/);
  });

  test("phones: the composed books keep their tap behaviour (no hover hold)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    try {
      await stubCommon(page);
      await stubChampions(page);
      await page.goto(ROUTE);
      await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-mode", "composed");
      await expect(page.getByTestId("academy-veil")).toHaveCount(0);
      await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-hover", "");
      // CSS levitation makes Playwright's locator.tap() wait indefinitely for
      // geometric stability; a real touchscreen tap does not require that.
      // Choose a currently unobstructed point on the actual link.
      const target = await page.evaluate(() => {
        const link = document.querySelector<HTMLAnchorElement>('[data-testid="academy-core-slot-combat-lab"] a');
        if (!link) return null;
        const r = link.getBoundingClientRect();
        for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          for (const fx of [0.5, 0.3, 0.7]) {
            const x = r.x + r.width * fx;
            const y = r.y + r.height * fy;
            if (link.contains(document.elementFromPoint(x, y))) return { x, y };
          }
        }
        return null;
      });
      expect(target, "a visible, unobstructed mobile book tap target").not.toBeNull();
      await page.touchscreen.tap(target!.x, target!.y);
      await page.waitForURL(/\/combat-lab$/);
    } finally {
      await ctx.close();
    }
  });

  test("startup is untouched: a direct /lol visit lifts the veil on a ready scene, with no hover held and the orbit free", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubCommon(page);
    await stubChampions(page);
    await page.goto(ROUTE);
    await expect(page.getByTestId("academy-veil")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator(".o35-root")).toHaveAttribute("data-startup", /ready|degraded|none/);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
    expect(await stageAttr(page, "data-hover")).toBe("");
    expect(await stageAttr(page, "data-spin")).toBe("free");
  });
});

/* ===================================================================== */
/* LEAGUECRAFT — five role icons around a concealed Lux                   */
/* ===================================================================== */

/** Pin Leaguecraft with the crystal and wait for the projection to be fully shown. */
async function pinLeaguecraft(page: Page) {
  await page.getByTestId("academy-core-crystal").click();
  await page.mouse.move(40, 300);
  await expect.poll(() => page.locator(".acore-mode-leaguecraft").evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
  await page.waitForTimeout(300);
}

/** Rest the pointer on the Leaguecraft book where it is (it orbits), and wait until the scene reports the reach. */
async function reachLeaguecraft(page: Page) {
  for (let i = 0; i < 30; i++) {
    const b = (await page.getByTestId("academy-core-slot-leaguecraft").boundingBox())!;
    const pt = { x: b.x + b.width / 2, y: b.y + b.height * 0.4 };
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid^='academy-core-slot-']")?.getAttribute("data-testid"), [pt.x, pt.y]);
    if (hit === "academy-core-slot-leaguecraft") {
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "book");
      await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "leaguecraft");
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("the Leaguecraft book never came under a free point");
}

/** Each visible shutter's pivot about its hinge, in degrees opened. */
const shutterAngles = (page: Page) => page.evaluate(() => [0, 1, 2, 3, 4, 5].map((k) => {
  const pivot = document.querySelector(`[data-testid='academy-core-v35-shutter-${k}']`)!.parentElement!;
  const m = new DOMMatrix(getComputedStyle(pivot).transform);
  return (-Math.atan2(m.b, m.a) * 180) / Math.PI;
}));
const inStep = (a: number[]) => Math.max(...a) - Math.min(...a);
/** Wait until every shutter reaches a final state (a loaded headless browser can stall for hundreds of ms). */
const settlesAt = (page: Page, state: "open" | "closed", timeout = 5000) =>
  expect.poll(async () => (await shutterAngles(page)).every((a) => (state === "open" ? a > 62 : Math.abs(a) < 0.1)), { timeout, message: `shutters ${state}` }).toBe(true);

/** The share of the chamber (or of its central face region) that no shutter covers, sampled on a grid in screen space. */
const revealed = (page: Page, region: "window" | "face" = "window") => page.evaluate((region) => {
  const frame = document.querySelector(".o35-lux-frame") as SVGPolygonElement;
  const fm = frame.getScreenCTM()!;
  const corners = [...frame.points].map((p) => new DOMPoint(p.x, p.y).matrixTransform(fm));
  const cx = corners.reduce((s, p) => s + p.x, 0) / 6;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 6;
  const R = Math.hypot(corners[0].x - cx, corners[0].y - cy);
  const inPoly = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = 5; i < 6; j = i++) {
      const a = corners[i];
      const b = corners[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const bodies = [...document.querySelectorAll("[data-testid^='academy-core-v35-shutter-'] .o35-shutter-body")] as SVGGeometryElement[];
  const inv = bodies.map((b) => b.getScreenCTM()!.inverse());
  let n = 0;
  let open = 0;
  // the grid is offset off the chamber's axes, so no sample lands exactly on a seam two shutters share
  const step = R / 24;
  for (let x = cx - R + step * 0.37; x <= cx + R; x += step) {
    for (let y = cy - R + step * 0.21; y <= cy + R; y += step) {
      if (!inPoly(x, y)) continue;
      if (region === "face" && Math.hypot(x - cx, y - cy) > R * 0.42) continue;
      n++;
      const hits = bodies.filter((b, i) => { const q = new DOMPoint(x, y).matrixTransform(inv[i]); return b.isPointInFill(new DOMPoint(q.x, q.y)); }).length;
      if (hits === 0) open++;
    }
  }
  return { open: open / n };
}, region);
/** The projection's own CSS animations (keyframe loops), wherever they are. */
const luxAnimations = (page: Page) => page.evaluate(() => [...document.querySelectorAll(".o35-lux, .o35-lux *")].flatMap((el) => el.getAnimations()).filter((a) => String((a as CSSAnimation).animationName ?? "").length > 0 && !String((a as CSSAnimation).animationName).startsWith("acore-fade")).length);

test.describe("Leaguecraft: five role icons around a concealed Lux", () => {
  test("the five role icons around Lux's genuine icon, centred, clear of each other, and the iris closed", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await open(page, 1366, 768);
    await pinLeaguecraft(page);
    const roles = page.locator(".acore-mode-leaguecraft .acore-role");
    await expect(roles).toHaveCount(5);
    const href = await page.getByTestId("academy-core-v35-lux-portrait").getAttribute("href");
    expect(href, "the manifest's square icon").toMatch(/assets\/champions\/Lux\/icon\.png$/);
    const L = await lensGeometry(page);
    const win = (await page.locator(".o35-lux-frame").boundingBox())!;
    const c = centreOf(win);
    expect(Math.hypot(c.x - L.cx, c.y - L.cy), "centred where the scroll was").toBeLessThan(3);
    expect(win.width, "the chamber reads at homepage size").toBeGreaterThanOrEqual(85);
    // the role icons surround the chamber without touching it: each ring is outside the chamber's circumcircle (plus its halo)
    const R = win.height / 2;
    for (let i = 0; i < 5; i++) {
      const rb = (await roles.nth(i).locator("circle").boundingBox())!;
      const rc = centreOf(rb);
      expect(Math.hypot(rc.x - c.x, rc.y - c.y) - rb.width / 2, `role ${i} clear of the chamber`).toBeGreaterThan(R + 2);
    }
    for (const sel of [".acore-reticle", "[data-testid='academy-core-v35-study-emblem']", ".o35-lux-beam"]) {
      await expect(page.locator(`.acore-mode-leaguecraft ${sel}`), sel).toHaveCount(0);
    }
    // closed: every shutter at 0 deg, nothing of the chamber uncovered
    for (const a of await shutterAngles(page)) expect(Math.abs(a), "closed").toBeLessThan(0.1);
    expect((await revealed(page)).open, "nothing uncovered").toBe(0);
    expect(errors).toEqual([]);
  });

  test("at rest nothing moves: no loop, no automatic reveal", async ({ page }) => {
    await open(page, 1366, 768);
    await pinLeaguecraft(page);
    expect(await luxAnimations(page), "no keyframe animation in the projection").toBe(0);
    const a = await shutterAngles(page);
    await page.waitForTimeout(4000);
    const b = await shutterAngles(page);
    expect([...a, ...b].every((v) => Math.abs(v) < 0.1), "closed and still over 4 s").toBe(true);
    expect((await revealed(page)).open).toBe(0);
  });

  test("reaching for the Leaguecraft book opens all six together, slowly; leaving closes them", async ({ page }) => {
    await open(page, 1366, 768);
    await pinLeaguecraft(page); // pinned, so the projection stays shown after the pointer leaves and the closing can be measured
    await reachLeaguecraft(page);
    const t0 = Date.now();
    const samples: { t: number; a: number[] }[] = [];
    for (const at of [350, 800, 1300, 2300]) {
      const wait = at - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      samples.push({ t: Date.now() - t0, a: await shutterAngles(page) });
    }
    for (const s of samples) expect(inStep(s.a), `in step at ${s.t} ms`).toBeLessThan(0.5);
    const mean = samples.map((s) => s.a.reduce((x, y) => x + y, 0) / 6);
    // slow: still opening well after the first frames, then fully open
    expect(mean[0], "under way, not instant").toBeLessThan(55);
    for (let i = 1; i < mean.length; i++) expect(mean[i], `opening only grows (${i})`).toBeGreaterThanOrEqual(mean[i - 1] - 0.5);
    await settlesAt(page, "open");
    expect((await revealed(page)).open, "Lux revealed").toBeGreaterThan(0.97);
    expect((await revealed(page, "face")).open, "her face revealed").toBe(1);
    // leaving: back to closed
    await page.mouse.move(40, 300, { steps: 2 });
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "preview");
    await page.waitForTimeout(400);
    const closing = (await shutterAngles(page)).reduce((x, y) => x + y, 0) / 6;
    expect(closing, "closing, not instant").toBeGreaterThan(1);
    await settlesAt(page, "closed");
    expect((await revealed(page)).open, "concealed again").toBe(0);
  });

  test("keyboard focus on the Leaguecraft book reveals her too, and moving focus away conceals her", async ({ page }) => {
    await open(page, 1366, 768);
    await pinLeaguecraft(page);
    await page.getByTestId("academy-core-slot-leaguecraft").getByRole("link").focus();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "book");
    await settlesAt(page, "open");
    await page.getByTestId("academy-core-crystal").focus(); // not a book: the reach ends (Leaguecraft stays pinned)
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "preview");
    await settlesAt(page, "closed");
  });

  test("opening the book swings the iris out within the existing 240 ms activation, and the click still navigates", async ({ page }) => {
    await open(page, 1366, 768);
    await pinLeaguecraft(page);
    // the activating STATE, checked directly (a slow headless browser navigates before it paints the 240 ms beat)
    await page.evaluate(() => document.querySelector(".acore-svg")!.setAttribute("data-activating", "leaguecraft"));
    await settlesAt(page, "open", 3000);
    await page.evaluate(() => document.querySelector(".acore-svg")!.setAttribute("data-activating", ""));
    await settlesAt(page, "closed");
    await reachLeaguecraft(page);
    await heldAt(page, "leaguecraft"); // hover-to-front: it is brought forward first
    const at = (await pointOn(page, "leaguecraft"))!;
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForURL(/\/quiz$/);
  });

  test("reduced motion: the same open and closed states, at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 1366, 768);
    await pinLeaguecraft(page);
    for (const a of await shutterAngles(page)) expect(Math.abs(a)).toBeLessThan(0.1);
    // the books hold still under reduced motion, so the book can be aimed directly
    await page.getByTestId("academy-core-slot-leaguecraft").hover();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "book");
    await page.waitForTimeout(150);
    for (const a of await shutterAngles(page)) expect(a, "open at once").toBeGreaterThan(62);
    await page.mouse.move(40, 300);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "preview");
    await page.waitForTimeout(150);
    for (const a of await shutterAngles(page)) expect(Math.abs(a), "closed at once").toBeLessThan(0.1);
  });

  test("lite quality keeps the same composition and the same reveal", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubCommon(page);
    await stubChampions(page);
    await page.goto(`${ROUTE}?quality=lite`);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
    await pinLeaguecraft(page);
    expect(await luxAnimations(page)).toBe(0);
    await expect(page.locator(".acore-mode-leaguecraft .acore-role")).toHaveCount(5);
    await expect(page.locator("[data-testid^='academy-core-v35-shutter-']")).toHaveCount(6);
    expect((await revealed(page)).open).toBe(0);
    await reachLeaguecraft(page);
    await settlesAt(page, "open");
    expect((await revealed(page)).open).toBeGreaterThan(0.97);
  });
});

const evidence = process.env.V35_EVIDENCE ? test.describe : test.describe.skip;

evidence("evidence", () => {
  test.setTimeout(240_000);

  test("evidence: desktop and mobile stills", async ({ page }) => {
    for (const vp of [{ n: "1366x768", w: 1366, h: 768 }, { n: "1920x1080", w: 1920, h: 1080 }, { n: "1280x660", w: 1280, h: 660 }]) {
      await open(page, vp.w, vp.h, { real: true });
      await page.screenshot({ path: path.join(OUT, `desktop-${vp.n}-idle.png`) });
    }
    await open(page, 1366, 768, { real: true });
    for (const id of ["leaguecraft", "pro-play"] as const) {
      const b = (await boxes(page))[id];
      await page.mouse.move(b.cx, b.cy + b.h * 0.15, { steps: 8 });
      await expect.poll(() => focusOf(page)).toBe(id);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `desktop-1366x768-hover-${id}.png`) });
      await page.mouse.move(40, 300, { steps: 4 });
      await page.waitForTimeout(1600);
    }
    const crystal = page.getByTestId("academy-core-crystal");
    for (const id of ["leaguecraft", "pro-play", "combat-lab", "archives"] as const) {
      await crystal.click();
      await page.waitForTimeout(1900);
      await page.screenshot({ path: path.join(OUT, `desktop-1366x768-crystal-${id}.png`) });
    }
    await crystal.click(); // back to idle
    // a short sequence of stills over 18 s proves the books moved
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(40, 300);
      await page.waitForTimeout(i === 0 ? 1500 : 6000);
      await page.screenshot({ path: path.join(OUT, `desktop-1366x768-orbit-t${String(i * 6).padStart(2, "0")}s.png`) });
    }
    for (const vp of [{ n: "390x844", w: 390, h: 844 }, { n: "320x568", w: 320, h: 568 }, { n: "430x932", w: 430, h: 932 }]) {
      await open(page, vp.w, vp.h, { real: true });
      await page.screenshot({ path: path.join(OUT, `mobile-${vp.n}-top.png`) });
      await page.screenshot({ path: path.join(OUT, `mobile-${vp.n}-full.png`), fullPage: true });
    }
    await open(page, 390, 844, { real: true });
    await page.getByTestId("academy-core-crystal").click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "mobile-390x844-crystal-preview.png") });
  });

  test("evidence: the 24 s motion recording (idle orbit, two hovers, crystal, activation)", async ({ browser }) => {
    const videoDir = path.join(OUT, "_video");
    mkdirSync(videoDir, { recursive: true });
    const tCtx = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir: videoDir, size: { width: 1366, height: 768 } } });
    const page = await ctx.newPage();
    // a visible pointer: headless recordings do not draw the OS cursor
    await page.addInitScript(() => {
      window.addEventListener("DOMContentLoaded", () => {
        const c = document.createElement("div");
        c.style.cssText = "position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid #fff;background:rgba(255,255,255,.18);box-shadow:0 0 10px rgba(0,0,0,.6);pointer-events:none;left:-40px;top:-40px;transition:transform 80ms";
        document.body.appendChild(c);
        window.addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
        window.addEventListener("mousedown", () => { c.style.transform = "scale(.7)"; }, true);
        window.addEventListener("mouseup", () => { c.style.transform = ""; }, true);
      });
    });
    await open(page, 1366, 768, { real: true });
    const tReady = Date.now();
    const hoverBook = async (id: Id, hold: number) => {
      const b = (await boxes(page))[id];
      await page.mouse.move(b.cx, b.cy + b.h * 0.12, { steps: 14 });
      await page.waitForTimeout(hold);
    };
    // idle: the books orbit, the Core idles
    await page.mouse.move(700, 700);
    await page.waitForTimeout(7000);
    // hover book A, then book B
    await hoverBook("leaguecraft", 2200);
    await page.mouse.move(60, 420, { steps: 12 });
    await page.waitForTimeout(900);
    await hoverBook("pro-play", 2200);
    await page.mouse.move(60, 420, { steps: 12 });
    await page.waitForTimeout(800);
    // the crystal previews rooms; the chosen book comes forward
    const cr = (await page.getByTestId("academy-core-crystal").boundingBox())!;
    const cx = cr.x + cr.width / 2;
    const cy = cr.y + cr.height / 2;
    await page.mouse.move(cx, cy, { steps: 14 });
    for (let i = 0; i < 4; i++) {
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(1300);
    }
    await page.mouse.click(cx, cy); // back to idle
    await page.mouse.move(60, 420, { steps: 10 });
    await page.waitForTimeout(900);
    // activate a book
    await hoverBook("combat-lab", 500);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForURL(/\/combat-lab$/);
    await page.waitForTimeout(700);
    const tEnd = Date.now();
    const video = page.video()!;
    await ctx.close();
    const file = await video.path();
    expect(existsSync(file)).toBe(true);
    copyFileSync(file, path.join(OUT, "_video", "raw.webm"));
    writeFileSync(path.join(OUT, "_video", "meta.json"), JSON.stringify({ readyAt: (tReady - tCtx) / 1000, endAt: (tEnd - tCtx) / 1000 }));
  });
});

evidence("evidence: phase 2", () => {
  test.setTimeout(240_000);

  test("evidence: phase 2 stills (fling, snapped composition, cover crack, keyboard, lite)", async ({ page }) => {
    await open(page, 1366, 768, { real: true });
    // a fling, mid-coast
    await page.mouse.move(560, 700);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(560 + i * 40, 700); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.mouse.move(60, 420);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, "phase2-1366x768-fling-midcoast.png") });
    // settled on a symmetric composition
    let last = await boxes(page);
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      const now = await boxes(page);
      if (IDS.every((id) => dist(now[id], last[id]) < 1.5)) break;
      last = now;
    }
    await page.screenshot({ path: path.join(OUT, "phase2-1366x768-snapped.png") });
    // the focused cover opens a crack
    const b = (await boxes(page))["pro-play"];
    await page.mouse.move(b.cx, b.cy + b.h * 0.2, { steps: 8 });
    await expect.poll(() => focusOf(page)).toBe("pro-play");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "phase2-1366x768-hover-cover-crack.png") });
    await page.mouse.move(60, 420, { steps: 6 });
    await page.waitForTimeout(1400);
    // Measure races: the combat room via the crystal
    const crystal = page.getByTestId("academy-core-crystal");
    for (let i = 0; i < 3; i++) await crystal.click();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(OUT, "phase2-1366x768-crystal-measure.png") });
    await crystal.click();
    await crystal.click();
    await page.waitForTimeout(800);
    // keyboard: focus a book, arrow to the next
    await bookLink(page, "leaguecraft").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT, "phase2-1366x768-keyboard-focus.png") });
    // lite tier
    await page.goto(`${ROUTE}?quality=lite`);
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, "phase2-1366x768-lite.png") });
  });

  test("evidence: the phase 2 interaction recording", async ({ browser }) => {
    const videoDir = path.join(OUT, "_video");
    mkdirSync(videoDir, { recursive: true });
    const tCtx = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir: videoDir, size: { width: 1366, height: 768 } } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.addEventListener("DOMContentLoaded", () => {
        const c = document.createElement("div");
        c.style.cssText = "position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid #fff;background:rgba(255,255,255,.18);box-shadow:0 0 10px rgba(0,0,0,.6);pointer-events:none;left:-40px;top:-40px;transition:transform 80ms";
        document.body.appendChild(c);
        window.addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
        window.addEventListener("mousedown", () => { c.style.transform = "scale(.7)"; }, true);
        window.addEventListener("mouseup", () => { c.style.transform = ""; }, true);
      });
    });
    await open(page, 1366, 768, { real: true });
    const tReady = Date.now();
    const sweep = async (fromX: number, toX: number, y: number, steps: number) => {
      for (let i = 0; i <= steps; i++) { await page.mouse.move(fromX + ((toX - fromX) * i) / steps, y); await page.waitForTimeout(16); }
    };
    // 1. idle orbit
    await page.mouse.move(700, 700);
    await page.waitForTimeout(3500);
    // 2. grab the orbit and fling it right; it coasts, settles symmetric, pauses, then resumes
    await page.mouse.move(560, 705);
    await page.mouse.down();
    await sweep(560, 1000, 705, 16);
    await page.mouse.up();
    await page.mouse.move(60, 420, { steps: 10 });
    await page.waitForTimeout(6500);
    // 3. fling the other way
    await page.mouse.move(1000, 705, { steps: 8 });
    await page.mouse.down();
    await sweep(1000, 560, 705, 14);
    await page.mouse.up();
    await page.mouse.move(60, 420, { steps: 10 });
    await page.waitForTimeout(5500);
    // 4. hover a book: the cover opens a crack, the beam lights
    const b = (await boxes(page))["pro-play"];
    await page.mouse.move(b.cx, b.cy + b.h * 0.2, { steps: 14 });
    await page.waitForTimeout(2300);
    await page.mouse.move(60, 420, { steps: 10 });
    await page.waitForTimeout(900);
    // 5. the crystal: Inquiry, Observe, Measure (rings race), Strata (rings slow)
    const cr = (await page.getByTestId("academy-core-crystal").boundingBox())!;
    const cx = cr.x + cr.width / 2;
    const cy = cr.y + cr.height / 2;
    await page.mouse.move(cx, cy, { steps: 12 });
    for (let i = 0; i < 4; i++) { await page.mouse.click(cx, cy); await page.waitForTimeout(1500); }
    await page.mouse.click(cx, cy);
    await page.mouse.move(60, 420, { steps: 8 });
    await page.waitForTimeout(500);
    // 6. keyboard: arrows move the focus book to the front, Enter opens it
    await bookLink(page, "leaguecraft").focus();
    await page.waitForTimeout(1300);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1500);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/lol\/pro-play$/);
    await page.waitForTimeout(600);
    const tEnd = Date.now();
    const video = page.video()!;
    await ctx.close();
    const file = await video.path();
    expect(existsSync(file)).toBe(true);
    copyFileSync(file, path.join(OUT, "_video", "raw-p2.webm"));
    writeFileSync(path.join(OUT, "_video", "meta-p2.json"), JSON.stringify({ readyAt: (tReady - tCtx) / 1000, endAt: (tEnd - tCtx) / 1000 }));
  });
});

evidence("evidence: selector and crystal", () => {
  test.setTimeout(240_000);

  test("evidence: selector stills (desktop, selected, phone)", async ({ page }) => {
    await open(page, 1366, 768, { real: true });
    await page.mouse.move(60, 420);
    await page.screenshot({ path: path.join(OUT, "selector-desktop-1366x768-idle.png") });
    await arrow(page, "right").click();
    await waitStill(page);
    await page.mouse.move(60, 420);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "selector-desktop-1366x768-selected.png") });
    await open(page, 1920, 1080, { real: true });
    await arrow(page, "left").click();
    await waitStill(page);
    await page.mouse.move(60, 420);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "selector-desktop-1920x1080-selected.png") });
    await open(page, 390, 844, { real: true });
    await arrow(page, "right").scrollIntoViewIfNeeded();
    await arrow(page, "right").click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, "selector-mobile-390x844-full.png"), fullPage: true });
    await page.evaluate(() => {
      const s = document.querySelector('[data-testid="academy-core-stage"]')!.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + s.top - 40);
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "selector-mobile-390x844-stage.png") });
  });

  test("evidence: the selector recording", async ({ browser }) => {
    const videoDir = path.join(OUT, "_video");
    mkdirSync(videoDir, { recursive: true });
    const tCtx = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir: videoDir, size: { width: 1366, height: 768 } } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.addEventListener("DOMContentLoaded", () => {
        const c = document.createElement("div");
        c.style.cssText = "position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid #fff;background:rgba(255,255,255,.18);box-shadow:0 0 10px rgba(0,0,0,.6);pointer-events:none;left:-40px;top:-40px;transition:transform 80ms";
        document.body.appendChild(c);
        window.addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
        window.addEventListener("mousedown", () => { c.style.transform = "scale(.7)"; }, true);
        window.addEventListener("mouseup", () => { c.style.transform = ""; }, true);
      });
    });
    await open(page, 1366, 768, { real: true });
    const tReady = Date.now();
    const at = async (dir: "left" | "right") => {
      const b = (await arrow(page, dir).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const press = async (dir: "left" | "right", steps = 10) => {
      const p = await at(dir);
      await page.mouse.move(p.x, p.y, { steps });
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.up();
    };
    // 1. idle orbit
    await page.mouse.move(700, 740);
    await page.waitForTimeout(3200);
    // 2-3. right: the whole orbit turns and the next book is held at the front
    await press("right", 16);
    await waitStill(page);
    await page.waitForTimeout(900);
    // 4. right again
    await press("right", 4);
    await waitStill(page);
    await page.waitForTimeout(900);
    // 5. left reverses
    await press("left", 16);
    await waitStill(page);
    await page.waitForTimeout(900);
    // 6. the book at the back (behind the dial) comes all the way round: two steps, the second mid-turn
    await press("left", 4);
    await page.waitForTimeout(500);
    await press("left", 2);
    await waitStill(page);
    await page.waitForTimeout(1000);
    // 7. rapid presses: three quick ones, one continuous turn
    for (let k = 0; k < 3; k++) { await press("right", 2); await page.waitForTimeout(120); }
    await waitStill(page);
    await page.waitForTimeout(900);
    // 9. the larger crystal cycles its four projections (and lets the hold go)
    const cr = (await page.getByTestId("academy-core-crystal").boundingBox())!;
    const cx = cr.x + cr.width / 2;
    const cy = cr.y + cr.height / 2 - cr.height * 0.25;
    await page.mouse.move(cx, cy, { steps: 14 });
    for (let k = 0; k < 4; k++) { await page.mouse.click(cx, cy); await page.waitForTimeout(1400); }
    await page.mouse.click(cx, cy); // back to rest
    await page.waitForTimeout(500);
    // 8. select a book with the arrow, then click it: the 240 ms activation, then its room
    await press("right", 14);
    await waitStill(page);
    await page.waitForTimeout(700);
    const f = await frontBook(page);
    const p = await page.evaluate((id) => {
      const r = document.querySelector(`.o35-book[data-bay="${id}"]`)!.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height * 0.62 };
    }, f);
    await page.mouse.move(p.x, p.y, { steps: 14 });
    await page.waitForTimeout(500);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForURL((u) => u.pathname === ROOMS[f].href);
    await page.waitForTimeout(800);
    const tEnd = Date.now();
    const video = page.video()!;
    await ctx.close();
    const file = await video.path();
    expect(existsSync(file)).toBe(true);
    copyFileSync(file, path.join(OUT, "_video", "raw-sel.webm"));
    writeFileSync(path.join(OUT, "_video", "meta-sel.json"), JSON.stringify({ readyAt: (tReady - tCtx) / 1000, endAt: (tEnd - tCtx) / 1000 }));
  });
});

evidence("evidence: crystal redesign", () => {
  test.setTimeout(300_000);
  const MODES = ["leaguecraft", "pro-play", "combat-lab", "archives"] as const;

  /** Pin `mode` with the crystal (from rest) and let the iris and the projection settle. */
  async function pin(page: Page, mode: (typeof MODES)[number]) {
    const crystal = page.getByTestId("academy-core-crystal");
    while ((await page.getByTestId("academy-core-stage").getAttribute("data-focus")) !== "idle") await crystal.click();
    for (let i = 0; i <= MODES.indexOf(mode); i++) await crystal.click();
    await page.mouse.move(40, 300);
    await page.waitForTimeout(1600);
  }
  async function lensClip(page: Page, margin: number) {
    const c = (await page.locator(".acore-crystal").boundingBox())!;
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const h = c.width / 2 + margin;
    return { x: cx - h, y: cy - h, width: 2 * h, height: 2 * h };
  }

  test("evidence: crystal redesign stills (actual size, close-ups, all four modes, phones)", async ({ browser }) => {
    // actual desktop size (1x) — full frames and the crystal at its real size
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await open(page, 1366, 768, { real: true });
    for (const m of MODES) {
      await pin(page, m);
      if (m === "leaguecraft" || m === "pro-play") await page.screenshot({ path: path.join(OUT, `crystal-redesign-1366x768-${m}.png`) });
      await page.screenshot({ path: path.join(OUT, `crystal-redesign-actual-size-${m}.png`), clip: await lensClip(page, 60) });
    }
    await ctx.close();
    // close-ups (3x device pixels, same framing) of the two redesigned projections
    const hi = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 3 });
    const hp = await hi.newPage();
    await open(hp, 1366, 768, { real: true });
    for (const m of ["leaguecraft", "pro-play"] as const) {
      await pin(hp, m);
      await hp.screenshot({ path: path.join(OUT, `crystal-redesign-closeup-${m}.png`), clip: await lensClip(hp, 8) });
    }
    await hi.close();
    // phones
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mp = await mob.newPage();
    await open(mp, 390, 844, { real: true });
    for (const m of ["leaguecraft", "pro-play"] as const) {
      await pin(mp, m);
      const s = (await mp.getByTestId("academy-core-stage").boundingBox())!;
      await mp.screenshot({ path: path.join(OUT, `crystal-redesign-mobile-390x844-${m}.png`), clip: { x: 0, y: Math.max(0, s.y + s.height * 0.22), width: 390, height: s.height * 0.56 } });
    }
    await mob.close();
  });

  test("evidence: the crystal redesign recording", async ({ browser }) => {
    const videoDir = path.join(OUT, "_video");
    mkdirSync(videoDir, { recursive: true });
    const tCtx = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir: videoDir, size: { width: 1366, height: 768 } } });
    const page = await ctx.newPage();
    await open(page, 1366, 768, { real: true });
    const tReady = Date.now();
    const cr = (await page.getByTestId("academy-core-crystal").boundingBox())!;
    const cx = cr.x + cr.width / 2;
    const cy = cr.y + cr.height * 0.2;
    await page.mouse.move(60, 420);
    await page.waitForTimeout(1500);
    // crystal: Leaguecraft -> Pro Play, twice through the four rooms, holding on the two new ones
    for (let round = 0; round < 2; round++) {
      for (const m of MODES) {
        await page.mouse.click(cx, cy);
        await page.mouse.move(60, 420);
        await page.waitForTimeout(m === "leaguecraft" || m === "pro-play" ? 2600 : 1100);
      }
      await page.mouse.click(cx, cy); // rest
      await page.mouse.move(60, 420);
      await page.waitForTimeout(900);
    }
    // the arrows bring Leaguecraft and Pro Play round, and the crystal follows
    for (let k = 0; k < 2; k++) {
      await arrow(page, "left").click();
      await page.mouse.move(60, 420);
      await waitStill(page);
      await page.waitForTimeout(1800);
    }
    const tEnd = Date.now();
    const video = page.video()!;
    await ctx.close();
    const file = await video.path();
    expect(existsSync(file)).toBe(true);
    copyFileSync(file, path.join(OUT, "_video", "raw-crystal.webm"));
    writeFileSync(path.join(OUT, "_video", "meta-crystal.json"), JSON.stringify({ readyAt: (tReady - tCtx) / 1000, endAt: (tEnd - tCtx) / 1000 }));
  });
});

evidence("evidence: Leaguecraft roles and Lux", () => {
  test.setTimeout(300_000);

  /** The real Lux icon (asset host) decoded, so no still catches it mid-load. */
  async function luxReady(page: Page) {
    await page.waitForFunction(() => !!document.querySelector("[data-testid='academy-core-v35-lux-portrait']"), undefined, { timeout: 60_000 });
    await page.evaluate(async () => {
      const href = document.querySelector("[data-testid='academy-core-v35-lux-portrait']")!.getAttribute("href")!;
      const img = new Image();
      img.src = href;
      await img.decode();
    });
  }
  async function lensClip(page: Page, margin: number) {
    const c = (await page.locator(".acore-crystal").boundingBox())!;
    const h = c.width / 2 + margin;
    return { x: c.x + c.width / 2 - h, y: c.y + c.height / 2 - h, width: 2 * h, height: 2 * h };
  }
  /** Closed (pinned, nobody reaching), then the hover reveal halfway (~0.8 s) and fully open (~2.3 s). */
  async function states(page: Page, name: (s: string) => string, clip: { x: number; y: number; width: number; height: number } | null) {
    const shot = (s: string) => page.screenshot({ path: path.join(OUT, name(s)), ...(clip ? { clip } : {}) });
    await pinLeaguecraft(page);
    await page.waitForTimeout(900);
    await shot("closed");
    await reachLeaguecraft(page);
    await page.waitForTimeout(750);
    await shot("half");
    await page.waitForTimeout(1600);
    await shot("open");
    await page.mouse.move(40, 300, { steps: 2 });
    await page.waitForTimeout(1600);
    await shot("closed-again");
  }

  test("evidence: Leaguecraft stills (actual size, close-ups, phone, Pro Play regression)", async ({ browser }) => {
    // actual desktop size (1x): the full homepage frame, and the crystal at its real size
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await open(page, 1366, 768, { real: true });
    await luxReady(page);
    await states(page, (s) => `lcr-1366x768-${s}.png`, null);
    await page.reload();
    await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
    await luxReady(page);
    await states(page, (s) => `lcr-actual-size-${s}.png`, await lensClip(page, 40));
    // Pro Play, for regression comparison with lux-regression-actual-size-pro-play.png
    await page.getByTestId("academy-core-crystal").click();
    await page.mouse.move(40, 300);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(OUT, "lcr-regression-actual-size-pro-play.png"), clip: await lensClip(page, 60) });
    await ctx.close();
    // close-ups (3x device pixels)
    const hi = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 3 });
    const hp = await hi.newPage();
    await open(hp, 1366, 768, { real: true });
    await luxReady(hp);
    await states(hp, (s) => `lcr-closeup-${s}.png`, await lensClip(hp, 8));
    await hi.close();
    // phone (390x844 at 2x): pinned and closed; a tap on the book reveals her
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mp = await mob.newPage();
    await open(mp, 390, 844, { real: true });
    await luxReady(mp);
    // a phone has no hover: tap the crystal and leave the pointer there (parking it at the desktop helper's spot would hover a book)
    await mp.getByTestId("academy-core-crystal").click();
    await expect(mp.getByTestId("academy-core-stage")).toHaveAttribute("data-intent", "preview");
    await mp.waitForTimeout(1500);
    await mp.screenshot({ path: path.join(OUT, "lcr-mobile-390x844.png") });
    await mp.screenshot({ path: path.join(OUT, "lcr-mobile-390x844-closed.png"), clip: await lensClip(mp, 40) });
    await mob.close();
  });

  test("evidence: the Leaguecraft recording (hover and leave)", async ({ browser }) => {
    const videoDir = path.join(OUT, "_video");
    mkdirSync(videoDir, { recursive: true });
    const tCtx = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir: videoDir, size: { width: 1366, height: 768 } } });
    const page = await ctx.newPage();
    await open(page, 1366, 768, { real: true });
    await luxReady(page);
    const tReady = Date.now();
    const marks: Record<string, number> = {};
    const mark = (k: string) => { marks[k] = (Date.now() - tCtx) / 1000; };
    await page.mouse.move(40, 300);
    await page.waitForTimeout(1200);
    // 1. the crystal shows Leaguecraft: five roles, Lux concealed, nothing moving
    mark("pinned");
    await pinLeaguecraft(page);
    await page.waitForTimeout(3500);
    // 2. hover the Leaguecraft book: the iris opens slowly; then leave: it closes
    for (let i = 0; i < 2; i++) {
      mark(`hover${i + 1}`);
      await reachLeaguecraft(page);
      await page.waitForTimeout(3200);
      mark(`leave${i + 1}`);
      await page.mouse.move(40, 300, { steps: 6 });
      await page.waitForTimeout(2600);
    }
    // 3. without the crystal: hovering the book alone brings Leaguecraft up and reveals her; leaving returns to rest
    await page.getByTestId("academy-core-crystal").click(); // -> Pro Play
    for (let i = 0; i < 3; i++) { await page.getByTestId("academy-core-crystal").click(); await page.waitForTimeout(250); } // -> rest
    await page.mouse.move(40, 300);
    await page.waitForTimeout(1500);
    mark("hover-unpinned");
    await reachLeaguecraft(page);
    await page.waitForTimeout(3000);
    mark("leave-unpinned");
    await page.mouse.move(40, 300, { steps: 6 });
    await page.waitForTimeout(2000);
    const tEnd = Date.now();
    const video = page.video()!;
    await ctx.close();
    const file = await video.path();
    expect(existsSync(file)).toBe(true);
    copyFileSync(file, path.join(OUT, "_video", "raw-lcr.webm"));
    writeFileSync(path.join(OUT, "_video", "meta-lcr.json"), JSON.stringify({ readyAt: (tReady - tCtx) / 1000, endAt: (tEnd - tCtx) / 1000, marks }));
  });
});
