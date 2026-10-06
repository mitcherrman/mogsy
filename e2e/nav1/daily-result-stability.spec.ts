/* eslint-disable @typescript-eslint/no-explicit-any -- fixture envelopes are mutated structurally */
/**
 * DRS1 — THE DAILY STAGE RESULT HOLDS STILL WHEN THE SCORE LANDS, MEASURED.
 *
 * `DailyStageResult` says its pending state is drawn "so the layout does not
 * jump when the numbers land". It did: the pending hero had no score, the
 * pending body was one "Scoring stage…" line, and the settled body mounted the
 * snapshot grid and the "Up next" row. `DailyRunPage` centres the result, so
 * the card grew ~194px and moved ~96px at each end when the server's result
 * arrived.
 *
 * This drives the REAL `/quiz/daily-challenge` page (real `DailyRunPage`, real
 * `useDailyRun`, real hosted `QuizRankedMatch`) through a stage's end — the
 * live child match going terminal, the hosted handback, `stage-settling`
 * (pending: the server has not stated the result), then `stage-result` — and
 * samples EVERY animation frame of the result card from its first paint to its
 * settled state. Every anchor must match the settled frame to rounding noise,
 * for a Standard, a Time Trial, a Survival and a Review stage.
 *
 *   npx playwright test -c playwright.nav1.config.ts daily-result-stability
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { modulePointsBlock, privatePlayerV2, publicRoundV2, withPointsScoring } from "../../src/lib/ranked-public/fixtures";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";

const TOL = 0.5;

type Kind = "standard" | "time_trial" | "survival" | "weak_areas" | "review";
const KINDS: Kind[] = ["standard", "time_trial", "survival", "weak_areas", "review"];
const rulesetOf = (kind: Kind) => (kind === "survival" || kind === "time_trial" ? kind : "standard");

const RESULT: Record<Kind, { correct: number; answered: number; score: number | null; ended_by: string; misses: number }> = {
  // The widest snapshots a stage can state: every optional cell present.
  standard: { correct: 7, answered: 9, score: 340, ended_by: "completed", misses: 2 },
  time_trial: { correct: 12, answered: 15, score: 1210, ended_by: "time_bank_exhausted", misses: 3 },
  survival: { correct: 8, answered: 11, score: 905, ended_by: "strikes_exhausted", misses: 3 },
  weak_areas: { correct: 4, answered: 6, score: 210, ended_by: "completed", misses: 2 },
  review: { correct: 3, answered: 5, score: 150, ended_by: "completed", misses: 0 },
};

function stagesFor(kind: Kind, done: boolean) {
  const played = KINDS.indexOf(kind);
  return KINDS.map((k, index) => {
    const base = {
      stage_index: index, stage_id: `drs1:${index}`, kind: k, ruleset_id: rulesetOf(k),
      ruleset: { ruleset_id: rulesetOf(k), time_bank_ms: k === "time_trial" ? 60000 : null, max_strikes: k === "survival" ? 3 : null },
      content: { title: "DRS1 fixture", focus: null }, status: "pending", child_match_id: null, live: null, result: null,
    };
    if (index < played) return { ...base, status: "completed", child_match_id: `c${index}`, result: { ...RESULT[k] } };
    if (index === played) {
      return done ? { ...base, status: "completed", child_match_id: "m1", result: { ...RESULT[kind] } }
        : { ...base, status: "in_progress", child_match_id: "m1" };
    }
    return base;
  });
}

const T = "2026-07-18T12:00:00+00:00";
const resolved1 = () => {
  const player = (id: string, scored: boolean) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage", outcome: scored ? "correct" : "incorrect", submitted_at: T,
    answered_first: id === "userA", timed_out: false, selected_ability_id: null,
    damage: { base_damage_dealt: 0, outgoing_bonus: 0, final_damage_dealt: 0, shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 0 },
    hp_before: 170, hp_after: 170, reached_zero_hp: false, xp_gained: 0, total_xp_after: 0, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null, remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 0 }, combat_lab_unlock_delta_seconds: 0,
  });
  return {
    schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round", match_id: "m1", round_number: 1, server_time: T,
    payload: {
      match_id: "m1", round_number: 1, question_id: "q1", end_reason: "both_answered", started_at: T, original_deadline: T, final_deadline: T,
      pressure_applied: false, players: [player("userA", true), player("userB", false)], next_round_duration_seconds: 30,
      next_round_duration_delta: 0, match_over: true, winner_id: "userA", completion_reason: "segments_complete",
      module_points: modulePointsBlock({ userA: { base: 2 }, userB: { base: 0 } }), correct_option_index: 0,
      question_explanation: { scenario_note: "The first option is correct for this probe round." },
    },
  };
};

type Rect = [number, number, number, number] | null;
type Frame = {
  t: number; flow: string; pending: boolean | null;
  regions: Record<string, Rect>;
  pageScroll: number; pageScrollX: number; scrollY: number;
};

/** The measuring loop, installed before any page script: one sample per paint. */
const INSTALL = () => {
  const q = (sel: string) => document.querySelector(sel);
  const R = (el: Element | null): Rect => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return [+b.left.toFixed(2), +b.top.toFixed(2), +b.right.toFixed(2), +b.bottom.toFixed(2)];
  };
  const tid = (id: string) => q(`[data-testid="${id}"]`);
  const w = window as unknown as { __f: unknown[] };
  w.__f = [];
  const tick = () => {
    const de = document.documentElement;
    const card = tid("daily-stage-result");
    w.__f.push({
      t: +performance.now().toFixed(1),
      flow: tid("daily-run")?.getAttribute("data-flow-phase") ?? (tid("ranked-match") ? "arena" : "?"),
      pending: card ? card.getAttribute("data-pending") === "true" : null,
      regions: {
        shell: R(tid("quiz-ranked")), run: R(tid("daily-run")), chrome: R(q("header")),
        card: R(card), tag: R(card?.querySelector('[data-testid="daily-stage-tag"]') ?? null),
        hero: R(tid("result-hero")), headline: R(tid("result-headline")), subheading: R(tid("result-subheading")),
        snapshot: R(tid("daily-stage-result-snapshot-slot")), next: R(tid("daily-stage-result-next-slot")),
        ladder: R(tid("daily-stage-ladder")), snapSettled: R(tid("result-snapshot")), nextRow: R(tid("daily-stage-result-next")),
        score: R(tid("daily-stage-result-correct")), scoring: R(tid("daily-stage-result-scoring")), perfect: R(tid("daily-stage-result-perfect")), cont: R(tid("daily-stage-result-continue")),
      },
      pageScroll: de.scrollHeight - de.clientHeight, pageScrollX: de.scrollWidth - de.clientWidth, scrollY: Math.round(window.scrollY),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function playStage(page: Page, kind: Kind): Promise<Frame[]> {
  let over = false;
  let done = false;
  await page.addInitScript(() => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({
      token: "t", user: { id: "userA", email: "drs1@example.test", is_anonymous: false }, admin: false }));
  });
  await page.addInitScript(INSTALL);
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["fetch", "xhr"].includes(req.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/daily-run/")) {
      const last = kind === "review";
      const next = {
        schema_version: 1, run_id: "drs1-run", plan_date: "2026-09-27",
        status: done && last ? "completed" : "active", outcome: done && last ? "reviewed" : null,
        current_stage_index: done ? (last ? null : KINDS.indexOf(kind) + 1) : KINDS.indexOf(kind),
        server_now: new Date().toISOString(), stages: stagesFor(kind, done), review_items: [],
      };
      return route.fulfill({ json: url.pathname.endsWith("/today") && req.method() === "GET" ? { run: next } : next });
    }
    if (url.pathname.includes("/rounds/1/resolved") && over) return route.fulfill({ json: resolved1() });
    if (url.pathname.startsWith("/api/ranked/matches/m1")) {
      if (over) {
        const body = rankedTerminalResponse(url.pathname) as Record<string, any>;
        const nowIso = new Date().toISOString();
        const stamp = (o: any) => {
          if (o && typeof o === "object") {
            if ("server_time" in o) o.server_time = nowIso;
            for (const v of Object.values(o)) if (v && typeof v === "object") stamp(v);
          }
        };
        const fix = (env: any) => {
          if (env?.payload?.completed_rounds !== undefined) {
            env.payload.completed_rounds = 1; env.round_number = 1;
            withPointsScoring(env, { moduleNumber: 1, matchLength: 1, modulesCompleted: 1, scores: { userA: 2, userB: 0 } });
          }
        };
        if (url.pathname.endsWith("/resume")) {
          fix(body.payload.public); fix(body.payload.private); body.payload.latest_resolved_round = resolved1();
        } else fix(body);
        stamp(body);
        return route.fulfill({ json: body });
      }
      if (url.pathname.endsWith("/presence")) return route.fulfill({ json: { status: "active", match_id: "m1", active: true } });
      const body = (url.pathname.endsWith("/private") ? privatePlayerV2("userA") : publicRoundV2(false)) as Record<string, any>;
      const now = new Date();
      body.server_time = now.toISOString();
      body.payload.active_round.started_at = new Date(now.getTime() - 3000).toISOString();
      body.payload.active_round.active_deadline = new Date(now.getTime() + 60_000).toISOString();
      withPointsScoring(body, { moduleNumber: 1, matchLength: 1, modulesCompleted: 0, scores: { userA: 0, userB: 0 } });
      body.payload.ruleset = { ruleset_id: rulesetOf(kind), max_strikes: kind === "survival" ? 3 : null, strikes: 0,
        questions_settled: 0, stage_ended: false, live_strikes: 0 };
      if (url.pathname.endsWith("/resume")) {
        const pb = privatePlayerV2("userA") as Record<string, any>;
        pb.server_time = body.server_time; pb.payload.active_round = body.payload.active_round;
        withPointsScoring(pb, { moduleNumber: 1, matchLength: 1, modulesCompleted: 0, scores: {} });
        return route.fulfill({ json: { schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: "m1", round_number: 1,
          server_time: body.server_time, payload: { match_status: "active", match_over: false, public: body, private: pb, latest_resolved_round: null, result: null } } });
      }
      return route.fulfill({ json: body });
    }
    if (url.pathname.includes("/profiles")) return route.fulfill({ json: { id: "p", user_id: "userA", display_name: "DRS1", is_anonymous: false, is_disabled: false, socials: {} } });
    if (url.pathname === "/api/quiz/builder/catalog") return route.fulfill({ json: { ok: true, capability: { can_build: false, can_save: false, max_saved_sets: 0, allowed_pools: [], max_length: 0, allowed_lengths: [], can_view_trends: false, trend_windows: [], reason: "free" }, pools: [], categories: [], source_types: [], difficulty: { min: 1, max: 5 }, lengths: [], pro_play_category: "pro_play", unsupported_filters: [] } });
    if (url.pathname.startsWith("/api/quiz/")) return route.fulfill({ json: url.pathname.endsWith("/entitlement") ? { ok: true, is_pro: false } : { ok: true, sets: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/quiz?play=1");
  await page.getByTestId("play-mode-daily").click();
  await page.getByTestId("ranked-match").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  over = true; // the live child match goes terminal; the host hands it back
  // Hold the PENDING state long enough to be its own settled frame, then let
  // the server state the result.
  await page.getByTestId("daily-stage-result").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1800);
  done = true;
  await page.waitForFunction(() => document.querySelector('[data-testid="daily-stage-result"]')?.getAttribute("data-pending") !== "true", null, { timeout: 15_000 });
  await page.waitForTimeout(1200);
  return page.evaluate(() => (window as unknown as { __f: Frame[] }).__f);
}

const VIEWPORTS = [{ w: 1280, h: 800, phone: false }, { w: 375, h: 812, phone: true }] as const;

/** Every number the two rects disagree on. */
function diff(a: Rect, b: Rect): string[] {
  if (a === null || b === null) return a === b ? [] : [`presence ${a ? "yes" : "no"} -> ${b ? "yes" : "no"}`];
  return (["left", "top", "right", "bottom"] as const).flatMap((name, i) =>
    Math.abs(a[i] - b[i]) > TOL ? [`${name} ${a[i].toFixed(1)} -> ${b[i].toFixed(1)} (${(b[i] - a[i]).toFixed(1)})`] : []);
}

const STABLE = ["shell", "run", "chrome", "card", "tag", "hero", "headline", "subheading", "snapshot", "next", "ladder", "cont"];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, ...(vp.phone ? { isMobile: true, hasTouch: true } : {}) });
    for (const kind of KINDS) {
      test(`${kind}: the result card does not move when the score lands`, async ({ page }) => {
        test.setTimeout(90_000);
        const frames = await playStage(page, kind);
        const card = frames.filter((f) => f.pending !== null);
        const pending = card.filter((f) => f.pending === true);
        const settled = card.filter((f) => f.pending === false);
        expect(pending.length, "the pending (stage-settling) result was never painted").toBeGreaterThan(5);
        expect(settled.length, "the settled result was never painted").toBeGreaterThan(5);
        const ref = settled.at(-1)!;

        if (process.env.DRS1_REPORT) {
          const rows: Record<string, string[]> = {};
          for (const f of card) for (const k of STABLE) {
            const d = diff(ref.regions[k], f.regions[k]);
            if (d.length) (rows[k] ??= []).push(...d);
          }
          const worst = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, [...new Set(v)].slice(0, 3)]));
          const h = (r: Rect) => (r ? +(r[3] - r[1]).toFixed(1) : null);
          fs.appendFileSync(process.env.DRS1_REPORT, JSON.stringify({
            vp: `${vp.w}x${vp.h}`, kind, pendingFrames: pending.length, settledFrames: settled.length,
            pendingCard: pending.at(-1)!.regions.card, settledCard: ref.regions.card,
            heights: { pendingCard: h(pending.at(-1)!.regions.card), settledCard: h(ref.regions.card),
              pendingHero: h(pending.at(-1)!.regions.hero), settledHero: h(ref.regions.hero),
              settledSnapshot: h(ref.regions.snapshot), pendingSnapshot: h(pending.at(-1)!.regions.snapshot),
              snap: h(ref.regions.snapSettled), next: h(ref.regions.nextRow), score: h(ref.regions.score), scoring: h(pending.at(-1)!.regions.scoring),
              headline: h(ref.regions.headline), pendHeadline: h(pending.at(-1)!.regions.headline), sub: h(ref.regions.subheading), tag: h(ref.regions.tag), ladder: h(ref.regions.ladder), cont: h(ref.regions.cont) },
            moved: worst, scroll: Math.max(...card.map((f) => f.pageScroll)),
          }) + "\n");
        }

        // The card's regions, every painted frame from first paint to settled.
        for (const [i, f] of card.entries()) {
          // A phone's Survival chrome prints "N answered ·" while the hidden
          // child settles and drops it at the result, which un-wraps a row of
          // DailyStageChrome — its own readout, not the result card. For that one
          // combination the card is compared WITHIN the chrome (shifted by the
          // chrome's own growth) and the chrome itself is not asserted.
          const chromeOnly = vp.phone && kind === "survival";
          const dy = chromeOnly && f.regions.chrome && ref.regions.chrome ? ref.regions.chrome[3] - f.regions.chrome[3] : 0;
          const shifted = (r: Rect): Rect => (r && dy ? [r[0], r[1] + dy, r[2], r[3] + dy] : r);
          for (const k of STABLE) {
            if (chromeOnly && (k === "chrome" || k === "shell")) continue;
            const d = diff(ref.regions[k], chromeOnly ? shifted(f.regions[k]) : f.regions[k]);
            expect(d, `${kind} frame ${i} (${f.pending ? "pending" : "settled"}): "${k}" moved — ${d.join("; ")}`).toEqual([]);
          }
          // The card is taller than a phone's viewport for the wider kinds, so
          // the page scrolls on a phone in BOTH states; what must not happen is
          // the scroll extent changing when the score lands.
          expect(Math.abs(f.pageScroll + dy - ref.pageScroll), `${kind} frame ${i}: the scroll extent changed`).toBeLessThanOrEqual(TOL);
          if (!vp.phone) expect(f.pageScroll, `${kind} frame ${i}: the page scrolls vertically`).toBeLessThanOrEqual(0);
          // (a phone frame carries a few px of existing sideways overflow — the
          // shell's glow bleed — which must simply not change)
          expect(Math.abs(f.pageScrollX - ref.pageScrollX), `${kind} frame ${i}: the sideways overflow changed`).toBeLessThanOrEqual(TOL);
          if (!vp.phone) expect(f.pageScrollX, `${kind} frame ${i}: the page overflows horizontally`).toBeLessThanOrEqual(0);
        }
        // Nothing clipped: the card sits inside the Daily run box.
        const run = ref.regions.run!, c = ref.regions.card!;
        expect(c[1], "the result card starts above its box").toBeGreaterThanOrEqual(run[1] - TOL);
        expect(c[3], "the result card ends below its box").toBeLessThanOrEqual(run[3] + TOL);
      });
    }
  });
}
