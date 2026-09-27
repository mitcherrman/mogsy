/**
 * HUB6.3E — visual + layout probe for the Premium History analytics room.
 *
 * Drives the REAL page (`/dev/lobby-preview`, Analytics Lab) in Playwright
 * (msedge): picks an entitlement, expands one Daily (1 = newest, L14), opens
 * the Daily Overview or a stage, optionally performs an interaction, then
 * writes a screenshot of the expanded Daily and a JSON line of measurements.
 *
 *   node scripts/hub63e-probe.mjs <baseUrl> <outDir> <shots.json>
 *
 * shots.json: [{ name, width, height, run?, view?: "overview"|<stage kind>,
 *   entitlement?: "premium"|"free", touch?, textScale?: 1|2,
 *   action?: "donut-lock"|"donut-hover"|"question"|"streak"|"dist-scrub"|
 *            "line-scrub"|"cohort-same-day"|"strike", clip?: "row"|"region" }]
 *
 * Measured per shot: page overflow, region width and overflow, any element
 * past the region's right edge (visible, non-sr-only), chart/legend
 * overflow, tooltip / popover / sheet bounds against the viewport, the
 * smallest interactive target in the region, and every target under 44px
 * (touch).
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const [base, outDir, shotsFile] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const shots = JSON.parse(readFileSync(shotsFile, "utf8"));
const log = join(outDir, "measure.jsonl");
const browser = await chromium.launch({ channel: "msedge" });

async function open(s) {
  const touch = s.touch ?? s.width < 768;
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: s.motion ? "no-preference" : "reduce",
    deviceScaleFactor: 1,
  });
  if (s.donut) await ctx.addInitScript((v) => localStorage.setItem("hub63e-donut", v), s.donut);
  const page = await ctx.newPage();
  await page.goto(`${base}/dev/lobby-preview`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByTestId("lobby-preview-analyticsLab").waitFor({ timeout: 120000 });
  if (s.textScale && s.textScale !== 1) {
    await page.addStyleTag({ content: `html { font-size: ${16 * s.textScale}px !important; }` });
  }
  await page.getByTestId("lobby-preview-analyticsLab").click();
  await page.getByTestId(`lobby-preview-entitlement-${s.entitlement ?? "premium"}`).click();
  await page.waitForSelector('[data-testid="daily-run-row"]');
  const run = s.run ?? 1;
  if (run > 10) {
    await page.getByTestId("daily-history-load-more").click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="daily-run-row"]').length > 10);
  }
  const row = page.locator('[data-testid="daily-run-row"]').nth(run - 1);
  await row.scrollIntoViewIfNeeded();
  if (s.view && s.view !== "overview") {
    await row.locator(`[data-testid="daily-stage-row"][data-stage-kind="${s.view}"] [data-testid="stage-analysis-toggle"]`).click();
  } else {
    await row.getByTestId("daily-analysis-toggle").click();
  }
  await page.waitForTimeout(s.motion ? 2500 : 600);
  return { ctx, page, row, touch };
}

async function act(page, row, s, touch) {
  const tap = async (loc) => (touch ? loc.tap() : loc.click());
  switch (s.action) {
    case "donut-lock": {
      const el = row.locator('[data-testid="donut-legend-slice"]').first();
      await el.scrollIntoViewIfNeeded();
      await tap(el);
      break;
    }
    case "donut-hover": {
      const el = row.locator('[data-testid="donut-legend-group"] button').first();
      await el.scrollIntoViewIfNeeded();
      await el.hover();
      break;
    }
    case "streak": {
      const el = row.getByTestId("streak-light").first();
      await el.scrollIntoViewIfNeeded();
      await tap(el);
      break;
    }
    case "dist-scrub": {
      const el = row.getByTestId("population-distribution-scrubber").first();
      await el.scrollIntoViewIfNeeded();
      await el.focus();
      await page.keyboard.press("End");
      break;
    }
    case "line-scrub": {
      const el = row.getByTestId("history-line-scrubber").first();
      await el.scrollIntoViewIfNeeded();
      await el.focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      break;
    }
    case "cohort-same-day": {
      const el = row.locator('[data-testid="cohort-toggle"] [data-option="same_day"]').first();
      await el.scrollIntoViewIfNeeded();
      await tap(el);
      break;
    }
    case "question": {
      const stage = s.questionStage ?? "time_trial";
      const el = row.locator(`[data-testid="daily-stage-row"][data-stage-kind="${stage}"] [data-testid="timeline-icon"]:not([disabled])`).nth(s.questionIndex ?? 0);
      await el.scrollIntoViewIfNeeded();
      await tap(el);
      break;
    }
    case "link": {
      const el = row.getByTestId("review-link-light").first();
      await el.scrollIntoViewIfNeeded();
      await tap(el);
      break;
    }
    case "module": {
      const el = row.getByTestId("course-module").nth(s.moduleIndex ?? 9);
      await el.scrollIntoViewIfNeeded();
      await el.hover();
      break;
    }
    default:
      break;
  }
  if (s.action) await page.waitForTimeout(450);
}

function measure() {
  const vw = innerWidth;
  const vh = innerHeight;
  const q = (sel) => document.querySelector(sel);
  const row = [...document.querySelectorAll('[data-testid="daily-run-row"]')].find((r) => r.dataset.focused === "true");
  const region = row?.querySelector('[data-testid="daily-analytics-region"]');
  const rb = region?.getBoundingClientRect();
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    if (el.closest(".sr-only")) return false;
    if (el.closest("details:not([open])") && el.tagName !== "SUMMARY" && !el.closest("summary")) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  const past = [];
  if (region) {
    for (const el of region.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.right > rb.right + 1 || b.left < rb.left - 1) {
        past.push({ el: `${el.tagName.toLowerCase()}${el.dataset.testid ? `#${el.dataset.testid}` : ""}`, over: Math.round(Math.max(b.right - rb.right, rb.left - b.left)) });
      }
    }
  }
  const targets = region
    ? [...region.querySelectorAll('button, a[href], summary, [tabindex="0"]')].filter(visible).map((el) => {
        const b = el.getBoundingClientRect();
        return { el: el.dataset.testid ?? el.getAttribute("aria-label")?.slice(0, 40) ?? el.textContent.trim().slice(0, 30), w: Math.round(b.width), h: Math.round(b.height) };
      })
    : [];
  const minT = targets.reduce((m, t) => Math.min(m, Math.min(t.w, t.h)), 999);
  const small = targets.filter((t) => Math.min(t.w, t.h) < 44);
  const bound = (sel) => {
    const el = q(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), inside: b.left >= -1 && b.right <= vw + 1 && b.top >= -1 && b.bottom <= vh + 1 };
  };
  const charts = region
    ? [...region.querySelectorAll('[data-testid$="-chart"], [data-testid="population-distribution"], [data-testid="history-line"], [data-testid="daily-donut-chart"], ul')]
        .filter(visible).map((el) => el.scrollWidth - el.clientWidth).reduce((m, v) => Math.max(m, v), 0)
    : null;
  return {
    pageOverflow: document.documentElement.scrollWidth - vw,
    rowWidth: row ? Math.round(row.getBoundingClientRect().width) : null,
    regionWidth: rb ? Math.round(rb.width) : null,
    regionOverflow: region ? region.scrollWidth - region.clientWidth : null,
    chartOverflow: charts,
    pastEdge: past.slice(0, 8),
    pastEdgeCount: past.length,
    minTarget: minT,
    under44: small.length,
    under44List: small.slice(0, 6),
    tip: bound('[data-testid$="-tip"]'),
    popover: bound('[data-testid="question-review-popover"]'),
    sheet: bound('[data-testid="question-review-sheet"]'),
    regionHeight: rb ? Math.round(rb.height) : null,
    lit: document.querySelectorAll('[data-testid="timeline-icon"][data-lit="true"]').length,
  };
}

for (const s of shots) {
  const { ctx, page, row, touch } = await open(s);
  try {
    await act(page, row, s, touch);
    const m = await page.evaluate(measure);
    const file = join(outDir, `${s.name}.png`);
    if (s.clip === "viewport") await page.screenshot({ path: file });
    else if (s.action === "question") await page.screenshot({ path: file });
    else {
      // Measurements are taken first. For the picture, the viewport grows to
      // hold the whole target (a full-page capture would reflow viewport-
      // height layout above it), the target is scrolled to the top, and the
      // viewport is clipped to it.
      const target = s.clip === "region" ? row.getByTestId("daily-analytics-region") : row;
      const h = await target.evaluate((el) => el.getBoundingClientRect().height);
      await page.setViewportSize({ width: s.width, height: Math.min(16000, Math.ceil(h) + 40) });
      await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(250);
      const box = await target.evaluate((el) => {
        const b = el.getBoundingClientRect();
        return { x: Math.max(0, b.left), y: Math.max(0, b.top), width: b.width, height: b.height };
      });
      await page.screenshot({ path: file, clip: box });
    }
    appendFileSync(log, JSON.stringify({ name: s.name, width: s.width, height: s.height, textScale: s.textScale ?? 1, touch, ...m }) + "\n");
    console.log(s.name, JSON.stringify({ po: m.pageOverflow, ro: m.regionOverflow, past: m.pastEdgeCount, min: m.minTarget, u44: m.under44, tip: m.tip?.inside, lit: m.lit }));
  } catch (e) {
    console.log(s.name, "FAILED", e.message.split("\n")[0]);
  } finally {
    await ctx.close();
  }
}
await browser.close();
