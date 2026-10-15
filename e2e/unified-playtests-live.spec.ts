/**
 * UGMP — Admin → Leaguecraft → Ranked → Playtests against a REAL local backend
 * (`League_Combat_Simulator` api_server:app), in a real browser.
 *
 * What is real: every request the hub and the modes make — the status read, the
 * interaction-lab sessions, soundings, locks and clue images, the numeric-lab
 * rounds and locks, and the Ranked queue join for preset playtests — reaches
 * the backend's own routes and `require_admin`. What is simulated, on the
 * backend only: `owner_auth_state()` answers "owner" for an HS256 token the
 * backend has already verified, and the owner's queue switches read open
 * (there is no Supabase locally). The browser presents that token through the
 * DEV-only E2E identity seam (`VITE_E2E_AUTH=1`).
 *
 *   UGMP_E2E_PERSONA  persona JSON ({token, user, admin:true}) minted for that backend
 *   UGMP_E2E_API      the backend's base URL (for forfeiting launched matches)
 *   UGMP_SHOTS        screenshot directory (optional)
 *
 * Skipped without a persona: it never runs against production.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PERSONA_PATH = process.env.UGMP_E2E_PERSONA ?? "";
const API = process.env.UGMP_E2E_API ?? "";
const SHOTS = process.env.UGMP_SHOTS ?? path.resolve("test-results/unified-playtests");
mkdirSync(SHOTS, { recursive: true });
test.skip(!PERSONA_PATH || !API, "UGMP_E2E_PERSONA / UGMP_E2E_API not set: no local backend");
const persona = PERSONA_PATH ? readFileSync(PERSONA_PATH, "utf8") : "{}";
const token: string = PERSONA_PATH ? JSON.parse(persona).token : "";

const HUB = "/admin/leaguecraft?section=ranked&view=playtests";
const VIEWPORTS = [
  { name: "phone-360x640", width: 360, height: 640, touch: true },
  { name: "phone-390x844", width: 390, height: 844, touch: true },
  { name: "laptop-1366x768", width: 1366, height: 768, touch: false },
  { name: "desktop-1920x1080", width: 1920, height: 1080, touch: false },
];
const MODES = ["Rangefinder", "Glyph Press", "Roster Lock", "Draft Memory", "Chronoscope", "Stat Drop", "Combat Estimate", "Match Grid", "Reconstruct", "Order Forge"];

async function noSideScroll(page: Page) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
  expect(w.doc, "no sideways page scroll").toBeLessThanOrEqual(w.vw + 1);
}

/**
 * The instrument is really on screen: its centre is not covered or clipped
 * (hit-test), and it has a usable size. A clipped stage still "passes" a
 * visibility check, which is exactly how a collapsed phone stage hides.
 */
async function instrumentReachable(page: Page, testId: string, minHeight: number) {
  const el = page.getByTestId(testId);
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  expect(box.height, `${testId} height`).toBeGreaterThanOrEqual(minHeight);
  const hit = await page.evaluate((id) => {
    const e = document.querySelector(`[data-testid="${id}"]`)!;
    const b = e.getBoundingClientRect();
    const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!at && (e === at || e.contains(at));
  }, testId);
  expect(hit, `${testId} centre is reachable`).toBe(true);
}

async function openHub(page: Page) {
  await page.goto(HUB);
  const grid = page.getByTestId("playtest-mode-grid");
  await grid.waitFor({ timeout: 90_000 });
  await expect(page.getByTestId("rangefinder-launch")).toHaveAttribute("data-available", "true", { timeout: 30_000 });
  return grid;
}

async function backToHub(page: Page) {
  await page.getByTestId("playtest-back").click();
  await expect(page.getByTestId("playtest-mode-grid")).toBeVisible({ timeout: 60_000 });
}

/** Turns Glyph Press's drum until a tile is wholly in its window (as the WP1 spec does). */
async function reachTile(page: Page, glyph: string) {
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(220);
    const side = await page.evaluate((g) => {
      const t = document.querySelector(`[data-testid="gp-tile-${g}"]`)!.getBoundingClientRect();
      const w = document.querySelector('[data-testid="gp-drum-window"]')!.getBoundingClientRect();
      if (t.left < w.left + 12) return "prev";
      if (t.right > w.right - 12) return "next";
      return "in";
    }, glyph);
    if (side === "in") return page.getByTestId(`gp-tile-${glyph}`);
    await page.getByTestId(side === "prev" ? "gp-drum-prev" : "gp-drum-next").click();
  }
  throw new Error(`the drum never brought ${glyph} into the window`);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((p) => { localStorage.setItem("mogsy_e2e_identity", p); }, persona);
});

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });

    test("the hub lists every mode, each playable on this backend", async ({ page }) => {
      const grid = await openHub(page);
      await expect(grid.getByRole("heading")).toHaveText(MODES);
      for (const id of ["rangefinder", "glyph-press", "stat-drop", "combat-estimate"]) {
        await expect(page.getByTestId(`${id}-launch`)).toHaveAttribute("data-available", "true");
      }
      for (const id of ["rangefinder", "glyph-press", "roster-lock", "draft-memory", "scrub", "stat-drop", "combat-estimate", "match-grid", "reconstruct", "order-forge"]) {
        const box = (await page.getByTestId(`${id}-launch-button`).boundingBox())!;
        expect(box.height, `${id} Play target`).toBeGreaterThanOrEqual(36);
      }
      await noSideScroll(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-hub.png`), fullPage: true });
    });

    test("Rangefinder: Play → place → Lock → server reveal → Next → back to Playtests", async ({ page }) => {
      await openHub(page);
      await page.getByTestId("rangefinder-launch-button").click();
      await expect(page).toHaveURL(/\/admin\/playtests\/rangefinder$/);
      const root = page.getByTestId("rangefinder-owner");
      await root.waitFor({ timeout: 60_000 });
      await expect(page.getByTestId("rangefinder-owner-counter")).toHaveText("Round 1 / 10");
      expect(await root.evaluate((e) => e.outerHTML.includes("castRangeUnits"))).toBe(false);
      await instrumentReachable(page, "rangefinder-field", 200);
      await instrumentReachable(page, "rangefinder-lock", 36);
      const field = page.getByTestId("rangefinder-field");
      if (vp.touch) {
        const fb = (await field.boundingBox())!;
        await page.touchscreen.tap(fb.x + fb.width / 2, fb.y + fb.height / 3);
      } else {
        await field.focus();
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowLeft");
      }
      await expect(page.getByTestId("rangefinder-reading-value")).not.toHaveText("—");
      const lock = page.waitForResponse((r) => r.url().includes("/api/admin/interaction-lab/rangefinder/sessions/") && r.url().endsWith("/rounds/0/lock"));
      await page.getByTestId("rangefinder-lock").click();
      expect((await lock).status()).toBe(200);
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 10_000 });
      await noSideScroll(page);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-rangefinder-revealed.png`), fullPage: true });
      await page.getByTestId("rangefinder-owner-next").click();
      await expect(page.getByTestId("rangefinder-owner-counter")).toHaveText("Round 2 / 10");
      await expect(root).toHaveAttribute("data-phase", "open");
      await backToHub(page);
    });

    test("Glyph Press: Play → private clue → sound → set → Lock → server reveal → back", async ({ page }) => {
      await openHub(page);
      await page.getByTestId("glyph-press-launch-button").click();
      await expect(page).toHaveURL(/\/admin\/playtests\/glyph-press$/);
      const root = page.getByTestId("glyph-press-owner");
      await root.waitFor({ timeout: 60_000 });
      // The clue arrived through the owner-authenticated endpoint, as a blob.
      const img = page.locator('[data-testid="glyph-press-owner-viewport"] img').first();
      if (await img.count()) {
        await expect(img).toHaveAttribute("src", /^blob:/);
        expect(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
      }
      await instrumentReachable(page, "gp-bed", 100);
      await instrumentReachable(page, "gp-drum-window", 36);
      const sound = page.waitForResponse((r) => r.url().endsWith("/rounds/0/sound"));
      await page.getByTestId("gp-sound").click();
      if (vp.touch) await (await reachTile(page, "E")).click();
      else await page.keyboard.press("e");
      expect((await sound).status()).toBe(200);
      await expect(page.getByTestId("gp-tile-E")).toHaveAttribute("data-state", /sounded|tarnished/, { timeout: 5000 });
      if (vp.touch) {
        await (await reachTile(page, "A")).click();
      } else {
        await page.getByTestId("gp-forme").focus();
        await page.keyboard.type("ar");
      }
      const lock = page.waitForResponse((r) => r.url().endsWith("/rounds/0/lock"));
      await page.getByTestId("gp-lock").click();
      expect((await lock).status()).toBe(200);
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 10_000 });
      await expect(page.getByTestId("gp-answer")).not.toHaveText("");
      await noSideScroll(page);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-glyph-press-revealed.png`), fullPage: true });
      await page.getByTestId("glyph-press-owner-next").click();
      await expect(page.getByTestId("glyph-press-owner-counter")).toHaveText("Round 2 / 9");
      await backToHub(page);
    });

    test("Stat Drop: Play → Lock → historical value revealed, no grade → back", async ({ page }) => {
      await openHub(page);
      await page.getByTestId("stat-drop-launch-button").click();
      await expect(page).toHaveURL(/\/admin\/playtests\/stat-drop$/);
      const root = page.getByTestId("owner-stat-drop");
      await root.waitFor({ timeout: 60_000 });
      if (vp.touch) {
        const box = (await page.getByTestId("drop-range").boundingBox())!;
        await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height / 2);
      } else {
        await page.getByRole("slider").focus();
        for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
      }
      await page.getByTestId("drop-lock").click();
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 10_000 });
      await expect(page.getByTestId("drop-true-flag")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/\b(Correct|Incorrect|Passed|Failed)\b/);
      await noSideScroll(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-stat-drop-revealed.png`), fullPage: true });
      await backToHub(page);
    });

    test("Combat Estimate: Play → set the balance → Lock → captured value revealed, no grade → back", async ({ page }) => {
      await openHub(page);
      await page.getByTestId("combat-estimate-launch-button").click();
      await expect(page).toHaveURL(/\/admin\/playtests\/combat-estimate$/);
      const root = page.getByTestId("owner-combat-estimate");
      await root.waitFor({ timeout: 60_000 });
      if (vp.touch) {
        const coarse = (await page.getByTestId("estimate-coarse-rail").boundingBox())!;
        await page.touchscreen.tap(coarse.x + coarse.width * 0.4, coarse.y + coarse.height / 2);
        await page.getByTestId("estimate-plus-10").tap();
      } else {
        await page.getByTestId("estimate-board").focus();
        for (let i = 0; i < 3; i++) await page.keyboard.press("PageUp");
      }
      await page.getByTestId("estimate-lock").dblclick();
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 10_000 });
      await expect(page.getByTestId("estimate-truth-value")).not.toHaveText("—");
      await expect(page.locator("body")).not.toContainText(/\b(Correct|Incorrect|Passed|Failed)\b/);
      await noSideScroll(page);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-combat-estimate-revealed.png`), fullPage: true });
      await backToHub(page);
    });
  });
}

test.describe("Ranked Bot presets from the hub (laptop-1366x768)", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  for (const [id, preset] of [
    ["roster-lock", "admin.roster_lock"], ["draft-memory", "admin.draft_memory"], ["scrub", "admin.scrub"],
    ["match-grid", "admin.match"], ["reconstruct", "admin.reconstruct"], ["order-forge", "admin.order_forge"],
  ] as const) {
    test(`${id}: Play starts an unrated Ranked Bot match through the real queue, the arena offers the way back`, async ({ page, request }) => {
      await openHub(page);
      const join = page.waitForResponse((r) => r.url().includes("/api/ranked/queue") && r.request().method() === "POST");
      await page.getByTestId(`${id}-launch-button`).click();
      const res = await join;
      expect(res.status(), await res.text()).toBe(200);
      const body = await res.json();
      expect(JSON.parse(res.request().postData() ?? "{}").preset).toBe(preset);
      const matchId: string = body.payload?.match_id ?? body.match_id;
      expect(matchId).toBeTruthy();
      let conceded = false;
      const concede = async () => {
        // Concede, so the next launch is a fresh match (disposable DB only).
        const f = await request.post(`${API}/api/ranked/matches/${encodeURIComponent(matchId)}/forfeit`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(f.status()).toBe(200);
        conceded = true;
      };
      try {
        await expect(page).toHaveURL(/\/quiz\/ranked$/);
        await page.locator('[data-testid="ranked-match"]').waitFor({ timeout: 90_000 });
        // While live, the route's back control leaves for Playtests (behind the leave guard).
        await expect(page.getByTestId("ranked-back-to-quiz")).toHaveAttribute("href", HUB, { timeout: 30_000 });
        await page.screenshot({ path: path.join(SHOTS, `preset-${id}.png`) });
        // Once the match is over, the result screen's primary action returns to Playtests.
        await concede();
        const back = page.getByRole("button", { name: "Back to Playtests" });
        await expect(back).toBeVisible({ timeout: 90_000 });
        await back.click();
        await expect(page.getByTestId("playtest-mode-grid")).toBeVisible({ timeout: 60_000 });
      } finally {
        if (!conceded) await concede();
      }
    });
  }
});
