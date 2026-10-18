/**
 * ACADEMY STARTUP — measure the Landing (/) -> /lol journey (or a direct /lol
 * visit) against a production build served by serve.mjs.
 *
 *   node scripts/academy-startup/run.mjs '<scenario json>'
 *
 * Scenario fields (defaults in brackets):
 *   label           output name (required)
 *   base            server origin [$ACADEMY_PERF_BASE or https://127.0.0.1:4418]
 *   browser         msedge | chromium | firefox [msedge]
 *   headless        [false] — frame timings need a real, FOREGROUND window
 *   w, h, dpr       viewport [1366, 768, 1]; mobile: true adds Chromium device emulation
 *   path            "/" (the Landing journey) | "/lol" (a direct visit) ["/"]
 *   cache           cold      a fresh browser profile (cold HTTP and GPU caches)
 *                   warmgpu   a new context in a browser that already rendered the
 *                             scene (cold HTTP cache, warm GPU process) — the
 *                             realistic first visit by an established browser
 *                   warm      the same context's second visit
 *   net             none | 4g (9 Mbps / 85 ms) | slow4g (1.6 Mbps / 150 ms) — Chromium only
 *   cpu             CPU throttle factor (Chromium only) [1]
 *   reduced         prefers-reduced-motion: reduce [false]
 *   cores           override navigator.hardwareConcurrency (the Orrery's lite hint)
 *   css             extra stylesheet injected at DOMContentLoaded (attribution experiments)
 *   veil            {maxMs, smooth, opaque} — prototype a held veil (see instrument.js)
 *   reps, ms        repetitions [3]; ms observed after the Orrery mounts [6000]
 *   trace           write a Chromium performance trace per rep
 *   filmstrip       save CDP screencast frames per rep
 *   out             output directory [test-results/academy-startup]
 *
 * One JSON file per scenario in `out`; summarise with report.mjs. Runs whose
 * window was background-throttled (< 100 animation frames) are reported as
 * invalid — headed Firefox windows are prone to it.
 */
import { chromium, firefox } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const S = {
  browser: "msedge", headless: false, w: 1366, h: 768, dpr: 1, path: "/", cache: "cold", net: "none", cpu: 1,
  reps: 3, ms: 6000, out: "test-results/academy-startup",
  base: process.env.ACADEMY_PERF_BASE ?? "https://127.0.0.1:4418",
  ...JSON.parse(process.argv[2] ?? "{}"),
};
if (!S.label) throw new Error("scenario needs a label");
S.out = resolve(S.out);
const PROBE = readFileSync(join(HERE, "instrument.js"), "utf8");
const NET = {
  "4g": { offline: false, latency: 85, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  slow4g: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
};
const chromiumBased = S.browser !== "firefox";

async function measureOnce(browser, ctx, rep, warmup) {
  const page = await ctx.newPage();
  await page.bringToFront().catch(() => {});
  const priority = {};
  const shots = [];
  let cdp = null;
  if (chromiumBased) {
    cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    cdp.on("Network.requestWillBeSent", (e) => { priority[e.request.url] ??= e.request.initialPriority; });
    if (S.net !== "none") await cdp.send("Network.emulateNetworkConditions", NET[S.net]);
    if (S.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: S.cpu });
    if (S.filmstrip && !warmup) {
      cdp.on("Page.screencastFrame", async (f) => {
        shots.push({ ts: f.metadata.timestamp, data: f.data });
        await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: S.w, maxHeight: S.h, everyNthFrame: 1 });
    }
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 160)}`); });
  const tracing = Boolean(S.trace && !warmup && chromiumBased);
  if (tracing) {
    await browser.startTracing(page, {
      path: join(S.out, `${S.label}-r${rep}-trace.json`),
      categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame",
        "blink", "cc", "gpu", "v8.execute", "loading", "toplevel", "blink.user_timing"],
    });
  }
  const started = Date.now();
  await page.goto(S.base + S.path + (S.query ?? ""), { waitUntil: "commit", timeout: 120_000 });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => ({ root: window.__acs?.cond.root ?? null, now: performance.now() })).catch(() => null);
    if (st && st.root != null && st.now > st.root + S.ms) break;
    await page.waitForTimeout(250);
  }
  const data = await page.evaluate(() => ({
    A: window.__acs,
    res: performance.getEntriesByType("resource").map((r) => ({
      n: r.name, it: r.initiatorType, s: Math.round(r.startTime), e: Math.round(r.responseEnd),
      ts: r.transferSize, eb: r.encodedBodySize,
    })),
    ua: navigator.userAgent, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight, hc: navigator.hardwareConcurrency,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, timeOrigin: performance.timeOrigin,
  }));
  if (tracing) await browser.stopTracing();
  if (cdp && S.filmstrip && !warmup) await cdp.send("Page.stopScreencast").catch(() => {});
  Object.assign(data, { priority, errors, wallMs: Date.now() - started, rep });
  if (shots.length) {
    const dir = join(S.out, `${S.label}-r${rep}-film`);
    mkdirSync(dir, { recursive: true });
    for (const s of shots) {
      const t = Math.round(s.ts * 1000 - data.timeOrigin);
      writeFileSync(join(dir, `${String(t).padStart(6, "0")}.jpg`), Buffer.from(s.data, "base64"));
    }
  }
  await page.close();
  return data;
}

const type = chromiumBased ? chromium : firefox;
const launch = { headless: Boolean(S.headless), args: [] };
if (S.browser === "msedge") launch.channel = "msedge";
if (chromiumBased) launch.args.push("--ignore-certificate-errors", "--autoplay-policy=user-gesture-required");

mkdirSync(S.out, { recursive: true });
const results = [];
for (let rep = 0; rep < S.reps; rep++) {
  const browser = await type.launch(launch);
  try {
    const ctxOpts = {
      viewport: { width: S.w, height: S.h }, deviceScaleFactor: S.dpr, ignoreHTTPSErrors: true,
      reducedMotion: S.reduced ? "reduce" : "no-preference",
    };
    if (S.mobile && chromiumBased) {
      Object.assign(ctxOpts, {
        isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
      });
    }
    const makeContext = async () => {
      const c = await browser.newContext(ctxOpts);
      if (S.veil) await c.addInitScript({ content: `window.__ACS_VEIL = ${JSON.stringify(S.veil)};` });
      await c.addInitScript({ content: PROBE });
      if (S.css) {
        await c.addInitScript({ content: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(S.css)};document.head.appendChild(s);});` });
      }
      if (S.cores) await c.addInitScript({ content: `Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get:()=>${Number(S.cores)}});` });
      return c;
    };
    if (S.cache === "warmgpu") {
      const throwaway = await makeContext();
      await measureOnce(browser, throwaway, rep, true);
      await throwaway.close();
    }
    const ctx = await makeContext();
    if (S.cache === "warm") await measureOnce(browser, ctx, rep, true);
    const d = await measureOnce(browser, ctx, rep, false);
    results.push(d);
    console.error(`[${S.label}] rep ${rep}: mount=${d.A?.cond.root} complete=${d.A?.cond.visuallyComplete} frames=${d.A?.frames.length} errors=${d.errors.length}`);
    await ctx.close();
  } catch (err) {
    console.error(`[${S.label}] rep ${rep} FAILED ${err}`);
    results.push({ rep, failed: String(err) });
  } finally {
    await browser.close().catch(() => {});
  }
}
writeFileSync(join(S.out, `${S.label}.json`), JSON.stringify({ scenario: S, results }));
console.error(`[${S.label}] wrote ${join(S.out, `${S.label}.json`)}`);
