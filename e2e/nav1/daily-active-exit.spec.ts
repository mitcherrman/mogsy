import { expect, test, type Page, type Request } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();

const stages = ["standard", "standard", "survival", "review"].map((kind, index) => ({
  stage_index: index, stage_id: `nav1-e3:${index}`, kind, ruleset_id: kind === "survival" ? "survival" : "standard",
  ruleset: { ruleset_id: kind === "survival" ? "survival" : "standard", time_bank_ms: null,
    max_strikes: kind === "survival" ? 3 : null },
  content: { title: "NAV1 fixture", focus: null }, status: "pending",
  child_match_id: null, live: null, result: null,
}));
const snapshot = () => ({
  schema_version: 1, run_id: "nav1-e3-run", plan_date: "2026-09-27", status: "active",
  outcome: null, current_stage_index: 0, server_now: new Date().toISOString(), stages, review_items: [],
});

async function prepare(page: Page) {
  const errors: string[] = [];
  const requests: Request[] = [];
  let started = false;
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request));
  await page.addInitScript(() => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({ token: "nav1-e3-token",
      user: { id: "userA", email: "nav1-e3@example.test", is_anonymous: false }, admin: false }));
  });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["fetch", "xhr"].includes(req.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/daily-run/")) {
      if (req.method() === "POST" && url.pathname.endsWith("/today")) started = true;
      return route.fulfill({ json: url.pathname.endsWith("/today") && req.method() === "GET"
        ? { run: started ? snapshot() : null } : snapshot() });
    }
    if (url.pathname.includes("/profiles")) return route.fulfill({ json: { id: "nav1-profile", user_id: "userA",
      display_name: "NAV1 Tester", is_anonymous: false, is_disabled: false, socials: {} } });
    if (url.pathname.startsWith("/api/quiz/")) return route.fulfill({ json: url.pathname.endsWith("/entitlement")
      ? { ok: true, is_pro: false } : { sets: [] } });
    return route.fulfill({ json: [] });
  });
  return requests;
}

test.afterEach(({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

test("active Daily preserves Back/Forward, header, and HUD destinations without mutations", async ({ page }) => {
  const requests = await prepare(page);
  await page.goto("/quiz?play=1");
  await page.getByTestId("play-mode-daily").click();
  await expect(page).toHaveURL("/quiz/daily-challenge");
  await page.getByTestId("daily-run-start").click();
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
