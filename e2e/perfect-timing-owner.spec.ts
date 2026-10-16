/**
 * PT4 — the owner Perfect Timing lab in a real browser (PT4.4: a fixed,
 * non-scrolling screen).
 *
 * Runs `/dev/perfect-timing` — the SAME page `/admin/perfect-timing` mounts
 * behind AdminRoute, without the owner sign-in a browser spec cannot mint —
 * against an in-page stand-in for `/api/admin/perfect-timing/*`. The stand-in
 * deals the REAL backend capture (`src/lib/perfect-timing/__fixtures__/
 * captureV1.json`, PT4.2-SCORE 4e9a6758) and, because a real press cannot be
 * stamped to the captured millisecond, grades each lock against the captured
 * `target_ms` with the v1 scoring (handoff §2.3). Test-only; never bundled.
 *
 * Proves at desktop, tablet and phone sizes: no answer and no number in the DOM
 * before the lock; nothing animating on a loop while timing; keyboard (desktop)
 * and touch (phone) play; exactly one lock per round carrying an integer elapsed
 * time; the reveal; an interrupted round is voided and never submitted; the
 * results.
 *
 * PT4.4: EVERY state fits the viewport with nothing to scroll — dealing, armed,
 * running, reveal, results, voided, a refused deal, a failed lock — at every
 * size in FIT_SIZES; no key and no wheel moves the page; leaving restores page
 * scroll. Screenshots go to PERFECT_TIMING_SHOTS (default test-results/perfect-timing).
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
function grade(round_id: string, elapsed_ms: number, lie: number | null = null): Json {
  const cap = RELEASES[round_id];
  // Test-only: answer as if the truth were `lie` (a fraction) off the stop, so the tiers a
  // real press rarely hits (perfect, exact) can be drawn and measured. The echo of the
  // stop itself is never altered: the client refuses a release that changes it.
  const target_ms: number = lie === null ? cap.target_ms : Math.round(elapsed_ms / (1 + lie));
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

interface Backend { deals: Json[]; locks: { id: string; body: Json }[]; lie: number | null }
interface BackendOptions { dealStatus?: number; lockStatus?: number; dealDelayMs?: number }

async function standInBackend(page: Page, opts: BackendOptions | number = {}): Promise<Backend> {
  const o: BackendOptions = typeof opts === "number" ? { dealStatus: opts } : opts;
  const be: Backend = { deals: [], locks: [], lie: null };
  await page.route("**/api/admin/perfect-timing/**", async (route: Route) => {
    const p = new URL(route.request().url()).pathname.replace("/api/admin/perfect-timing", "");
    const json = (body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = route.request().postDataJSON() as Json;
    if (p === "/deal") {
      be.deals.push(body);
      if (o.dealDelayMs) await new Promise((r) => setTimeout(r, o.dealDelayMs));
      if (o.dealStatus && o.dealStatus !== 200) return json({ detail: "Owner authorization required" }, o.dealStatus);
      const deal = JSON.parse(JSON.stringify(CAPTURE.deal.response));
      for (const r of deal.rounds) r.expires_at = new Date(Date.now() + 15 * 60_000).toISOString();
      return json(deal);
    }
    const m = p.match(/^\/rounds\/([^/]+)\/lock$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      be.locks.push({ id, body });
      if (o.lockStatus) return json({ detail: { error: { code: "PT_ALREADY_LOCKED", message: "already locked" } } }, o.lockStatus);
      if (!RELEASES[id]) return json({ detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "Unknown or expired round." } } }, 404);
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== "elapsed_ms" || !Number.isInteger(body.elapsed_ms)) return json({ detail: [{ msg: "invalid" }] }, 422);
      return json(grade(id, body.elapsed_ms, be.lie));
    }
    return json({ detail: "not found" }, 404);
  });
  return be;
}

/**
 * PT4.4 — the screen FITS and nothing can scroll. Checks, in this state:
 *  - the document has no overflow and has not scrolled, on either axis;
 *  - html and body are overflow:hidden (the mode owns the viewport);
 *  - the screen, the main area and the stage have no clipped overflow;
 *  - every test-id'd element on the screen sits inside the viewport (a thing
 *    that overflowed would be clipped, not scrolled, so its rect gives it away).
 */
async function assertFits(page: Page, label: string) {
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const screen = document.querySelector<HTMLElement>('[data-testid="perfect-timing-page"]');
    if (!screen) return { missing: true } as const;
    const over = (el: Element | null) => (el ? { y: el.scrollHeight - el.clientHeight, x: el.scrollWidth - el.clientWidth } : { y: 0, x: 0 });
    const outside: string[] = [];
    for (const el of screen.querySelectorAll<HTMLElement>("[data-testid]")) {
      const id = el.dataset.testid ?? "";
      if (id === "pt-backdrop") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.bottom > vh + 1 || r.right > vw + 1 || r.left < -1 || r.top < -1) {
        outside.push(`${id} [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}] in ${vw}x${vh}`);
      }
    }
    const cs = (el: Element) => getComputedStyle(el);
    return {
      missing: false,
      doc: over(de),
      scroll: { x: window.scrollX, y: window.scrollY },
      htmlOverflow: cs(de).overflow,
      bodyOverflow: cs(document.body).overflow,
      screenBox: (() => { const r = screen.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(),
      viewport: [0, 0, vw, vh],
      screen: over(screen),
      main: over(screen.querySelector(".pt-main")),
      stage: over(screen.querySelector(".pt-stage, .pt-results")),
      outside,
    };
  });
  expect(m.missing, `${label}: screen mounted`).toBe(false);
  if (m.missing) return;
  expect(m.htmlOverflow, `${label}: html overflow`).toBe("hidden");
  expect(m.bodyOverflow, `${label}: body overflow`).toBe("hidden");
  expect(m.doc, `${label}: document overflow`).toEqual({ y: expect.any(Number), x: expect.any(Number) });
  expect(m.doc.y, `${label}: document vertical overflow`).toBeLessThanOrEqual(1);
  expect(m.doc.x, `${label}: document horizontal overflow`).toBeLessThanOrEqual(1);
  expect(m.scroll, `${label}: page scrolled`).toEqual({ x: 0, y: 0 });
  expect(m.screenBox, `${label}: screen fills the viewport`).toEqual(m.viewport);
  expect(m.screen.y, `${label}: screen vertical overflow`).toBeLessThanOrEqual(1);
  expect(m.screen.x, `${label}: screen horizontal overflow`).toBeLessThanOrEqual(1);
  expect(m.main.y, `${label}: main vertical overflow`).toBeLessThanOrEqual(1);
  expect(m.main.x, `${label}: main horizontal overflow`).toBeLessThanOrEqual(1);
  expect(m.stage.y, `${label}: stage vertical overflow`).toBeLessThanOrEqual(1);
  expect(m.stage.x, `${label}: stage horizontal overflow`).toBeLessThanOrEqual(1);
  expect(m.outside, `${label}: elements outside the viewport`).toEqual([]);
}

/** No key and no wheel can move anything. Leaves the stage's state alone (no Space/Enter: those play). */
async function assertNothingScrolls(page: Page, label: string) {
  for (const key of ["PageDown", "PageUp", "End", "Home", "ArrowDown", "ArrowUp"]) await page.keyboard.press(key);
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 900);
  await page.mouse.wheel(0, -900);
  await page.mouse.wheel(300, 0);
  const pos = await page.evaluate(() => ({
    x: window.scrollX, y: window.scrollY,
    root: document.scrollingElement?.scrollTop ?? 0,
    inner: [...document.querySelectorAll<HTMLElement>('[data-testid="perfect-timing-page"], [data-testid="perfect-timing-page"] *')]
      .filter((el) => el.scrollTop !== 0 || el.scrollLeft !== 0).map((el) => el.className),
  }));
  expect(pos, `${label}: scrolled`).toEqual({ x: 0, y: 0, root: 0, inner: [] });
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
      return t && t.closest('[data-testid="perfect-timing-page"]') && timing && timing.iterations === Infinity && a.playState === "running";
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

/** PT4.4: the main gameplay screen carries the champion art and the ability icon, before any reveal. */
async function assertChampionArt(page: Page, label: string) {
  const hero = page.getByTestId("pt-round-plate");
  await expect(hero.locator(".pt-hero-icon img"), `${label}: ability icon`).toHaveAttribute("src", /assets\/champions\/\w+\/[QWER]_\w+\.png$/);
  await expect(hero.getByTestId("pt-champion"), `${label}: champion`).not.toBeEmpty();
  await expect(hero.getByTestId("pt-ability"), `${label}: ability name`).not.toBeEmpty();
  await expect(hero.locator(".pt-slot"), `${label}: spell letter`).toHaveText(/^[QWER]$/);
  await expect(hero.getByTestId("pt-rank"), `${label}: rank`).toContainText(/rank/i);
  await expect(hero.locator(".pt-hero-art"), `${label}: splash art`).toHaveAttribute("data-art", /splash|none/);
}

/** PT4.4: no prototype / owner-lab / playtest / disclaimer chrome. */
async function assertNoClutter(page: Page) {
  const text = await page.getByTestId("perfect-timing-page").innerText();
  expect(text).not.toMatch(/prototype|owner lab|owner-only|playtest|tamper|not part of/i);
  await expect(page.getByTestId("pt-banner")).toHaveCount(0);
}

/** Fit sizes: desktop, laptop, tablet, phones (portrait and landscape), and a short window. */
const FIT_SIZES = [
  { w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 1366, h: 768 }, { w: 1280, h: 720 }, { w: 1024, h: 600 },
  { w: 820, h: 1180 }, { w: 768, h: 1024 },
  { w: 430, h: 932 }, { w: 390, h: 844 }, { w: 375, h: 667 }, { w: 360, h: 640 }, { w: 320, h: 568 },
  { w: 844, h: 390 }, { w: 667, h: 375 },
] as const;

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
        await page.waitForTimeout(300); // past the key guard a key-driven advance sets
        await expect(page.getByTestId("pt-ability")).toHaveText(rounds[i].ability_name);
        const html = await page.locator("body").innerHTML();
        expect(html, "pre-lock answer").not.toContain(RELEASES[rounds[i].round_id].authority.cooldown_raw);
        await assertChampionArt(page, `${vp.name} round ${i + 1} armed`);
        if (i === 0) {
          await assertNoClutter(page);
          await assertFits(page, `${vp.name} armed`);
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
        if (i === 0) {
          await assertFits(page, `${vp.name} running`);
          await page.screenshot({ path: path.join(SHOTS, `${vp.name}-running.png`) });
        }
        await page.waitForTimeout(1200 + i * 150);
        if (vp.touch) await seal.tap(); else await page.keyboard.press("Enter");
        await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId("pt-reveal-stage")).toContainText(RELEASES[rounds[i].round_id].authority.cooldown_raw);
        await expect(page.getByTestId("pt-round-plate").locator(".pt-hero-icon img")).toBeVisible();
        if (i === 0 || i === 2) {
          await page.waitForTimeout(1900);
          await assertFits(page, `${vp.name} revealed ${i + 1}`);
          await page.screenshot({ path: path.join(SHOTS, `${vp.name}-revealed-${i + 1}.png`) });
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
      await page.waitForTimeout(600);
      await assertFits(page, `${vp.name} results`);
      await assertNoClutter(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-results.png`) });
    });
  });
}

// ── PT4.4: every state fits, at every size ────────────────────────────────
test.describe("PT4.4 the screen fits and cannot scroll", () => {
  for (const { w, h } of FIT_SIZES) {
    test(`${w}x${h}: dealing, armed, running, reveal, results, voided`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: w, height: h });
      const tag = `${w}x${h}`;
      const be = await standInBackend(page, { dealDelayMs: 1500 });
      await page.goto("/dev/perfect-timing");
      // dealing
      await expect(page.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "dealing");
      await assertFits(page, `${tag} dealing`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-dealing.png`) });
      const seal = page.getByTestId("pt-press-surface");
      await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
      await page.waitForTimeout(500);
      await assertFits(page, `${tag} armed`);
      await assertNothingScrolls(page, `${tag} armed`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-armed.png`) });
      // run a miss (stopped early) and a hit through the real keys
      await seal.focus();
      await page.keyboard.press("Space");
      await expect(seal).toHaveAttribute("data-phase", "running");
      await assertFits(page, `${tag} running`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-running.png`) });
      await page.waitForTimeout(1100);
      await page.keyboard.press("Space");
      await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(2000);
      await assertFits(page, `${tag} revealed`);
      await assertNothingScrolls(page, `${tag} revealed`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-revealed.png`) });
      // play the remaining rounds by Space/Enter alone, advancing with Space
      for (let i = 1; i < 5; i++) {
        await page.keyboard.press("Space"); // advances the settled reveal
        await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 10_000 });
        await page.waitForTimeout(300); // past the key guard a key-driven advance sets
        await page.keyboard.press("Enter");
        await expect(seal).toHaveAttribute("data-phase", "running");
        await page.waitForTimeout(1100);
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(1900);
        await assertFits(page, `${tag} revealed ${i + 1}`);
      }
      await page.keyboard.press("Space");
      await expect(page.getByTestId("pt-results")).toBeVisible({ timeout: 10_000 });
      expect(be.locks, "exactly one lock per round").toHaveLength(5);
      await page.waitForTimeout(600);
      await assertFits(page, `${tag} results`);
      await assertNothingScrolls(page, `${tag} results`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-results.png`) });
      // Space on the results does nothing: no scroll, no new run
      await page.keyboard.press("Space");
      await assertFits(page, `${tag} results after Space`);
      expect(be.deals).toHaveLength(1);
    });

    test(`${w}x${h}: a voided round, a refused deal and a failed lock`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: w, height: h });
      const tag = `${w}x${h}`;
      // voided
      await standInBackend(page);
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
      await assertFits(page, `${tag} voided`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-voided.png`) });
      await page.unroute("**/api/admin/perfect-timing/**");
      // refused deal
      await standInBackend(page, 403);
      await page.goto("/dev/perfect-timing");
      await expect(page.getByTestId("pt-status")).toContainText("owner session", { timeout: 30_000 });
      await assertFits(page, `${tag} refused`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-refused.png`) });
      await page.unroute("**/api/admin/perfect-timing/**");
      // failed lock (409: never retried, a long message plus a recovery button)
      await standInBackend(page, { lockStatus: 409 });
      await page.goto("/dev/perfect-timing");
      await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
      await seal.focus();
      await page.keyboard.press("Space");
      await page.waitForTimeout(1100);
      await page.keyboard.press("Space");
      await expect(page.getByTestId("pt-void-continue")).toBeVisible({ timeout: 10_000 });
      await assertFits(page, `${tag} lock error`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-lock-error.png`) });
      await page.unroute("**/api/admin/perfect-timing/**");
      // the widest verdicts: a PERFECT (late by 2%) and an EXACT, each on its own round
      const be = await standInBackend(page);
      for (const [label, lie] of [["perfect", 0.02], ["exact", 0]] as const) {
        be.lie = lie;
        await page.goto("/dev/perfect-timing");
        await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
        await seal.focus();
        await page.keyboard.press("Space");
        await page.waitForTimeout(1100);
        await page.keyboard.press("Space");
        await expect(page.getByTestId("pt-tier")).toHaveText("Perfect", { timeout: 10_000 });
        await page.waitForTimeout(2000);
        await assertFits(page, `${tag} ${label} reveal`);
        await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-reveal-${label}.png`) });
      }
    });
  }

  test("the page behind scrolls normally again once the mode is left", async ({ page }) => {
    await standInBackend(page);
    await page.goto("/dev/perfect-timing");
    await expect(page.getByTestId("pt-press-surface")).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
    // Leave through the app's own routing (no reload): the hub is a long, scrollable page.
    await page.evaluate(() => { window.history.pushState({}, "", "/"); window.dispatchEvent(new PopStateEvent("popstate")); });
    await expect(page.getByTestId("perfect-timing-page")).toHaveCount(0);
    const after = await page.evaluate(() => ({
      html: document.documentElement.style.overflow, body: document.body.style.overflow,
      attr: document.documentElement.hasAttribute("data-pt-fixed-viewport"),
    }));
    expect(after).toEqual({ html: "", body: "", attr: false });
    await page.keyboard.press("PageDown"); // an ordinary page takes its keys back
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  });
});

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
  await expect(page.getByTestId("pt-pips").locator('[data-tier="voided"]')).toHaveCount(1);
});

test("a refused owner session shows the reason, not rounds", async ({ page }) => {
  await standInBackend(page, 403);
  await page.goto("/dev/perfect-timing");
  await expect(page.getByTestId("pt-status")).toContainText("owner session", { timeout: 30_000 });
  await expect(page.getByTestId("pt-champion")).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "1440x900-refused.png") });
});

// ── PT4.3 / PT4.4: Space/Enter without focus on the seal ───────────────────
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
      // Keys during the reveal's choreography do nothing: no skip, no second submit.
      await blurAll(page);
      await page.keyboard.press("Space");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("pt-reveal-stage")).toBeVisible();
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
    await assertFits(page, "results after Space");
  });

  test("PT4.4: after the reveal settles, one Space advances exactly one round and a double-tap cannot skip the next", async ({ page }) => {
    const be = await standInBackend(page);
    await page.goto("/dev/perfect-timing");
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await blurAll(page);
    await page.keyboard.press("Space");
    await expect(seal).toHaveAttribute("data-phase", "running");
    await page.waitForTimeout(1100);
    await page.keyboard.press("Space");
    await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
    await blurAll(page);
    await page.waitForTimeout(2000);
    await blurAll(page);
    // A double-tap: the first Space advances; the second (<50ms later) must not start the next round.
    await page.keyboard.press("Space");
    await page.keyboard.press("Space");
    await expect(seal).toHaveAttribute("data-phase", "armed");
    await page.waitForTimeout(300);
    await expect(seal).toHaveAttribute("data-phase", "armed");
    expect(be.locks).toHaveLength(1);
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
