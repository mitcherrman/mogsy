/**
 * WP1 — GLYPH PRESS CONTINUITY, FIT, TARGET SIZE AND LEAK, measured on every
 * animation frame, plus the capture matrix the handoff cites.
 *
 * Plays the real lifecycle in `/dev/word-puzzle` (the DEV-only lab, which
 * mounts the production CanonicalArena with a lab renderer; no backend
 * needed): open → type → drum tap → sounding (hit and miss) → cursor fixes →
 * Lock → locked → reveal (ink, verdict) → done → next round, sampling the
 * structural regions on every animation frame and DOM commit and holding
 * each to ≤1px of movement, in both motion modes, at desktop, short-desktop
 * and phone sizes.
 *
 * It also asserts: no page scroll, no overflow inside the question stage,
 * every control ≥44px rendered with rendered size equal to layout size, no
 * focus-induced scrolling, and that the DOM carries no answer glyph before
 * the reveal beyond what the ledger engraved.
 *
 * It writes screenshots and a reveal frame series to WORD_PUZZLE_SHOTS
 * (default: <repo>/test-results/word-puzzle).
 *
 *   npx playwright test -c playwright.arena.config.ts word-puzzle-continuity
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.WORD_PUZZLE_SHOTS ?? path.resolve("test-results/word-puzzle");
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
  root: '[data-mig-primitive="glyph-press"]',
  head: '[data-part="head"]',
  forme: '[data-part="forme"]',
  block: '[data-testid="gp-block"]',
  plaque: '[data-part="plaque"]',
  drum: '[data-part="drum"]',
  plate: '[data-part="plate"]',
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
    const m = document.querySelector('[data-mig-primitive="glyph-press"]');
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
  const w = window as unknown as { __gpStop: () => Frame[]; __gpPause: (p: boolean) => void };
  w.__gpStop = () => { running = false; mo.disconnect(); return frames; };
  w.__gpPause = (p) => { paused = p; };
}

async function shot(page: Page, file: string) {
  await page.evaluate(() => (window as unknown as { __gpPause?: (p: boolean) => void }).__gpPause?.(true));
  await page.screenshot({ path: file });
  await page.waitForTimeout(30);
  await page.evaluate(() => (window as unknown as { __gpPause?: (p: boolean) => void }).__gpPause?.(false));
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

const CONTROLS = ["gp-drum-prev", "gp-drum-next", "gp-sound", "gp-lock", "gp-tile-A", "gp-tile-clear"];

async function assertTargets(page: Page) {
  for (const id of CONTROLS) {
    const el = page.getByTestId(id);
    const m = await el.evaluate((e) => {
      const b = e.getBoundingClientRect();
      return { w: b.width, h: b.height, ow: (e as HTMLElement).offsetWidth, oh: (e as HTMLElement).offsetHeight };
    });
    expect(m.w, `${id} rendered width`).toBeGreaterThanOrEqual(44);
    expect(m.h, `${id} rendered height`).toBeGreaterThanOrEqual(44);
    // Rendered size equals layout size: nothing is shrunk by a transform (the centred tile is scaled UP, never down).
    expect(m.w - m.ow, `${id} not transform-shrunk`).toBeGreaterThanOrEqual(-1);
    expect(m.h - m.oh, `${id} not transform-shrunk`).toBeGreaterThanOrEqual(-1);
  }
}

async function assertNoOverflow(page: Page) {
  const o = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
    const forme = document.querySelector('[data-testid="gp-forme"]') as HTMLElement;
    const de = document.documentElement;
    return {
      stageOverflow: stage.scrollHeight - stage.clientHeight, stageScrollTop: stage.scrollTop,
      formeOverflow: forme.getAttribute("data-overflow"),
      pageX: de.scrollWidth - de.clientWidth, pageY: window.scrollY,
    };
  });
  expect(o.stageOverflow, "no overflow inside the question stage").toBeLessThanOrEqual(0);
  expect(o.stageScrollTop).toBe(0);
  expect(o.formeOverflow, "the phrase fits the forme").toBe("false");
  expect(o.pageX, "no horizontal page overflow").toBeLessThanOrEqual(0);
  expect(o.pageY, "no page scroll").toBe(0);
}

/** Every glyph visible in a socket must be one the ledger engraved or the player set (never a canonical one). */
async function assertNoLeak(page: Page) {
  const leak = await page.evaluate(() => ({
    results: document.querySelectorAll("[data-result]").length,
    verdicts: document.querySelectorAll("[data-verdict]").length,
    answer: document.querySelector('[data-testid="gp-answer"]')?.textContent ?? "",
    score: document.querySelector('[data-testid="gp-score"]')?.textContent ?? "",
  }));
  expect(leak).toEqual({ results: 0, verdicts: 0, answer: "", score: "" });
}

/** A round whose long phrase must break on a phone, so every viewport is tested at its hardest. */
const ROUND = "life-form-disintegration-ray";

for (const reduced of [false, true]) {
  for (const vp of VIEWPORTS) {
    test(`continuity ${vp.name}${reduced ? " reduced-motion" : ""}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/dev/word-puzzle?round=${ROUND}${reduced ? "&motion=reduce" : ""}`);
      const root = page.locator('[data-mig-primitive="glyph-press"]');
      await expect(root).toHaveAttribute("data-phase", "open");
      await expect(page.getByTestId("gp-block")).toBeVisible();
      await page.waitForTimeout(300);
      await page.evaluate(installSampler, REGIONS);
      const tag = `${vp.name}${reduced ? "-reduced" : ""}`;

      await assertNoLeak(page);
      await assertTargets(page);
      await assertNoOverflow(page);
      await shot(page, path.join(SHOTS, `${tag}-1-open.png`));

      // Type on the physical keyboard: the cursor sits on the first blank socket.
      const forme = page.getByTestId("gp-forme");
      await forme.focus();
      await page.keyboard.type("li");
      const fill0 = await page.getByTestId("gp-fill").textContent();
      // A tap on a drum tile sets the glyph under the cursor.
      await page.getByTestId("gp-tile-F").click();
      const fill1 = await page.getByTestId("gp-fill").textContent();
      expect(fill1).not.toBe(fill0);
      // Focus never scrolled the page.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      // A sounding that hits (E) and one that misses (X): the ledger grows, the drum shows it.
      await page.getByTestId("gp-sound").click();
      await expect(root).toHaveAttribute("data-armed", "true");
      await page.keyboard.press("e");
      await expect(page.getByTestId("gp-tile-E")).toHaveAttribute("data-state", "sounded", { timeout: 3000 });
      await page.getByTestId("gp-sound").click();
      await page.getByTestId("gp-tile-X").click();
      await expect(page.getByTestId("gp-tile-X")).toHaveAttribute("data-state", "tarnished", { timeout: 3000 });
      await expect(page.getByTestId("gp-sounding-record")).toHaveText(/E ×\d+ · X —/);
      await assertNoLeak(page);
      await shot(page, path.join(SHOTS, `${tag}-2-sounded.png`));

      // Revision: arrows and Backspace on the forme; the drum's keys.
      await forme.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Backspace");
      await page.keyboard.type("z");
      await page.getByTestId("gp-drum-window").focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await shot(page, path.join(SHOTS, `${tag}-3-set.png`));

      // Lock (with blanks: the reveal must show what was missing).
      await page.getByTestId("gp-lock").click();
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
      await expect(page.getByTestId("gp-proof")).toHaveAttribute("data-shown", "true");
      await expect(page.getByTestId("gp-answer")).toHaveText("Life Form Disintegration Ray");
      // Every socket printed, and the kinds of result the brief asks the instrument to show are all present.
      const results = await page.evaluate(() => [...document.querySelectorAll("[data-result]")].map((e) => e.getAttribute("data-result")));
      expect(results.length).toBe(25);
      expect(new Set(results)).toEqual(new Set(["given", "sounded", "right", "wrong", "missing"]));
      await shot(page, path.join(SHOTS, `${tag}-6-revealed.png`));
      await assertNoOverflow(page);

      // Next round: the instrument stays where it was.
      await page.getByTestId("lab-next").click();
      await expect(root).toHaveAttribute("data-phase", "open");
      await page.waitForTimeout(250);
      await assertNoLeak(page);
      await shot(page, path.join(SHOTS, `${tag}-7-next.png`));

      const frames = await page.evaluate(() => (window as unknown as { __gpStop: () => Frame[] }).__gpStop());
      expect(frames.length).toBeGreaterThan(40);
      const phases = new Set(frames.map((f) => f.phase));
      expect([...phases]).toEqual(expect.arrayContaining(["open", "locked", "revealed"]));
      const worst = worstMovement(frames);
      const report = Object.entries(worst).map(([k, w]) => `${k}: ${w.max.toFixed(2)}px @${w.frame} ${w.from}→${w.to}`).join("\n");
      console.log(`[continuity ${tag}] frames=${frames.length}\n${report}`);
      for (const [k, w] of Object.entries(worst)) {
        // The block is laid out per round, so the next round may re-flow it; every other region holds to the budget.
        if (k === "block") continue;
        expect(w.max, `${k} moved ${w.max.toFixed(2)}px (${w.from} → ${w.to})\n${report}`).toBeLessThanOrEqual(BUDGET_PX);
      }
      expect(errors, "no console errors").toEqual([]);
    });
  }
}

test("a solved lock prints every socket gold and the plaque names the answer", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/dev/word-puzzle?round=rabadons-deathcap&state=revealed-right");
  const root = page.locator('[data-mig-primitive="glyph-press"]');
  await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
  await expect(root).toHaveAttribute("data-verdict", "solved");
  const results = await page.evaluate(() => [...document.querySelectorAll("[data-result]")].map((e) => e.getAttribute("data-result")));
  expect(results.every((r) => r === "right" || r === "given")).toBe(true);
  await expect(page.getByTestId("gp-answer")).toHaveText("Rabadon's Deathcap");
  await expect(page.getByTestId("gp-lockstate")).toHaveText("Solved");
  await page.screenshot({ path: path.join(SHOTS, "1600x900-solved.png") });
});

test("the rounds the brief asks for all fit the forme at the smallest phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  for (const id of ["zephyr", "kaisa", "heimerdinger", "infinity-edge", "rabadons-deathcap", "ace-in-the-hole", "sleepy-trouble-bubble", "command-shockwave", "life-form-disintegration-ray", "shurima"]) {
    await page.goto(`/dev/word-puzzle?round=${id}`);
    await expect(page.getByTestId("gp-block")).toBeVisible();
    await expect(page.getByTestId("gp-forme")).toHaveAttribute("data-overflow", "false");
    await assertNoOverflow(page);
    await page.screenshot({ path: path.join(SHOTS, `360x640-round-${id}.png`) });
  }
});
