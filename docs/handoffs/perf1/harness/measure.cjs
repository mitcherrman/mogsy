// Cold/warm first-visit measurement for the Mogzy Academy journey.
// usage: node measure.cjs <baseUrl> <label> [scenarioFilter]
const { chromium } = require("playwright") // run from the repo root;
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://localhost:4180";
const LABEL = process.argv[3] || "baseline";
const FILTER = process.argv[4] || "";
const REPS = Number(process.env.REPS || 1);
const OUT = path.join(process.env.OUT_DIR || __dirname, "results", LABEL);
fs.mkdirSync(OUT, { recursive: true });

// 10 Mbps / 40 ms: reproduces the owner's "Mogzy absent ~2-3 s" on a 2.25 MB PNG.
const NET = { offline: false, latency: 40, downloadThroughput: (10e6) / 8, uploadThroughput: (5e6) / 8 };

const PROBE = `
(() => {
  const T = (window.__perf = { marks: {}, frames: 0, fallbackSeen: [], dest: null });
  const mark = (k) => { if (T.marks[k] === undefined) T.marks[k] = Math.round(performance.now()); };
  const ready = (img) => !!img && img.complete && img.naturalWidth > 0 && !(img.currentSrc || img.src).startsWith("data:");
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") mark("fcp"); }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((l) => { const es = l.getEntries(); const e = es[es.length - 1]; if (e) T.lcp = { t: Math.round(e.startTime), url: (e.url || "").split("/").pop(), path: location.pathname }; }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  document.addEventListener("click", () => { if (T.dest && T.dest.clickAt === undefined) T.dest.clickAt = Math.round(performance.now()); }, true);
  const tick = () => {
    T.frames++;
    const q = (s) => document.querySelector(s);
    const entry = q('[data-testid="mogzy-entry-v2"]');
    if (entry) {
      mark("landingMounted");
      if (ready(entry.querySelector("img[data-mogzy-art-name]"))) mark("landingMogzy");
      if (ready(entry.querySelector('[data-testid="academy-facade"] img'))) mark("landingSkyline");
      if (entry.getAttribute("data-entering") === "true") mark("autoStart");
    }
    if (location.pathname === "/lol") {
      mark("hubPath");
      if (q('[data-testid="academy-hall"]')) mark("hubMounted");
      if (ready(q('[data-testid="academy-library-background"]'))) mark("hubBg");
      const frames = [...document.querySelectorAll(".academy-hub-book-body > img")];
      if (frames.length && frames.every(ready) && frames[0].offsetParent) mark("hubFrame");
      const spines = [...document.querySelectorAll('[data-testid="mobile-academy-book-image"]')];
      if (spines.length && spines.every(ready) && spines[0].offsetParent) mark("hubSpine");
      const splashes = [...document.querySelectorAll(".academy-hub-book-body > div img")];
      if (splashes.length && splashes[0].offsetParent) { if (splashes.some(ready)) mark("hubSplashFirst"); if (splashes.length === 4 && splashes.every(ready)) mark("hubSplashAll"); }
      if (ready(q('[data-testid="mogzy-guide-hub"] img'))) mark("hubMogzy");
      const bb = q('img[data-testid="academy-broadcast-book"]');
      if (bb && bb.offsetParent && ready(bb)) mark("hubBroadcast");
    }
    if (T.dest && T.dest.clickAt !== undefined) {
      const d = T.dest;
      const fb = !!q('div.min-h-\\\\[50vh\\\\][aria-hidden]');
      if (location.pathname === d.to && d.pathAt === undefined) d.pathAt = Math.round(performance.now());
      if (d.pathAt !== undefined && fb && d.fallbackFrom === undefined) d.fallbackFrom = Math.round(performance.now());
      if (d.pathAt !== undefined && fb) { d.fallbackLast = Math.round(performance.now()); d.fallbackFrames = (d.fallbackFrames || 0) + 1; }
      if (d.pathAt !== undefined && !fb && !q('[data-testid="academy-hall"]') && d.contentAt === undefined) {
        const main = q("main") || document.body;
        if ((main.innerText || "").trim().length > 20) {
          d.contentAt = Math.round(performance.now());
          const vis = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(i).visibility !== "hidden"; });
          d.imgsAtContent = vis.length; d.pendingAtContent = vis.filter((i) => !ready(i)).map((i) => (i.currentSrc || i.src).split("/").pop().slice(0, 60));
        }
      }
      if (d.contentAt !== undefined && d.imagesSettledAt === undefined) {
        const vis = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight; });
        if (vis.every((i) => i.complete)) d.imagesSettledAt = Math.round(performance.now());
      }
      const lg = q('[data-testid="mogzy-guide-leaguecraft"] img');
      if (lg && d.lcGuideMounted === undefined) d.lcGuideMounted = Math.round(performance.now());
      if (ready(lg) && d.lcGuideMogzy === undefined) d.lcGuideMogzy = Math.round(performance.now());
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

const VIEWPORTS = {
  "1440x900": { width: 1440, height: 900 },
  "1366x768": { width: 1366, height: 768 },
  "1024x768": { width: 1024, height: 768 },
  "390x844": { width: 390, height: 844, mobile: true },
  "375x667": { width: 375, height: 667, mobile: true },
};
const DESTS = ["/quiz", "/combat-lab", "/lol/docs", "/lol/pro-play"];

async function journey(browser, ctx, { vp, dest, reduced, warm, entry = "/" }) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", NET);
  const reqs = new Map();
  let t0 = null;
  cdp.on("Network.requestWillBeSent", (e) => {
    if (t0 === null && e.type === "Document") t0 = e.timestamp;
    reqs.set(e.requestId, { url: e.request.url, type: e.type, prio: e.request.initialPriority, start: e.timestamp });
  });
  cdp.on("Network.responseReceived", (e) => { const r = reqs.get(e.requestId); if (r) { r.fromCache = e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromPrefetchCache; r.status = e.response.status; } });
  cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength; } });
  cdp.on("Network.requestServedFromCache", (e) => { const r = reqs.get(e.requestId); if (r) r.fromCache = true; });
  await page.addInitScript(PROBE);
  await page.goto(BASE + entry, { waitUntil: "commit" });
  if (dest) {
    // A visitor picks a book ~2.5 s after the Hub appears, whatever is still loading.
    await page.waitForFunction(() => window.__perf?.marks.hubMounted !== undefined, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(Number(process.env.DWELL || 2500));
  } else {
    // Hub reached and every critical Hub visual in (or 30 s).
    await page.waitForFunction(() => { const m = window.__perf?.marks || {}; return m.hubBg !== undefined && m.hubMogzy !== undefined && (m.hubSpine !== undefined || (m.hubFrame !== undefined && m.hubSplashAll !== undefined && m.hubBroadcast !== undefined)); }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  let destOut = null;
  if (dest) {
    await page.evaluate((to) => { window.__perf.dest = { to }; }, dest);
    const sel = vp.mobile ? `[data-testid="mobile-academy-book-stack"] a[href="${dest}"]` : `a.academy-hub-book[href="${dest}"]`;
    await page.locator(sel).first().click({ timeout: 5000 });
    await page.waitForFunction(() => window.__perf.dest.imagesSettledAt !== undefined, null, { timeout: 20000 }).catch(() => {});
    if (dest === "/quiz") await page.waitForFunction(() => window.__perf.dest.lcGuideMogzy !== undefined, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  const perf = await page.evaluate(() => window.__perf);
  destOut = perf.dest;
  const shot = path.join(OUT, `${entry === "/lol" ? "direct-" : ""}${vp.name}${reduced ? "-rm" : ""}${warm ? "-warm" : ""}${dest ? "-" + dest.replace(/\//g, "_") : ""}.png`);
  await page.screenshot({ path: shot }).catch(() => {});
  const requests = [...reqs.values()].filter((r) => t0 !== null).map((r) => ({
    url: r.url.replace(BASE, ""), type: r.type, prio: r.prio, fromCache: !!r.fromCache,
    start: Math.round((r.start - t0) * 1000), end: r.end ? Math.round((r.end - t0) * 1000) : null, bytes: r.bytes ?? null,
  }));
  await page.close();
  return { marks: perf.marks, lcp: perf.lcp, dest: destOut, requests };
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  const scenarios = [];
  for (const [name, v] of Object.entries(VIEWPORTS)) scenarios.push({ vp: { name, ...v }, dest: null, reduced: false });
  scenarios.push({ vp: { name: "1440x900", ...VIEWPORTS["1440x900"] }, dest: null, reduced: true });
  scenarios.push({ vp: { name: "390x844", ...VIEWPORTS["390x844"] }, dest: null, reduced: true });
  scenarios.push({ vp: { name: "1440x900", ...VIEWPORTS["1440x900"] }, dest: null, reduced: false, entry: "/lol" });
  scenarios.push({ vp: { name: "390x844", ...VIEWPORTS["390x844"] }, dest: null, reduced: false, entry: "/lol" });
  scenarios.push({ vp: { name: "1440x900", ...VIEWPORTS["1440x900"] }, dest: "/lol/docs", reduced: false, entry: "/lol" });
  for (const d of DESTS) {
    scenarios.push({ vp: { name: "1440x900", ...VIEWPORTS["1440x900"] }, dest: d, reduced: false });
    scenarios.push({ vp: { name: "390x844", ...VIEWPORTS["390x844"] }, dest: d, reduced: false });
  }
  const results = [];
  for (const s of scenarios) {
    const key = `${s.entry === "/lol" ? "direct/lol@" : ""}${s.vp.name}${s.reduced ? "-rm" : ""}${s.dest ? " " + s.dest : ""}`;
    if (FILTER && (process.env.EXACT ? key !== FILTER : !key.includes(FILTER))) continue;
    for (let rep = 0; rep < REPS; rep++) {
      const ctx = await browser.newContext({ viewport: { width: s.vp.width, height: s.vp.height }, reducedMotion: s.reduced ? "reduce" : "no-preference", hasTouch: !!s.vp.mobile });
      const cold = await journey(browser, ctx, { ...s, warm: false });
      const warm = await journey(browser, ctx, { ...s, warm: true });
      await ctx.close();
      results.push({ key, rep, cold, warm });
      const m = cold.marks, w = warm.marks;
      const dd = cold.dest ? ` | dest click→path ${cold.dest.pathAt - cold.dest.clickAt} content ${cold.dest.contentAt - cold.dest.clickAt} imgs ${cold.dest.imagesSettledAt - cold.dest.clickAt} fb ${cold.dest.fallbackFrom !== undefined} pend ${(cold.dest.pendingAtContent || []).length}${cold.dest.lcGuideMogzy ? " lcMogzy " + (cold.dest.lcGuideMogzy - cold.dest.clickAt) : ""}` : "";
      console.log(`${key} r${rep} COLD fcp ${m.fcp} lMogzy ${m.landingMogzy} sky ${m.landingSkyline} auto ${m.autoStart} hub ${m.hubPath} bg ${m.hubBg} frame ${m.hubFrame ?? m.hubSpine} splash ${m.hubSplashAll} hMogzy ${m.hubMogzy}${dd}`);
      console.log(`${key} r${rep} WARM fcp ${w.fcp} lMogzy ${w.landingMogzy} auto ${w.autoStart} hub ${w.hubPath} bg ${w.hubBg} frame ${w.hubFrame ?? w.hubSpine} splash ${w.hubSplashAll} hMogzy ${w.hubMogzy}`);
    }
  }
  fs.writeFileSync(path.join(OUT, `results${FILTER ? "-" + FILTER.replace(/[^\w]/g, "_") : ""}.json`), JSON.stringify(results, null, 1));
  await browser.close();
})();
