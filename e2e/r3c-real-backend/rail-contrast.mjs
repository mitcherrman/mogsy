// DEV ONLY (RECONSTRUCT-R3C). WCAG contrast of every text run in the arena's RAILS and HEADER,
// measured on the pixels actually painted behind it (R3A's method: text made transparent,
// screenshot, median backdrop per text box, computed foreground composited over it).
//
//   RC_FRONTEND_URL=http://localhost:8151 node e2e/r3c-real-backend/rail-contrast.mjs <out.json> [probe query]
//
// Uses the dev shell probe (production QuizRankedMatch on server-shaped fixtures), so it needs
// only a vite server. Reports every run below its floor: 4.5:1, or 3:1 for large text
// (>= 24px, or >= 18.66px bold).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.RC_FE_PACKAGE ?? path.join(HERE, "../../package.json"));
const { chromium } = require("playwright-core");
const BASE = process.env.RC_FRONTEND_URL ?? "http://localhost:8151";
const OUT = process.argv[2] ?? "rail-contrast.json";
const QUERY = process.argv[3] ?? "q=reconstruct&rc=dusk&recon=open";
const VIEWPORTS = [[1440, 900], [1280, 600], [1600, 900], [390, 844]];
const GROUPS = {
  railL: ".ranked-arena-grid > div:nth-child(1)",
  railR: ".ranked-arena-grid > div:nth-child(2)",
  header: '[data-testid="ranked-header"]',
  mobileBar: '[data-testid="ranked-mobile-matchbar"]',
};

async function collect(page) {
  return page.evaluate((groups) => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return { rgb: [0, 0, 0], a: 1 };
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const out = [];
    for (const [group, sel] of Object.entries(groups)) {
      const root = document.querySelector(sel);
      if (!root) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? "").trim();
        const el = n.parentElement;
        if (!text || !el) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || Number(cs.opacity) === 0 || cs.display === "none") continue;
        let hidden = false;
        for (let e = el; e; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) { hidden = true; break; }
          if (e.getAttribute("aria-hidden") === "true" && e.classList.contains("sr-only")) { hidden = true; break; }
        }
        if (hidden || el.closest(".sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
        const fg = parse(cs.color);
        // Opacity of the element chain multiplies the text's alpha.
        let op = 1;
        for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
        const px = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        out.push({ group, text: text.slice(0, 40), fg: fg.rgb, fgA: fg.a * op, px, bold,
          large: px >= 24 || (bold && px >= 18.66), tid: el.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
          cls: (el.className && typeof el.className === "string" ? el.className : "").slice(0, 120),
          box: [r.left, r.top, r.width, r.height] });
      }
    }
    return out;
  }, GROUPS);
}

async function score(page, texts) {
  await page.addStyleTag({ content: "*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}" });
  await page.waitForTimeout(100);
  const png = (await page.screenshot({ type: "png" })).toString("base64");
  return page.evaluate(async ({ png, texts }) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const cv = document.createElement("canvas");
    cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    return texts.map((t) => {
      const [x, y, w, h] = t.box;
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(cv.width, Math.ceil(x + w)), y1 = Math.min(cv.height, Math.ceil(y + h));
      const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
      const ch = [[], [], []];
      for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
      const bg = ch.map((a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)]);
      const fg = t.fg.map((c, i) => c * t.fgA + bg[i] * (1 - t.fgA));
      const a = lum(fg), b = lum(bg);
      const ratio = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
      return { ...t, bg, ratio, floor: t.large ? 3 : 4.5 };
    });
  }, { png, texts });
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.RC_PLAYWRIGHT_EXE ? { executablePath: process.env.RC_PLAYWRIGHT_EXE } : {}) });
const report = [];
for (const scheme of ["light", "dark"]) {
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/ranked-shell-probe?${QUERY}`);
    await page.waitForSelector('[data-testid="ranked-match"]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    // The first-visit rules popover covers the right rail; dismiss it as a player would.
    const got = page.getByRole("button", { name: /got it/i });
    if (await got.count()) { await got.first().click(); await page.waitForTimeout(400); }
    const html = await page.evaluate(() => document.documentElement.className);
    const scored = await score(page, await collect(page));
    const weak = scored.filter((s) => s.ratio < s.floor);
    report.push({ scheme, vp: `${w}x${h}`, html, n: scored.length,
      min: scored.length ? Math.min(...scored.map((s) => s.ratio)) : null, weak, all: scored });
    console.log(`${scheme} ${w}x${h} html="${html}" texts=${scored.length} min=${report.at(-1).min} weak=${weak.length}`);
    for (const x of weak.slice(0, 30)) {
      console.log(`   ${x.ratio}:1 (<${x.floor}) [${x.group}] "${x.text}" ${x.px}px fg=${x.fg}@${x.fgA.toFixed(2)} bg=${x.bg} tid=${x.tid}`);
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
