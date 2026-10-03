// Landing entrance vs auto-start: per-frame title / hint / façade / Mogzy opacity.
// usage: node landing-anim.cjs <baseUrl> <label>
const { chromium } = require("playwright") // run from the repo root;
const fs = require("fs");
const path = require("path");
const BASE = process.argv[2];
const LABEL = process.argv[3];
const OUT = path.join(process.env.OUT_DIR || __dirname, "results", "anim-" + LABEL);
fs.mkdirSync(OUT, { recursive: true });

const PROBE = `
(() => {
  const F = (window.__frames = []);
  const t0 = { v: null };
  const tick = () => {
    const main = document.querySelector('[data-testid="mogzy-entry-v2"]');
    if (main) {
      if (t0.v === null) t0.v = performance.now();
      const h1 = main.querySelector("h1");
      const title = h1 && h1.parentElement;
      const hint = [...main.querySelectorAll("p")].find((p) => /opening the academy|tap to enter/i.test(p.textContent));
      const facade = main.querySelector('[data-testid="academy-facade"]')?.parentElement;
      const img = main.querySelector("img[data-mogzy-art-name]");
      F.push({
        t: Math.round(performance.now() - t0.v),
        title: title ? +getComputedStyle(title).opacity : null,
        hint: hint ? +getComputedStyle(hint).opacity : null,
        facade: facade ? +getComputedStyle(facade).opacity : null,
        mogzy: img && img.complete && img.naturalWidth > 0 ? 1 : 0,
        entering: main.getAttribute("data-entering") === "true",
      });
    }
    if (location.pathname === "/") requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

(async () => {
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  const rows = [];
  for (const [name, vp, reduced] of [
    ["1440x900", { width: 1440, height: 900 }, false],
    ["390x844", { width: 390, height: 844 }, false],
    ["1440x900-rm", { width: 1440, height: 900 }, true],
  ]) {
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: reduced ? "reduce" : "no-preference" });
    // Prime the cache so the animation, not the network, is what is observed.
    const prime = await ctx.newPage();
    await prime.goto(BASE + "/");
    await prime.waitForURL("**/lol", { timeout: 20000 });
    await prime.close();
    const page = await ctx.newPage();
    await page.addInitScript(PROBE);
    await page.goto(BASE + "/", { waitUntil: "commit" });
    // Filmstrip, at the hand-off-relevant moments.
    await page.waitForSelector('[data-testid="mogzy-entry-v2"]');
    const start = Date.now();
    for (const at of [400, 800, 1050, 1250, 1600, 1800]) {
      const wait = at - (Date.now() - start);
      if (wait > 0) await page.waitForTimeout(wait);
      if (new URL(page.url()).pathname !== "/") break;
      await page.screenshot({ path: path.join(OUT, `${name}-${at}ms.png`) }).catch(() => {});
    }
    await page.waitForURL("**/lol", { timeout: 20000 });
    const frames = await page.evaluate(() => window.__frames);
    const autoStart = frames.find((f) => f.entering);
    const before = frames.filter((f) => !f.entering);
    const last = before[before.length - 1] || {};
    const firstFull = (k) => (frames.find((f) => f[k] !== null && f[k] >= 0.99) || {}).t ?? null;
    rows.push({
      name,
      autoStartAt: autoStart?.t ?? null,
      titleFullAt: firstFull("title"),
      titleAtAutoStart: last.title,
      hintFullAt: firstFull("hint"),
      hintAtAutoStart: last.hint,
      facadeAtAutoStart: last.facade,
      mogzyAt: (frames.find((f) => f.mogzy) || {}).t ?? null,
    });
    fs.writeFileSync(path.join(OUT, `${name}-frames.json`), JSON.stringify(frames));
    await ctx.close();
  }
  console.table(rows);
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(rows, null, 1));
  await browser.close();
})();
