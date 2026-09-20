/**
 * FUNNEL1B2 — the event boundary for canonical SURFACE events.
 *
 * A surface event answers "did this visitor reach this place?" — landing, Hub,
 * Leaguecraft, a mode. React will ask that question many more times than the
 * visitor answers it: StrictMode invokes every effect twice in development,
 * auth hydration re-renders the tree, a Suspense boundary resolving can remount
 * a page, and a state change anywhere above can do the same. A naive
 * `useEffect(() => track(...), [])` produces two `landing_viewed` rows in dev
 * and an unpredictable number in production.
 *
 *
 * THE BOUNDARY: ONCE PER (SESSION, EVENT, KEY)
 *
 * Not once per mount — mounts are a React fact, not a visitor fact.
 * Not once per process — that would be global suppression, and the brief
 * explicitly rules it out: a visitor who comes back tomorrow must count again.
 *
 * The session id is the boundary because it is already the unit the funnel is
 * measured in. `landing_viewed` once per session is exactly what "sessions that
 * saw the landing page" means, and landing → hub conversion is then a division
 * of two honest numbers rather than a ratio of two rerender counts. When the
 * session rolls over — 30 minutes idle, or a new campaign arrival — the key
 * changes and the event fires again, because that genuinely is a new visit.
 *
 * The consequence, stated plainly so nobody discovers it in a dashboard: going
 * Hub → Leaguecraft → Hub within one session records ONE `hub_entered`. Repeat
 * navigation inside a visit is not a funnel step. Where raw open frequency
 * matters, the diagnostic CTA events still carry it.
 *
 *
 * WHY THE LEDGER IS A MODULE-LEVEL SET AND IS NEVER CLEANED UP
 *
 * A ref would reset on remount, which is the exact thing being defended
 * against. The cleanup function deliberately does not remove the key: under
 * StrictMode the sequence is effect → cleanup → effect, so removing it on
 * cleanup would re-arm the event and restore the double-fire this hook exists
 * to prevent.
 *
 * The Set is bounded in practice by (sessions in this tab) × (surfaces), which
 * is a handful of strings per visit and is discarded on page unload.
 *
 * ACTION events — starting a practice set, clicking a CTA — must NOT use this
 * hook. Starting three practice sets in one session is three events, and that
 * is the point of them. Call `track()` directly for those.
 */

import { useEffect, useRef } from "react";

import { getSession } from "./identity";
import { track } from "./track";
import type { AnalyticsEventName } from "./contract";

const fired = new Set<string>();

function dedupeKey(sessionId: string, eventName: string, key?: string): string {
  return `${sessionId}|${eventName}|${key ?? ""}`;
}

/**
 * Record a surface event at most once per session.
 *
 * Returns true if the event was emitted, false if this session already had it.
 * Exported separately from the hook so non-React entry points (a router guard,
 * an imperative navigation handler) share one ledger rather than keeping a
 * second one that disagrees.
 */
export function trackSurfaceOncePerSession(
  eventName: AnalyticsEventName | string,
  options: { key?: string; metadata?: Record<string, unknown> } = {},
): boolean {
  const { sessionId } = getSession();
  const k = dedupeKey(sessionId, eventName, options.key);
  if (fired.has(k)) return false;
  fired.add(k);
  track(eventName, { metadata: options.metadata });
  return true;
}

/**
 * Fire a canonical surface event on entry, once per session.
 *
 * `enabled` defers the event rather than cancelling it — a surface that must
 * wait for auth or for data to resolve passes `false` until it is genuinely
 * "entered", and the event fires on the render that flips it true. This is why
 * the hook exists rather than a bare call in a mount effect: several of these
 * surfaces render a skeleton first, and counting the skeleton would count
 * visitors who bounced before the page existed.
 *
 * `metadata` is read through a ref, so changing it does not re-fire the event.
 */
export function useSurfaceEvent(
  eventName: AnalyticsEventName | string,
  options: {
    key?: string;
    metadata?: Record<string, unknown>;
    enabled?: boolean;
  } = {},
): void {
  const { key, metadata, enabled = true } = options;
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  useEffect(() => {
    if (!enabled) return;
    trackSurfaceOncePerSession(eventName, { key, metadata: metadataRef.current });
    // metadata is intentionally excluded: it describes the event, it does not
    // define a new one.
  }, [eventName, key, enabled]);
}

/** Test-only. Production never forgets what it has already counted. */
export function resetSurfaceEventLedgerForTests(): void {
  fired.clear();
}
