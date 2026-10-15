/**
 * Academy Core V2 — performance comparison: existing Home Hub (/lol) vs the
 * refined Core (/lol/dev/academy-core), same production build, equivalent
 * conditions. PERF1's method, re-run fresh rather than reused as absolutes.
 *
 * Run against a production build served by `vite preview`:
 *   npx vite build --outDir /tmp/dist && npx vite preview --outDir /tmp/dist --port 8126
 *   PERF_BASE=http://127.0.0.1:8126 npx playwright test -c playwright.frontend.config.ts e2e/academy-core-perf.spec.ts
 *
 * Conditions (CDP): 10 Mbps / 40 ms RTT, no CPU throttle for the main runs,
 * plus one 4× CPU-throttled interaction run. Cold = fresh browser context;
 * warm = second page in the same context (HTTP cache). External hosts
 * (Railway, Supabase, Google Fonts) are real network, exactly as PERF1.
 *
 * Milestones come from an in-page per-frame probe installed before any app
 * script runs: first paint of the page's root, the primary CTA on screen,
 * the four destinations on screen, the book's painting decoded, Mogzy's
 * plate decoded. Bytes come from CDP Network events (encodedDataLength).
 * Layout shift from buffered `layout-shift` entries. Input responsiveness is
 * the time from a hover to the instrument's `data-focus` flip (Core) or the
 * book card's hover class (Hall), and from a click to the destination's
 * content.
 *
 * Writes docs/handoffs/academy-core-v2/perf.json and perf.md.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PERF_BASE ?? "http://127.0.0.1:8126";
const OUT = path.resolve("docs/handoffs/academy-core-v2");
mkdirSync(OUT, { recursive: true });

type Probe = Record<string, number>;

const PAGES = {
  hub: { path: "/lol", label: "Existing Home Hub" },
  core: { path: "/lol/dev/academy-core", label: "Academy Core V2" },
} as const;

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

async function withCdp(page: Page, cpu = 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8,
  });
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const bytes = { total: 0, images: 0, local: 0, external: 0, count: 0, imageUrls: [] as string[] };
  const urlById = new Map<string, string>();
  const typeById = new Map<string, string>();
  cdp.on("Network.requestWillBeSent", (e) => { urlById.set(e.requestId, e.request.url); typeById.set(e.requestId, e.type ?? ""); });
  cdp.on("Network.loadingFinished", (e) => {
    const url = urlById.get(e.requestId) ?? "";
    const t = typeById.get(e.requestId) ?? "";
    bytes.total += e.encodedDataLength; bytes.count += 1;
    if (t === "Image" || /\.(png|webp|jpg|jpeg|svg|gif)(\?|$)/i.test(url)) { bytes.images += e.encodedDataLength; bytes.imageUrls.push(url); }
    if (url.startsWith(BASE)) bytes.local += e.encodedDataLength; else bytes.external += e.encodedDataLength;
  });
  return { cdp, bytes };
}

async function loadAndMeasure(page: Page, route: string, waitMs = 9000) {
  await page.addInitScript(PROBE);
  const started = Date.now();
  await page.goto(BASE + route, { waitUntil: "commit" });
  await page.waitForTimeout(waitMs);
  const marks = (await page.evaluate(() => (window as unknown as { __perfMarks: Probe }).__perfMarks)) ?? {};
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return { domContentLoaded: n ? Math.round(n.domContentLoadedEventEnd) : null, fcp: fcp ? Math.round(fcp.startTime) : null };
  });
  return { ...marks, ...nav, wallMs: Date.now() - started };
}

async function interactionTimings(page: Page, which: keyof typeof PAGES) {
  // hover → state flip
  if (which === "core") {
    const bay = page.getByTestId("academy-core-bay-combat-lab");
    const t = await page.evaluate(() => performance.now());
    await bay.hover();
    await page.waitForFunction(() => document.querySelector('[data-testid="academy-core-stage"]')?.getAttribute("data-focus") === "combat-lab");
    const flip = Math.round((await page.evaluate(() => performance.now())) - t);
    // long tasks during the swing
    await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) (window as unknown as { __lt: number[] }).__lt.push(Math.round(e.duration)); }).observe({ type: "longtask" }); });
    await page.getByTestId("academy-core-bay-pro-play").hover();
    await page.waitForTimeout(900);
    await page.getByTestId("academy-core-bay-archives").hover();
    await page.waitForTimeout(900);
    const longTasks = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt);
    // click → destination content
    const c0 = Date.now();
    await page.getByTestId("academy-core-bay-archives").click();
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

async function scenario(browser: Browser, which: keyof typeof PAGES, width: number, height: number, cpu = 1) {
  const context = await browser.newContext({ viewport: { width, height } });
  const cold = await context.newPage();
  const coldNet = await withCdp(cold, cpu);
  const coldMarks = await loadAndMeasure(cold, PAGES[which].path);
  let interaction: Awaited<ReturnType<typeof interactionTimings>> | { hoverToStateMs: null; longTasksMs: number[]; clickToArchivesContentMs: null; error: string };
  try {
    interaction = await Promise.race([
      interactionTimings(cold, which),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("interaction timed out (45 s)")), 45_000)),
    ]);
  } catch (e) {
    interaction = { hoverToStateMs: null, longTasksMs: [], clickToArchivesContentMs: null, error: String(e) };
  }
  await cold.close();
  const warm = await context.newPage();
  const warmNet = await withCdp(warm, cpu);
  const warmMarks = await loadAndMeasure(warm, PAGES[which].path, 5000);
  await warm.close();
  await context.close();
  const strip = (b: typeof coldNet.bytes) => ({ total: b.total, images: b.images, local: b.local, external: b.external, count: b.count, imageUrls: b.imageUrls.map((u) => u.replace(BASE, "")) });
  return { page: which, viewport: `${width}x${height}`, cpu, cold: { marks: coldMarks, bytes: strip(coldNet.bytes), interaction }, warm: { marks: warmMarks, bytes: strip(warmNet.bytes) } };
}

// Sequential (workers: 1) but NOT serial: one scenario failing must not skip the rest.
test.setTimeout(240_000);

const results: unknown[] = [];
const ROWS_DIR = path.join(OUT, "perf-rows");
mkdirSync(ROWS_DIR, { recursive: true });
function persist(r: { page: string; viewport: string; cpu: number }) {
  results.push(r);
  writeFileSync(path.join(ROWS_DIR, `${r.page}-${r.viewport}-${r.cpu}x.json`), JSON.stringify(r, null, 2));
}

for (const vp of [{ w: 1366, h: 768 }, { w: 1920, h: 1080 }, { w: 390, h: 844 }, { w: 320, h: 568 }]) {
  for (const which of ["hub", "core"] as const) {
    test(`${PAGES[which].label} @ ${vp.w}x${vp.h}`, async ({ browser }) => {
      const r = await scenario(browser, which, vp.w, vp.h);
      persist(r);
      expect(r.cold.marks.rootPainted, "page painted").toBeGreaterThan(0);
    });
  }
}

test("4x CPU throttle: interaction responsiveness @ 1366x768", async ({ browser }) => {
  for (const which of ["hub", "core"] as const) {
    const r = await scenario(browser, which, 1366, 768, 4);
    persist(r);
  }
});

test.afterAll(() => {
  // Merge every persisted row (this worker's and any earlier worker's).
  const all = readdirSync(ROWS_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(ROWS_DIR, f), "utf8")));
  all.sort((a, b) => `${a.viewport}${a.cpu}${a.page}`.localeCompare(`${b.viewport}${b.cpu}${b.page}`));
  writeFileSync(path.join(OUT, "perf.json"), JSON.stringify(all, null, 2));
  const rows = (all as Array<{ page: string; viewport: string; cpu: number; cold: { marks: Probe & { fcp: number | null }; bytes: { total: number; images: number; count: number }; interaction: { hoverToStateMs: number; longTasksMs: number[]; clickToArchivesContentMs: number } }; warm: { marks: Probe; bytes: { total: number; images: number } } }>);
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const md = [
    "| page | viewport | cpu | cold FCP | CTA | rooms | upper covers | 4 covers | book | Mogzy | CLS | cold bytes (images) | reqs | warm CTA | warm bytes | hover→state | max long task | click→Archives |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.page} | ${r.viewport} | ${r.cpu}x | ${r.cold.marks.fcp ?? "—"} | ${r.cold.marks.primaryCta ?? "—"} | ${r.cold.marks.fourRooms ?? "—"} | ${r.cold.marks.upperCoversDecoded ?? "—"} | ${r.cold.marks.coversDecoded ?? "—"} | ${r.cold.marks.bookPainting ?? "—"} | ${r.cold.marks.mogzy ?? "—"} | ${r.cold.marks.cls ?? 0} | ${kb(r.cold.bytes.total)} (${kb(r.cold.bytes.images)}) | ${r.cold.bytes.count} | ${r.warm.marks.primaryCta ?? "—"} | ${kb(r.warm.bytes.total)} | ${r.cold.interaction.hoverToStateMs ?? "—"} ms | ${Math.max(0, ...r.cold.interaction.longTasksMs)} ms | ${r.cold.interaction.clickToArchivesContentMs ?? "—"} ms |`),
  ].join("\n");
  writeFileSync(path.join(OUT, "perf.md"), md + "\n");
});
