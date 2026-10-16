/**
 * INT1 → UGMP — owner-only access to the interaction-mode playtests, run against
 * the PRODUCTION bundle (`vite preview` of `dist`).
 *
 * UGMP retired INT1's file-loader page: the owner plays Rangefinder and Glyph
 * Press at /admin/playtests/:mode, where the BACKEND deals every round (the
 * live flow is `unified-playtests-live.spec.ts`). This spec keeps INT1's access
 * guarantees on the production bundle: a non-owner and a signed-out visitor are
 * refused at the new route and at every retired URL, no page offers a file
 * input, and no JS asset carries fixture content.
 *
 * Owner / non-owner: a signed-in Supabase session is placed in storage and the
 * one server question AdminRoute asks — the `owner_auth_state` RPC — is answered
 * here. Every other non-local request (including the backend) is answered
 * locally, so the owner sees the hub's actionable "backend unreachable" state.
 *
 * Screenshots go to INT1_SHOTS (default test-results/interaction-labs).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const SHOTS = process.env.INT1_SHOTS ?? path.resolve("test-results/interaction-labs");
mkdirSync(SHOTS, { recursive: true });

const SUPABASE_REF = "kewgjwrzpzpeltwidvuc";
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** A session-shaped object. The token is unsigned: nothing in this run verifies it, and no real server sees it. */
const session = (userId: string) => {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: `${userId}@example.test`, is_anonymous: false, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  return {
    access_token: `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: userId, aud: "authenticated", role: "authenticated", exp, aal: "aal2" })}.int1`,
    refresh_token: "int1-refresh", token_type: "bearer", expires_in: 86_400, expires_at: exp, user,
  };
};

/**
 * Hermetic: every non-local request is answered here, so no run depends on the
 * network (Supabase: the owner RPC as configured, the user record, empty rows
 * elsewhere; anything else: 204).
 */
async function hermetic(ctx: BrowserContext, owner: boolean | null) {
  await ctx.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (r) => {
    const u = r.request().url();
    if (!/supabase\.co/.test(u)) return r.fulfill({ status: 204, body: "" });
    if (owner !== null && u.includes("/rest/v1/rpc/owner_auth_state")) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(owner
        ? { is_owner: true, authorized: true, aal: "aal2", trusted_device: true, fresh_aal2: true }
        : { is_owner: false }) });
    }
    if (owner !== null && u.includes("/auth/v1/user")) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session(owner ? "int1-owner" : "int1-player").user) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

async function open(browser: Browser, owner: boolean, vp = { width: 1280, height: 720 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 640, hasTouch: vp.width < 640 });
  await hermetic(ctx, owner);
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
    [`sb-${SUPABASE_REF}-auth-token`, JSON.stringify(session(owner ? "int1-owner" : "int1-player"))] as const);
  return ctx.newPage();
}

test.describe("owner and non-owner (production bundle)", () => {
  for (const p of ["/admin/playtests/glyph-press", "/admin/interaction-labs/word-puzzle", "/admin/numeric-lab?mode=combat-estimate", "/admin/playtests/perfect-timing", "/admin/perfect-timing"]) {
    test(`a non-owner at ${p} is redirected away and sees no playtest`, async ({ browser }) => {
      const page = await open(browser, false);
      await page.goto(p);
      await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
      await expect(page.locator("[data-mig-primitive]")).toHaveCount(0);
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
    });
  }

  for (const [from, to] of [
    ["/admin/interaction-labs/rangefinder", "/admin/playtests/rangefinder"],
    ["/admin/interaction-labs/word-puzzle", "/admin/playtests/glyph-press"],
    ["/admin/numeric-lab?mode=combat-estimate", "/admin/playtests/combat-estimate"],
    ["/admin/perfect-timing", "/admin/playtests/perfect-timing"],
  ]) {
    test(`the owner's bookmark ${from} lands on ${to}, with no file input and an actionable state`, async ({ browser }) => {
      const page = await open(browser, true);
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to}$`), { timeout: 15_000 });
      await expect(page.getByTestId("owner-playtest-page")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
      // The backend is unreachable in this hermetic run: the page says so instead of offering rounds.
      await expect(page.locator('[data-testid="owner-playtest-error"], [data-testid="numeric-lab-error"], [data-testid="pt-retry-deal"]').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("playtest-back").first()).toHaveAttribute("href", "/admin/leaguecraft?section=ranked&view=playtests");
      await page.screenshot({ path: path.join(SHOTS, `owner-bookmark-${to.split("/").pop()}-1280x720.png`) });
    });
  }
});

test.describe("signed out (production bundle)", () => {
  test.beforeEach(async ({ context }) => { await hermetic(context, null); });

  for (const p of ["/admin/interaction-labs", "/admin/interaction-labs/word-puzzle", "/admin/interaction-labs/rangefinder", "/admin/playtests/rangefinder", "/admin/playtests/glyph-press", "/admin/numeric-lab", "/admin/playtests/perfect-timing", "/admin/perfect-timing"]) {
    test(`${p} mounts no loader and no playtest`, async ({ page }) => {
      await page.goto(p);
      // Signed out, AdminRoute either redirects home or (Supabase unreachable) shows the unavailable card.
      await expect(async () => {
        const home = new URL(page.url()).pathname === "/";
        const unavailable = await page.getByTestId("owner-unavailable").count();
        expect(home || unavailable > 0).toBe(true);
      }).toPass({ timeout: 20_000 });
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
      await expect(page.locator("[data-mig-primitive]")).toHaveCount(0);
      await page.screenshot({ path: path.join(SHOTS, `prod-signed-out-${p.split("/").pop()}.png`) });
    });
  }

  for (const p of ["/dev/word-puzzle", "/dev/rangefinder", "/dev/perfect-timing"]) {
    test(`${p} is not a route in production`, async ({ page }) => {
      await page.goto(p);
      await page.waitForTimeout(1500);
      await expect(page.locator("[data-mig-primitive]")).toHaveCount(0);
      await expect(page.getByTestId("word-puzzle-lab")).toHaveCount(0);
      await expect(page.getByTestId("rangefinder-lab")).toHaveCount(0);
      await expect(page.getByTestId("perfect-timing-page")).toHaveCount(0);
    });
  }

  test("no JS asset of the production build carries fixture content", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const entry = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    expect(entry.length).toBeGreaterThan(0);
    const manifestish = await (await request.get(entry[0])).text();
    const chunks = new Set([...manifestish.matchAll(/assets\/([A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js)/g)].map((m) => `/assets/${m[1]}`));
    const labChunks = [...chunks].filter((c) => /OwnerPlaytestPage/.test(c));
    expect(labChunks.length, "the owner playtest chunk is reachable (and therefore public)").toBeGreaterThan(0);
    for (const c of labChunks) {
      const body = await (await request.get(c)).text();
      for (const m of body.matchAll(/assets\/([A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js)/g)) chunks.add(`/assets/${m[1]}`);
    }
    const markers = [
      "2026-10-11T23:48:19.725Z", "2026-10-11T21:48:10.970Z", "Template:Data_Ahri/Spirit_Rush",
      "A desert empire of the Ascended", "Life Form Disintegration Ray is", "castRangeUnits\":",
    ];
    for (const c of [...chunks, ...entry]) {
      const body = await (await request.get(c)).text();
      for (const m of markers) expect(body.includes(m), `${c} contains ${m}`).toBe(false);
    }
  });
});
