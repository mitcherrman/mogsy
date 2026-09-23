// ---------------------------------------------------------------------------
// USERS1 — the traffic filter for Admin › Users.
//
// WHY THE FILTER IS A DATASET TRANSFORM AND NOT A PARAMETER ON EVERY METRIC
//
// metrics.ts holds about two dozen definitions. Threading a `trafficClass`
// argument through each one would give twenty-four places for the filter to be
// forgotten, and the first number that forgot it would be indistinguishable
// from a correct one. So the filter is applied ONCE, to the dataset, before any
// metric sees it: `filterDatasetByTraffic(ds, filter)` returns a dataset whose
// rows all belong to the chosen population, and every existing metric then
// honours it without knowing it exists.
//
// That also makes the drill-down trivially consistent: the visitor list behind
// "Visitors: 12" is computed from the same filtered dataset that produced the
// 12.
//
//
// HOW A VISITOR GETS A CLASS
//
// The database stores a class per SESSION (see the USERS1 migration). A
// visitor's class is derived here, by precedence:
//
//   1. An operator override for that visitor (analytics_traffic_overrides).
//   2. internal    — if ANY of their sessions was ours.
//   3. automation  — if any was a bot or a driver.
//   4. human       — if any showed trusted human input.
//   5. unknown     — otherwise.
//
// internal outranks automation, and both outrank human, because the question
// the precedence answers is "should this visitor count as audience?" and one
// internal session is enough to say no. A browser we drove for QA does not
// become an audience member because a person also clicked in it.
//
//
// THE DEFAULT IS human + unknown, AND THAT IS A DELIBERATE OVER-COUNT
//
// Detection is not perfect and this file does not pretend otherwise. Excluding
// `unknown` would silently discard every visitor whose browser never fired a
// trusted input event — someone who read the landing page and left is a real
// visitor. Including `automation` and `internal` is what produced the numbers
// this workstream exists to replace. Between the two errors, the default takes
// the one that over-counts the audience slightly rather than the one that
// measures the development process.
// ---------------------------------------------------------------------------

import type { AnalyticsDataset, AnalyticsEventRecord } from "./metrics";

export type TrafficClass = "human" | "automation" | "internal" | "unknown";

export const TRAFFIC_FILTERS = [
  "human_unknown",
  "human",
  "unknown",
  "automation",
  "internal",
  "all",
] as const;
export type TrafficFilter = (typeof TRAFFIC_FILTERS)[number];

export const DEFAULT_TRAFFIC_FILTER: TrafficFilter = "human_unknown";

export const TRAFFIC_FILTER_LABELS: Record<TrafficFilter, string> = {
  human_unknown: "Human + unknown",
  human: "Human only",
  unknown: "Unknown",
  automation: "Automation",
  internal: "Internal / test",
  all: "All traffic",
};

export const TRAFFIC_FILTER_DEFINITIONS: Record<TrafficFilter, string> = {
  human_unknown:
    "The default product population: visitors with evidence of human use, plus visitors we could not classify either way. Excludes known automation and our own marked traffic.",
  human: "Only visitors whose session recorded a trusted human input event.",
  unknown: "Only visitors we have no evidence about. Useful for judging how much the default is guessing.",
  automation: "Crawlers, headless and driver-controlled browsers. Kept in the warehouse, kept out of the KPIs.",
  internal: "Traffic we marked as ours: QA runs, agent sessions, previews, localhost.",
  all: "Everything in the store, unfiltered. The honest denominator for a data-quality question.",
};

export const TRAFFIC_CLASS_LABELS: Record<TrafficClass, string> = {
  human: "Human",
  automation: "Automation",
  internal: "Internal / test",
  unknown: "Unknown",
};

const MEMBERS: Record<TrafficFilter, readonly TrafficClass[]> = {
  human_unknown: ["human", "unknown"],
  human: ["human"],
  unknown: ["unknown"],
  automation: ["automation"],
  internal: ["internal"],
  all: ["human", "automation", "internal", "unknown"],
};

export function parseTrafficFilter(value: string | null | undefined): TrafficFilter {
  return (TRAFFIC_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as TrafficFilter)
    : DEFAULT_TRAFFIC_FILTER;
}

export function filterIncludes(filter: TrafficFilter, cls: TrafficClass): boolean {
  return MEMBERS[filter].includes(cls);
}

/** Operator corrections, keyed by visitor. */
export interface TrafficOverride {
  visitor_id: string;
  traffic_class: TrafficClass;
  traffic_source: string | null;
  reason: string | null;
  set_at: string;
}

/** internal beats automation beats human beats unknown — see the header. */
const RANK: Record<TrafficClass, number> = {
  internal: 3,
  automation: 2,
  human: 1,
  unknown: 0,
};

function asClass(value: unknown): TrafficClass {
  return value === "human" || value === "automation" || value === "internal"
    ? value
    : "unknown";
}

export interface VisitorClassification {
  trafficClass: TrafficClass;
  /** The strongest session's source, or the override's. */
  trafficSource: string | null;
  reason: string | null;
  /** True when an operator set this rather than the browser reporting it. */
  overridden: boolean;
}

/**
 * Every visitor in the dataset, classified.
 *
 * Visitors with no session rows at all (a landing view whose session insert
 * never landed) are `unknown`, which is both honest and inside the default
 * population, so a lost session row never costs a visitor their visibility.
 */
export function classifyVisitors(
  ds: AnalyticsDataset,
  overrides: TrafficOverride[] = [],
): Map<string, VisitorClassification> {
  const out = new Map<string, VisitorClassification>();

  // Strongest signal wins. Overrides are applied after every loop below, so
  // they are never in contention here.
  const take = (visitorId: string, next: VisitorClassification) => {
    const cur = out.get(visitorId);
    if (!cur || RANK[next.trafficClass] > RANK[cur.trafficClass]) out.set(visitorId, next);
  };

  for (const v of ds.visitors) {
    take(v.visitor_id, {
      trafficClass: "unknown",
      trafficSource: null,
      reason: null,
      overridden: false,
    });
  }

  for (const s of ds.sessions) {
    take(s.visitor_id, {
      trafficClass: asClass(s.traffic_class),
      trafficSource: s.traffic_source ?? null,
      reason: s.classification_reason ?? null,
      overridden: false,
    });
  }

  // A visitor seen only in the event ledger still gets an entry, so nothing
  // silently falls outside every population.
  for (const e of ds.events) {
    if (e.visitor_id && !out.has(e.visitor_id)) {
      out.set(e.visitor_id, {
        trafficClass: "unknown",
        trafficSource: null,
        reason: null,
        overridden: false,
      });
    }
  }

  // The operator's word is last and absolute.
  for (const o of overrides) {
    out.set(o.visitor_id, {
      trafficClass: asClass(o.traffic_class),
      trafficSource: o.traffic_source ?? null,
      reason: o.reason ?? "set by an admin",
      overridden: true,
    });
  }

  return out;
}

/**
 * user_id → class, so a Railway row with no visitor_id can still be placed.
 *
 * Server-authoritative gameplay arrives with the uid and often without the
 * browser ids. Dropping those rows under any filter would make "server-
 * confirmed starts" collapse to zero the moment a filter was applied, which
 * would look like a filtering bug and would in fact be one.
 */
function classByUser(
  ds: AnalyticsDataset,
  byVisitor: Map<string, VisitorClassification>,
): Map<string, TrafficClass> {
  const out = new Map<string, TrafficClass>();
  for (const e of ds.events) {
    if (e.source_system !== "web" || !e.user_id || !e.visitor_id) continue;
    const cls = byVisitor.get(e.visitor_id)?.trafficClass ?? "unknown";
    const cur = out.get(e.user_id);
    if (cur === undefined || RANK[cls] > RANK[cur]) out.set(e.user_id, cls);
  }
  return out;
}

/** Where an event sits in the population. */
export function classifyEvent(
  event: AnalyticsEventRecord,
  byVisitor: Map<string, VisitorClassification>,
  byUser: Map<string, TrafficClass>,
): TrafficClass {
  if (event.visitor_id) return byVisitor.get(event.visitor_id)?.trafficClass ?? "unknown";
  if (event.user_id) return byUser.get(event.user_id) ?? "unknown";
  return "unknown";
}

export interface FilteredAnalytics {
  dataset: AnalyticsDataset;
  /** Classification for every visitor in the UNFILTERED dataset. */
  byVisitor: Map<string, VisitorClassification>;
  byUser: Map<string, TrafficClass>;
  /** How many visitors each class holds, before filtering. Always all-traffic. */
  counts: Record<TrafficClass, number>;
}

/**
 * Narrow a dataset to one traffic population.
 *
 * Returns the classification maps alongside it, because the drill-down views
 * need to show a visitor's class and would otherwise recompute it — and two
 * computations of the same thing eventually disagree.
 */
export function filterDatasetByTraffic(
  ds: AnalyticsDataset,
  filter: TrafficFilter,
  overrides: TrafficOverride[] = [],
): FilteredAnalytics {
  const byVisitor = classifyVisitors(ds, overrides);
  const byUser = classByUser(ds, byVisitor);

  const counts: Record<TrafficClass, number> = {
    human: 0,
    automation: 0,
    internal: 0,
    unknown: 0,
  };
  for (const c of byVisitor.values()) counts[c.trafficClass] += 1;

  if (filter === "all") {
    return { dataset: ds, byVisitor, byUser, counts };
  }

  const keep = (v: string | null | undefined) =>
    Boolean(v) && filterIncludes(filter, byVisitor.get(v as string)?.trafficClass ?? "unknown");

  return {
    dataset: {
      visitors: ds.visitors.filter((v) => keep(v.visitor_id)),
      sessions: ds.sessions.filter((s) => keep(s.visitor_id)),
      events: ds.events.filter((e) =>
        filterIncludes(filter, classifyEvent(e, byVisitor, byUser)),
      ),
    },
    byVisitor,
    byUser,
    counts,
  };
}
