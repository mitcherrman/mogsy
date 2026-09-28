/**
 * HUB6.3G — visual + layout probe for the Premium History analytics room
 * (HUB6.3E's probe, extended).
 *
 * HUB6.3G additions:
 *   * `mutate`: serve the lab golden with ONE wire field changed, for states
 *     the lab does not hold — "legacy-slice" (L12's Journey sent as the old
 *     `unit:"slice"`), "null-max-strikes" (L11's limit unknown). The page
 *     module is intercepted in the browser; no app code is involved.
 *   * collisions: every pair of visible text boxes inside a chart (history
 *     lines and keys, the Survival tower and its lane, distributions, the
 *     stopwatch, the course) that overlaps — reported, must be 0.
 *   * previewStatus: the hover-preview note's bounds (inside the viewport).
 *   * contextSummary: in the question Popover, whether the History summary
 *     is inside the Popover's visible box without scrolling.
 *
 * Drives the REAL page (`/dev/lobby-preview`, Analytics Lab) in Playwright
 * (msedge): picks an entitlement, expands one Daily (1 = newest, L14), opens
 * the Daily Overview or a stage, optionally performs an interaction, then
 * writes a screenshot of the expanded Daily and a JSON line of measurements.
 *
 *   node scripts/hub63g-probe.mjs <baseUrl> <outDir> <shots.json>
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

function mutateItem(item, kind) {
  const stage = (k) => item.stages.find((x) => x.kind === k);
  if (kind === "legacy-slice" && item.run_id === "lab-run-12") {
    const st = stage("standard");
    for (const m of st.modules ?? []) if (m.unit === "journey") m.unit = "slice";
    for (const q of st.questions) if (q.unit === "journey") q.unit = "slice";
  }
  if (kind === "null-max-strikes" && item.run_id === "lab-run-11") {
    const st = stage("survival");
    st.basic.max_strikes = null;
    st.ruleset.config.max_strikes = null;
    if (st.analytics?.current) st.analytics.current.max_strikes = null;
  }
}

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
  if (s.mutate) {
    await page.route(/analyticsLab\.golden\.json/, async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      const m = /export default (".*")\s*;?\s*(\/\/.*)?$/s.exec(body);
      if (!m) return route.fulfill({ response: res });
      const golden = JSON.parse(JSON.parse(m[1]));
      for (const page of golden.scenarios.lab_premium) for (const item of page.items) mutateItem(item, s.mutate);
      await route.fulfill({ response: res, body: `export default ${JSON.stringify(JSON.stringify(golden))}` });
    });
  }
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
    case "strike": {
      const el = row.getByTestId("strike-item").last();
      await el.scrollIntoViewIfNeeded();
      await tap(el);
      break;
    }
    case "preview-hover": {
      // A donut legend row in the room, hovered while the rails are off-screen.
      const el = row.locator('[data-testid="donut-legend-group"] button').first();
      await el.scrollIntoViewIfNeeded();
      await el.evaluate((e) => e.scrollIntoView({ block: "end" }));
      await el.hover();
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
  const chartOver = region
    ? [...region.querySelectorAll("ul, ol")].filter(visible).filter((el) => el.scrollWidth - el.clientWidth > 0)
        .map((el) => `${el.tagName}${el.dataset.testid ? "#" + el.dataset.testid : ""}[${el.getAttribute("aria-label") ?? ""}]+${el.scrollWidth - el.clientWidth}`)
    : [];
  // Text collisions inside charts: every visible element whose OWN text is
  // non-empty, pairwise, per chart container.
  const chartSel = ['[data-testid="timeline-icons"]', '[data-testid="stage-row-compare"]', '[data-testid="history-line"]', '[data-testid="history-key"]', '[data-testid="shaft"]', '[data-testid="population-distribution"]', '[data-testid="stopwatch"]', '[data-testid="course-modules"]', '[data-testid="mode-dials"]'];
  const collisions = [];
  if (region) {
    for (const sel of chartSel) {
      for (const box of (row ?? region).querySelectorAll(sel)) {
        const leaves = [...box.querySelectorAll("*")].filter((el) => visible(el) && !el.closest('[data-testid$="-tip"]') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
        const rects = leaves.map((el) => ({ el, b: el.getBoundingClientRect() }));
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i], c = rects[j];
            if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
            const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left);
            const h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
            if (w > 1 && h > 1) collisions.push(`${sel}: "${a.el.textContent.trim().slice(0, 16)}" × "${c.el.textContent.trim().slice(0, 16)}"`);
          }
        }
      }
    }
  }
  const pop = q('[data-testid="question-review-popover"]');
  const sum = q('[data-testid="question-context-summary"]');
  let contextSummary = null;
  if (pop && sum) {
    const pb = pop.getBoundingClientRect();
    const sb = sum.getBoundingClientRect();
    contextSummary = { visibleInPopover: sb.top >= pb.top - 1 && sb.bottom <= pb.bottom + 1, top: Math.round(sb.top), popBottom: Math.round(pb.bottom), text: sum.textContent.trim().slice(0, 80) };
  }
  const ps = q('[data-testid="preview-status"]');
  return {
    collisions: collisions.slice(0, 6),
    collisionCount: collisions.length,
    contextSummary,
    previewStatus: ps ? { text: ps.textContent.trim(), ...bound('[data-testid="preview-status"]') } : null,
    cohortToggles: row ? row.querySelectorAll('[data-testid="cohort-toggle"]').length : null,
    compareLayout: region?.querySelector('[data-testid="daily-compare"], [data-testid="stage-compare-board"]')?.getAttribute("data-layout") ?? null,
    pageOverflow: document.documentElement.scrollWidth - vw,
    rowWidth: row ? Math.round(row.getBoundingClientRect().width) : null,
    rowHeight: row ? Math.round(row.getBoundingClientRect().height) : null,
    selectedStageHeight: (() => { const st = row?.querySelector('[data-testid="daily-stage-row"][data-selected="true"]'); return st ? Math.round(st.getBoundingClientRect().height) : null; })(),
    topicLines: row ? row.querySelectorAll('[data-testid="timeline-topic"]').length : null,
    rowCompare: row ? !!row.querySelector('[data-testid="stage-row-compare"]') : null,
    regionWidth: rb ? Math.round(rb.width) : null,
    regionOverflow: region ? region.scrollWidth - region.clientWidth : null,
    chartOverflow: charts,
    chartOver: chartOver.slice(0, 4),
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
    if (s.clip === "viewport" || s.action === "question" || s.action === "preview-hover") await page.screenshot({ path: file });
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
    console.log(s.name, JSON.stringify({ po: m.pageOverflow, ro: m.regionOverflow, past: m.pastEdgeCount, min: m.minTarget, u44: m.under44, h: m.regionHeight, row: m.rowHeight, sel: m.selectedStageHeight, topics: m.topicLines, cmp: m.rowCompare, col: m.collisionCount, tip: m.tip?.inside, lit: m.lit, ps: m.previewStatus?.text, ctx: m.contextSummary?.visibleInPopover, cohorts: m.cohortToggles }));
  } catch (e) {
    console.log(s.name, "FAILED", e.message.split("\n")[0]);
  } finally {
    await ctx.close();
  }
}
await browser.close();
