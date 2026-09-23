// ---------------------------------------------------------------------------
// FUNNEL1C — the Admin › Analytics read path.
//
// Reads Supabase only, never a live join against Railway (§20.13.5): B3 exists
// so that Railway's gameplay truth is already in analytics_events. Reads go
// through the typed `analyticsDb` seam; SELECT on the three tables is granted
// to admin / master_admin only by RLS (§14.9), which is the same population the
// Admin shell admits.
//
// Aggregation is client-side over paged rows. That is the right size for the
// current volume and it keeps every definition in one tested module
// (metrics.ts) instead of split between SQL and TypeScript. It has a ceiling:
// past ROW_CAP rows a table is reported `truncated` and the page says so,
// rather than quietly computing on a sample. Crossing it is the signal to move
// the aggregates into SQL views.
// ---------------------------------------------------------------------------

import { analyticsDb } from "@/lib/analytics/schema";
import type {
  AnalyticsDataset,
  AnalyticsEventRecord,
  AnalyticsSessionRecord,
  AnalyticsVisitorRecord,
  LatestReceived,
} from "./metrics";
import { AUTHORITATIVE_EVENTS } from "./metrics";
import type { AnalyticsRange } from "./range";
import type { TrafficOverride } from "./traffic";

export const PAGE_SIZE = 1000;
export const ROW_CAP = 50_000;

const EVENT_COLUMNS =
  "event_name, received_at, route, visitor_id, session_id, user_id, is_guest, source_system, source_entity_type, source_entity_id, verification_type, metadata";
const SESSION_COLUMNS =
  "session_id, visitor_id, started_at, landing_path, referrer, utm_source, utm_medium, utm_campaign, traffic_class, traffic_source, classification_reason";
const VISITOR_COLUMNS =
  "visitor_id, first_seen_at, first_landing_path, first_referrer, first_utm_source, first_utm_medium, first_utm_campaign";

export interface LoadedAnalytics {
  dataset: AnalyticsDataset;
  latest: LatestReceived;
  truncated: { events: boolean; sessions: boolean; visitors: boolean };
  loadedAt: number;
  /**
   * USERS1 — operator corrections to a visitor's derived traffic class.
   *
   * Read separately and applied at classification time rather than joined,
   * because the observation (on the session rows) is never edited: "what did
   * we detect" and "what did we decide" have to stay two answerable questions.
   * A failure to read them is NOT a failure to load analytics — the page falls
   * back to the observed classes and says nothing, because an override table
   * that does not exist yet (the migration has not been applied) must not take
   * the whole surface down.
   */
  overrides: TrafficOverride[];
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Read every page up to the cap. Throws on the first error — a partial read is not reported as data. */
export async function readAllPages<T>(
  page: (from: number, to: number) => PageResult<T>,
  cap = ROW_CAP,
  pageSize = PAGE_SIZE,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < cap; from += pageSize) {
    const to = Math.min(from + pageSize, cap) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < to - from + 1) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function latestReceived(filter: { source_system: string; event_name?: string }): Promise<string | null> {
  let q = analyticsDb
    .from("analytics_events")
    .select("received_at")
    .eq("source_system", filter.source_system as "web" | "railway" | "supabase");
  if (filter.event_name) q = q.eq("event_name", filter.event_name);
  const { data, error } = await q.order("received_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.received_at ?? null;
}

export async function loadAnalytics(range: AnalyticsRange): Promise<LoadedAnalytics> {
  const startIso = range.start === null ? null : new Date(range.start).toISOString();

  const [events, sessions, visitors, web, railway, ...perEvent] = await Promise.all([
    readAllPages<AnalyticsEventRecord>((from, to) => {
      let q = analyticsDb.from("analytics_events").select(EVENT_COLUMNS);
      if (startIso) q = q.gte("received_at", startIso);
      return q.order("received_at", { ascending: true }).range(from, to) as unknown as PageResult<AnalyticsEventRecord>;
    }),
    // All-time: "new" and "returning" are questions about history before the range.
    readAllPages<AnalyticsSessionRecord>(
      (from, to) =>
        analyticsDb
          .from("analytics_sessions")
          .select(SESSION_COLUMNS)
          .order("started_at", { ascending: true })
          .range(from, to) as unknown as PageResult<AnalyticsSessionRecord>,
    ),
    readAllPages<AnalyticsVisitorRecord>(
      (from, to) =>
        analyticsDb
          .from("analytics_visitors")
          .select(VISITOR_COLUMNS)
          .order("first_seen_at", { ascending: true })
          .range(from, to) as unknown as PageResult<AnalyticsVisitorRecord>,
    ),
    latestReceived({ source_system: "web" }),
    latestReceived({ source_system: "railway" }),
    ...AUTHORITATIVE_EVENTS.map((name) => latestReceived({ source_system: "railway", event_name: name })),
  ]);

  return {
    dataset: { events: events.rows, sessions: sessions.rows, visitors: visitors.rows },
    overrides: await readTrafficOverrides(),
    latest: {
      web,
      railway,
      byRailwayEvent: Object.fromEntries(AUTHORITATIVE_EVENTS.map((name, i) => [name, perEvent[i]])),
    },
    truncated: { events: events.truncated, sessions: sessions.truncated, visitors: visitors.truncated },
    loadedAt: Date.now(),
  };
}

/**
 * Operator traffic overrides. Never throws — see LoadedAnalytics.overrides.
 */
async function readTrafficOverrides(): Promise<TrafficOverride[]> {
  try {
    const { data, error } = await analyticsDb
      .from("analytics_traffic_overrides")
      .select("visitor_id, traffic_class, traffic_source, reason, set_at")
      .order("set_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (error) return [];
    return (data ?? []) as TrafficOverride[];
  } catch {
    return [];
  }
}
