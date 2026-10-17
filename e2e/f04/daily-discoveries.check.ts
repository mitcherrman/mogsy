/* eslint-disable @typescript-eslint/no-explicit-any -- fixture envelopes are mutated structurally */
/**
 * MISC-W2C (F04) — newly earned question cards on the Daily Standard result,
 * in a real browser.
 *
 * Drives the REAL `/quiz/daily-challenge` page (real `DailyRunPage`, real
 * `useDailyRun`, real hosted `QuizRankedMatch`) through Standard's end on a
 * plan-v5 day, with the discoveries read answered by a payload the real
 * backend projection produced (`dailyMatchDiscoveries.backend.json`), and
 * samples every animation frame of the result from its first paint.
 *
 * Per scenario and viewport it proves:
 *   earned   the panel arrives after the score, nothing above it moves by more
 *            than the ease (the hero and Continue are measured), nothing
 *            overflows sideways, Continue stays enabled and on screen
 *   none     a stage that found nothing is frame-for-frame the same as before
 *   401/err  a guest, an anonymous session, a missing match and a transport
 *            failure leave the result exactly as it was — no panel, no error
 *
 * A plain `playwright` script (not the test runner: Node 24 refuses the JSON
 * fixture imports under the runner's loader), run through vite-node so the
 * project's TypeScript and fixtures load as they do under vitest:
 *
 *   node node_modules/.pnpm/<vite-node>/vite-node.mjs e2e/f04/daily-discoveries.check.ts
 *   F04_BASE_URL=http://localhost:5311  F04_SHOTS=<dir>  F04_ONLY=<substring>
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { modulePointsBlock, privatePlayerV2, publicRoundV2, withPointsScoring } from "../../src/lib/ranked-public/fixtures";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";
import backend from "../../src/lib/ranked-public/__fixtures__/dailyMatchDiscoveries.backend.json";

const TOL = 0.5;
type Mode = "earned" | "none" | "guest401" | "anon403" | "missing404" | "network";
const KINDS = ["standard", "time_trial", "survival", "weak_areas", "review"] as const;
const rulesetOf = (kind: string) => (kind === "survival" || kind === "time_trial" ? kind : "standard");

function stages(done: boolean) {
  return KINDS.map((k, index) => {
    const base = {
      stage_index: index, stage_id: `f04:${index}`, kind: k, ruleset_id: rulesetOf(k),
      ruleset: { ruleset_id: rulesetOf(k), time_bank_ms: k === "time_trial" ? 60000 : null, max_strikes: k === "survival" ? 3 : null },
      content: { title: "F04 fixture", focus: null }, status: "pending", child_match_id: null, live: null, result: null,
    };
    if (index === 0) {
      return done
        ? { ...base, status: "completed", child_match_id: "m1",
          result: { correct: 9, answered: 10, score: 1234, ended_by: "completed", misses: 1 } }
        : { ...base, status: "in_progress", child_match_id: "m1" };
    }
    return base;
  });
}

const T = "2026-10-17T12:00:00+00:00";
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
type Frame = { t: number; flow: string; settled: boolean | null; regions: Record<string, Rect>; scrollX: number; scrollY: number; pageH: number; panelExpanded: string | null };

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
    const card = tid("daily-main-result");
    w.__f.push({
      t: +performance.now().toFixed(1),
      flow: tid("daily-run")?.getAttribute("data-flow-phase") ?? (tid("ranked-match") ? "arena" : "?"),
      settled: card ? card.getAttribute("data-settled") === "true" : null,
      regions: {
        card: R(card), hero: R(tid("result-hero")), snapshot: R(tid("daily-main-result-snapshot-slot")),
        optional: R(tid("daily-main-optional")), cont: R(tid("daily-main-continue")), panel: R(tid("daily-discoveries")),
        panelBody: R(tid("discovery-reveal")),
      },
      scrollX: de.scrollWidth - de.clientWidth, scrollY: Math.round(window.scrollY), pageH: de.scrollHeight,
      panelExpanded: tid("daily-discoveries")?.getAttribute("data-expanded") ?? null,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const body = (mode: Mode) => ({ ...(mode === "earned" ? backend.earned : backend.none), match_id: "m1",
  payload: { ...(mode === "earned" ? backend.earned.payload : backend.none.payload), match_id: "m1" } });

async function playStandard(page: Page, mode: Mode, shots: { dir: string; prefix: string } | null): Promise<{ frames: Frame[]; reads: number }> {
  let over = false;
  let done = false;
  let reads = 0;
  await page.addInitScript(() => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({
      token: "t", user: { id: "userA", email: "f04@example.test", is_anonymous: false }, admin: false }));
  });
  await page.addInitScript(INSTALL);
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["fetch", "xhr"].includes(req.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.hostname === "localhost" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/daily-run/")) {
      const next = {
        schema_version: 1, run_id: "f04-run", plan_date: "2026-10-17", plan_version: 5,
        status: "active", outcome: null,
        current_stage_index: done ? 1 : 0,
        main_completed_at: done ? "2026-10-17T12:00:05Z" : null, main_score: done ? 1234 : null,
        server_now: new Date().toISOString(), stages: stages(done), review_items: [],
      };
      return route.fulfill({ json: url.pathname.endsWith("/today") && req.method() === "GET" ? { run: next } : next });
    }
    if (url.pathname === "/api/ranked/matches/m1/discoveries") {
      reads += 1;
      if (mode === "guest401") return route.fulfill({ status: 401, json: { detail: { code: "AUTH_REQUIRED", message: "sign in" } } });
      if (mode === "anon403") return route.fulfill({ status: 403, json: { detail: { code: "ACCOUNT_REQUIRED", message: "account required" } } });
      if (mode === "missing404") return route.fulfill({ status: 404, json: { detail: { code: "RANKED_MATCH_NOT_FOUND", message: "no" } } });
      if (mode === "network") return route.abort("failed");
      await new Promise((r) => setTimeout(r, 250)); // a real-ish round trip
      return route.fulfill({ json: body(mode) });
    }
    if (url.pathname.includes("/rounds/1/resolved") && over) return route.fulfill({ json: resolved1() });
    if (url.pathname.startsWith("/api/ranked/matches/m1")) {
      if (over) {
        const b = rankedTerminalResponse(url.pathname) as Record<string, any>;
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
          fix(b.payload.public); fix(b.payload.private); b.payload.latest_resolved_round = resolved1();
        } else fix(b);
        stamp(b);
        return route.fulfill({ json: b });
      }
      if (url.pathname.endsWith("/presence")) return route.fulfill({ json: { status: "active", match_id: "m1", active: true } });
      const b = (url.pathname.endsWith("/private") ? privatePlayerV2("userA") : publicRoundV2(false)) as Record<string, any>;
      const now = new Date();
      b.server_time = now.toISOString();
      b.payload.active_round.started_at = new Date(now.getTime() - 3000).toISOString();
      b.payload.active_round.active_deadline = new Date(now.getTime() + 60_000).toISOString();
      withPointsScoring(b, { moduleNumber: 1, matchLength: 1, modulesCompleted: 0, scores: { userA: 0, userB: 0 } });
      b.payload.ruleset = { ruleset_id: "standard", max_strikes: null, strikes: 0, questions_settled: 0, stage_ended: false, live_strikes: 0 };
      if (url.pathname.endsWith("/resume")) {
        const pb = privatePlayerV2("userA") as Record<string, any>;
        pb.server_time = b.server_time; pb.payload.active_round = b.payload.active_round;
        withPointsScoring(pb, { moduleNumber: 1, matchLength: 1, modulesCompleted: 0, scores: {} });
        return route.fulfill({ json: { schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: "m1", round_number: 1,
          server_time: b.server_time, payload: { match_status: "active", match_over: false, public: b, private: pb, latest_resolved_round: null, result: null } } });
      }
      return route.fulfill({ json: b });
    }
    if (url.pathname.includes("/profiles")) return route.fulfill({ json: { id: "p", user_id: "userA", display_name: "F04", is_anonymous: false, is_disabled: false, socials: {} } });
    if (url.pathname === "/api/quiz/builder/catalog") return route.fulfill({ json: { ok: true, capability: { can_build: false, can_save: false, max_saved_sets: 0, allowed_pools: [], max_length: 0, allowed_lengths: [], can_view_trends: false, trend_windows: [], reason: "free" }, pools: [], categories: [], source_types: [], difficulty: { min: 1, max: 5 }, lengths: [], pro_play_category: "pro_play", unsupported_filters: [] } });
    if (url.pathname.startsWith("/api/quiz/")) return route.fulfill({ json: url.pathname.endsWith("/entitlement") ? { ok: true, is_pro: false } : { ok: true, sets: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/quiz?play=1");
  await page.getByTestId("play-mode-daily").click();
  await page.getByTestId("ranked-match").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts.ready);
  over = true;
  await page.getByTestId("daily-main-result").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500); // the pending frame, on its own
  if (shots) await page.screenshot({ path: path.join(shots.dir, `${shots.prefix}-1-pending.png`) });
  done = true;
  await page.waitForFunction(() => document.querySelector('[data-testid="daily-main-result"]')?.getAttribute("data-settled") === "true", null, { timeout: 30_000 });
  await page.waitForTimeout(900);
  if (shots) await page.screenshot({ path: path.join(shots.dir, `${shots.prefix}-2-score.png`) });
  await page.waitForTimeout(2600); // hold (1.2 s) + read + cards + growth
  if (shots) await page.screenshot({ path: path.join(shots.dir, `${shots.prefix}-3-cards.png`) });
  if (mode === "earned") {
    await page.getByTestId("daily-discoveries").scrollIntoViewIfNeeded().catch(() => {});
    if (shots) await page.screenshot({ path: path.join(shots.dir, `${shots.prefix}-4-cards-scrolled.png`) });
  }
  await page.waitForTimeout(800);
  return { frames: await page.evaluate(() => (window as unknown as { __f: Frame[] }).__f), reads };
}

const VIEWPORTS = [
  { w: 1280, h: 800, phone: false }, { w: 390, h: 844, phone: true },
  { w: 360, h: 640, phone: true }, { w: 320, h: 568, phone: true },
] as const;

const h = (r: Rect) => (r ? r[3] - r[1] : 0);
const SHOTS = process.env.F04_SHOTS || "";
const BASE = process.env.F04_BASE_URL || "http://localhost:5311";
const ONLY = process.env.F04_ONLY || "";

class Check extends Error {}
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Check(msg); };

async function earned(page: Page, vp: (typeof VIEWPORTS)[number]) {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const { frames, reads } = await playStandard(page, "earned", SHOTS ? { dir: SHOTS, prefix: `earned-${vp.w}x${vp.h}` } : null);
  ok(reads === 1, `one read for Standard's match, got ${reads}`);
  const card = frames.filter((f) => f.settled !== null);
  const settled = card.filter((f) => f.settled === true);
  const withPanel = settled.filter((f) => f.regions.panel);
  ok(withPanel.length > 10, "the cards never appeared");
  const firstSettled = settled[0], firstPanel = withPanel[0];
  const wait = firstPanel.t - firstSettled.t;
  ok(wait > 1000, `cards must wait for the score to land (~1.2 s), waited ${wait.toFixed(0)} ms`);
  ok(firstPanel.panelExpanded === "false", "the panel must mount closed");
  ok(h(firstPanel.regions.panel) < 4, `the panel must start at (near) zero height, was ${h(firstPanel.regions.panel)}`);
  const growth = withPanel.map((f) => h(f.regions.panel));
  const full = Math.max(...growth);
  ok(full > 120, `the panel has real height once open (${full})`);
  const steps = growth.slice(1).map((v, i) => Math.abs(v - growth[i]));
  const maxStep = Math.max(...steps);
  ok(maxStep < full * 0.5, `no single frame may add the whole panel (max step ${maxStep.toFixed(1)} of ${full.toFixed(1)})`);
  for (const f of card) ok(f.scrollX <= (vp.phone ? 12 : 0), `horizontal overflow ${f.scrollX}`);
  const open = withPanel.at(-1)!;
  ok(open.regions.panel![0] >= -TOL && open.regions.panel![2] <= vp.w + TOL, `panel outside viewport width ${JSON.stringify(open.regions.panel)}`);
  const cont = page.getByTestId("daily-main-continue");
  ok(await cont.isEnabled(), "Continue is enabled");
  await cont.scrollIntoViewIfNeeded();
  const box = await cont.boundingBox();
  ok(box && box.y >= 0 && box.y + box.height <= vp.h + 1, "Continue is on screen after scrolling");
  // The hero's place on the DOCUMENT while the panel opens (before this script scrolls anything).
  const unscrolled = withPanel.filter((f) => f.scrollY === firstPanel.scrollY);
  const heroDoc = unscrolled.map((f) => f.regions.hero![1] + f.scrollY);
  const heroShift = heroDoc.at(-1)! - heroDoc[0];
  const heroStep = Math.max(...heroDoc.slice(1).map((v, i) => Math.abs(v - heroDoc[i])));
  ok(Math.abs(heroStep) < 30, `the hero must ease aside, not snap (max per-frame step ${heroStep.toFixed(1)})`);
  ok(unscrolled.every((f) => Math.abs(f.regions.hero![0] - firstPanel.regions.hero![0]) <= TOL), "the hero moved sideways");
  const eased = growth.findIndex((v) => v >= full - 1);
  return `hero (document) shifted ${heroShift.toFixed(1)}px, max ${heroStep.toFixed(1)}px/frame; panel ${full.toFixed(1)}px opened over ${eased} frames (max step ${maxStep.toFixed(1)}); ` +
    `cards after ${wait.toFixed(0)} ms; page height ${firstPanel.pageH} -> ${open.pageH}`;
}

async function silent(page: Page, mode: Mode) {
  const { frames, reads } = await playStandard(page, mode, null);
  ok(reads >= 1, "the read was attempted");
  const settled = frames.filter((f) => f.settled === true);
  ok(settled.length > 30, "settled frames were painted");
  for (const f of settled) ok(f.regions.panel === null, "no panel may ever render");
  const ref = settled.at(-1)!;
  let worst = 0;
  for (const [i, f] of settled.entries()) {
    for (const k of ["hero", "snapshot", "optional", "cont"]) {
      const a = ref.regions[k], b = f.regions[k];
      if (!a || !b) continue;
      for (let n = 0; n < 4; n++) {
        worst = Math.max(worst, Math.abs(a[n] - b[n]));
        ok(Math.abs(a[n] - b[n]) <= TOL, `settled frame ${i}: "${k}" moved by ${(b[n] - a[n]).toFixed(2)}`);
      }
    }
    ok(f.pageH === ref.pageH, `settled frame ${i}: page height changed ${f.pageH} vs ${ref.pageH}`);
  }
  ok(await page.getByTestId("daily-main-continue").isEnabled(), "Continue is enabled");
  ok((await page.getByRole("alert").count()) === 0, "no alert is shown");
  return `${settled.length} settled frames, max drift ${worst.toFixed(2)}px, ${reads} read(s)`;
}


/**
 * PR #62 review — the floating Community (Friends) trigger is `fixed left-6
 * bottom-6`, 44px, z-40. Is the panel's "Review New Discoveries" CTA actually
 * tappable wherever the page can be scrolled? Samples `elementFromPoint` over a
 * grid inside a control's visible rect at every scroll step (and the max),
 * performs REAL touch taps (CTA centre at a clear scroll position, then the
 * CTA's left strip at a covered one), and does the same sweep for Continue.
 * `/quiz#review` is a legacy hash the hub canonicalises to `#history`.
 */
const PROBE = (id: string) => {
  const cta = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const fr = document.querySelector('[data-testid="friends-drawer-trigger"]') as HTMLElement | null;
  const r = cta.getBoundingClientRect();
  const f = fr?.getBoundingClientRect() ?? null;
  const vis = { l: Math.max(r.left, 0), t: Math.max(r.top, 0), r: Math.min(r.right, innerWidth), b: Math.min(r.bottom, innerHeight) };
  const total = Math.max(0, vis.r - vis.l) * Math.max(0, vis.b - vis.t);
  let hit = 0, n = 0;
  const blockedBy = new Set<string>();
  let coveredPoint: number[] | null = null;
  for (let x = vis.l + 2; x < vis.r - 1; x += 4) for (let y = vis.t + 2; y < vis.b - 1; y += 4) {
    n += 1;
    const el = document.elementFromPoint(x, y);
    if (el && (el === cta || cta.contains(el))) hit += 1;
    else {
      blockedBy.add(el ? (el.getAttribute("data-testid") || el.tagName) : "none");
      // the covered point nearest the trigger's centre: a deliberate tap, not a corner graze
      if (f && el?.closest('[data-testid="friends-drawer-trigger"]')) {
        const d = Math.hypot(x - (f.left + f.right) / 2, y - (f.top + f.bottom) / 2);
        if (!coveredPoint || d < coveredPoint[2]) coveredPoint = [x, y, d];
      }
    }
  }
  const cx = (vis.l + vis.r) / 2, cy = (vis.t + vis.b) / 2;
  const ce = document.elementFromPoint(cx, cy);
  const de = document.documentElement;
  return {
    scrollY: Math.round(scrollY), maxY: Math.round(de.scrollHeight - innerHeight),
    cta: [r.left, r.top, r.right, r.bottom].map((v) => +v.toFixed(1)), friends: f && [f.left, f.top, f.right, f.bottom].map((v) => +v.toFixed(1)),
    visibleFrac: total / (r.width * r.height), reachableFrac: n ? hit / n : 0,
    centreOk: !!ce && (ce === cta || cta.contains(ce)), centre: [Math.round(cx), Math.round(cy)],
    blockedBy: [...blockedBy], coveredPoint,
  };
};

async function sweep(page: Page, id: string) {
  const probe = () => page.evaluate(PROBE, id);
  const maxY = (await probe()).maxY;
  const rows: Awaited<ReturnType<typeof probe>>[] = [];
  for (let y = 0; y <= maxY; y += 40) { await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), y); await page.waitForTimeout(50); rows.push(await probe()); }
  await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), maxY); await page.waitForTimeout(80);
  rows.push(await probe());
  return { rows, probe, maxY };
}

async function overlap(page: Page, vp: (typeof VIEWPORTS)[number]) {
  await playStandard(page, "earned", null);
  const cta = await sweep(page, "discovery-cta");
  const cont = await sweep(page, "daily-main-continue");
  const summarize = (name: string, sw: typeof cta) => {
    const onScreen = sw.rows.filter((r) => r.visibleFrac > 0.99);
    const clear = onScreen.filter((r) => r.reachableFrac > 0.995);
    const covered = sw.rows.filter((r) => r.visibleFrac > 0.5 && r.reachableFrac < 0.995);
    const centreBad = sw.rows.filter((r) => r.visibleFrac > 0.5 && !r.centreOk);
    const atMax = sw.rows.at(-1)!;
    return { line: `${name}: fully on screen at ${onScreen.length}/${sw.rows.length} scroll steps, fully CLEAR at ${clear.length}; partly covered at ${covered.length}` +
      (covered.length ? ` (worst ${(Math.min(...covered.map((r) => r.reachableFrac)) * 100).toFixed(0)}% reachable, by ${[...new Set(covered.flatMap((r) => r.blockedBy))].filter((x) => /friends|button/i.test(x)).join(",") || "friends-drawer-trigger"})` : "") +
      `; centre blocked at ${centreBad.length}; at max scroll reachable ${(atMax.reachableFrac * 100).toFixed(0)}%`, clear, covered, centreBad, atMax };
  };
  const c = summarize("CTA", cta), k = summarize("Continue", cont);
  console.log(`   ${vp.w}x${vp.h} friends=${JSON.stringify(c.atMax.friends)}\n     ${c.line}\n     ${k.line}`);
  ok(c.clear.length > 0, "the CTA is fully clear and on screen at some scroll position");
  ok(c.centreBad.length === 0, `the CTA's centre must never be covered (${c.centreBad.length} steps)`);
  ok(k.centreBad.length === 0, `Continue's centre must never be covered (${k.centreBad.length} steps)`);
  ok(k.atMax.reachableFrac > 0.8, `Continue is mostly reachable at max scroll (${k.atMax.reachableFrac})`);
  // Real tap, centre of the CTA at a clear position.
  const best = c.clear[Math.floor(c.clear.length / 2)];
  await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), best.scrollY); await page.waitForTimeout(100);
  const fresh = await page.evaluate(PROBE, "discovery-cta");
  ok(fresh.centreOk, `CTA centre hits the CTA at scroll ${fresh.scrollY}`);
  // Real tap on the CTA where the trigger covers it most deeply: records what a thumb gets there.
  let stripNote = "no covered position";
  let navigated = false;
  if (c.covered.length) {
    const cv = c.covered[0];
    await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), cv.scrollY);
    await page.waitForTimeout(150);
    const pt = (await page.evaluate(PROBE, "discovery-cta")).coveredPoint;
    if (pt) {
      await page.touchscreen.tap(pt[0], pt[1]); await page.waitForTimeout(500);
      const left = !/daily-challenge/.test(page.url());
      const drawer = await page.getByRole("dialog").count();
      navigated = left;
      stripNote = `deepest covered point ${Math.round(pt[2])}px from the trigger centre at scroll ${cv.scrollY}: ` +
        (left ? "the real tap still lands on the CTA (a graze of the trigger's edge)" : drawer ? "the real tap opens the Community drawer (genuine overlap, pre-existing overlay)" : "the real tap did nothing");
      if (drawer) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
    }
  }
  if (!navigated) {
    await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), best.scrollY); await page.waitForTimeout(150);
    const again = await page.evaluate(PROBE, "discovery-cta");
    ok(again.centreOk, "CTA centre is clear before the tap");
    await page.touchscreen.tap(again.centre[0], again.centre[1]);
  }
  await page.waitForURL(/\/quiz#(review|history)$/, { timeout: 5000 }).catch(() => {});
  ok(/\/quiz#(review|history)$/.test(page.url()), `a real tap on the CTA must reach the hub's review/history, got ${page.url()}`);
  return `CTA clear at ${c.clear.length} steps, partly covered at ${c.covered.length}, centre never blocked; ${stripNote}; real tap -> ${new URL(page.url()).pathname + new URL(page.url()).hash}`;
}

/**
 * Keyboard / assistive focus: Tab (or any focus()) scrolls the CTA into view.
 * Where it lands must clear the fixed trigger (`bottom-6`, 44px => top edge 68px
 * above the viewport bottom). Starts from the top of the page each time.
 */
async function focusLands(page: Page, vp: (typeof VIEWPORTS)[number]) {
  await playStandard(page, "earned", null);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(100);
  await page.evaluate(() => (document.querySelector('[data-testid="discovery-cta"]') as HTMLElement).focus());
  await page.waitForTimeout(150);
  const r = await page.evaluate(PROBE, "discovery-cta");
  const gap = vp.h - r.cta[3];
  ok(r.visibleFrac > 0.99, `the focused CTA must be fully on screen (${r.visibleFrac})`);
  ok(r.reachableFrac > 0.995, `the focused CTA must be fully clear of the Community trigger: ${(r.reachableFrac * 100).toFixed(1)}% reachable, bottom edge ${gap.toFixed(0)}px above the viewport bottom`);
  return `focus lands with ${gap.toFixed(0)}px below the CTA, ${(r.reachableFrac * 100).toFixed(0)}% reachable`;
}

/** Reduced motion (the OS media query, emulated on the context): no hold, no ease, same content. */
async function reducedMotion(page: Page, vp: (typeof VIEWPORTS)[number]) {
  const { frames, reads } = await playStandard(page, "earned", null);
  ok(reads === 1, `one read, got ${reads}`);
  const settled = frames.filter((f) => f.settled === true);
  const withPanel = settled.filter((f) => f.regions.panel);
  ok(withPanel.length > 10, "the cards never appeared");
  const wait = withPanel[0].t - settled[0].t;
  ok(wait < 800, `no 1.2 s hold under reduced motion; waited ${wait.toFixed(0)} ms (read round trip ~250 ms)`);
  ok(withPanel[0].panelExpanded === "true" || withPanel[1].panelExpanded === "true", "the panel opens at once, not by easing");
  ok(withPanel.slice(0, 3).some((f) => h(f.regions.panel) > 120), "full height within three frames");
  for (const f of frames.filter((x) => x.settled !== null)) ok(f.scrollX <= (vp.phone ? 12 : 0), `horizontal overflow ${f.scrollX}`);
  ok(await page.getByTestId("daily-main-continue").isEnabled(), "Continue is enabled");
  ok((await page.getByTestId("discovery-entry").count()) === 3, "all three cards are shown");
  return `cards ${wait.toFixed(0)} ms after settle, open within ${withPanel.findIndex((f) => h(f.regions.panel) > 120)} frames`;
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const results: string[] = [];
  let failed = 0;
  const scenarios: [string, (page: Page) => Promise<string>, (typeof VIEWPORTS)[number], boolean?][] = [];
  for (const vp of VIEWPORTS) {
    scenarios.push([`${vp.w}x${vp.h} earned`, (p) => earned(p, vp), vp]);
    if (vp.phone) scenarios.push([`${vp.w}x${vp.h} overlap`, (p) => overlap(p, vp), vp]);
    if (vp.phone) scenarios.push([`${vp.w}x${vp.h} focus`, (p) => focusLands(p, vp), vp]);
    scenarios.push([`${vp.w}x${vp.h} reduced-motion`, (p) => reducedMotion(p, vp), vp, true]);
    for (const mode of ["none", "guest401", "anon403", "missing404", "network"] as const) {
      scenarios.push([`${vp.w}x${vp.h} ${mode}`, (p) => silent(p, mode), vp]);
    }
  }
  for (const [name, run, vp, reduced] of scenarios) {
    if (ONLY && !name.includes(ONLY)) continue;
    const ctx = await browser.newContext({
      baseURL: BASE, viewport: { width: vp.w, height: vp.h }, ...(reduced ? { reducedMotion: "reduce" as const } : {}),
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    try {
      const note = await run(page);
      results.push(`PASS ${name}: ${note}`);
    } catch (e) {
      failed += 1;
      results.push(`FAIL ${name}: ${(e as Error).message}`);
    } finally {
      await ctx.close();
    }
    console.log(results.at(-1));
  }
  await browser.close();
  console.log(`
${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
void main();
