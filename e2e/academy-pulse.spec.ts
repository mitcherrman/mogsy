/**
 * Academy Pulse (PULSE-1): layout acceptance, interactions, reduced motion and
 * owner-review evidence on the real Orrery page (`/lol?pulse=1`, the dev
 * server's preview flag) and the scene lab (`/dev/academy-pulse`).
 *
 *   npx playwright test -c playwright.frontend.config.ts e2e/academy-pulse.spec.ts --workers=1
 *
 * Runs on GitHub's runner only (AGENTS.md: no local desktop browsers).
 * Evidence: test-results/academy-pulse/ (stills, the scene gallery, a motion
 * recording). MOCKS (disclosed): the Patch Report feed, the Daily status
 * (signed out) and Supabase are stubbed, as in the Orrery specs; the champion
 * manifest and art are REAL (the asset host) and may still be drawing in a
 * still. Pulse's content is the committed DEVELOPMENT FIXTURES.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("test-results/academy-pulse");
mkdirSync(path.join(OUT, "gallery"), { recursive: true });

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

type R = { x: number; y: number; width: number; height: number };
const box = async (page: Page, sel: string): Promise<R> => (await page.locator(sel).first().boundingBox())!;
// Cross-fades intentionally render both outgoing and incoming scenes briefly.
// The newest (last) scene is the current selection; it need not be unique.
const incomingScene = (page: Page) => page.getByTestId("academy-pulse-scene").last();

async function open(page: Page, width: number, height: number, pulse: boolean) {
  await page.setViewportSize({ width, height });
  await stub(page);
  await page.goto(`/lol?pulse=${pulse ? 1 : 0}`);
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(page.getByTestId("academy-veil")).toHaveCount(0, { timeout: 30_000 });
  if (pulse) await expect(page.getByTestId("academy-pulse")).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(900);
}

async function layoutFacts(page: Page) {
  return page.evaluate(() => {
    const r = (s: string) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom };
    };
    return {
      stage: r('[data-testid="academy-core-stage"]'),
      mast: r(".o35-masthead"),
      patch: r('[data-testid="academy-core-book"]'),
      strip: r('[data-testid="academy-radio-strip"]'),
      slot: r('[data-testid="academy-pulse-slot"]'),
      head: r(".apulse-head"),
      viewport: r('[data-testid="academy-pulse-viewport"]'),
      links: r(".o35-second-screen"),
      patchMobile: r('[data-testid="academy-core-book-mobile"]'),
      slotMobile: r('[data-testid="academy-pulse-slot-mobile"]'),
      selector: r('[data-testid="academy-core-selector"]'),
      compact: document.querySelector('[data-testid="academy-pulse-viewport"]')?.getAttribute("data-compact") ?? null,
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
    };
  });
}

/* ------------------------------------------------------------------ flag */

test("flag off: /lol keeps today's layout (dock under the Patch Report, no Pulse)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await stub(page);
  await page.goto("/lol");
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(page.getByTestId("academy-core-v35")).not.toHaveAttribute("data-pulse", "on");
  await expect(page.getByTestId("academy-radio-dock")).toBeVisible();
  await expect(page.getByTestId("academy-pulse-slot")).toHaveCount(0);
  await expect(page.getByTestId("academy-radio-strip")).toHaveCount(0);
});

/* ------------------------------------------------------------- desktop */

const DESKTOPS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1366x657-laptop-browser", width: 1366, height: 657 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1024x768", width: 1024, height: 768 },
];

test.describe("desktop: Pulse takes the left column under a slim radio; the Orrery does not move", () => {
  for (const vp of DESKTOPS) {
    test(`desktop ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height, false);
      const before = await layoutFacts(page);
      await open(page, vp.width, vp.height, true);
      const f = await layoutFacts(page);

      // the Orrery stage is exactly where it was
      for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(f.stage![k] - before.stage![k]), `stage ${k}`).toBeLessThanOrEqual(1);
      // no new scroll in either direction
      expect(f.sw, "no horizontal overflow").toBeLessThanOrEqual(vp.width + 1);
      expect(f.sh, "no new vertical scroll").toBeLessThanOrEqual(Math.max(before.sh, vp.height) + 1);
      // the column, top to bottom, without collisions
      expect(f.patch!.y).toBeGreaterThanOrEqual(f.mast!.bottom - 1);
      expect(f.strip!.y, "radio under the Patch Report").toBeGreaterThanOrEqual(f.patch!.bottom - 1);
      expect(f.head!.y, "Pulse's nameplate clears the radio").toBeGreaterThanOrEqual(f.strip!.bottom);
      expect(f.links!.y, "links under Pulse").toBeGreaterThanOrEqual(f.slot!.bottom - 1);
      expect(f.links!.bottom, "links on screen").toBeLessThanOrEqual(vp.height + 1);
      expect(f.strip!.h, "the radio is a slim strip").toBeLessThanOrEqual(44);
      expect(f.slot!.h, "Pulse has a usable height").toBeGreaterThanOrEqual(118);
      // short glass becomes the ticker; otherwise a full scene
      expect(f.compact).toBe(f.viewport!.h < 132 ? "true" : "false");
      // the Daily seal still answers clicks
      const d = await box(page, '[data-testid="academy-core-daily"]');
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="academy-core-daily"]') !== null, { x: d.x + d.width / 2, y: d.y + d.height / 2 });
      expect(hit, "Daily hit-testable").toBe(true);

      await page.screenshot({ path: path.join(OUT, `desktop-${vp.name}.png`) });
      const col = await box(page, ".o35-island");
      await page.screenshot({ path: path.join(OUT, `desktop-${vp.name}-column.png`), clip: { x: 0, y: 0, width: Math.ceil(col.x + col.width + 24), height: vp.height } });
    });
  }
});

/* ------------------------------------------------------ phones / tablet */

const PHONES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024-tablet", width: 768, height: 1024 },
  { name: "844x390-landscape", width: 844, height: 390 },
];

test.describe("phones and tablets: the Orrery's first screen is untouched; Pulse waits below it", () => {
  for (const vp of PHONES) {
    test(`stacked ${vp.name}`, async ({ page }) => {
      await open(page, vp.width, vp.height, false);
      const before = await layoutFacts(page);
      await open(page, vp.width, vp.height, true);
      const f = await layoutFacts(page);
      for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(f.stage![k] - before.stage![k]), `stage ${k}`).toBeLessThanOrEqual(1);
      expect(Math.abs(f.selector!.y - before.selector!.y), "the arrows stay put").toBeLessThanOrEqual(1);
      expect(Math.abs(f.slotMobile!.y - before.patchMobile!.y), "Pulse takes the Patch Report's place below the first screen").toBeLessThanOrEqual(24);
      expect(f.patchMobile!.y, "the Patch Report follows Pulse").toBeGreaterThan(f.slotMobile!.bottom);
      expect(f.sw, "no horizontal overflow").toBeLessThanOrEqual(vp.width + 1);
      await page.screenshot({ path: path.join(OUT, `stacked-${vp.name}-first-screen.png`) });
      await page.getByTestId("academy-pulse").scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `stacked-${vp.name}-pulse.png`) });
    });
  }
});

/* ----------------------------------------------------------- behaviour */

test.describe("behaviour at 1366x768", () => {
  test.beforeEach(async ({ page }) => { await open(page, 1366, 768, true); });

  test("controls move between scenes without moving the page; Pause holds; keyboard focus holds", async ({ page }) => {
    const pulse = page.getByTestId("academy-pulse");
    const slotBefore = await box(page, '[data-testid="academy-pulse-slot"]');
    await expect(incomingScene(page)).toHaveAttribute("data-category", "player-activity");
    await page.getByTestId("academy-pulse-next").click();
    await expect(incomingScene(page)).toHaveAttribute("data-category", "mini-game");
    await page.getByTestId("academy-pulse-next").click();
    await expect(incomingScene(page)).toHaveAttribute("data-category", "sponsor");
    await page.getByTestId("academy-pulse-prev").click();
    await expect(incomingScene(page)).toHaveAttribute("data-category", "mini-game");
    const slotAfter = await box(page, '[data-testid="academy-pulse-slot"]');
    expect(slotAfter).toEqual(slotBefore);

    // A real keyboard Tab (not scripted locator.focus after a mouse click)
    // creates :focus-visible and should hold the rotation.
    await page.getByTestId("academy-pulse-prev").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("academy-pulse-toggle")).toBeFocused();
    await expect(pulse).toHaveAttribute("data-playing", "false");
    // keyboard focus holds the clock, but the button still offers the viewer's own Pause (PULSE-1.2)
    await expect(page.getByTestId("academy-pulse-toggle")).toHaveAccessibleName("Pause Academy Pulse");
    // An intentional Pause persists after both pointer and focus leave.
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("academy-pulse-toggle")).toHaveAccessibleName("Play Academy Pulse");
    await page.mouse.move(900, 400);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(pulse).toHaveAttribute("data-playing", "false");
    // Play, then step away: nothing holds it any more
    await page.getByTestId("academy-pulse-toggle").click();
    await page.mouse.move(900, 400);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(pulse).toHaveAttribute("data-playing", "true");
  });

  test("PULSE-1.2: the mouse pauses on the first click and resumes on the next (data-holds diagnostics)", async ({ page }) => {
    const pulse = page.getByTestId("academy-pulse");
    const toggle = page.getByTestId("academy-pulse-toggle");
    await toggle.hover();
    await expect(pulse).toHaveAttribute("data-holds", "hover");
    await expect(toggle).toHaveAccessibleName("Pause Academy Pulse");
    await toggle.click();
    await expect(toggle).toHaveAccessibleName("Play Academy Pulse");
    await expect(pulse).toHaveAttribute("data-holds", /\buser\b/);
    // leaving keeps the viewer's Pause
    await page.mouse.move(900, 400);
    await expect(pulse).toHaveAttribute("data-holds", "user");
    await expect(pulse).toHaveAttribute("data-playing", "false");
    await toggle.click();
    await expect(toggle).toHaveAccessibleName("Pause Academy Pulse");
    await expect(pulse).toHaveAttribute("data-playing", "true");
  });

  test("PULSE-1.2: expanding and closing restores rotation; the next scene arrives on its own", async ({ page }) => {
    const pulse = page.getByTestId("academy-pulse");
    await page.getByTestId("academy-pulse-expand").click();
    await expect(pulse).toHaveAttribute("data-holds", /\bexpanded\b/);
    await page.getByTestId("pulse-expanded-close").click();
    await expect(page.getByTestId("pulse-expanded")).toHaveCount(0);
    await page.mouse.move(900, 400);
    await expect(pulse).toHaveAttribute("data-holds", "");
    const before = await incomingScene(page).getAttribute("data-category");
    await expect(incomingScene(page)).not.toHaveAttribute("data-category", before!, { timeout: 20_000 });
  });

  test("PULSE-1.2: mouse-opened expanded view closed with Escape does not leave rotation paused", async ({ page }) => {
    const pulse = page.getByTestId("academy-pulse");
    await page.getByTestId("academy-pulse-expand").click(); // mouse
    await expect(page.getByTestId("pulse-expanded")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pulse-expanded")).toHaveCount(0);
    await page.mouse.move(900, 400); // pointer leaves Pulse
    // past the 6 s hover grace: nothing may still hold the clock
    await expect(pulse).toHaveAttribute("data-holds", "", { timeout: 8_000 });
    await expect(pulse).toHaveAttribute("data-playing", "true");
    const before = await incomingScene(page).getAttribute("data-category");
    await expect(incomingScene(page)).not.toHaveAttribute("data-category", before!, { timeout: 20_000 });
  });

  test("PULSE-1.2: a keyboard-opened expanded view closed with Escape keeps the keyboard focus hold", async ({ page }) => {
    const pulse = page.getByTestId("academy-pulse");
    await page.getByTestId("academy-pulse-next").focus();
    await page.keyboard.press("Tab"); // the current pip
    await page.keyboard.press("Tab"); // Expand
    await expect(page.getByTestId("academy-pulse-expand")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("pulse-expanded")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pulse-expanded")).toHaveCount(0);
    await expect(page.getByTestId("academy-pulse-expand")).toBeFocused();
    await page.mouse.move(900, 400);
    await page.waitForTimeout(7_000);
    await expect(pulse).toHaveAttribute("data-holds", "focus");
  });

  test("hovering holds the rotation; leaving lets it go", async ({ page }) => {
    const pulse = page.getByTestId("academy-pulse");
    const b = await box(page, '[data-testid="academy-pulse-viewport"]');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(pulse).toHaveAttribute("data-playing", "false");
    await page.mouse.move(900, 400);
    await expect(pulse).toHaveAttribute("data-playing", "true");
  });

  test("a clicked Next button does not leave a permanent focus pause; auto advances again", async ({ page }) => {
    const pulse = page.getByTestId("academy-pulse");
    await page.getByTestId("academy-pulse-next").click();
    await expect(page.getByTestId("academy-pulse-scene").last()).toHaveAttribute("data-category", "mini-game");
    // A real mouse click focuses the button. Leaving with the mouse must not
    // preserve a keyboard hold forever.
    await page.mouse.move(900, 400);
    await expect(pulse).toHaveAttribute("data-playing", "true");
    await expect(page.getByTestId("academy-pulse-scene").last()).toHaveAttribute("data-category", "sponsor", { timeout: 21_000 });
  });

  test("hover pauses briefly but an idle parked cursor never freezes rotation", async ({ page }) => {
    const pulse = page.getByTestId("academy-pulse");
    const b = await box(page, '[data-testid="academy-pulse-viewport"]');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(pulse).toHaveAttribute("data-playing", "false");
    await expect(pulse).toHaveAttribute("data-playing", "true", { timeout: 10_000 });
    // While hovering, the button still offers the viewer's Pause (PULSE-1.2): the first click
    // pauses; Play then resumes at once and clears the hover pause too.
    await page.mouse.move(900, 400);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(pulse).toHaveAttribute("data-playing", "false");
    await expect(page.getByTestId("academy-pulse-toggle")).toHaveAccessibleName("Pause Academy Pulse");
    await page.getByTestId("academy-pulse-toggle").click();
    await expect(page.getByTestId("academy-pulse-toggle")).toHaveAccessibleName("Play Academy Pulse");
    await page.getByTestId("academy-pulse-toggle").click();
    await expect(pulse).toHaveAttribute("data-playing", "true");
    await expect(page.getByTestId("academy-pulse-toggle")).toHaveAccessibleName("Pause Academy Pulse");
  });

  test("the practice question answers in place; the expanded view opens and closes with Escape", async ({ page }) => {
    await page.getByRole("button", { name: "Scene 9: Quick study" }).click();
    await expect(incomingScene(page)).toHaveAttribute("data-scene", "question");
    await page.getByTestId("pulse-question-option-lux").click();
    await expect(page.getByTestId("pulse-question-option-ahri")).toHaveAttribute("data-state", "right");
    await expect(page.getByTestId("academy-pulse")).toHaveAttribute("data-playing", "false");
    await page.screenshot({ path: path.join(OUT, "interaction-question-answered.png"), clip: { x: 0, y: 380, width: 440, height: 388 } });

    await page.getByTestId("academy-pulse-expand").click();
    await expect(page.getByTestId("pulse-expanded")).toBeVisible();
    await page.waitForTimeout(700); // its entrance (toBeVisible counts opacity 0 as visible)
    await page.screenshot({ path: path.join(OUT, "interaction-expanded.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pulse-expanded")).toHaveCount(0);
    await expect(page.getByTestId("academy-pulse-expand")).toBeFocused();
  });

  test("leaderboard rows can be inspected; a creator opens the viewer, which loads no third-party player for a sample", async ({ page }) => {
    await page.getByRole("button", { name: "Scene 4: Leaderboard" }).click();
    await expect(incomingScene(page)).toHaveAttribute("data-scene", "leaderboard");
    await page.waitForTimeout(1800); // the climb
    await page.getByTestId("pulse-board-row-2").click();
    await expect(page.getByRole("dialog", { name: /FrostfireFox details/ })).toBeVisible();
    await page.waitForTimeout(700); // the card's turn-in
    await page.screenshot({ path: path.join(OUT, "interaction-leaderboard-inspect.png"), clip: { x: 0, y: 380, width: 440, height: 388 } });

    const thirdParty: string[] = [];
    page.on("request", (r) => { if (/youtube|ytimg|twitch/.test(r.url())) thirdParty.push(r.url()); });
    await page.getByRole("button", { name: "Scene 10: Creator spotlight" }).click();
    await page.getByTestId("pulse-creator-watch").click();
    await expect(page.getByTestId("pulse-viewer")).toBeVisible();
    await page.getByTestId("pulse-viewer-play").click();
    await expect(page.getByTestId("pulse-viewer")).toContainText("Academy Radio is paused while this plays.");
    await page.screenshot({ path: path.join(OUT, "interaction-creator-viewer.png") });
    expect(thirdParty).toEqual([]);
  });
});

test("reduced motion: Pulse starts paused and every change is a cross-fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, 1366, 768, true);
  await expect(page.getByTestId("academy-pulse")).toHaveAttribute("data-reduced", "true");
  await expect(page.getByTestId("academy-pulse-toggle")).toHaveAccessibleName("Play Academy Pulse");
  await page.getByTestId("academy-pulse-next").click();
  await expect(incomingScene(page)).toHaveAttribute("data-category", "mini-game");
  await expect(page.locator(".apulse-flare")).toHaveCount(0);
  await page.screenshot({ path: path.join(OUT, "reduced-motion-1366x768.png") });
});

/* -------------------------------------------- owner review: the gallery */

const SCENES = [
  "fx-activity-flawless", "fx-activity-streak", "fx-minigame-dial", "fx-sponsor-placeholder", "fx-leaderboard-daily",
  "fx-news-hover", "fx-premium-lead", "fx-insight-week", "fx-question-fox", "fx-creator-video", "fx-creator-stream",
  "fx-challenge-baron", "fx-event-showcase",
];

test("gallery: every scene at the sizes the Home Hub gives Pulse", async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1000, height: 1100 });
  for (const size of ["desktop", "tall", "short", "mobile"]) {
    for (const id of SCENES) {
      await page.goto(`/dev/academy-pulse?scene=${id}&size=${size}&zoom=2&still=1`);
      const frame = page.getByTestId("pulse-lab-frame");
      await expect(frame.getByTestId("academy-pulse")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(id.includes("leaderboard") ? 1900 : 500);
      await frame.screenshot({ path: path.join(OUT, "gallery", `${size}-${id}.png`) });
    }
  }
});

/* ---------------------------------------------- owner review: motion */

test("motion recording: a full Pulse cycle on the Orrery at 1366x768", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: { dir: path.join(OUT, "video"), size: { width: 1366, height: 768 } },
  });
  const page = await context.newPage();
  try {
    await open(page, 1366, 768, true);
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(2600);
      await page.getByTestId("academy-pulse-next").click();
      await page.mouse.move(900, 400);
    }
    await page.waitForTimeout(2600);
  } finally {
    await context.close();
  }
});
