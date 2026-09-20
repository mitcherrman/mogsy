/**
 * FUNNEL1B1 — the emitter.
 *
 * The one place an analytics row is written, and the one place the common
 * fields are assembled. A caller supplies the event name and the parts only it
 * can know; visitor, session, route, auth state, attribution bootstrapping and
 * timestamps are all captured here.
 *
 * That division is the point. The audit's finding was not that UTM handling
 * was wrong — it was that UTM handling did not exist, and the reason it never
 * got added is that there was nowhere for it to live except inside individual
 * pages. Nothing outside this directory should ever read a query parameter,
 * mint an id, or touch `document.referrer` again.
 *
 *
 * THE FAILURE CONTRACT
 *
 * Non-blocking: track() returns void synchronously and never awaits. No render
 * path, click handler or route transition waits for the network.
 * Non-fatal: nothing thrown inside ever escapes.
 * Non-silent: every failure lands in the diagnostics channel (runtime.ts), and
 * in DEV it also reaches the console. This is the specific correction to the
 * predecessor's bare `catch {}`, under which a missing table went unnoticed in
 * production for two months.
 */

import {
  EVENT_NAME_PATTERN,
  LEGACY_EVENT_ALIASES,
  isKnownEvent,
  type AnalyticsEventName,
  type ServerEventIdentity,
  type SignupMethod,
  type VerificationType,
} from "./contract";
import {
  readCurrentTouch,
  toFirstTouchRow,
  toSessionRow,
  type Touch,
} from "./attribution";
import {
  getSession,
  getVisitor,
  isSessionRecorded,
  markSessionRecorded,
} from "./identity";
import { clamp, recordFailure, recordSent } from "./runtime";
import {
  ANALYTICS_EVENTS_TABLE,
  ANALYTICS_SESSIONS_TABLE,
  ANALYTICS_VISITORS_TABLE,
  analyticsDb,
  type AnalyticsEventInsert,
} from "./schema";
import { supabase } from "@/integrations/supabase/client";

const ROUTE_MAX = 512;

export type TrackOptions = {
  /** Event-specific dimensions. Common fields are captured automatically. */
  metadata?: Record<string, unknown>;
  /** Bump when an event's metadata shape changes meaningfully. Defaults to 1. */
  version?: number;
  /** Structured type for the three verification_* events. */
  verificationType?: VerificationType;
  /**
   * Overrides the captured pathname. For events fired after a navigation has
   * already committed, where window.location no longer names the surface the
   * user acted on.
   */
  route?: string;
};

/**
 * Fire an analytics event.
 *
 * Synchronous, non-blocking, never throws. The returned promise is exposed
 * only so tests can await the write; product code must ignore it.
 */
export function track(
  eventName: AnalyticsEventName | string,
  options: TrackOptions = {},
): void {
  void trackAsync(eventName, options);
}

/** The awaitable form. Used by tests and by nothing in the product. */
export async function trackAsync(
  eventName: AnalyticsEventName | string,
  options: TrackOptions = {},
): Promise<void> {
  try {
    const resolved = LEGACY_EVENT_ALIASES[eventName] ?? eventName;

    // Rejected by the database's CHECK, which the silent-fail contract would
    // then swallow. Caught here so the developer gets a named diagnostic
    // instead of a missing row.
    if (!EVENT_NAME_PATTERN.test(resolved)) {
      recordFailure("contract:event_name", `"${resolved}" is not a valid event name`);
      return;
    }
    if (!isKnownEvent(resolved)) {
      // Not fatal — a new event should not need a deploy of this file to be
      // recorded — but it is worth a developer's attention, because the usual
      // cause is a typo in a name that already exists.
      recordFailure("contract:unknown_event", `"${resolved}" is not in the contract`);
    }

    const touch = readCurrentTouch();
    const visitor = getVisitor();
    const session = getSession({ touch, visitorId: visitor.visitorId });

    // Attribution rows are written before the event, and only when they are
    // new. Both are fire-and-forget and both tolerate failure: an event with
    // no visitor row is still a countable event.
    await Promise.all([
      visitor.isNew ? recordFirstTouch(visitor.visitorId, touch) : Promise.resolve(),
      session.isNew || !isSessionRecorded(session.sessionId)
        ? recordSession(session.sessionId, visitor.visitorId, session.touch)
        : Promise.resolve(),
    ]);

    const auth = await readAuthState();

    const row: AnalyticsEventInsert = {
      event_name: resolved,
      event_version: options.version ?? 1,
      occurred_at: new Date().toISOString(),
      route: clamp(options.route ?? currentPath(), ROUTE_MAX),
      visitor_id: visitor.visitorId,
      session_id: session.sessionId,
      user_id: auth.userId,
      is_guest: auth.isGuest,
      // A browser cannot write anything else — the RLS WITH CHECK pins it —
      // and saying so explicitly keeps the client honest about what it is.
      source_system: "web",
      verification_type: clamp(options.verificationType ?? null, 64),
      metadata: options.metadata ?? null,
    };

    const { error } = await analyticsDb.from(ANALYTICS_EVENTS_TABLE).insert(row);
    if (error) {
      recordFailure(`insert:${ANALYTICS_EVENTS_TABLE}`, error.message);
      return;
    }
    recordSent();
  } catch (error) {
    recordFailure("track", error);
  }
}

function currentPath(): string | null {
  try {
    return typeof window !== "undefined" ? window.location.pathname : null;
  } catch {
    return null;
  }
}

/**
 * user_id is the Supabase uid, anonymous or not, and is_guest snapshots
 * anonymity AT EMISSION. The snapshot is the valuable half: because Mogzy
 * upgrades the guest identity in place, the uid alone cannot tell you whether
 * the person was a guest when they did the thing — only this boolean can, and
 * only if it is captured now.
 */
async function readAuthState(): Promise<{ userId: string | null; isGuest: boolean }> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { userId: null, isGuest: true };
    return { userId: user.id, isGuest: Boolean(user.is_anonymous) };
  } catch (error) {
    recordFailure("auth:getSession", error);
    return { userId: null, isGuest: true };
  }
}

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * A plain INSERT whose only expected failure — the row is already there — is
 * treated as success.
 *
 * WHY NOT `.upsert(..., { onConflict, ignoreDuplicates: true })`, WHICH IS THE
 * OBVIOUS SHAPE: because it does not work under these tables' RLS, and fails
 * in a way that looks like a policy bug rather than a query one. Naming a
 * conflict target makes Postgres read the arbiter index, which requires SELECT
 * on the table, and these tables deliberately grant anon no SELECT policy at
 * all. The insert is then rejected with "new row violates row-level security
 * policy" — even for a row that does not conflict with anything. This is
 * proved in src/test/security/funnel1b1AnalyticsSchema.test.ts rather than
 * asserted here, because it is the kind of claim that stops being true when
 * someone adds a SELECT policy for an unrelated reason.
 *
 * A targetless `ON CONFLICT DO NOTHING` does work — but reaching it depends on
 * exactly how PostgREST renders an upsert with no `on_conflict` parameter,
 * which is a third party's implementation detail sitting between this line and
 * the behaviour it needs. A plain insert plus an explicit 23505 check depends
 * on nothing but the Postgres error code, and says what it means.
 *
 * The idempotency itself is not provided by this function in any case. Both
 * tables have an INSERT policy and no UPDATE policy, so a second write CANNOT
 * revise the first even if this code tried to.
 */
async function insertOnce(
  table: typeof ANALYTICS_VISITORS_TABLE | typeof ANALYTICS_SESSIONS_TABLE,
  row: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { error } = await analyticsDb.from(table).insert(row as never);
    if (!error) return true;
    // The row is already recorded. That is the intended end state, not a fault.
    if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) return true;
    recordFailure(`insert:${table}`, error.message);
    return false;
  } catch (error) {
    recordFailure(`insert:${table}`, error);
    return false;
  }
}

/**
 * First touch, written once per visitor and never revised.
 *
 * Attempted only on the paint that mints the visitor id, so the duplicate path
 * is a rarity (a lost response, a racing tab) rather than the norm.
 */
async function recordFirstTouch(visitorId: string, touch: Touch): Promise<void> {
  await insertOnce(ANALYTICS_VISITORS_TABLE, toFirstTouchRow(visitorId, touch));
}

/**
 * Current touch, one row per session.
 *
 * Retried on every event until it succeeds (isSessionRecorded), because a
 * session whose row never landed is a session that exists in the event ledger
 * with no acquisition context — recoverable only by guessing.
 */
async function recordSession(
  sessionId: string,
  visitorId: string,
  touch: Touch,
): Promise<void> {
  const ok = await insertOnce(
    ANALYTICS_SESSIONS_TABLE,
    toSessionRow(sessionId, visitorId, touch),
  );
  // A 23505 counts as success here too, and deliberately: it means the first
  // attempt landed and only its response was lost, so the retry has confirmed
  // what it set out to confirm.
  if (ok) markSessionRecorded(sessionId);
}

// ---------------------------------------------------------------------------
// Typed conveniences
// ---------------------------------------------------------------------------

/**
 * Verification. FUNNEL1 does not implement any verification method; these
 * exist so that whoever does has one contract to emit against and does not
 * invent a second shape per provider.
 */
export function trackVerificationStarted(
  verificationType: VerificationType,
  metadata?: Record<string, unknown>,
): void {
  track("verification_started", { verificationType, metadata });
}

export function trackVerificationCompleted(
  verificationType: VerificationType,
  metadata?: Record<string, unknown>,
): void {
  track("verification_completed", { verificationType, metadata });
}

export function trackVerificationFailed(
  verificationType: VerificationType,
  reason: string,
  metadata?: Record<string, unknown>,
): void {
  track("verification_failed", {
    verificationType,
    metadata: { ...metadata, reason },
  });
}

/**
 * Signup completion.
 *
 * `upgradedFromGuest` is required, not optional, and that is the whole point
 * of the helper: it is the field that separates a real conversion from a
 * `profiles` row, and an optional field would be omitted at exactly the call
 * sites where it matters. See contract.isRegisteredUser for the definition
 * this is built on.
 */
export function trackSignupCompleted(params: {
  method: SignupMethod;
  upgradedFromGuest: boolean;
  entrySurface?: string;
}): void {
  track("signup_completed", {
    metadata: {
      method: params.method,
      upgraded_from_guest: params.upgradedFromGuest,
      entry_surface: params.entrySurface ?? null,
    },
  });
}

/**
 * Build the row a SERVER-AUTHORITATIVE event must carry.
 *
 * Not callable from the browser in any useful sense — the RLS WITH CHECK
 * rejects source_system <> 'web' and rejects any source_entity_* from anon or
 * authenticated. It lives here so that Railway's emitter (B2) and this
 * contract share one definition of the idempotency key rather than growing two
 * that drift apart. The partial unique index in the migration is what actually
 * enforces it.
 */
export function buildServerEventRow(params: {
  eventName: AnalyticsEventName | string;
  identity: ServerEventIdentity;
  occurredAt?: Date;
  userId?: string | null;
  isGuest?: boolean | null;
  visitorId?: string | null;
  sessionId?: string | null;
  version?: number;
  metadata?: Record<string, unknown>;
}): AnalyticsEventInsert {
  return {
    event_name: params.eventName,
    event_version: params.version ?? 1,
    occurred_at: (params.occurredAt ?? new Date()).toISOString(),
    route: null,
    visitor_id: params.visitorId ?? null,
    session_id: params.sessionId ?? null,
    user_id: params.userId ?? null,
    is_guest: params.isGuest ?? null,
    source_system: params.identity.sourceSystem,
    source_entity_type: params.identity.entityType,
    source_entity_id: params.identity.entityId,
    verification_type: null,
    metadata: params.metadata ?? null,
  };
}
