/**
 * GM1-R2 — RECONSTRUCT CONTINUITY, MEASURED ON EVERY ANIMATION FRAME.
 *
 * The owner saw the board jump in the live playtest although R1's fixed-
 * geometry tests passed. They passed because no box ever changed SIZE: on a
 * desktop window shorter than ~720px the R1 board (478px) overflowed the
 * stage body the arena leaves (424px at 1366x650), `.ranked-panel` clips it
 * (`overflow: hidden`), and clicking Lock focused a half-clipped button —
 * Chrome scrolled the clipped stage to show it, and every node in the board
 * jumped 16px (81px at 1280x600). Static screenshots and settled-state tests
 * cannot see that. This spec plays the REAL lifecycle and samples boxes on
 * every animation frame and every DOM commit:
 *
 *   open → first placement → more → full → Lock → locked → marks → settle →
 *   evidence → reveal complete → the next segment opening
 *
 * through `/dev/ranked-shell-probe?q=reconstruct&recon=bot`, which mounts the
 * production `QuizRankedMatch` and replays the bodies the REAL backend served
 * for one admin Reconstruct bot match (the inline bot-lock path), and holds
 * every structural region to ≤1px of movement, in both motion modes, at
 * desktop, short-desktop and phone sizes.
 *
 *   npx playwright test -c playwright.arena.config.ts ranked-reconstruct-continuity
 */
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x650", width: 1366, height: 650 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
] as const;

/** The structural regions a player tracks, plus the shell around them. */
const REGIONS: Record<string, string> = {
  shell: '[data-testid="ranked-match"]',
  stage: '[data-testid="ranked-question"]',
  body: '[data-testid="ranked-question-body"]',
  module: '[data-testid="mig-reconstruct"]',
  header: '[data-testid="reconstruct-target"]',
  sockets: '[data-testid="reconstruct-sockets"]',
  status: '[data-testid="reconstruct-hint"],[data-testid="reconstruct-verdict"]',
  region: '[data-testid="reconstruct-tray-box"]',
  opponentLine: '[data-testid="reconstruct-opponent-progress"]',
  socket0: '[data-testid="reconstruct-socket-0"]',
  footer: '[data-part="footer"]',
};
/** The tolerance for incidental layout movement, frame to frame and overall. */
const BUDGET_PX = 1;
/** The build the captured lock carried (its reveal is that build's). */
const CAPTURED = ["p1", "p3", "p2"];

interface Frame { phase: string | null; stage: string | null; r: Record<string, [number, number]> }

function installSampler(regions: Record<string, string>) {
  const frames: Frame[] = [];
  let running = true;
  const sample = () => {
    if (!running) return;
    const m = document.querySelector('[data-testid="mig-reconstruct"]');
    const f: Frame = { phase: m?.getAttribute("data-phase") ?? null, stage: m?.getAttribute("data-reveal-stage") ?? null, r: {} };
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
  (window as unknown as { __rcStop: () => Frame[] }).__rcStop = () => { running = false; mo.disconnect(); return frames; };
}

async function playOneSegment(page: Page) {
  await page.goto("/dev/ranked-shell-probe?q=reconstruct&recon=bot&frame=0&bot=1");
  // The probe's own dev navigation (fixed, bottom-left) is not product UI.
  await page.addStyleTag({ content: 'div:has(> [data-testid="probe-metareflex"]) { display: none !important; }' });
  await page.waitForSelector('[data-testid="reconstruct-lock"]', { timeout: 30_000 });
  const gotIt = page.getByRole("button", { name: /got it/i });
  if (await gotIt.count()) await gotIt.first().click();
  await page.evaluate(installSampler, REGIONS);
  for (const token of CAPTURED) {
    await page.locator(`[data-testid="reconstruct-option-${token}"]`).click();
    await page.waitForTimeout(250);
  }
  await page.locator('[data-testid="reconstruct-lock"]').click();
  const rc = '[data-testid="mig-reconstruct"]';
  await page.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-reveal-stage") === "done", rc, { timeout: 10_000 });
  const first = await page.locator('[data-testid="reconstruct-target"] p').textContent();
  await page.waitForFunction((f) => document.querySelector('[data-testid="reconstruct-target"] p')?.textContent !== f
    && !!document.querySelector('[data-testid="reconstruct-lock"]'), first, { timeout: 15_000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => (window as unknown as { __rcStop: () => Frame[] }).__rcStop());
}

for (const vp of VIEWPORTS) {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`${vp.name} ${motion}: no structural region moves through lock, reveal and the next segment`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, reducedMotion: motion,
        isMobile: vp.width < 640, hasTouch: vp.width < 640,
      });
      const page = await context.newPage();
      const frames = await playOneSegment(page);
      // The flow really happened: open, locked, revealed (every stage), next segment open.
      const phases = new Set(frames.map((f) => f.phase));
      expect([...phases]).toEqual(expect.arrayContaining(["open", "locked", "revealed"]));
      expect(frames.length).toBeGreaterThan(100);
      const moves: string[] = [];
      for (const key of Object.keys(REGIONS)) {
        const seen = frames.map((f) => f.r[key]).filter(Boolean) as [number, number][];
        for (let i = 1; i < seen.length; i++) {
          const dTop = Math.abs(seen[i][0] - seen[i - 1][0]);
          const dH = Math.abs(seen[i][1] - seen[i - 1][1]);
          if (dTop > BUDGET_PX || dH > BUDGET_PX) moves.push(`${key}: Δtop ${dTop.toFixed(1)} Δh ${dH.toFixed(1)}`);
        }
        const tops = seen.map((s) => s[0]);
        if (tops.length && Math.max(...tops) - Math.min(...tops) > BUDGET_PX) {
          moves.push(`${key}: spread ${(Math.max(...tops) - Math.min(...tops)).toFixed(1)}`);
        }
      }
      expect(moves, moves.slice(0, 8).join("\n")).toEqual([]);
      // The board FITS its clipped stage: nothing for a focus to scroll to.
      const stage = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
        return { overflow: s.scrollHeight - s.clientHeight, scrollTop: s.scrollTop };
      });
      expect(stage).toEqual({ overflow: 0, scrollTop: 0 });
      await context.close();
    });
  }
}
