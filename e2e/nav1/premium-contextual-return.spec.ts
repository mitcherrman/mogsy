import { expect, test, type Page } from "@playwright/test";

const identity = {
  token: "nav1-premium-token",
  user: { id: "nav1-premium-user", email: "nav1-premium@example.test", is_anonymous: false },
  admin: false,
};

const profile = {
  id: "premium-profile",
  user_id: "nav1-premium-user",
  display_name: "Premium NAV1 Tester",
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
    route.fulfill({ status: 200, contentType: "application/json", body: '[{"role":"moderator"}]' }));
  await page.route("**/rest/v1/rpc/my_pro_entitlement*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/quiz/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"is_pro":false}' }));
}

test.beforeEach(async ({ page }) => prepare(page));

test("Hub entry survives Premium refresh, Back preserves query/hash, and Forward remains normal", async ({ page }) => {
  await page.goto("/lol?origin=nav1-premium#academy");
  await page.getByTestId("hub-premium-cta").click();
  await expect(page).toHaveURL(/\/lol\/premium$/);

  await page.reload();
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol\?origin=nav1-premium#academy$/);

  await page.goForward();
  await expect(page).toHaveURL(/\/lol\/premium$/);
});

test("mobile bulletin entry returns to its exact internal origin", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lol?origin=nav1-bulletin#academy");
  await page.getByTestId("academy-bulletin-cta").click();
  await expect(page).toHaveURL(/\/lol\/premium$/);

  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol\?origin=nav1-bulletin#academy$/);
});

test("direct and external-style initial Premium entries use the deterministic Hub fallback", async ({ page }) => {
  await page.goto("/lol/premium");
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol$/);
  await expect(page.getByTestId("academy-desktop-title")).toBeAttached();

  await page.goto("/about");
  await page.goto("/lol/premium");
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/lol$/);
});
