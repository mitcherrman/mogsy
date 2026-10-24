import { describe, expect, it } from "vitest";
import {
  BROWSER_STEPS,
  EMAIL_CONFIRMATION_NOT_APPLICABLE,
  accountSignupAnchors,
  computeAccountActivation,
  computeBrowserConversion,
  computeSignupForm,
} from "./conversion";
import { computeCohortRetention } from "./cohorts";
import type {
  AnalyticsDataset,
  AnalyticsEventRecord,
  AnalyticsSessionRecord,
  AnalyticsVisitorRecord,
} from "./metrics";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-24T12:00:00.000Z");
const T = NOW - 20 * DAY; // a cohort anchor old enough for every window
const iso = (t: number) => new Date(t).toISOString();
const BOUNDS = { start: NOW - 30 * DAY, end: NOW + 1 };

function ev(name: string, at: number, o: Partial<AnalyticsEventRecord> = {}): AnalyticsEventRecord {
  return {
    event_name: name,
    received_at: iso(at),
    visitor_id: null,
    session_id: null,
    user_id: null,
    is_guest: null,
    source_system: "web",
    source_entity_type: null,
    source_entity_id: null,
    verification_type: null,
    metadata: null,
    ...o,
  };
}
const web = (name: string, at: number, visitor: string, o: Partial<AnalyticsEventRecord> = {}) =>
  ev(name, at, { visitor_id: visitor, session_id: `s-${visitor}`, ...o });

let entity = 0;
/** A Railway participant start/completion. */
const railway = (
  name: string,
  at: number,
  o: Partial<AnalyticsEventRecord> & { metadata?: Record<string, unknown> } = {},
) =>
  ev(name, at, {
    source_system: "railway",
    source_entity_type: "ranked_participant",
    source_entity_id: `p-${++entity}`,
    ...o,
  });

const session = (visitor: string, at: number, id = `s-${visitor}`): AnalyticsSessionRecord => ({
  session_id: id,
  visitor_id: visitor,
  started_at: iso(at),
  landing_path: "/",
  referrer: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
});
const visitor = (id: string, at: number): AnalyticsVisitorRecord => ({
  visitor_id: id,
  first_seen_at: iso(at),
  first_landing_path: "/",
  first_referrer: null,
  first_utm_source: null,
  first_utm_medium: null,
  first_utm_campaign: null,
});

/** A browser first seen at `at`, with its first session. */
function browser(id: string, at: number) {
  return { visitors: [visitor(id, at)], sessions: [session(id, at)] };
}

function dataset(parts: Partial<AnalyticsDataset>[]): AnalyticsDataset {
  return {
    events: parts.flatMap((p) => p.events ?? []),
    sessions: parts.flatMap((p) => p.sessions ?? []),
    visitors: parts.flatMap((p) => p.visitors ?? []),
  };
}

const step = (r: ReturnType<typeof computeBrowserConversion>, id: string) => r.steps.find((s) => s.id === id)!;

describe("computeBrowserConversion", () => {
  it("follows one browser through every step in order", () => {
    const ds = dataset([
      browser("a", T),
      {
        events: [
          web("leaguecraft_opened", T + HOUR, "a"),
          web("ranked_opened", T + 2 * HOUR, "a"),
          railway("ranked_started", T + 3 * HOUR, { user_id: "u-a", is_guest: true, metadata: { visitor_id: "a" } }),
          web("signup_viewed", T + 4 * HOUR, "a"),
          web("signup_completed", T + 5 * HOUR, "a", { user_id: "u-a", is_guest: false }),
        ],
      },
    ]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(r.steps.map((s) => s.id)).toEqual(BROWSER_STEPS.map((s) => s.id));
    for (const s of r.steps) expect([...s.reached]).toEqual(["a"]);
    expect(r.furthest.account_created).toEqual(new Set(["a"]));
    expect(step(r, "account_created").cumulativeRate).toEqual({ numerator: 1, denominator: 1 });
  });

  it("counts a later step reached out of order as entered later, not as reached", () => {
    const ds = dataset([
      browser("b", T),
      {
        events: [
          web("signup_completed", T + 30 * 60 * 1000, "b", { user_id: "u-b" }),
          web("leaguecraft_opened", T + HOUR, "b"),
        ],
      },
    ]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(step(r, "leaguecraft").reached.has("b")).toBe(true);
    expect(step(r, "account_created").reached.has("b")).toBe(false);
    expect(step(r, "account_created").enteredLater.has("b")).toBe(true);
    expect(r.furthest.leaguecraft.has("b")).toBe(true);
  });

  it("orders by received_at and lets equal timestamps count as after", () => {
    const ds = dataset([
      browser("c", T),
      { events: [web("practice_quiz_opened", T + HOUR, "c"), web("leaguecraft_opened", T + HOUR, "c")] },
    ]);
    expect(step(computeBrowserConversion(ds, BOUNDS, NOW), "intent").reached.has("c")).toBe(true);
  });

  it("requires the later step AFTER the earlier one", () => {
    const ds = dataset([
      browser("c2", T),
      { events: [web("ranked_opened", T + HOUR, "c2"), web("leaguecraft_opened", T + 2 * HOUR, "c2")] },
    ]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(step(r, "leaguecraft").reached.has("c2")).toBe(true);
    expect(step(r, "intent").reached.has("c2")).toBe(false);
    expect(step(r, "intent").enteredLater.has("c2")).toBe(true);
  });

  it("keeps too-recent browsers out of every denominator", () => {
    const ds = dataset([browser("d", NOW - 2 * DAY), browser("old", T)]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(r.cohort).toEqual(new Set(["d", "old"]));
    expect(r.tooRecent).toEqual(new Set(["d"]));
    expect(r.eligible).toEqual(new Set(["old"]));
    expect(step(r, "entered").reached.has("d")).toBe(false);
    expect(step(r, "leaguecraft").stepRate).toEqual({ numerator: 0, denominator: 1 });
  });

  it("ignores steps outside the browser's own window", () => {
    const ds = dataset([browser("e", T), { events: [web("leaguecraft_opened", T + 8 * DAY, "e")] }]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(step(r, "leaguecraft").reached.has("e")).toBe(false);
    expect(step(r, "leaguecraft").enteredLater.has("e")).toBe(false);
  });

  it("excludes browsers first seen before the cohort bounds (returning browsers)", () => {
    const ds = dataset([
      browser("r", NOW - 60 * DAY),
      { sessions: [session("r", T, "s-r2")], events: [web("leaguecraft_opened", T, "r")] },
    ]);
    expect(computeBrowserConversion(ds, BOUNDS, NOW).cohort.has("r")).toBe(false);
  });

  it("never multiplies a browser by duplicate rows or repeat sessions", () => {
    const lc = web("leaguecraft_opened", T + HOUR, "f");
    const ds = dataset([
      browser("f", T),
      { sessions: [session("f", T + 2 * DAY, "s-f2")], events: [lc, { ...lc }, web("leaguecraft_opened", T + 2 * DAY, "f", { session_id: "s-f2" })] },
    ]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(step(r, "leaguecraft").reached.size).toBe(1);
    expect(r.eligible.size).toBe(1);
  });

  it("never fans a Railway row out to browsers by user id", () => {
    const ds = dataset([
      browser("g", T),
      {
        events: [
          web("leaguecraft_opened", T + HOUR, "g", { user_id: "u-g" }),
          web("ranked_opened", T + 2 * HOUR, "g", { user_id: "u-g" }),
          railway("ranked_started", T + 3 * HOUR, { user_id: "u-g", is_guest: true }),
        ],
      },
    ]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(step(r, "server_play").reached.has("g")).toBe(false);
    expect(r.serverPlayCoverage).toEqual({ correlated: 0, total: 1 });
  });

  it("correlates a Railway row by its session id, and refuses a contradictory one", () => {
    const base = [
      web("leaguecraft_opened", T + HOUR, "h"),
      web("ranked_opened", T + 2 * HOUR, "h"),
    ];
    const bySession = dataset([
      browser("h", T),
      { events: [...base, railway("ranked_started", T + 3 * HOUR, { metadata: { session_id: "s-h" } })] },
    ]);
    expect(step(computeBrowserConversion(bySession, BOUNDS, NOW), "server_play").reached.has("h")).toBe(true);

    const conflicting = dataset([
      browser("h", T),
      browser("other", T),
      {
        events: [
          ...base,
          railway("ranked_started", T + 3 * HOUR, { metadata: { visitor_id: "h", session_id: "s-other" } }),
        ],
      },
    ]);
    const r = computeBrowserConversion(conflicting, BOUNDS, NOW);
    expect(step(r, "server_play").reached.has("h")).toBe(false);
    expect(r.serverPlayCoverage).toEqual({ correlated: 0, total: 1 });
  });

  it("never counts a browser-authored gameplay row as a server play", () => {
    const ds = dataset([
      browser("i", T),
      {
        events: [
          web("leaguecraft_opened", T + HOUR, "i"),
          web("ranked_opened", T + 2 * HOUR, "i"),
          web("ranked_started", T + 3 * HOUR, "i"),
        ],
      },
    ]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(step(r, "server_play").reached.has("i")).toBe(false);
    expect(r.serverPlayCoverage.total).toBe(0);
  });

  it("puts every eligible browser in exactly one furthest-step bucket", () => {
    const ds = dataset([
      browser("j1", T),
      browser("j2", T),
      browser("j3", T),
      { events: [web("leaguecraft_opened", T + HOUR, "j2"), web("leaguecraft_opened", T + HOUR, "j3"), web("ranked_opened", T + 2 * HOUR, "j3")] },
    ]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    const all = Object.values(r.furthest).flatMap((s) => [...s]);
    expect(all.sort()).toEqual(["j1", "j2", "j3"]);
    expect(r.furthest.entered).toEqual(new Set(["j1"]));
    expect(r.furthest.leaguecraft).toEqual(new Set(["j2"]));
    expect(r.furthest.intent).toEqual(new Set(["j3"]));
  });

  it("reads Daily stage starts and Standard-stage completions only from attributed server rows", () => {
    const daily = { host: "daily_challenge", parent_activity_type: "daily_challenge", parent_activity_id: "run-1", visitor_id: "k" };
    const ds = dataset([
      browser("k", T),
      {
        events: [
          railway("ranked_started", T + HOUR, { metadata: { ...daily, parent_stage_index: 0, parent_stage_kind: "standard" } }),
          railway("ranked_completed", T + 2 * HOUR, { metadata: { ...daily, parent_stage_index: 0, parent_stage_kind: "standard" } }),
          // No Daily parent id: not a Daily stage.
          railway("ranked_completed", T + 3 * HOUR, { metadata: { host: "daily_challenge", visitor_id: "k", parent_stage_kind: "standard" } }),
        ],
      },
    ]);
    const r = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(r.daily.started).toEqual({ numerator: 1, denominator: 1 });
    expect(r.daily.standardCompleted).toEqual({ numerator: 1, denominator: 1 });
  });

  it("is unavailable when any read hit the row cap", () => {
    const r = computeBrowserConversion(dataset([browser("x", T)]), BOUNDS, NOW, {
      truncated: { events: false, sessions: false, visitors: true },
    });
    expect(r.unavailableReason).toMatch(/visitors read reached the row cap/);
    expect(computeBrowserConversion(dataset([]), BOUNDS, NOW, { truncated: { events: false, sessions: false, visitors: false } }).unavailableReason).toBeUndefined();
  });
});

describe("computeSignupForm", () => {
  it("orders viewed → submitted → created inside 24h of the first view", () => {
    const ds = dataset([
      {
        events: [
          web("signup_viewed", T, "a", { metadata: { entry_surface: "hud" } }),
          web("signup_started", T + 60_000, "a"),
          web("signup_completed", T + 60_000, "a", { user_id: "u-a", metadata: { upgraded_from_guest: false } }),
          // Created before submitting: not counted as created.
          web("signup_viewed", T, "b", { metadata: { entry_surface: "hud" } }),
          web("signup_completed", T + 1000, "b", { user_id: "u-b" }),
          web("signup_started", T + 2000, "b"),
          // Submitted after the 24h window.
          web("signup_viewed", T, "c", { metadata: { entry_surface: "ranked_gate" } }),
          web("signup_started", T + 25 * HOUR, "c"),
          // Too recent.
          web("signup_viewed", NOW - HOUR, "d"),
        ],
      },
    ]);
    const r = computeSignupForm(ds, BOUNDS, NOW);
    expect(r.eligible).toEqual(new Set(["a", "b", "c"]));
    expect(r.tooRecent).toEqual(new Set(["d"]));
    expect(r.submitted).toEqual(new Set(["a", "b"]));
    expect(r.created).toEqual(new Set(["a"]));
    expect(r.viewToSubmit).toEqual({ numerator: 2, denominator: 3 });
    expect(r.submitToCreate).toEqual({ numerator: 1, denominator: 2 });
    expect(r.createdDirect).toBe(1);
    expect(r.bySurface).toEqual([
      { entrySurface: "hud", viewed: 2, submitted: 2, created: 1 },
      { entrySurface: "ranked_gate", viewed: 1, submitted: 0, created: 0 },
    ]);
  });

  it("reports completions with no earlier view in the same browser separately", () => {
    const ds = dataset([
      { events: [web("signup_started", T, "g"), web("signup_completed", T + 1000, "g", { user_id: "u-g" })] },
    ]);
    const r = computeSignupForm(ds, BOUNDS, NOW);
    expect(r.eligible.size).toBe(0);
    expect(r.completedWithoutView).toEqual(new Set(["g"]));
  });
});

describe("computeAccountActivation", () => {
  const signup = (u: string, at: number, fromGuest: boolean | undefined, v = `v-${u}`) =>
    web("signup_completed", at, v, {
      user_id: u,
      is_guest: false,
      metadata: fromGuest === undefined ? {} : { upgraded_from_guest: fromGuest },
    });

  it("uses exactly the Retention V2 account anchor", () => {
    const ds = dataset([
      {
        events: [
          signup("u1", T, true),
          signup("u1", T + DAY, true, "v-other"), // a second browser's row: same account, earliest wins
          signup("u2", T + 2 * DAY, false),
          web("signup_completed", T, "v-null", { metadata: { upgraded_from_guest: false } }), // no uid
          signup("u3", NOW - 40 * DAY, false), // outside bounds
        ],
      },
    ]);
    const anchors = accountSignupAnchors(ds);
    expect(anchors.get("u1")).toEqual({ at: T, origin: "guest_upgrade" });
    expect(anchors.size).toBe(3);
    const ours = computeAccountActivation(ds, BOUNDS, NOW);
    const retention = computeCohortRetention(ds, BOUNDS, NOW, "account", "week");
    expect(ours.cohort.size).toBe(retention.units);
    expect(ours.cohort).toEqual(new Set(["u1", "u2"]));
  });

  it("measures guest play before signup for guest upgrades only", () => {
    const ds = dataset([
      {
        events: [
          signup("g1", T, true),
          railway("ranked_started", T - HOUR, { user_id: "g1", is_guest: true }),
          signup("g2", T, true),
          signup("d1", T, false),
          railway("ranked_started", T - HOUR, { user_id: "d1", is_guest: true }),
        ],
      },
    ]);
    const r = computeAccountActivation(ds, BOUNDS, NOW);
    expect(r.guestUpgrades).toEqual(new Set(["g1", "g2"]));
    expect(r.playedBeforeSignup).toEqual(new Set(["g1"]));
    expect(r.playedBeforeSignupRate).toEqual({ numerator: 1, denominator: 2 });
  });

  it("separates activation (0–7d) from playing again (24h–8d)", () => {
    const ds = dataset([
      {
        events: [
          signup("a", T, false),
          railway("ranked_started", T + 12 * HOUR, { user_id: "a", is_guest: false }),
          signup("b", T, false),
          railway("practice_quiz_started", T + 2 * DAY, { user_id: "b", is_guest: false, source_entity_type: "quiz_session" }),
          signup("c", T, false),
          web("ranked_started", T + 2 * DAY, "v-c", { user_id: "c", is_guest: false }), // browser-authored: ignored
          railway("ranked_started", T + 9 * DAY, { user_id: "c", is_guest: false }), // after both windows
        ],
      },
    ]);
    const r = computeAccountActivation(ds, BOUNDS, NOW);
    expect(r.activated).toEqual(new Set(["a", "b"]));
    expect(r.activatedRate).toEqual({ numerator: 2, denominator: 3 });
    expect(r.playedAgain).toEqual(new Set(["b"]));
    expect(r.playedAgainRate).toEqual({ numerator: 1, denominator: 3 });
  });

  it("keeps accounts whose window has not elapsed out of the denominator", () => {
    const ds = dataset([{ events: [signup("new", NOW - 3 * DAY, false), signup("mid", NOW - 7.5 * DAY, false)] }]);
    const r = computeAccountActivation(ds, BOUNDS, NOW);
    expect(r.activationTooRecent).toEqual(new Set(["new"]));
    expect(r.activatedRate.denominator).toBe(1);
    expect(r.playedAgainTooRecent).toEqual(new Set(["new", "mid"]));
    expect(r.playedAgainRate.denominator).toBe(0);
  });

  it("counts a shared browser's two accounts as two accounts and one browser", () => {
    const ds = dataset([
      browser("shared", T),
      { events: [signup("x1", T + HOUR, false, "shared"), signup("x2", T + 2 * HOUR, false, "shared")] },
    ]);
    expect(computeAccountActivation(ds, BOUNDS, NOW).cohort.size).toBe(2);
    const browsers = computeBrowserConversion(ds, BOUNDS, NOW);
    expect(browsers.eligible.size).toBe(1);
  });

  it("states email confirmation as not applicable rather than zero", () => {
    const r = computeAccountActivation(dataset([]), BOUNDS, NOW);
    expect(r.emailConfirmation).toEqual({ available: false, reason: EMAIL_CONFIRMATION_NOT_APPLICABLE });
  });
});
