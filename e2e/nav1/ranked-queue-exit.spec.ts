import { expect, test, type Page, type Request } from "@playwright/test";
import {
  privatePlayerV2,
  publicRoundV2,
  queueStatusV1,
} from "../../src/lib/ranked-public/fixtures";

type QueueAuthority = {
  status: "waiting" | "claimed" | "matched" | "cancelled";
  matchId: string | null;
  cancelFailure: boolean;
  cancelRequests: number;
  forfeitRequests: number;
  requests: Request[];
};

const origin = "/lol?origin=nav1-e2q#academy";

async function prepare(page: Page, mobile = false): Promise<QueueAuthority> {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const authority: QueueAuthority = {
    status: "waiting",
    matchId: null,
    cancelFailure: false,
    cancelRequests: 0,
    forfeitRequests: 0,
    requests: [],
  };
  page.on("request", (request) => {
    authority.requests.push(request);
    const path = new URL(request.url()).pathname;
    if (request.method() === "DELETE" && path === "/api/ranked/queue") {
      authority.cancelRequests += 1;
    }
    if (request.method() === "POST" && path.endsWith("/forfeit")) {
      authority.forfeitRequests += 1;
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("lol:ranked-rules:seen_version", "1");
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({
      token: "nav1-e2q-token",
      user: { id: "userA", email: "nav1-e2q@example.test", is_anonymous: false },
      admin: false,
    }));
    // Give the data router a same-document POP entry, matching a real SPA
    // arrival from Home. This is fixture setup only; production adds nothing.
    if (location.pathname === "/quiz" && location.search === "?play=1") {
      history.replaceState({ idx: 0, key: "e2q-origin", usr: null }, "", "/lol?origin=nav1-e2q#academy");
      history.pushState({ idx: 1, key: "e2q-queue", usr: null }, "", "/quiz?play=1");
    }
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const fulfill = (options: Parameters<typeof route.fulfill>[0]) => route.fulfill({
      ...options,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:8081",
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
        ...options.headers,
      },
    });
    if (!["fetch", "xhr"].includes(request.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) {
      return route.continue();
    }
    if (url.pathname === "/api/ranked/queue") {
      if (request.method() === "DELETE") {
        if (authority.cancelFailure) {
          return fulfill({ status: 503, json: { detail: {
            code: "RANKED_QUEUE_UNAVAILABLE", message: "Could not cancel matchmaking.",
          } } });
        }
        // The backend refuses a claimed row; model that boundary explicitly.
        if (authority.status === "claimed" || authority.status === "matched") {
          return fulfill({ status: 409, json: { detail: {
            code: "RANKED_CANNOT_CANCEL", message: "Pairing has already started.",
          } } });
        }
        authority.status = "cancelled";
        return fulfill({ json: queueStatusV1("cancelled") });
      }
      return fulfill({ json: queueStatusV1(authority.status, authority.matchId) });
    }
    if (url.pathname === "/api/ranked/active-match") {
      return fulfill({ json: authority.matchId ? {
        match_id: authority.matchId,
        is_bot_match: false,
        within_reconnect_window: true,
        host: "standalone",
      } : null });
    }
    if (url.pathname.startsWith("/api/ranked/matches/m-e2q")) {
      if (url.pathname.endsWith("/presence")) {
        return fulfill({ json: { status: "active", match_id: "m-e2q", active: true } });
      }
      const body = url.pathname.endsWith("/private")
        ? privatePlayerV2("userA")
        : publicRoundV2(false);
      return fulfill({
        json: JSON.parse(JSON.stringify(body).replaceAll('"m1"', '"m-e2q"')),
      });
    }
    if (url.pathname.endsWith("/role")) {
      return fulfill({ json: { role: "top", selected_at: null, updated_at: null } });
    }
    if (url.pathname.endsWith("/availability")) {
      return fulfill({ json: {
        schema_version: "ranked_duel.availability.v1",
        projection_type: "ranked_availability",
        server_time: new Date().toISOString(),
        payload: { open: true, state: "open", reason: "launch", next_open_at: null, closes_at: null },
      } });
    }
    if (url.pathname.startsWith("/api/quiz/")) {
      if (url.pathname.endsWith("/entitlement")) return fulfill({ json: { ok: true, is_pro: false } });
      if (url.pathname === "/api/quiz/sets") return fulfill({ json: { sets: [] } });
      return fulfill({ status: 503, json: { detail: "Unavailable in NAV1 fixture" } });
    }
    if (url.pathname.endsWith("/today")) return fulfill({ json: { run: null } });
    if (url.pathname.includes("/profiles")) return fulfill({ json: {
      id: "nav1-profile", user_id: "userA", display_name: "NAV1 E2Q",
      is_anonymous: false, is_disabled: false, socials: {},
    } });
    return fulfill({ json: [] });
  });
  return authority;
}

async function openQueue(page: Page, expected: "waiting" | "pairing" = "waiting") {
  await page.goto("/quiz?play=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("play-scroll")).toBeVisible();
  await page.getByTestId("play-mode-ranked").click();
  await expect(page.getByTestId("play-ranked")).toHaveAttribute("data-queue-state", expected);
}

test("waiting Back: Stay preserves queue/history; retry cancels before exact POP", async ({ page }) => {
  const authority = await prepare(page);
  await openQueue(page);
  const historyLength = await page.evaluate(() => history.length);

  await page.evaluate(() => history.back());
  const dialog = page.getByRole("alertdialog", { name: "Leave Ranked queue?" });
  await expect(dialog).toHaveCount(1);
  await page.getByRole("button", { name: "Stay in Queue" }).click();
  await expect(page).toHaveURL("/quiz?play=1");
  expect(authority.cancelRequests).toBe(0);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  await page.evaluate(() => history.back());
  const cancelAndLeave = page.getByRole("button", { name: "Cancel Queue & Leave" });
  await expect(cancelAndLeave).toBeVisible();
  await cancelAndLeave.evaluate((element: HTMLButtonElement) => element.click());
  await expect(page).toHaveURL(origin);
  expect(authority.cancelRequests).toBe(1);
  expect(authority.forfeitRequests).toBe(0);
  await page.goForward();
  await expect(page).toHaveURL("/quiz?play=1");
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test("waiting HUD Home preserves /lol after authoritative cancellation", async ({ page }) => {
  const authority = await prepare(page);
  await openQueue(page);
  await page.getByTestId("hud-home").evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("alertdialog", { name: "Leave Ranked queue?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Queue & Leave" }).click();
  await expect(page).toHaveURL("/lol");
  expect(authority.cancelRequests).toBe(1);
  expect(authority.forfeitRequests).toBe(0);
});

test("cancellation failure keeps the exact destination blocked and can retry", async ({ page }) => {
  const authority = await prepare(page);
  authority.cancelFailure = true;
  await openQueue(page);
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Cancel Queue & Leave" }).click();
  await expect(page).toHaveURL("/quiz?play=1");
  await expect(page.getByTestId("play-ranked-error")).toContainText("Could not cancel matchmaking");
  await expect(page.getByRole("alertdialog", { name: "Leave Ranked queue?" })).toBeVisible();
  expect(authority.cancelRequests).toBe(1);
  expect(authority.forfeitRequests).toBe(0);

  authority.cancelFailure = false;
  await page.getByRole("button", { name: "Cancel Queue & Leave" }).click();
  await expect(page).toHaveURL(origin);
  expect(authority.cancelRequests).toBe(2);
});

test("waiting-to-pairing race replaces destructive copy and never cancels", async ({ page }) => {
  const authority = await prepare(page);
  await openQueue(page);
  await page.evaluate(() => history.back());
  await expect(page.getByRole("alertdialog", { name: "Leave Ranked queue?" })).toBeVisible();
  authority.status = "claimed";
  await expect(page.getByRole("alertdialog", {
    name: "Leave while your Ranked match is starting?",
  })).toBeVisible({ timeout: 4_000 });
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page).toHaveURL(origin);
  expect(authority.cancelRequests).toBe(0);
  expect(authority.forfeitRequests).toBe(0);
});

test("pairing navigation is non-cancelling and preserves the exact SPA destination", async ({ page }) => {
  const authority = await prepare(page);
  authority.status = "claimed";
  await openQueue(page, "pairing");
  await page.getByTestId("hud-home").evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("alertdialog", {
    name: "Leave while your Ranked match is starting?",
  })).toBeVisible();
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page).toHaveURL("/lol");
  expect(authority.cancelRequests).toBe(0);
  expect(authority.forfeitRequests).toBe(0);
});

test("pairing-to-matched handoff cancels stale queue navigation; Ranked guard owns next leave", async ({ page }) => {
  const authority = await prepare(page);
  authority.status = "claimed";
  await openQueue(page, "pairing");
  await page.evaluate(() => history.back());
  await expect(page.getByRole("alertdialog", {
    name: "Leave while your Ranked match is starting?",
  })).toBeVisible();

  authority.status = "matched";
  authority.matchId = "m-e2q";
  await expect(page).toHaveURL("/quiz/ranked", { timeout: 5_000 });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByTestId("hud-home").evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("alertdialog", { name: "Leave this Ranked match?" })).toHaveCount(1);
  expect(authority.cancelRequests).toBe(0);
  expect(authority.forfeitRequests).toBe(0);
});

test("repeated Back keeps one pending transition and one cancellation", async ({ page }) => {
  const authority = await prepare(page);
  await openQueue(page);
  await page.evaluate(() => history.back());
  const dialog = page.getByRole("alertdialog", { name: "Leave Ranked queue?" });
  await expect(dialog).toHaveCount(1);
  await page.evaluate(() => {
    history.back();
    history.forward();
  });
  await expect(dialog).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel Queue & Leave" }).click();
  await expect(page).toHaveURL(origin);
  expect(authority.cancelRequests).toBe(1);
});

test("mobile queue confirmation fits and has one safe action", async ({ page }) => {
  const authority = await prepare(page, true);
  await openQueue(page);
  await page.evaluate(() => history.back());
  const dialog = page.getByRole("alertdialog", { name: "Leave Ranked queue?" });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeInViewport();
  await expect(page.getByRole("button", { name: "Stay in Queue" })).toBeVisible();
  await page.getByRole("button", { name: "Stay in Queue" }).click();
  await expect(page).toHaveURL("/quiz?play=1");
  expect(authority.cancelRequests).toBe(0);
});
