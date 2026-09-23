/**
 * FUNNEL1B1 — visitor and session identity.
 *
 * These two ids are the reason the whole phase exists. Without a visitor id
 * there are no unique visitors and no new-vs-returning; without a session id
 * there are no sessions, no repeat sessions, and no D1/D7 cohort — and the
 * audit found that Mogzy has neither (docs/FUNNEL1_HANDOFF.md §8).
 *
 *
 * VISITOR
 *
 * A first-party UUID in localStorage, minted on first paint of any page —
 * including `/`, which is the page that currently emits nothing at all. It
 * survives navigation, tab close, and browser restart; it is never reset by an
 * auth change, which is what lets one visitor's history stitch together across
 * anonymous → signup → later visits without depending on the Supabase uid.
 *
 * It is generated locally from crypto and stored as-is. There is NO
 * fingerprinting: nothing here reads a canvas, a font list, a screen metric or
 * a UA string to re-derive identity. Clear site data and you are a new
 * visitor. That is the intended and correct behaviour.
 *
 *
 * SESSION
 *
 * A UUID with a 30-minute inactivity window, the conventional model and the
 * one every external tool will agree with when Mogzy is compared against them.
 * It lives in localStorage rather than sessionStorage — a deliberate departure
 * from the §9.3 proposal in the handoff, for two reasons that only show up in
 * practice:
 *
 *   1. sessionStorage is per-tab. A player who opens Leaguecraft in a second
 *      tab would become two sessions, and "sessions per visitor" — the metric
 *      the whole model exists to produce — would count tabs.
 *   2. sessionStorage does not survive a tab discard or a browser restore, so
 *      a session interrupted for ten seconds would be recorded as two.
 *
 * The inactivity clock does the job sessionStorage was being asked to do, and
 * does it the same way across tabs.
 *
 * A session is also restarted by a NEW ACQUISITION: arriving with UTM
 * parameters that differ from the ones the live session was opened with. That
 * is standard behaviour and it is what makes "session/current-touch
 * attribution can change on a later visit" true. A referrer change alone does
 * not restart a session — see attribution.sameCampaign.
 *
 * What does NOT restart a session: a route transition. touch() moves the
 * activity timestamp and nothing else. This is called on every event, so an
 * SPA navigating twenty times in five minutes is one session, which is the
 * failure mode the brief specifically named.
 */

import {
  EMPTY_TOUCH,
  hasUtm,
  readCurrentTouch,
  sameCampaign,
  type Touch,
} from "./attribution";
import { isUuid, readJson, safeStorage, secureUuid, writeJson } from "./runtime";
import { classifyTraffic, isTrafficClass, UNKNOWN_TRAFFIC, type TrafficSignal } from "./traffic";

export const VISITOR_KEY = "mogzy.analytics.visitor.v1";
export const SESSION_KEY = "mogzy.analytics.session.v1";
export const VISITOR_FIRST_TOUCH_KEY = "mogzy.analytics.visitorFirstTouch.v1";

/** The conventional 30 minutes. Exported so tests state the number, not a guess. */
export const SESSION_INACTIVITY_MS = 30 * 60 * 1000;

type StoredSession = {
  id: string;
  visitorId: string;
  startedAt: number;
  lastActivityAt: number;
  touch: Touch;
  /** Whether the session row has been accepted by the database yet. */
  recorded: boolean;
  /**
   * USERS1 — the session's traffic class, decided once when the session starts
   * and carried for its whole life. It is stored beside the session rather than
   * recomputed per event because the session row is written once: a later event
   * cannot revise what was inserted, and a value that drifted between events
   * would describe nothing.
   */
  traffic?: TrafficSignal;
  /** Whether this session has already been promoted to 'human'. */
  humanPromoted?: boolean;
};

export type VisitorState = {
  visitorId: string;
  /**
   * True on the call that minted it, and on no other.
   *
   * Informational only. It must NOT be used to decide whether to write the
   * first-touch row — see isFirstTouchRecorded below for why that coupling was
   * removed.
   */
  isNew: boolean;
  /**
   * True when localStorage was unavailable and the id lives only in memory.
   * Such a visitor is new on every page load; the flag exists so a reader can
   * tell an inflated unique-visitor count from a real one rather than
   * silently trusting it.
   */
  ephemeral: boolean;
};

export type SessionState = {
  sessionId: string;
  visitorId: string;
  startedAt: number;
  /** True on the paint that started it — the only moment to write the row. */
  isNew: boolean;
  touch: Touch;
  /** USERS1 — how this session was classified when it started. */
  traffic: TrafficSignal;
};

/**
 * Memory fallback. Used only when localStorage is unavailable (blocked site
 * data, some private windows, sandboxed iframe). Keeping the ids working
 * in-memory means a single page view is still internally consistent — events
 * from that view still share a visitor and a session — rather than arriving
 * with no identity at all.
 */
const memory: {
  visitorId: string | null;
  ephemeral: boolean;
  session: StoredSession | null;
} = { visitorId: null, ephemeral: false, session: null };

export function getVisitor(): VisitorState {
  const stored = safeStorage.get(VISITOR_KEY);
  if (isUuid(stored)) {
    return { visitorId: stored, isNew: false, ephemeral: false };
  }

  const minted = memory.visitorId ?? secureUuid();
  const persisted = safeStorage.set(VISITOR_KEY, minted);

  if (!persisted) {
    const alreadyKnown = memory.visitorId === minted;
    memory.visitorId = minted;
    memory.ephemeral = true;
    return { visitorId: minted, isNew: !alreadyKnown, ephemeral: true };
  }

  memory.visitorId = minted;
  return { visitorId: minted, isNew: true, ephemeral: false };
}

function loadSession(): StoredSession | null {
  const stored = readJson<StoredSession>(SESSION_KEY);
  if (
    stored &&
    isUuid(stored.id) &&
    isUuid(stored.visitorId) &&
    typeof stored.lastActivityAt === "number" &&
    typeof stored.startedAt === "number"
  ) {
    return {
      ...stored,
      touch: stored.touch ?? EMPTY_TOUCH,
      // Sessions stored before USERS1 have no class. `unknown` is the honest
      // verdict on them, and it is also what the database defaulted them to.
      traffic: isTrafficClass(stored.traffic?.trafficClass) ? stored.traffic : { ...UNKNOWN_TRAFFIC },
    };
  }
  return memory.session;
}

function saveSession(session: StoredSession): void {
  memory.session = session;
  writeJson(SESSION_KEY, session);
}

/**
 * Resolve the session for right now, starting a new one if the policy says so.
 *
 * `now` and `touch` are injectable so the expiry and re-acquisition rules can
 * be tested as rules rather than by sleeping for thirty-one minutes.
 */
export function getSession(options?: {
  now?: number;
  touch?: Touch;
  visitorId?: string;
  /** Injectable so classification can be tested as a rule, not as an environment. */
  traffic?: TrafficSignal;
}): SessionState {
  const now = options?.now ?? Date.now();
  const visitorId = options?.visitorId ?? getVisitor().visitorId;
  const touch = options?.touch ?? readCurrentTouch();

  const existing = loadSession();

  if (existing && existing.visitorId === visitorId) {
    const expired = now - existing.lastActivityAt >= SESSION_INACTIVITY_MS;

    // A fresh campaign hit starts a fresh session so the new acquisition is
    // attributed to it. Arriving with NO utm mid-session (an ordinary internal
    // navigation, or a return from an external page) must not — otherwise
    // every click after the campaign landing would spawn a session.
    const reacquired = hasUtm(touch) && !sameCampaign(existing.touch, touch);

    if (!expired && !reacquired) {
      saveSession({ ...existing, lastActivityAt: now });
      return {
        sessionId: existing.id,
        visitorId,
        startedAt: existing.startedAt,
        isNew: false,
        touch: existing.touch,
        traffic: existing.traffic ?? { ...UNKNOWN_TRAFFIC },
      };
    }
  }

  const traffic = options?.traffic ?? classifyTraffic();
  const started: StoredSession = {
    id: secureUuid(),
    visitorId,
    startedAt: now,
    lastActivityAt: now,
    touch,
    recorded: false,
    traffic,
  };
  saveSession(started);

  return {
    sessionId: started.id,
    visitorId,
    startedAt: now,
    isNew: true,
    touch,
    traffic,
  };
}

/**
 * Has this visitor's first-touch row been accepted by the database?
 *
 * B2 note — WHY THIS IS NOT `VisitorState.isNew`.
 *
 * `isNew` is a one-shot: it is true only on the call that mints the id, so ANY
 * other caller reaching `getVisitor()` first consumes it. That is precisely
 * what happened when useSurfaceEvent began resolving the session before
 * emitting — `getSession()` resolves the visitor internally, so by the time
 * `track()` looked, `isNew` was already false and the first-touch row was
 * never written at all. Attribution silently stopped existing.
 *
 * A persisted flag cannot be consumed by an extra read, and it fixes a second,
 * quieter defect at the same time: under `isNew` a first-touch insert that
 * FAILED (offline on the landing page) was never retried, because the visitor
 * was no longer new. Now it is retried on the next event, exactly as the
 * session row is.
 */
export function isFirstTouchRecorded(visitorId: string): boolean {
  return safeStorage.get(VISITOR_FIRST_TOUCH_KEY) === visitorId;
}

export function markFirstTouchRecorded(visitorId: string): void {
  safeStorage.set(VISITOR_FIRST_TOUCH_KEY, visitorId);
}

/** Has the session row been accepted by the database? */
export function isSessionRecorded(sessionId: string): boolean {
  const stored = loadSession();
  return Boolean(stored && stored.id === sessionId && stored.recorded);
}

/**
 * Mark the session row as written.
 *
 * The flag is what lets the emitter retry: the session insert is
 * fire-and-forget like everything else, so if it fails (offline at the moment
 * of the first event) the next event tries again rather than leaving the
 * session permanently unattributed.
 */
export function markSessionRecorded(sessionId: string): void {
  const stored = loadSession();
  if (stored && stored.id === sessionId && !stored.recorded) {
    saveSession({ ...stored, recorded: true });
  }
}

/**
 * USERS1 — has this session already been promoted to 'human'?
 *
 * Promotion is a one-way, once-per-session write (see traffic.ts and the
 * migration). The flag is persisted beside the session so a reload does not
 * re-fire the RPC on the next click, and so a session that genuinely predates
 * the feature is not repeatedly re-promoted.
 */
export function isSessionHumanPromoted(sessionId: string): boolean {
  const stored = loadSession();
  return Boolean(stored && stored.id === sessionId && stored.humanPromoted);
}

export function markSessionHumanPromoted(sessionId: string): void {
  const stored = loadSession();
  if (stored && stored.id === sessionId && !stored.humanPromoted) {
    saveSession({
      ...stored,
      humanPromoted: true,
      traffic: {
        trafficClass: "human",
        trafficSource: stored.traffic?.trafficSource ?? null,
        classificationReason: "trusted human input event",
      },
    });
  }
}

/** Test-only: forget both ids and the memory fallback. */
export function resetIdentityForTests(): void {
  memory.visitorId = null;
  memory.ephemeral = false;
  memory.session = null;
  safeStorage.remove(VISITOR_KEY);
  safeStorage.remove(VISITOR_FIRST_TOUCH_KEY);
  safeStorage.remove(SESSION_KEY);
}
