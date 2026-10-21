/**
 * Seamless top HUD: the Orrery's sky reaches the top edge of the viewport and
 * the HUD floats in it, with no geometry change on the page.
 *
 *   SEAMLESS_LABEL=after npx playwright test -c playwright.frontend.config.ts e2e/academy-seamless-hud.spec.ts --workers=1
 *
 * Runs on GitHub's runner only (AGENTS.md: no local desktop browsers). The
 * workflow runs this spec twice: on the PR's base source (SEAMLESS_LABEL=before)
 * and on the head (SEAMLESS_LABEL=after). Every case writes screenshots and a
 * geometry record to test-results/seamless-hud/<label>/; the treatment's own
 * assertions run only on `after`, and e2e/academy-seamless-hud-compare.mjs then
 * asserts that the page geometry is identical between the two runs.
 *
 * MOCKS (disclosed): the Patch Report feed, the Daily status (signed out) and
 * Supabase are stubbed, as in the masthead spec. Cover art is REAL.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const LABEL = process.env.SEAMLESS_LABEL === "before" ? "before" : "after";
const AFTER = LABEL === "after";
const OUT = path.resolve("test-results/seamless-hud", LABEL);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "390x844", width: 390, height: 844 },
  { name: "320x568", width: 320, height: 568 },
  { name: "740x360", width: 740, height: 360 },
];

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

/** Header band height in px, as the shell resolves it. */
const bandPx = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:var(--app-header-h)";
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h;
  });

/** Everything that must NOT move: the page's content boxes and document size. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const r = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(1), y: +(b.y + scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    };
    return {
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      stage: r('[data-testid="academy-core-stage"]'),
      masthead: r('[data-testid="academy-core-masthead"]'),
      daily: r('[data-testid="academy-core-daily"]'),
      selector: r(".o35-hero > .o35-selector"),
      patch: r('[data-testid="academy-core-book"]'),
      hudHome: r('[data-testid="hud-home"]'),
      hudControls: r('[data-testid="global-hud-controls"]'),
      heroBottom: (() => { const b = document.querySelector(".o35-hero")!.getBoundingClientRect(); return +(b.bottom + scrollY).toFixed(1); })(),
    };
  });

/**
 * Seam score: how different the pixel rows just above and just below the
 * band's lower edge are, compared with an ordinary pair of rows a little lower
 * in the sky. Measured on the screenshot itself, in the band's empty middle
 * (between the home control and the right cluster). ~1 = no seam.
 */
async function seamScore(page: Page, png: Buffer, band: number) {
  const left = await page.getByTestId("hud-home").boundingBox();
  const right = await page.locator(".global-hud-right").boundingBox();
  const x0 = Math.ceil((left?.x ?? 0) + (left?.width ?? 0) + 8);
  const x1 = Math.floor((right?.x ?? page.viewportSize()!.width) - 8);
  return page.evaluate(async ({ b64, band, x0, x1 }) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const w = Math.max(1, x1 - x0);
    const row = (y: number) => ctx.getImageData(x0, y, w, 1).data;
    const diff = (ya: number, yb: number) => {
      const a = row(ya), bb = row(yb);
      let s = 0;
      for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - bb[i]) + Math.abs(a[i + 1] - bb[i + 1]) + Math.abs(a[i + 2] - bb[i + 2]);
      return s / (a.length / 4) / 3;
    };
    const y = Math.round(band);
    const across = diff(y - 2, y + 1);
    const ordinary = (diff(y + 6, y + 9) + diff(y + 12, y + 15)) / 2;
    return { across: +across.toFixed(2), ordinary: +ordinary.toFixed(2), x0, x1 };
  }, { b64: png.toString("base64"), band, x0, x1 });
}

/** Every HUD control answers a click at its centre (nothing paints over it). */
async function hudHitTargets(page: Page) {
  return page.evaluate(() => {
    const ids = ["hud-home", "hud-signup-chip", "academy-radio-hud-trigger", "hud-page-report", "hud-profile", "hud-notifications-trigger"];
    const out: Record<string, string> = {};
    for (const id of ids) {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) { out[id] = "missing"; continue; }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[id] = hit && (hit === el || el.contains(hit)) ? "ok" : `covered by ${hit?.tagName}.${(hit as HTMLElement | null)?.className}`;
    }
    return out;
  });
}

const records: Record<string, unknown> = {};
test.afterAll(() => {
  writeFileSync(path.join(OUT, "geometry.json"), JSON.stringify(records, null, 2));
});

test.describe(`seamless HUD (${LABEL})`, () => {
  for (const vp of VIEWPORTS) {
    test(`/lol ${vp.name}: sky to the top edge, HUD floating, geometry held`, async ({ page }) => {
      await open(page, vp.width, vp.height);
      const band = await bandPx(page);
      const png = await page.screenshot({ path: path.join(OUT, `lol-${vp.name}.png`) });
      await page.screenshot({ path: path.join(OUT, `lol-${vp.name}-band.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, Math.round(band * 2.5)) } });
      const seam = await seamScore(page, png, band);
      const hits = await hudHitTargets(page);
      const envTop = (await page.getByTestId("academy-core-v35-env").boundingBox())!.y;
      records[vp.name] = { band, seam, hits, envTop, geometry: await geometry(page) };

      // never: Ranked, horizontal scroll, a HUD control covered
      await expect(page.getByTestId("academy-core-ranked")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), "no horizontal overflow").toBeLessThanOrEqual(vp.width + 1);
      for (const [id, v] of Object.entries(hits)) expect(v, id).toBe("ok");
      // the HUD stays above the page
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".global-hud")!).zIndex)).toBe("50");

      if (AFTER) {
        expect(envTop, "the sky starts at the viewport's top edge").toBeLessThanOrEqual(0.5);
        expect(seam.across, `no seam at the band edge (${JSON.stringify(seam)})`).toBeLessThanOrEqual(Math.max(4, seam.ordinary * 4));
      }
    });
  }

  test("menus overlay the Orrery and close; focus order and rings intact (1366x768)", async ({ page }) => {
    await open(page, 1366, 768);
    // keyboard: the first Tab stop is still the home control, with a visible focus treatment
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid)).toBe("hud-home");
    await page.screenshot({ path: path.join(OUT, "focus-home-1366.png"), clip: { x: 0, y: 0, width: 420, height: 140 } });
    // notifications / guest panel
    await page.getByTestId("hud-notifications-trigger").click();
    const panel = page.getByTestId("hud-guest-panel");
    await expect(panel).toBeVisible();
    const pb = (await panel.boundingBox())!;
    const onTop = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit?.closest('[data-testid="hud-guest-panel"]');
    }, { x: pb.x + pb.width / 2, y: pb.y + Math.min(pb.height / 2, 40) });
    expect(onTop, "the panel paints above the Orrery").toBe(true);
    await page.screenshot({ path: path.join(OUT, "menu-identity-1366.png") });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    // radio panel
    await page.getByTestId("academy-radio-hud-trigger").click();
    await expect(page.getByTestId("academy-radio-panel-hud")).toBeVisible();
    await page.screenshot({ path: path.join(OUT, "menu-radio-1366.png") });
    await page.keyboard.press("Escape");
    // report panel
    await page.getByTestId("hud-page-report").click();
    await expect(page.getByTestId("hud-page-report-panel")).toBeVisible();
    await page.screenshot({ path: path.join(OUT, "menu-report-1366.png") });
    await page.keyboard.press("Escape");
  });

  test("phone menu overlays (390x844)", async ({ page }) => {
    await open(page, 390, 844);
    await page.getByTestId("hud-notifications-trigger").click();
    await expect(page.getByTestId("hud-guest-panel")).toBeVisible();
    await page.screenshot({ path: path.join(OUT, "menu-identity-390.png") });
  });

  test("scrolling: the page passes under the floating HUD (1366x768, 390x844)", async ({ page }) => {
    for (const [w, h] of [[1366, 768], [390, 844]]) {
      await open(page, w, h);
      await page.mouse.wheel(0, Math.round(h * 0.6));
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `scrolled-${w}x${h}.png`) });
      for (const [id, v] of Object.entries(await hudHitTargets(page))) expect(v, id).toBe("ok");
      expect((await page.getByTestId("hud-home").boundingBox())!.y, "the HUD stays at the top").toBeLessThan(12);
    }
  });

  test("startup: the held veil hands off to a sky that already fills the band (1366x768)", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stub(page);
    await page.goto("/lol");
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, "startup-250ms.png") });
    await expect(page.getByTestId("academy-veil")).toHaveCount(0, { timeout: 30_000 });
    await page.screenshot({ path: path.join(OUT, "startup-lifted.png") });
    if (AFTER) expect((await page.getByTestId("academy-core-v35-env").boundingBox())!.y).toBeLessThanOrEqual(0.5);
  });

  test("reduced motion (1366x768, 390x844)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [w, h] of [[1366, 768], [390, 844]]) {
      await open(page, w, h);
      await expect(page.getByTestId("academy-core-v35")).toHaveAttribute("data-reduced", "true");
      await page.screenshot({ path: path.join(OUT, `reduced-${w}x${h}.png`) });
      if (AFTER) expect((await page.getByTestId("academy-core-v35-env").boundingBox())!.y).toBeLessThanOrEqual(0.5);
    }
  });

  test("other routes keep their own header: /quiz and /lol/hall", async ({ page }) => {
    await page.addInitScript(() => { try { sessionStorage.setItem("quiz:gate:hub_visited", "1"); } catch { /* */ } });
    for (const vp of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await stub(page);
      for (const route of ["/quiz", "/lol/hall"]) {
        await page.goto(route);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1500);
        expect(new URL(page.url()).pathname, "stayed on the route").toBe(route);
        await expect(page.locator(".o35-root")).toHaveCount(0);
        const mainTop = await page.evaluate(() => document.querySelector("main")!.getBoundingClientRect().top + scrollY);
        const band = await bandPx(page);
        expect(Math.abs(mainTop - band), `${route}: <main> still starts below the band`).toBeLessThanOrEqual(0.5);
        const slug = route.replace(/\//g, "_");
        await page.screenshot({ path: path.join(OUT, `route${slug}-${vp.width}x${vp.height}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 220) } });
      }
    }
  });
});
