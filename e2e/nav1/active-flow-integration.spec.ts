import { expect, test, type Page, type Request } from "@playwright/test";
import { privatePlayerV2, publicRoundV2 } from "../../src/lib/ranked-public/fixtures";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";

type RankedFixture = {
  terminal: boolean;
  locked: boolean;
  requests: Request[];
};

async function prepareRanked(page: Page, options: { locked?: boolean; mobile?: boolean } = {}) {
  if (options.mobile) await page.setViewportSize({ width: 390, height: 844 });
  const fixture: RankedFixture = { terminal: false, locked: options.locked ?? false, requests: [] };
  page.on("request", (request) => fixture.requests.push(request));
  await page.addInitScript(() => {
    localStorage.setItem("lol:ranked-rules:seen_version", "1");
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({ token: "nav1-e4-token",
      user: { id: "userA", email: "nav1-e4@example.test", is_anonymous: false }, admin: false }));
    if (location.pathname === "/quiz/ranked" && !history.state?.usr) {
      history.replaceState({ idx: 0, key: "e4-origin", usr: null }, "", "/quiz");
      history.pushState({ idx: 1, key: "e4-ranked", usr: { matchId: "m1" } }, "", "/quiz/ranked");
    }
  });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["fetch", "xhr"].includes(req.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/ranked/matches/m1")) {
      if (fixture.terminal) return route.fulfill({ json: rankedTerminalResponse(url.pathname) });
      if (url.pathname.endsWith("/presence")) return route.fulfill({ json: { status: "active", match_id: "m1", active: true } });
      const body = url.pathname.endsWith("/private") ? privatePlayerV2("userA") : publicRoundV2(false);
      if (fixture.locked) {
        const players = body.payload.players as Array<{ player_id: string; has_submitted: boolean }>;
        const own = players.find((player) => player.player_id === "userA");
        if (own) own.has_submitted = true;
      }
      return route.fulfill({ json: body });
    }
    if (url.pathname.includes("/profiles")) return route.fulfill({ json: { id: "nav1-profile",
      user_id: "userA", display_name: "NAV1 Tester", is_anonymous: false, is_disabled: false, socials: {} } });
    if (url.pathname.endsWith("/role")) return route.fulfill({ json: { role: "top", selected_at: null, updated_at: null } });
    if (url.pathname.startsWith("/api/quiz/")) return route.fulfill({ json: { ok: true, sets: [] } });
    if (url.pathname.endsWith("/today")) return route.fulfill({ json: { run: null } });
    return route.fulfill({ json: [] });
  });
  return fixture;
}

function forbiddenWrites(fixture: RankedFixture) {
  return fixture.requests.filter((request) => request.method() !== "GET")
    .map((request) => new URL(request.url()).pathname)
    .filter((path) => /forfeit|abandon|cancel|terminate/.test(path));
}

for (const locked of [false, true]) {
  test(`standalone Ranked ${locked ? "locked" : "active"} Back/Stay/Leave/Forward is transactional`, async ({ page }) => {
    const fixture = await prepareRanked(page, { locked });
    await page.goto("/quiz/ranked");
    await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Leave Match");
    const initialLength = await page.evaluate(() => history.length);
    await page.goBack();
    const dialog = page.getByRole("alertdialog", { name: "Leave this Ranked match?" });
    await expect(dialog).toHaveCount(1);
    await page.getByRole("button", { name: "Stay in Match" }).click();
    await expect(page).toHaveURL("/quiz/ranked");
    expect(await page.evaluate(() => history.length)).toBe(initialLength);
    await page.goBack();
    await page.getByRole("button", { name: "Leave Match" }).click();
    await expect(page).toHaveURL("/quiz");
    await page.goForward();
    await expect(page).toHaveURL("/quiz/ranked");
    expect(forbiddenWrites(fixture)).toEqual([]);
  });
}

test("authoritative Ranked terminal state cancels a pending Back", async ({ page }) => {
  const fixture = await prepareRanked(page);
  await page.goto("/quiz/ranked");
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Leave Match");
  await page.goBack();
  await expect(page.getByRole("alertdialog", { name: "Leave this Ranked match?" })).toBeVisible();
  fixture.terminal = true;
  await expect(page.getByTestId("ranked-match-over")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page).toHaveURL("/quiz/ranked");
  expect(forbiddenWrites(fixture)).toEqual([]);
});

test("mobile Ranked guard keeps one focused dialog and the active route", async ({ page }) => {
  const fixture = await prepareRanked(page, { mobile: true });
  await page.goto("/quiz/ranked");
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Leave Match");
  await page.goBack();
  const dialog = page.getByRole("alertdialog", { name: "Leave this Ranked match?" });
  await expect(dialog).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Stay in Match" })).toBeFocused();
  await expect(dialog).toBeInViewport();
  await page.getByRole("button", { name: "Stay in Match" }).click();
  await expect(page).toHaveURL("/quiz/ranked");
  expect(forbiddenWrites(fixture)).toEqual([]);
});
