import { expect, test, type Page } from "@playwright/test";

/**
 * Notifications 2.0 (#92) — browser acceptance, run on GitHub's runner only
 * (AGENTS.md: never against a local desktop browser). The harness mounts the
 * real components over the v2 RPC semantics; see harness.tsx.
 */
const harness = (page: Page, query: string) => page.goto(`/e2e/notifications-v2/harness.html?${query}`);
const row = (page: Page, id: string) => page.getByTestId(`admin-notification-${id}`);
const badge = (page: Page) => page.getByTestId("hud-unread-badge");

async function noHorizontalScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, "page scrolls sideways").toBeLessThanOrEqual(width + 1);
}

test("admin inbox is organised by what needs action, prioritised, and linked to records", async ({ page }, info) => {
  await harness(page, "view=admin&role=admin&seed=reset");
  await expect(page.getByTestId("admin-notif-tab-action")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("admin-notification-summary")).toContainText("3 unresolved · 1 critical · 5 unread");

  const rows = page.locator('[data-testid^="admin-notification-"][data-state]');
  await expect(rows.first()).toHaveAttribute("data-testid", "admin-notification-c1");
  await expect(row(page, "c1")).toContainText("×5 reports");

  const q = row(page, "q1");
  await expect(q).toContainText("Question report");
  await expect(q).toContainText("Incorrect answer");
  await expect(q).toContainText("Which item gives exactly 40 attack damage?");
  await expect(q).toContainText("Review: Received");
  await expect(q.getByRole("link", { name: /Open feedback/ })).toHaveAttribute(
    "href",
    "/admin/users?section=moderation&view=feedback&focus=fb-1&from_notification=q1",
  );
  await expect(q.getByRole("button", { name: /Done/ })).toBeDisabled();
  // A 40-day-old unresolved report is still here: action work never expires.
  await expect(row(page, "u1")).toBeVisible();

  await noHorizontalScroll(page);
  await info.attach("admin-action-required", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("reading is not resolving, and Done survives a reload into Completed", async ({ page }, info) => {
  await harness(page, "view=admin&role=admin&seed=reset");
  await row(page, "q1").getByRole("button", { name: /Mark read/ }).click();
  await expect(row(page, "q1")).toHaveAttribute("data-read", "true");
  await expect(row(page, "q1")).toHaveAttribute("data-state", "active");

  await page.getByTestId("admin-notif-tab-community").click();
  await row(page, "s1").getByRole("button", { name: /Done/ }).click();
  await expect(row(page, "s1")).toHaveCount(0);

  await page.reload();
  await page.getByTestId("admin-notif-tab-community").click();
  await expect(row(page, "s2")).toBeVisible();
  await expect(row(page, "s1")).toHaveCount(0);

  await page.getByTestId("admin-notif-tab-completed").click();
  await expect(row(page, "s1")).toHaveAttribute("data-state", "done");
  await expect(row(page, "r1")).toContainText("Report resolved");
  await info.attach("admin-completed", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("the HUD menu and the admin page agree without a reload", async ({ page }) => {
  await harness(page, "view=sync&role=admin&seed=reset");
  // 5 admin unread + 4 player unread.
  await expect(badge(page)).toHaveText("9");
  await page.getByRole("button", { name: /Mark all read/ }).first().click();
  await expect(badge(page)).toHaveText("6");
  await page.getByTestId("hud-notifications-trigger").click();
  const panel = page.getByTestId("notification-panel");
  await expect(panel.getByTestId("hud-admin-summary")).toContainText("3 need action");
});

test("a second tab's changes converge, as another device would", async ({ context }) => {
  const admin = await context.newPage();
  await harness(admin, "view=admin&role=admin&seed=reset");
  await expect(row(admin, "q1")).toBeVisible();
  const bell = await context.newPage();
  await harness(bell, "view=menu&role=admin");
  await expect(badge(bell)).toHaveText("9");
  await row(admin, "q1").getByRole("button", { name: /Mark read/ }).click();
  await expect(badge(bell)).toHaveText("8");
});

test("player bell: actionable first, dismissal sticks, optional categories can be muted", async ({ page }, info) => {
  await harness(page, "view=menu&role=player&seed=reset");
  await expect(badge(page)).toHaveText("4");
  await page.getByTestId("hud-notifications-trigger").click();
  const panel = page.getByTestId("notification-panel");
  await expect(panel.getByTestId("hud-notification-f1")).toContainText("Needs your response");
  await expect(panel.getByTestId("hud-admin-section")).toHaveCount(0);
  await info.attach("player-bell", { body: await page.screenshot(), contentType: "image/png" });

  await panel.getByRole("button", { name: "Dismiss: Patch 26.20 is live" }).click();
  await expect(panel.getByTestId("hud-notification-a1")).toHaveCount(0);
  await expect(badge(page)).toHaveText("3");
  await page.reload();
  await expect(badge(page)).toHaveText("3");

  await harness(page, "view=player&role=player");
  await page.getByTestId("notifications-view-history").click();
  await expect(page.getByTestId("notifications-item-a1")).toContainText("Dismissed");
  await expect(page.getByText("Account notices")).toBeVisible();
  await page.getByTestId("notification-pref-social").click();
  await expect(page.getByTestId("notification-pref-social")).toHaveAttribute("aria-checked", "false");
  await info.attach("player-page", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await harness(page, "view=menu&role=player");
  await expect(badge(page)).toHaveText("2"); // the friend request is muted; account notice is not mutable
  await noHorizontalScroll(page);
});

test("the bell panel fits the viewport and closes on Escape", async ({ page }) => {
  await harness(page, "view=menu&role=admin&seed=reset");
  const trigger = page.getByTestId("hud-notifications-trigger");
  await trigger.click();
  const panel = page.getByTestId("notification-panel");
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

/* ───────────────────── exact-record deep links ───────────────────── */

const adminRead = (page: Page, id: string) =>
  page.evaluate(nid => {
    const s = (window as unknown as { __inbox: { admin: Array<{ id: string; is_read?: boolean; resolved_at?: string | null }> } }).__inbox;
    const row = s.admin.find(r => r.id === nid);
    return { read: Boolean(row?.is_read), resolved: Boolean(row?.resolved_at) };
  }, id);

test("a notification permalink opens that exact item, survives refresh, and follows Back/Forward", async ({ page }, info) => {
  await harness(page, "view=admin&role=admin&seed=reset&notification=s1");
  const card = page.getByTestId("admin-notification-linked-row");
  await expect(card).toContainText("Add a dark parchment theme");
  await expect(page.getByTestId("admin-notif-tab-community")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "s1")).toHaveClass(/ring-2/);
  await expect.poll(() => adminRead(page, "s1")).toEqual({ read: true, resolved: false });
  await info.attach("admin-permalink", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.reload();
  await expect(page.getByTestId("admin-notification-linked-row")).toContainText("Add a dark parchment theme");

  await page.getByTestId("admin-notification-linked-close").click();
  await expect(page.getByTestId("admin-notification-linked")).toHaveCount(0);
  expect(page.url()).not.toContain("notification=");
  await page.goBack();
  await expect(page.getByTestId("admin-notification-linked-row")).toContainText("Add a dark parchment theme");
  await page.goForward();
  await expect(page.getByTestId("admin-notification-linked")).toHaveCount(0);
});

test("a resolved item opens in Completed; an unknown id is explained, not a blank page", async ({ page }) => {
  await harness(page, "view=admin&role=admin&seed=reset&notification=r1");
  await expect(page.getByTestId("admin-notification-linked-row")).toContainText("Report resolved");
  await expect(page.getByTestId("admin-notif-tab-completed")).toHaveAttribute("aria-selected", "true");

  await harness(page, "view=admin&role=admin&notification=does-not-exist");
  await expect(page.getByTestId("admin-notification-linked-missing")).toBeVisible();
});

test("an image report's permalink is its record view: the image and its hide control", async ({ page }, info) => {
  await harness(page, "view=admin&role=admin&seed=reset&notification=i1");
  const detail = page.getByTestId("admin-image-detail");
  await expect(detail).toContainText("Infinity Edge");
  await expect(detail).toContainText("3 reports");
  await expect(detail.getByRole("button", { name: "Hide image" })).toBeVisible();
  await info.attach("image-record", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("a report deep link opens the exact report beyond the list cap and only then marks it read", async ({ page }, info) => {
  await harness(page, "view=admin&role=admin&seed=reset");
  await expect(row(page, "u1")).toHaveAttribute("data-read", "false");
  expect(await adminRead(page, "u1")).toEqual({ read: false, resolved: false });

  // The record view, opened directly by URL (as from the bell or the inbox).
  await harness(page, "view=reports&role=admin&focus=ur-1&from_notification=u1");
  const report = page.locator('[data-focus-id="ur-1"]');
  await expect(report).toBeVisible();
  await expect(report).toHaveClass(/ring-2/);
  await expect(report).toContainText("Repeated slurs in chat");
  await expect(page.getByTestId("record-focus-found")).toBeVisible();
  await expect.poll(() => adminRead(page, "u1")).toEqual({ read: true, resolved: false });
  await info.attach("report-deep-link", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.reload();
  await expect(page.locator('[data-focus-id="ur-1"]')).toHaveClass(/ring-2/);

  await harness(page, "view=reports&role=admin&focus=ur-deleted&from_notification=u9");
  await expect(page.getByTestId("record-focus-missing")).toContainText("could not be found");
  await expect(page.getByRole("link", { name: "Back to the notification" })).toHaveAttribute(
    "href",
    "/admin/operations?section=notifications&notification=u9",
  );
});

test("the bell sends each admin notification to its exact record, not a landing page", async ({ page }) => {
  await harness(page, "view=menu&role=admin&seed=reset");
  await page.getByTestId("hud-notifications-trigger").click();
  await page.getByTestId("hud-admin-notification-c1").click();
  await expect(page).toHaveURL(/\/admin\/users\?section=moderation&view=comments&focus=cm-1&from_notification=c1$/);
  // Navigating is not reading: the comments view marks it read once it opens.
  expect(await adminRead(page, "c1")).toEqual({ read: false, resolved: false });
});
