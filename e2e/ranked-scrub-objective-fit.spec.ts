/**
 * SCRUB-S3 — EVERY CHRONOSCOPE OBJECTIVE FITS ITS BLOCK, AT EVERY SUPPORTED SIZE.
 *
 * The objective block is a fixed height per tier (the instrument never moves), so a sentence that
 * wraps past what the block holds is cut mid-glyph. SCRUB-S2's browser evidence only played the three
 * short "first wave where ... reaches Level N" objectives; the two "first CANNON wave where ... is at
 * least Level N" ones wrap to two lines at the normal tier and were clipped, hiding the target level.
 *
 * This puts each of the nine objectives the wave/XP authority can serve (the text of
 * `chronoscope_checkpoint_rounds`, backend `league_mechanics/wave_xp_authority.py`) into the real
 * Chronoscope in the real Ranked host (`/dev/ranked-shell-probe?q=scrub`) and requires that, at
 * every size, every line the sentence needs is painted inside the objective block next to its
 * eyebrow, and that the clamp is not hiding a line.
 *
 * Known residual, NOT asserted: the compact tier at a narrow module (a ≥1024px window under 720px
 * tall whose module is ~480px wide, e.g. 1024×650) still wraps the two cannon objectives; that tier
 * has 1px spare, so it needs an owner design call rather than a pixel borrowed here.
 *
 *   npx playwright test -c playwright.arena.config.ts ranked-scrub-objective-fit
 */
import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

const OBJECTIVES = [
  "Find the first wave where a duo laner reaches Level 3.",
  "Find the first wave where a solo laner reaches Level 4.",
  "Find the first wave where a duo laner reaches Level 4.",
  "Find the first wave where a solo laner reaches Level 5.",
  "Find the first wave where a duo laner reaches Level 5.",
  "Find the first wave where a solo laner reaches Level 6.",
  "Find the first wave where a duo laner reaches Level 6.",
  "Find the first cannon wave where a duo laner is at least Level 3.",
  "Find the first cannon wave where a solo laner is at least Level 5.",
] as const;

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x650", width: 1366, height: 650 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "640x900", width: 640, height: 900 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
] as const;

for (const vp of VIEWPORTS) {
  test(`every objective fits its block at ${vp.name}`, async ({ browser }) => {
    const phone = vp.width < 640;
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, isMobile: phone, hasTouch: phone,
    });
    const page = await context.newPage();
    await page.goto("/dev/ranked-shell-probe?q=scrub&frame=0&bot=1&lol=1");
    await page.waitForSelector('[data-testid="chronoscope-prompt"]', { timeout: 60_000 });
    await page.waitForTimeout(600);

    const rows = await page.evaluate((texts) => texts.map((text) => {
      const prompt = document.querySelector('[data-testid="chronoscope-prompt"]') as HTMLElement;
      const eyebrow = document.querySelector('[data-testid="chronoscope-eyebrow"]') as HTMLElement;
      const block = document.querySelector('[data-testid="chronoscope-objective"]') as HTMLElement;
      prompt.textContent = text;
      const range = document.createRange();
      range.selectNodeContents(prompt);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const clamp = parseInt(getComputedStyle(prompt).webkitLineClamp || "0", 10) || 99;
      const lineHeight = parseFloat(getComputedStyle(prompt).lineHeight);
      const needed = eyebrow.getBoundingClientRect().height + lines * lineHeight;
      return { text, lines, clamp, needed, block: block.getBoundingClientRect().height };
    }), [...OBJECTIVES]);

    for (const r of rows) {
      expect(r.lines, `${r.text} needs ${r.lines} lines, the clamp shows ${r.clamp}`).toBeLessThanOrEqual(r.clamp);
      expect(r.needed, `${r.text}: eyebrow + ${r.lines} line(s) need ${r.needed}px, the block is ${r.block}px`)
        .toBeLessThanOrEqual(r.block + 0.5);
    }
    await context.close();
  });
}
