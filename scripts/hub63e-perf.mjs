/**
 * HUB6.3E — performance probe: the mature Analytics Lab page (10 Dailies on
 * the first page) with ONE expanded Daily, in Playwright (msedge, reduced
 * motion off so the reveals run).
 *
 *   node scripts/hub63e-perf.mjs <baseUrl>
 *
 * Reports, per view (Overview, Time Trial, Standard, Survival, Review):
 * time from the click to the room being in the DOM, long tasks (> 50 ms)
 * during expansion, DOM and SVG node counts inside the room vs the whole
 * History section, live IntersectionObserver / ResizeObserver counts, and
 * the cost of 20 hover previews on the room's first donut legend row.
 */
import { chromium } from "playwright";

const [base] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
await ctx.addInitScript(() => {
  // Live observers: constructed and not yet disconnected (a second
  // disconnect of the same instance is not counted twice).
  const live = { io: new Set(), ro: new Set() };
  Object.defineProperty(window, "__obs", { get: () => ({ io: live.io.size, ro: live.ro.size }) });
  const IO = window.IntersectionObserver;
  window.IntersectionObserver = class extends IO {
    constructor(...a) { super(...a); live.io.add(this); }
    disconnect() { live.io.delete(this); return super.disconnect(); }
  };
  const RO = window.ResizeObserver;
  window.ResizeObserver = class extends RO {
    constructor(...a) { super(...a); live.ro.add(this); }
    disconnect() { live.ro.delete(this); return super.disconnect(); }
  };
  window.__long = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); })
      .observe({ type: "longtask", buffered: false });
  } catch { /* unsupported */ }
});
const page = await ctx.newPage();
await page.goto(`${base}/dev/lobby-preview`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.getByTestId("lobby-preview-analyticsLab").waitFor({ timeout: 120000 });
await page.getByTestId("lobby-preview-analyticsLab").click();
await page.getByTestId("lobby-preview-entitlement-premium").click();
await page.waitForSelector('[data-testid="daily-run-row"]');
await page.waitForTimeout(1500);

const collapsed = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid="daily-run-row"]')];
  return {
    rows: rows.length,
    nodesPerRow: Math.round(rows.reduce((a, r) => a + r.querySelectorAll("*").length, 0) / rows.length),
    svgsPerRow: Math.round(rows.reduce((a, r) => a + r.querySelectorAll("svg").length, 0) / rows.length),
    regions: document.querySelectorAll('[data-testid="daily-analytics-region"]').length,
    observers: window.__obs,
  };
});
console.log("collapsed", JSON.stringify(collapsed));

const row = page.locator('[data-testid="daily-run-row"]').first();
async function measure(label, open) {
  await page.evaluate(() => { window.__long.length = 0; });
  const t0 = await page.evaluate(() => performance.now());
  await open();
  await page.waitForSelector('[data-testid="daily-analytics-region"] [data-testid="daily-overview"], [data-testid="daily-analytics-region"] [data-room]');
  const t1 = await page.evaluate(() => performance.now());
  await page.waitForTimeout(2600); // reveals run
  const m = await page.evaluate(() => {
    const region = document.querySelector('[data-testid="daily-analytics-region"]');
    return {
      roomNodes: region.querySelectorAll("*").length,
      roomSvgs: region.querySelectorAll("svg").length,
      pageNodes: document.querySelectorAll("*").length,
      regions: document.querySelectorAll('[data-testid="daily-analytics-region"]').length,
      observers: window.__obs,
      longTasks: window.__long.map((d) => Math.round(d)),
    };
  });
  // Preview cost: focus a donut legend row (a preview highlight) and wait
  // two frames, 18 times; the time is focus -> the second frame after the
  // commit, so ~17-33 ms is a free preview.
  const preview = await page.evaluate(async () => {
    const btns = [...document.querySelectorAll('[data-testid="daily-analytics-region"] [data-testid="donut-legend-group"] button')].slice(0, 6);
    if (!btns.length) return null;
    const frames = [];
    window.__long.length = 0;
    for (let k = 0; k < 3; k++) {
      for (const b of btns) {
        const t0 = performance.now();
        b.focus();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        frames.push(Math.round(performance.now() - t0));
        await new Promise((r) => setTimeout(r, 60));
      }
    }
    document.activeElement.blur();
    frames.sort((a, b) => a - b);
    return { median: frames[Math.floor(frames.length / 2)], p90: frames[Math.floor(frames.length * 0.9)], longTasks: window.__long.map(Math.round) };
  });
  console.log(label, JSON.stringify({ openMs: Math.round(t1 - t0), ...m, preview }));
}

await measure("overview", () => row.getByTestId("daily-analysis-toggle").click());
for (const kind of ["time_trial", "standard", "survival", "review"]) {
  await measure(kind, () => row.locator(`[data-testid="daily-stage-row"][data-stage-kind="${kind}"] [data-testid="stage-analysis-toggle"]`).click());
}
await browser.close();
