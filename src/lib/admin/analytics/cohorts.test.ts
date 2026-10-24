// ADMIN RETENTION V2 — cohort definitions, pinned in numbers.

import { describe, expect, it } from "vitest";
import {
  cohortLookbackStart,
  cohortWindow,
  computeCohortRetention,
  utcWeekStart,
  windowsForLens,
} from "./cohorts";
import {
  computeRetention,
  type AnalyticsDataset,
  type AnalyticsEventRecord,
  type AnalyticsSessionRecord,
} from "./metrics";
import { resolveRange } from "./range";
import { filterDatasetByTraffic } from "./traffic";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Thursday.
const NOW = Date.parse("2026-10-22T12:00:00.000Z");
const iso = (t: number) => new Date(t).toISOString();

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

const ALL = { start: null, end: NOW + 1 };

describe("UTC cohort buckets", () => {
  it("weeks start on Monday 00:00 UTC", () => {
    expect(iso(utcWeekStart(NOW))).toBe("2026-10-19T00:00:00.000Z");
    expect(iso(utcWeekStart(Date.parse("2026-10-19T00:00:00.000Z")))).toBe("2026-10-19T00:00:00.000Z");
    expect(iso(utcWeekStart(Date.parse("2026-10-18T23:59:59.000Z")))).toBe("2026-10-12T00:00:00.000Z");
  });

  it("the read starts at the oldest of 8 weekly cohorts; day grain shows 28 days", () => {
    expect(iso(cohortLookbackStart(NOW))).toBe("2026-08-31T00:00:00.000Z");
    expect(iso(cohortWindow("day", NOW).start!)).toBe("2026-09-25T00:00:00.000Z");
  });
});

describe("browser lens", () => {
  const ds: AnalyticsDataset = {
    events: [],
    visitors: [],
    sessions: [
      // A: second session 3h later (D0), back at +30h (D1), +9d (W1).
      sess("a1", "A", NOW - 20 * DAY),
      sess("a2", "A", NOW - 20 * DAY + 3 * HOUR),
      sess("a3", "A", NOW - 20 * DAY + 30 * HOUR),
      sess("a4", "A", NOW - 20 * DAY + 9 * DAY),
      // B: one session only.
      sess("b1", "B", NOW - 20 * DAY),
      // C: first seen 1h ago — too recent for everything.
      sess("c1", "C", NOW - HOUR),
    ],
  };

  const r = computeCohortRetention(ds, ALL, NOW, "browser", "week");

  it("D0 needs a SECOND session within 24h of first seen", () => {
    expect(r.pooled.d0).toEqual({ eligible: 2, retained: 1, tooRecent: 1 });
  });

  it("D1 / W1 count a session start in the window; too-recent is never churn", () => {
    expect(r.pooled.d1).toEqual({ eligible: 2, retained: 1, tooRecent: 1 });
    expect(r.pooled.w1).toEqual({ eligible: 2, retained: 1, tooRecent: 1 });
    // 20 days old: W3 (21–28d) has not elapsed.
    expect(r.pooled.w3).toEqual({ eligible: 0, retained: 0, tooRecent: 3 });
  });

  it("groups units into UTC-week cohorts, newest first, with sizes", () => {
    expect(r.rows.map((x) => [x.key, x.size])).toEqual([
      ["2026-10-19", 1],
      ["2026-09-28", 2],
    ]);
    expect(r.units).toBe(3);
  });

  it("anchors outside the bounds are not in any cohort", () => {
    const recent = computeCohortRetention(ds, { start: NOW - 2 * DAY, end: NOW + 1 }, NOW, "browser", "day");
    expect(recent.units).toBe(1);
    expect(recent.rows[0].key).toBe("2026-10-22");
  });
});

describe("parity with the existing D1 / D7", () => {
  const ds: AnalyticsDataset = {
    events: [ev("hub_entered", NOW - 5 * DAY, { visitor_id: "E", session_id: "e-missing" })],
    visitors: [{ visitor_id: "V", first_seen_at: iso(NOW - 12 * DAY), first_landing_path: "/", first_referrer: null,
      first_utm_source: null, first_utm_medium: null, first_utm_campaign: null }],
    sessions: [
      sess("r1", "R", NOW - 3 * DAY), sess("r2", "R", NOW - 3 * DAY + 30 * HOUR),
      sess("l1", "L", NOW - 3 * DAY), sess("l2", "L", NOW - 3 * DAY + 50 * HOUR),
      sess("t1", "T", NOW - HOUR),
      sess("w1", "W", NOW - 10 * DAY), sess("w2", "W", NOW - 10 * DAY + 7.5 * DAY),
      sess("v1", "V", NOW - 12 * DAY + HOUR), sess("v2", "V", NOW - 12 * DAY + 7.2 * DAY),
    ],
  };

  for (const preset of ["7d", "30d", "all"] as const) {
    it(`pooled D1 and D7 equal computeRetention on ${preset}`, () => {
      const range = resolveRange(preset, NOW);
      const old = computeRetention(ds, range, NOW);
      const v2 = computeCohortRetention(ds, range, NOW, "browser", "day");
      expect(v2.pooled.d1).toEqual(old.d1);
      expect(v2.pooled.d7).toEqual(old.d7);
      expect(v2.units).toBe(old.cohortSize);
    });
  }
});

describe("account lens", () => {
  const ds: AnalyticsDataset = {
    visitors: [],
    sessions: [sess("s1", "B1", NOW - 20 * DAY), sess("s2", "B2", NOW - 20 * DAY + 30 * HOUR)],
    events: [
      // U signs up on browser B1, returns on a DIFFERENT browser B2 at +30h,
      // and is seen by the server at +9d.
      ev("signup_completed", NOW - 20 * DAY, { user_id: "U", visitor_id: "B1", is_guest: false }),
      ev("hub_entered", NOW - 20 * DAY + 30 * HOUR, { user_id: "U", visitor_id: "B2", is_guest: false }),
      ev("ranked_started", NOW - 20 * DAY + 9 * DAY,
        { user_id: "U", is_guest: false, source_system: "railway", source_entity_type: "ranked_participant", source_entity_id: "p1" }),
      // G: a guest-state event in the window does not count as a registered return.
      ev("signup_completed", NOW - 20 * DAY, { user_id: "G", visitor_id: "B3", is_guest: false }),
      ev("hub_entered", NOW - 20 * DAY + 30 * HOUR, { user_id: "G", visitor_id: "B3", is_guest: true }),
      // N: registered activity but no signup_completed — in no cohort.
      ev("hub_entered", NOW - 20 * DAY, { user_id: "N", visitor_id: "B4", is_guest: false }),
    ],
  };

  const r = computeCohortRetention(ds, ALL, NOW, "account", "week");

  it("cohorts only accounts with a signup_completed anchor", () => {
    expect(r.units).toBe(2);
  });

  it("counts a return on any device and from server rows, never via browser ids", () => {
    expect(r.pooled.d1).toEqual({ eligible: 2, retained: 1, tooRecent: 0 });
    expect(r.pooled.w1).toEqual({ eligible: 2, retained: 1, tooRecent: 0 });
  });

  it("has no D0 (sessions belong to browsers)", () => {
    expect(r.pooled.d0).toBeUndefined();
    expect(windowsForLens("account").map((w) => w.id)).not.toContain("d0");
  });

  it("does not turn an account's return into a browser return", () => {
    const browser = computeCohortRetention(ds, ALL, NOW, "browser", "week");
    // B1 and B2 are two new browsers; neither came back, although the account did.
    expect(browser.units).toBe(2);
    expect(browser.pooled.d1!.retained).toBe(0);
  });
});

describe("traffic filter", () => {
  it("excluded traffic never enters a cohort", () => {
    const ds: AnalyticsDataset = {
      visitors: [],
      events: [],
      sessions: [
        sess("h1", "H", NOW - 3 * DAY, { traffic_class: "human" }),
        sess("h2", "H", NOW - 3 * DAY + 30 * HOUR, { traffic_class: "human" }),
        sess("bot1", "X", NOW - 3 * DAY, { traffic_class: "automation" }),
        sess("bot2", "X", NOW - 3 * DAY + 30 * HOUR, { traffic_class: "automation" }),
      ],
    };
    const filtered = filterDatasetByTraffic(ds, "human_unknown").dataset;
    const r = computeCohortRetention(filtered, ALL, NOW, "browser", "day");
    expect(r.units).toBe(1);
    expect(r.pooled.d1).toEqual({ eligible: 1, retained: 1, tooRecent: 0 });
  });
});
