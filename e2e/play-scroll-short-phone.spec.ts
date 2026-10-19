import { test, expect, type Page } from "@playwright/test";

/**
 * MISC W3B (F06) — the Play selector on short phones.
 *
 * `/dev/play-scroll` renders the real `PlayScrollRecord` with a fabricated
 * queue, so this needs no backend. The assertions are about GEOMETRY and
 * reachability, which jsdom cannot see: the sheet fits the visible viewport,
 * every control is reachable (in view, or one scroll of the single scroll
 * region away), nothing overflows sideways, and scrolling the record never
 * scrolls the page behind it.
 */

const SHORT = [
  { w: 320, h: 568 },
  { w: 360, h: 640 },
  { w: 375, h: 667 },
  { w: 568, h: 320 },
  { w: 667, h: 375 },
  { w: 844, h: 390 },
] as const;

const MODES = ["ranked", "daily", "invite"] as const;

async function open(page: Page) {
  await page.goto("/dev/play-scroll");
  await page.waitForSelector('[data-testid="play-scroll"]');
  // The unfurl animates the sheet's height. Sample the settled box.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="play-scroll"]') as HTMLElement | null;
    if (!el) return false;
    const w = window as unknown as { __last?: string; __n?: number };
    const now = JSON.stringify(el.getBoundingClientRect());
    w.__n = w.__last === now ? (w.__n ?? 0) + 1 : 0;
    w.__last = now;
    return (w.__n ?? 0) >= 4;
  }, null, { polling: 150 });
}

/** Where a control is, and whether it is inside the scroll region's visible box. */
async function reach(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const body = document.querySelector(".play-scroll__body") as HTMLElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    return {
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight + 0.5 && r.left >= 0 && r.right <= window.innerWidth + 0.5,
      // As much of it as the region can hold is showing. A card taller than a
      // landscape phone's region can never be fully inside it; what matters is
      // that scrolling brings it to fill the region rather than leaving it cut.
      inRegion:
        !body.contains(el) ||
        Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) >= Math.min(r.height, b.height) - 2,
    };
  }, testId);
}

for (const vp of SHORT) {
  test.describe(`Play selector ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, hasTouch: true });

    test("sheet fits the viewport and nothing overflows sideways", async ({ page }) => {
      await open(page);
      const m = await page.evaluate(() => {
        const sheet = document.querySelector('[data-testid="play-scroll"]')!.getBoundingClientRect();
        return {
          top: sheet.top, bottom: sheet.bottom, left: sheet.left, right: sheet.right,
          vh: window.innerHeight, vw: window.innerWidth,
          hOverflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(m.top, JSON.stringify(m)).toBeGreaterThanOrEqual(0);
      expect(m.bottom, JSON.stringify(m)).toBeLessThanOrEqual(m.vh + 0.5);
      expect(m.left).toBeGreaterThanOrEqual(0);
      expect(m.right).toBeLessThanOrEqual(m.vw + 0.5);
      expect(m.hOverflow).toBeLessThanOrEqual(0);
    });

    test("close, role arrows and the heading are always on screen", async ({ page }) => {
      await open(page);
      for (const id of ["play-scroll-close", "play-scroll-role-prev", "play-scroll-role-next", "play-scroll-role-name"]) {
        const r = await reach(page, id);
        expect(r, id).not.toBeNull();
        expect(r!.inViewport, id).toBe(true);
      }
    });

    test("every mode and Practice is reachable, by scrolling the one region if needed", async ({ page }) => {
      await open(page);
      for (const id of [...MODES.map((m) => `play-mode-${m}`), "play-scroll-practice"]) {
        await page.locator(`[data-testid="${id}"]`).scrollIntoViewIfNeeded();
        await page.waitForTimeout(400); // the region scrolls smoothly
        const r = await reach(page, id);
        expect(r, id).toEqual({ inViewport: true, inRegion: true });
      }
    });

    test("scrolling the record does not scroll the page behind it", async ({ page }) => {
      await open(page);
      const before = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => {
        const b = document.querySelector(".play-scroll__body") as HTMLElement;
        b.scrollTop = b.scrollHeight;
      });
      await page.mouse.move(vp.w / 2, vp.h / 2);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(120);
      const after = await page.evaluate(() => ({
        y: window.scrollY,
        locked: getComputedStyle(document.body).overflow,
      }));
      expect(after.y).toBe(before);
    });

    test("Escape closes the record", async ({ page }) => {
      await open(page);
      await page.keyboard.press("Escape");
      await expect(page.locator('[data-testid="play-scroll"]')).toHaveCount(0);
    });

    test("keyboard: Tab reaches Practice and brings it into the scroll region", async ({ page }) => {
      await open(page);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        const onPractice = await page.evaluate(
          () => document.activeElement?.getAttribute("data-testid") === "play-scroll-practice",
        );
        if (onPractice) break;
      }
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
      ).toBe("play-scroll-practice");
      await page.waitForTimeout(400);
      expect(await reach(page, "play-scroll-practice")).toEqual({ inViewport: true, inRegion: true });
    });
  });
}

test.describe("Play selector touch targets", () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

  // The ink is 32px / 40px; the hit area behind it is 44px. Probe the
  // pixels just outside the visible box and confirm they still hit the control.
  for (const [id, visible] of [
    ["play-scroll-close", 32],
    ["play-scroll-role-prev", 40],
    ["play-scroll-role-next", 40],
  ] as const) {
    test(`${id} has a 44px hit area`, async ({ page }) => {
      await open(page);
      const hit = await page.evaluate(([tid, size]) => {
        const el = document.querySelector(`[data-testid="${tid}"]`) as HTMLElement;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const reach = 22 - 0.5;
        const at = (x: number, y: number) => {
          const t = document.elementFromPoint(x, y);
          return !!t && (t === el || el.contains(t));
        };
        return {
          size,
          visibleW: r.width,
          up: at(cx, cy - reach),
          down: at(cx, cy + reach),
          left: at(cx - reach, cy),
          right: at(cx + reach, cy),
        };
      }, [id, visible] as const);
      expect(hit.visibleW).toBe(visible);
      expect(hit, JSON.stringify(hit)).toMatchObject({ up: true, down: true, left: true, right: true });
    });
  }
});

test.describe("Play selector reduced motion", () => {
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: "reduce" });

  test("the veil and the unfurl do not animate", async ({ page }) => {
    await page.goto("/dev/play-scroll");
    await page.waitForSelector('[data-testid="play-scroll"]');
    const names = await page.evaluate(() => ({
      overlay: getComputedStyle(document.querySelector(".play-scroll-overlay")!).animationName,
      sheet: getComputedStyle(document.querySelector(".play-scroll .lc-scroll__sheet")!).animationName,
    }));
    expect(names).toEqual({ overlay: "none", sheet: "none" });
  });

  test("DIAG reduced motion", async ({ page, browserName }, testInfo) => {
    await page.goto("/dev/play-scroll");
    await page.waitForSelector('[data-testid="play-scroll"]');
    const q = () => page.evaluate(() => ({
      mq: matchMedia("(prefers-reduced-motion: reduce)").matches,
      bare: matchMedia("(prefers-reduced-motion)").matches,
      nopref: matchMedia("(prefers-reduced-motion: no-preference)").matches,
      anim: getComputedStyle(document.querySelector(".play-scroll-overlay")!).animationName,
    }));
    const before = await q();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const after = await q();
    console.log("DIAG " + JSON.stringify({ browserName, ver: page.context().browser()?.version(), projUse: testInfo.project.use.reducedMotion, before, after }));
  });
});
