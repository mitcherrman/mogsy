// ---------------------------------------------------------------------------
// USERS1 — from an aggregate number to the records behind it.
//
// The complaint this module answers is simple and was true of every number in
// FUNNEL1C's Analytics page: "Visitors: 12" could not be clicked. There was no
// way to ask which twelve, no way to see what one of them did, and therefore
// no way to tell a real visitor from a Playwright run — which is how nobody
// noticed that almost all of them were.
//
// So every headline set from metrics.ts (computeOverviewPopulations) is
// addressable here by name, and every visitor in the dataset can be rendered
// as a row. The number and the list are the SAME computation: the page shows
// `population(key).size` and the drill-down shows `population(key)` itself.
// They cannot drift, because there is nothing to drift from.
// ---------------------------------------------------------------------------

import {
  AUTHORITATIVE_START_EVENTS,
  GAMEPLAY_MODES,
  MODE_OPEN_EVENTS,
  computeOverviewPopulations,
  type AnalyticsDataset,
  type OverviewPopulations,
} from "./metrics";
import { inRange, type AnalyticsRange } from "./range";
import type { TrafficClass, VisitorClassification } from "./traffic";

const ts = (iso: string) => Date.parse(iso);

/**
 * The addressable populations. Each is a metric a reader can click.
 *
 * `sessions`, `repeat_sessions` and `engaged_sessions` are session-grained;
 * they resolve to the VISITORS who own those sessions, because the detail
 * experience is per person and a session on its own is not something an
 * operator can act on.
 */
export const POPULATION_KEYS = [
  "visitors",
  "new_visitors",
  "returning_visitors",
  "engaged_visitors",
  "signups",
  "sessions",
  "repeat_sessions",
  "engaged_sessions",
] as const;
export type PopulationKey = (typeof POPULATION_KEYS)[number];

export const POPULATION_LABELS: Record<PopulationKey, string> = {
  visitors: "Visitors",
  new_visitors: "New visitors",
  returning_visitors: "Returning visitors",
  engaged_visitors: "Engaged visitors",
  signups: "Signups",
  sessions: "Sessions",
  repeat_sessions: "Repeat sessions",
  engaged_sessions: "Engaged sessions",
};

export function parsePopulationKey(value: string | null | undefined): PopulationKey | null {
  return (POPULATION_KEYS as readonly string[]).includes(value ?? "")
    ? (value as PopulationKey)
    : null;
}

/** Mode-open drill-downs are addressed as `mode:<id>`, e.g. `mode:practice`. */
export function modePopulationKey(modeId: string): string {
  return `mode:${modeId}`;
}

/** Any single browser event, e.g. `event:hub_entered`. The funnel rows use this. */
export function eventPopulationKey(eventName: string): string {
  return `event:${eventName}`;
}

/** A human label for any population key, including the dynamic forms. */
export function populationLabel(key: string): string {
  const known = parsePopulationKey(key);
  if (known) return POPULATION_LABELS[known];
  if (key.startsWith("mode:")) {
    const mode = GAMEPLAY_MODES.find((m) => m.id === key.slice("mode:".length));
    return mode ? `${mode.label} — opened` : key;
  }
  if (key.startsWith("event:")) return key.slice("event:".length);
  return key;
}

export interface VisitorRow {
  visitorId: string;
  trafficClass: TrafficClass;
  trafficSource: string | null;
  classificationReason: string | null;
  overridden: boolean;
  firstSeen: number | null;
  lastSeen: number | null;
  /** All-time, not range-bounded — "is this a returning person?" is a history question. */
  sessions: number;
  sessionsInRange: number;
  eventsInRange: number;
  isNew: boolean;
  isReturning: boolean;
  engaged: boolean;
  signedUp: boolean;
  /** Every auth uid this browser has been seen under, newest last. */
  userIds: string[];
  /** True once any event from this visitor carried is_guest = false. */
  registered: boolean;
  /** Modes this visitor opened in range. */
  modesOpened: string[];
  /** Server-confirmed gameplay starts attributable to this visitor in range. */
  serverStarts: number;
  firstLandingPath: string | null;
  firstReferrer: string | null;
  firstUtmSource: string | null;
  firstUtmMedium: string | null;
  firstUtmCampaign: string | null;
}

/**
 * One row per visitor in the dataset.
 *
 * Computed over the WHOLE dataset it is handed. Callers pass the already
 * traffic-filtered dataset when they want the product population, and the
 * unfiltered one when they are looking at data quality — the choice belongs to
 * the caller, not to this function, so there is exactly one place (the page's
 * filter control) where the population is decided.
 */
export function buildVisitorRows(
  ds: AnalyticsDataset,
  range: AnalyticsRange,
  byVisitor: Map<string, VisitorClassification>,
  populations?: OverviewPopulations,
): VisitorRow[] {
  const p = populations ?? computeOverviewPopulations(ds, range);
  const rows = new Map<string, VisitorRow>();

  const blank = (visitorId: string): VisitorRow => {
    const c = byVisitor.get(visitorId);
    return {
      visitorId,
      trafficClass: c?.trafficClass ?? "unknown",
      trafficSource: c?.trafficSource ?? null,
      classificationReason: c?.reason ?? null,
      overridden: c?.overridden ?? false,
      firstSeen: null,
      lastSeen: null,
      sessions: 0,
      sessionsInRange: 0,
      eventsInRange: 0,
      isNew: p.newVisitors.has(visitorId),
      isReturning: p.returningVisitors.has(visitorId),
      engaged: p.engagedVisitors.has(visitorId),
      signedUp: p.signupVisitors.has(visitorId),
      userIds: [],
      registered: false,
      modesOpened: [],
      serverStarts: 0,
      firstLandingPath: null,
      firstReferrer: null,
      firstUtmSource: null,
      firstUtmMedium: null,
      firstUtmCampaign: null,
    };
  };

  const row = (visitorId: string): VisitorRow => {
    let r = rows.get(visitorId);
    if (!r) {
      r = blank(visitorId);
      rows.set(visitorId, r);
    }
    return r;
  };

  const seenAt = (r: VisitorRow, t: number) => {
    if (r.firstSeen === null || t < r.firstSeen) r.firstSeen = t;
    if (r.lastSeen === null || t > r.lastSeen) r.lastSeen = t;
  };

  for (const v of ds.visitors) {
    const r = row(v.visitor_id);
    seenAt(r, ts(v.first_seen_at));
    r.firstLandingPath = v.first_landing_path;
    r.firstReferrer = v.first_referrer;
    r.firstUtmSource = v.first_utm_source;
    r.firstUtmMedium = v.first_utm_medium;
    r.firstUtmCampaign = v.first_utm_campaign;
  }

  for (const s of ds.sessions) {
    const r = row(s.visitor_id);
    r.sessions += 1;
    const t = ts(s.started_at);
    seenAt(r, t);
    if (inRange(t, range)) r.sessionsInRange += 1;
  }

  const modeOpens = new Set(MODE_OPEN_EVENTS);
  const modeByOpenEvent = new Map(GAMEPLAY_MODES.map((m) => [m.opened, m.id as string]));
  const startEvents = new Set(AUTHORITATIVE_START_EVENTS);

  // uid → visitor, so a Railway row with no browser ids can be attributed.
  const visitorByUser = new Map<string, string>();
  for (const e of ds.events) {
    if (e.source_system !== "web" || !e.user_id || !e.visitor_id) continue;
    visitorByUser.set(e.user_id, e.visitor_id);
  }

  for (const e of ds.events) {
    const visitorId = e.visitor_id ?? (e.user_id ? visitorByUser.get(e.user_id) : undefined);
    if (!visitorId) continue;
    const r = row(visitorId);
    const t = ts(e.received_at);
    seenAt(r, t);
    if (!inRange(t, range)) continue;

    if (e.source_system === "web") {
      r.eventsInRange += 1;
      if (e.user_id && !r.userIds.includes(e.user_id)) r.userIds.push(e.user_id);
      if (e.is_guest === false) r.registered = true;
      if (modeOpens.has(e.event_name)) {
        const mode = modeByOpenEvent.get(e.event_name);
        if (mode && !r.modesOpened.includes(mode)) r.modesOpened.push(mode);
      }
    } else if (startEvents.has(e.event_name)) {
      r.serverStarts += 1;
    }
  }

  return [...rows.values()].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
}

/**
 * The visitors behind one metric.
 *
 * Session-grained keys are mapped through the session index rather than
 * re-derived, so "Repeat sessions: 4" opens the four visitors who owned them
 * even when one visitor owned two of the four — in which case the list is
 * shorter than the number, and the caller says so rather than hiding it.
 */
export function visitorsForPopulation(
  key: PopulationKey | string,
  ds: AnalyticsDataset,
  range: AnalyticsRange,
  populations?: OverviewPopulations,
): Set<string> {
  const p = populations ?? computeOverviewPopulations(ds, range);

  switch (key) {
    case "visitors":
      return p.visitors;
    case "new_visitors":
      return p.newVisitors;
    case "returning_visitors":
      return p.returningVisitors;
    case "engaged_visitors":
      return p.engagedVisitors;
    case "signups":
      return p.signupVisitors;
    case "sessions":
      return visitorsOfSessions(ds, p.activeSessionIds);
    case "repeat_sessions":
      return visitorsOfSessions(ds, p.repeatSessionIds);
    case "engaged_sessions":
      return visitorsOfSessions(ds, p.engagedSessionIds);
    default:
      break;
  }

  if (typeof key === "string" && key.startsWith("mode:")) {
    const mode = GAMEPLAY_MODES.find((m) => m.id === key.slice("mode:".length));
    return mode ? visitorsWithEvent(ds, range, mode.opened) : new Set();
  }

  // `event:<name>` — every acquisition-funnel step is one event, so the whole
  // funnel is drillable without a second vocabulary for its rows.
  if (typeof key === "string" && key.startsWith("event:")) {
    return visitorsWithEvent(ds, range, key.slice("event:".length));
  }

  return new Set();
}

function visitorsWithEvent(
  ds: AnalyticsDataset,
  range: AnalyticsRange,
  eventName: string,
): Set<string> {
  const out = new Set<string>();
  for (const e of ds.events) {
    if (e.source_system !== "web" || e.event_name !== eventName || !e.visitor_id) continue;
    if (!inRange(ts(e.received_at), range)) continue;
    out.add(e.visitor_id);
  }
  return out;
}

function visitorsOfSessions(ds: AnalyticsDataset, sessionIds: Set<string>): Set<string> {
  const out = new Set<string>();
  const byId = new Map(ds.sessions.map((s) => [s.session_id, s.visitor_id]));
  for (const id of sessionIds) {
    const visitor = byId.get(id);
    if (visitor) out.add(visitor);
  }
  // A session known only from events (its row never landed) still resolves.
  if (out.size < sessionIds.size) {
    for (const e of ds.events) {
      if (e.session_id && e.visitor_id && sessionIds.has(e.session_id)) out.add(e.visitor_id);
    }
  }
  return out;
}

/** Every event this visitor produced, newest first. The activity timeline. */
export function eventsForVisitor(ds: AnalyticsDataset, visitorId: string, userIds: string[] = []) {
  const uids = new Set(userIds);
  return ds.events
    .filter((e) => e.visitor_id === visitorId || (!e.visitor_id && e.user_id && uids.has(e.user_id)))
    .sort((a, b) => ts(b.received_at) - ts(a.received_at));
}

/** Every session this visitor started, newest first. */
export function sessionsForVisitor(ds: AnalyticsDataset, visitorId: string) {
  return ds.sessions
    .filter((s) => s.visitor_id === visitorId)
    .sort((a, b) => ts(b.started_at) - ts(a.started_at));
}
