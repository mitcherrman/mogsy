import { expect, test, type Page } from "@playwright/test";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";
import { privatePlayerV2, publicRoundV2, queueStatusV1 } from "../../src/lib/ranked-public/fixtures";

const origin = "/lol?origin=nav1-ranked#academy";
const browserErrors = new WeakMap<Page, string[]>();
const corsHeaders = {
  "access-control-allow-origin": "http://127.0.0.1:8081",
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
};

test.afterEach(({ page, browserName }) => {
  const errors = browserErrors.get(page) ?? [];
  // Playwright WebKit reports access-control failures for some cross-origin
  // requests even when page.route has deterministically fulfilled them. They
  // are fixture noise; preserve the assertion for every other page error.
  const relevantErrors = browserName === "webkit"
    ? errors.filter((message) => !message.endsWith("due to access control checks."))
    : errors;
  expect(relevantErrors).toEqual([]);
});

async function prepare(page: Page, handoff = true) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ handoff }) => {
    localStorage.setItem("lol:ranked-rules:seen_version", "1");
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({ token: "nav1-ranked-token",
      user: { id: "userA", email: "nav1@example.test", is_anonymous: false }, admin: false }));
    // Seed the same router state the real queue supplies, so an already-settled
    // match can be tested without creating or playing a live server match.
    if (handoff && location.pathname === "/quiz/ranked" && !history.state?.usr) {
      history.replaceState({ ...history.state, usr: { matchId: "m1" }, idx: 1 }, "");
    }
  }, { handoff });
  // No production API writes or reads: all remote data requests are intercepted.
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["fetch", "xhr"].includes(req.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    let body: unknown = [];
    if (url.pathname.startsWith("/api/ranked/")) body = rankedTerminalResponse(url.pathname);
    if (url.pathname.endsWith("/role")) body = { role: "top", selected_at: null, updated_at: null };
    if (url.pathname.endsWith("/queue")) body = {
      schema_version: "ranked_duel.queue_status.v1", projection_type: "queue_status",
      match_id: null, round_number: null, server_time: new Date().toISOString(),
      payload: { status: "idle", match_id: null, queue_version: null, class_id: null, role: "top", enqueued_at: null },
    };
    if (url.pathname.endsWith("/availability")) body = {
      schema_version: "ranked_duel.availability.v1", projection_type: "ranked_availability",
      server_time: new Date().toISOString(),
      payload: { open: true, state: "open", reason: "launch", next_open_at: null, closes_at: null },
    };
    if (url.pathname.startsWith("/api/quiz/")) {
      if (url.pathname.endsWith("/entitlement")) body = { ok: true, is_pro: false };
      else if (url.pathname === "/api/quiz/sets") body = { sets: [] };
      else return route.fulfill({
        status: 503,
        headers: corsHeaders,
        json: { detail: "Unavailable in NAV1 fixture" },
      });
    }
    if (url.pathname.endsWith("/today")) body = { run: null };
    if (url.pathname.includes("/profiles")) body = { id: "nav1-profile", user_id: "userA",
      display_name: "NAV1 Tester", is_anonymous: false, is_disabled: false, socials: {} };
    await route.fulfill({
      headers: corsHeaders,
      json: body,
    });
  });
}

async function terminal(page: Page) {
  await prepare(page);
  await page.goto(origin);
  await page.goto("/quiz/ranked");
  await expect(page.getByTestId("ranked-match-over")).toBeVisible();
}

for (const [control, destination] of [
  ["result-tertiary", "/quiz"],
  ["result-secondary", "/quiz#history"],
  // HUB4 keeps #review as a legacy entry point, then canonically replaces it
  // with #history. Assert the stable current-main destination across Forward.
  ["discovery-cta", "/quiz#history"],
  ["result-primary", "/quiz?play=1"],
  ["ranked-back-to-quiz", "/quiz"],
]) {
  test(`${control}: SPA replacement, Back to origin, Forward to destination`, async ({ page }) => {
    await terminal(page);
    const before = await page.evaluate(() => ({ length: history.length, document: performance.timeOrigin }));
    if (control === "discovery-cta") await page.getByTestId("result-details-toggle").click();
    if (control === "ranked-back-to-quiz") {
      // The existing fixed header can overlap the terminal title at this
      // viewport. Exercise its normal keyboard activation without forcing a click.
      await page.getByTestId(control).focus();
      await page.getByTestId(control).press("Enter");
    } else await page.getByTestId(control).click();
    await expect(page).toHaveURL(destination);
    await expect(page.getByTestId("ranked-match-over")).toHaveCount(0);
    expect(await page.evaluate(() => ({ length: history.length, document: performance.timeOrigin }))).toEqual(before);
    if (control === "result-primary") await expect(page.getByTestId("play-scroll")).toBeVisible();
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(origin);
    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL(destination);
    await expect(page.getByTestId("ranked-match-over")).toHaveCount(0);
  });
}

test("terminal refresh keeps the intentional result; exit stops match traffic", async ({ page }) => {
  await terminal(page);
  await page.reload();
  await expect(page.getByTestId("ranked-match-over")).toBeVisible();
  await page.getByTestId("result-tertiary").click();
  await expect(page).toHaveURL("/quiz");
  const traffic: string[] = [];
  page.on("request", (req) => { if (req.url().includes("/matches/m1")) traffic.push(req.url()); });
  // Longer than the controller's 10s presence interval, also catches poll leaks.
  await page.waitForTimeout(10_500);
  expect(traffic).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(origin);
});

test("direct Ranked after completion uses existing no-active-match recovery", async ({ page }) => {
  await prepare(page, false);
  await page.goto(origin);
  await page.goto("/quiz/ranked");
  await expect(page).toHaveURL("/quiz");
  await expect(page.getByTestId("play-scroll")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(origin);
});

test("Play Again opens mode selection; the next queue handoff cannot restore the old result", async ({ page }) => {
  await terminal(page);
  const ordinaryLeaveRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/forfeit")) {
      ordinaryLeaveRequests.push(request.url());
    }
  });
  await page.route("**/api/ranked/queue", (route) => route.fulfill({ json:
    queueStatusV1(route.request().method() === "POST" ? "matched" : "idle",
      route.request().method() === "POST" ? "m2" : null) }));
  await page.route("**/api/ranked/matches/m2**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/private") ? privatePlayerV2("userA") : publicRoundV2(false);
    return route.fulfill({ json: JSON.parse(JSON.stringify(body).replaceAll('"m1"', '"m2"')) });
  });
  await page.getByTestId("result-primary").click();
  await expect(page.getByTestId("play-scroll")).toHaveAttribute("data-view", "menu");
  await expect(page).toHaveURL("/quiz?play=1");
  await page.getByTestId("play-mode-ranked").click();
  await page.getByTestId("play-ranked-join").click();
  await expect(page).toHaveURL("/quiz/ranked");
  expect(await page.evaluate(() => history.state.usr.matchId)).toBe("m2");
  await expect(page.getByTestId("ranked-match-over")).toHaveCount(0);
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Leave Match");
  const activeHistoryLength = await page.evaluate(() => history.length);
  // E2 protects the newly active match; Stay preserves it and Leave replays
  // the original POP back to the mode-selection lobby.
  await page.goBack();
  await expect(page.getByRole("alertdialog", { name: "Leave this Ranked match?" })).toBeVisible();
  await page.getByRole("button", { name: "Stay in Match" }).click();
  await expect(page).toHaveURL("/quiz/ranked");
  expect(await page.evaluate(() => history.length)).toBe(activeHistoryLength);
  await page.goBack();
  await page.getByRole("button", { name: "Leave Match" }).click();
  await expect(page).toHaveURL("/quiz?play=1");
  expect(await page.evaluate(() => history.length)).toBe(activeHistoryLength);
  await page.goForward();
  await expect(page).toHaveURL("/quiz/ranked");
  expect(await page.evaluate(() => history.state.usr.matchId)).toBe("m2");
  await page.getByTestId("ranked-back-to-quiz").focus();
  await page.getByTestId("ranked-back-to-quiz").press("Enter");
  await expect(page.getByRole("alertdialog", { name: "Leave this Ranked match?" })).toBeVisible();
  await page.getByRole("button", { name: "Stay in Match" }).click();
  await page.getByTestId("hud-home").focus();
  await page.getByTestId("hud-home").press("Enter");
  await page.getByRole("button", { name: "Stay in Match" }).click();
  await page.getByTestId("hud-home").focus();
  await page.getByTestId("hud-home").press("Enter");
  await page.getByRole("button", { name: "Leave Match" }).click();
  await expect(page).toHaveURL("/lol");
  expect(ordinaryLeaveRequests).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL("/quiz/ranked");
  await page.getByTestId("ranked-back-to-quiz").focus();
  await page.getByTestId("ranked-back-to-quiz").press("Enter");
  await page.getByRole("button", { name: "Leave Match" }).click();
  await expect(page).toHaveURL("/quiz");
  expect(ordinaryLeaveRequests).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL("/quiz/ranked");
});

test("Daily owns two hosted settlements and Continue without stage history entries", async ({ page }) => {
  await prepare(page, false);
  const stages = ["standard", "standard", "review"].map((kind, index) => ({
    stage_index: index, stage_id: `nav1-daily:${index}`, kind, ruleset_id: "standard",
    ruleset: { ruleset_id: "standard", time_bank_ms: null, max_strikes: null },
    content: { title: "Items", focus: null }, status: index === 0 ? "in_progress" : "pending",
    child_match_id: index === 0 ? "m1" : null, live: null,
    result: null as null | { correct: number; answered: number; score: number; ended_by: string; misses: number },
  }));
  let current = 0;
  let childReads = 0;
  const snapshot = () => ({ schema_version: 1, run_id: "nav1-daily", plan_date: "2026-09-26",
    status: "active", outcome: null, current_stage_index: current,
    server_now: new Date().toISOString(), stages, review_items: [] });
  await page.route("**/api/ranked/matches/m*", async (route) => {
    childReads++;
    const path = new URL(route.request().url()).pathname;
    const response = rankedTerminalResponse(path.replace("/m2", "/m1"));
    await route.fulfill({ json: path.includes("/m2")
      ? JSON.parse(JSON.stringify(response).replaceAll('"m1"', '"m2"')) : response });
  });
  await page.route("**/api/daily-run/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/sync") && childReads > 0 && stages[current].status === "in_progress") {
      stages[current].status = "completed";
      stages[current].result = { correct: 1, answered: 1, score: 3, ended_by: "completed", misses: 0 };
      current++;
      childReads = 0;
    }
    if (path.endsWith("/launch")) {
      stages[current].status = "in_progress";
      stages[current].child_match_id = "m2";
    }
    await route.fulfill({ json: path.endsWith("/today") ? { run: snapshot() } : snapshot() });
  });
  await page.goto(origin);
  await page.goto("/quiz/daily-challenge");
  const before = await page.evaluate(() => ({ length: history.length, document: performance.timeOrigin }));
  await expect(page.getByTestId("daily-stage-result-continue")).toBeEnabled({ timeout: 15_000 });
  expect(current).toBe(1);
  await expect(page.getByTestId("ranked-match-over")).toHaveCount(0);
  await expect(page.getByTestId("result-primary")).toHaveCount(0);
  await page.getByTestId("daily-stage-result-continue").click();
  await expect.poll(() => current).toBe(2);
  await expect(page.getByTestId("daily-stage-result-continue")).toBeEnabled();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  expect(await page.evaluate(() => ({ length: history.length, document: performance.timeOrigin }))).toEqual(before);
  await expect(page.getByTestId("ranked-match-over")).toHaveCount(0);
});
