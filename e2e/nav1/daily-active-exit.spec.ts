import { expect, test, type Page, type Request } from "@playwright/test";
import { privatePlayerV2, publicRoundV2 } from "../../src/lib/ranked-public/fixtures";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";

const browserErrors = new WeakMap<Page, string[]>();

const stages = ["standard", "standard", "survival", "review"].map((kind, index) => ({
  stage_index: index, stage_id: `nav1-e3:${index}`, kind, ruleset_id: kind === "survival" ? "survival" : "standard",
  ruleset: { ruleset_id: kind === "survival" ? "survival" : "standard", time_bank_ms: null,
    max_strikes: kind === "survival" ? 3 : null },
  content: { title: "NAV1 fixture", focus: null }, status: "pending",
  child_match_id: null, live: null, result: null,
}));
const snapshot = (complete = false, liveChild = false) => ({
  schema_version: 1, run_id: "nav1-e3-run", plan_date: "2026-09-27", status: complete ? "completed" : "active",
  outcome: complete ? "reviewed" : null, current_stage_index: complete ? null : 0,
  server_now: new Date().toISOString(),
  stages: complete ? stages.map((stage) => ({ ...stage, status: "completed",
    result: { correct: 1, answered: 1, score: 1, ended_by: "completed", misses: 0 } })) : stages,
  review_items: [],
});

async function prepare(page: Page, liveChild = false) {
  const errors: string[] = [];
  const requests: Request[] = [];
  let started = false;
  let completed = false;
  let childTerminal = false;
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request));
  await page.addInitScript(() => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({ token: "nav1-e3-token",
      user: { id: "userA", email: "nav1-e3@example.test", is_anonymous: false }, admin: false }));
    if (location.pathname === "/quiz/daily-challenge" && history.state?.idx == null) {
      history.replaceState({ idx: 0, key: "daily-origin", usr: null }, "", "/quiz");
      history.pushState({ idx: 1, key: "daily-active", usr: null }, "", "/quiz/daily-challenge");
    }
  });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["fetch", "xhr"].includes(req.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/daily-run/")) {
      if (req.method() === "POST" && url.pathname.endsWith("/today")) started = true;
      if (url.pathname.endsWith("/sync") && childTerminal) completed = true;
      const next = snapshot(completed, liveChild);
      if (liveChild && !completed) {
        next.stages[0] = { ...next.stages[0], status: "in_progress", child_match_id: "m1" };
      }
      return route.fulfill({ json: url.pathname.endsWith("/today") && req.method() === "GET"
        ? { run: started ? next : null } : next });
    }
    if (url.pathname.startsWith("/api/ranked/matches/m1")) {
      if (childTerminal) return route.fulfill({ json: rankedTerminalResponse(url.pathname) });
      if (url.pathname.endsWith("/presence")) return route.fulfill({ json: { status: "active", match_id: "m1", active: true } });
      const body = url.pathname.endsWith("/private") ? privatePlayerV2("userA") : publicRoundV2(false);
      const now = new Date();
      body.server_time = now.toISOString();
      if (body.payload.active_round) {
        body.payload.active_round.started_at = now.toISOString();
        body.payload.active_round.active_deadline = new Date(now.getTime() + 60_000).toISOString();
      }
      if (url.pathname.endsWith("/resume")) {
        const privateBody = privatePlayerV2("userA");
        privateBody.server_time = body.server_time;
        privateBody.payload.active_round = body.payload.active_round;
        return route.fulfill({ json: { schema_version: "ranked_duel.resume.v1", projection_type: "resume",
          match_id: "m1", round_number: 1, server_time: body.server_time,
          payload: { match_status: "active", match_over: false, public: body,
            private: privateBody, latest_resolved_round: null, result: null } } });
      }
      return route.fulfill({ json: body });
    }
    if (url.pathname.includes("/profiles")) return route.fulfill({ json: { id: "nav1-profile", user_id: "userA",
      display_name: "NAV1 Tester", is_anonymous: false, is_disabled: false, socials: {} } });
    if (url.pathname === "/api/quiz/builder/catalog") return route.fulfill({ json: {
      ok: true,
      capability: { can_build: false, can_save: false, max_saved_sets: 0,
        allowed_pools: [], max_length: 0, allowed_lengths: [], can_view_trends: false,
        trend_windows: [], reason: "free" },
      pools: [], categories: [], source_types: [], difficulty: { min: 1, max: 5 },
      lengths: [], pro_play_category: "pro_play", unsupported_filters: [],
    } });
    if (url.pathname.startsWith("/api/quiz/")) return route.fulfill({ json: url.pathname.endsWith("/entitlement")
      ? { ok: true, is_pro: false } : { ok: true, sets: [] } });
    return route.fulfill({ json: [] });
  });
  return { requests, completeChild: () => { childTerminal = true; } };
}

test.afterEach(({ page, browserName }) => {
  const errors = browserErrors.get(page) ?? [];
  const relevantErrors = browserName === "webkit"
    ? errors.filter((message) => !message.endsWith("due to access control checks."))
    : errors;
  expect(relevantErrors).toEqual([]);
});

test("active Daily preserves Back/Forward, header, and HUD destinations without mutations", async ({ page }) => {
  const { requests } = await prepare(page);
  await page.goto("/quiz?play=1");
  await page.getByTestId("play-mode-daily").click();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await expect(page.getByText("Exit Daily Challenge", { exact: true }).first()).toBeVisible();
  const historyLength = await page.evaluate(() => history.length);

  await page.evaluate(() => history.back());
  await expect(page.getByRole("alertdialog")).toContainText("Your completed stages are saved");
  await page.getByRole("button", { name: "Continue Daily" }).click();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Exit Daily Challenge" }).click();
  await expect(page).toHaveURL("/quiz?play=1");
  await page.goForward();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await expect(page.getByText("Exit Daily Challenge", { exact: true }).first()).toBeVisible();

  await page.getByText("Exit Daily Challenge", { exact: true }).first().click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Continue Daily" }).click();
  await page.getByText("Exit Daily Challenge", { exact: true }).first().click();
  await page.getByRole("button", { name: "Exit Daily Challenge" }).click();
  await expect(page).toHaveURL("/quiz");

  await page.goto("/quiz/daily-challenge");
  await expect(page.getByText("Exit Daily Challenge", { exact: true }).first()).toBeVisible();
  await page.getByTestId("hud-home").click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Continue Daily" }).click();
  await page.getByTestId("hud-home").click();
  await page.getByRole("button", { name: "Exit Daily Challenge" }).click();
  await expect(page).toHaveURL("/lol");

  const mutationPaths = requests.filter((request) => request.method() !== "GET")
    .map((request) => new URL(request.url()).pathname);
  expect(mutationPaths.filter((path) => /forfeit|abandon/.test(path))).toEqual([]);
});

test("Daily completion authority dismisses a pending Back without replaying it", async ({ page }) => {
  const fixture = await prepare(page, true);
  await page.goto("/quiz?play=1");
  await page.getByTestId("play-mode-daily").click();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await expect(page.getByTestId("ranked-match")).toBeVisible({ timeout: 8_000 });
  await page.goBack();
  await expect(page.getByRole("alertdialog", { name: "Exit Daily Challenge?" })).toBeVisible();
  fixture.completeChild();
  await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: 8_000 });
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await expect(page.getByRole("region", { name: "Stage result" })).toBeVisible();
  await page.getByRole("button", { name: "See today's results" }).click();
  await expect(page.getByTestId("daily-run-complete")).toBeVisible();
  const forbidden = fixture.requests.filter((request) => request.method() !== "GET")
    .map((request) => new URL(request.url()).pathname).filter((path) => /forfeit|abandon/.test(path));
  expect(forbidden).toEqual([]);
});
