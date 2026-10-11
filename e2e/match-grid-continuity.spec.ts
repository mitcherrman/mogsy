/**
 * GM-M1 — MATCH GRID CONTINUITY, MEASURED ON EVERY ANIMATION FRAME, plus the
 * capture matrix the handoff cites.
 *
 * Plays the real lifecycle in `/dev/match-grid` (the DEV-only harness, no
 * backend needed with `roster=frontend`): open → first seating → reassignment
 * → full board → Lock → locked → marks → travel → ledger → done → next round,
 * sampling the structural regions on every animation frame and DOM commit,
 * and holding each to ≤1px of movement (the R2 / OF4 rule), in both motion
 * modes, at desktop, short-desktop and phone sizes.
 *
 * It also writes screenshots and a reveal frame series to MATCH_GRID_SHOTS
 * (default: <repo>/test-results/match-grid) so the visual evidence is a
 * by-product of the same run.
 *
 *   npx playwright test -c playwright.arena.config.ts match-grid-continuity
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.MATCH_GRID_SHOTS ?? path.resolve("test-results/match-grid");
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x650", width: 1366, height: 650 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
] as const;

/** The structural regions a player tracks. Sigils are excluded on purpose: they MOVE by design. */
const REGIONS: Record<string, string> = {
  root: '[data-mig-primitive="match-grid"]',
  head: '[data-part="head"]',
  board: '[data-part="board"]',
  seal0: '[data-part="seal"]:nth-of-type(1) .mg-seal',
  sealLast: '[data-part="seal"]:last-of-type .mg-seal',
  foot: '[data-part="foot"]',
  status: '[data-part="status"]',
  lock: '[data-part="lock"]',
};
const BUDGET_PX = 1;

interface Frame { phase: string | null; stage: string | null; r: Record<string, [number, number, number]> }

function installSampler(regions: Record<string, string>) {
  const frames: Frame[] = [];
  let running = true;
  let paused = false;
  const sample = () => {
    if (!running || paused) return;
    const m = document.querySelector('[data-mig-primitive="match-grid"]');
    const f: Frame = { phase: m?.getAttribute("data-phase") ?? null, stage: m?.getAttribute("data-reveal-stage") ?? null, r: {} };
    for (const [k, s] of Object.entries(regions)) {
      const e = document.querySelector(s);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      if (b.width || b.height) f.r[k] = [b.left + window.scrollX, b.top + window.scrollY, b.height];
    }
    frames.push(f);
  };
  const raf = () => { sample(); if (running) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const mo = new MutationObserver(sample);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const w = window as unknown as { __mgStop: () => Frame[]; __mgPause: (p: boolean) => void };
  w.__mgStop = () => { running = false; mo.disconnect(); return frames; };
  // Full-page screenshots resize the viewport; those frames are the camera moving, not the board.
  w.__mgPause = (p) => { paused = p; };
}

async function shot(page: Page, file: string, fullPage: boolean) {
  await page.evaluate(() => (window as unknown as { __mgPause?: (p: boolean) => void }).__mgPause?.(true));
  await page.screenshot({ path: file, fullPage });
  await page.waitForTimeout(50);
  await page.evaluate(() => (window as unknown as { __mgPause?: (p: boolean) => void }).__mgPause?.(false));
}

function worstMovement(frames: Frame[]) {
  const worst: Record<string, { frame: number; max: number; from: string; to: string }> = {};
  for (let i = 1; i < frames.length; i++) {
    for (const k of Object.keys(frames[i].r)) {
      const a = frames[i - 1].r[k];
      const b = frames[i].r[k];
      if (!a || !b) continue;
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
      if (!worst[k] || d > worst[k].max) worst[k] = { frame: i, max: d, from: `${frames[i - 1].phase}/${frames[i - 1].stage}`, to: `${frames[i].phase}/${frames[i].stage}` };
    }
  }
  return worst;
}

const sigils = (page: Page) => page.locator('[data-part="sigil"]');
const seals = (page: Page) => page.locator('[data-part="seal"] .mg-seal');

async function dragSigilToSeal(page: Page, sigilIndex: number, sealIndex: number) {
  const s = sigils(page).nth(sigilIndex);
  const d = seals(page).nth(sealIndex);
  const sb = (await s.boundingBox())!;
  const db = (await d.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 12, sb.y + 12, { steps: 3 });
  await page.mouse.move(db.x + db.width / 2, db.y - 30, { steps: 10 });
  await page.mouse.up();
}

for (const reduced of [false, true]) {
  for (const vp of VIEWPORTS) {
    test(`continuity ${vp.name}${reduced ? " reduced-motion" : ""}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/dev/match-grid?round=academy&roster=frontend${reduced ? "&motion=reduce" : ""}`);
      const root = page.locator('[data-mig-primitive="match-grid"]');
      await expect(root).toHaveAttribute("data-phase", "open");
      await expect(sigils(page)).toHaveCount(10);
      await page.waitForTimeout(300);
      await page.evaluate(installSampler, REGIONS);

      const tag = `${vp.name}${reduced ? "-rm" : ""}`;
      await shot(page, path.join(SHOTS, `${tag}-01-open.png`), vp.width < 720);

      // First seating by drag, then a reassignment by keyboard, then the rest by digit.
      await dragSigilToSeal(page, 0, 1);
      await expect(sigils(page).nth(0)).toHaveAttribute("data-state", "seated");
      await page.waitForTimeout(500);
      await shot(page, path.join(SHOTS, `${tag}-02-first.png`), vp.width < 720);
      await sigils(page).nth(0).focus();
      await page.keyboard.press("3");
      await page.keyboard.press("1");
      const groupCount = await seals(page).count();
      for (let i = 1; i < 10; i++) {
        await sigils(page).nth(i).focus();
        await page.keyboard.press(String((i % groupCount) + 1));
      }
      // Let the last sigils finish their 420ms crossing before the full-board capture.
      await page.waitForTimeout(650);
      await shot(page, path.join(SHOTS, `${tag}-03-full.png`), vp.width < 720);
      const lock = page.locator('[data-part="lock"]');
      await expect(lock).toBeEnabled();
      await lock.click();
      await expect(root).toHaveAttribute("data-phase", "locked");
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 5_000 });

      // Frame series through the reveal (the first two happen inside the sequence).
      if (!reduced) {
        for (let i = 0; i < 5; i++) {
          await shot(page, path.join(SHOTS, `${tag}-04-reveal-f${i}.png`), vp.width < 720);
          await page.waitForTimeout(260);
        }
      }
      await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 5_000 });
      await shot(page, path.join(SHOTS, `${tag}-05-settled.png`), vp.width < 720);
      await page.locator('[data-testid="lab-next"]').click();
      await expect(root).toHaveAttribute("data-phase", "open");
      await page.waitForTimeout(500);

      const frames = await page.evaluate(() => (window as unknown as { __mgStop: () => Frame[] }).__mgStop());
      expect(frames.length).toBeGreaterThan(30);
      const worst = worstMovement(frames);
      const report = Object.entries(worst).map(([k, w]) => `${k}: ${w.max.toFixed(2)}px @${w.frame} (${w.from} → ${w.to})`).join("\n");
      test.info().annotations.push({ type: "movement", description: report });
      for (const [k, w] of Object.entries(worst)) {
        // The next round swaps the board (a new key): that one commit is a deliberate transition, not a jump.
        if (w.to.startsWith("open/") && w.from.startsWith("revealed/")) continue;
        expect(w.max, `${k} moved ${w.max}px between frames ${w.from} → ${w.to}\n${report}`).toBeLessThanOrEqual(BUDGET_PX);
      }
      // Nothing structural ever overflows the viewport sideways.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("pre-lock DOM never distinguishes a right seat from a wrong one", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dev/match-grid?round=trio&roster=frontend&state=complete");
  await expect(page.locator('[data-mig-primitive="match-grid"]')).toHaveAttribute("data-phase", "open");
  // Pre-filled with the canonical map: now move one sigil to a wrong seal and compare the two sigils' styling.
  await sigils(page).nth(0).focus();
  await page.keyboard.press("2");
  // Drop focus and let the focus ring's 220ms box-shadow transition finish before reading computed styles.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  const styles = await page.evaluate(() => {
    const read = (el: Element) => {
      const disc = el.querySelector(".mg-sigil-disc")!;
      const cs = getComputedStyle(disc);
      return [cs.boxShadow, cs.filter, cs.opacity, el.getAttribute("data-mark"), el.getAttribute("data-state")].join("|");
    };
    const all = Array.from(document.querySelectorAll('[data-part="sigil"]'));
    const threads = Array.from(document.querySelectorAll(".mg-thread")).map((t) => t.getAttribute("data-state"));
    return { sigils: all.map(read), threads, marks: document.querySelectorAll("[data-mark]").length, ledger: !!document.querySelector('[data-part="ledger"]') };
  });
  expect(new Set(styles.sigils).size).toBe(1);
  expect(new Set(styles.threads)).toEqual(new Set(["open"]));
  expect(styles.marks).toBe(0);
  expect(styles.ledger).toBe(false);
});
