/**
 * PARCHMENT CONTINUITY — the Quiz Hub centre sheet keeps one outer box across
 * its three modes (Daily · Role · Ranked), and the two flank sheets never move.
 *
 * Frontend-only: every remote read is intercepted with a deterministic fixture
 * (a 173-champion Role Challenge catalog, the Daily `today` run in each of its
 * states). Run with:
 *
 *   npx playwright test -c playwright.frontend.config.ts e2e/parchment-continuity.spec.ts
 *
 * Set PARCHMENT_SHOTS=<dir> to also write a screenshot of every mode at every
 * viewport (used for the review handoff, not asserted).
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CHAMPION_ABILITY_ICON_FILES } from "../src/data/championAbilityIcons";

const SHOTS = process.env.PARCHMENT_SHOTS ?? "";
// A sandbox whose Playwright build has no bundled browser can point at one.
if (process.env.PW_CHROMIUM) test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM } });

const account = {
  token: "parchment-token",
  user: { id: "parchment-user", email: "parchment@example.test", is_anonymous: false },
  admin: false,
};

const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;
const LABELS = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" };

/** Every champion in every role; a deterministic sprinkle of conventional roles. */
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

type DailyState = "available" | "active" | "complete";

function dailyToday(state: DailyState) {
  if (state === "available") return { run: null };
  const stage = (kind: string, index: number, extra: Record<string, unknown> = {}) => ({
    stage_index: index, stage_id: `dr_e2e:${index}:${kind}`, kind,
    ruleset_id: kind === "review" ? "standard" : kind,
    ruleset: { ruleset_id: kind === "review" ? "standard" : kind, time_bank_ms: null, max_strikes: null },
    content_set_id: null, content: { title: kind, focus: null },
    status: "pending", child_match_id: null, live: null, result: null, ...extra,
  });
  const complete = state === "complete";
  return {
    run: {
      schema_version: 1, run_id: "dr_e2e000000000000000000000", policy: "official",
      plan_date: new Date().toISOString().slice(0, 10), plan_version: 5,
      status: "active", outcome: null, current_stage_index: complete ? 1 : 0,
      weak_areas_eligible: false, server_now: new Date().toISOString(),
      main_completed_at: complete ? new Date().toISOString() : null,
      main_score: complete ? 1840 : null,
      stages: [
        stage("standard", 0, complete
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

async function openHub(page: Page, opts: { width: number; height: number; daily?: DailyState; mode?: string }) {
  await page.setViewportSize({ width: opts.width, height: opts.height });
  await page.addInitScript(({ identity }) => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
  }, { identity: account });
  const daily = dailyToday(opts.daily ?? "available");
  // Remote reads only — the app's own modules and assets stay on the dev server.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)[^/]+\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/role-challenges/catalog") return json(catalog());
    if (url.pathname === "/api/role-challenges/status") return json(rcStatus());
    if (url.pathname === "/api/daily-run/today") return json(daily);
    if (url.pathname === "/api/quiz/sets") return json({ sets: [] });
    if (url.pathname.startsWith("/fonts") || url.hostname.includes("fonts.g")) return route.continue();
    // Everything else behaves as an unreachable backend, which every lobby
    // reader already treats as "no data" rather than as an error screen.
    return route.abort("connectionrefused");
  });
  await page.goto(`/quiz${opts.mode ? `?mode=${opts.mode}` : ""}`);
  await expect(page.getByTestId("ranked-hero")).toBeVisible();
  // The entrance unfurl is 560ms (+ stagger); wait for it to settle.
  await page.waitForTimeout(900);
}

type Box = { x: number; y: number; width: number; height: number };

async function sheets(page: Page): Promise<{ left: Box; centre: Box; right: Box }> {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
    };
    return {
      left: box('[data-order="left"]'),
      centre: box('[data-order="centre"]'),
      right: box('[data-order="right"]'),
    };
  });
}

async function selectMode(page: Page, label: "Daily Challenge" | "Role Challenge" | "Ranked") {
  await page.getByRole("tab", { name: label }).click();
  await page.waitForTimeout(350);
}

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const MODES = [
  ["daily", "Daily Challenge"],
  ["role", "Role Challenge"],
  ["ranked", "Ranked"],
] as const;

for (const vp of VIEWPORTS) {
  test(`centre parchment keeps one box across modes at ${vp.width}x${vp.height}`, async ({ page }) => {
    await openHub(page, vp);
    // Role must have finished loading its catalog before it is measured.
    await selectMode(page, "Role Challenge");
    await expect(page.getByTestId("rc-champion-option").first()).toBeVisible();

    const boxes: Record<string, Awaited<ReturnType<typeof sheets>>> = {};
    for (const [id, label] of MODES) {
      await selectMode(page, label);
      boxes[id] = await sheets(page);
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/${vp.width}x${vp.height}-${id}.png`, fullPage: vp.width < 1024 });
        await page.locator('[data-order="centre"]').screenshot({ path: `${SHOTS}/${vp.width}x${vp.height}-${id}-sheet.png` });
      }
    }
    for (const [id] of MODES) {
      expect(boxes[id].centre, `centre sheet in ${id}`).toEqual(boxes.ranked.centre);
      expect(boxes[id].left, `left sheet in ${id}`).toEqual(boxes.ranked.left);
      expect(boxes[id].right, `right sheet in ${id}`).toEqual(boxes.ranked.right);
    }
    // No horizontal page scroll at any width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("Daily shows the seal for play states and a plain results action when finished", async ({ page }) => {
  await openHub(page, { width: 1440, height: 900, daily: "active" });
  await expect(page.getByRole("button", { name: "Continue Daily" })).toBeVisible();
  await expect(page.getByTestId("daily-mode-stats")).toContainText("In progress");
  if (SHOTS) await page.locator('[data-order="centre"]').screenshot({ path: `${SHOTS}/1440x900-daily-active-sheet.png` });

  await openHub(page, { width: 1440, height: 900, daily: "complete" });
  // v5 day with More Challenges still open: carrying on IS play.
  await expect(page.getByRole("button", { name: "Continue / Review" })).toBeVisible();
  await expect(page.getByTestId("daily-mode-stats")).toContainText("1,840");
  await expect(page.getByTestId("daily-mode-stats")).toContainText("9/12");
  await expect(page.getByTestId("daily-mode-mascot")).toHaveAttribute("src", /cheering/);
  if (SHOTS) await page.locator('[data-order="centre"]').screenshot({ path: `${SHOTS}/1440x900-daily-complete-sheet.png` });
});

test("switching modes keeps Role's state, reads its catalog once, and works by keyboard", async ({ page }) => {
  let catalogReads = 0;
  page.on("request", (r) => { if (r.url().endsWith("/api/role-challenges/catalog")) catalogReads += 1; });
  await openHub(page, { width: 390, height: 844 });
  await selectMode(page, "Role Challenge");
  await page.getByLabel("Find a champion").fill("ahri");
  await page.getByRole("radio", { name: /^Ahri/ }).click();
  await selectMode(page, "Ranked");
  await expect(page.getByTestId("ranked-play-gem")).toBeVisible();
  await expect(page.getByTestId("role-challenge-picker")).toBeHidden();
  await selectMode(page, "Role Challenge");
  await expect(page.getByLabel("Find a champion")).toHaveValue("ahri");
  await expect(page.getByTestId("rc-selection")).toContainText("Ahri");
  expect(catalogReads).toBe(1);

  // Tablist keyboard model: arrows move AND select; hidden panes are not tabbable.
  await page.getByRole("tab", { name: "Role Challenge" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Daily Challenge" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Daily Challenge" })).toBeFocused();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.closest("[data-mode-pane]")?.getAttribute("data-mode-pane") ?? null);
  expect(focused === null || focused === "daily").toBe(true);
});

test("reduced motion: no pane fade and no breathing mascot", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHub(page, { width: 1440, height: 900 });
  await selectMode(page, "Ranked");
  await selectMode(page, "Daily Challenge");
  const anims = await page.evaluate(() => ({
    pane: getComputedStyle(document.querySelector('[data-mode-pane="daily"]')!).animationName,
    art: getComputedStyle(document.querySelector('[data-testid="daily-mode-mascot"]')!).animationName,
  }));
  expect(anims).toEqual({ pane: "none", art: "none" });
});
