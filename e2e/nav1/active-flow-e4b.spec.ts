import { expect, test, type Page, type Request } from "@playwright/test";
import { privatePlayerV2, publicRoundV2 } from "../../src/lib/ranked-public/fixtures";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";

type DailyMode = "settling" | "result" | "mobile";

const identity = { token: "nav1-e4b-token",
  user: { id: "userA", email: "nav1-e4b@example.test", is_anonymous: false }, admin: false };

function stage(index: number, kind: "standard" | "survival" | "review") {
  const ruleset = kind === "survival" ? "survival" : "standard";
  return { stage_index: index, stage_id: `nav1-e4b:${index}`, kind,
    ruleset_id: ruleset, ruleset: { ruleset_id: ruleset, time_bank_ms: null,
      max_strikes: kind === "survival" ? 3 : null },
    content: { title: kind === "review" ? "Review" : "NAV1 E4B fixture", focus: null },
    status: "pending", child_match_id: null, live: null, result: null };
}

function replaceMatchId<T>(value: T, childId: string): T {
  return JSON.parse(JSON.stringify(value).replaceAll("m1", childId)) as T;
}

function runSnapshot(mode: DailyMode, advanced: boolean) {
  const stages = mode === "settling"
    ? [stage(0, "survival"), stage(1, "review")]
    : [stage(0, "standard"), stage(1, "review")];
  if (mode === "settling") {
    Object.assign(stages[0], { status: "in_progress", child_match_id: "daily-survival-child",
      live: { strikes: { used: 2, live: 3, max: 3 }, own_stage_finished: true } });
  } else if (mode === "result") {
    if (advanced) {
      Object.assign(stages[0], { status: "completed", child_match_id: "daily-result-child",
        result: { correct: 1, answered: 1, score: 1, ended_by: "completed", misses: 0 } });
    } else {
      Object.assign(stages[0], { status: "in_progress", child_match_id: "daily-result-child" });
    }
  }
  return { schema_version: 1, run_id: "nav1-e4b-run", plan_date: "2026-09-28",
    status: "active", outcome: null, current_stage_index: advanced ? 1 : 0,
    server_now: new Date().toISOString(), stages, review_items: [] };
}

async function prepareDaily(page: Page, mode: DailyMode) {
  const requests: Request[] = [];
  const errors: string[] = [];
  let childTerminal = false;
  page.on("request", (request) => requests.push(request));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ identity }) => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
    if (location.pathname === "/quiz/daily-challenge" && history.state?.idx == null) {
      history.replaceState({ idx: 0, key: "daily-origin", usr: null }, "", "/quiz");
      history.pushState({ idx: 1, key: "daily-active", usr: null }, "", "/quiz/daily-challenge");
    }
  }, { identity });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["fetch", "xhr"].includes(request.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/daily-run/")) {
      const advanced = mode === "result" && childTerminal;
      return route.fulfill({ json: url.pathname.endsWith("/today") && request.method() === "GET"
        ? { run: runSnapshot(mode, advanced) } : runSnapshot(mode, advanced) });
    }
    const childId = mode === "settling" ? "daily-survival-child" : "daily-result-child";
    if (url.pathname.startsWith(`/api/ranked/matches/${childId}`)) {
      if (childTerminal) return route.fulfill({ json: replaceMatchId(rankedTerminalResponse(url.pathname.replace(childId, "m1")), childId) });
      if (url.pathname.endsWith("/presence")) {
        return route.fulfill({ json: { status: "active", match_id: childId, active: true } });
      }
      const publicBody = replaceMatchId(publicRoundV2(false), childId);
      const privateBody = replaceMatchId(privatePlayerV2("userA"), childId);
      const now = new Date();
      for (const body of [publicBody, privateBody]) {
        body.server_time = now.toISOString();
        if (body.payload.active_round) {
          body.payload.active_round.started_at = now.toISOString();
          body.payload.active_round.active_deadline = new Date(now.getTime() + 60_000).toISOString();
        }
      }
      if (url.pathname.endsWith("/resume")) {
        return route.fulfill({ json: { schema_version: "ranked_duel.resume.v1", projection_type: "resume",
          match_id: childId, round_number: 1, server_time: now.toISOString(),
          payload: { match_status: "active", match_over: false, public: publicBody,
            private: privateBody, latest_resolved_round: null, result: null } } });
      }
      return route.fulfill({ json: url.pathname.endsWith("/private") ? privateBody : publicBody });
    }
    if (url.pathname.includes("/profiles")) return route.fulfill({ json: { id: "nav1-profile",
      user_id: "userA", display_name: "NAV1 Tester", is_anonymous: false,
      is_disabled: false, socials: {} } });
    if (url.pathname === "/api/quiz/builder/catalog") return route.fulfill({ json: {
      ok: true, capability: { can_build: false, can_save: false, max_saved_sets: 0,
        allowed_pools: [], max_length: 0, allowed_lengths: [], can_view_trends: false,
        trend_windows: [], reason: "free" }, pools: [], categories: [], source_types: [],
      difficulty: { min: 1, max: 5 }, lengths: [], pro_play_category: "pro_play",
      unsupported_filters: [], } });
    if (url.pathname.startsWith("/api/quiz/")) return route.fulfill({ json: url.pathname.endsWith("/entitlement")
      ? { ok: true, is_pro: false } : { ok: true, sets: [] } });
    return route.fulfill({ json: [] });
  });
  return { requests, errors, settleChild: () => { childTerminal = true; } };
}

function forbiddenWrites(requests: Request[]) {
  return requests.filter((request) => request.method() !== "GET")
    .map((request) => new URL(request.url()).pathname)
    .filter((path) => /forfeit|abandon|cancel|terminate/.test(path));
}

test("Daily hidden Survival settlement remains parent-owned through Back and recovery", async ({ page }) => {
  const fixture = await prepareDaily(page, "settling");
  await page.goto("/quiz/daily-challenge");
  await expect(page.getByTestId("daily-settling-child")).toBeAttached({ timeout: 30_000 });
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveCount(0);
  const initialLength = await page.evaluate(() => history.length);

  await page.goBack();
  const dialog = page.getByRole("alertdialog", { name: "Exit Daily Challenge?" });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toContainText("this stage is still live");
  await expect(page.getByRole("alertdialog", { name: "Leave this Ranked match?" })).toHaveCount(0);
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await page.getByRole("button", { name: "Continue Daily" }).click();
  await expect(page.getByTestId("daily-settling-child")).toBeAttached();
  expect(await page.evaluate(() => history.length)).toBe(initialLength);

  await page.goBack();
  const exitDaily = page.getByRole("button", { name: "Exit Daily Challenge" });
  await expect(exitDaily).toBeVisible();
  await exitDaily.evaluate((element: HTMLButtonElement) => element.click());
  await expect(page).toHaveURL("/quiz");
  await page.goForward();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await expect(page.getByTestId("daily-settling-child")).toBeAttached({ timeout: 8_000 });
  expect(await page.evaluate(() => history.length)).toBe(initialLength);
  expect(fixture.requests.some((request) => new URL(request.url()).pathname === "/quiz/ranked")).toBe(false);
  expect(forbiddenWrites(fixture.requests)).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Daily stage result warns once and Forward reconstructs canonical next stage", async ({ page }) => {
  const fixture = await prepareDaily(page, "result");
  await page.goto("/quiz?play=1");
  const hubLength = await page.evaluate(() => history.length);
  await page.getByTestId("play-mode-daily").click();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await expect(page.getByTestId("ranked-match")).toBeVisible({ timeout: 8_000 });
  const dailyLength = await page.evaluate(() => history.length);
  expect(dailyLength).toBe(hubLength + 1);

  fixture.settleChild();
  await expect(page.getByTestId("daily-stage-result")).toBeVisible({ timeout: 8_000 });
  await page.goBack();
  const dialog = page.getByRole("alertdialog", { name: "Exit Daily Challenge?" });
  await expect(dialog).toContainText("This stage result screen will not be shown again when you return.");
  await page.getByRole("button", { name: "Continue Daily" }).click();
  await expect(page.getByTestId("daily-stage-result")).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(dailyLength);

  await page.goBack();
  await page.getByRole("button", { name: "Exit Daily Challenge" }).click();
  await expect(page).toHaveURL("/quiz?play=1");
  await page.goForward();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await expect(page.getByTestId("daily-stage-result")).toHaveCount(0);
  await expect(page.getByTestId("daily-run")).toHaveAttribute("data-flow-phase", "stage-intro");
  await expect(page.getByTestId("daily-stage-intro")).toContainText("Review");
  expect(await page.evaluate(() => history.length)).toBe(dailyLength);
  expect(forbiddenWrites(fixture.requests)).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("mobile viewport keeps the Daily parent guard usable for Back, header, and HUD", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await prepareDaily(page, "mobile");
  await page.goto("/quiz/daily-challenge");
  await expect(page.getByText("Exit Daily Challenge", { exact: true }).first()).toBeVisible();

  await page.goBack();
  const dialog = page.getByRole("alertdialog", { name: "Exit Daily Challenge?" });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeInViewport();
  await expect(page.getByRole("button", { name: "Continue Daily" })).toBeFocused();
  await page.getByRole("button", { name: "Continue Daily" }).click();
  await expect(page).toHaveURL("/quiz/daily-challenge");

  await page.getByText("Exit Daily Challenge", { exact: true }).first().click();
  await expect(dialog).toHaveCount(1);
  await page.getByRole("button", { name: "Continue Daily" }).click();
  await page.getByTestId("hud-home").click();
  await expect(dialog).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Continue Daily" })).toBeVisible();
  expect(forbiddenWrites(fixture.requests)).toEqual([]);
  expect(fixture.errors).toEqual([]);
});
