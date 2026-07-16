/**
 * Provider-neutral ad lifecycle analytics.
 *
 * Rides the existing funnel-events pipeline (src/lib/funnel-analytics.ts) —
 * no new analytics SDK. Payloads carry only placement/provider/reason;
 * never quiz answers, ranked private data, or emails. User attribution is
 * whatever trackFunnelEvent already records.
 */

import { trackFunnelEvent } from "@/lib/funnel-analytics";
import type { AdPlacement } from "./placements";
import type { AdPolicyDecision } from "./policy";

export type AdLifecycleEvent =
  | "ad_slot_eligible"
  | "ad_slot_rendered"
  | "ad_slot_suppressed"
  | "ad_slot_error"
  | "house_ad_clicked";

export interface AdEventPayload {
  placement: AdPlacement;
  provider?: "placeholder" | "house" | "third_party";
  reason?: string;
  creativeId?: string;
}

/** Swappable boundary so tests (or a future provider) can intercept events. */
export type AdEventSink = (event: AdLifecycleEvent, payload: AdEventPayload) => void;

let sink: AdEventSink = (event, payload) => {
  trackFunnelEvent(event, { ...payload });
};

export function setAdEventSink(next: AdEventSink | null): void {
  sink = next ?? (() => {});
}

export function emitAdEvent(event: AdLifecycleEvent, payload: AdEventPayload): void {
  try {
    sink(event, payload);
  } catch {
    // analytics must never break rendering
  }
}

export function emitDecision(placement: AdPlacement, decision: AdPolicyDecision): void {
  if (decision.kind === "suppressed") {
    // Skip the two "system entirely off" cases to avoid noise.
    if (decision.reason === "global_disabled") return;
    emitAdEvent("ad_slot_suppressed", { placement, reason: decision.reason });
  } else {
    emitAdEvent("ad_slot_eligible", { placement, provider: decision.kind });
  }
}
