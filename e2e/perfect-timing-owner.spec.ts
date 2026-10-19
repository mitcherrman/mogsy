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
 * PT5: the mode pick, and the Mastery Slice (one ability, three stages) under the
 * same fit, scroll, answer-isolation and input rules, at every size in FIT_SIZES.
 *
 * PT5.1: leaving a revealed slice stage goes through a between-stage TRANSITION
 * (Rank up, Item equipped) — its own state, nothing armed, no clock — and Continue
 * (or Space/Enter once it has settled) arms the next stage; every state still fits.
 *
 * PT5.2: the seal's face is the Arcane Chronometer, a visible stopwatch. The only
 * digits it adds are its own reading: 0.00 armed, counting up while running,
 * frozen on exactly the submitted `elapsed_ms`; its pulses move nothing; nothing
 * loops; reduced motion keeps the digits and drops every effect.
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
/** PT5: the page opens on the mode pick; the PT4.4 specs below play the Random Run directly. */
const RANDOM_RUN = "/dev/perfect-timing?run=random";

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
      stage: over(screen.querySelector(".pt-stage, .pt-results, .pt-transition")),
      // PT5.1: the transition card clips its own overflow, so a thing that did not fit would be hidden, not scrolled.
      card: over(screen.querySelector(".pt-tr-card")),
      cardClipped: (() => {
        const card = screen.querySelector(".pt-tr-card");
        if (!card) return [] as string[];
        const c = card.getBoundingClientRect();
        return [...card.querySelectorAll<HTMLElement>("[data-testid]")].filter((el) => {
          const r = el.getBoundingClientRect();
          return (r.width || r.height) && (r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1);
        }).map((el) => el.dataset.testid ?? "");
      })(),
      outside,
    };
  });
  expect(m.missing, `${label}: screen mounted`).toBe(false);
  if (m.missing) return;
  expect.soft(m.htmlOverflow, `${label}: html overflow`).toBe("hidden");
  expect.soft(m.bodyOverflow, `${label}: body overflow`).toBe("hidden");
  expect.soft(m.doc, `${label}: document overflow`).toEqual({ y: expect.any(Number), x: expect.any(Number) });
  expect.soft(m.doc.y, `${label}: document vertical overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.doc.x, `${label}: document horizontal overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.scroll, `${label}: page scrolled`).toEqual({ x: 0, y: 0 });
  expect.soft(m.screenBox, `${label}: screen fills the viewport`).toEqual(m.viewport);
  expect.soft(m.screen.y, `${label}: screen vertical overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.screen.x, `${label}: screen horizontal overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.main.y, `${label}: main vertical overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.main.x, `${label}: main horizontal overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.stage.y, `${label}: stage vertical overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.stage.x, `${label}: stage horizontal overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.card.y, `${label}: transition card vertical overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.card.x, `${label}: transition card horizontal overflow`).toBeLessThanOrEqual(1);
  expect.soft(m.cardClipped, `${label}: elements clipped by the transition card`).toEqual([]);
  expect.soft(m.outside, `${label}: elements outside the viewport`).toEqual([]);
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

/** While the clock runs: no digit on the stage but the chronometer's own reading, no answer in the DOM, nothing looping. */
async function assertSilentWhileRunning(page: Page, roundId: string) {
  const probe = await page.evaluate((cooldownRaw: string) => {
    const stage = (document.querySelector('[data-testid="pt-stage"]') as HTMLElement).cloneNode(true) as HTMLElement;
    const reading = stage.querySelector('[data-testid="pt-chrono-digits"]');
    if (!reading || !/^\d+\.\d\d$/.test(reading.textContent ?? "")) return { digits: true, answer: true, timer: -1, looping: ["chronometer missing"] };
    reading.remove();
    const rank = stage.querySelector('[data-testid="pt-rank"]')?.textContent ?? "";
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
      await page.goto(RANDOM_RUN);
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
      await page.goto(RANDOM_RUN);
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
      // PT5.2: a second into the cooldown (past the first pulse) it still fits, and it holds still once locked.
      await assertFits(page, `${tag} running 1s`);
      await assertNothingScrolls(page, `${tag} running 1s`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-running-1s.png`) });
      await page.keyboard.press("Space");
      await expect(seal).toHaveAttribute("data-phase", /stopped|submitting/);
      await assertFits(page, `${tag} locked`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-locked.png`) });
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
      await page.goto(RANDOM_RUN);
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
      await page.goto(RANDOM_RUN);
      await expect(page.getByTestId("pt-status")).toContainText("owner session", { timeout: 30_000 });
      await assertFits(page, `${tag} refused`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-refused.png`) });
      await page.unroute("**/api/admin/perfect-timing/**");
      // failed lock (409: never retried, a long message plus a recovery button)
      await standInBackend(page, { lockStatus: 409 });
      await page.goto(RANDOM_RUN);
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
        await page.goto(RANDOM_RUN);
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
    await page.goto(RANDOM_RUN);
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
  await page.goto(RANDOM_RUN);
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
  await page.goto(RANDOM_RUN);
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
    await page.goto(RANDOM_RUN);
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
    await page.goto(RANDOM_RUN);
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
    await page.goto(RANDOM_RUN);
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
    await page.goto(RANDOM_RUN);
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

/**
 * PT5.1: through the transition after stage `n` (1 or 2): it names the change, shows
 * no duration, waits to be readable, then Continue arms the next stage.
 */
async function passTransition(page: Page, vp: { name: string; touch: boolean }, n: number) {
  const tr = page.getByTestId("pt-transition");
  await expect(tr).toBeVisible();
  await expect(tr).toHaveAttribute("data-kind", n === 1 ? "rank_up" : "equipped");
  await expect(page.getByTestId("pt-tr-title")).toHaveText(n === 1 ? /^rank up$/i : /^item equipped$/i);
  await expect(page.getByTestId("pt-tr-icon").locator("img")).toHaveAttribute("src", /assets\/champions\/Ezreal\/Q_EzrealQ\.png$/);
  if (n === 1) {
    await expect(page.getByTestId("pt-tr-from")).toHaveText("Rank 1");
    await expect(page.getByTestId("pt-tr-to")).toHaveText("Rank 3");
  } else {
    await expect(page.getByTestId("pt-tr-item-name")).toHaveText("Sheen");
    await expect(page.getByTestId("pt-tr-haste")).toHaveText(/\+10 ability haste/i);
    await expect(page.getByTestId("pt-tr-item-icon")).toHaveAttribute("src", /assets\/items\/3057\.png$/);
    await expect(page.getByTestId("pt-tr-effect")).toHaveText(/cooldown reduced/i);
  }
  if (n === 1) await expect(page.getByTestId("pt-tr-effect")).toHaveText(/cooldown changed/i);
  await expect(page.getByTestId("pt-tr-adjust")).toHaveText(/adjust your timing/i);
  // Nothing is armed and no duration is on screen.
  await expect(page.getByTestId("pt-press-surface")).toHaveCount(0);
  const text = await tr.innerText();
  expect(text, "no duration on the transition").not.toMatch(/\d+(\.\d+)?\s?(ms|s)\b/i);
  expect(await page.locator("body").innerHTML(), "no truth in the DOM").not.toMatch(/target_ms|cooldown_raw|4\.545|5\.00 s|5\.50 s/);
  await expect(tr).toHaveAttribute("data-ready", "true", { timeout: 5000 });
  await page.waitForTimeout(1700); // the entrance is over
  await assertFits(page, `${vp.name} transition ${n}`);
  await page.screenshot({ path: path.join(SHOTS, `${vp.name}-slice-transition-${n}.png`) });
  const cont = page.getByTestId("pt-tr-continue");
  if (vp.touch) await cont.tap(); else { await expect(cont).toBeFocused(); await page.keyboard.press("Space"); }
  await expect(page.getByTestId("pt-press-surface")).toHaveAttribute("data-phase", "armed", { timeout: 10_000 });
}

// ── PT5: the mode pick and the Mastery Slice ───────────────────────────────
//
// The slice stand-in deals the REAL backend slice capture
// (`src/lib/perfect-timing/__fixtures__/sliceCaptureV1.json`, Ezreal Q:
// 5500 → 5000 → 4545 ms) and grades each stage against its captured target
// with the same v1 scoring as above. A resume (`{resume: …}`) mints fresh ids
// over the captured stages from `from_stage`, as the backend does.

const SLICE: Json = JSON.parse(readFileSync(path.resolve("src/lib/perfect-timing/__fixtures__/sliceCaptureV1.json"), "utf8"));
const SLICE_RELEASES: Json[] = SLICE.locks.map((l: Json) => l.response);
const SLICE_RUN = "/dev/perfect-timing?run=slice";

interface SliceBackend { deals: Json[]; locks: { slice: string; id: string; body: Json }[]; lie: number | null }

async function standInSlices(page: Page, opts: { dealStatus?: number; dealDelayMs?: number; lockStatus?: number } = {}): Promise<SliceBackend> {
  const be: SliceBackend = { deals: [], locks: [], lie: null };
  const stageOf = new Map<string, { i: number; slice: string }>();
  let minted = 0;
  await page.route("**/api/admin/perfect-timing/**", async (route: Route) => {
    const p = new URL(route.request().url()).pathname.replace("/api/admin/perfect-timing", "");
    const json = (body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = route.request().postDataJSON() as Json;
    if (p === "/slices/deal") {
      be.deals.push(body);
      if (opts.dealDelayMs) await new Promise((r) => setTimeout(r, opts.dealDelayMs));
      if (opts.dealStatus && opts.dealStatus !== 200) return json({ detail: "Owner authorization required" }, opts.dealStatus);
      const deal = JSON.parse(JSON.stringify(SLICE.deal.response));
      if (body.resume) {
        const hex = (n: number) => n.toString(16).padStart(32, "0");
        deal.slice_id = `pts_${hex(++minted)}`;
        deal.start_stage = body.resume.from_stage;
        for (const s of deal.stages) s.round_id = s.stage < body.resume.from_stage ? null : `pt_${hex(1000 + ++minted)}`;
      }
      deal.expires_at = new Date(Date.now() + 15 * 60_000).toISOString();
      deal.stages.forEach((s: Json, i: number) => { if (s.round_id) stageOf.set(s.round_id, { i, slice: deal.slice_id }); });
      return json(deal);
    }
    const m = p.match(/^\/slices\/([^/]+)\/rounds\/([^/]+)\/lock$/);
    if (m) {
      const [sid, rid] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
      be.locks.push({ slice: sid, id: rid, body });
      if (opts.lockStatus) return json({ detail: { error: { code: "PT_STAGE_CLOSED", message: "closed" } } }, opts.lockStatus);
      const known = stageOf.get(rid);
      if (!known || known.slice !== sid) return json({ detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "Unknown or expired slice round." } } }, 404);
      const cap = SLICE_RELEASES[known.i];
      const elapsed_ms: number = body.elapsed_ms;
      const target_ms: number = be.lie === null ? cap.target_ms : Math.round(elapsed_ms / (1 + be.lie));
      const error_ms = elapsed_ms - target_ms;
      const rel = Math.abs(error_ms) / target_ms;
      const tier = rel <= 0.03 ? "perfect" : rel <= 0.07 ? "great" : rel <= 0.15 ? "good" : "miss";
      return json({
        ...cap, slice_id: sid, round_id: rid, elapsed_ms, target_ms, error_ms, abs_error_ms: Math.abs(error_ms),
        relative_error: Math.round(rel * 10_000) / 10_000, tier,
        points: tier === "miss" ? 0 : Math.round(100 * Math.max(0, 1 - rel / 0.25)),
        plausibility: { server_window_ms: elapsed_ms + 500, verdict: "ok" },
        // The stand-in's lie moves the target; move the base with it so the shown arithmetic stays true
        // (base × 100 ÷ (100 + AH) = target), as the real server's always is.
        calculation: be.lie === null ? cap.calculation : {
          ...cap.calculation,
          base_cooldown_ms: Math.round((target_ms * (100 + cap.calculation.ability_haste)) / 100),
          exact_ms: `${target_ms}.0000`,
        },
        slice_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
    }
    return json({ detail: "not found" }, 404);
  });
  return be;
}

/** While a slice stage runs: only public inputs as digits, no truth in the DOM, nothing looping. */
async function assertSliceSilentWhileRunning(page: Page, stage: number) {
  const probe = await page.evaluate((s: number) => {
    // PT5.2: the chronometer's reading is the elapsed time, not an input; set it aside.
    const stageEl = (document.querySelector('[data-testid="pt-stage"]') as HTMLElement).cloneNode(true) as HTMLElement;
    stageEl.querySelector('[data-testid="pt-chrono-digits"]')?.remove();
    const digits = [...new Set((stageEl.textContent ?? "").match(/\d+/g) ?? [])].sort();
    const html = document.body.innerHTML;
    const looping = document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const timing = a.effect?.getComputedTiming();
      return t && t.closest('[data-testid="perfect-timing-page"]') && timing && timing.iterations === Infinity && a.playState === "running";
    }).map((a) => ((a.effect as KeyframeEffect).target as Element).className);
    // PT5's "what changed" mark animates only while ARMED: once the timer runs it must be at rest.
    const running = document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
      return t && t.closest('[data-changed="true"]') && a.playState === "running";
    }).map((a) => ((a.effect as KeyframeEffect).target as Element).className);
    return { s, digits, truth: /5\.50 s|5\.00 s|4\.545|5\.5 \/ 5\.25|target_ms|cooldown_raw|base_cooldown_ms/.test(html), looping, running };
  }, stage);
  const allowed = [["1", "5"], ["1", "3", "5"], ["10", "3", "5"]][stage - 1];
  expect(probe).toEqual({ s: stage, digits: allowed, truth: false, looping: [], running: [] });
}

test.describe("PT5 mode pick", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the page opens on the two modes; Enter starts a Random Run, the slice tile starts a slice", async ({ page }) => {
    const be = await standInBackend(page);
    await page.goto("/dev/perfect-timing");
    await expect(page.getByTestId("pt-mode-select")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pt-mode-random")).toBeFocused();
    await assertFits(page, "mode pick");
    await assertNoClutter(page);
    await page.screenshot({ path: path.join(SHOTS, "1440x900-mode-pick.png") });
    expect(be.deals).toHaveLength(0);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("pt-press-surface")).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    expect(be.deals).toEqual([{ count: 5 }]);
    expect(new URL(page.url()).searchParams.get("run")).toBe("random");
  });
});

for (const vp of [
  { name: "1440x900", width: 1440, height: 900, touch: false },
  { name: "390x844", width: 390, height: 844, touch: true },
  { name: "375x812", width: 375, height: 812, touch: true },
] as const) {
  test.describe(`PT5 slice ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });

    test(`a full Mastery Slice by ${vp.touch ? "touch" : "keyboard"}`, async ({ page }) => {
      test.setTimeout(120_000);
      const be = await standInSlices(page);
      await page.goto("/dev/perfect-timing");
      const tile = page.getByTestId("pt-mode-slice");
      if (vp.touch) await tile.tap(); else { await tile.focus(); await page.keyboard.press("Enter"); }
      const seal = page.getByTestId("pt-press-surface");
      const kinds = ["foundation", "rank_up", "equipped"];
      for (let i = 0; i < 3; i++) {
        await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
        await page.waitForTimeout(1000); // the "what changed" mark settles; past the key guard
        const hero = page.getByTestId("pt-round-plate");
        await expect(hero).toHaveAttribute("data-slice", kinds[i]);
        await expect(hero.getByTestId("pt-champion")).toHaveText("Ezreal");
        await expect(hero.getByTestId("pt-ability")).toHaveText("Mystic Shot");
        await expect(hero.locator(".pt-hero-icon img")).toHaveAttribute("src", /assets\/champions\/Ezreal\/Q_EzrealQ\.png$/);
        await expect(page.getByTestId(`pt-slice-step-${kinds[i]}`)).toHaveAttribute("data-state", "current");
        await expect(hero.getByTestId("pt-rank-value")).toHaveText(new RegExp(`Rank ${i === 0 ? 1 : 3} / 5`));
        if (i === 2) {
          await expect(hero.getByTestId("pt-item-icon")).toHaveAttribute("src", /assets\/items\/3057\.png$/);
          await expect(hero.getByTestId("pt-item-name")).toHaveText("Sheen");
          await expect(hero.getByTestId("pt-item-haste")).toHaveText(/\+10/);
        } else {
          await expect(hero.getByTestId("pt-item-chip")).toHaveCount(0);
        }
        await assertFits(page, `${vp.name} slice stage ${i + 1} armed`);
        await assertNoClutter(page);
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-slice-${i + 1}-armed.png`) });
        if (vp.touch) await seal.tap(); else { await seal.focus(); await page.keyboard.press("Space"); }
        await expect(seal).toHaveAttribute("data-phase", "running");
        await assertSliceSilentWhileRunning(page, i + 1);
        if (i === 2) await page.screenshot({ path: path.join(SHOTS, `${vp.name}-slice-3-running.png`) });
        await page.waitForTimeout(1200 + i * 150);
        if (vp.touch) await seal.tap(); else await page.keyboard.press("Enter");
        await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(1900);
        // The graded precision: 5500 → "5.50 s", 4545 → "4.545 s" (never the float-rounded "4.54 s").
        await expect(page.getByTestId("pt-true-time")).toHaveText(["5.50 s", "5.00 s", "4.545 s"][i]);
        await expect(page.getByTestId("pt-slice-delta")).toBeVisible();
        if (i === 2) await expect(page.getByTestId("pt-slice-math")).toContainText("5.000 s × 100 ÷ (100 + 10) = 4.545 s");
        await assertFits(page, `${vp.name} slice stage ${i + 1} revealed`);
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-slice-${i + 1}-revealed.png`) });
        const next = page.getByRole("button", { name: i === 2 ? /see results/i : /next stage/i });
        if (vp.touch) await next.tap(); else { await next.focus(); await page.keyboard.press("Enter"); }
        if (i < 2) await passTransition(page, vp, i + 1);
      }
      await expect(page.getByTestId("pt-results")).toHaveAttribute("data-mode", "slice");
      await expect(page.getByTestId("pt-slice-story")).toContainText("Sheen +10 AH");
      expect(be.deals).toEqual([{}]);
      expect(be.locks.map((l) => l.id)).toEqual(SLICE.deal.response.stages.map((s: Json) => s.round_id));
      for (const l of be.locks) {
        expect(Object.keys(l.body)).toEqual(["elapsed_ms"]);
        expect(Number.isInteger(l.body.elapsed_ms)).toBe(true);
      }
      await page.waitForTimeout(600);
      await assertFits(page, `${vp.name} slice results`);
      await assertNoClutter(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-slice-results.png`) });
      // Change mode goes back to the pick, which fits too.
      const change = page.getByTestId("pt-exit");
      if (vp.touch) await change.tap(); else await change.click();
      await expect(page.getByTestId("pt-mode-select")).toBeVisible();
      await assertFits(page, `${vp.name} mode pick after results`);
    });
  });
}

test.describe("PT5 every slice state fits and cannot scroll", () => {
  for (const { w, h } of FIT_SIZES) {
    test(`${w}x${h}: mode pick, three stages, reveals, results, resume, voided`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: w, height: h });
      const tag = `${w}x${h}`;
      // mode pick
      await standInBackend(page);
      await page.goto("/dev/perfect-timing");
      await expect(page.getByTestId("pt-mode-select")).toBeVisible({ timeout: 30_000 });
      await assertFits(page, `${tag} mode pick`);
      await assertNothingScrolls(page, `${tag} mode pick`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-mode-pick.png`) });
      await page.unroute("**/api/admin/perfect-timing/**");
      // a slice, the widest verdict on the equipped stage
      const be = await standInSlices(page, { dealDelayMs: 800 });
      await page.goto(SLICE_RUN);
      await expect(page.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "dealing");
      await assertFits(page, `${tag} slice dealing`);
      const seal = page.getByTestId("pt-press-surface");
      for (let i = 0; i < 3; i++) {
        be.lie = i === 2 ? 0.02 : null;
        await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
        await page.waitForTimeout(1000);
        await assertFits(page, `${tag} slice ${i + 1} armed`);
        await assertNothingScrolls(page, `${tag} slice ${i + 1} armed`);
        await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-slice-${i + 1}-armed.png`) });
        await seal.focus();
        await page.keyboard.press("Space");
        await expect(seal).toHaveAttribute("data-phase", "running");
        await assertFits(page, `${tag} slice ${i + 1} running`);
        await page.waitForTimeout(1100);
        await page.keyboard.press("Space");
        await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(2000);
        await assertFits(page, `${tag} slice ${i + 1} revealed`);
        await assertNothingScrolls(page, `${tag} slice ${i + 1} revealed`);
        await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-slice-${i + 1}-revealed.png`) });
        await page.keyboard.press("Space"); // advance the settled reveal
        if (i < 2) {
          // PT5.1: the between-stage transition fits too, mid-entrance and settled.
          const tr = page.getByTestId("pt-transition");
          await expect(tr).toBeVisible();
          await expect(tr).toHaveAttribute("data-kind", i === 0 ? "rank_up" : "equipped");
          await expect(page.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "transition");
          await page.waitForTimeout(1800);
          await assertFits(page, `${tag} slice transition ${i + 1}`);
          await assertNothingScrolls(page, `${tag} slice transition ${i + 1}`);
          await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-slice-transition-${i + 1}.png`) });
          await page.keyboard.press("Space"); // continue
        }
      }
      await expect(page.getByTestId("pt-results")).toBeVisible({ timeout: 10_000 });
      expect(be.locks, "exactly one lock per stage").toHaveLength(3);
      await page.waitForTimeout(600);
      await assertFits(page, `${tag} slice results`);
      await assertNothingScrolls(page, `${tag} slice results`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-slice-results.png`) });
      await page.unroute("**/api/admin/perfect-timing/**");
      // an expired stage: the resume message, then the same ability again
      const first = await standInSlices(page);
      await page.goto(SLICE_RUN);
      await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
      const expiredSlice = first.locks.length === 0 ? null : first.locks[0].slice;
      await page.unroute("**/api/admin/perfect-timing/**");
      // A new stand-in that has never seen this slice: its lock answers 404, as after a restart.
      const be2 = await standInSlices(page, { dealDelayMs: 1500 });
      expect(expiredSlice).toBeNull();
      await seal.focus();
      await page.keyboard.press("Space");
      await page.waitForTimeout(1100);
      await page.keyboard.press("Space"); // the new stand-in does not know this slice: 404 → resume
      await expect(page.getByTestId("pt-status")).toContainText("re-dealing Ezreal Mystic Shot", { timeout: 10_000 });
      await assertFits(page, `${tag} slice resuming`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-slice-resuming.png`) });
      await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
      expect(be2.deals[0].resume).toMatchObject({ champion: "Ezreal", slot: "Q", from_stage: 1 });
      // voided
      await seal.focus();
      await page.keyboard.press("Space");
      await expect(seal).toHaveAttribute("data-phase", "running");
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      });
      await expect(page.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "voided");
      await assertFits(page, `${tag} slice voided`);
      await page.screenshot({ path: path.join(SHOTS, `fit-${tag}-slice-voided.png`) });
      // One lock reached the server: the stop that met the expired slice (404 → resume). The voided stage sent nothing.
      expect(be2.locks).toHaveLength(1);
      expect(be2.locks[0].slice).toBe(SLICE.deal.response.slice_id);
      expect(be2.locks[0].id).toBe(SLICE.deal.response.stages[0].round_id);
    });
  }
});

// ── PT5.1: the transition input and motion rules ───────────────────────────
/** Play slice stage `i` (1-based) by keyboard to its settled reveal. */
async function playToSettledReveal(page: Page, i: number) {
  const seal = page.getByTestId("pt-press-surface");
  await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
  await page.waitForTimeout(400);
  await seal.focus();
  await page.keyboard.press("Space");
  await expect(seal).toHaveAttribute("data-phase", "running");
  await page.waitForTimeout(1200 + i * 100);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2000); // past the reveal settle: Space/Enter now advance it
}

const runningInTransition = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => {
  const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
  return t && t.closest(".pt-transition") && a.playState === "running";
}).length);
const loopingAnywhere = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => {
  const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
  return t && t.closest('[data-testid="perfect-timing-page"]') && a.effect?.getComputedTiming().iterations === Infinity && a.playState === "running";
}).length);

test.describe("PT5.1 transitions: keys, motion, recovery", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Space cannot skip the transition early, a held key and a double press move one state, and Continue never casts", async ({ page }) => {
    test.setTimeout(120_000);
    const be = await standInSlices(page);
    await page.goto(SLICE_RUN);
    await playToSettledReveal(page, 1);
    await page.keyboard.press("Space"); // leaves the reveal
    const tr = page.getByTestId("pt-transition");
    await expect(tr).toBeVisible();
    await expect(page.getByTestId("pt-press-surface")).toHaveCount(0);
    expect(await loopingAnywhere(page), "nothing loops").toBe(0);
    // A double press right behind the one that left the reveal cannot leave this too.
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await expect(tr).toHaveAttribute("data-ready", "false");
    await expect(tr).toBeVisible();
    // Settled: focus is on Continue. A held key (repeat) and a second press move exactly one state.
    await expect(tr).toHaveAttribute("data-ready", "true", { timeout: 5000 });
    await expect(page.getByTestId("pt-tr-continue")).toBeFocused();
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 10_000 });
    // The key that continued, pressed again at once, does not start the timer.
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
    await expect(seal).toHaveAttribute("data-phase", "armed");
    // After the guard it casts as usual.
    await page.waitForTimeout(400);
    await page.keyboard.press("Space");
    await expect(seal).toHaveAttribute("data-phase", "running");
    expect(be.locks, "only stage 1 was ever locked").toHaveLength(1);
  });

  test("the entrance is finite, shows no truth, and never runs while a stage is timed", async ({ page }) => {
    test.setTimeout(120_000);
    await standInSlices(page);
    await page.goto(SLICE_RUN);
    await playToSettledReveal(page, 1);
    await page.keyboard.press("Space");
    const tr = page.getByTestId("pt-transition");
    await expect(tr).toHaveAttribute("data-animate", "true");
    await expect(tr).toBeVisible();
    // Something is moving at first...
    expect(await runningInTransition(page)).toBeGreaterThan(0);
    // ...nothing infinite ever is, and all of it has finished well inside 2.2 s.
    expect(await loopingAnywhere(page)).toBe(0);
    await page.waitForTimeout(2200);
    expect(await runningInTransition(page), "entrance finished").toBe(0);
    await expect(tr).toHaveAttribute("data-ready", "true");
    await page.keyboard.press("Space");
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed");
    await page.waitForTimeout(400);
    await page.keyboard.press("Space");
    await expect(seal).toHaveAttribute("data-phase", "running");
    expect(await runningInTransition(page)).toBe(0);
    expect(await loopingAnywhere(page)).toBe(0);
    await expect(page.getByTestId("pt-transition")).toHaveCount(0);
  });

  test("reduced motion: the finished frame at once, no animation, ready quickly", async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await standInSlices(page);
    await page.goto(SLICE_RUN);
    await playToSettledReveal(page, 1);
    await page.keyboard.press("Space");
    const tr = page.getByTestId("pt-transition");
    await expect(tr).toBeVisible();
    await expect(tr).toHaveAttribute("data-animate", "false");
    expect(await runningInTransition(page), "no animation under reduced motion").toBe(0);
    await expect(page.getByTestId("pt-tr-to")).toHaveText("Rank 3");
    await expect(tr).toHaveAttribute("data-ready", "true", { timeout: 1500 });
    await assertFits(page, "reduced motion transition");
  });

  test("a voided stage still announces the next stage change", async ({ page }) => {
    test.setTimeout(120_000);
    const be = await standInSlices(page);
    await page.goto(SLICE_RUN);
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await page.waitForTimeout(400);
    await seal.focus();
    await page.keyboard.press("Space");
    await expect(seal).toHaveAttribute("data-phase", "running");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    });
    await expect(page.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "voided");
    await page.getByTestId("pt-continue").click();
    const tr = page.getByTestId("pt-transition");
    await expect(tr).toBeVisible();
    await expect(tr).toHaveAttribute("data-kind", "rank_up");
    await expect(tr).toHaveAttribute("data-ready", "true", { timeout: 5000 });
    await page.getByTestId("pt-tr-continue").click();
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 10_000 });
    await expect(page.getByTestId("pt-stage-badge")).toHaveText("Rank up");
    expect(be.locks, "the voided stage sent nothing").toHaveLength(0);
  });

  test("an expired slice at Continue re-deals the same ability, then plays the stage", async ({ page }) => {
    test.setTimeout(120_000);
    await standInSlices(page);
    await page.goto(SLICE_RUN);
    await playToSettledReveal(page, 1);
    // The slice clock runs out while the player is reading: swap in a stand-in that has never seen it,
    // and mark the deal as already expired on the client.
    await page.unroute("**/api/admin/perfect-timing/**");
    const be2 = await standInSlices(page);
    await page.keyboard.press("Space");
    const tr = page.getByTestId("pt-transition");
    await expect(tr).toBeVisible();
    await expect(tr).toHaveAttribute("data-ready", "true", { timeout: 5000 });
    await page.keyboard.press("Space");
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await expect(page.getByTestId("pt-slice-step-rank_up")).toHaveAttribute("data-state", "current");
    expect(be2.locks).toHaveLength(0);
  });
});

test.describe("PT5.1 touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("tapping Continue arms the stage and a quick second tap cannot cast it", async ({ page }) => {
    test.setTimeout(120_000);
    await standInSlices(page);
    await page.goto(SLICE_RUN);
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await page.waitForTimeout(400);
    await seal.tap();
    await expect(seal).toHaveAttribute("data-phase", "running");
    await page.waitForTimeout(1200);
    await seal.tap();
    await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /next stage/i }).tap();
    const tr = page.getByTestId("pt-transition");
    await expect(tr).toBeVisible();
    // A tap before it is readable does nothing.
    const box = (await page.getByTestId("pt-tr-continue").boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(tr).toBeVisible();
    await expect(tr).toHaveAttribute("data-ready", "true", { timeout: 5000 });
    await page.waitForTimeout(1600);
    const cb = (await page.getByTestId("pt-tr-continue").boundingBox())!;
    // Two taps in a row, the second where the seal may now be.
    await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 10_000 });
    const sb = (await seal.boundingBox())!;
    await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.waitForTimeout(100);
    await expect(seal).toHaveAttribute("data-phase", "armed");
  });
});

// ── PT5.2: the Arcane Chronometer ─────────────────────────────────────────

/** The chronometer's reading, as seconds (NaN when absent). */
async function chronoReading(page: Page): Promise<number> {
  return Number(await page.getByTestId("pt-chrono-digits").textContent());
}

/** Layout boxes that must not move while the clock runs: the instrument and everything around it. */
async function layoutBoxes(page: Page) {
  return page.evaluate(() => {
    const ids = ["pt-press-surface", "pt-chrono-digits", "pt-seal-icon", "pt-seal-word", "pt-status", "pt-hint", "pt-round-plate"];
    return ids.map((id) => {
      const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
      return r ? `${id}:${r.left.toFixed(2)},${r.top.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}` : `${id}:none`;
    });
  });
}

/**
 * Counts the chronometer's tick voices as they are rendered by Web Audio: the
 * tick and the mark are the only voices with a 1,480 Hz body. Installed before
 * the page loads; it only observes.
 */
async function countTickVoices(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ptTicks: number[]; __ptVoices: number };
    w.__ptTicks = [];
    w.__ptVoices = 0;
    const set = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value: number, time: number) {
      if (value === 1480) w.__ptTicks.push(performance.now());
      return set.call(this, value, time);
    };
    const osc = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { w.__ptVoices += 1; return osc.call(this); };
  });
}

for (const vp of [{ name: "1440x900", width: 1440, height: 900, touch: false }, { name: "390x844", width: 390, height: 844, touch: true }] as const) {
  test.describe(`PT5.2 chronometer ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });

    test("0.00 armed → counts up from the cast → freezes on the submitted value → 0.00 next round; nothing moves", async ({ page }) => {
      const be = await standInBackend(page);
      await page.goto(RANDOM_RUN);
      const seal = page.getByTestId("pt-press-surface");
      await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
      await page.waitForTimeout(400);
      await expect(page.getByTestId("pt-chrono-digits")).toHaveText("0.00");
      await expect(page.getByTestId("pt-seal-word")).toHaveText(/cast/i);
      const press = async () => { if (vp.touch) await seal.tap(); else { await seal.focus(); await page.keyboard.press("Space"); } };
      await press();
      await expect(seal).toHaveAttribute("data-phase", "running");
      await expect(page.getByTestId("pt-seal-word")).toHaveText(/press to stop/i);
      // Sample the layout across two whole-second pulses: nothing may move by a pixel.
      await page.waitForTimeout(400); // past the cast's ignition
      const first = await layoutBoxes(page);
      const readings: number[] = [];
      for (let i = 0; i < 26; i++) {
        expect(await layoutBoxes(page), `layout at sample ${i}`).toEqual(first);
        readings.push(await chronoReading(page));
        await page.waitForTimeout(100);
      }
      // It counts up, monotonically, and roughly in real time.
      for (let i = 1; i < readings.length; i++) expect(readings[i]).toBeGreaterThanOrEqual(readings[i - 1]);
      expect(readings.at(-1)! - readings[0]).toBeGreaterThan(2.0);
      expect(readings.at(-1)! - readings[0]).toBeLessThan(4.5);
      await page.screenshot({ path: path.join(SHOTS, `pt52-${vp.name}-running.png`) });
      await press();
      // Frozen at once, on exactly the value the lock carries.
      await expect.poll(() => be.locks.length).toBe(1);
      const sent = be.locks[0].body.elapsed_ms as number;
      await expect(page.getByTestId("pt-chrono-digits")).toHaveText((sent / 1000).toFixed(2));
      await expect(page.getByTestId("pt-status")).toContainText(`Locked at ${(sent / 1000).toFixed(2)} s`);
      await page.screenshot({ path: path.join(SHOTS, `pt52-${vp.name}-locked.png`) });
      // The reveal keeps the server's result; its "You" is the same stop.
      await expect(page.getByTestId("pt-reveal-stage")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("pt-you-time")).toHaveText(`${(sent / 1000).toFixed(2)} s`);
      await page.waitForTimeout(1900);
      const next = page.getByRole("button", { name: /next round/i });
      if (vp.touch) await next.tap(); else { await next.focus(); await page.keyboard.press("Enter"); }
      await expect(seal).toHaveAttribute("data-phase", "armed");
      await expect(page.getByTestId("pt-chrono-digits")).toHaveText("0.00");
    });
  });
}

test.describe("PT5.2 chronometer: motion, interruption, sound", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("reduced motion: the digits still count; nothing animates and the sweep is hidden", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await standInBackend(page);
    await page.goto(RANDOM_RUN);
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await expect(page.getByTestId("pt-chrono")).toHaveAttribute("data-animate", "false");
    await seal.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(1300);
    const probe = await page.evaluate(() => ({
      animations: document.getAnimations().filter((a) => ((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest?.('[data-testid="pt-chrono"]')).length,
      sweep: getComputedStyle(document.querySelector(".pt-chrono-sweep")!).display,
    }));
    expect(probe).toEqual({ animations: 0, sweep: "none" });
    expect(await chronoReading(page)).toBeGreaterThan(1.0);
    await page.screenshot({ path: path.join(SHOTS, "pt52-1440x900-reduced-running.png") });
  });

  test("an interrupted round stops the reading where it was, struck through, and it stays still", async ({ page }) => {
    await standInBackend(page);
    await page.goto(RANDOM_RUN);
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await seal.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    });
    await expect(page.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "voided");
    await expect(page.getByTestId("pt-chrono")).toHaveAttribute("data-readout", "halted");
    await expect(page.getByTestId("pt-seal-word")).toHaveText(/voided/i);
    const at = await chronoReading(page);
    expect(at).toBeGreaterThan(1.0);
    await page.waitForTimeout(800);
    expect(await chronoReading(page)).toBe(at);
    await page.screenshot({ path: path.join(SHOTS, "pt52-1440x900-voided.png") });
  });

  test("the browser renders one tick voice per elapsed second, and none after the stop", async ({ page }) => {
    await countTickVoices(page);
    await standInBackend(page);
    await page.goto(RANDOM_RUN);
    const seal = page.getByTestId("pt-press-surface");
    await expect(seal).toHaveAttribute("data-phase", "armed", { timeout: 30_000 });
    await seal.focus();
    await page.keyboard.press("Space"); // a trusted gesture: unlocks audio, casts
    await page.waitForTimeout(3_550);
    await page.keyboard.press("Space");
    await page.waitForTimeout(1_200);
    const r = await page.evaluate(() => {
      const w = window as unknown as { __ptTicks: number[]; __ptVoices: number };
      return { ticks: w.__ptTicks.length, voices: w.__ptVoices, gaps: w.__ptTicks.slice(1).map((t, i) => Math.round(t - w.__ptTicks[i])) };
    });
    // The SFX engine stays silent until Audio Studio's config is known (it loads from Supabase);
    // with no voice at all, there is nothing to count on this machine.
    test.skip(r.voices === 0, "SFX engine silent here (Audio Studio config unavailable)");
    expect(r.ticks, JSON.stringify(r)).toBe(3);
    for (const g of r.gaps) { expect(g).toBeGreaterThan(850); expect(g).toBeLessThan(1150); }
  });
});
