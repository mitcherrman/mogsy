/**
 * FUNNEL1B1 — attribution: where a visit came from.
 *
 * Two halves, two lifetimes (see the migration's §1):
 *
 *   FIRST TOUCH   — per visitor, written once, never revised. "Where did this
 *                   person originally come from?" A TikTok video that produced
 *                   a signup three weeks later still gets the credit.
 *   CURRENT TOUCH — per session. "Where did THIS visit come from?" Changes
 *                   every time the same person arrives from somewhere new,
 *                   which is the entire point of tracking it separately.
 *
 * Both are captured raw. No channel classification lives here or anywhere else
 * in B1 — grouping TikTok, Shorts, Discord, search and direct is a reporting
 * decision that will be revised, and every version of it is recoverable from
 * raw text while none of the raw text is recoverable from a bucket.
 */

import { clamp } from "./runtime";
import { UNKNOWN_TRAFFIC, type TrafficSignal } from "./traffic";

/** The five UTM parameters, plus the two things that matter as much as they do. */
export type Touch = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_path: string | null;
};

export const EMPTY_TOUCH: Touch = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  referrer: null,
  landing_path: null,
};

const UTM_MAX = 255;
const REFERRER_MAX = 1024;
const PATH_MAX = 512;

/** Does this touch carry any acquisition signal at all, or is it bare direct? */
export function hasUtm(touch: Touch): boolean {
  return Boolean(
    touch.utm_source ||
      touch.utm_medium ||
      touch.utm_campaign ||
      touch.utm_content ||
      touch.utm_term,
  );
}

/**
 * Two touches represent the same acquisition if their five UTM values match.
 * Referrer is excluded on purpose: it changes on ordinary internal navigation
 * in some browsers, and treating that as a new campaign would shred sessions.
 */
export function sameCampaign(a: Touch, b: Touch): boolean {
  return (
    a.utm_source === b.utm_source &&
    a.utm_medium === b.utm_medium &&
    a.utm_campaign === b.utm_campaign &&
    a.utm_content === b.utm_content &&
    a.utm_term === b.utm_term
  );
}

/**
 * Read the current acquisition context out of the browser.
 *
 * `referrer` is left EXACTLY as the browser reported it, including a same-
 * origin referrer. Filtering internal referrers here would be a classification
 * decision made at write time, and the audit's standing rule is that those are
 * made at read time. A query that wants external-only can filter on host.
 *
 * An empty `document.referrer` is the browser's way of saying direct (typed,
 * bookmarked, or a referrer-stripping source). It is stored as NULL, and NULL
 * with no UTM is what "direct" means in this schema.
 */
export function readCurrentTouch(
  location?: { search?: string; pathname?: string },
  referrer?: string,
): Touch {
  const search =
    location?.search ??
    (typeof window !== "undefined" ? window.location.search : "");
  const pathname =
    location?.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : null);
  const ref =
    referrer ?? (typeof document !== "undefined" ? document.referrer : "");

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? "");
  } catch {
    params = new URLSearchParams();
  }

  const utm = (name: string) => clamp(params.get(name), UTM_MAX);

  return {
    utm_source: utm("utm_source"),
    utm_medium: utm("utm_medium"),
    utm_campaign: utm("utm_campaign"),
    utm_content: utm("utm_content"),
    utm_term: utm("utm_term"),
    referrer: clamp(ref, REFERRER_MAX),
    landing_path: clamp(pathname, PATH_MAX),
  };
}

/** Shape written to public.analytics_visitors. */
export function toFirstTouchRow(visitorId: string, touch: Touch) {
  return {
    visitor_id: visitorId,
    first_landing_path: touch.landing_path,
    first_referrer: touch.referrer,
    first_utm_source: touch.utm_source,
    first_utm_medium: touch.utm_medium,
    first_utm_campaign: touch.utm_campaign,
    first_utm_content: touch.utm_content,
    first_utm_term: touch.utm_term,
  };
}

/**
 * Shape written to public.analytics_sessions.
 *
 * USERS1 added the traffic classification here rather than to the event row:
 * one browsing session is one verdict, and the session row is the only place
 * that grain exists. 'human' is never written from a client — the RLS WITH
 * CHECK refuses it — so this function narrows the class it will emit and a
 * `human` signal arriving here (a session restored from storage after
 * promotion) is written as `unknown` and re-promoted by the RPC.
 */
export function toSessionRow(
  sessionId: string,
  visitorId: string,
  touch: Touch,
  traffic: TrafficSignal = UNKNOWN_TRAFFIC,
) {
  const writable =
    traffic.trafficClass === "automation" || traffic.trafficClass === "internal"
      ? traffic.trafficClass
      : ("unknown" as const);
  return {
    session_id: sessionId,
    visitor_id: visitorId,
    landing_path: touch.landing_path,
    referrer: touch.referrer,
    utm_source: touch.utm_source,
    utm_medium: touch.utm_medium,
    utm_campaign: touch.utm_campaign,
    utm_content: touch.utm_content,
    utm_term: touch.utm_term,
    traffic_class: writable,
    traffic_source: traffic.trafficSource,
    classification_reason: traffic.classificationReason,
  };
}
