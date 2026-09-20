import { expect, test, type Page } from "@playwright/test";
import { INDEX_FIXTURE } from "../src/lib/mechanics-tables/fixtures";

declare global {
  interface Window { __surfaceSfxOscillators: number }
}

async function instrumentSynths(page: Page) {
  await page.addInitScript(() => {
    window.__surfaceSfxOscillators = 0;
    const Native = window.AudioContext;
    if (!Native) return;
    const create = Native.prototype.createOscillator;
    Native.prototype.createOscillator = function (...args) {
      const oscillator = create.apply(this, args);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (...startArgs) => {
        window.__surfaceSfxOscillators += 1;
        return start(...startArgs);
      };
      return oscillator;
    };
  });
}

async function oscillatorCount(page: Page) {
  return page.evaluate(() => window.__surfaceSfxOscillators);
}

async function mockCombat(page: Page) {
  let actions = 0;
  await page.addInitScript(() => {
    localStorage.setItem("combat-lab:last-config", JSON.stringify({ champion: "Aatrox" }));
  });
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/api/health")) return json({ ok: true, status: "ok" });
    if (url.includes("/api/meta/combat-lab-actions")) return json({ ok: true, actions: [] });
    if (url.includes("/api/meta/champions")) return json({ champions: [] });
    if (url.includes("/api/meta/items")) return json({ items: [] });
    if (url.includes("/api/meta/runes")) return json({ runes: [] });
    if (url.includes("/api/meta/target-profiles")) return json({ target_profiles: [] });
    if (url.includes("/api/meta/summoners")) return json({ summoners: [] });
    if (url.includes("/api/meta/options")) return json({});
    if (url.includes("/api/combat-lab/basic-attack")) {
      actions += 1;
      if (actions === 2) return json({ detail: "Browser QA refusal" }, 500);
      return json({
        ok: true,
        result: {
          state: { states: { TARGET_REMAINING_HP: 3893 } },
          events: [{ type: "damage_packet", source: "Basic Attack", final_damage: 107, damage_type: "physical" }],
          remaining_by_scope: { PRIMARY: { current_hp: 3893, max_hp: 4000 } },
          target_stats: { TARGET_MAX_HP: 4000, HP: 4000 },
          attacker_stats: {},
        },
      });
    }
    return json({});
  });
}

async function mockArchives(page: Page) {
  await page.route("**/api/mechanics/tables**", async (route) => {
    const url = route.request().url();
    const pathname = new URL(url).pathname;
    if (!pathname.includes("/study/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(INDEX_FIXTURE) });
    }
    const tableId = decodeURIComponent(url.split("/study/")[1] ?? "fixture.study.row");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        table_id: tableId, category: tableId.split(".")[0], title: tableId,
        subtitle: "", patch: "26.15", verified_through: "26.15",
        source_table_ids: [tableId], columns: [], sections: [], rows: [], notes: [],
      }),
    });
  });
}

for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile touch" : "desktop", () => {
    test.use(mobile
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 1280, height: 720 } });

    test("Combat resolves and refuses exactly at visible action outcomes", async ({ page }) => {
      await instrumentSynths(page);
      await mockCombat(page);
      await page.goto("/combat-lab", { waitUntil: "domcontentloaded" });
      const action = page.getByRole("button", { name: /^Basic Attack\s*Auto-attack the primary target$/i });
      await expect(action).toBeVisible();
      expect(await oscillatorCount(page)).toBe(0);

      await action.click();
      await expect(page.getByText("PHYSICAL DAMAGE", { exact: true })).toBeVisible();
      await expect.poll(() => oscillatorCount(page), { timeout: 1_000 }).toBeGreaterThan(0);

      const afterResolve = await oscillatorCount(page);
      await action.click();
      await expect(page.getByText("Browser QA refusal")).toBeVisible();
      await expect.poll(() => oscillatorCount(page), { timeout: 1_000 }).toBeGreaterThan(afterResolve);
    });

    test("Archives and Pro Play stay silent until a meaningful handoff", async ({ page }) => {
      await instrumentSynths(page);
      await mockArchives(page);
      await page.goto("/lol/docs/mechanics", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Mechanics Reference" })).toBeVisible();
      expect(await oscillatorCount(page)).toBe(0);
      await page.getByRole("link", { name: /Minion waves/ }).click();
      await expect.poll(() => oscillatorCount(page), { timeout: 1_000 }).toBeGreaterThan(0);

      await page.goto("/lol/pro-play", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: "Pro Play" })).toBeVisible();
      // The canonical controller deliberately stays silent until its operator
      // snapshot resolves; wait for that bootstrap rather than racing it.
      await page.waitForTimeout(500);
      expect(await oscillatorCount(page)).toBe(0);
      await page.getByRole("link", { name: /Matchup Explorer/i }).click();
      await expect.poll(() => oscillatorCount(page), { timeout: 1_000 }).toBeGreaterThan(0);
    });

    test("Auth renders silently; authoritative outcomes stay fixture-tested", async ({ page }) => {
      await instrumentSynths(page);
      await page.goto("/auth?mode=signup&returnTo=%2Flol", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(/Create|account|progress/i);
      await page.waitForTimeout(250);
      expect(await oscillatorCount(page)).toBe(0);
    });
  });
}
