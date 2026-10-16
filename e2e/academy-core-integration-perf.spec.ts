/**
 * Academy Core V3 - INTEGRATION performance comparison.
 *
 *   main = origin/main production build, /lol is the existing Home Hub
 *   cand = integration branch production build, /lol is the Academy Core
 *
 * Both are served by the same static server with the production host's cache
 * policy (immutable hashed assets, no-cache document). Conditions (CDP):
 * 10 Mbps / 40 ms RTT, no CPU throttle for the main runs, plus a 4x CPU
 * interaction run. The headline journey is the REAL one: Landing (/) ->
 * automatic hand-off -> /lol, cold context. Direct cold and warm /lol loads
 * follow. External hosts (Railway, Supabase, fonts) are the real network.
 *
 *   PERF_MAIN=http://127.0.0.1:8140 PERF_CAND=http://127.0.0.1:8141 \
 *   npx playwright test -c playwright.frontend.config.ts e2e/academy-core-integration-perf.spec.ts
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASES = {
  main: process.env.PERF_MAIN ?? "http://127.0.0.1:8140",
  cand: process.env.PERF_CAND ?? "http://127.0.0.1:8141",
} as const;
type Variant = keyof typeof BASES;
const LABEL: Record<Variant, string> = { main: "origin/main (Hub at /lol)", cand: "integration (Core at /lol)" };
const REPS = Number(process.env.PERF_REPS ?? "1");
const ONLY = process.env.PERF_ONLY ?? "";
const OUT = path.resolve("docs/handoffs/academy-core-v3-integration");
mkdirSync(OUT, { recursive: true });

type Probe = Record<string, number>;

const PROBE = `
(() => {
  const t0 = performance.timeOrigin;
  const marks = {};
  const img = (sel) => { const el = document.querySelector(sel); return !!(el && el.complete && el.naturalWidth > 0); };
  const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight; };
  const checks = {
    rootPainted: () => document.querySelector('[data-testid="academy-core"], [data-hub-screen="hall"]') !== null,
    primaryCta: () => vis('[data-testid="academy-core-daily"]') || vis('a[href="/quiz"]') || vis('[data-testid="mobile-academy-book"]'),
    fourRooms: () => ['/quiz','/combat-lab','/lol/docs','/lol/pro-play'].every((h) => { const els = [...document.querySelectorAll('a[href="' + h + '"]')]; return els.some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); }),
    bookPainting: () => img('[data-testid="academy-broadcast-book"]') || img('[data-testid="academy-broadcast-book-mobile"]'),
    mogzy: () => img('[data-testid="academy-core-mogzy"] img[data-plate="rest"]') || img('[data-testid^="mogzy-guide-hub"] img') || img('img[src*="mogzy-mascot-base-v1-512"]'),
    libraryPainting: () => img('img[src*="academy-library"]'),
    coversDecoded: () => { const els = [...document.querySelectorAll('a[href] img[src*="/splash/"]')]; return els.length >= 4 && els.slice(0, 4).every((i) => i.complete && i.naturalWidth > 0); },
    upperCoversDecoded: () => { const els = ['/quiz', '/lol/pro-play'].map((h) => document.querySelector('a[href="' + h + '"] img[src*="/splash/"]')); return els.every((i) => i && i.complete && i.naturalWidth > 0); },
  };
  const tick = () => {
    const now = performance.now();
    for (const k of Object.keys(checks)) { if (!(k in marks)) { try { if (checks[k]()) marks[k] = Math.round(now); } catch {} } }
    if (Object.keys(marks).length < Object.keys(checks).length && now < 30000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__perfMarks = marks;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) marks.cls = Math.round(((marks.cls || 0) + e.value) * 10000) / 10000; } }).observe({ type: 'layout-shift', buffered: true });
})();`;


interface Req { url: string; startedAt: number; bytes: number; type: string; fromCache: boolean }

async function withCdp(page: Page, variant: Variant, cpu = 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8,
  });
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const reqs = new Map<string, Req>();
  const all: Req[] = [];
  cdp.on("Network.requestWillBeSent", (e) => {
    if (e.request.url.startsWith("data:")) return;
    const r: Req = { url: e.request.url, startedAt: Date.now(), bytes: 0, type: e.type ?? "", fromCache: false };
    reqs.set(e.requestId, r); all.push(r);
  });
  cdp.on("Network.requestServedFromCache", (e) => { const r = reqs.get(e.requestId); if (r) r.fromCache = true; });
  cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  return { cdp, all, base: BASES[variant] };
}

function summarize(all: Req[], base: string, splitAt: number | null) {
  const rel = (u: string) => u.replace(base, "");
  const real = all.filter((r) => !/\?import$/.test(r.url));
  const isImg = (r: Req) => r.type === "Image" || /\.(png|webp|jpg|jpeg|svg|gif)(\?|$)/i.test(r.url);
  const agg = (rs: Req[]) => ({
    count: rs.length, total: rs.reduce((n, r) => n + r.bytes, 0),
    images: rs.filter(isImg).reduce((n, r) => n + r.bytes, 0), imageCount: rs.filter(isImg).length,
    local: rs.filter((r) => r.url.startsWith(base)).reduce((n, r) => n + r.bytes, 0),
    external: rs.filter((r) => !r.url.startsWith(base)).reduce((n, r) => n + r.bytes, 0),
  });
  const pre = splitAt === null ? real : real.filter((r) => r.startedAt < splitAt);
  const post = splitAt === null ? [] : real.filter((r) => r.startedAt >= splitAt);
  // a duplicate = the same URL went to the network (not the cache) more than once in this document
  const byUrl = new Map<string, number>();
  for (const r of real) if (!r.fromCache && r.bytes > 0) byUrl.set(r.url, (byUrl.get(r.url) ?? 0) + 1);
  const dupes = [...byUrl.entries()].filter(([, n]) => n > 1).map(([u, n]) => ({ url: rel(u), n }));
  const hallOnly = real.filter((r) => /academy-library-(desktop|mobile)|book-spine|\/LolHub-/.test(r.url)).map((r) => rel(r.url));
  return { all: agg(real), pre: agg(pre), post: agg(post), dupes, hallOnly, imageUrls: real.filter(isImg).map((r) => rel(r.url)) };
}

async function readMarks(page: Page) {
  const marks = (await page.evaluate(() => (window as unknown as { __perfMarks: Probe }).__perfMarks)) ?? {};
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return { domContentLoaded: n ? Math.round(n.domContentLoadedEventEnd) : null, fcp: fcp ? Math.round(fcp.startTime) : null };
  });
  return { ...marks, ...nav };
}

async function interactionTimings(page: Page, which: "hub" | "core") {
  // hover → state flip
  if (which === "core") {
    const bay = page.getByTestId("academy-core-slot-combat-lab");
    const t = await page.evaluate(() => performance.now());
    await bay.hover();
    await page.waitForFunction(() => document.querySelector('[data-testid="academy-core-stage"]')?.getAttribute("data-focus") === "combat-lab");
    const flip = Math.round((await page.evaluate(() => performance.now())) - t);
    // long tasks during the swing
    await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) (window as unknown as { __lt: number[] }).__lt.push(Math.round(e.duration)); }).observe({ type: "longtask" }); });
    await page.getByTestId("academy-core-slot-pro-play").hover();
    await page.waitForTimeout(900);
    await page.getByTestId("academy-core-slot-archives").hover();
    await page.waitForTimeout(900);
    const longTasks = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt);
    // click → destination content
    const c0 = Date.now();
    await page.getByTestId("academy-core-slot-archives").locator("a").first().click(); // includes the 240 ms activation
    await page.waitForURL(/\/lol\/docs/);
    await page.locator("main h1, main h2").first().waitFor({ state: "visible", timeout: 15000 });
    return { hoverToStateMs: flip, longTasksMs: longTasks, clickToArchivesContentMs: Date.now() - c0 };
  }
  // The Hall renders both breakpoints' books; take the one that is actually shown.
  const book = page.locator('a[href="/lol/docs"]:visible').first();
  await book.scrollIntoViewIfNeeded();
  const t = await page.evaluate(() => performance.now());
  await book.hover();
  await page.waitForTimeout(50);
  const flip = Math.round((await page.evaluate(() => performance.now())) - t);
  await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) (window as unknown as { __lt: number[] }).__lt.push(Math.round(e.duration)); }).observe({ type: "longtask" }); });
  await page.locator('a[href="/lol/pro-play"]:visible').first().hover();
  await page.waitForTimeout(900);
  await book.hover();
  await page.waitForTimeout(900);
  const longTasks = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt);
  const c0 = Date.now();
  await book.click();
  await page.waitForURL(/\/lol\/docs/);
  await page.locator("main h1, main h2").first().waitFor({ state: "visible", timeout: 15000 });
  return { hoverToStateMs: flip, longTasksMs: longTasks, clickToArchivesContentMs: Date.now() - c0 };
}


const KIND: Record<Variant, "hub" | "core"> = { main: "hub", cand: "core" };

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(label + " timed out")), ms))]);
}

/** Landing (/) -> automatic hand-off -> /lol, then settle; cold context. */
async function journey(browser: Browser, variant: Variant, width: number, height: number, cpu = 1, interact = true) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const net = await withCdp(page, variant, cpu);
  await page.addInitScript(PROBE);
  const t0 = Date.now();
  await page.goto(BASES[variant] + "/", { waitUntil: "commit" });
  await page.waitForURL(/\/lol$/, { timeout: 30_000 });
  const arrivedAt = Date.now();
  const arrivedPerf = await page.evaluate(() => Math.round(performance.now()));
  await page.waitForTimeout(9000);
  const marks = await readMarks(page);
  const summary = summarize(net.all, BASES[variant], arrivedAt);
  let interaction: unknown = null;
  if (interact) {
    try { interaction = await withTimeout(interactionTimings(page, KIND[variant]), 45_000, "interaction"); }
    catch (e) { interaction = { error: String(e) }; }
  }
  await page.close();
  await context.close();
  return { variant, scenario: "journey", viewport: `${width}x${height}`, cpu, arrivedAtMs: arrivedPerf, landingToHomeWallMs: arrivedAt - t0, marks, net: summary, interaction };
}

/** Direct cold load, then a warm second page in the same context. */
async function direct(browser: Browser, variant: Variant, width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height } });
  const cold = await context.newPage();
  const coldNet = await withCdp(cold, variant);
  await cold.addInitScript(PROBE);
  await cold.goto(BASES[variant] + "/lol", { waitUntil: "commit" });
  await cold.waitForTimeout(9000);
  const coldMarks = await readMarks(cold);
  const coldSummary = summarize(coldNet.all, BASES[variant], null);
  await cold.close();
  const warm = await context.newPage();
  const warmNet = await withCdp(warm, variant);
  await warm.addInitScript(PROBE);
  await warm.goto(BASES[variant] + "/lol", { waitUntil: "commit" });
  await warm.waitForTimeout(5000);
  const warmMarks = await readMarks(warm);
  const warmSummary = summarize(warmNet.all, BASES[variant], null);
  await warm.close();
  await context.close();
  return { variant, scenario: "direct", viewport: `${width}x${height}`, cpu: 1, cold: { marks: coldMarks, net: coldSummary }, warm: { marks: warmMarks, net: warmSummary } };
}

test.setTimeout(300_000);

const ROWS_DIR = path.join(OUT, "perf-rows");
mkdirSync(ROWS_DIR, { recursive: true });
function persist(r: { variant: string; scenario: string; viewport: string; cpu: number }, rep: number) {
  writeFileSync(path.join(ROWS_DIR, `${r.scenario}-${r.variant}-${r.viewport}-${r.cpu}x-r${rep}.json`), JSON.stringify(r, null, 2));
}

const ALL_VIEWPORTS = [{ w: 1366, h: 768 }, { w: 1920, h: 1080 }, { w: 390, h: 844 }, { w: 320, h: 568 }];
const VP_FILTER = (process.env.PERF_VPS ?? "").split(",").filter(Boolean).map(Number);
const VIEWPORTS = VP_FILTER.length ? ALL_VIEWPORTS.filter((v) => VP_FILTER.includes(v.w)) : ALL_VIEWPORTS;
for (const rep of Array.from({ length: REPS }, (_, i) => i + 1)) {
  for (const vp of VIEWPORTS) {
    for (const variant of ["main", "cand"] as const) {
      test(`journey ${LABEL[variant]} @ ${vp.w}x${vp.h} r${rep}`, async ({ browser }) => {
        test.skip(ONLY !== "" && ONLY !== "journey", "filtered");
        const r = await journey(browser, variant, vp.w, vp.h);
        persist(r, rep);
        expect(r.marks.rootPainted, "home painted").toBeGreaterThan(0);
      });
      test(`direct ${LABEL[variant]} @ ${vp.w}x${vp.h} r${rep}`, async ({ browser }) => {
        test.skip(ONLY !== "" && ONLY !== "direct", "filtered");
        const r = await direct(browser, variant, vp.w, vp.h);
        persist(r, rep);
        expect(r.cold.marks.rootPainted, "home painted").toBeGreaterThan(0);
      });
    }
  }
}

test("4x CPU: journey + interaction @ 1366x768", async ({ browser }) => {
  test.skip(ONLY !== "" && ONLY !== "cpu", "filtered");
  for (const variant of ["main", "cand"] as const) {
    const r = await journey(browser, variant, 1366, 768, 4);
    persist(r, 1);
  }
});

test.afterAll(() => {
  const all = readdirSync(ROWS_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(ROWS_DIR, f), "utf8")));
  writeFileSync(path.join(OUT, "perf.json"), JSON.stringify(all, null, 2));
});
