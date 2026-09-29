import { expect, test, type Page, type Request } from "@playwright/test";

const identity = {
  token: "nav1-practice-token",
  user: { id: "practice-user", email: "practice@example.test", is_anonymous: false },
  admin: false,
};

test.setTimeout(60_000);

const question = {
  id: 901,
  category: "Champion Basics",
  question_text: "Which answer is correct in the NAV1 Practice fixture?",
  format: "multiple_choice",
  choices: ["Alpha", "Beta"],
  difficulty: 1,
};

async function prepare(page: Page) {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  await page.addInitScript(({ identity }) => {
    const key = "nav1-practice-document-mounts";
    sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) ?? "0") + 1));
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
    if (location.pathname === "/quiz" && history.state?.idx == null) {
      history.replaceState({ idx: 0, key: "practice-origin", usr: null }, "", "/lol");
      history.pushState({ idx: 1, key: "practice-active", usr: null }, "", "/quiz");
    }
  }, { identity });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["fetch", "xhr"].includes(request.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/quiz/sets") return route.fulfill({ json: { sets: [
      { id: 1, name: "Champion Basics", description: "Fixture", question_count: 1 },
    ] } });
    if (url.pathname === "/api/quiz/questions") return route.fulfill({ json: { questions: [question] } });
    if (url.pathname === "/api/quiz/attempts") {
      const selected = JSON.parse(request.postData() ?? "{}").selected_answer;
      return route.fulfill({ json: { is_correct: selected === "Alpha", correct_answer: "Alpha", explanation: "Alpha is correct." } });
    }
    if (url.pathname === "/api/quiz/sessions") return route.fulfill({ json: { ok: true, session_id: 77 } });
    if (/\/api\/quiz\/sessions\/77\/complete$/.test(url.pathname)) return route.fulfill({ json: { ok: true } });
    if (url.pathname === "/api/quiz/history") return route.fulfill({ json: {
      ok: true, is_pro: false, total_count: 0, limited: false, free_limit: 10,
      upsell_message: null, results: [],
    } });
    if (url.pathname.includes("/progress/")) return route.fulfill({ json: { attempts: 0, accuracy: 0, rank_name: "Bronze" } });
    if (url.pathname.includes("/categories/")) return route.fulfill({ json: { categories: [] } });
    if (url.pathname.includes("/achievements/")) return route.fulfill({ json: { achievements: [] } });
    if (url.pathname.includes("/missed-questions")) return route.fulfill({ json: { ok: true, results: [], total_count: 0 } });
    if (url.pathname.includes("/question-library")) return route.fulfill({ json: { ok: true, results: [], total_count: 0 } });
    if (url.pathname === "/api/quiz/builder/catalog") return route.fulfill({ json: { ok: true, capability: {
      can_build: false, can_save: false, max_saved_sets: 0, allowed_pools: [], max_length: 0,
      allowed_lengths: [], can_view_trends: false, trend_windows: [], reason: "free",
    }, pools: [], categories: [], source_types: [], difficulty: { min: 1, max: 5 }, lengths: [], unsupported_filters: [] } });
    if (url.pathname.startsWith("/api/ranked/") || url.pathname.startsWith("/api/history/")) return route.fulfill({ json: { results: [], records: [] } });
    if (url.pathname.includes("/profiles")) return route.fulfill({ json: { id: "p1", user_id: "practice-user", display_name: "Practice Tester", is_anonymous: false, socials: {} } });
    return route.fulfill({ json: [] });
  });
  return requests;
}

async function openActivePractice(page: Page) {
  await page.goto("/quiz", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start practising" }).click();
  await expect(page.getByText(question.question_text)).toBeVisible();
}

async function finish(page: Page, correct: boolean) {
  await page.getByRole("button", { name: correct ? "Alpha" : "Beta" }).click();
  await page.getByRole("button", { name: "See results" }).click();
  await expect(page.getByText("Quiz Complete")).toBeVisible();
}

test("active Practice Back preserves the POP, history, and canonical Forward reconstruction", async ({ page }) => {
  await prepare(page);
  await openActivePractice(page);
  const length = await page.evaluate(() => history.length);

  await page.evaluate(() => history.back());
  const dialog = page.getByRole("alertdialog", { name: "Leave practice?" });
  await expect(dialog).toHaveCount(1);
  await expect(page.getByText(question.question_text)).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.getByRole("button", { name: "Stay in Practice" }).click();

  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Leave Practice" }).click();
  await expect(page).toHaveURL(/\/lol$/);
  await expect(page.getByTestId("academy-desktop-title")).toBeAttached();
  await page.waitForTimeout(100);
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/\/quiz$/);
  await expect(page.getByTestId("leaguecraft-workspace")).toBeVisible();
  await expect(page.getByText(question.question_text)).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test("active Practice header and HUD Home each use the one Practice confirmation", async ({ page }) => {
  await prepare(page);
  await openActivePractice(page);
  await page.getByRole("link", { name: "Back to League hub" }).click();
  await expect(page.getByRole("alertdialog", { name: "Leave practice?" })).toHaveCount(1);
  await page.getByRole("button", { name: "Stay in Practice" }).click();
  await expect(page.getByText(question.question_text)).toBeVisible();
  await page.getByTestId("hud-home").click();
  await expect(page.getByRole("alertdialog", { name: "Leave practice?" })).toHaveCount(1);
  await page.getByRole("button", { name: "Leave Practice" }).click();
  await expect(page).toHaveURL(/\/lol$/);
});

test("missed-question replay is unfinished and guarded", async ({ page }) => {
  await prepare(page);
  await openActivePractice(page);
  await finish(page, false);
  await page.getByTestId("practice-missed-cta").click();
  await expect(page.getByText(question.question_text)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("alertdialog", { name: "Leave practice?" })).toHaveCount(1);
});

test("completed Practice result is terminal and browser Back is unguarded", async ({ page }) => {
  await prepare(page);
  await openActivePractice(page);
  await finish(page, true);
  await page.goBack();
  await expect(page).toHaveURL(/\/lol$/);
  await expect(page.getByRole("alertdialog", { name: "Leave practice?" })).toHaveCount(0);
});

test("completed result is terminal and Review enters canonical History without document reload", async ({ page }) => {
  const requests = await prepare(page);
  await openActivePractice(page);
  await finish(page, true);
  await page.getByRole("button", { name: "Review your questions" }).click();
  await expect(page).toHaveURL(/\/quiz#history$/);
  await expect(page.getByTestId("history-questions")).toBeVisible();
  await expect(page.getByTestId("history-questions")).toBeFocused();
  expect(await page.evaluate(() => sessionStorage.getItem("nav1-practice-document-mounts"))).toBe("1");
  expect(requests.filter((request) => request.isNavigationRequest() && request.resourceType() === "document")).toHaveLength(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/quiz$/);
  await expect(page.getByTestId("leaguecraft-workspace")).toBeVisible();
  await expect(page.getByRole("alertdialog", { name: "Leave practice?" })).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/quiz#history$/);
});

test("390x844 keeps the active Practice confirmation usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await openActivePractice(page);
  await page.goBack();
  const dialog = page.getByRole("alertdialog", { name: "Leave practice?" });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeInViewport();
  await expect(page.getByRole("button", { name: "Stay in Practice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave Practice" })).toBeVisible();
  await page.getByRole("button", { name: "Stay in Practice" }).click();
  await page.goBack();
  await page.getByRole("button", { name: "Leave Practice" }).click();
  await expect(page).toHaveURL(/\/lol$/);
});
