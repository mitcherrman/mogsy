import { expect, test } from "@playwright/test";

const WIDTHS = [320, 375, 390, 430, 591] as const;
const MODES = ["standard", "time_trial", "survival", "weak_areas", "review"] as const;

for (const width of WIDTHS) {
  for (const mode of MODES) {
    test(`Daily header ${mode} fits in one row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/e2e/daily-mobile-header-harness.html?mode=${mode}`);
      const header = page.getByTestId("daily-stage-chrome");
      const back = header.getByRole("link", { name: "Exit Daily Challenge" });
      const cta = page.getByTestId("daily-screenshot-cta");
      await expect(header).toBeVisible();
      await expect(back).toBeVisible();
      await expect(cta).toBeVisible();
      await expect(header.getByTestId("daily-stage-tag")).toBeVisible();

      const fit = await page.evaluate(() => {
        const pick = (id: string) => {
          const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
          const box = el.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height };
        };
        const header = document.querySelector('[data-testid="daily-stage-chrome"]') as HTMLElement;
        const left = header.querySelector('a[href="/quiz"]') as HTMLElement;
        const cta = document.querySelector('[data-testid="daily-screenshot-cta"]') as HTMLElement;
        const first = document.querySelector('[data-testid="arena-first-content"]') as HTMLElement;
        const h = header.getBoundingClientRect();
        const l = left.getBoundingClientRect();
        const c = cta.getBoundingClientRect();
        const f = first.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          docWidth: document.documentElement.scrollWidth,
          headerScrollWidth: header.scrollWidth,
          headerClientWidth: header.clientWidth,
          h: pick("daily-stage-chrome"), left: { top: l.top, bottom: l.bottom },
          cta: { top: c.top, bottom: c.bottom, left: c.left, right: c.right },
          firstTop: f.top,
          overlapping: l.right > c.left,
          computedWrap: getComputedStyle(header).flexWrap,
        };
      });

      expect(fit.docWidth, JSON.stringify(fit)).toBeLessThanOrEqual(width);
      expect(fit.headerScrollWidth, JSON.stringify(fit)).toBeLessThanOrEqual(fit.headerClientWidth + 1);
      expect(fit.h.height, JSON.stringify(fit)).toBeLessThanOrEqual(32);
      expect(fit.computedWrap).toBe("nowrap");
      expect(fit.cta.top, JSON.stringify(fit)).toBeGreaterThanOrEqual(fit.h.top - 1);
      expect(fit.cta.bottom, JSON.stringify(fit)).toBeLessThanOrEqual(fit.h.bottom + 1);
      expect(fit.overlapping, JSON.stringify(fit)).toBe(false);
      expect(fit.firstTop, JSON.stringify(fit)).toBeLessThanOrEqual(fit.h.bottom + 10);

      if (mode === "time_trial") await expect(header.getByRole("timer")).toBeVisible();
      if (mode === "survival") await expect(header.getByTestId("daily-strikes-count")).toBeVisible();
    });
  }
}
