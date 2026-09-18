/**
 * RE1 — THE RANKED END SCREEN FITS ONE DESKTOP VIEWPORT.
 *
 * `/dev/ranked-shell-probe?end=…` mounts the REAL `QuizRankedMatch` on a
 * finished ten-module points match: the resume carries the result row and the
 * resume backfill recovers every module's settlement for both seats. So what
 * is measured here is the production end screen, laid out by the browser.
 *
 * Per desktop viewport and result state:
 *   * the document does not scroll vertically;
 *   * all twenty bubbles (10 modules × 2 players) are on screen;
 *   * module N of the viewer's row and module N of the opponent's share an x;
 *   * the three actions are on screen;
 *   * neither mascot overlaps the module grid;
 *   * no speed dot is clipped by any ancestor.
 *
 * Plus one lightweight phone sanity check — not a mobile contract.
 *
 *   npx playwright test -c playwright.arena.config.ts e2e/ranked-result-fit.spec.ts
 */
import { expect, test } from "@playwright/test";

const DESKTOP = [
  { w: 1024, h: 768 }, { w: 1280, h: 720 }, { w: 1280, h: 800 }, { w: 1366, h: 768 },
  { w: 1500, h: 900 }, { w: 1600, h: 900 }, { w: 1920, h: 1080 },
];

const STATES = [
  { id: "victory", query: "end=victory&role=top&orole=mid", settled: 10 },
  { id: "defeat vs same-role bot", query: "end=defeat&role=adc&orole=adc&bot=1", settled: 10 },
  { id: "draw", query: "end=draw&role=jungle&orole=support", settled: 10 },
  { id: "missing modules 4 and 7", query: "end=victory&role=mid&orole=top&gap=4,7", settled: 10 },
  { id: "historical role-less opponent", query: "end=victory&role=top&orole=none", settled: 10 },
] as const;

const url = (query: string) => `/dev/ranked-shell-probe?${query}&frame=0&progression=0`;

async function openEndScreen(page: import("@playwright/test").Page, query: string, settled: number) {
  await page.goto(url(query));
  await page.getByTestId("module-duel").waitFor();
  // The backfill is background work: wait for the last module of both rows.
  await expect(page.getByTestId(`module-duel-viewer-${settled}`))
    .toHaveAttribute("data-slot-state", "scored");
  await expect(page.getByTestId(`module-duel-opponent-${settled}`))
    .toHaveAttribute("data-slot-state", "scored");
  // Fonts and the mascot art settle layout; measure after both.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

const MEASURE = () => {
  const rect = (el: Element) => el.getBoundingClientRect();
  const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const inViewport = (r: DOMRect) =>
    r.width > 0 && r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5;
  const overlap = (a: DOMRect, b: DOMRect) =>
    a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

  const modules = Number((q("module-duel") as HTMLElement).dataset.moduleCount);
  const bubbles = [...document.querySelectorAll('[data-testid^="module-duel-bubble-"]')];
  const misaligned: number[] = [];
  for (let m = 1; m <= modules; m += 1) {
    const v = rect(q(`module-duel-bubble-viewer-${m}`)!);
    const o = rect(q(`module-duel-bubble-opponent-${m}`)!);
    if (Math.abs((v.left + v.right) / 2 - (o.left + o.right) / 2) > 0.5) misaligned.push(m);
  }
  // A speed dot is clipped if ANY ancestor that clips cuts into it.
  const clippedDots = [...document.querySelectorAll('[data-testid="module-bubble-speed"]')]
    .filter((dot) => q("module-duel")!.contains(dot))
    .filter((dot) => {
      const d = rect(dot);
      if (!inViewport(d)) return true;
      for (let n = dot.parentElement; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (/hidden|clip|auto|scroll/.test(s.overflowX + s.overflowY)) {
          const c = rect(n);
          if (d.top < c.top - 0.5 || d.bottom > c.bottom + 0.5
            || d.left < c.left - 0.5 || d.right > c.right + 0.5) return true;
        }
      }
      return false;
    }).length;
  const grid = rect(q("module-duel")!);
  const figures = ["result-duelist-figure", "result-duelist-figure-opponent"]
    .map((id) => rect(q(id)!));
  return {
    pageScrollY: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    modules,
    bubbles: bubbles.length,
    bubblesOnScreen: bubbles.filter((b) => inViewport(rect(b))).length,
    misaligned,
    actionsOnScreen: ["result-primary", "result-secondary", "result-tertiary"]
      .every((id) => inViewport(rect(q(id)!))),
    mascotOverGrid: figures.some((f) => overlap(f, grid)),
    clippedDots,
    speedDots: document.querySelectorAll('[data-testid="module-duel"] [data-testid="module-bubble-speed"]').length,
    headingOnScreen: inViewport(rect(q("match-over-heading")!)),
    scoreOnScreen: inViewport(rect(q("final-score-you")!)) && inViewport(rect(q("final-score-opponent")!)),
    frameBottom: Math.round(rect(q("match-over-frame")!).bottom),
  };
};

for (const vp of DESKTOP) {
  test.describe(`${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });
    for (const state of STATES) {
      test(`${state.id}: fits one viewport, rows aligned, nothing clipped`, async ({ page }) => {
        await openEndScreen(page, state.query, state.settled);
        const m = await page.evaluate(MEASURE);
        test.info().annotations.push({ type: "geometry", description: JSON.stringify(m) });
        expect(m.pageScrollY, "the end screen scrolls the document").toBeLessThanOrEqual(0);
        expect(m.modules).toBe(10);
        expect(m.bubbles).toBe(20);
        expect(m.bubblesOnScreen, "a module column is off screen").toBe(20);
        expect(m.misaligned, "viewer/opponent bubbles drift apart").toEqual([]);
        expect(m.actionsOnScreen, "an action is below the fold").toBe(true);
        expect(m.mascotOverGrid, "a mascot overlaps the module grid").toBe(false);
        expect(m.speedDots, "fixture should carry speed dots").toBeGreaterThan(0);
        expect(m.clippedDots, "a speed dot is clipped").toBe(0);
        expect(m.headingOnScreen && m.scoreOnScreen).toBe(true);
      });
    }
  });
}

test.describe("phone sanity (390x844) — not a mobile contract", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the result, the score and every module are reachable, rows aligned", async ({ page }) => {
    await openEndScreen(page, "end=victory&role=top&orole=mid", 10);
    const m = await page.evaluate(() => {
      const q = (id: string) => document.querySelector(`[data-testid="${id}"]`)!;
      const r = (id: string) => q(id).getBoundingClientRect();
      const misaligned: number[] = [];
      for (let i = 1; i <= 10; i += 1) {
        const v = r(`module-duel-bubble-viewer-${i}`);
        const o = r(`module-duel-bubble-opponent-${i}`);
        if (Math.abs(v.left - o.left) > 0.5) misaligned.push(i);
      }
      const docOverflowX = document.documentElement.scrollWidth - window.innerWidth;
      return {
        misaligned,
        headingTop: r("match-over-heading").top,
        scoreRight: r("final-score-opponent").right,
        docOverflowX,
        vw: window.innerWidth,
        duelistWidths: [r("result-contestant").width, r("result-contestant-opponent").width],
      };
    });
    test.info().annotations.push({ type: "geometry", description: JSON.stringify(m) });
    expect(m.misaligned).toEqual([]);
    // Both duelists keep a real column — the score sits above them on a phone
    // rather than squeezing them to slivers between it.
    expect(Math.min(...m.duelistWidths)).toBeGreaterThan(100);
    expect(m.headingTop).toBeGreaterThanOrEqual(0);
    expect(m.scoreRight).toBeLessThanOrEqual(m.vw);
    // The end screen may not widen the document on a phone (the grid scrolls
    // inside its own strip if it must). A few px of pre-existing app overflow
    // is tolerated — it is present on the live match screen as well.
    expect(m.docOverflowX).toBeLessThanOrEqual(4);
  });
});
