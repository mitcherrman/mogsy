/**
 * PAV1 — PRO PLAY ASSEMBLY CONTINUITY, FIT, TARGET SIZE AND LEAK, measured
 * in a real browser, plus the capture matrix the handoff cites.
 *
 * Plays the real lifecycle in `/dev/pro-play-assembly` (the DEV-only lab,
 * which mounts the production CanonicalArena with a lab renderer; no backend
 * beyond the static asset server): open → tap a card, tap a position →
 * number key → drag a card onto a position → pick a seated card up and move
 * it → return one to the tray → fill → Lock → locked → reveal (marks, settle,
 * context) → done → next round. The structural regions are sampled on every
 * animation frame and DOM commit and held to ≤1px of movement, in both
 * motion modes, at six viewports, for both families.
 *
 * It also asserts: no page scroll, no overflow inside the question stage,
 * every control ≥44px rendered with rendered size equal to layout size, and
 * that the DOM carries no mark, verdict, canonical token or context before
 * the reveal.
 *
 * It writes screenshots and a reveal frame series to ASSEMBLY_SHOTS
 * (default: <repo>/test-results/pro-play-assembly).
 *
 *   npx playwright test -c playwright.arena.config.ts pro-play-assembly-continuity
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.ASSEMBLY_SHOTS ?? path.resolve("test-results/pro-play-assembly");
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x650", width: 1366, height: 650 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
] as const;

const FAMILIES = [
  { key: "roster", round: "rl-2017-finals-samsung-galaxy", size: 10 },
  { key: "draft", round: "dm-2017-finals-g3-samsung-galaxy", size: 15 },
] as const;

/** The structural regions a player tracks. The drag ghost moves by design and is not here. */
const REGIONS: Record<string, string> = {
  root: '[data-mig-primitive="positional-assembly"]',
  head: '[data-part="head"]',
  board: '[data-part="board"]',
  wellTop: '[data-testid="pa-well-top"]',
  wellSupport: '[data-testid="pa-well-support"]',
  region: '[data-part="stage-region"]',
  tray: '[data-part="tray"]',
  plate: '[data-part="plate"]',
  lock: '[data-part="lock"]',
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
    const m = document.querySelector('[data-mig-primitive="positional-assembly"]');
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
  const w = window as unknown as { __paStop: () => Frame[]; __paPause: (p: boolean) => void };
  w.__paStop = () => { running = false; mo.disconnect(); return frames; };
  w.__paPause = (p) => { paused = p; };
}

async function shot(page: Page, file: string) {
  await page.evaluate(() => (window as unknown as { __paPause?: (p: boolean) => void }).__paPause?.(true));
  await page.screenshot({ path: file });
  await page.waitForTimeout(30);
  await page.evaluate(() => (window as unknown as { __paPause?: (p: boolean) => void }).__paPause?.(false));
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

async function assertTargets(page: Page) {
  const sizes = await page.evaluate(() => {
    const out: { id: string; w: number; h: number; ow: number; oh: number }[] = [];
    const read = (e: Element, id: string) => {
      const b = e.getBoundingClientRect();
      out.push({ id, w: b.width, h: b.height, ow: (e as HTMLElement).offsetWidth, oh: (e as HTMLElement).offsetHeight });
    };
    document.querySelectorAll('[data-part="card"]').forEach((e, i) => read(e, `card-${i}`));
    document.querySelectorAll('[data-part="well"]').forEach((e) => read(e, `well-${e.getAttribute("data-testid")}`));
    read(document.querySelector('[data-testid="pa-lock"]')!, "lock");
    return out;
  });
  for (const m of sizes) {
    expect(m.w, `${m.id} rendered width`).toBeGreaterThanOrEqual(44);
    expect(m.h, `${m.id} rendered height`).toBeGreaterThanOrEqual(44);
    expect(Math.abs(m.w - m.ow), `${m.id} not transform-scaled`).toBeLessThanOrEqual(1);
    expect(Math.abs(m.h - m.oh), `${m.id} not transform-scaled`).toBeLessThanOrEqual(1);
  }
}

async function assertNoOverflow(page: Page) {
  const o = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
    const de = document.documentElement;
    const root = document.querySelector('[data-mig-primitive="positional-assembly"]') as HTMLElement;
    const rb = root.getBoundingClientRect();
    const sb = stage.getBoundingClientRect();
    return {
      stageOverflow: stage.scrollHeight - stage.clientHeight, stageScrollTop: stage.scrollTop,
      pageX: de.scrollWidth - de.clientWidth, pageY: window.scrollY,
      rootInside: rb.top >= sb.top - 1 && rb.bottom <= sb.bottom + 1 && rb.left >= sb.left - 1 && rb.right <= sb.right + 1,
    };
  });
  expect(o.stageOverflow, "no overflow inside the question stage").toBeLessThanOrEqual(0);
  expect(o.stageScrollTop).toBe(0);
  expect(o.pageX, "no horizontal page overflow").toBeLessThanOrEqual(0);
  expect(o.pageY, "no page scroll").toBe(0);
  expect(o.rootInside, "the instrument sits inside the stage").toBe(true);
}

/** Centre of an element in page coordinates. */
async function centre(page: Page, selector: string) {
  return page.locator(selector).evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
}

/** Drag by mouse at finger pace (touch-style zero-delay swipes make Chrome swallow the next tap). */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.waitForTimeout(60);
  await page.mouse.up();
}

for (const fam of FAMILIES) {
  for (const reduced of [false, true]) {
    for (const vp of VIEWPORTS) {
      test(`${fam.key} continuity ${vp.name}${reduced ? " reduced-motion" : ""}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`/dev/pro-play-assembly?family=${fam.key}&round=${fam.round}&size=${fam.size}${reduced ? "&motion=reduce" : ""}`);
        const root = page.locator('[data-mig-primitive="positional-assembly"]');
        await expect(root).toHaveAttribute("data-phase", "open");
        await page.waitForTimeout(350);
        await page.evaluate(installSampler, REGIONS);
        const tag = `${fam.key}-${vp.name}${reduced ? "-reduced" : ""}`;

        // No mark, verdict, canonical token, note or context in the DOM before the reveal.
        const pre = await page.evaluate(() => ({
          marks: document.querySelectorAll("[data-mark]").length,
          verdicts: document.querySelectorAll("[data-verdict]").length,
          context: (document.querySelector('[data-testid="pa-context"]') as HTMLElement).textContent,
          contextShown: (document.querySelector('[data-testid="pa-context"]') as HTMLElement).dataset.shown,
          picks: [...document.querySelectorAll('[data-part="pick"]')].filter((p) => (p as HTMLElement).dataset.shown === "true").length,
          html: document.querySelector('[data-mig-primitive="positional-assembly"]')!.outerHTML,
        }));
        expect(pre.marks).toBe(0);
        expect(pre.verdicts).toBe(0);
        expect(pre.context).toBe("");
        expect(pre.contextShown).toBe("false");
        expect(pre.picks).toBe(0);
        expect(pre.html).not.toMatch(/canonical|answer|tier|role_anchor|isCorrect|right player/i);

        await assertTargets(page);
        await assertNoOverflow(page);
        await shot(page, path.join(SHOTS, `${tag}-1-open.png`));

        const cards = page.locator('[data-part="card"]');
        const tokens = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("pa-card-", "")));
        expect(tokens.length).toBe(fam.size);

        // Tap a card, tap a position.
        await cards.nth(0).click();
        await expect(root).toHaveAttribute("data-armed", "true");
        await shot(page, path.join(SHOTS, `${tag}-2-armed.png`));
        await page.getByTestId("pa-well-top").click();
        await expect(page.getByTestId("pa-well-top")).toHaveAttribute("data-token", tokens[0]);
        await expect(page.getByTestId(`pa-card-${tokens[0]}`)).toHaveAttribute("data-seated", "true");

        // Tap a card, press its number.
        await cards.nth(1).click();
        await page.keyboard.press("2");
        await expect(page.getByTestId("pa-well-jungle")).toHaveAttribute("data-token", tokens[1]);

        // Drag a card onto a position.
        const c2 = await centre(page, `[data-testid="pa-card-${tokens[2]}"]`);
        const midWell = await centre(page, '[data-testid="pa-well-mid"]');
        await page.mouse.move(c2.x, c2.y);
        await page.mouse.down();
        await page.mouse.move(c2.x + 4, c2.y + 4, { steps: 2 });
        await page.mouse.move((c2.x + midWell.x) / 2, (c2.y + midWell.y) / 2, { steps: 8 });
        await expect(page.getByTestId("pa-drag-ghost")).toBeVisible();
        await shot(page, path.join(SHOTS, `${tag}-3-drag.png`));
        await page.mouse.move(midWell.x, midWell.y, { steps: 8 });
        await page.waitForTimeout(60);
        await page.mouse.up();
        await expect(page.getByTestId("pa-well-mid")).toHaveAttribute("data-token", tokens[2]);

        // Pick a seated card up by tapping it, move it to Bot; then put another back by dragging it to the tray.
        await page.getByTestId("pa-well-mid").click();
        await expect(root).toHaveAttribute("data-armed", "true");
        await page.getByTestId("pa-well-adc").click();
        await expect(page.getByTestId("pa-well-adc")).toHaveAttribute("data-token", tokens[2]);
        await expect(page.getByTestId("pa-well-mid")).not.toHaveAttribute("data-token", /.+/);
        const jungleWell = await centre(page, '[data-testid="pa-well-jungle"]');
        const trayC = await centre(page, '[data-part="tray"]');
        await drag(page, jungleWell, trayC);
        await expect(page.getByTestId("pa-well-jungle")).not.toHaveAttribute("data-token", /.+/);
        await expect(page.getByTestId(`pa-card-${tokens[1]}`)).not.toHaveAttribute("data-seated", "true");

        // Keyboard: arrows rove, Delete returns, then fill the rest by number keys.
        await page.getByTestId("pa-well-top").focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByTestId("pa-well-jungle")).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Delete");
        await expect(page.getByTestId("pa-well-top")).not.toHaveAttribute("data-token", /.+/);
        const fill: [string, string][] = [[tokens[0], "1"], [tokens[1], "2"], [tokens[3], "3"], [tokens[4], "5"]];
        for (const [t, key] of fill) {
          await page.getByTestId(`pa-card-${t}`).click();
          await page.keyboard.press(key);
        }
        await expect(root).toHaveAttribute("data-filled", "5");
        await assertTargets(page);
        await shot(page, path.join(SHOTS, `${tag}-4-filled.png`));

        // Lock.
        await expect(page.getByTestId("pa-lock")).toBeEnabled();
        await page.getByTestId("pa-lock").click();
        await expect(root).toHaveAttribute("data-phase", "locked");
        await expect(page.getByTestId("lab-response")).toHaveAttribute("data-on", "true");
        await shot(page, path.join(SHOTS, `${tag}-5-locked.png`));

        // Reveal: a frame series through the choreography.
        await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 5000 });
        if (!reduced) {
          for (let i = 0; i < 8; i++) {
            await page.screenshot({ path: path.join(SHOTS, `${tag}-6-reveal-${i}.png`) });
            await page.waitForTimeout(160);
          }
        }
        await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
        await expect(page.getByTestId("lab-reveal-done")).toHaveAttribute("data-on", "true");
        await expect(page.getByTestId("pa-context")).toHaveAttribute("data-shown", "true");
        await expect(root).toHaveAttribute("data-verdict", /right|wrong/);
        await assertNoOverflow(page);
        await shot(page, path.join(SHOTS, `${tag}-7-revealed.png`));

        // Next round: the instrument stays where it was.
        await page.getByTestId("lab-next").click();
        await expect(root).toHaveAttribute("data-phase", "open");
        await expect(root).toHaveAttribute("data-filled", "0");
        await page.waitForTimeout(250);
        await shot(page, path.join(SHOTS, `${tag}-8-next.png`));

        const frames = await page.evaluate(() => (window as unknown as { __paStop: () => Frame[] }).__paStop());
        expect(frames.length).toBeGreaterThan(40);
        const phases = new Set(frames.map((f) => f.phase));
        expect([...phases]).toEqual(expect.arrayContaining(["open", "locked", "revealed"]));
        const worst = worstMovement(frames);
        const report = Object.entries(worst).map(([k, w]) => `${k}: ${w.max.toFixed(2)}px @${w.frame} ${w.from}→${w.to}`).join("\n");
        console.log(`[continuity ${tag}] frames=${frames.length}\n${report}`);
        for (const [k, w] of Object.entries(worst)) {
          expect(w.max, `${k} moved ${w.max.toFixed(2)}px (${w.from} → ${w.to})\n${report}`).toBeLessThanOrEqual(BUDGET_PX);
        }
      });
    }
  }
}

test("a fully right lineup reveals with every seal gold and no demoted pick", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/dev/pro-play-assembly?family=roster&round=rl-2017-finals-samsung-galaxy&state=revealed-right");
  const root = page.locator('[data-mig-primitive="positional-assembly"]');
  await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 8000 });
  await expect(root).toHaveAttribute("data-verdict", "right");
  const marks = await page.evaluate(() => [...document.querySelectorAll('[data-part="position"]')].map((p) => p.getAttribute("data-mark")));
  expect(marks).toEqual(["right", "right", "right", "right", "right"]);
  const shownPicks = await page.evaluate(() => [...document.querySelectorAll('[data-part="pick"]')].filter((p) => (p as HTMLElement).dataset.shown === "true").length);
  expect(shownPicks).toBe(0);
  await expect(page.getByTestId("pa-lockstate")).toHaveText("5 / 5");
  await page.screenshot({ path: path.join(SHOTS, "roster-1600x900-exact.png") });
});

test("a wrong board keeps every wrong pick visible, named and explained", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/dev/pro-play-assembly?family=draft&round=dm-2017-finals-g3-samsung-galaxy&state=revealed-wrong");
  const root = page.locator('[data-mig-primitive="positional-assembly"]');
  await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 8000 });
  await expect(root).toHaveAttribute("data-verdict", "wrong");
  const picks = await page.evaluate(() => [...document.querySelectorAll('[data-part="pick"]')].filter((p) => (p as HTMLElement).dataset.shown === "true").map((p) => p.textContent));
  expect(picks.length).toBe(3);
  await expect(page.getByTestId("pa-context-notes")).toContainText(/Samsung Galaxy|SK Telecom T1|Worlds 2017/);
  // The canonical Game 3 five are now seated (PA1's verified lineup).
  // The settled face (the sunk player's card keeps its own, leaving, layer).
  const seated = await page.evaluate(() => [...document.querySelectorAll('[data-part="well"]')].map((w) => w.querySelector('.pa-well-face:not([data-leaving]) .pa-face-label')?.textContent));
  expect(seated).toEqual(["Cho'Gath", "Sejuani", "Malzahar", "Varus", "Lulu"]);
  await page.screenshot({ path: path.join(SHOTS, "draft-1600x900-wrong.png") });
});
