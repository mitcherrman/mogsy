// ---------------------------------------------------------------------------
// FUNNEL1C — Admin › Analytics metric definitions, pinned.
//
// Every definition the page states in words is asserted here in numbers:
// date-range semantics, funnel reach, gameplay branches (and the authority
// rule), new/returning, D1/D7 cohorts, sources, integrity checks, empty
// states, and the exclusion of Arena / Match & Rank data.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTHORITATIVE_EVENTS,
  computeAccounts,
  computeDaily,
  computeFunnel,
  computeGameplay,
  computeHealth,
  computeOverview,
  computeRetention,
  computeSources,
  formatRate,
  GAMEPLAY_MODES,
  MIN_RATE_SAMPLE,
  referrerHost,
  retentionRate,
  type AnalyticsDataset,
  type AnalyticsEventRecord,
  type AnalyticsSessionRecord,
  type AnalyticsVisitorRecord,
  type LatestReceived,
} from "./metrics";
import { DEFAULT_RANGE, inRange, parseRangePreset, resolveRange } from "./range";
import { readAllPages } from "./loadAnalytics";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-09-22T12:00:00.000Z");
const iso = (t: number) => new Date(t).toISOString();

function ev(
  name: string,
  at: number,
  o: Partial<AnalyticsEventRecord> = {},
): AnalyticsEventRecord {
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

/** A browser event on a visitor's session. */
const web = (name: string, at: number, visitor: string, session: string, o: Partial<AnalyticsEventRecord> = {}) =>
  ev(name, at, { visitor_id: visitor, session_id: session, ...o });

/** A Railway-authoritative gameplay row. */
const railway = (name: string, at: number, entity: string, o: Partial<AnalyticsEventRecord> = {}) =>
  ev(name, at, { source_system: "railway", source_entity_type: "entity", source_entity_id: entity, ...o });

function sess(id: string, visitor: string, at: number, o: Partial<AnalyticsSessionRecord> = {}): AnalyticsSessionRecord {
  return {
    session_id: id,
    visitor_id: visitor,
    started_at: iso(at),
    landing_path: "/",
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    ...o,
  };
}

function vis(id: string, at: number, o: Partial<AnalyticsVisitorRecord> = {}): AnalyticsVisitorRecord {
  return {
    visitor_id: id,
    first_seen_at: iso(at),
    first_landing_path: "/",
    first_referrer: null,
    first_utm_source: null,
    first_utm_medium: null,
    first_utm_campaign: null,
    ...o,
  };
}

const EMPTY: AnalyticsDataset = { events: [], sessions: [], visitors: [] };
const r7 = resolveRange("7d", NOW);
const r30 = resolveRange("30d", NOW);
const rAll = resolveRange("all", NOW);

// --- Range -----------------------------------------------------------------

describe("date range semantics", () => {
  it("parses presets from the URL and falls back to the default", () => {
    expect(parseRangePreset("30d")).toBe("30d");
    expect(parseRangePreset("all")).toBe("all");
    expect(parseRangePreset(null)).toBe(DEFAULT_RANGE);
    expect(parseRangePreset("90d")).toBe(DEFAULT_RANGE);
    expect(DEFAULT_RANGE).toBe("7d");
  });

  it("anchors Today at UTC midnight and rolling windows at now", () => {
    const today = resolveRange("today", NOW);
    expect(today.start).toBe(Date.parse("2026-09-22T00:00:00.000Z"));
    expect(r7.start).toBe(NOW - 7 * DAY);
    expect(r30.start).toBe(NOW - 30 * DAY);
    expect(rAll.start).toBeNull();
  });

  it("is half-open and includes now", () => {
    expect(inRange(NOW, r7)).toBe(true);
    expect(inRange(NOW - 7 * DAY, r7)).toBe(true);
    expect(inRange(NOW - 7 * DAY - 1, r7)).toBe(false);
    expect(inRange(0, rAll)).toBe(true);
  });

  it("scopes every count to the range", () => {
    const ds: AnalyticsDataset = {
      events: [web("hub_entered", NOW - 10 * DAY, "old", "s-old"), web("hub_entered", NOW - HOUR, "new", "s-new")],
      sessions: [sess("s-old", "old", NOW - 10 * DAY), sess("s-new", "new", NOW - HOUR)],
      visitors: [vis("old", NOW - 10 * DAY), vis("new", NOW - HOUR)],
    };
    expect(computeOverview(ds, r7, NOW).visitors).toBe(1);
    expect(computeOverview(ds, r30, NOW).visitors).toBe(2);
    expect(computeOverview(ds, resolveRange("today", NOW), NOW).sessions).toBe(1);
  });
});

// --- Empty -----------------------------------------------------------------

describe("empty states", () => {
  it("computes true zeros from an empty store, and never invents retention", () => {
    const o = computeOverview(EMPTY, r7, NOW);
    expect(o).toMatchObject({ visitors: 0, sessions: 0, newVisitors: 0, returningVisitors: 0, signups: 0 });
    expect(o.d1).toEqual({ eligible: 0, retained: 0, tooRecent: 0 });
    expect(computeRetention(EMPTY, r7, NOW).sessionsPerVisitor).toBeNull();
    expect(computeGameplay(EMPTY, r7).every((m) => m.openedEvents === 0)).toBe(true);
    expect(computeSources(EMPTY, r7).firstTouch.total).toBe(0);
    expect(computeDaily(EMPTY, r7)).toEqual([]);
  });

  it("marks verification unavailable rather than zero while no emitter is live", () => {
    const step = computeFunnel(EMPTY, r7, NOW).find((s) => s.id === "verification")!;
    expect(step.visitors).toBeNull();
    expect(step.unavailableReason).toMatch(/not yet instrumented/i);
    expect(computeAccounts(EMPTY, r7).verification.available).toBe(false);
  });

  it("renders a rate as a dash with no denominator", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate({ numerator: 0, denominator: 0 })).toBe("—");
  });
});

// --- New / returning ---------------------------------------------------------

describe("new vs returning", () => {
  // A: first seen 10 days ago, comes back inside the week.
  // B: first seen this week, visits twice.
  // C: first seen this week, visits once.
  const ds: AnalyticsDataset = {
    events: [],
    sessions: [
      sess("a1", "A", NOW - 10 * DAY),
      sess("a2", "A", NOW - 2 * DAY),
      sess("b1", "B", NOW - 3 * DAY),
      sess("b2", "B", NOW - 1 * DAY),
      sess("c1", "C", NOW - 1 * HOUR),
    ],
    visitors: [vis("A", NOW - 10 * DAY), vis("B", NOW - 3 * DAY), vis("C", NOW - HOUR)],
  };

  it("counts new visitors by first-ever session in range", () => {
    expect(computeOverview(ds, r7, NOW).newVisitors).toBe(2); // B, C
  });

  it("counts returning visitors by a non-first session in range; a new visitor can also return", () => {
    const o = computeOverview(ds, r7, NOW);
    expect(o.returningVisitors).toBe(2); // A (a2), B (b2)
    expect(o.repeatSessions).toBe(2);
    expect(o.sessions).toBe(4);
    expect(o.visitors).toBe(3);
  });

  it("uses history before the range to decide what is repeat", () => {
    // Over all time A's first session is a1, so a1 is not repeat.
    expect(computeOverview(ds, rAll, NOW).repeatSessions).toBe(2);
    expect(computeRetention(ds, r7, NOW).sessionsPerVisitor).toBeCloseTo(4 / 3);
  });

  it("does not treat a click as a return", () => {
    const clicky: AnalyticsDataset = {
      events: [
        web("hub_entered", NOW - HOUR, "C", "c1"),
        web("leaguecraft_opened", NOW - HOUR + 1000, "C", "c1"),
        web("practice_quiz_opened", NOW - HOUR + 2000, "C", "c1"),
      ],
      sessions: [sess("c1", "C", NOW - HOUR)],
      visitors: [vis("C", NOW - HOUR)],
    };
    expect(computeOverview(clicky, r7, NOW).returningVisitors).toBe(0);
    expect(computeFunnel(clicky, r7, NOW).find((s) => s.id === "returned")!.visitors).toBe(0);
  });

  it("uses the earlier of first_seen_at and the first session as first-seen", () => {
    const skewed: AnalyticsDataset = {
      events: [],
      sessions: [sess("s1", "V", NOW - 20 * DAY), sess("s2", "V", NOW - DAY)],
      visitors: [vis("V", NOW - 2 * DAY)], // written late: the session is the truth
    };
    expect(computeOverview(skewed, r7, NOW).newVisitors).toBe(0);
    expect(computeOverview(skewed, r7, NOW).returningVisitors).toBe(1);
  });
});

// --- D1 / D7 -----------------------------------------------------------------

describe("D1 / D7 cohort definitions", () => {
  const ds: AnalyticsDataset = {
    events: [],
    sessions: [
      // R: first seen 3d ago, back at +30h → D1 retained.
      sess("r1", "R", NOW - 3 * DAY),
      sess("r2", "R", NOW - 3 * DAY + 30 * HOUR),
      // L: first seen 3d ago, back at +50h → outside the D1 window.
      sess("l1", "L", NOW - 3 * DAY),
      sess("l2", "L", NOW - 3 * DAY + 50 * HOUR),
      // T: first seen 1h ago → too recent for D1.
      sess("t1", "T", NOW - HOUR),
      // W: first seen 10d ago, back at +7.5d → D7 retained (30d range only).
      sess("w1", "W", NOW - 10 * DAY),
      sess("w2", "W", NOW - 10 * DAY + 7.5 * DAY),
    ],
    visitors: [],
  };

  it("D1: a session 24–48h after first seen, among visitors at least 48h old", () => {
    const r = computeRetention(ds, r7, NOW);
    expect(r.cohortSize).toBe(3); // R, L, T
    expect(r.d1).toEqual({ eligible: 2, retained: 1, tooRecent: 1 });
    expect(formatRate(retentionRate(r.d1))).toBe("1 / 2");
  });

  it("D7: insufficient history when nobody in the cohort is 8 days old", () => {
    const r = computeRetention(ds, r7, NOW);
    expect(r.d7.eligible).toBe(0);
    expect(r.d7.tooRecent).toBe(3);
  });

  it("D7: a session 7–8 days after first seen, among visitors at least 8 days old", () => {
    const r = computeRetention(ds, r30, NOW);
    expect(r.d7).toEqual({ eligible: 1, retained: 1, tooRecent: 3 });
  });

  it("shows a percentage only once the eligible cohort reaches the minimum sample", () => {
    expect(formatRate({ numerator: 3, denominator: MIN_RATE_SAMPLE - 1 })).toBe(`3 / ${MIN_RATE_SAMPLE - 1}`);
    expect(formatRate({ numerator: 10, denominator: MIN_RATE_SAMPLE })).toBe("50%");
  });
});

// --- Funnel ------------------------------------------------------------------

describe("acquisition funnel", () => {
  const ds: AnalyticsDataset = {
    events: [
      // V1: the full path through the front door.
      web("landing_viewed", NOW - 5 * HOUR, "V1", "s1"),
      web("hub_entered", NOW - 5 * HOUR + 1, "V1", "s1"),
      web("leaguecraft_opened", NOW - 5 * HOUR + 2, "V1", "s1"),
      web("practice_quiz_opened", NOW - 5 * HOUR + 3, "V1", "s1", { user_id: "u1", is_guest: true }),
      web("signup_completed", NOW - 5 * HOUR + 4, "V1", "s1", { user_id: "u1", is_guest: false }),
      // V2: a direct link into /quiz — no landing, no hub.
      web("leaguecraft_opened", NOW - 2 * HOUR, "V2", "s2", { user_id: "u2", is_guest: true }),
      // u2 starts Practice server-side without a browser mode-open row.
      railway("practice_quiz_started", NOW - 2 * HOUR + 5, "q-2", { user_id: "u2", is_guest: true }),
    ],
    sessions: [sess("s1", "V1", NOW - 5 * HOUR), sess("s2", "V2", NOW - 2 * HOUR)],
    visitors: [vis("V1", NOW - 5 * HOUR), vis("V2", NOW - 2 * HOUR)],
  };
  const steps = computeFunnel(ds, r7, NOW);
  const step = (id: string) => steps.find((s) => s.id === id)!;

  it("has the seven conceptual steps in order", () => {
    expect(steps.map((s) => s.id)).toEqual([
      "landing",
      "hub",
      "leaguecraft",
      "engaged",
      "account",
      "verification",
      "returned",
    ]);
  });

  it("counts reach per step without forcing order", () => {
    expect(step("landing").visitors).toBe(1);
    expect(step("hub").visitors).toBe(1);
    // V2 arrived by direct link and still counts: a later step exceeds an earlier one.
    expect(step("leaguecraft").visitors).toBe(2);
    expect(step("account").visitors).toBe(1);
  });

  it("counts Engaged from a mode-open OR a Railway start linked by user id", () => {
    expect(step("engaged").visitors).toBe(2);
  });

  it("counts verification progress by type once verification rows exist", () => {
    const withVerification: AnalyticsDataset = {
      ...ds,
      events: [
        ...ds.events,
        web("verification_completed", NOW - HOUR, "V1", "s1", { verification_type: "discord" }),
      ],
    };
    expect(computeFunnel(withVerification, r7, NOW).find((s) => s.id === "verification")!.visitors).toBe(1);
  });
});

// --- Gameplay ------------------------------------------------------------------

describe("gameplay branches", () => {
  const ds: AnalyticsDataset = {
    events: [
      web("practice_quiz_opened", NOW - HOUR, "V", "s", { user_id: "u" }),
      web("practice_quiz_opened", NOW - HOUR + 1, "V", "s", { user_id: "u" }),
      // A browser row that claims a server-authoritative name: never counted.
      web("practice_quiz_started", NOW - HOUR + 2, "V", "s", { user_id: "u" }),
      railway("practice_quiz_started", NOW - HOUR + 3, "259", { user_id: "u", is_guest: true }),
      railway("practice_quiz_completed", NOW - HOUR + 4, "259", { user_id: "u", is_guest: true }),
      // Ranked played with no Practice at all: branches are independent.
      railway("ranked_started", NOW - HOUR, "m1:x", { user_id: "x", is_guest: false }),
      railway("ranked_started", NOW - HOUR, "m1:y", { user_id: "y", is_guest: false }),
      railway("ranked_completed", NOW - HOUR, "m1:x", { user_id: "x", is_guest: false }),
      web("meta_reflex_opened", NOW - HOUR, "V", "s"),
    ],
    sessions: [sess("s", "V", NOW - HOUR)],
    visitors: [vis("V", NOW - HOUR)],
  };
  const modes = Object.fromEntries(computeGameplay(ds, r7).map((m) => [m.mode.id, m]));

  it("lists the five branches, none derived from another", () => {
    expect(GAMEPLAY_MODES.map((m) => m.label)).toEqual([
      "Practice Quiz",
      "Ranked",
      "Meta Reflex",
      "Champion Mastery",
      "Daily Score Attack",
    ]);
    expect(modes.ranked.started).toBe(2);
    expect(modes.practice.started).toBe(1);
  });

  it("separates browser opens from Railway starts and completions", () => {
    expect(modes.practice.openedEvents).toBe(2);
    expect(modes.practice.openedVisitors).toBe(1);
    expect(modes.practice.started).toBe(1); // the web 'started' row is excluded
    expect(modes.practice.completed).toBe(1);
    expect(modes.practice.startedByGuests).toBe(1);
  });

  it("counts Ranked per participant, as the contract emits it", () => {
    expect(modes.ranked.startedUsers).toBe(2);
    expect(modes.ranked.completed).toBe(1);
    expect(formatRate(modes.ranked.completion)).toBe("1 / 2");
  });

  it("has no authoritative start/complete for Meta Reflex, and says so", () => {
    expect(modes.meta_reflex.openedEvents).toBe(1);
    expect(modes.meta_reflex.started).toBeNull();
    expect(modes.meta_reflex.completed).toBeNull();
    expect(modes.meta_reflex.mode.gap).toMatch(/no authoritative emitter/i);
  });

  it("reserves exactly the eight B3 names as server-authoritative", () => {
    expect([...AUTHORITATIVE_EVENTS].sort()).toEqual(
      [
        "dsa_completed",
        "dsa_started",
        "mastery_completed",
        "mastery_started",
        "practice_quiz_completed",
        "practice_quiz_started",
        "ranked_completed",
        "ranked_started",
      ].sort(),
    );
  });
});

// --- Accounts ------------------------------------------------------------------

describe("accounts", () => {
  const ds: AnalyticsDataset = {
    events: [
      web("signup_viewed", NOW - 3 * HOUR, "V1", "s1"),
      web("signup_viewed", NOW - 3 * HOUR, "V2", "s2"),
      web("signup_started", NOW - 3 * HOUR + 1, "V1", "s1"),
      web("signup_completed", NOW - 3 * HOUR + 2, "V1", "s1", {
        user_id: "u1",
        is_guest: false,
        metadata: { upgraded_from_guest: true },
      }),
      web("signup_completed", NOW - HOUR, "V3", "s3", {
        user_id: "u3",
        is_guest: false,
        metadata: { upgraded_from_guest: false },
      }),
      web("hub_entered", NOW - HOUR, "V2", "s2", { user_id: "g2", is_guest: true }),
      railway("dsa_started", NOW - HOUR, "run-1", { user_id: "g2", is_guest: true }),
      railway("mastery_started", NOW - HOUR, "ms-1", { user_id: "u3", is_guest: false }),
      web("verification_started", NOW - HOUR, "V3", "s3", { verification_type: "email" }),
      web("verification_failed", NOW - HOUR, "V3", "s3", { verification_type: "email" }),
      web("verification_completed", NOW - HOUR, "V3", "s3", { verification_type: "discord" }),
    ],
    sessions: [sess("s1", "V1", NOW - 3 * HOUR), sess("s2", "V2", NOW - 3 * HOUR), sess("s3", "V3", NOW - HOUR)],
    visitors: [],
  };
  const a = computeAccounts(ds, r7);

  it("builds the signup funnel from distinct visitors", () => {
    expect(a.signupViewed).toBe(2);
    expect(a.signupStarted).toBe(1);
    expect(a.signupCompleted).toBe(2);
    expect(a.viewToComplete).toEqual({ numerator: 1, denominator: 2 });
  });

  it("separates guest upgrades from brand-new accounts", () => {
    expect(a.completedFromGuest).toBe(1);
    expect(a.completedDirect).toBe(1);
    expect(a.completedUnknownOrigin).toBe(0);
  });

  it("splits usage and server-confirmed starts by guest state", () => {
    expect(a.guestUsers).toBe(1);
    expect(a.registeredUsers).toBe(2);
    expect(a.authoritativeStartsGuest).toBe(1);
    expect(a.authoritativeStartsSignedIn).toBe(1);
    const o = computeOverview(ds, r7, NOW);
    expect(o.signedInSessions).toBe(2); // s1, s3
    expect(o.guestSessions).toBe(1); // s2
  });

  it("groups verification by verification_type, never as one global flag", () => {
    expect(a.verification.available).toBe(true);
    expect(a.verification.rows).toEqual([
      { verificationType: "discord", started: 0, completed: 1, failed: 0 },
      { verificationType: "email", started: 1, completed: 0, failed: 1 },
    ]);
  });
});

// --- Sources ---------------------------------------------------------------------

describe("sources", () => {
  const ds: AnalyticsDataset = {
    events: [],
    sessions: [
      sess("s1", "A", NOW - HOUR, { utm_source: "TikTok", utm_medium: "social", utm_campaign: "launch" }),
      sess("s2", "B", NOW - HOUR, { referrer: "https://www.reddit.com/r/leagueoflegends" }),
      sess("s3", "C", NOW - HOUR),
      sess("s4", "C", NOW - 30 * 60 * 1000, { referrer: "https://mogzy.lol/lol" }),
    ],
    visitors: [
      vis("A", NOW - HOUR, { first_utm_source: "TikTok", first_utm_medium: "social", first_utm_campaign: "launch" }),
      vis("B", NOW - HOUR, { first_referrer: "https://www.reddit.com/r/leagueoflegends" }),
      vis("C", NOW - HOUR),
    ],
  };
  const s = computeSources(ds, r7);
  const keys = (rows: { key: string; count: number }[]) => Object.fromEntries(rows.map((r) => [r.key, r.count]));

  it("classifies first touch as utm source, referral host, or direct", () => {
    expect(s.firstTouch.total).toBe(3);
    expect(keys(s.firstTouch.bySource)).toEqual({ tiktok: 1, "(referral) www.reddit.com": 1, "(direct)": 1 });
    expect(s.firstTouch.direct).toBe(1);
    expect(keys(s.firstTouch.byMedium)).toEqual({ social: 1, "(none)": 2 });
    expect(keys(s.firstTouch.byCampaign)).toEqual({ launch: 1, "(none)": 2 });
  });

  it("reports session touch separately, with same-site referrers as internal", () => {
    expect(s.sessionTouch.total).toBe(4);
    expect(keys(s.sessionTouch.bySource)["(internal)"]).toBe(1);
    expect(keys(s.sessionTouch.byReferrer)["(internal)"]).toBe(1);
  });

  it("extracts referrer hosts from raw text", () => {
    expect(referrerHost("https://t.co/abc")).toBe("t.co");
    expect(referrerHost("")).toBeNull();
    expect(referrerHost(null)).toBeNull();
  });
});

// --- Health -----------------------------------------------------------------------

describe("system health", () => {
  const noRailway: LatestReceived = { web: iso(NOW - HOUR), railway: null, byRailwayEvent: {} };

  it("flags a browser row carrying a server-authoritative name", () => {
    const ds: AnalyticsDataset = {
      events: [web("ranked_completed", NOW - HOUR, "V", "s")],
      sessions: [sess("s", "V", NOW - HOUR)],
      visitors: [vis("V", NOW - HOUR)],
    };
    expect(computeHealth(ds, r7, noRailway).webAuthoritativeRows).toBe(1);
  });

  it("flags duplicate and keyless Railway rows", () => {
    const ds: AnalyticsDataset = {
      events: [
        railway("dsa_started", NOW - HOUR, "r1"),
        railway("dsa_started", NOW - HOUR, "r1"),
        ev("dsa_completed", NOW - HOUR, { source_system: "railway" }),
      ],
      sessions: [],
      visitors: [],
    };
    const h = computeHealth(ds, r7, { web: null, railway: iso(NOW - HOUR), byRailwayEvent: {} });
    expect(h.duplicateRailwayEntities).toBe(1);
    expect(h.railwayMissingEntity).toBe(1);
    expect(h.eventsBySource).toEqual([{ key: "railway", count: 3 }]);
  });

  it("warns when browser mode-opens arrive but no authoritative event ever has", () => {
    const ds: AnalyticsDataset = {
      events: [web("practice_quiz_opened", NOW - HOUR, "V", "s")],
      sessions: [sess("s", "V", NOW - HOUR)],
      visitors: [],
    };
    const h = computeHealth(ds, r7, noRailway);
    expect(h.opensSinceLastAuthoritative).toBe(1);
    expect(h.gapWarning).toMatch(/ever been received/);
    expect(h.sessionsWithoutVisitorRow).toBe(1);
  });

  it("does not count Meta Reflex opens as an ingestion gap (it has no Railway emitter)", () => {
    const ds: AnalyticsDataset = {
      events: [web("meta_reflex_opened", NOW - HOUR, "V", "s")],
      sessions: [],
      visitors: [],
    };
    expect(computeHealth(ds, r7, noRailway).opensSinceLastAuthoritative).toBe(0);
  });
});

// --- Legacy Arena exclusion ------------------------------------------------------------

describe("legacy Arena / Match & Rank analytics are excluded", () => {
  it("ignores retired and non-Mogzy event names in every funnel step", () => {
    const ds: AnalyticsDataset = {
      events: [
        web("lol_landing_viewed", NOW - HOUR, "V", "s"),
        web("lol_start_quiz_clicked", NOW - HOUR, "V", "s"),
        web("image_click", NOW - HOUR, "V", "s"),
        web("match_voted", NOW - HOUR, "V", "s"),
      ],
      sessions: [sess("s", "V", NOW - HOUR)],
      visitors: [vis("V", NOW - HOUR)],
    };
    const steps = computeFunnel(ds, r7, NOW);
    for (const id of ["landing", "hub", "leaguecraft", "engaged", "account"]) {
      expect(steps.find((s) => s.id === id)!.visitors, id).toBe(0);
    }
    expect(computeOverview(ds, r7, NOW).engagedSessions).toBe(0);
  });

  it("reads no Arena-era or legacy table anywhere in the analytics read path", () => {
    for (const file of ["metrics.ts", "loadAnalytics.ts", "range.ts", "../../../pages/admin/areas/AdminAnalyticsPage.tsx"]) {
      const src = readFileSync(resolve(__dirname, file), "utf8");
      const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const table of [
        "image_clicks",
        "\"matches\"",
        "\"leagues\"",
        "global_elo_snapshots",
        "league_memberships",
        "ad_events",
        "funnel_events",
        "admin-data-sources",
        "\"profiles\"",
      ]) {
        expect(code.includes(table), `${file} references ${table}`).toBe(false);
      }
    }
  });
});

// --- Paged reads ---------------------------------------------------------------------------

describe("paged reads", () => {
  it("reads pages until a short page", async () => {
    const all = Array.from({ length: 25 }, (_, i) => i);
    const out = await readAllPages<number>(
      (from, to) => Promise.resolve({ data: all.slice(from, to + 1), error: null }),
      100,
      10,
    );
    expect(out.rows).toEqual(all);
    expect(out.truncated).toBe(false);
  });

  it("reports truncation at the cap instead of silently sampling", async () => {
    const out = await readAllPages<number>(
      (from, to) => Promise.resolve({ data: Array.from({ length: to - from + 1 }, (_, i) => from + i), error: null }),
      30,
      10,
    );
    expect(out.rows).toHaveLength(30);
    expect(out.truncated).toBe(true);
  });

  it("fails loudly on a read error rather than returning partial data", async () => {
    await expect(
      readAllPages<number>(() => Promise.resolve({ data: null, error: { message: "permission denied" } }), 30, 10),
    ).rejects.toThrow(/permission denied/);
  });
});
