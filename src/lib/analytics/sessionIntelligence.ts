import type { User } from "@supabase/supabase-js";
import { e2eEnabled } from "@/lib/e2e/identity";
import { getSession, getVisitor, isFirstTouchRecorded } from "./identity";
import { FRONTEND_RELEASE_ID } from "./release";
import { analyticsDb } from "./schema";
import { readJson, recordFailure, writeJson } from "./runtime";

/** A visible/focused page becomes idle after one minute without trusted input. */
export const ACTIVE_IDLE_TIMEOUT_MS = 60_000;
/** Database writes are cumulative snapshots, never one write per interaction. */
export const ACTIVE_PERSIST_INTERVAL_MS = 15_000;
const TICK_MS = 1_000;
const ACTIVE_KEY_PREFIX = "mogzy.analytics.active.v1:";

export type SessionEndReason = "explicit_end" | "inactivity_timeout";
export type BrowserBoundary = "page_hidden" | "pagehide";

type StoredActive = { activeMs: number; lastActiveAt: string | null };

/** Pure clock state, exported so visibility/focus/idle edge cases are testable. */
export class ActiveTimeAccumulator {
  activeMs: number;
  lastActiveAt: number | null;
  private sampledAt: number;
  private lastInteractionAt: number;
  private eligible: boolean;

  constructor(
    now: number,
    eligible: boolean,
    initial: StoredActive = { activeMs: 0, lastActiveAt: null },
  ) {
    this.activeMs = Math.max(0, initial.activeMs);
    this.lastActiveAt = initial.lastActiveAt ? Date.parse(initial.lastActiveAt) : null;
    this.sampledAt = now;
    this.lastInteractionAt = now;
    this.eligible = eligible;
  }

  advance(now: number): void {
    const end = this.eligible
      ? Math.min(now, this.lastInteractionAt + ACTIVE_IDLE_TIMEOUT_MS)
      : this.sampledAt;
    const delta = Math.max(0, end - this.sampledAt);
    if (delta > 0) {
      this.activeMs += delta;
      this.lastActiveAt = end;
    }
    this.sampledAt = now;
  }

  setEligible(now: number, eligible: boolean): void {
    this.advance(now);
    this.eligible = eligible;
  }

  trustedInteraction(now: number, eligible: boolean): void {
    this.advance(now);
    this.eligible = eligible;
    this.lastInteractionAt = now;
  }

  /** Merge a larger checkpoint written by another same-browser tab. */
  mergeStored(stored: StoredActive): void {
    this.activeMs = Math.max(this.activeMs, stored.activeMs);
    const storedLast = stored.lastActiveAt ? Date.parse(stored.lastActiveAt) : null;
    if (storedLast !== null && Number.isFinite(storedLast)) {
      this.lastActiveAt = Math.max(this.lastActiveAt ?? 0, storedLast);
    }
  }
}

let installed = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let linkedThisPage = new Set<string>();
let pendingIdentityLink: { key: string; visitorId: string } | null = null;
let lastScrollSignalAt = 0;
const SCROLL_SIGNAL_THROTTLE_MS = 1_000;

function isEligible(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

function storedActive(sessionId: string): StoredActive {
  const row = readJson<StoredActive>(`${ACTIVE_KEY_PREFIX}${sessionId}`);
  return row && Number.isFinite(row.activeMs)
    ? { activeMs: Math.max(0, row.activeMs), lastActiveAt: row.lastActiveAt ?? null }
    : { activeMs: 0, lastActiveAt: null };
}

export function installSessionIntelligence(): void {
  if (
    installed ||
    e2eEnabled() ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) return;
  installed = true;

  let session = getSession();
  let accumulator = new ActiveTimeAccumulator(Date.now(), isEligible(), storedActive(session.sessionId));
  let lastPersistedMs = accumulator.activeMs;

  const saveLocal = () => {
    writeJson(`${ACTIVE_KEY_PREFIX}${session.sessionId}`, {
      activeMs: Math.floor(accumulator.activeMs),
      lastActiveAt: accumulator.lastActiveAt
        ? new Date(accumulator.lastActiveAt).toISOString()
        : null,
    } satisfies StoredActive);
  };

  const persist = async (options: {
    endReason?: SessionEndReason;
    browserBoundary?: BrowserBoundary;
    force?: boolean;
  } = {}) => {
    accumulator.mergeStored(storedActive(session.sessionId));
    accumulator.advance(Date.now());
    saveLocal();
    if (!options.force && accumulator.activeMs - lastPersistedMs < ACTIVE_PERSIST_INTERVAL_MS) return;
    const activeMs = Math.floor(accumulator.activeMs);
    const persisted = await recordSessionActivitySnapshot({
      sessionId: session.sessionId,
      visitorId: session.visitorId,
      activeMs,
      lastActiveAt: accumulator.lastActiveAt
        ? new Date(accumulator.lastActiveAt).toISOString()
        : null,
      endReason: options.endReason,
      browserBoundary: options.browserBoundary,
    });
    if (persisted) {
      lastPersistedMs = Math.max(lastPersistedMs, activeMs);
    }
  };

  const onInput = (event: Event) => {
    if (!event.isTrusted) return;
    const now = Date.now();
    const resolved = getSession({ now, visitorId: session.visitorId });
    if (resolved.sessionId !== session.sessionId) {
      void persist({ endReason: "inactivity_timeout", force: true });
      session = resolved;
      accumulator = new ActiveTimeAccumulator(now, isEligible(), storedActive(session.sessionId));
      lastPersistedMs = accumulator.activeMs;
    } else {
      accumulator.trustedInteraction(now, isEligible());
    }
  };
  const onScrollActivity = (event: Event) => {
    if (!event.isTrusted) return;
    const now = Date.now();
    if (now - lastScrollSignalAt < SCROLL_SIGNAL_THROTTLE_MS) return;
    lastScrollSignalAt = now;
    onInput(event);
  };
  const onVisibility = () => {
    accumulator.setEligible(Date.now(), isEligible());
    if (document.visibilityState === "hidden") {
      void persist({ browserBoundary: "page_hidden", force: true });
    }
  };
  const onFocus = () => accumulator.setEligible(Date.now(), isEligible());
  const onBlur = () => accumulator.setEligible(Date.now(), false);
  const onPageHide = () => void persist({ browserBoundary: "pagehide", force: true });

  for (const name of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(name, onInput, { capture: true, passive: true });
  }
  window.addEventListener("wheel", onScrollActivity, { capture: true, passive: true });
  document.addEventListener("scroll", onScrollActivity, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibility, { passive: true });
  window.addEventListener("focus", onFocus, { passive: true });
  window.addEventListener("blur", onBlur, { passive: true });
  window.addEventListener("pagehide", onPageHide, { passive: true });
  intervalId = setInterval(() => {
    void persist();
    void retryPendingVisitorLink();
  }, TICK_MS);
}

export async function recordSessionActivitySnapshot(params: {
  sessionId: string;
  visitorId: string;
  activeMs: number;
  lastActiveAt: string | null;
  endReason?: SessionEndReason;
  browserBoundary?: BrowserBoundary;
}): Promise<boolean> {
  if (e2eEnabled()) return false;
  try {
    const { data, error } = await analyticsDb.rpc("analytics_record_session_activity", {
      p_session_id: params.sessionId,
      p_visitor_id: params.visitorId,
      p_active_ms: params.activeMs,
      p_last_active_at: params.lastActiveAt,
      p_end_reason: params.endReason ?? null,
      p_browser_boundary: params.browserBoundary ?? null,
    });
    if (error) {
      recordFailure("rpc:analytics_record_session_activity", error.message);
      return false;
    }
    return data === true;
  } catch (error) {
    recordFailure("rpc:analytics_record_session_activity", error);
    return false;
  }
}

/**
 * Same-browser deterministic linkage only. The RPC derives user_id from
 * auth.uid(); anonymous Auth identities are deliberately ignored.
 */
export async function observeAuthenticatedVisitor(user: User | null): Promise<void> {
  if (e2eEnabled() || !user || user.is_anonymous === true) return;
  const visitorId = getVisitor().visitorId;
  const key = `${visitorId}:${user.id}`;
  if (linkedThisPage.has(key)) return;
  if (pendingIdentityLink?.key === key) return;
  pendingIdentityLink = { key, visitorId };
  await retryPendingVisitorLink(true);
}

/** Retry once first-touch persistence is known; `immediate` permits the initial probe. */
export async function retryPendingVisitorLink(immediate = false): Promise<boolean> {
  if (e2eEnabled() || !pendingIdentityLink) return false;
  const pending = pendingIdentityLink;
  if (!immediate && !isFirstTouchRecorded(pending.visitorId)) return false;
  try {
    const { data, error } = await analyticsDb.rpc("analytics_link_visitor_user", {
      p_visitor_id: pending.visitorId,
    });
    if (error) {
      recordFailure("rpc:analytics_link_visitor_user", error.message);
      return false;
    }
    if (data !== true) return false;
    linkedThisPage.add(pending.key);
    if (pendingIdentityLink?.key === pending.key) pendingIdentityLink = null;
    return true;
  } catch (error) {
    recordFailure("rpc:analytics_link_visitor_user", error);
    return false;
  }
}

/** Reserved for a product-owned explicit sign-off/end action. */
export async function recordExplicitSessionEnd(): Promise<void> {
  if (e2eEnabled()) return;
  const session = getSession();
  const local = storedActive(session.sessionId);
  await recordSessionActivitySnapshot({
    sessionId: session.sessionId,
    visitorId: session.visitorId,
    activeMs: Math.floor(local.activeMs),
    lastActiveAt: local.lastActiveAt,
    endReason: "explicit_end",
  });
}

export function resetSessionIntelligenceForTests(): void {
  installed = false;
  linkedThisPage = new Set();
  pendingIdentityLink = null;
  lastScrollSignalAt = 0;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

export { FRONTEND_RELEASE_ID };
