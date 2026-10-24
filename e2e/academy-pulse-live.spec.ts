/**
 * Academy Pulse PULSE-2A — the live provider on the real Orrery page.
 *
 *   VITE_ACADEMY_PULSE_CONTENT=live npx playwright test -c playwright.frontend.config.ts e2e/academy-pulse-live.spec.ts --workers=1
 *
 * Runs on GitHub's runner only (AGENTS.md: no local desktop browsers). The dev
 * server plays the live provider instead of the fixtures because of
 * VITE_ACADEMY_PULSE_CONTENT=live (the workflow sets it for this step only).
 *
 * MOCKS (disclosed): every backend read is intercepted. The History pages are
 * the backend-generated `analyticsLab.golden.json` wire pages (Free, Premium);
 * the trends payloads follow the server's Free / Premium projections. Personas
 * are test identities for this app's dev-only VITE_E2E_AUTH seam with fake
 * tokens nothing verifies. No real account, credential or production data.
 *
 * Asserts: who is read (guests and anonymous sessions: nothing), with which
 * identity, what each tier is shown, that a failed or slow read falls back to
 * editorial within the read budget, and that nothing is labelled "Sample".
 * Evidence: test-results/academy-pulse-live/.
 */
import { expect, test, type Page, type Request } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("test-results/academy-pulse-live");
mkdirSync(OUT, { recursive: true });

const GOLDEN = JSON.parse(readFileSync(path.resolve("src/pages/dev/lobby-preview/history/analyticsLab.golden.json"), "utf8"));
const HISTORY_FREE = GOLDEN.scenarios.lab_free[0];
const HISTORY_PREMIUM = GOLDEN.scenarios.lab_premium[0];

const TRENDS_FREE = {
  ok: true, tier: "free", windows: [], window_days: null,
  since: "2026-10-18T10:00:00Z", until: "2026-10-23T10:00:00Z", recent_answers: 50, span_days: 6,
  current: { attempts: 50, correct: 37, accuracy: 74, active_days: 4 },
  modes: [], categories: [], counts_modes: ["practice", "time_trial_official"], excludes_modes: ["ranked", "daily_challenge", "mastery"],
  sufficiency: { has_data: true },
  capability: { can_view_snapshot: true, snapshot_window_days: 7, can_view_trends: false, trend_windows: [], allowed_windows: [7], can_build: false, reason: "free" },
};
const TRENDS_PREMIUM = {
  ...TRENDS_FREE, tier: "premium", windows: [7, 30, 90], window_days: 7, recent_answers: undefined, span_days: undefined,
  current: { attempts: 40, correct: 31, accuracy: 77.5, active_days: 3 },
  previous: { attempts: 30, correct: 21, accuracy: 70, active_days: 2 },
  delta: { attempts: 10, accuracy_points: 7.5, active_days: 1, direction: "improving", comparable: true },
  series: [
    { date: "2026-10-17", attempts: 10, correct: 7, accuracy: 70 },
    { date: "2026-10-18", attempts: 0, correct: 0, accuracy: null },
    { date: "2026-10-19", attempts: 15, correct: 12, accuracy: 80 },
  ],
  sufficiency: { has_data: true, min_attempts: 20, enough_for_trend: true, enough_for_comparison: true },
};

// Test personas for the dev-only E2E identity seam: fake tokens, never verified.
const ACCOUNT = { token: "e2e-pulse-account", user: { id: "00000000-0000-4000-8000-0000000000a1", email: "pulse@example.test", is_anonymous: false }, admin: false };
const ANONYMOUS = { token: "e2e-pulse-anon", user: { id: "00000000-0000-4000-8000-0000000000a2", email: null, is_anonymous: true }, admin: false };

const LIVE_READ = /\/api\/(history\/v1|quiz\/analytics\/trends)(\?|$)/;
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

async function stubPage(page: Page, opts: { pro?: boolean } = {}) {
  await page.route("**/api/patch-reports", (r) => r.fulfill(json({ patches: [] })));
  await page.route("**/api/patch-reports/**", (r) => r.fulfill(json({ patch_version: "26.20", source_url: "", built_at: "", sections: [], cards: [] })));
  await page.route("**/api/daily-run/today", (r) => r.fulfill(json({ run: null })));
  await page.route("**/rest/v1/**", (r) => r.fulfill(json([])));
  if (opts.pro) await page.route("**/rest/v1/rpc/my_pro_entitlement**", (r) => r.fulfill(json([{ effective_pro: true, stripe_pro: true }])));
}

async function liveReads(page: Page, handlers: { history?: unknown | "fail" | "hang"; trends?: unknown | "fail" | "hang" }) {
  const seen: Request[] = [];
  const answer = (spec: unknown) => async (route: import("@playwright/test").Route) => {
    seen.push(route.request());
    if (spec === "fail") return route.fulfill(json({ detail: "boom" }, 500));
    if (spec === "hang") return; // never answered: Pulse's read budget must give up on it
    return route.fulfill(json(spec));
  };
  await page.route("**/api/history/v1**", answer(handlers.history ?? "fail"));
  await page.route("**/api/quiz/analytics/trends**", answer(handlers.trends ?? "fail"));
  return seen;
}

async function asViewer(page: Page, persona: unknown | null) {
  await page.addInitScript((p) => {
    if (p) localStorage.setItem("mogsy_e2e_identity", JSON.stringify(p));
    else localStorage.removeItem("mogsy_e2e_identity");
  }, persona);
}

async function open(page: Page) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/lol?pulse=1");
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(page.getByTestId("academy-pulse")).toBeVisible({ timeout: 45_000 });
}

/** A pip by its accessible name, "Scene N: <category label>". */
const pip = (page: Page, category: "Premium" | "Your insight") =>
  page.getByRole("button", { name: new RegExp("^Scene [0-9]+: " + category + "$") });
const current = (page: Page) => page.getByTestId("academy-pulse-scene").last();

async function goToCategory(page: Page, category: string) {
  await page.getByTestId("academy-pulse-toggle").click(); // hold the rotation while we inspect
  await pip(page, category).first().click();
}

test.describe("Academy Pulse live provider", () => {
  test("a guest is served editorial content and Pulse makes no personal read", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => { if (LIVE_READ.test(r.url())) urls.push(r.url()); });
    await asViewer(page, null);
    await stubPage(page);
    await open(page);
    await expect(current(page)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(urls).toEqual([]);
    await expect(page.getByTestId("academy-pulse")).not.toContainText("Sample");
    await expect(page.getByTestId("academy-pulse")).toHaveAttribute("data-provenance", "live");
    await page.getByTestId("academy-pulse").screenshot({ path: path.join(OUT, "guest.png") });
  });

  test("an anonymous guest session is a guest: no personal read either", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => { if (LIVE_READ.test(r.url())) urls.push(r.url()); });
    await asViewer(page, ANONYMOUS);
    await stubPage(page);
    await open(page);
    await expect(current(page)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(urls).toEqual([]);
  });

  test("a Free account sees its own Daily and Practice figures, with the Premium invitation, and no trend", async ({ page }) => {
    await asViewer(page, ACCOUNT);
    await stubPage(page);
    const seen = await liveReads(page, { history: HISTORY_FREE, trends: TRENDS_FREE });
    await open(page);
    await expect(current(page)).toContainText("459 points in your last Daily", { timeout: 10_000 });
    await expect(current(page)).toHaveAttribute("data-category", "player-activity");
    await page.getByTestId("academy-pulse").screenshot({ path: path.join(OUT, "free-daily-record.png") });

    // exactly the two self-scoped reads, once each, with the account's bearer token
    expect(seen.map((r) => new URL(r.url()).pathname + new URL(r.url()).search).sort()).toEqual(["/api/history/v1?limit=5", "/api/quiz/analytics/trends"]);
    for (const r of seen) expect(r.headers()["authorization"]).toBe(`Bearer ${ACCOUNT.token}`);

    await expect(pip(page, "Premium")).toHaveCount(1);
    await goToCategory(page, "Your insight");
    await expect(current(page)).toContainText("74% correct in Practice & Time Trial");
    await expect(current(page)).toHaveAttribute("data-scene", "news");
    await page.getByTestId("academy-pulse").screenshot({ path: path.join(OUT, "free-practice.png") });
    await expect(page.getByTestId("academy-pulse")).not.toContainText("Sample");
  });

  test("a Premium account sees the server's trends, and no Premium promotion", async ({ page }) => {
    await asViewer(page, ACCOUNT);
    await stubPage(page, { pro: true });
    await liveReads(page, { history: HISTORY_PREMIUM, trends: TRENDS_PREMIUM });
    await open(page);
    await expect(current(page)).toContainText("in your last Daily", { timeout: 10_000 });
    await expect(pip(page, "Premium")).toHaveCount(0);
    await goToCategory(page, "Your insight");
    await expect(current(page)).toHaveAttribute("data-scene", "insight");
    await expect(current(page)).toContainText(/Daily accuracy|Practice & Time Trial/);
    await page.getByTestId("academy-pulse").screenshot({ path: path.join(OUT, "premium-insight.png") });
  });

  test("a failed and a hung read fall back to editorial within the read budget", async ({ page }) => {
    await asViewer(page, ACCOUNT);
    await stubPage(page);
    await liveReads(page, { history: "fail", trends: "hang" });
    await open(page);
    await expect(current(page)).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId("academy-pulse")).not.toContainText("in your last Daily");
    await expect(page.getByTestId("academy-pulse")).not.toContainText("quiet right now");
    await page.getByTestId("academy-pulse").screenshot({ path: path.join(OUT, "fallback.png") });
  });
});
