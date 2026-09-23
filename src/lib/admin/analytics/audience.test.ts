/**
 * USERS1 — the traffic filter and the drill-down, behaviourally.
 *
 * Two properties carry the whole Users area:
 *
 *   1. THE FILTER IS APPLIED ONCE, TO THE DATASET. Every metric in metrics.ts
 *      then honours it without knowing it exists. A filter threaded through
 *      two dozen definitions would be forgotten in one of them, and the number
 *      that forgot would look exactly like a correct one.
 *
 *   2. THE NUMBER AND THE LIST ARE THE SAME COMPUTATION. "Visitors: 12" opens
 *      those twelve records, because the tile renders `population.size` and
 *      the list renders `population`. They cannot drift.
 */

import { describe, it, expect } from "vitest";
import { computeOverview, type AnalyticsDataset } from "./metrics";
import { resolveRange } from "./range";
import {
  DEFAULT_TRAFFIC_FILTER,
  classifyVisitors,
  filterDatasetByTraffic,
  parseTrafficFilter,
} from "./traffic";
import { buildVisitorRows, visitorsForPopulation } from "./population";

const NOW = Date.parse("2026-09-23T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const RANGE = resolveRange("7d", NOW);

/** One session per visitor, one landing event per session. */
function dataset(
  visitors: Array<{ id: string; cls: string; source?: string; events?: string[] }>,
): AnalyticsDataset {
  return {
    visitors: visitors.map((v) => ({
      visitor_id: v.id,
      first_seen_at: at(60),
      first_landing_path: "/",
      first_referrer: null,
      first_utm_source: null,
      first_utm_medium: null,
      first_utm_campaign: null,
    })),
    sessions: visitors.map((v) => ({
      session_id: `s-${v.id}`,
      visitor_id: v.id,
      started_at: at(60),
      landing_path: "/",
      referrer: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      traffic_class: v.cls,
      traffic_source: v.source ?? null,
      classification_reason: null,
    })),
    events: visitors.flatMap((v) =>
      (v.events ?? ["landing_viewed"]).map((name, i) => ({
        event_name: name,
        received_at: at(59 - i),
        route: "/",
        visitor_id: v.id,
        session_id: `s-${v.id}`,
        user_id: null,
        is_guest: true,
        source_system: "web",
        source_entity_type: null,
        source_entity_id: null,
        verification_type: null,
        metadata: null,
      })),
    ),
  };
}

const MIXED = dataset([
  { id: "v-human-1", cls: "human" },
  { id: "v-human-2", cls: "human", events: ["landing_viewed", "hub_entered", "practice_quiz_opened"] },
  { id: "v-unknown", cls: "unknown" },
  { id: "v-bot-1", cls: "automation", source: "googlebot" },
  { id: "v-bot-2", cls: "automation", source: "webdriver" },
  { id: "v-qa", cls: "internal", source: "claude" },
]);

describe("the default population", () => {
  it("is human + unknown", () => {
    expect(DEFAULT_TRAFFIC_FILTER).toBe("human_unknown");
    expect(parseTrafficFilter(null)).toBe("human_unknown");
    expect(parseTrafficFilter("nonsense")).toBe("human_unknown");
  });

  it("keeps automation and internal OUT of the default numbers, and deletes neither", () => {
    const filtered = filterDatasetByTraffic(MIXED, "human_unknown");
    expect(computeOverview(filtered.dataset, RANGE, NOW).visitors).toBe(3);

    // Still in the warehouse, and still countable on demand.
    expect(filtered.counts).toEqual({ human: 2, automation: 2, internal: 1, unknown: 1 });
    expect(MIXED.visitors).toHaveLength(6);
    expect(computeOverview(filterDatasetByTraffic(MIXED, "all").dataset, RANGE, NOW).visitors).toBe(6);
  });

  it("answers every other filter from the same rows", () => {
    const size = (f: Parameters<typeof filterDatasetByTraffic>[1]) =>
      computeOverview(filterDatasetByTraffic(MIXED, f).dataset, RANGE, NOW).visitors;
    expect(size("human")).toBe(2);
    expect(size("unknown")).toBe(1);
    expect(size("automation")).toBe(2);
    expect(size("internal")).toBe(1);
    expect(size("all")).toBe(6);
  });

  it("carries the filter into every metric, not just the visitor count", () => {
    const def = filterDatasetByTraffic(MIXED, "human_unknown");
    const all = filterDatasetByTraffic(MIXED, "all");
    expect(computeOverview(def.dataset, RANGE, NOW).sessions).toBe(3);
    expect(computeOverview(all.dataset, RANGE, NOW).sessions).toBe(6);
    expect(def.dataset.events.length).toBeLessThan(all.dataset.events.length);
  });
});

describe("a visitor's class", () => {
  it("is unknown when nothing was ever observed about them", () => {
    const only = dataset([{ id: "v", cls: "unknown" }]);
    expect(classifyVisitors(only).get("v")?.trafficClass).toBe("unknown");
  });

  it("takes the strongest signal across their sessions — internal beats automation beats human", () => {
    const ds = dataset([{ id: "v", cls: "human" }]);
    ds.sessions.push({ ...ds.sessions[0], session_id: "s2", traffic_class: "automation" });
    expect(classifyVisitors(ds).get("v")?.trafficClass).toBe("automation");
    ds.sessions.push({ ...ds.sessions[0], session_id: "s3", traffic_class: "internal" });
    expect(classifyVisitors(ds).get("v")?.trafficClass).toBe("internal");
  });

  it("lets an operator override detection, and says that they did", () => {
    const c = classifyVisitors(MIXED, [
      {
        visitor_id: "v-bot-1",
        traffic_class: "human",
        traffic_source: null,
        reason: "it is my phone",
        set_at: at(1),
      },
    ]);
    expect(c.get("v-bot-1")?.trafficClass).toBe("human");
    expect(c.get("v-bot-1")?.overridden).toBe(true);
    // And the observation underneath is untouched.
    expect(MIXED.sessions.find((s) => s.visitor_id === "v-bot-1")?.traffic_class).toBe("automation");
  });

  it("moves the overridden visitor into the population the operator chose", () => {
    const filtered = filterDatasetByTraffic(MIXED, "human", [
      { visitor_id: "v-bot-1", traffic_class: "human", traffic_source: null, reason: null, set_at: at(1) },
    ]);
    expect(computeOverview(filtered.dataset, RANGE, NOW).visitors).toBe(3);
  });
});

describe("every metric opens the records behind it", () => {
  const filtered = filterDatasetByTraffic(MIXED, "human_unknown");
  const overview = computeOverview(filtered.dataset, RANGE, NOW);

  it("the visitor list behind a tile IS the tile's own set", () => {
    const behind = visitorsForPopulation("visitors", filtered.dataset, RANGE);
    expect(behind.size).toBe(overview.visitors);
    expect([...behind].sort()).toEqual(["v-human-1", "v-human-2", "v-unknown"]);
  });

  it("resolves the derived populations too", () => {
    expect(visitorsForPopulation("new_visitors", filtered.dataset, RANGE).size).toBe(
      overview.newVisitors,
    );
    expect(visitorsForPopulation("engaged_visitors", filtered.dataset, RANGE).size).toBe(
      overview.engagedVisitors,
    );
    expect(visitorsForPopulation("sessions", filtered.dataset, RANGE).size).toBe(overview.sessions);
  });

  it("resolves a gameplay mode and a funnel step by name", () => {
    expect([...visitorsForPopulation("mode:practice", filtered.dataset, RANGE)]).toEqual([
      "v-human-2",
    ]);
    expect([...visitorsForPopulation("event:hub_entered", filtered.dataset, RANGE)]).toEqual([
      "v-human-2",
    ]);
  });

  it("returns nothing for a population that does not exist, rather than everything", () => {
    expect(visitorsForPopulation("mode:nonsense", filtered.dataset, RANGE).size).toBe(0);
    expect(visitorsForPopulation("not_a_metric", filtered.dataset, RANGE).size).toBe(0);
  });

  it("drills only within the current population — a bot is not reachable from a KPI", () => {
    const behind = visitorsForPopulation("visitors", filtered.dataset, RANGE);
    expect(behind.has("v-bot-1")).toBe(false);
    expect(behind.has("v-qa")).toBe(false);
  });
});

describe("the visitor record", () => {
  it("carries the classification, the acquisition and what they did", () => {
    const rows = buildVisitorRows(MIXED, RANGE, classifyVisitors(MIXED));
    const engaged = rows.find((r) => r.visitorId === "v-human-2")!;
    expect(engaged.trafficClass).toBe("human");
    expect(engaged.sessions).toBe(1);
    expect(engaged.eventsInRange).toBe(3);
    expect(engaged.modesOpened).toEqual(["practice"]);
    expect(engaged.firstLandingPath).toBe("/");
    expect(engaged.engaged).toBe(true);
  });

  it("says a visitor has no account rather than inventing one", () => {
    const rows = buildVisitorRows(MIXED, RANGE, classifyVisitors(MIXED));
    for (const row of rows) {
      expect(row.userIds).toEqual([]);
      expect(row.registered).toBe(false);
    }
  });

  it("links a visitor to the account they later signed into — deterministically, from their own events", () => {
    const ds = dataset([{ id: "v1", cls: "human", events: ["landing_viewed", "hub_entered"] }]);
    // The same browser, later, signed in. This is the ONLY linkage rule: a uid
    // the browser itself reported on its own event. No IP, no user agent.
    ds.events.push({
      event_name: "signup_completed",
      received_at: at(10),
      route: "/auth",
      visitor_id: "v1",
      session_id: "s-v1",
      user_id: "user-1",
      is_guest: false,
      source_system: "web",
      source_entity_type: null,
      source_entity_id: null,
      verification_type: null,
      metadata: { upgraded_from_guest: true },
    });
    const row = buildVisitorRows(ds, RANGE, classifyVisitors(ds))[0];
    expect(row.userIds).toEqual(["user-1"]);
    expect(row.registered).toBe(true);
    expect(row.signedUp).toBe(true);
    // And the pre-signup history is still on the record — the whole point.
    expect(row.eventsInRange).toBe(3);
  });
});
