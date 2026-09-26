import { expect, test, type Page } from "@playwright/test";

const identity = {
  token: "nav1-frontend-only-token",
  user: { id: "nav1-user", email: "nav1@example.test", is_anonymous: false },
  admin: false,
};

const profile = {
  id: "profile-1",
  user_id: "nav1-user",
  display_name: "NAV1 Tester",
  avatar_url: null,
  profile_frame: "default",
  custom_theme: "default",
  is_pro: false,
  is_bot: false,
  is_anonymous: false,
  is_disabled: false,
  created_at: "2026-09-26T00:00:00.000Z",
  socials: {},
};

async function prepare(page: Page) {
  await page.addInitScript(({ identity }) => {
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
  }, { identity });

  await page.route("**/rest/v1/rpc/get_league_profiles*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([profile]) }));
  await page.route("**/rest/v1/profiles*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profile) }));
  await page.route("**/rest/v1/profile_photos*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/rest/v1/user_roles*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/quiz/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

test.beforeEach(async ({ page }) => prepare(page));

test("internal Profile Back pops to its exact origin and browser Forward remains normal", async ({ page }) => {
  await page.goto("/lol?origin=nav1#academy");
  await page.getByTestId("hud-profile").click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol\?origin=nav1#academy$/);

  await page.goForward();
  await expect(page).toHaveURL(/\/profile$/);
});

test("direct Profile entry uses deterministic Home fallback", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol$/);
});

test("internal and direct UserProfile entries choose temporal origin or fallback", async ({ page }) => {
  await page.goto("/profile");
  // The existing responsive button hides its only text below the custom `xs`
  // breakpoint and has no aria-label, so locate it by its retained text node.
  await page.locator("button").filter({ hasText: "Preview" }).click();
  await expect(page).toHaveURL(/\/user\/profile-1$/);
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.goto("/user/profile-1");
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol$/);
});

test("Settings uses temporal Back internally and Home fallback on direct entry", async ({ page }) => {
  await page.goto("/lol?origin=settings");
  await page.getByTestId("hud-notifications-trigger").click();
  await page.getByTestId("hud-settings-link").click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol\?origin=settings$/);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol$/);
});

