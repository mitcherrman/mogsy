/**
 * RECONSTRUCT-R3C — FOUR SHARED-ARENA DEFECTS, MEASURED IN A REAL BROWSER.
 *
 * R3A and R3B measured them live; jsdom cannot see any of them (no layout, no
 * cascade, no painted pixels). Every case drives the production arena through
 * `/dev/ranked-shell-probe`, so a vite server is the only dependency.
 *
 *   A. HEADER  — the strip keeps ONE height through every centre face, the
 *                match-complete outro included (it fell 78 -> 68 px, 90 -> 68
 *                at >= 1500px, whenever the centre showed the transition note).
 *   B. INK     — every text run on the rails, the header plate and the phone
 *                match bar reads at >= 4.5:1 (3:1 large) on the pixels painted
 *                behind it, in BOTH app themes (light measured 1.0-1.1:1).
 *   C. FIT     — at 1280x600 the arena grid row's content fits its box (the
 *                rails ran 30-60 px out of it).
 *   D. OUTRO   — on a phone the beat layer is the shell's VISIBLE box: equal
 *                to the shell when the arena fits one screen, never below the
 *                fold when it cannot (360x640 ran 82 px below), with the result
 *                and the score on screen.
 *   E. END     — the phone end screen has no horizontal overflow (its frame's
 *                glow bled 4 px, so phones zoomed the result out to 394 px).
 *
 *   npx playwright test -c playwright.arena.config.ts ranked-arena-r3c
 */
import { expect, test, type Page } from "@playwright/test";

async function endLive(page: Page, sample?: () => Promise<void>, until: "end" | "outro" = "end") {
  const advance = page.getByTestId("probe-sfx-advance");
  for (let step = 0; step < 5; step += 1) {
    // The probe's own control (not arena UI); at short heights it can sit
    // under the arena, so it is driven directly rather than by a pointer.
    await advance.dispatchEvent("click");
    if (step < 4) {
      for (let t = 0; t < 2200; t += 100) { await sample?.(); await page.waitForTimeout(100); }
    }
  }
  for (let t = 0; t < 3000; t += 50) {
    await sample?.();
    if (await page.getByTestId(until === "end" ? "ranked-match-over" : "ranked-match-outro").count()) break;
    await page.waitForTimeout(50);
  }
}

// ── A. HEADER ────────────────────────────────────────────────────────────
for (const vp of [{ w: 1440, h: 900 }, { w: 1600, h: 900 }, { w: 1280, h: 600 }]) {
  test(`A: the header keeps one height through every face, outro included, at ${vp.w}x${vp.h}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dev/ranked-shell-probe?sfx=1");
    await page.getByTestId("ranked-header").waitFor();
    const seen: { h: number; face: string; board: number | null }[] = [];
    const sample = async () => {
      const s = await page.evaluate(() => {
        const hdr = document.querySelector('[data-testid="ranked-header"]');
        if (!hdr) return null;
        const face = document.querySelector('[data-testid="timer-display"]')?.getAttribute("data-stage")
          ?? (document.querySelector('[data-testid="ranked-round-transition"]') ? "transition" : "none");
        const board = document.querySelector('[data-testid="ranked-question"]')?.getBoundingClientRect().top ?? null;
        return { h: hdr.getBoundingClientRect().height, face, board };
      });
      if (s) seen.push(s);
    };
    await endLive(page, sample);
    const faces = new Set(seen.map((s) => s.face));
    // The outro's transition face must actually have been sampled.
    expect([...faces]).toContain("transition");
    const heights = seen.map((s) => s.h);
    expect(Math.max(...heights) - Math.min(...heights), JSON.stringify([...faces])).toBeLessThanOrEqual(0.5);
    const boards = seen.map((s) => s.board).filter((b): b is number => b !== null);
    expect(Math.max(...boards) - Math.min(...boards)).toBeLessThanOrEqual(0.5);
  });
}

// ── B. INK ───────────────────────────────────────────────────────────────
const INK_GROUPS = {
  railL: ".ranked-arena-grid > div:nth-child(1)",
  railR: ".ranked-arena-grid > div:nth-child(2)",
  header: '[data-testid="ranked-header"]',
  matchbar: '[data-testid="ranked-mobile-matchbar"]',
};

async function scoreInk(page: Page) {
  const texts = await page.evaluate((groups) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      const p = m ? m[1].split(/[ ,/]+/).filter(Boolean).map(Number) : [0, 0, 0];
      return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const out: { group: string; text: string; fg: number[]; a: number; large: boolean; box: number[] }[] = [];
    for (const [group, sel] of Object.entries(groups)) {
      const root = document.querySelector(sel);
      if (!root) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? "").trim();
        const el = n.parentElement;
        if (!text || !el || el.closest(".sr-only")) continue;
        let alpha = 1, hidden = false;
        for (let e: Element | null = el; e; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (s.display === "none" || s.visibility === "hidden") { hidden = true; break; }
          alpha *= Number(s.opacity);
        }
        if (hidden || alpha < 0.05) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        const px = parseFloat(cs.fontSize);
        out.push({ group, text: text.slice(0, 30), fg: fg.rgb, a: fg.a * alpha,
          large: px >= 24 || (Number(cs.fontWeight) >= 700 && px >= 18.66), box: [r.left, r.top, r.width, r.height] });
      }
    }
    return out;
  }, INK_GROUPS);
  await page.addStyleTag({ content: "*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}" });
  await page.waitForTimeout(100);
  const png = (await page.screenshot({ type: "png" })).toString("base64");
  return page.evaluate(async ({ png, texts }) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const cv = document.createElement("canvas");
    cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    return texts.map((t) => {
      const [x, y, w, h] = t.box;
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
      const d = ctx.getImageData(x0, y0, Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))).data;
      const ch: number[][] = [[], [], []];
      for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
      const bg = ch.map((a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)]);
      const fg = t.fg.map((c, i) => c * t.a + bg[i] * (1 - t.a));
      const a = lum(fg), b = lum(bg);
      return { ...t, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), floor: t.large ? 3 : 4.5 };
    });
  }, { png, texts });
}

for (const scheme of ["light", "dark"] as const) {
  for (const vp of [{ w: 1440, h: 900 }, { w: 1280, h: 600 }, { w: 390, h: 844 }]) {
    test(`B: rail, header and match-bar ink is readable in the ${scheme} theme at ${vp.w}x${vp.h}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h },
        colorScheme: scheme, reducedMotion: "reduce", isMobile: vp.w < 640, hasTouch: vp.w < 640 });
      const page = await context.newPage();
      await page.goto("/dev/ranked-shell-probe?q=reconstruct&recon=open");
      await page.getByTestId("ranked-match").waitFor();
      await page.waitForTimeout(1200);
      // The first-visit rules panel is not a rail: dismiss it as a player would.
      const gotIt = page.getByRole("button", { name: /got it/i });
      if (await gotIt.count()) { await gotIt.first().click(); await page.waitForTimeout(300); }
      const scored = await scoreInk(page);
      expect(scored.length).toBeGreaterThan(6);
      const weak = scored.filter((s) => s.ratio < s.floor)
        .map((s) => `${s.group} "${s.text}" ${s.ratio.toFixed(2)}:1`);
      expect(weak).toEqual([]);
      await context.close();
    });
  }
}

// ── C. FIT ───────────────────────────────────────────────────────────────
for (const q of ["q=reconstruct&recon=open", "sfx=1&points=1"]) {
  test(`C: at 1280x600 the arena grid's content fits its box (${q})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/dev/ranked-shell-probe?${q}`);
    await page.locator(".ranked-arena-grid").waitFor();
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const g = document.querySelector(".ranked-arena-grid") as HTMLElement;
      const kids = [...g.children].map((k) => (k as HTMLElement).scrollHeight - (k as HTMLElement).clientHeight);
      return { grid: g.scrollHeight - g.clientHeight, kids, doc: document.documentElement.scrollHeight - innerHeight };
    });
    expect(m.grid).toBeLessThanOrEqual(0);
    for (const k of m.kids) expect(k).toBeLessThanOrEqual(0);
    expect(m.doc).toBeLessThanOrEqual(0);
  });
}

// ── D. OUTRO ─────────────────────────────────────────────────────────────
for (const vp of [{ w: 360, h: 640, extra: "" }, { w: 390, h: 844, extra: "" }, { w: 390, h: 844, extra: "&frame=0" }]) {
  test(`D: the phone outro is the shell's visible box at ${vp.w}x${vp.h}${vp.extra}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h },
      reducedMotion: "reduce", isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(`/dev/ranked-shell-probe?sfx=1${vp.extra}`);
    await page.getByTestId("ranked-match").waitFor();
    await endLive(page, undefined, "outro");
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const box = (s: string) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
      return { vh: innerHeight, shell: box('[data-testid="ranked-match"]'), layer: box('[data-testid="ranked-warning-layer"]'),
        result: box('[data-testid="match-outro-result"]'), score: box('[data-testid="match-outro-score"]') };
    });
    test.skip(!m.layer, "the outro had already handed over to the end screen");
    const visibleBottom = Math.min(m.shell!.bottom, m.vh);
    const visibleTop = Math.max(m.shell!.top, 0);
    expect(Math.abs(m.layer!.top - visibleTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.layer!.bottom - visibleBottom)).toBeLessThanOrEqual(1);
    expect(m.layer!.bottom).toBeLessThanOrEqual(m.vh + 0.5);
    for (const r of [m.result!, m.score!]) {
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.bottom).toBeLessThanOrEqual(m.vh);
    }
    await context.close();
  });
}

// ── E. END SCREEN (found while measuring D) ──────────────────────────────
for (const vp of [{ w: 360, h: 640 }, { w: 390, h: 844 }]) {
  test(`E: the phone end screen has no horizontal overflow (no zoom-out) at ${vp.w}x${vp.h}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h },
      reducedMotion: "reduce", isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto("/dev/ranked-shell-probe?sfx=1");
    await page.getByTestId("ranked-match").waitFor();
    await endLive(page);
    await page.getByTestId("ranked-match-over").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({ iw: innerWidth, cw: document.documentElement.clientWidth,
      sw: document.documentElement.scrollWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.iw).toBe(vp.w);
    await context.close();
  });
}
