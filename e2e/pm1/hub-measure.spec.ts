/**
 * PM1 — first-screen geometry of the Leaguecraft hub, measured the same way
 * on this branch and on `main` (the workflow runs this file against both), so
 * "preserve the first-screen height constraints" is a comparison, not a guess.
 * Writes test-results/pm1/hub-measure-<label>.json; asserts nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";

const LABEL = process.env.PM1_LABEL ?? "branch";

async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({
      token: "pm1-measure", user: { id: "pm1-user", email: "pm1@example.test", is_anonymous: false }, admin: false,
    }));
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["fetch", "xhr"].includes(request.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    if (p === "/api/quiz/sets") return route.fulfill({ json: { sets: [{ id: 1, name: "All Current Questions", description: "", question_count: 10 }] } });
    if (p === "/api/quiz/history") return route.fulfill({ json: { ok: true, is_pro: false, total_count: 0, limited: false, free_limit: 10, upsell_message: null, results: [] } });
    if (p.includes("/progress/")) return route.fulfill({ json: { attempts: 4, accuracy: 50, rank_name: "Gold" } });
    if (p.includes("/categories/")) return route.fulfill({ json: { categories: [] } });
    if (p.includes("/achievements/")) return route.fulfill({ json: { achievements: [] } });
    if (p.startsWith("/api/ranked/") || p.startsWith("/api/history/")) return route.fulfill({ json: { results: [], records: [] } });
    if (p.includes("/profiles")) return route.fulfill({ json: { id: "p1", user_id: "pm1-user", display_name: "PM1", is_anonymous: false, socials: {} } });
    return route.fulfill({ json: [] });
  });
}

const SIZES = [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [1280, 720], [1024, 768]] as const;

test(`hub first-screen geometry (${LABEL})`, async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  const out: Record<string, unknown> = {};
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/quiz", { waitUntil: "domcontentloaded" });
    await page.getByTestId("quiz-category-rail").waitFor();
    await page.waitForTimeout(800);
    out[`${w}x${h}`] = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
      };
      return {
        lobby: box('[data-testid="hub-ranked-section"]'),
        quickStudy: box('[data-testid="hub-quick-study"]'),
        rail: box('[data-testid="quiz-category-rail"]'),
        more: box('[data-testid="hub-more-challenges"]'),
        record: box('[data-testid="hub-record-section"]'),
        scrollY: window.scrollY,
      };
    });
    await page.screenshot({ path: `test-results/pm1/measure-${LABEL}-${w}x${h}.png` });
  }
  mkdirSync("test-results/pm1", { recursive: true });
  writeFileSync(`test-results/pm1/hub-measure-${LABEL}.json`, JSON.stringify(out));
});
