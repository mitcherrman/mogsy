/** MAF1 — mobile answer and timeline visibility regression.
 * The production Ranked renderer is mounted through the existing dev probe,
 * never a second look-alike. Journey's CSS allocations are measured on that
 * same rendered DOM. A tall question may grow the DOCUMENT; no option may be
 * clipped by its parchment and the mobile progression strip remains visible.
 */
import { expect, test } from "@playwright/test";

const CASES = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 360, height: 640 },
];
const LIVE = "&points=4:7-5&name=Kalista_Enjoyer&role=mid&orole=support&progression=0&frame=0";

for (const vp of CASES) {
  test.describe(`mobile arena visibility ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, isMobile: true, hasTouch: true });
    for (const shape of ["opts4", "realMax", "masteryRecall", "metareflex"]) {
      test(`${shape} keeps the mobile timeline and visible answers`, async ({ page }) => {
        await page.goto(`/dev/ranked-shell-probe?q=${shape}${LIVE}`);
        await page.waitForSelector('[data-testid="ranked-mobile-bottombar"]');
        await page.waitForSelector('[data-testid="ranked-question"]');
        const measurement = await page.evaluate(() => {
          const bar = document.querySelector<HTMLElement>('[data-testid="ranked-mobile-bottombar"]')!;
          const stage = document.querySelector<HTMLElement>('[data-testid="ranked-question"]')!;
          const barBox = bar.getBoundingClientRect();
          const stageBox = stage.getBoundingClientRect();
          const choiceBoxes = [...document.querySelectorAll<HTMLElement>(
            '[data-surface-region="answers"] [data-quiz-choice]')].map(el => el.getBoundingClientRect());
          const horizontal = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          return {
            barVisible: barBox.height > 0 && barBox.top >= -1 && barBox.bottom <= window.innerHeight + 1,
            barSticky: getComputedStyle(bar).position === "sticky",
            choiceCount: choiceBoxes.length,
            stageClipsChoices: choiceBoxes.some(r =>
              r.top < stageBox.top - 1 || r.bottom > stageBox.bottom + 1),
            horizontal,
            hasNestedScroller: [stage, ...stage.querySelectorAll("*")].some(el => {
              const css = getComputedStyle(el);
              return /auto|scroll/.test(css.overflowY) && el.scrollHeight > el.clientHeight + 1;
            }),
          };
        });
        expect(measurement.barSticky).toBe(true);
        expect(measurement.barVisible, "the progression bar is offscreen").toBe(true);
        expect(measurement.horizontal, "the page overflows horizontally").toBeLessThanOrEqual(1);
        expect(measurement.hasNestedScroller, "a hidden scroll area clips gameplay").toBe(false);
        if (shape !== "metareflex") {
          expect(measurement.choiceCount).toBeGreaterThan(0);
          expect(measurement.stageClipsChoices, "answers leave the parchment").toBe(false);
        }
      });
    }

    test("Journey reserves are constant per viewport and give back height on short phones", async ({ page }) => {
      await page.goto(`/dev/ranked-shell-probe?q=masteryRecall${LIVE}`);
      await page.waitForSelector('[data-testid="ranked-match"]');
      const reserves = await page.evaluate(() => {
        const arena = document.querySelector<HTMLElement>('.ranked-shell[data-phone-arena="true"]')!;
        const node = document.createElement("div");
        node.className = "journey-stage";
        arena.appendChild(node);
        const cs = getComputedStyle(node);
        const values = ["--jb-band-h", "--jq-prompt-h", "--jq-answers-h"]
          .map(name => cs.getPropertyValue(name).trim());
        node.remove();
        // Let the browser resolve clamp/calc lengths by applying the tokens.
        const px = values.map(v => {
          const tmp = document.createElement("div");
          tmp.style.height = v;
          tmp.style.position = "absolute";
          arena.appendChild(tmp);
          const n = tmp.getBoundingClientRect().height;
          tmp.remove();
          return n;
        });
        return px;
      });
      expect(reserves).toHaveLength(3);
      expect(reserves[0]).toBeGreaterThanOrEqual(96);
      expect(reserves[0]).toBeLessThanOrEqual(200);
      expect(reserves[1]).toBeGreaterThanOrEqual(104);
      expect(reserves[1]).toBeLessThanOrEqual(140);
      expect(reserves[2]).toBeGreaterThanOrEqual(232);
      expect(reserves[2]).toBeLessThanOrEqual(280);
      // At 844 tall the original geometry is retained exactly.
      if (vp.height === 844) expect(reserves.map(Math.round)).toEqual([200, 140, 280]);
      if (vp.height === 640) expect(reserves.map(Math.round)).toEqual([96, 104, 232]);
    });
  });
}
