/**
 * PT4 — the owner Perfect Timing lab in a real browser.
 *
 * Runs `/dev/perfect-timing` — the SAME page `/admin/perfect-timing` mounts
 * behind AdminRoute, without the owner sign-in a browser spec cannot mint —
 * against an in-page stand-in for `/api/admin/perfect-timing/*`. The stand-in
 * deals the REAL backend capture (`src/lib/perfect-timing/__fixtures__/
 * captureV1.json`, PT4.2-SCORE 4e9a6758) and, because a real press cannot be
 * stamped to the captured millisecond, grades each lock against the captured
 * `target_ms` with the v1 scoring (handoff §2.3). Test-only; never bundled.
 *
 * Proves at desktop and phone sizes: no answer and no number in the DOM before
 * the lock; nothing animating on a loop while timing; keyboard (desktop) and
 * touch (phone) play; exactly one lock per round carrying an integer elapsed
 * time; the reveal; an interrupted round is voided and never submitted; the
 * results; no sideways scroll. Screenshots go to PERFECT_TIMING_SHOTS
 * (default test-results/perfect-timing).
 *
 *   npx playwright test -c playwright.arena.config.ts perfect-timing-owner
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const SHOTS = process.env.PERFECT_TIMING_SHOTS ?? path.resolve("test-results/perfect-timing");
mkdirSync(SHOTS, { recursive: true });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const CAPTURE: Json = JSON.parse(readFileSync(path.resolve("src/lib/perfect-timing/__fixtures__/captureV1.json"), "utf8"));
const RELEASES: Record<string, Json> = Object.fromEntries(CAPTURE.locks.map((l: Json) => [l.round_id, l.response]));

/** The v1 scoring (handoff §2.3, pt-scoring-0.2: 0 points on a miss), for the stand-in only. */
function grade(round_id: string, elapsed_ms: number): Json {
  const cap = RELEASES[round_id];
  const target_ms: number = cap.target_ms;
  const error_ms = elapsed_ms - target_ms;
  const rel = Math.abs(error_ms) / target_ms;
  const tier = rel <= 0.03 ? "perfect" : rel <= 0.07 ? "great" : rel <= 0.15 ? "good" : "miss";
  return {
    contract: "perfect_timing.release.v1", round_id, elapsed_ms, target_ms, error_ms, abs_error_ms: Math.abs(error_ms),
    relative_error: Math.round(rel * 10_000) / 10_000, tier,
    points: tier === "miss" ? 0 : Math.round(100 * Math.max(0, 1 - rel / 0.25)),
    plausibility: { server_window_ms: elapsed_ms + 500, verdict: "ok" },
    authority: cap.authority,
  };
}

interface Backend { deals: Json[]; locks: { id: string; body: Json }[] }

async function standInBackend(page: Page, status = 200): Promise<Backend> {
  const be: Backend = { deals: [], locks: [] };
  await page.route("**/api/admin/perfect-timing/**", async (route: Route) => {
    const p = new URL(route.request().url()).pathname.replace("/api/admin/perfect-timing", "");
    const json = (body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    if (status !== 200) return json({ detail: "Owner authorization required" }, status);
    const body = route.request().postDataJSON() as Json;
    if (p === "/deal") {
      be.deals.push(body);
      const deal = JSON.parse(JSON.stringify(CAPTURE.deal.response));
      for (const r of deal.rounds) r.expires_at = new Date(Date.now() + 15 * 60_000).toISOString();
      return json(deal);
    }
    const m = p.match(/^\/rounds\/([^/]+)\/lock$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      be.locks.push({ id, body });
      if (!RELEASES[id]) return json({ detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "Unknown or expired round." } } }, 404);
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== "elapsed_ms" || !Number.isInteger(body.elapsed_ms)) return json({ detail: [{ msg: "invalid" }] }, 422);
      return json(grade(id, body.elapsed_ms));
    }
    return json({ detail: "not found" }, 404);
  });
  return be;
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "horizontal overflow px").toBeLessThanOrEqual(4);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
}

/** While the clock runs: no digit on the stage, no answer in the DOM, nothing looping. */
async function assertSilentWhileRunning(page: Page, roundId: string) {
  const probe = await page.evaluate((cooldownRaw: string) => {
    const stage = document.querySelector('[data-testid="pt-stage"]') as HTMLElement;
    const rank = document.querySelector('[data-testid="pt-rank"]')?.textContent ?? "";
    const text = (stage.textContent ?? "").replace(rank, "");
    const looping = document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const timing = a.effect?.getComputedTiming();
      return t && (t.closest('[data-testid="pt-stage"]') || t.closest(".ranked-arena-header, header")) && timing && timing.iterations === Infinity && a.playState === "running";
    }).map((a) => ((a.effect as KeyframeEffect).target as Element).className);
    return {
      digits: /\d/.test(text),
      answer: document.body.innerHTML.includes(cooldownRaw) || /target_ms|cooldown_raw/.test(document.body.innerHTML),
      timer: document.querySelectorAll('[data-testid="timer-value"]').length,
      looping,
    };
  }, RELEASES[roundId].authority.cooldown_raw);
  expect(probe).toEqual({ digits: false, answer: false, timer: 0, looping: [] });
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, touch: false },
  { name: "390x844", width: 390, height: 844, touch: true },
  { name: "375x812", width: 375, height: 812, touch: true },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });

    test(`a full five-round run by ${vp.touch ? "touch" : "keyboard"}`, async ({ page }) => {
      const be = await standInBackend(page);
      await page.goto("/dev/perfect-timing");
      const seal = page.getByTestId("pt-press-surface");
      const rounds: Json[] = CAPTURE.deal.response.rounds;
      for (let i = 0; i < rounds.length; i++) {
        await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
        await expect(page.getByTestId("pt-ability")).toHaveText(rounds[i].ability_name);
        const html = await page.locator("body").innerHTML();
        expect(html, "pre-lock answer").not.toContain(RELEASES[rounds[i].round_id].authority.cooldown_raw);
        if (i === 0) {
          await page.screenshot({ path: path.join(SHOTS, `${vp.name}-armed.png`) });
          // The seal's icon is the stored ability icon from the asset helpers.
          await expect(page.getByTestId("pt-seal-icon").locator("img")).toHaveAttribute("src", /assets\/champions\/Ahri\/E_AhriE\.png$/);
        }
        if (vp.touch) {
          await seal.tap();
        } else {
          await seal.focus();
          await page.keyboard.press("Space");
        }
        await expect(seal).toHaveAttribute("data-phase", "running");
        await assertSilentWhileRunning(page, rounds[i].round_id);
        if (i === 0) await page.screenshot({ path: path.join(SHOTS, `${vp.name}-running.png`) });
        await page.waitForTimeout(1200 + i * 150);
        if (vp.touch) await seal.tap(); else await page.keyboard.press("Enter");
        await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId("pt-reveal-stage")).toContainText(RELEASES[rounds[i].round_id].authority.cooldown_raw);
        if (i === 0) {
          await page.waitForTimeout(1500);
          await noSideScroll(page);
          await page.screenshot({ path: path.join(SHOTS, `${vp.name}-revealed.png`), fullPage: true });
        }
        const next = page.getByRole("button", { name: i === rounds.length - 1 ? /see results/i : /next round/i });
        if (vp.touch) await next.tap();
        else { await next.focus(); await page.keyboard.press("Enter"); }
      }
      await expect(page.getByTestId("pt-results")).toBeVisible();
      expect(be.locks.map((l) => l.id)).toEqual(rounds.map((r) => r.round_id));
      for (const l of be.locks) {
        expect(Object.keys(l.body)).toEqual(["elapsed_ms"]);
        expect(Number.isInteger(l.body.elapsed_ms)).toBe(true);
        expect(l.body.elapsed_ms).toBeGreaterThanOrEqual(1000);
      }
      await noSideScroll(page);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-results.png`), fullPage: true });
    });
  });
}

test("hiding the tab mid-run voids the round and never submits it", async ({ page }) => {
  const be = await standInBackend(page);
  await page.goto("/dev/perfect-timing");
  const seal = page.getByTestId("pt-press-surface");
  await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
  await seal.focus();
  await page.keyboard.press("Space");
  await expect(seal).toHaveAttribute("data-phase", "running");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  await expect(page.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "voided");
  await expect(page.getByTestId("pt-status")).toContainText("Run interrupted — round voided");
  await expect(page.getByTestId("pt-continue")).toBeFocused();
  await page.screenshot({ path: path.join(SHOTS, "1440x900-voided.png") });
  await page.keyboard.press("Enter");
  await expect(seal).toHaveAttribute("data-phase", "armed");
  await expect(seal).toBeFocused();
  expect(be.locks).toHaveLength(0);
  await expect(page.getByTestId("pt-flank-run")).toContainText("Voided");
});

test("a refused owner session shows the reason, not rounds", async ({ page }) => {
  await standInBackend(page, 403);
  await page.goto("/dev/perfect-timing");
  await expect(page.getByTestId("pt-status")).toContainText("owner session", { timeout: 30_000 });
  await expect(page.getByTestId("pt-champion")).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "1440x900-refused.png") });
});

// ── PT4.3: Space/Enter without focus on the seal ──────────────────────────
async function blurAll(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
}

test.describe("PT4.3 keyboard without seal focus", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Space and Enter start and stop every round with focus on <body>; Next never starts a round", async ({ page }) => {
    const be = await standInBackend(page);
    await page.goto("/dev/perfect-timing");
    const seal = page.getByTestId("pt-press-surface");
    const rounds: Json[] = CAPTURE.deal.response.rounds;
    for (let i = 0; i < rounds.length; i++) {
      await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
      // Advancing (by Enter on Next for i > 0) must not have started the round.
      await page.waitForTimeout(300);
      await expect(seal).toHaveAttribute("data-phase", "armed");
      await blurAll(page);
      const key = i % 2 === 0 ? "Space" : "Enter";
      const scrollY = await page.evaluate(() => window.scrollY);
      await page.keyboard.press(key);
      await expect(seal).toHaveAttribute("data-phase", "running");
      expect(await page.evaluate(() => window.scrollY), "Space must not scroll").toBe(scrollY);
      await blurAll(page);
      await page.waitForTimeout(1100);
      await page.keyboard.press(key);
      await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
      // Keys on the reveal do nothing to the timer and submit nothing.
      await blurAll(page);
      await page.keyboard.press("Space");
      await page.keyboard.press("Enter");
      const next = page.getByRole("button", { name: i === rounds.length - 1 ? /see results/i : /next round/i });
      await next.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page.getByTestId("pt-results")).toBeVisible();
    expect(be.locks.map((l) => l.id), "exactly one lock per round").toEqual(rounds.map((r) => r.round_id));
    // After the run no listener is left driving anything: keys on results are inert.
    await blurAll(page);
    await page.keyboard.press("Space");
    expect(be.locks).toHaveLength(rounds.length);
  });

  test("mixed controls: mouse start + Space stop, Enter start + mouse stop", async ({ page }) => {
    const be = await standInBackend(page);
    await page.goto("/dev/perfect-timing");
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await seal.click();
    await expect(seal).toHaveAttribute("data-phase", "running");
    await blurAll(page);
    await page.waitForTimeout(1100);
    await page.keyboard.press("Space");
    await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /next round/i }).click();
    await expect(seal).toHaveAttribute("data-phase", "armed");
    await blurAll(page);
    await page.keyboard.press("Enter");
    await expect(seal).toHaveAttribute("data-phase", "running");
    await page.waitForTimeout(1100);
    await seal.click();
    await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
    expect(be.locks).toHaveLength(2);
    expect(new Set(be.locks.map((l) => l.id)).size).toBe(2);
  });

  test("a held key and a pointer+key on one press submit once", async ({ page }) => {
    const be = await standInBackend(page);
    await page.goto("/dev/perfect-timing");
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await blurAll(page);
    await page.keyboard.down("Space");
    await page.waitForTimeout(600);
    await page.keyboard.down("Space"); // a second down while held is delivered with repeat=true
    await page.waitForTimeout(600);
    await page.keyboard.up("Space");
    await expect(seal).toHaveAttribute("data-phase", "running");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    expect(be.locks).toHaveLength(1);
  });
});
