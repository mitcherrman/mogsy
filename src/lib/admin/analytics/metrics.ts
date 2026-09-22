// ---------------------------------------------------------------------------
// FUNNEL1C — every Admin › Analytics number, as a pure function of rows.
//
// Inputs are rows from exactly three tables — analytics_events,
// analytics_sessions, analytics_visitors — and nothing else. No Arena /
// Match & Rank table (matches, leagues, image_clicks, global_elo_snapshots),
// no legacy ad ledger and no `profiles` row is read here, so no retired
// product can leak into a Mogzy number. A test asserts that boundary.
//
// THE AUTHORITY RULE. A gameplay start or completion is counted only from a
// `source_system = 'railway'` row. The browser owns intent (`*_opened`); it
// can physically insert a row named `practice_quiz_started`, but such a row is
// never counted — it is reported as an anomaly in System Health instead.
//
// THE HONESTY RULE. A metric whose inputs do not exist is `unavailable` with a
// reason, never zero. A rate whose denominator is below MIN_RATE_SAMPLE is
// shown as a fraction, never a percentage.
//
// Definitions are exported as text beside the numbers (METRIC_DEFINITIONS) so
// the page states exactly what it computed.
// ---------------------------------------------------------------------------

import { DAY_MS, inRange, type AnalyticsRange } from "./range";

// --- Rows ------------------------------------------------------------------

export interface AnalyticsEventRecord {
  event_name: string;
  received_at: string;
  visitor_id: string | null;
  session_id: string | null;
  user_id: string | null;
  is_guest: boolean | null;
  source_system: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  verification_type: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AnalyticsSessionRecord {
  session_id: string;
  visitor_id: string;
  started_at: string;
  landing_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export interface AnalyticsVisitorRecord {
  visitor_id: string;
  first_seen_at: string;
  first_landing_path: string | null;
  first_referrer: string | null;
  first_utm_source: string | null;
  first_utm_medium: string | null;
  first_utm_campaign: string | null;
}

/**
 * What the page loads. `events` are the in-range events (received_at within
 * the range). `sessions` and `visitors` are ALL-TIME, because "new" and
 * "returning" are questions about history before the range.
 */
export interface AnalyticsDataset {
  events: AnalyticsEventRecord[];
  sessions: AnalyticsSessionRecord[];
  visitors: AnalyticsVisitorRecord[];
}

// --- Vocabulary ------------------------------------------------------------

/** Below this denominator a rate is shown as "k / n", never as a percentage. */
export const MIN_RATE_SAMPLE = 20;

/**
 * No verification UI ships yet (§15.2), so nothing emits verification_*. While
 * this is false, an empty verification result reads "not yet instrumented"
 * rather than a zero that implies nobody verified.
 */
export const VERIFICATION_EMITTERS_LIVE = false;

export type ModeId = "practice" | "ranked" | "meta_reflex" | "mastery" | "dsa";

export interface GameplayMode {
  id: ModeId;
  label: string;
  /** Browser intent signal. */
  opened: string;
  /** Railway-authoritative start / completion; null when no emitter exists. */
  started: string | null;
  completed: string | null;
  /** Grain of one authoritative row. */
  grain: string;
  gap?: string;
}

/**
 * Independent branches. Ranked is NOT downstream of Practice, and nothing in
 * this list is ordered as a funnel.
 */
export const GAMEPLAY_MODES: GameplayMode[] = [
  {
    id: "practice",
    label: "Practice Quiz",
    opened: "practice_quiz_opened",
    started: "practice_quiz_started",
    completed: "practice_quiz_completed",
    grain: "one row per quiz session",
  },
  {
    id: "ranked",
    label: "Ranked",
    opened: "ranked_opened",
    started: "ranked_started",
    completed: "ranked_completed",
    grain: "one row per human participant (a duel is two)",
  },
  {
    id: "meta_reflex",
    label: "Meta Reflex",
    opened: "meta_reflex_opened",
    started: null,
    completed: null,
    grain: "—",
    gap: "No authoritative emitter: Meta Reflex truth lives in Supabase (league_swipe_results), not Railway (§20.1).",
  },
  {
    id: "mastery",
    label: "Champion Mastery",
    opened: "mastery_opened",
    started: "mastery_started",
    completed: "mastery_completed",
    grain: "one row per mastery session",
  },
  {
    id: "dsa",
    label: "Daily Score Attack",
    opened: "dsa_opened",
    started: "dsa_started",
    completed: "dsa_completed",
    grain: "one row per run",
  },
];

export const MODE_OPEN_EVENTS = GAMEPLAY_MODES.map((m) => m.opened);

/** Names that only Railway may author. A web row with one is an anomaly. */
export const AUTHORITATIVE_EVENTS = GAMEPLAY_MODES.flatMap((m) =>
  [m.started, m.completed].filter((n): n is string => n !== null),
);
export const AUTHORITATIVE_START_EVENTS = GAMEPLAY_MODES.map((m) => m.started).filter(
  (n): n is string => n !== null,
);

export const METRIC_DEFINITIONS = {
  visitors: "Distinct visitor ids with a session started, or a browser event received, in range.",
  sessions: "Sessions started in range, plus sessions with a browser event in range (30-min inactivity window).",
  newVisitors: "Visitors whose first-ever session (or first_seen_at) falls in range.",
  returningVisitors:
    "Visitors with a session in range that is not their first-ever session. A new visitor who comes back inside the range is both new and returning.",
  repeatSessions: "Sessions in range that are not the visitor's first-ever session.",
  signedInUsers: "Distinct user ids with at least one in-range event where is_guest = false.",
  guestSessions: "In-range sessions none of whose in-range events is signed in (is_guest = false).",
  engagedSessions: "In-range sessions with at least one mode-open event.",
  engagedVisitors:
    "Visitors who opened a mode, or whose user id has a Railway-authoritative gameplay start in range.",
  signups: "signup_completed events in range (one per account, deduped at the emitter).",
  d1: "Of visitors first seen in range and at least 48h ago: share with a session starting 24–48h after first seen.",
  d7: "Of visitors first seen in range and at least 8 days ago: share with a session starting 7–8 days after first seen.",
} as const;

// --- Rates -----------------------------------------------------------------

export interface Rate {
  numerator: number;
  denominator: number;
}

/** "42%" for a large enough sample, "3 / 7" otherwise, "—" for nothing. */
export function formatRate(rate: Rate | null, minSample = MIN_RATE_SAMPLE): string {
  if (!rate || rate.denominator === 0) return "—";
  if (rate.denominator < minSample) return `${rate.numerator} / ${rate.denominator}`;
  return `${Math.round((rate.numerator / rate.denominator) * 100)}%`;
}

// --- Shared indexes --------------------------------------------------------

const ts = (iso: string) => Date.parse(iso);

interface SessionInfo {
  session_id: string;
  visitor_id: string;
  startedAt: number;
}

/**
 * Every session known to the dataset. The sessions table is primary; a
 * session referenced only by events (its row failed to insert — sessions and
 * events are independent fire-and-forget writes) is reconstructed from its
 * earliest event.
 */
function indexSessions(ds: AnalyticsDataset): Map<string, SessionInfo> {
  const map = new Map<string, SessionInfo>();
  for (const s of ds.sessions) {
    map.set(s.session_id, { session_id: s.session_id, visitor_id: s.visitor_id, startedAt: ts(s.started_at) });
  }
  for (const e of ds.events) {
    if (e.source_system !== "web" || !e.session_id || !e.visitor_id) continue;
    const t = ts(e.received_at);
    const known = map.get(e.session_id);
    if (!known) map.set(e.session_id, { session_id: e.session_id, visitor_id: e.visitor_id, startedAt: t });
  }
  return map;
}

/** Each visitor's first-seen instant: the earlier of first_seen_at and their first session. */
function firstSeenByVisitor(ds: AnalyticsDataset, sessions: Map<string, SessionInfo>): Map<string, number> {
  const first = new Map<string, number>();
  const take = (v: string, t: number) => {
    const cur = first.get(v);
    if (cur === undefined || t < cur) first.set(v, t);
  };
  for (const v of ds.visitors) take(v.visitor_id, ts(v.first_seen_at));
  for (const s of sessions.values()) take(s.visitor_id, s.startedAt);
  return first;
}

/** Each visitor's sessions, sorted by start. */
function sessionsByVisitor(sessions: Map<string, SessionInfo>): Map<string, SessionInfo[]> {
  const out = new Map<string, SessionInfo[]>();
  for (const s of sessions.values()) {
    const list = out.get(s.visitor_id) ?? [];
    list.push(s);
    out.set(s.visitor_id, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.startedAt - b.startedAt);
  return out;
}

function webEventsInRange(ds: AnalyticsDataset, range: AnalyticsRange) {
  return ds.events.filter((e) => e.source_system === "web" && inRange(ts(e.received_at), range));
}

function railwayEventsInRange(ds: AnalyticsDataset, range: AnalyticsRange) {
  return ds.events.filter((e) => e.source_system === "railway" && inRange(ts(e.received_at), range));
}

/** Session ids active in range: started in range, or carrying an in-range browser event. */
function activeSessionIds(
  ds: AnalyticsDataset,
  range: AnalyticsRange,
  sessions: Map<string, SessionInfo>,
): Set<string> {
  const active = new Set<string>();
  for (const s of sessions.values()) if (inRange(s.startedAt, range)) active.add(s.session_id);
  for (const e of webEventsInRange(ds, range)) if (e.session_id && sessions.has(e.session_id)) active.add(e.session_id);
  return active;
}

function isRepeat(session: SessionInfo, byVisitor: Map<string, SessionInfo[]>): boolean {
  const list = byVisitor.get(session.visitor_id);
  return Boolean(list && list[0].session_id !== session.session_id);
}

/** user_id → visitor ids, from browser events that carried both. */
function visitorsByUser(ds: AnalyticsDataset): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of ds.events) {
    if (e.source_system !== "web" || !e.user_id || !e.visitor_id) continue;
    const set = map.get(e.user_id) ?? new Set<string>();
    set.add(e.visitor_id);
    map.set(e.user_id, set);
  }
  return map;
}

// --- Overview --------------------------------------------------------------

export interface OverviewMetrics {
  visitors: number;
  sessions: number;
  newVisitors: number;
  returningVisitors: number;
  repeatSessions: number;
  signedInUsers: number;
  guestSessions: number;
  signedInSessions: number;
  engagedSessions: number;
  engagedVisitors: number;
  signups: number;
  d1: RetentionRate;
  d7: RetentionRate;
}

export function computeOverview(ds: AnalyticsDataset, range: AnalyticsRange, now: number): OverviewMetrics {
  const sessions = indexSessions(ds);
  const byVisitor = sessionsByVisitor(sessions);
  const firstSeen = firstSeenByVisitor(ds, sessions);
  const active = activeSessionIds(ds, range, sessions);
  const web = webEventsInRange(ds, range);

  const visitors = new Set<string>();
  for (const id of active) visitors.add(sessions.get(id)!.visitor_id);
  for (const e of web) if (e.visitor_id) visitors.add(e.visitor_id);

  let newVisitors = 0;
  for (const v of visitors) {
    const f = firstSeen.get(v);
    if (f !== undefined && inRange(f, range)) newVisitors += 1;
  }

  const returning = new Set<string>();
  let repeatSessions = 0;
  for (const id of active) {
    const s = sessions.get(id)!;
    if (isRepeat(s, byVisitor)) {
      repeatSessions += 1;
      returning.add(s.visitor_id);
    }
  }

  const signedInUsers = new Set<string>();
  for (const e of ds.events) {
    if (e.user_id && e.is_guest === false && inRange(ts(e.received_at), range)) signedInUsers.add(e.user_id);
  }

  const signedInSessionIds = new Set<string>();
  const engagedSessionIds = new Set<string>();
  const modeOpens = new Set(MODE_OPEN_EVENTS);
  for (const e of web) {
    if (!e.session_id || !active.has(e.session_id)) continue;
    if (e.is_guest === false) signedInSessionIds.add(e.session_id);
    if (modeOpens.has(e.event_name)) engagedSessionIds.add(e.session_id);
  }

  const retention = computeRetention(ds, range, now);

  return {
    visitors: visitors.size,
    sessions: active.size,
    newVisitors,
    returningVisitors: returning.size,
    repeatSessions,
    signedInUsers: signedInUsers.size,
    signedInSessions: signedInSessionIds.size,
    guestSessions: active.size - signedInSessionIds.size,
    engagedSessions: engagedSessionIds.size,
    engagedVisitors: engagedVisitorSet(ds, range).size,
    signups: web.filter((e) => e.event_name === "signup_completed").length,
    d1: retention.d1,
    d7: retention.d7,
  };
}

function engagedVisitorSet(ds: AnalyticsDataset, range: AnalyticsRange): Set<string> {
  const modeOpens = new Set(MODE_OPEN_EVENTS);
  const engaged = new Set<string>();
  for (const e of webEventsInRange(ds, range)) {
    if (e.visitor_id && modeOpens.has(e.event_name)) engaged.add(e.visitor_id);
  }
  const byUser = visitorsByUser(ds);
  const starts = new Set(AUTHORITATIVE_START_EVENTS);
  for (const e of railwayEventsInRange(ds, range)) {
    if (!e.user_id || !starts.has(e.event_name)) continue;
    for (const v of byUser.get(e.user_id) ?? []) engaged.add(v);
  }
  return engaged;
}

// --- Acquisition funnel ----------------------------------------------------

export interface FunnelStep {
  id: string;
  label: string;
  /** Distinct visitors who reached the step in range; null when unavailable. */
  visitors: number | null;
  definition: string;
  unavailableReason?: string;
}

/**
 * Visitors reaching each step in range. Steps are NOT required to be reached
 * in order: a direct link to /quiz skips Landing and Hub, and forcing order
 * would silently drop those visitors. Each step is therefore read against the
 * range's visitors, not against the step before it — a later step can exceed
 * an earlier one, and that is the truth about entry points.
 */
export function computeFunnel(ds: AnalyticsDataset, range: AnalyticsRange, now: number): FunnelStep[] {
  const web = webEventsInRange(ds, range);
  const reached = (name: string) => {
    const set = new Set<string>();
    for (const e of web) if (e.event_name === name && e.visitor_id) set.add(e.visitor_id);
    return set.size;
  };

  const verificationRows = ds.events.filter(
    (e) => e.event_name.startsWith("verification_") && inRange(ts(e.received_at), range),
  );
  const verificationVisitors = new Set<string>();
  const byUser = visitorsByUser(ds);
  for (const e of verificationRows) {
    if (e.event_name !== "verification_completed") continue;
    if (e.visitor_id) verificationVisitors.add(e.visitor_id);
    else if (e.user_id) for (const v of byUser.get(e.user_id) ?? []) verificationVisitors.add(v);
  }
  const verificationAvailable = VERIFICATION_EMITTERS_LIVE || verificationRows.length > 0;

  const overview = computeOverview(ds, range, now);

  return [
    { id: "landing", label: "Landing", visitors: reached("landing_viewed"), definition: "landing_viewed (the root entrance, /)." },
    { id: "hub", label: "Hub entered", visitors: reached("hub_entered"), definition: "hub_entered (/lol)." },
    {
      id: "leaguecraft",
      label: "Leaguecraft opened",
      visitors: reached("leaguecraft_opened"),
      definition: "leaguecraft_opened — the /quiz route, however it was reached.",
    },
    {
      id: "engaged",
      label: "Engaged",
      visitors: engagedVisitorSet(ds, range).size,
      definition: METRIC_DEFINITIONS.engagedVisitors,
    },
    {
      id: "account",
      label: "Account created",
      visitors: reached("signup_completed"),
      definition: "Visitors with signup_completed (guest upgrade or new registered account).",
    },
    {
      id: "verification",
      label: "Verification progress",
      visitors: verificationAvailable ? verificationVisitors.size : null,
      definition: "Visitors with verification_completed of any verification_type.",
      unavailableReason: verificationAvailable
        ? undefined
        : "Not yet instrumented — no verification UI emits verification_* yet.",
    },
    {
      id: "returned",
      label: "Returned",
      visitors: overview.returningVisitors,
      definition: METRIC_DEFINITIONS.returningVisitors + " Derived from sessions, never from a click.",
    },
  ];
}

// --- Gameplay branches -----------------------------------------------------

export interface ModeMetrics {
  mode: GameplayMode;
  openedEvents: number;
  openedVisitors: number;
  /** null when the mode has no authoritative emitter. */
  started: number | null;
  startedUsers: number | null;
  startedByGuests: number | null;
  completed: number | null;
  completedUsers: number | null;
  completion: Rate | null;
}

export function computeGameplay(ds: AnalyticsDataset, range: AnalyticsRange): ModeMetrics[] {
  const web = webEventsInRange(ds, range);
  const railway = railwayEventsInRange(ds, range);
  return GAMEPLAY_MODES.map((mode) => {
    const opens = web.filter((e) => e.event_name === mode.opened);
    const openedVisitors = new Set(opens.map((e) => e.visitor_id).filter(Boolean)).size;
    if (!mode.started || !mode.completed) {
      return {
        mode,
        openedEvents: opens.length,
        openedVisitors,
        started: null,
        startedUsers: null,
        startedByGuests: null,
        completed: null,
        completedUsers: null,
        completion: null,
      };
    }
    const starts = railway.filter((e) => e.event_name === mode.started);
    const completes = railway.filter((e) => e.event_name === mode.completed);
    return {
      mode,
      openedEvents: opens.length,
      openedVisitors,
      started: starts.length,
      startedUsers: new Set(starts.map((e) => e.user_id).filter(Boolean)).size,
      startedByGuests: starts.filter((e) => e.is_guest === true).length,
      completed: completes.length,
      completedUsers: new Set(completes.map((e) => e.user_id).filter(Boolean)).size,
      completion: { numerator: completes.length, denominator: starts.length },
    };
  });
}

// --- Accounts --------------------------------------------------------------

export interface VerificationRow {
  verificationType: string;
  started: number;
  completed: number;
  failed: number;
}

export interface AccountMetrics {
  signupViewed: number;
  signupStarted: number;
  signupCompleted: number;
  completedFromGuest: number;
  completedDirect: number;
  completedUnknownOrigin: number;
  viewToComplete: Rate;
  guestUsers: number;
  registeredUsers: number;
  authoritativeStartsGuest: number;
  authoritativeStartsSignedIn: number;
  verification: { available: boolean; rows: VerificationRow[]; unavailableReason?: string };
}

export function computeAccounts(ds: AnalyticsDataset, range: AnalyticsRange): AccountMetrics {
  const web = webEventsInRange(ds, range);
  const visitorSet = (name: string) =>
    new Set(web.filter((e) => e.event_name === name && e.visitor_id).map((e) => e.visitor_id!));
  const visitorsWith = (name: string) => visitorSet(name).size;
  const completed = web.filter((e) => e.event_name === "signup_completed");
  const fromGuest = completed.filter((e) => e.metadata?.upgraded_from_guest === true).length;
  const direct = completed.filter((e) => e.metadata?.upgraded_from_guest === false).length;

  const inRangeAll = ds.events.filter((e) => inRange(ts(e.received_at), range));
  const guestUsers = new Set<string>();
  const registeredUsers = new Set<string>();
  for (const e of inRangeAll) {
    if (!e.user_id) continue;
    if (e.is_guest === true) guestUsers.add(e.user_id);
    if (e.is_guest === false) registeredUsers.add(e.user_id);
  }

  const starts = new Set(AUTHORITATIVE_START_EVENTS);
  const railwayStarts = railwayEventsInRange(ds, range).filter((e) => starts.has(e.event_name));

  const verificationEvents = inRangeAll.filter((e) =>
    ["verification_started", "verification_completed", "verification_failed"].includes(e.event_name),
  );
  const byType = new Map<string, VerificationRow>();
  for (const e of verificationEvents) {
    const type = e.verification_type ?? "(unspecified)";
    const row = byType.get(type) ?? { verificationType: type, started: 0, completed: 0, failed: 0 };
    if (e.event_name === "verification_started") row.started += 1;
    if (e.event_name === "verification_completed") row.completed += 1;
    if (e.event_name === "verification_failed") row.failed += 1;
    byType.set(type, row);
  }
  const available = VERIFICATION_EMITTERS_LIVE || verificationEvents.length > 0;

  // Conversion is read within one population: of the visitors who SAW the
  // signup screen, how many completed. A completer who never produced a
  // signup_viewed row (e.g. an upgrade finished days later from an email link)
  // is counted in signupCompleted but not in this rate's numerator.
  const viewedSet = visitorSet("signup_viewed");
  const viewed = viewedSet.size;
  const completedVisitors = [...visitorSet("signup_completed")].filter((v) => viewedSet.has(v)).length;

  return {
    signupViewed: viewed,
    signupStarted: visitorsWith("signup_started"),
    signupCompleted: completed.length,
    completedFromGuest: fromGuest,
    completedDirect: direct,
    completedUnknownOrigin: completed.length - fromGuest - direct,
    viewToComplete: { numerator: completedVisitors, denominator: viewed },
    guestUsers: guestUsers.size,
    registeredUsers: registeredUsers.size,
    authoritativeStartsGuest: railwayStarts.filter((e) => e.is_guest === true).length,
    authoritativeStartsSignedIn: railwayStarts.filter((e) => e.is_guest === false).length,
    verification: {
      available,
      rows: [...byType.values()].sort((a, b) => a.verificationType.localeCompare(b.verificationType)),
      unavailableReason: available
        ? undefined
        : "Not yet instrumented. The contract (verification_started / _completed / _failed with verification_type) is ready; no product surface emits it yet.",
    },
  };
}

// --- Retention -------------------------------------------------------------

export interface RetentionRate {
  /** Visitors old enough to be measured. */
  eligible: number;
  retained: number;
  /** Visitors first seen in range but too recent to measure yet. */
  tooRecent: number;
}

export interface RetentionMetrics {
  /** Visitors first seen in range — the new-visitor cohort. */
  cohortSize: number;
  returningVisitors: number;
  repeatSessions: number;
  sessionsPerVisitor: number | null;
  d1: RetentionRate;
  d7: RetentionRate;
}

/**
 * Day-N retention over the cohort of visitors first seen in range.
 *
 *   D1: eligible once first_seen + 48h ≤ now; retained if a session starts in
 *       [first_seen + 24h, first_seen + 48h).
 *   D7: eligible once first_seen + 8d ≤ now; retained if a session starts in
 *       [first_seen + 7d, first_seen + 8d).
 *
 * Windows are rolling from each visitor's own first-seen instant, so the
 * definition does not depend on the viewer's time zone. A visitor not yet old
 * enough is counted in `tooRecent`, never as "not retained".
 */
export function computeRetention(ds: AnalyticsDataset, range: AnalyticsRange, now: number): RetentionMetrics {
  const sessions = indexSessions(ds);
  const byVisitor = sessionsByVisitor(sessions);
  const firstSeen = firstSeenByVisitor(ds, sessions);
  const active = activeSessionIds(ds, range, sessions);

  const cohort: Array<[string, number]> = [];
  for (const [v, f] of firstSeen) if (inRange(f, range)) cohort.push([v, f]);

  const dayN = (fromDays: number): RetentionRate => {
    const out: RetentionRate = { eligible: 0, retained: 0, tooRecent: 0 };
    const lo = fromDays * DAY_MS;
    const hi = (fromDays + 1) * DAY_MS;
    for (const [v, f] of cohort) {
      if (f + hi > now) {
        out.tooRecent += 1;
        continue;
      }
      out.eligible += 1;
      const came = (byVisitor.get(v) ?? []).some((s) => s.startedAt >= f + lo && s.startedAt < f + hi);
      if (came) out.retained += 1;
    }
    return out;
  };

  const activeVisitors = new Set<string>();
  const returning = new Set<string>();
  let repeat = 0;
  for (const id of active) {
    const s = sessions.get(id)!;
    activeVisitors.add(s.visitor_id);
    if (isRepeat(s, byVisitor)) {
      repeat += 1;
      returning.add(s.visitor_id);
    }
  }

  return {
    cohortSize: cohort.length,
    returningVisitors: returning.size,
    repeatSessions: repeat,
    sessionsPerVisitor: activeVisitors.size === 0 ? null : active.size / activeVisitors.size,
    d1: dayN(1),
    d7: dayN(7),
  };
}

export function retentionRate(r: RetentionRate): Rate {
  return { numerator: r.retained, denominator: r.eligible };
}

// --- Sources ---------------------------------------------------------------

export interface SourceRow {
  key: string;
  count: number;
}

export interface SourceBreakdown {
  total: number;
  bySource: SourceRow[];
  byMedium: SourceRow[];
  byCampaign: SourceRow[];
  byReferrer: SourceRow[];
  direct: number;
}

export interface SourceMetrics {
  /** New visitors in range, by their immutable first touch. */
  firstTouch: SourceBreakdown;
  /** Sessions started in range, by that session's own touch. */
  sessionTouch: SourceBreakdown;
}

const OWN_HOSTS = ["mogzy.lol", "www.mogzy.lol", "mogsy.lovable.app", "localhost"];

/** Host of a referrer, or null. Raw text is stored; classification is a reporting decision (§14.6). */
export function referrerHost(referrer: string | null | undefined): string | null {
  const raw = (referrer ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

interface Touch {
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

const blank = (s: string | null | undefined) => !s || !s.trim();

function breakdown(touches: Touch[]): SourceBreakdown {
  const tally = (keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };
  let direct = 0;
  const sources: string[] = [];
  const referrers: string[] = [];
  for (const t of touches) {
    const host = referrerHost(t.referrer);
    const internal = host !== null && OWN_HOSTS.includes(host);
    if (!blank(t.utm_source)) sources.push(t.utm_source!.trim().toLowerCase());
    else if (host && !internal) sources.push(`(referral) ${host}`);
    else if (internal) sources.push("(internal)");
    else {
      sources.push("(direct)");
      direct += 1;
    }
    referrers.push(host ? (internal ? "(internal)" : host) : "(none)");
  }
  return {
    total: touches.length,
    bySource: tally(sources),
    byMedium: tally(touches.map((t) => (blank(t.utm_medium) ? "(none)" : t.utm_medium!.trim().toLowerCase()))),
    byCampaign: tally(touches.map((t) => (blank(t.utm_campaign) ? "(none)" : t.utm_campaign!.trim()))),
    byReferrer: tally(referrers),
    direct,
  };
}

export function computeSources(ds: AnalyticsDataset, range: AnalyticsRange): SourceMetrics {
  const sessions = indexSessions(ds);
  const firstSeen = firstSeenByVisitor(ds, sessions);
  const visitorRows = new Map(ds.visitors.map((v) => [v.visitor_id, v]));
  const byVisitor = sessionsByVisitor(sessions);
  const sessionRows = new Map(ds.sessions.map((s) => [s.session_id, s]));

  const first: Touch[] = [];
  for (const [v, f] of firstSeen) {
    if (!inRange(f, range)) continue;
    const row = visitorRows.get(v);
    if (row) {
      first.push({
        referrer: row.first_referrer,
        utm_source: row.first_utm_source,
        utm_medium: row.first_utm_medium,
        utm_campaign: row.first_utm_campaign,
      });
      continue;
    }
    // No visitor row (independent write failed): fall back to the first session's touch.
    const s = byVisitor.get(v)?.[0];
    const sr = s ? sessionRows.get(s.session_id) : undefined;
    first.push({
      referrer: sr?.referrer ?? null,
      utm_source: sr?.utm_source ?? null,
      utm_medium: sr?.utm_medium ?? null,
      utm_campaign: sr?.utm_campaign ?? null,
    });
  }

  const sessionTouches: Touch[] = ds.sessions
    .filter((s) => inRange(ts(s.started_at), range))
    .map((s) => ({ referrer: s.referrer, utm_source: s.utm_source, utm_medium: s.utm_medium, utm_campaign: s.utm_campaign }));

  return { firstTouch: breakdown(first), sessionTouch: breakdown(sessionTouches) };
}

// --- System health ---------------------------------------------------------

export interface LatestReceived {
  web: string | null;
  railway: string | null;
  /** Latest received_at per authoritative event name (all time). */
  byRailwayEvent: Record<string, string | null>;
}

export interface HealthMetrics {
  eventsBySource: SourceRow[];
  /** Browser rows carrying a Railway-only name. Must be 0; never counted as gameplay. */
  webAuthoritativeRows: number;
  /** Railway rows sharing (event, entity). The DB forbids this; must be 0. */
  duplicateRailwayEntities: number;
  /** Railway rows with no entity key — they bypass idempotency. */
  railwayMissingEntity: number;
  /** Browser rows with no visitor id. */
  webMissingVisitor: number;
  /** In-range sessions whose visitor has no analytics_visitors row. */
  sessionsWithoutVisitorRow: number;
  /** Browser mode-opens for Railway-backed modes received after the latest Railway event. */
  opensSinceLastAuthoritative: number;
  gapWarning: string | null;
}

export function computeHealth(
  ds: AnalyticsDataset,
  range: AnalyticsRange,
  latest: LatestReceived,
): HealthMetrics {
  const inRangeAll = ds.events.filter((e) => inRange(ts(e.received_at), range));
  const bySource = new Map<string, number>();
  for (const e of inRangeAll) bySource.set(e.source_system, (bySource.get(e.source_system) ?? 0) + 1);

  const authoritative = new Set(AUTHORITATIVE_EVENTS);
  const railway = inRangeAll.filter((e) => e.source_system === "railway");
  const keys = new Map<string, number>();
  let missingEntity = 0;
  for (const e of railway) {
    if (!e.source_entity_type || !e.source_entity_id) {
      missingEntity += 1;
      continue;
    }
    const k = `${e.event_name}|${e.source_entity_type}|${e.source_entity_id}`;
    keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  let dupes = 0;
  for (const n of keys.values()) if (n > 1) dupes += n - 1;

  const visitorIds = new Set(ds.visitors.map((v) => v.visitor_id));
  const sessionsWithoutVisitorRow = ds.sessions.filter(
    (s) => inRange(ts(s.started_at), range) && !visitorIds.has(s.visitor_id),
  ).length;

  const railwayModes = new Set(GAMEPLAY_MODES.filter((m) => m.started).map((m) => m.opened));
  const lastRailway = latest.railway ? ts(latest.railway) : null;
  const opensSince = inRangeAll.filter(
    (e) =>
      e.source_system === "web" &&
      railwayModes.has(e.event_name) &&
      (lastRailway === null || ts(e.received_at) > lastRailway),
  ).length;

  let gapWarning: string | null = null;
  if (lastRailway === null && opensSince > 0) {
    gapWarning = `No Railway-authoritative event has ever been received, while ${opensSince} browser mode-open(s) exist in range.`;
  } else if (opensSince >= 10) {
    gapWarning = `${opensSince} browser mode-opens arrived after the latest Railway-authoritative event. Check the outbox below — a gap this size usually means delivery has stopped.`;
  }

  return {
    eventsBySource: [...bySource.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    webAuthoritativeRows: inRangeAll.filter((e) => e.source_system === "web" && authoritative.has(e.event_name)).length,
    duplicateRailwayEntities: dupes,
    railwayMissingEntity: missingEntity,
    webMissingVisitor: inRangeAll.filter((e) => e.source_system === "web" && !e.visitor_id).length,
    sessionsWithoutVisitorRow,
    opensSinceLastAuthoritative: opensSince,
    gapWarning,
  };
}

// --- Daily trend -----------------------------------------------------------

export interface DailyRow {
  day: string;
  visitors: number;
  sessions: number;
  newVisitors: number;
  authoritativeStarts: number;
}

/** One row per UTC day that has any activity in range, newest first. */
export function computeDaily(ds: AnalyticsDataset, range: AnalyticsRange): DailyRow[] {
  const sessions = indexSessions(ds);
  const firstSeen = firstSeenByVisitor(ds, sessions);
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const rows = new Map<string, { v: Set<string>; s: number; n: number; a: number }>();
  const get = (d: string) => {
    let r = rows.get(d);
    if (!r) rows.set(d, (r = { v: new Set(), s: 0, n: 0, a: 0 }));
    return r;
  };
  for (const s of sessions.values()) {
    if (!inRange(s.startedAt, range)) continue;
    const r = get(day(s.startedAt));
    r.s += 1;
    r.v.add(s.visitor_id);
  }
  for (const [, f] of firstSeen) if (inRange(f, range)) get(day(f)).n += 1;
  const starts = new Set(AUTHORITATIVE_START_EVENTS);
  for (const e of railwayEventsInRange(ds, range)) if (starts.has(e.event_name)) get(day(ts(e.received_at))).a += 1;
  return [...rows.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([d, r]) => ({ day: d, visitors: r.v.size, sessions: r.s, newVisitors: r.n, authoritativeStarts: r.a }));
}
