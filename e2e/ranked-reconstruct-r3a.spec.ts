/**
 * RECONSTRUCT R3A — THE REVEALED BREAKDOWN, MEASURED IN A REAL BROWSER.
 *
 * R2 shipped a revealed board that read fine in the light app theme and was
 * unreadable in the dark one (a theme card colour under the parchment's fixed
 * ink, 1.5-3.0:1), truncated names on a four-part build, and parked the closing
 * equation ~110px under its last part. jsdom cannot see any of it (no layout, no
 * cascade), so this spec measures the rendered board:
 *
 *   * CONTRAST  - every text node in the breakdown, the verdict and the status
 *                 line, foreground composited over the backgrounds actually
 *                 painted behind it (a chain of opaque / translucent CSS
 *                 colours; the breakdown has no gradients or images), in BOTH
 *                 app themes. Floor 4.5:1.
 *   * READING   - no ellipsis and no line-clamp anywhere in the breakdown.
 *   * ONE SUM   - the equation sits directly under the last part (<= 12px)
 *                 and inside the stage region; the list only scrolls on the
 *                 shortest phone with a four-part build, and then the
 *                 equation is still pinned inside the region.
 *   * FIXED     - the region, the sockets and the status line are the same
 *                 boxes with and without the breakdown.
 *
 * Runs against `/dev/ranked-shell-probe`, which mounts the production
 * `QuizRankedMatch` on the server-shaped Reconstruct fixtures. The host timing
 * and the three-round match are measured by the real-backend driver in
 * `e2e/r3a-real-backend/` (needs a local backend), not here.
 *
 *   npx playwright test -c playwright.arena.config.ts ranked-reconstruct-r3a
 */
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
] as const;

/** Two-, three- and four-part builds; repeated parts; one and two sub-parts. */
const CASES = [
  { rc: "fourSlot", mode: "wrong", parts: 4 },
  { rc: "stormrazor", mode: "wrong", parts: 3 },
  { rc: "witsEnd", mode: "right", parts: 2 },
] as const;

/** Text contrast floor (WCAG 1.4.3, normal size). */
const CONTRAST_FLOOR = 4.5;
/** The equation may sit this far under the last part. */
const MAX_GAP_PX = 12;
/** A list may overflow (scroll) only on the shortest phone's four-part build. */
const MAX_LIST_OVERFLOW: Record<string, number> = { "360x640": 30 };

interface TextBox { text: string; group: string; fg: number[]; fgA: number; box: number[] }
interface Measure {
  parts: number;
  texts: TextBox[];
  ellipsised: string[];
  clamped: string[];
  gap: number | null;
  listOverflow: number;
  eqInsideRegion: boolean;
  evidenceInsideRegion: boolean;
  horizontalOverflow: number;
  scrollsFlag: string | null;
  regionBox: number[];
  boxes: Record<string, number[]>;
}

/** Runs in the page. */
function measure(): Measure {
  const parse = (css: string) => {
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return { rgb: [0, 0, 0], a: 0 };
    const p = m[1].split(/[ ,/]+/).map(Number);
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  const q = (s: string) => document.querySelector(s);
  const box = (el: Element | null) => {
    if (!el) return [0, 0, 0, 0];
    const b = el.getBoundingClientRect();
    return [Math.round(b.top * 10) / 10, Math.round(b.left * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10];
  };

  const roots = ["reconstruct-evidence", "reconstruct-verdict", "reconstruct-hint"]
    .map((id) => q(`[data-testid="${id}"]`)).filter(Boolean) as Element[];
  const texts: Measure["texts"] = [];
  for (const root of roots) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const text = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!text || !el || el.closest(".sr-only") || el.closest("[class*='bg-[#0b1727]']")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const fg = parse(cs.color);
      texts.push({ text: text.slice(0, 32), group: root.getAttribute("data-testid") ?? "",
        fg: fg.rgb, fgA: fg.a, box: [r.left, r.top, r.width, r.height] });
    }
  }

  const ev = q('[data-testid="reconstruct-evidence"]');
  const list = q('[data-part="breakdown"]') as HTMLElement | null;
  const eq = q('[data-testid="reconstruct-evidence-total"]');
  const region = q('[data-testid="reconstruct-tray-box"]');
  const rows = [...document.querySelectorAll('[data-part="breakdown-part"]')];
  const ellipsised: string[] = [];
  const clamped: string[] = [];
  for (const el of ev ? ev.querySelectorAll("*") : []) {
    const cs = getComputedStyle(el);
    const cut = cs.textOverflow === "ellipsis" || cs.getPropertyValue("-webkit-line-clamp") !== "none"
      && cs.getPropertyValue("-webkit-line-clamp") !== "";
    if (cut) clamped.push((el.textContent ?? "").trim().slice(0, 30));
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "visible" && el !== list) {
      ellipsised.push((el.textContent ?? "").trim().slice(0, 30));
    }
  }
  const lastBottom = Math.max(...rows.map((r) => r.getBoundingClientRect().bottom));
  const eqB = eq?.getBoundingClientRect();
  const regB = region?.getBoundingClientRect();
  const evB = ev?.getBoundingClientRect();
  return {
    parts: rows.length, texts, ellipsised, clamped,
    gap: eqB ? Math.round((eqB.top - lastBottom) * 10) / 10 : null,
    listOverflow: list ? list.scrollHeight - list.clientHeight : 0,
    eqInsideRegion: !!(eqB && regB && eqB.top >= regB.top - 0.5 && eqB.bottom <= regB.bottom + 0.5),
    evidenceInsideRegion: !!(evB && regB && evB.top >= regB.top - 0.5 && evB.bottom <= regB.bottom + 0.5),
    horizontalOverflow: ev ? ev.scrollWidth - ev.clientWidth : 0,
    scrollsFlag: list?.getAttribute("data-scrolls") ?? null,
    regionBox: box(region),
    boxes: {
      target: box(q('[data-testid="reconstruct-target"]')),
      sockets: box(q('[data-testid="reconstruct-sockets"]')),
      status: box(q('[data-testid="reconstruct-hint"],[data-testid="reconstruct-verdict"]')),
      region: box(region),
    },
  };
}

/**
 * WCAG contrast of each text box against the pixels ACTUALLY painted behind it:
 * the text is made transparent, the page is screenshotted, and the median
 * colour of each text box is the backdrop (cards, chips and the folio's
 * gradient all included). The foreground is its computed colour composited on
 * that backdrop.
 */
async function scoreContrast(page: Page, texts: TextBox[]) {
  await page.addStyleTag({ content: "*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}" });
  const png = (await page.screenshot({ type: "png" })).toString("base64");
  const scored = await page.evaluate(async ({ png, texts }) => {
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
      const x1 = Math.min(cv.width, Math.ceil(x + w)), y1 = Math.min(cv.height, Math.ceil(y + h));
      const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
      const ch: number[][] = [[], [], []];
      for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
      const bg = ch.map((a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)]);
      const fg = t.fg.map((c, i) => c * t.fgA + bg[i] * (1 - t.fgA));
      const a = lum(fg), b = lum(bg);
      return { text: t.text, group: t.group,
        ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 };
    });
  }, { png, texts });
  return scored;
}

async function openRevealed(page: Page, rc: string, mode: string) {
  await page.goto(`/dev/ranked-shell-probe?q=reconstruct&rc=${rc}&recon=${mode}&lead=1`);
  await page.addStyleTag({ content: 'div:has(> [data-testid="probe-metareflex"]) { display: none !important; }' });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="mig-reconstruct"]')?.getAttribute("data-reveal-stage") === "done",
    null, { timeout: 30_000 });
  await page.waitForTimeout(250);
}

for (const scheme of ["dark", "light"] as const) {
  for (const vp of VIEWPORTS) {
    for (const c of CASES) {
      test(`${scheme} ${vp.name} ${c.rc} (${c.parts} parts, ${c.mode}): readable, uncut, one connected sum`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce", colorScheme: scheme,
          isMobile: vp.width < 640, hasTouch: vp.width < 640,
        });
        const page = await context.newPage();
        await openRevealed(page, c.rc, c.mode);
        const m = await page.evaluate(measure);
        expect(m.parts).toBe(c.parts);

        // CONTRAST, in whichever app theme the player runs.
        const contrast = await scoreContrast(page, m.texts);
        const weak = contrast.filter((x) => x.ratio < CONTRAST_FLOOR);
        expect(contrast.length).toBeGreaterThan(8);
        expect(weak, `below ${CONTRAST_FLOOR}:1 -> ${JSON.stringify(weak.slice(0, 5))}`).toEqual([]);

        // READING: whole words, no ellipsis, no clamp.
        expect(m.clamped, "clamped/ellipsised text").toEqual([]);
        expect(m.ellipsised, "text wider than its box").toEqual([]);
        expect(m.horizontalOverflow).toBeLessThanOrEqual(0);

        // ONE SUM: the equation follows the last part, inside the region.
        expect(m.evidenceInsideRegion).toBe(true);
        expect(m.eqInsideRegion).toBe(true);
        const allowed = MAX_LIST_OVERFLOW[vp.name] ?? 0;
        expect(m.listOverflow).toBeLessThanOrEqual(allowed);
        if (m.listOverflow <= 0) {
          expect(m.gap).not.toBeNull();
          expect(m.gap as number).toBeLessThanOrEqual(MAX_GAP_PX);
          expect(m.gap as number).toBeGreaterThanOrEqual(0);
        } else {
          // A scroller must be reachable without a pointer.
          expect(m.scrollsFlag).toBe("true");
        }
        await context.close();
      });
    }
  }
}

test("the fixed boxes are the same with and without the breakdown (1440x900, both themes)", async ({ browser }) => {
  for (const scheme of ["dark", "light"] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", colorScheme: scheme });
    const page = await context.newPage();
    await page.goto("/dev/ranked-shell-probe?q=reconstruct&rc=fourSlot&recon=locked&lead=1");
    await page.addStyleTag({ content: 'div:has(> [data-testid="probe-metareflex"]) { display: none !important; }' });
    await page.waitForSelector('[data-testid="reconstruct-suspense"]', { timeout: 30_000 });
    const locked = await page.evaluate(measure);
    await openRevealed(page, "fourSlot", "wrong");
    const revealed = await page.evaluate(measure);
    for (const k of ["target", "sockets", "region"] as const) {
      expect(revealed.boxes[k], `${k} (${scheme})`).toEqual(locked.boxes[k]);
    }
    await context.close();
  }
});
