/**
 * JLIB-HOST — browser certification of the persisted match host.
 *
 * The backend (JLIB-HOST, `League_Combat_Simulator` `1b62f1a3`) is local-only,
 * so every remote request is fulfilled here. The Ranked transport is the
 * shared settled-match fixture for `m1`, with the backend's `host` field
 * added to the active-match, match-state and resume answers, and to History.
 * No router state is ever set: each match is found by discovery.
 *
 *   npx playwright test -c playwright.frontend.config.ts e2e/jlib/journey-host.spec.ts
 *
 * Set JLIB_SHOTS=<dir> to also write the certification screenshots.
 */
import { expect, test, type Page } from "@playwright/test";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";

const SHOTS = process.env.JLIB_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

const T = "2026-09-26T00:00:00Z";

function historyEntry(matchId: string, host: string | null, over: Record<string, unknown> = {}) {
  return {
    match_id: matchId, viewer_outcome: "win", terminal_reason: "combat",
    completion_reason: "segments_complete", final_round_number: 5,
    completed_at: new Date().toISOString(), is_bot_match: true,
    viewer_class: "tank", opponent_class: "mage", viewer_role: "mid", opponent_role: "mid",
    opponent_display_name: null, opponent_is_bot: true,
    rating_delta: null, rating_after: null, host, ...over,
  };
}

const HISTORY = {
  schema_version: "ranked_duel.match_history.v1", projection_type: "match_history",
  match_id: null, round_number: null, server_time: T,
  payload: {
    count: 2,
    entries: [
      historyEntry("m-journey", "journey_library"),
      historyEntry("m-ranked", null, {
        viewer_outcome: "loss", is_bot_match: false, opponent_is_bot: false,
        opponent_display_name: "Rivalmogz", viewer_role: "top", opponent_role: "jungle",
        rating_delta: -14, rating_after: 1186,
      }),
    ],
  },
};

/** The fixture answer, with `host` where the backend now puts it. */
function withHost(path: string, host: string | null): unknown {
  if (path.endsWith("/active-match")) {
    return { active_match: { match_id: "m1", is_bot_match: true, host,
      reconnect_deadline: null, within_reconnect_window: true } };
  }
  type Env = { payload: Record<string, unknown> };
  const body = rankedTerminalResponse(path) as Env;
  if (path.endsWith("/resume")) (body.payload.public as Env).payload.host = host;
  else if (path.endsWith("/matches/m1")) body.payload.host = host;
  else if (path.endsWith("/history")) return HISTORY;
  return body;
}

async function prepare(page: Page, host: string | null) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("lol:ranked-rules:seen_version", "1");
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({ token: "jlib-free-token",
      user: { id: "userA", email: "jlib@example.test", is_anonymous: false }, admin: false }));
  });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
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
    // The hub's own reads, as the nav1 terminal spec answers them.
    if (url.pathname.endsWith("/role")) body = { role: "top", selected_at: null, updated_at: null };
    else if (url.pathname.endsWith("/queue")) body = {
      schema_version: "ranked_duel.queue_status.v1", projection_type: "queue_status",
      match_id: null, round_number: null, server_time: T,
      payload: { status: "idle", match_id: null, queue_version: null, class_id: null, role: "top", enqueued_at: null },
    };
    else if (url.pathname.endsWith("/availability")) body = {
      schema_version: "ranked_duel.availability.v1", projection_type: "ranked_availability",
      server_time: T,
      payload: { open: true, state: "open", reason: "launch", next_open_at: null, closes_at: null },
    };
    else if (url.pathname.endsWith("/today")) body = { run: null };
    else if (url.pathname.startsWith("/api/ranked/")) body = withHost(url.pathname, host);
    else if (url.pathname.startsWith("/api/quiz/")) {
      if (url.pathname.endsWith("/entitlement")) body = { ok: true, is_pro: false };
      else if (url.pathname === "/api/quiz/sets") body = { sets: [] };
      else if (url.pathname === "/api/quiz/history") body = { ok: true, is_pro: false, results: [],
        total_count: 0, limited: false, free_limit: 10, upsell_message: null };
      else return route.fulfill({ status: 503, headers, json: { detail: "fixture" } });
    } else if (url.pathname.includes("/profiles")) body = { id: "jlib-profile", user_id: "userA",
      display_name: "JLIB Tester", is_anonymous: false, is_disabled: false, socials: {} };
    await route.fulfill({ headers, json: body });
  });
  return { errors };
}

test("a journey_library match recovered with no router state returns to the Library", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { errors } = await prepare(page, "journey_library");
  await page.goto("/quiz/ranked");
  expect(await page.evaluate(() => window.history.state?.usr ?? null)).toBeNull();
  await expect(page.getByTestId("ranked-match-over")).toBeVisible();
  await expect(page.getByTestId("result-primary")).toHaveText("Back to Journey Library");
  await expect(page.getByText("Play Again")).toHaveCount(0);
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Journeys");
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveAttribute("href", "/quiz/journeys");
  await expect(page.locator("body")).not.toContainText("journey_library");
  await shot(page, "h1-recovered-journey-result");

  // A reload is a second recovery, still with no router state.
  await page.reload();
  await expect(page.getByTestId("result-primary")).toHaveText("Back to Journey Library");

  await page.getByTestId("result-primary").click();
  await expect(page).toHaveURL(/\/quiz\/journeys$/);
  expect(errors).toEqual([]);
});

test("an ordinary null-host match recovers exactly as before", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { errors } = await prepare(page, null);
  await page.goto("/quiz/ranked");
  await expect(page.getByTestId("ranked-match-over")).toBeVisible();
  await expect(page.getByTestId("result-primary")).toHaveText("Play Again");
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveAttribute("href", "/quiz");
  await expect(page.getByText("Back to Journey Library")).toHaveCount(0);
  await shot(page, "h2-recovered-ordinary-result");
  expect(errors).toEqual([]);
});

test("History labels the Journey Library match and leaves the ordinary one alone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { errors } = await prepare(page, null);
  await page.goto("/quiz#history");
  const rows = page.getByTestId("ranked-match-row");
  await expect(rows).toHaveCount(2);
  // Rows are ordered by the ledger, not by the fixture, so find each by content.
  const journey = rows.filter({ hasText: "Bot" });
  const ordinary = rows.filter({ hasText: "Rivalmogz" });
  await expect(journey.getByTestId("ranked-match-host")).toHaveText("· Journey Library");
  await expect(ordinary.getByTestId("ranked-match-host")).toHaveCount(0);
  await expect(ordinary).toContainText("1200");
  await expect(page.locator("body")).not.toContainText("journey_library");
  await journey.scrollIntoViewIfNeeded();
  await shot(page, "h3-history-journey-label");
  expect(errors).toEqual([]);
});
