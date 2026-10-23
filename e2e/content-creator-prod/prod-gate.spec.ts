/**
 * Content Creator — PRODUCTION-BUILD gates, against `vite preview` of a real
 * `vite build` (the E2E identity seam is compiled out of this bundle).
 *
 *  - /dev/content-studio (the loopback-only local workspace) no longer renders
 *    in production; it forwards to /admin/content-creator.
 *  - /admin/content-creator itself refuses a visitor with no owner session.
 *
 * Hermetic: Supabase is a placeholder host answered here; nothing leaves the
 * runner.
 */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://e2e-supabase.test/**", (route) =>
    route.fulfill({
      status: route.request().method() === "OPTIONS" ? 204 : 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
      body: "[]",
    }),
  );
  await page.route("http://127.0.0.1:8000/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }),
  );
});

test("the local Content Workspace is not served in production", async ({ page }) => {
  await page.goto("/dev/content-studio");
  await expect(page).not.toHaveURL(/\/dev\/content-studio/, { timeout: 30_000 });
  await expect(page.getByText("Content Workspace API base")).toHaveCount(0);
});

test("the Content Creator refuses a visitor without an owner session", async ({ page }) => {
  await page.goto("/admin/content-creator");
  await expect(page).not.toHaveURL(/content-creator/, { timeout: 30_000 });
  await expect(page.getByTestId("admin-content-creator")).toHaveCount(0);
});
