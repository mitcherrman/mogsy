/**
 * QUIZ HUB — THE MAIN SCREEN FITS THE PHONE.
 *
 * The centre parchment of `/quiz` (Daily · Role · Ranked tabs, the day's
 * challenge, Mogzy, the record and the PLAY seal) must be usable in one
 * screen on short phones: the seal fully visible and tappable, nothing
 * clipped, no page scrolling needed to reach it.
 *
 * Frontend-only. Every remote read is intercepted with a deterministic
 * fixture; the app, its CSS and its assets come from the Vite dev server.
 * Intended to run in GitHub Actions (see the workflow of the same name):
 *
 *   npx playwright test -c playwright.quiz-hub-fit.config.ts
 *
 * Environment:
 *   HUBFIT_OUT=<dir>          write one geometry JSON per measurement (the
 *                             before/after evidence in the handoff)
 *   HUBFIT_MEASURE_ONLY=1     measure and record, assert nothing (used to take
 *                             the "before" numbers from the base commit)
 *
 * All assertions are DOM geometry (getBoundingClientRect, elementsFromPoint,
 * scroll metrics, computed style). Screenshots are written only as evidence.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHAMPION_ABILITY_ICON_FILES } from "../src/data/championAbilityIcons";

const OUT = process.env.HUBFIT_OUT ?? "";
const MEASURE_ONLY = process.env.HUBFIT_MEASURE_ONLY === "1";

/** Run an assertion block unless this run only takes measurements. */
function check(fn: () => void) {
  if (!MEASURE_ONLY) fn();
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const ACCOUNT = {
  token: "hubfit-token",
  user: { id: "hubfit-user", email: "hubfit@example.test", is_anonymous: false },
  admin: false,
};
const GUEST = {
  token: "hubfit-guest-token",
  user: { id: "hubfit-guest", email: null, is_anonymous: true },
  admin: false,
};

const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;
const LABELS = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" };

function catalog() {
  const names = Object.keys(CHAMPION_ABILITY_ICON_FILES).slice(0, 173);
  return {
    schema_version: "role_challenge_catalog.v2",
    product: { answer_count: 12, format_id: "role_challenge", format_version: 1, composer_version: "rc.v1" },
    roles: ROLES.map((role, r) => ({
      role,
      label: LABELS[role],
      champions: names.map((name, i) => {
        const conventional = (i + r) % 3 === 0 ? [role] : [ROLES[(r + 1) % 5]];
        return {
          id: name.toLowerCase().replace(/[^a-z]/g, ""),
          name,
          riot_id: CHAMPION_ABILITY_ICON_FILES[name].folder,
          roles: conventional,
          conventional: conventional.includes(role),
        };
      }),
    })),
  };
}

function rcStatus() {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    schema_version: "role_challenge_status.v1",
    server_now: now.toISOString(),
    challenge_date: now.toISOString().slice(0, 10),
    resets_at: reset.toISOString(),
    answer_count: 12,
    daily_slot: { used: false, run: null },
    active_run: null,
    other_active_match: false,
    next_start: { slot_kind: "daily", allowed: true, reason: null },
  };
}

/**
 * The four states the Daily pane can be in:
 *   available  no run yet                         → PLAY seal ("Play Daily")
 *   active     main Daily in progress             → PLAY seal ("Continue Daily")
 *   complete   main done, More Challenges open    → PLAY seal ("Continue / Review"),
 *                                                   score and correct figures
 *   finished   the run is closed                  → plain "View Today's Results"
 */
type DailyState = "available" | "active" | "complete" | "finished";

function dailyToday(state: DailyState) {
  if (state === "available") return { run: null };
  const stage = (kind: string, index: number, extra: Record<string, unknown> = {}) => ({
    stage_index: index, stage_id: `dr_e2e:${index}:${kind}`, kind,
    ruleset_id: kind === "review" ? "standard" : kind,
    ruleset: { ruleset_id: kind === "review" ? "standard" : kind, time_bank_ms: null, max_strikes: null },
    content_set_id: null, content: { title: kind, focus: null },
    status: "pending", child_match_id: null, live: null, result: null, ...extra,
  });
  const done = state === "complete" || state === "finished";
  return {
    run: {
      schema_version: 1, run_id: "dr_e2e000000000000000000000", policy: "official",
      plan_date: new Date().toISOString().slice(0, 10), plan_version: 5,
      status: state === "finished" ? "completed" : "active",
      outcome: state === "finished" ? "reviewed" : null,
      current_stage_index: done ? 1 : 0,
      weak_areas_eligible: false, server_now: new Date().toISOString(),
      main_completed_at: done ? new Date().toISOString() : null,
      main_score: done ? 1840 : null,
      stages: [
        stage("standard", 0, done
          ? { status: "completed", result: { correct: 9, answered: 12, score: 1840, ended_by: "completed", misses: 3 } }
          : { status: "in_progress" }),
        stage("time_trial", 1),
        stage("survival", 2),
        stage("review", 3),
      ],
      review_items: [],
    },
  };
}

type Identity = typeof ACCOUNT | typeof GUEST | null;

async function openHub(
  page: Page,
  opts: { width: number; height: number; daily?: DailyState; identity?: Identity; mobile?: boolean },
) {
  await page.setViewportSize({ width: opts.width, height: opts.height });
  const identity = opts.identity === undefined ? ACCOUNT : opts.identity;
  await page.addInitScript(({ identity }) => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    if (identity) localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
  }, { identity });
  const daily = dailyToday(opts.daily ?? "available");
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)[^/]+\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/role-challenges/catalog") return json(catalog());
    if (url.pathname === "/api/role-challenges/status") return json(rcStatus());
    if (url.pathname === "/api/daily-run/today") return json(daily);
    if (url.pathname === "/api/quiz/sets") return json({ sets: [] });
    if (url.pathname.startsWith("/fonts") || url.hostname.includes("fonts.g")) return route.continue();
    return route.abort("connectionrefused");
  });
  await page.goto("/quiz");
  await expect(page.getByTestId("ranked-hero")).toBeVisible();
  await expect(page.getByTestId("daily-mode-panel")).toBeVisible();
  // The entrance unfurl is 560ms (+ stagger); wait for it to settle, and for
  // the display faces, whose metrics change line breaks.
  await page.waitForTimeout(900);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

// ── Measurement ─────────────────────────────────────────────────────────────

interface Box { left: number; top: number; right: number; bottom: number; width: number; height: number }

interface Geometry {
  viewport: { width: number; height: number };
  scrollY: number;
  scrollX: number;
  docScrollWidth: number;
  docClientWidth: number;
  docScrollHeight: number;
  sheet: Box;
  capTop: Box;
  capFoot: Box;
  tablist: Box;
  tabs: Box[];
  title: Box | null;
  status: Box | null;
  statusFontPx: number | null;
  hero: Box | null;
  mascot: Box | null;
  stats: Box | null;
  statCells: Box[];
  statValueFontPx: number | null;
  statLabelFontPx: number | null;
  statTexts: string[];
  /** scrollWidth − clientWidth of each figure and label: > 0 means truncated. */
  statOverflow: number[];
  badge: Box | null;
  /** Text ranges (not boxes) for text that can overflow its element. */
  titleText: Box | null;
  statusText: Box | null;
  statTextBoxes: Box[];
  play: (Box & { kind: string; label: string }) | null;
  caption: Box | null;
  captionFontPx: number | null;
  /** Topmost element at five points of the play control. */
  playHits: boolean[];
  paneScroll: { scrollHeight: number; clientHeight: number } | null;
  stage: Box | null;
  stageMode: string | null;
  seal: { cssSize: number } | null;
  sheetMaxHeight: string;
}

const MEASURE_SOURCE = `(() => {
  const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
  const el = (sel) => document.querySelector(sel);
  const rect = (sel) => { const e = el(sel); return e ? box(e.getBoundingClientRect()) : null; };
  const textBox = (e) => {
    if (!e) return null;
    const range = document.createRange();
    range.selectNodeContents(e);
    const rects = Array.from(range.getClientRects());
    if (!rects.length) return null;
    return box({
      left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)),
      get width() { return this.right - this.left; }, get height() { return this.bottom - this.top; },
    });
  };
  const sheetEl = el('[data-order="centre"]');
  const panel = el('[data-testid="daily-mode-panel"]');
  const playEl = el('[data-testid="daily-play-seal"]') || el('[data-testid="daily-results-button"]');
  const statusEl = el('[data-testid="daily-mode-status"]');
  const titleEl = panel ? panel.querySelector('h2') : null;
  const statCells = Array.from(document.querySelectorAll('[data-testid="daily-mode-stat"]'));
  const px = (e, prop) => (e ? parseFloat(getComputedStyle(e)[prop]) : null);
  let playHits = [];
  let play = null;
  if (playEl) {
    const r = playEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const pts = [[cx, cy], [cx - r.width * 0.25, cy], [cx + r.width * 0.25, cy], [cx, cy - r.height * 0.25], [cx, cy + r.height * 0.25]];
    playHits = pts.map(([x, y]) => {
      const top = document.elementsFromPoint(x, y)[0];
      return !!top && (top === playEl || playEl.contains(top));
    });
    play = { ...box(r), kind: playEl.getAttribute('data-testid'), label: (playEl.textContent || '').trim() };
  }
  const pane = el('[data-mode-pane="daily"]');
  const stageEl = el('[data-testid="centre-mode-stage"]');
  const sealEl = el('[data-testid="daily-play-seal"]');
  const captionEl = el('.lc-daily-panel__caption');
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollY: window.scrollY, scrollX: window.scrollX,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    docScrollHeight: document.documentElement.scrollHeight,
    sheet: sheetEl ? box(sheetEl.getBoundingClientRect()) : null,
    capTop: rect('[data-order="centre"] .lc-scroll__cap--top'),
    capFoot: rect('[data-order="centre"] .lc-scroll__cap--foot'),
    tablist: rect('[data-testid="challenge-mode-switcher"]'),
    tabs: Array.from(document.querySelectorAll('[data-testid="challenge-mode-switcher"] [role="tab"]')).map((t) => box(t.getBoundingClientRect())),
    title: titleEl ? box(titleEl.getBoundingClientRect()) : null,
    status: statusEl ? box(statusEl.getBoundingClientRect()) : null,
    statusFontPx: px(statusEl, 'fontSize'),
    hero: rect('[data-testid="daily-mode-hero"]'),
    mascot: rect('[data-testid="daily-mode-mascot"]'),
    stats: rect('[data-testid="daily-mode-stats"]'),
    statCells: statCells.map((c) => box(c.getBoundingClientRect())),
    statValueFontPx: statCells[0] ? px(statCells[0].querySelector('dd'), 'fontSize') : null,
    statLabelFontPx: statCells[0] ? px(statCells[0].querySelector('dt'), 'fontSize') : null,
    statTexts: statCells.map((c) => (c.textContent || '').trim()),
    statOverflow: statCells.flatMap((c) => [c.querySelector('dt'), c.querySelector('dd')]).map((e) => (e ? e.scrollWidth - e.clientWidth : 0)),
    badge: (() => { const b = el('[data-testid="daily-mode-complete"]'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width > 0 ? box(r) : null; })(),
    titleText: textBox(titleEl),
    statusText: textBox(statusEl),
    statTextBoxes: statCells.flatMap((c) => [textBox(c.querySelector('dt')), textBox(c.querySelector('dd'))]).filter(Boolean),
    play,
    caption: captionEl ? box(captionEl.getBoundingClientRect()) : null,
    captionFontPx: px(captionEl, 'fontSize'),
    playHits,
    paneScroll: pane ? { scrollHeight: pane.scrollHeight, clientHeight: pane.clientHeight } : null,
    stage: stageEl ? box(stageEl.getBoundingClientRect()) : null,
    stageMode: stageEl ? stageEl.getAttribute('data-mode') : null,
    seal: sealEl ? { cssSize: sealEl.getBoundingClientRect().width } : null,
    sheetMaxHeight: sheetEl ? getComputedStyle(sheetEl).maxHeight : '',
  };
})()`;

async function measure(page: Page): Promise<Geometry> {
  return (await page.evaluate(MEASURE_SOURCE)) as Geometry;
}

function record(name: string, data: unknown) {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name.replace(/[^a-z0-9._-]+/gi, "_")}.json`), JSON.stringify(data, null, 1));
}

const within = (b: Box, outer: { left: number; top: number; right: number; bottom: number }, slack = 0.5) =>
  b.left >= outer.left - slack && b.right <= outer.right + slack && b.top >= outer.top - slack && b.bottom <= outer.bottom + slack;

function overlapArea(a: Box, b: Box) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Everything the Daily pane promises, in the viewport, undamaged. */
function assertDailyFits(g: Geometry, label: string) {
  const vp = { left: 0, top: 0, right: g.viewport.width, bottom: g.viewport.height };
  const play = g.play!;
  expect(play, `${label}: a play control exists`).not.toBeNull();

  // 1. PLAY is fully inside the viewport, with the page at its top.
  expect(g.scrollY, `${label}: page not scrolled`).toBe(0);
  expect(within(play, vp), `${label}: play ${JSON.stringify(play)} inside ${g.viewport.width}x${g.viewport.height}`).toBe(true);
  // 2. ...and nothing covers it.
  expect(g.playHits, `${label}: play is the top element at five points`).toEqual([true, true, true, true, true]);
  // Tap target.
  expect(play.width, `${label}: play width`).toBeGreaterThanOrEqual(44);
  expect(play.height, `${label}: play height`).toBeGreaterThanOrEqual(44);

  // 3. No page scrolling: nothing sideways, and no inner scroller in the pane.
  expect(g.docScrollWidth - g.docClientWidth, `${label}: no horizontal scroll`).toBeLessThanOrEqual(0);
  expect(g.scrollX, `${label}: scrollX`).toBe(0);
  expect(g.paneScroll!.scrollHeight - g.paneScroll!.clientHeight, `${label}: Daily pane has no inner scroll`).toBeLessThanOrEqual(1);

  // The sheet itself sits inside the viewport (the whole parchment, rolls included).
  expect(within(g.sheet, vp, 1), `${label}: sheet ${JSON.stringify(g.sheet)} inside viewport`).toBe(true);

  // 4. Navigation, status, record: present, inside the viewport and the sheet's
  //    writing area (between the two rolls, inside the drawn paper edge).
  const paperInset = g.sheet.width * 0.12;
  const writing = {
    left: g.sheet.left + paperInset,
    right: g.sheet.right - paperInset,
    top: g.capTop.bottom - 1,
    bottom: g.capFoot.top + 1,
  };
  expect(g.tabs, `${label}: three tabs`).toHaveLength(3);
  for (const t of g.tabs) {
    expect(within(t, vp), `${label}: tab inside viewport`).toBe(true);
    expect(within(t, writing, 1), `${label}: tab inside writing area`).toBe(true);
    // The tabs are the existing 29.75px control (WCAG 2.2 AA asks 24px); the
    // fit must not shrink them.
    expect(t.height, `${label}: tab height`).toBeGreaterThanOrEqual(29);
    expect(t.width, `${label}: tab width`).toBeGreaterThanOrEqual(44);
  }
  const textBoxes: [string, Box | null][] = [
    ["title", g.titleText], ["status", g.statusText],
    ...g.statTextBoxes.map((b, i): [string, Box] => [`stat text ${i}`, b]),
  ];
  for (const [name, b] of textBoxes) {
    expect(b, `${label}: ${name} has text`).not.toBeNull();
    expect(within(b!, vp), `${label}: ${name} inside viewport`).toBe(true);
    expect(within(b!, writing, 1), `${label}: ${name} ${JSON.stringify(b)} inside writing ${JSON.stringify(writing)}`).toBe(true);
  }
  expect(g.statCells, `${label}: three figures`).toHaveLength(3);
  // The figures say what they say: no value or label cut off or ellipsised.
  expect(g.statOverflow.filter((o) => o > 0.5), `${label}: a figure is truncated (${g.statTexts.join('|')})`).toEqual([]);
  // Each figure's text sits inside its own cell.
  g.statCells.forEach((cell, i) => {
    for (const tb of [g.statTextBoxes[2 * i], g.statTextBoxes[2 * i + 1]]) {
      expect(within(tb, cell, 1), `${label}: figure ${i} text inside its cell`).toBe(true);
    }
  });
  if (g.badge) expect(within(g.badge, writing, 1), `${label}: Complete pill ${JSON.stringify(g.badge)} inside writing area`).toBe(true);
  expect(g.statTexts.join("|"), `${label}: figure labels`).toMatch(/Today.*\|Score.*\|Correct/);
  expect(within(play, writing, 1), `${label}: play inside the writing area`).toBe(true);
  if (g.caption) expect(within(g.caption, writing, 1), `${label}: caption inside writing area`).toBe(true);

  // Mascot present, visible, and large enough to read as a figure.
  expect(g.mascot, `${label}: mascot`).not.toBeNull();
  expect(Math.min(g.mascot!.width, g.mascot!.height), `${label}: mascot size`).toBeGreaterThanOrEqual(48);
  expect(within(g.mascot!, vp), `${label}: mascot inside viewport`).toBe(true);

  // No two groups sit on each other.
  const groups: [string, Box | null][] = [
    ["tablist", g.tablist], ["title", g.title], ["status", g.status], ["hero", g.hero],
    ["stats", g.stats], ["play", play], ["caption", g.caption],
  ];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const [an, a] = groups[i]; const [bn, b] = groups[j];
      if (!a || !b) continue;
      expect(overlapArea(a, b), `${label}: ${an} overlaps ${bn}`).toBeLessThanOrEqual(2);
    }
  }

  // Legible type: nothing shrunk to make it fit.
  expect(g.statusFontPx!, `${label}: status font`).toBeGreaterThanOrEqual(11.5);
  expect(g.statValueFontPx!, `${label}: figure font`).toBeGreaterThanOrEqual(14);
  expect(g.statLabelFontPx!, `${label}: figure label font`).toBeGreaterThanOrEqual(9);
  if (g.captionFontPx !== null) expect(g.captionFontPx, `${label}: caption font`).toBeGreaterThanOrEqual(9.5);
}

// ── The acceptance matrix ───────────────────────────────────────────────────

const PHONES = [
  { width: 320, height: 568, name: "320x568" },
  { width: 360, height: 640, name: "360x640" },
  { width: 375, height: 667, name: "375x667" },
  { width: 390, height: 844, name: "390x844" },
  { width: 568, height: 320, name: "568x320-landscape" },
  { width: 667, height: 375, name: "667x375-landscape" },
] as const;

const DAILY_STATES: DailyState[] = ["available", "active", "complete", "finished"];

for (const phone of PHONES) {
  test.describe(`Quiz Hub main screen — ${phone.name}`, () => {
    test.use({
      viewport: { width: phone.width, height: phone.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });

    for (const state of DAILY_STATES) {
      for (const [authName, identity] of [["account", ACCOUNT], ["guest", GUEST], ["no-session", null]] as const) {
        // The full state × auth cross is large; guests and cold visitors are
        // checked in the two states that differ visibly (a seal and the
        // plain results button), the account in all four.
        if (authName !== "account" && state !== "available" && state !== "finished") continue;
        test(`Daily ${state} · ${authName}: PLAY and the whole pane fit`, async ({ page }, testInfo) => {
          await openHub(page, { ...phone, daily: state, identity });
          const g = await measure(page);
          record(`${phone.name}__daily-${state}__${authName}`, g);
          if (OUT && authName === "account") {
            await page.screenshot({ path: join(OUT, `${phone.name}__daily-${state}.png`) });
          }
          check(() => {
            assertDailyFits(g, `${phone.name} ${state} ${authName}`);
            if (state === "available") expect(g.play!.kind).toBe("daily-play-seal");
            if (state === "finished") expect(g.play!.kind).toBe("daily-results-button");
            if (state === "complete") {
              expect(g.statTexts.join("|")).toContain("1,840");
              expect(g.statTexts.join("|")).toContain("9/12");
            }
          });
          void testInfo;
        });
      }
    }

    test("PLAY is tappable and starts the Daily", async ({ page }) => {
      await openHub(page, { ...phone, daily: "available" });
      const before = await measure(page);
      check(() => assertDailyFits(before, `${phone.name} before tap`));
      // No scrolling to reach it: tap in place.
      await page.getByTestId("daily-play-seal").tap({ timeout: 5000 });
      if (!MEASURE_ONLY) await page.waitForURL(/\/quiz\/daily-challenge/, { timeout: 15000 });
    });

    test("Role and Ranked stay whole, and switching back restores Daily", async ({ page }) => {
      await openHub(page, { ...phone, daily: "active" });
      const daily1 = await measure(page);
      const tabs = ["Role Challenge", "Ranked", "Daily Challenge"] as const;
      const sheets: Record<string, Box> = { daily: daily1.sheet };

      await page.getByRole("tab", { name: tabs[0] }).tap();
      await expect(page.getByTestId("rc-champion-option").first()).toBeVisible();
      await page.waitForTimeout(350);
      const role = await page.evaluate(() => {
        const box = (e: Element) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const sheet = document.querySelector('[data-order="centre"]')!;
        const picker = document.querySelector('[data-testid="role-mode-panel"]')!;
        return {
          sheet: box(sheet), picker: box(picker),
          tablist: box(document.querySelector('[data-testid="challenge-mode-switcher"]')!),
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          maxHeight: getComputedStyle(sheet).maxHeight,
          stageMode: document.querySelector('[data-testid="centre-mode-stage"]')!.getAttribute("data-mode"),
        };
      });
      sheets.role = role.sheet;
      record(`${phone.name}__role`, role);

      await page.getByRole("tab", { name: tabs[1] }).tap();
      await expect(page.getByTestId("ranked-play-gem")).toBeVisible();
      await page.waitForTimeout(350);
      const ranked = await page.evaluate(() => {
        const box = (e: Element) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const sheet = document.querySelector('[data-order="centre"]')!;
        return {
          sheet: box(sheet), gem: box(document.querySelector('[data-testid="ranked-play-gem"]')!),
          tablist: box(document.querySelector('[data-testid="challenge-mode-switcher"]')!),
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          maxHeight: getComputedStyle(sheet).maxHeight,
        };
      });
      sheets.ranked = ranked.sheet;
      record(`${phone.name}__ranked`, ranked);

      await page.getByRole("tab", { name: tabs[2] }).tap();
      await expect(page.getByTestId("daily-mode-panel")).toBeVisible();
      await page.waitForTimeout(350);
      const daily2 = await measure(page);
      record(`${phone.name}__daily-after-switch`, daily2);

      check(() => {
        // Role and Ranked are untouched by the Daily fit: no cap, one shared box.
        expect(role.stageMode).toBe("role");
        expect(role.maxHeight, "Role sheet is not capped").toBe("none");
        expect(ranked.maxHeight, "Ranked sheet is not capped").toBe("none");
        expect(role.sheet.height, "Role and Ranked share one sheet box").toBeCloseTo(ranked.sheet.height, 0);
        expect(role.sheet.top).toBeCloseTo(ranked.sheet.top, 0);
        // Their content stays inside their sheet and the page.
        expect(role.picker.bottom, "Role picker inside its sheet").toBeLessThanOrEqual(role.sheet.bottom + 1);
        expect(ranked.gem.bottom, "Ranked seal inside its sheet").toBeLessThanOrEqual(ranked.sheet.bottom + 1);
        expect(role.docOverflow).toBeLessThanOrEqual(0);
        expect(ranked.docOverflow).toBeLessThanOrEqual(0);
        // The tabs never move to a different place when the mode changes. (A
        // landscape phone re-proportions the Daily sheet's frame, so it is the
        // one case where the Daily tabs are laid out on a different sheet.)
        if (phone.height >= phone.width) {
          for (const t of [role.tablist, ranked.tablist]) {
            expect(t.top).toBeCloseTo(daily1.tablist.top, 0);
            expect(t.left).toBeCloseTo(daily1.tablist.left, 0);
            expect(t.width).toBeCloseTo(daily1.tablist.width, 0);
          }
        }
        // Daily is never taller than the sheet the other modes use (the cap is a
        // ceiling, not a target), and where the viewport could hold the whole
        // Ranked sheet nothing changed at all.
        expect(daily1.sheet.height).toBeLessThanOrEqual(ranked.sheet.height + 1);
        if (ranked.sheet.bottom <= phone.height - 8) {
          expect(daily1.sheet.height, "viewport roomy enough: Daily == Ranked").toBeCloseTo(ranked.sheet.height, 0);
        }
        // Returning to Daily gives back exactly the same box and the same fit.
        expect(daily2.sheet.height).toBeCloseTo(daily1.sheet.height, 0);
        expect(daily2.sheet.top).toBeCloseTo(daily1.sheet.top, 0);
        assertDailyFits(daily2, `${phone.name} after switching back`);
      });
    });
  });
}

// ── Browser-chrome changes and safe areas ──────────────────────────────────

test.describe("Quiz Hub main screen — viewport changes", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("follows the viewport as it shrinks and grows (address bar, keyboard, rotation)", async ({ page }) => {
    await openHub(page, { width: 390, height: 844, daily: "available" });
    const steps = [
      { width: 390, height: 844 },
      { width: 390, height: 700 },
      { width: 390, height: 640 },
      { width: 390, height: 844 },
    ];
    const results: Geometry[] = [];
    for (const s of steps) {
      await page.setViewportSize(s);
      await page.waitForTimeout(250);
      const g = await measure(page);
      results.push(g);
      record(`resize__${s.width}x${s.height}`, g);
      check(() => assertDailyFits(g, `resize ${s.width}x${s.height}`));
    }
    check(() => {
      expect(results[3].sheet.height, "growing back restores the sheet").toBeCloseTo(results[0].sheet.height, 0);
    });
  });

  test("rotating a phone from portrait to landscape and back keeps PLAY in view", async ({ page }) => {
    await openHub(page, { width: 375, height: 667, daily: "active" });
    for (const s of [{ width: 667, height: 375 }, { width: 375, height: 667 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(s);
      await page.waitForTimeout(300);
      const g = await measure(page);
      record(`rotate__${s.width}x${s.height}`, g);
      check(() => assertDailyFits(g, `rotate ${s.width}x${s.height}`));
    }
  });

  test("a bottom safe-area inset is subtracted from the budget", async ({ page }) => {
    await openHub(page, { width: 390, height: 844, daily: "available" });
    // Headless Chromium has no home indicator, so inject the inset the way the
    // stylesheet reads it: through the token the cap is written against.
    await page.addStyleTag({ content: ":root { --lc-hub-below: calc(0.5rem + 34px) !important; }" });
    await page.setViewportSize({ width: 390, height: 700 });
    await page.waitForTimeout(250);
    const g = await measure(page);
    record("safe-area__390x700", g);
    check(() => {
      assertDailyFits(g, "390x700 with a 34px inset");
      expect(g.sheet.bottom, "sheet clears the inset").toBeLessThanOrEqual(g.viewport.height - 34 - 8 + 1);
    });
  });
});

// ── Desktop and tablet are unchanged ───────────────────────────────────────

const WIDE = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

for (const vp of WIDE) {
  test(`desktop ${vp.width}x${vp.height}: the Daily fit does not apply`, async ({ page }) => {
    await openHub(page, { ...vp, daily: "active" });
    const daily = await measure(page);
    const geom = await page.evaluate(() => {
      const sheets = ["left", "centre", "right"].map((o) => {
        const e = document.querySelector(`[data-order="${o}"]`)!;
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        const cap = getComputedStyle(e.querySelector(".lc-scroll__cap--top")!);
        return { order: o, left: r.left, top: r.top + window.scrollY, width: r.width, height: r.height, maxHeight: cs.maxHeight, padding: cs.padding, capAspect: cap.aspectRatio, capBg: cap.backgroundSize };
      });
      return sheets;
    });
    await page.getByRole("tab", { name: "Ranked" }).click();
    await page.waitForTimeout(350);
    const ranked = await page.evaluate(() => {
      const r = document.querySelector('[data-order="centre"]')!.getBoundingClientRect();
      return { height: r.height, top: r.top + window.scrollY };
    });
    record(`desktop__${vp.width}x${vp.height}`, { daily, geom, ranked });
    check(() => {
      const centre = geom.find((g) => g.order === "centre")!;
      expect(centre.maxHeight, "no cap on desktop").toBe("none");
      expect(centre.capBg, "rolls keep their artwork scale").toBe("100% auto");
      expect(centre.capAspect, "rolls keep their aspect ratio").toMatch(/1086\s*\/\s*145/);
      // Parchment continuity: the centre sheet is one box across modes.
      expect(centre.height).toBeCloseTo(ranked.height, 0);
      expect(centre.top).toBeCloseTo(ranked.top, 0);
      expect(daily.docScrollWidth - daily.docClientWidth).toBeLessThanOrEqual(0);
    });
  });
}

test("tablet 768x1024: Daily keeps its natural sheet and the standard seal", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openHub(page, { width: 768, height: 1024, daily: "available" });
  const g = await measure(page);
  await page.getByRole("tab", { name: "Ranked" }).click();
  await page.waitForTimeout(350);
  const ranked = await page.evaluate(() => document.querySelector('[data-order="centre"]')!.getBoundingClientRect().height);
  record("tablet__768x1024", { g, ranked });
  check(() => {
    assertDailyFits(g, "768x1024");
    expect(g.sheet.height).toBeCloseTo(ranked, 0);
    expect(g.seal!.cssSize, "tablet seal is the 9rem it always was").toBeCloseTo(144, 0);
  });
});
