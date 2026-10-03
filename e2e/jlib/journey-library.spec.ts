/**
 * JLIB-FE — browser certification of `/quiz/journeys`.
 *
 * The JLIB-API backend is not deployed, so every remote request is fulfilled
 * here: the list is the captured backend answer (one Journey marked
 * unavailable), the launch answers the queue's `matched` envelope, and the
 * Ranked arena reads the shared settled-match fixture for match `m1`.
 *
 *   npx playwright test -c playwright.frontend.config.ts e2e/jlib
 *
 * Set JLIB_SHOTS=<dir> to also write the certification screenshots, and
 * JLIB_ASSET_ROOT=<backend>/assets/champions to draw real portraits.
 */
import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";
import { journeyLaunchMatched, journeyLibraryList } from "../../src/lib/journey-library/__fixtures__/journeyLibrary";

const SHOTS = process.env.JLIB_SHOTS;
const ASSET_ROOT = process.env.JLIB_ASSET_ROOT;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForLoadState("networkidle");
  // Let the chips' 150ms colour transition settle before capturing.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

const LIST = journeyLibraryList({
  "top.olaf_vs_sett": { available: false, unavailable_code: "JOURNEY_UNAVAILABLE" },
});

async function prepare(page: Page, { signedIn }: { signedIn: boolean }) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const launches: string[] = [];
  await page.addInitScript(({ signedIn }) => {
    localStorage.setItem("lol:ranked-rules:seen_version", "1");
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    if (signedIn) {
      // A FREE account: no Premium entitlement anywhere in the fixture.
      localStorage.setItem("mogsy_e2e_identity", JSON.stringify({ token: "jlib-free-token",
        user: { id: "userA", email: "jlib@example.test", is_anonymous: false }, admin: false }));
    }
  }, { signedIn });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    // Champion portraits: served from a local backend checkout when
    // JLIB_ASSET_ROOT names its `assets/champions`, else refused so the
    // card's initial fallback renders. Never fetched from production.
    const icon = url.pathname.match(/\/assets\/champions\/([^/]+)\/icon\.png$/);
    if (icon) {
      const file = ASSET_ROOT && join(ASSET_ROOT, icon[1], "icon.png");
      return file && existsSync(file)
        ? route.fulfill({ path: file, contentType: "image/png" })
        : route.abort();
    }
    if (!["fetch", "xhr"].includes(req.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    const headers = {
      "access-control-allow-origin": req.headers().origin ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
    };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body: unknown = [];
    if (url.pathname === "/api/journeys") body = LIST;
    else if (url.pathname.startsWith("/api/journeys/") && url.pathname.endsWith("/launch")) {
      launches.push(url.pathname);
      body = journeyLaunchMatched("m1");
    } else if (url.pathname.startsWith("/api/ranked/")) body = rankedTerminalResponse(url.pathname);
    else if (url.pathname.startsWith("/api/quiz/")) {
      if (url.pathname.endsWith("/entitlement")) body = { ok: true, is_pro: false };
      else return route.fulfill({ status: 503, headers, json: { detail: "fixture" } });
    } else if (url.pathname.includes("/profiles")) body = { id: "jlib-profile", user_id: "userA",
      display_name: "JLIB Tester", is_anonymous: false, is_disabled: false, socials: {} };
    await route.fulfill({ headers, json: body });
  });
  return { errors, launches };
}

test("desktop Library: cards, role and champion filters, unavailable card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { errors } = await prepare(page, { signedIn: true });
  await page.goto("/quiz/journeys");
  await expect(page.getByRole("heading", { name: "Journey Library" })).toBeVisible();
  await expect(page.getByTestId("journey-card")).toHaveCount(14);
  await shot(page, "01-desktop-library");

  await page.getByTestId("journey-role-jungle").click();
  await expect(page.getByTestId("journey-card")).toHaveCount(3);
  await shot(page, "02-desktop-role-jungle");
  await page.getByTestId("journey-role-all").click();

  await page.getByTestId("journey-champion-search").fill("olaf");
  await expect(page.getByTestId("journey-card")).toHaveCount(2);
  const olafSett = page.locator('[data-journey-key="top.olaf_vs_sett@1"]');
  await expect(olafSett.getByTestId("journey-card-unavailable")).toBeVisible();
  await expect(olafSett.getByTestId("journey-card-start")).toHaveCount(0);
  await shot(page, "03-desktop-champion-olaf-unavailable");
  expect(errors).toEqual([]);
});

test("mobile Library fits the phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await prepare(page, { signedIn: true });
  await page.goto("/quiz/journeys");
  await expect(page.getByTestId("journey-card")).toHaveCount(14);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, "04-mobile-library");
  expect(errors).toEqual([]);
});

test("signed-out Start asks for an account and sends nothing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { launches } = await prepare(page, { signedIn: false });
  await page.goto("/quiz/journeys");
  await expect(page.getByTestId("journey-card")).toHaveCount(14);
  await page.locator('[data-journey-key="support.pantheon_vs_leona@1"]')
    .getByTestId("journey-card-start").click();
  await expect(page.getByTestId("journey-account-required")).toBeInViewport();
  await shot(page, "05-mobile-signed-out-start");
  expect(launches).toEqual([]);
  await expect(page.getByTestId("journey-signin-link")).toHaveAttribute("href", /returnTo=%2Fquiz%2Fjourneys/);
});

test("Start hands the exact version into the existing Ranked arena and returns to the Library", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { errors, launches } = await prepare(page, { signedIn: true });
  await page.goto("/quiz/journeys");
  await page.locator('[data-journey-key="mid.zed_vs_ahri@1"]').getByTestId("journey-card-start").click();
  await expect(page).toHaveURL(/\/quiz\/ranked$/);
  expect(launches).toEqual(["/api/journeys/mid.zed_vs_ahri/1/launch"]);
  // The canonical arena owns the match; the fixture match is already settled.
  await expect(page.getByTestId("ranked-match-over")).toBeVisible();
  await expect(page.getByTestId("result-primary")).toHaveText("Back to Journey Library");
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Journeys");
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveAttribute("href", "/quiz/journeys");
  await shot(page, "06-desktop-arena-result-journey");
  await page.getByTestId("result-primary").click();
  await expect(page).toHaveURL(/\/quiz\/journeys$/);
  await expect(page.getByTestId("journey-card")).toHaveCount(14);
  expect(errors).toEqual([]);
});
