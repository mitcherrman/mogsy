/**
 * GM-R1 — RANGEFINDER CONTINUITY, FIT AND TARGET SIZE, measured on every
 * animation frame, plus the capture matrix the handoff cites.
 *
 * Plays the real lifecycle in `/dev/rangefinder` (the DEV-only lab, which
 * mounts the production CanonicalArena with a lab renderer; no backend
 * needed): open → press → drag → release → vernier → Lock → locked → reveal
 * (charge, project, settle, proof) → done → next round, sampling the
 * structural regions on every animation frame and DOM commit and holding each
 * to ≤1px of movement (the R2 / OF4 rule), in both motion modes, at desktop,
 * short-desktop and phone sizes. The TARGET is excluded on purpose: it moves
 * by design.
 *
 * It also asserts: no page scroll, no overflow inside the question stage,
 * every control ≥44px rendered with rendered size equal to layout size, and
 * that the DOM carries no canonical figure before the reveal.
 *
 * It writes screenshots and a reveal frame series to RANGEFINDER_SHOTS
 * (default: <repo>/test-results/rangefinder).
 *
 *   npx playwright test -c playwright.arena.config.ts rangefinder-continuity
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.RANGEFINDER_SHOTS ?? path.resolve("test-results/rangefinder");
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x650", width: 1366, height: 650 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
] as const;

/** The structural regions a player tracks. */
const REGIONS: Record<string, string> = {
  root: '[data-mig-primitive="rangefinder"]',
  head: '[data-part="head"]',
  field: '[data-part="field"]',
  origin: '[data-part="origin"]',
  plate: '[data-part="plate"]',
  reading: '[data-part="reading"]',
  lock: '[data-part="lock"]',
  status: '[data-part="status"]',
  stage: '[data-testid="ranked-question"]',
};
const BUDGET_PX = 1;

interface Frame { phase: string | null; stage: string | null; r: Record<string, [number, number, number, number]> }

function installSampler(regions: Record<string, string>) {
  const frames: Frame[] = [];
  let running = true;
  let paused = false;
  const sample = () => {
    if (!running || paused) return;
    const m = document.querySelector('[data-mig-primitive="rangefinder"]');
    const f: Frame = { phase: m?.getAttribute("data-phase") ?? null, stage: m?.getAttribute("data-reveal-stage") ?? null, r: {} };
    for (const [k, s] of Object.entries(regions)) {
      const e = document.querySelector(s);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      if (b.width || b.height) f.r[k] = [b.left + window.scrollX, b.top + window.scrollY, b.width, b.height];
    }
    frames.push(f);
  };
  const raf = () => { sample(); if (running) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const mo = new MutationObserver(sample);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const w = window as unknown as { __rfStop: () => Frame[]; __rfPause: (p: boolean) => void };
  w.__rfStop = () => { running = false; mo.disconnect(); return frames; };
  w.__rfPause = (p) => { paused = p; };
}

async function shot(page: Page, file: string) {
  await page.evaluate(() => (window as unknown as { __rfPause?: (p: boolean) => void }).__rfPause?.(true));
  await page.screenshot({ path: file });
  await page.waitForTimeout(30);
  await page.evaluate(() => (window as unknown as { __rfPause?: (p: boolean) => void }).__rfPause?.(false));
}

function worstMovement(frames: Frame[]) {
  const worst: Record<string, { frame: number; max: number; from: string; to: string }> = {};
  for (let i = 1; i < frames.length; i++) {
    for (const k of Object.keys(frames[i].r)) {
      const a = frames[i - 1].r[k];
      const b = frames[i].r[k];
      if (!a || !b) continue;
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
      if (!worst[k] || d > worst[k].max) worst[k] = { frame: i, max: d, from: `${frames[i - 1].phase}/${frames[i - 1].stage}`, to: `${frames[i].phase}/${frames[i].stage}` };
    }
  }
  return worst;
}

const CONTROLS = ["rangefinder-nearer", "rangefinder-farther", "rangefinder-lens", "rangefinder-lock"];

async function assertTargets(page: Page) {
  for (const id of CONTROLS) {
    const el = page.getByTestId(id);
    const m = await el.evaluate((e) => {
      const b = e.getBoundingClientRect();
      return { w: b.width, h: b.height, ow: (e as HTMLElement).offsetWidth, oh: (e as HTMLElement).offsetHeight };
    });
    expect(m.w, `${id} rendered width`).toBeGreaterThanOrEqual(44);
    expect(m.h, `${id} rendered height`).toBeGreaterThanOrEqual(44);
    // Rendered size equals layout size: nothing is shrunk by a transform.
    expect(Math.abs(m.w - m.ow), `${id} not transform-scaled`).toBeLessThanOrEqual(1);
    expect(Math.abs(m.h - m.oh), `${id} not transform-scaled`).toBeLessThanOrEqual(1);
  }
  const target = await page.getByTestId("rangefinder-target").evaluate((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; });
  expect(target[0]).toBeGreaterThanOrEqual(44);
  expect(target[1]).toBeGreaterThanOrEqual(44);
}

async function assertNoOverflow(page: Page) {
  const o = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
    const de = document.documentElement;
    return {
      stageOverflow: stage.scrollHeight - stage.clientHeight, stageScrollTop: stage.scrollTop,
      pageX: de.scrollWidth - de.clientWidth, pageY: window.scrollY,
    };
  });
  expect(o.stageOverflow, "no overflow inside the question stage").toBeLessThanOrEqual(0);
  expect(o.stageScrollTop).toBe(0);
  expect(o.pageX, "no horizontal page overflow").toBeLessThanOrEqual(0);
  expect(o.pageY, "no page scroll").toBe(0);
}

for (const reduced of [false, true]) {
  for (const vp of VIEWPORTS) {
    test(`continuity ${vp.name}${reduced ? " reduced-motion" : ""}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/dev/rangefinder?round=janna-w${reduced ? "&motion=reduce" : ""}`);
      const root = page.locator('[data-mig-primitive="rangefinder"]');
      await expect(root).toHaveAttribute("data-phase", "open");
      await page.waitForTimeout(300);
      await page.evaluate(installSampler, REGIONS);
      const tag = `${vp.name}${reduced ? "-reduced" : ""}`;

      // No canonical geometry, mark, band or verdict in the DOM before the reveal.
      const pre = await page.evaluate(() => ({
        verdicts: document.querySelectorAll("[data-verdict]").length,
        canon: document.querySelectorAll('[data-testid^="rangefinder-canon"], .rf-canon-ring, .rf-gap-band, .rf-fuse').length,
      }));
      expect(pre).toEqual({ verdicts: 0, canon: 0 });

      await assertTargets(page);
      await assertNoOverflow(page);
      await shot(page, path.join(SHOTS, `${tag}-1-open.png`));

      // Press anywhere on the field: the target is there. Then drag, then release.
      const field = page.getByTestId("rangefinder-field");
      const fb = (await field.boundingBox())!;
      const origin = await page.getByTestId("rangefinder-origin").evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      const portrait = (await root.getAttribute("data-orientation")) === "portrait";
      const far = portrait ? { x: origin.x + 10, y: fb.y + 40 } : { x: fb.x + fb.width - 40, y: origin.y - 20 };
      const mid = portrait ? { x: origin.x - 20, y: (origin.y + fb.y) / 2 } : { x: (origin.x + fb.x + fb.width) / 2, y: origin.y + 30 };
      await page.mouse.move(far.x, far.y);
      await page.mouse.down();
      await page.mouse.move(mid.x, mid.y, { steps: 12 });
      await page.waitForTimeout(80);
      await shot(page, path.join(SHOTS, `${tag}-2-drag.png`));
      await page.mouse.up();
      const afterDrag = await page.getByTestId("rangefinder-reading-value").textContent();
      expect(afterDrag).not.toBe("—");

      // Revision: vernier and keyboard.
      await page.getByTestId("rangefinder-farther").click();
      await page.getByTestId("rangefinder-nearer").click();
      await field.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Shift+ArrowLeft");
      const before = await field.getAttribute("aria-valuenow");
      await page.keyboard.press("ArrowLeft");
      const after = await field.getAttribute("aria-valuenow");
      expect(Number(after)).toBe(Number(before) - 25);
      await shot(page, path.join(SHOTS, `${tag}-3-placed.png`));

      // Lock.
      await page.getByTestId("rangefinder-lock").click();
      await expect(root).toHaveAttribute("data-phase", "locked");
      await shot(page, path.join(SHOTS, `${tag}-4-locked.png`));

      // Reveal: a frame series through the choreography.
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 5000 });
      if (!reduced) {
        for (let i = 0; i < 8; i++) {
          await page.screenshot({ path: path.join(SHOTS, `${tag}-5-reveal-${i}.png`) });
          await page.waitForTimeout(140);
        }
      }
      await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 5000 });
      await expect(page.getByTestId("lab-reveal-done")).toHaveAttribute("data-on", "true");
      await shot(page, path.join(SHOTS, `${tag}-6-revealed.png`));
      await expect(page.getByTestId("rangefinder-proof")).toHaveAttribute("data-shown", "true");
      await assertNoOverflow(page);

      // Next round: the instrument stays where it was.
      await page.getByTestId("lab-next").click();
      await expect(root).toHaveAttribute("data-phase", "open");
      await page.waitForTimeout(250);
      await shot(page, path.join(SHOTS, `${tag}-7-next.png`));

      const frames = await page.evaluate(() => (window as unknown as { __rfStop: () => Frame[] }).__rfStop());
      // Sampling ran (reduced motion has no clock, so it samples only on interaction and DOM commits).
      expect(frames.length).toBeGreaterThan(40);
      const phases = new Set(frames.map((f) => f.phase));
      expect([...phases]).toEqual(expect.arrayContaining(["open", "locked", "revealed"]));
      const worst = worstMovement(frames);
      const report = Object.entries(worst).map(([k, w]) => `${k}: ${w.max.toFixed(2)}px @${w.frame} ${w.from}→${w.to}`).join("\n");
      // The measurement itself is the deliverable: print it on success too.
      console.log(`[continuity ${tag}] frames=${frames.length}
${report}`);
      for (const [k, w] of Object.entries(worst)) {
        expect(w.max, `${k} moved ${w.max.toFixed(2)}px (${w.from} → ${w.to})\n${report}`).toBeLessThanOrEqual(BUDGET_PX);
      }
    });
  }
}

test("an exact lock fuses the rings and shows no discrepancy band", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/dev/rangefinder?round=janna-w&state=revealed-right");
  const root = page.locator('[data-mig-primitive="rangefinder"]');
  await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
  await expect(root).toHaveAttribute("data-verdict", "exact");
  await expect(page.getByTestId("rangefinder-gap")).toHaveCount(0);
  const radii = await page.evaluate(() => [
    document.querySelector(".rf-reach-ring")?.getAttribute("r"), document.querySelector(".rf-canon-ring")?.getAttribute("r"),
  ]);
  expect(radii[0]).toBe(radii[1]);
  await page.screenshot({ path: path.join(SHOTS, "1600x900-exact.png") });
});
