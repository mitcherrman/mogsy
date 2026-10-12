/**
 * SCRUB-S2 — CHRONOSCOPE CONTINUITY IN THE REAL RANKED HOST, MEASURED ON EVERY FRAME.
 *
 * TIME MOVES. THE INTERFACE DOES NOT. SCRUB-S1 proved this inside a dev
 * harness; this spec proves it inside production: `/dev/ranked-shell-probe
 * ?q=scrub` mounts the REAL `QuizRankedMatch` (controller, reveal hold,
 * inline-lock seam, `CanonicalArena`, `scrubModule`) and replays the bodies
 * the REAL backend served for one admin `admin.scrub` bot match. One mount
 * plays two segments and the opening of a third:
 *
 *   segment 1: open → scrub (drag) → snap → tap → Lock → locked → reveal
 *              (EXACT: clamp → settle → proof, no travel) → reveal complete
 *   segment 2: opens → scrub (drag) → tap → Lock → locked → reveal (WRONG,
 *              farthest checkpoint: clamp → traverse → settle → proof) →
 *              reveal complete
 *   segment 3: opens
 *
 * Every structural region — the arena shell, the stage, its body, the
 * module, the objective, the instrument, the lens, the reading plate, the
 * rail, the footer and the status line — is sampled on every animation
 * frame and every DOM commit and held to ≤1px of movement, frame to frame
 * and over the whole flow, in both motion modes, at desktop, short-desktop
 * and phone sizes. The stage must never overflow its clip and the page never
 * horizontally. Each reveal must reach `done` before the next segment
 * replaces it (the reveal fits the host's hold).
 *
 *   npx playwright test -c playwright.arena.config.ts ranked-scrub-continuity
 *
 * `SCRUB_EVIDENCE_DIR=<dir>` also writes state screenshots and a per-region
 * movement report there; `SCRUB_VIDEO_DIR=<dir>` records each run's video.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x650", width: 1366, height: 650 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
] as const;

const REGIONS: Record<string, string> = {
  shell: '[data-testid="ranked-match"]',
  stage: '[data-testid="ranked-question"]',
  body: '[data-testid="ranked-question-body"]',
  module: '[data-testid="mig-chronoscope"]',
  objective: '[data-testid="chronoscope-objective"]',
  instrument: '[data-testid="chronoscope-instrument"]',
  lens: '[data-testid="chronoscope-lens"]',
  reading: '[data-testid="chronoscope-reading"]',
  rail: '[data-testid="chronoscope-rail"]',
  footer: '[data-testid="chronoscope-footer"]',
  status: '[data-testid="chronoscope-status"]',
};
const BUDGET_PX = 1;
const EVIDENCE = process.env.SCRUB_EVIDENCE_DIR ?? "";
const VIDEO = process.env.SCRUB_VIDEO_DIR ?? "";

const META = JSON.parse(readFileSync(path.resolve("src/lib/ranked-public/__fixtures__/scrubServerCapture.json"), "utf8"))
  .meta as { submitted: Record<string, string>; canonical: Record<string, string> };
const index = (token: string) => Number(token.slice(1)) - 1;

interface Frame { phase: string | null; stage: string | null; prompt: string | null; r: Record<string, [number, number]> }

function installSampler(regions: Record<string, string>) {
  const frames: Frame[] = [];
  let running = true;
  const sample = () => {
    if (!running) return;
    const m = document.querySelector('[data-testid="mig-chronoscope"]');
    const f: Frame = {
      phase: m?.getAttribute("data-phase") ?? null, stage: m?.getAttribute("data-reveal-stage") ?? null,
      prompt: document.querySelector('[data-testid="chronoscope-prompt"]')?.textContent ?? null, r: {},
    };
    for (const [k, s] of Object.entries(regions)) {
      const e = document.querySelector(s);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      // Document coordinates: a user's page scroll (a phone) is not a jump.
      if (b.width || b.height) f.r[k] = [b.top + window.scrollY, b.height];
    }
    frames.push(f);
  };
  const raf = () => { sample(); if (running) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const mo = new MutationObserver(sample);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  (window as unknown as { __csStop: () => Frame[] }).__csStop = () => { running = false; mo.disconnect(); return frames; };
}

/** The centre of the `i`-th detent, in viewport coordinates. */
async function detent(page: Page, i: number) {
  return page.evaluate((n) => {
    const d = document.querySelector(`[data-testid="chronoscope-detent-${n}"]`)!.getBoundingClientRect();
    const rail = document.querySelector('[data-testid="chronoscope-rail"]')!.getBoundingClientRect();
    return { x: d.left + d.width / 2, y: rail.top + rail.height / 2 };
  }, i);
}

async function shot(page: Page, tag: string, name: string) {
  if (!EVIDENCE) return;
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE, `${tag}-${name}.png`) });
}

/** Drag the reticle from detent `a` to detent `b` (mouse or real touch), releasing on it. */
async function drag(page: Page, a: number, b: number, touch: boolean, tag: string) {
  const from = await detent(page, a);
  const to = await detent(page, b);
  if (touch) {
    const session = await page.context().newCDPSession(page);
    const tp = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y) }];
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(from.x, from.y) });
    for (let i = 1; i <= 8; i++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(from.x + (to.x - from.x) * i / 8 + 7, from.y) });
      await page.waitForTimeout(30);
      if (i === 5) await shot(page, tag, "mid-drag");
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      // Released a little past the detent: the release must snap back onto it.
      await page.mouse.move(from.x + (to.x - from.x) * i / 8 + 7, from.y);
      await page.waitForTimeout(30);
      if (i === 5) await shot(page, tag, "mid-drag");
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(200);
  await expect(page.locator('[data-testid="chronoscope-reading-label"]')).toHaveText(String(b + 1));
}

async function tap(page: Page, i: number, touch: boolean) {
  const p = await detent(page, i);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  await expect(page.locator('[data-testid="chronoscope-reading-label"]')).toHaveText(String(i + 1));
}

/** Before the lock the page names no answer: no proof, trace, canonical marker or teaching line. */
async function assertNoLeak(page: Page) {
  const pre = await page.evaluate(() => ({
    text: document.body.textContent ?? "",
    proof: !!document.querySelector('[data-testid="chronoscope-proof"]'),
    canon: document.querySelector('[data-testid="chronoscope-canon-mark"]')?.getAttribute("data-shown"),
    canonF: (document.querySelector('[data-testid="chronoscope-canon-mark"]') as HTMLElement | null)?.style.getPropertyValue("--f"),
    trace: !!document.querySelector('[data-testid="chronoscope-trace"]'),
    passed: document.querySelectorAll('[data-part="detent"][data-passed]').length,
  }));
  expect(pre.proof).toBe(false);
  expect(pre.trace).toBe(false);
  expect(pre.canon).toBe("false");
  expect(Number(pre.canonF)).toBe(0);
  expect(pre.passed).toBe(0);
  expect(pre.text).not.toMatch(/in wave\)|cumulative XP ·|was first|still below|Exact checkpoint|Not the first|granularity, not/);
}

async function lockAndReveal(page: Page, tag: string, expectVerdict: string) {
  await page.locator('[data-testid="chronoscope-lock"]').click();
  const cs = '[data-testid="mig-chronoscope"]';
  await page.waitForFunction((s) => {
    const st = document.querySelector(s)?.getAttribute("data-reveal-stage");
    return st === "traverse" || st === "settle" || st === "proof" || st === "done";
  }, cs, { timeout: 10_000 });
  await shot(page, tag, "revealing");
  await page.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-reveal-stage") === "done", cs, { timeout: 10_000 });
  await expect(page.locator('[data-testid="chronoscope-canon-mark"]')).toHaveAttribute("data-shown", "true");
  await expect(page.locator('[data-testid="chronoscope-lock-mark"]')).toHaveAttribute("data-shown", "true");
  await expect(page.locator('[data-testid="chronoscope-proof"]')).toHaveAttribute("data-shown", "true");
  await expect(page.locator('[data-testid="chronoscope-verdict-text"]')).toHaveText(expectVerdict);
  await shot(page, tag, "proof");
}

/**
 * The next segment is on the stage (new objective, open). With `answerable`,
 * also wait out its lead-in: until the server's start instant the module is
 * `inert` (`data-not-open`), exactly as in production.
 */
async function waitForNextSegment(page: Page, prompt: string | null, answerable: boolean) {
  await page.waitForFunction(([p, a]) => {
    const m = document.querySelector('[data-testid="mig-chronoscope"]');
    const host = document.querySelector('[data-testid="scrub-phase"]');
    return m?.getAttribute("data-phase") === "open"
      && document.querySelector('[data-testid="chronoscope-prompt"]')?.textContent !== p
      && (!a || !host?.hasAttribute("data-not-open"));
  }, [prompt, answerable] as const, { timeout: 25_000 });
  await page.waitForTimeout(300);
}

async function playMatch(page: Page, touch: boolean, tag: string) {
  await page.goto("/dev/ranked-shell-probe?q=scrub&frame=0&bot=1&lol=1");
  // The probe's own dev navigation (fixed, bottom-left) is not product UI.
  await page.addStyleTag({ content: 'div:has(> [data-testid="probe-metareflex"]) { display: none !important; }' });
  await page.waitForSelector('[data-testid="chronoscope-lock"]', { timeout: 30_000 });
  const gotIt = page.getByRole("button", { name: /got it/i });
  if (await gotIt.count()) await gotIt.first().click();
  await page.waitForTimeout(300);
  await shot(page, tag, "s1-open");
  await page.evaluate(installSampler, REGIONS);

  // Segment 1: drag, snap, then tap the captured (exact) checkpoint and lock.
  await drag(page, 0, 9, touch, `${tag}-s1`);
  await tap(page, index(META.submitted["1"]), touch);
  await assertNoLeak(page);
  await shot(page, tag, "s1-snapped");
  const prompt1 = await page.locator('[data-testid="chronoscope-prompt"]').textContent();
  await lockAndReveal(page, `${tag}-s1`, "Exact checkpoint");
  await waitForNextSegment(page, prompt1, true);
  await shot(page, tag, "s2-open");

  // Segment 2: drag, then tap the captured WRONG checkpoint (farthest) and lock.
  await drag(page, 2, 6, touch, `${tag}-s2`);
  await tap(page, index(META.submitted["2"]), touch);
  await assertNoLeak(page);
  const prompt2 = await page.locator('[data-testid="chronoscope-prompt"]').textContent();
  await lockAndReveal(page, `${tag}-s2`, "Not the first checkpoint");
  await waitForNextSegment(page, prompt2, false);
  await shot(page, tag, "s3-open");
  return page.evaluate(() => (window as unknown as { __csStop: () => Frame[] }).__csStop());
}

for (const vp of VIEWPORTS) {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`${vp.name} ${motion}: no structural region moves through two segments' scrub, lock and reveal and the third opening`, async ({ browser }) => {
      const phone = vp.width < 640;
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, reducedMotion: motion,
        isMobile: phone, hasTouch: phone,
        ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: vp.width, height: vp.height } } } : {}),
      });
      const page = await context.newPage();
      const tag = `${vp.name}-${motion === "reduce" ? "rm" : "motion"}`;
      const frames = await playMatch(page, phone, tag);

      // The flow really happened: open, locked, revealed, every stage, three prompts.
      const phases = new Set(frames.map((f) => f.phase));
      expect([...phases]).toEqual(expect.arrayContaining(["open", "locked", "revealed"]));
      const stages = new Set(frames.map((f) => f.stage).filter(Boolean));
      if (motion === "no-preference") {
        expect([...stages]).toEqual(expect.arrayContaining(["clamp", "traverse", "settle", "proof", "done"]));
      } else {
        expect([...stages]).toEqual(["done"]);
      }
      expect(new Set(frames.map((f) => f.prompt).filter(Boolean)).size).toBe(3);
      expect(frames.length).toBeGreaterThan(100);

      // ≤1px, frame to frame and over the whole flow, for every region.
      const moves: string[] = [];
      const report: Record<string, { maxStep: number; spread: number; samples: number }> = {};
      for (const key of Object.keys(REGIONS)) {
        const seen = frames.map((f) => f.r[key]).filter(Boolean) as [number, number][];
        let maxStep = 0;
        for (let i = 1; i < seen.length; i++) {
          const dTop = Math.abs(seen[i][0] - seen[i - 1][0]);
          const dH = Math.abs(seen[i][1] - seen[i - 1][1]);
          maxStep = Math.max(maxStep, dTop, dH);
          if (dTop > BUDGET_PX || dH > BUDGET_PX) moves.push(`${key}: Δtop ${dTop.toFixed(1)} Δh ${dH.toFixed(1)}`);
        }
        const tops = seen.map((s) => s[0]);
        const spread = tops.length ? Math.max(...tops) - Math.min(...tops) : 0;
        if (spread > BUDGET_PX) moves.push(`${key}: spread ${spread.toFixed(1)}`);
        report[key] = { maxStep: +maxStep.toFixed(2), spread: +spread.toFixed(2), samples: seen.length };
      }
      const fit = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
        const body = document.querySelector('[data-testid="ranked-question-body"]') as HTMLElement;
        const m = document.querySelector('[data-testid="mig-chronoscope"]') as HTMLElement;
        return { overflow: s.scrollHeight - s.clientHeight, scrollTop: s.scrollTop,
          hOverflow: document.documentElement.scrollWidth - window.innerWidth,
          body: Math.round(body.getBoundingClientRect().height), module: Math.round(m.getBoundingClientRect().height) };
      });
      if (EVIDENCE) {
        mkdirSync(EVIDENCE, { recursive: true });
        writeFileSync(path.join(EVIDENCE, `${tag}-continuity.json`),
          JSON.stringify({ viewport: vp.name, motion, frames: frames.length, stages: [...stages], fit, report }, null, 1));
      }
      expect(moves, moves.slice(0, 8).join("\n")).toEqual([]);
      expect({ overflow: fit.overflow, scrollTop: fit.scrollTop, hOverflow: fit.hOverflow })
        .toEqual({ overflow: 0, scrollTop: 0, hOverflow: 0 });
      await context.close();
    });
  }
}
