// PT1.7-T — which Stripe "lane" a webhook delivery belongs to.
//
// The production endpoint is registered twice in Stripe: once in live mode
// (STRIPE_WEBHOOK_SECRET) and, for the private gift's test-mode end-to-end run
// only, once in test mode (STRIPE_TEST_WEBHOOK_SECRET). A delivery is verified
// against the live secret first; only if that fails is the test secret tried.
//
// A TEST-lane event:
//   * must itself say livemode === false (a test secret can never admit a live
//     event, even if the secrets were swapped by mistake);
//   * may reach ONLY the gift handler, and only for gift event types — never
//     the subscription is_pro sync, commercial state or the custom offer.
//
// Pure TypeScript: stripe-webhook injects Stripe's constructEventAsync.
import { GIFT_EVENT_TYPES } from "./gift-payment.ts";

export type StripeLane = "live" | "test";

export interface LaneSecrets {
  live: string;
  test?: string | null;
}

export interface LaneEvent<E> {
  event: E;
  lane: StripeLane;
}

export type ConstructEvent<E> = (body: string, signature: string, secret: string) => Promise<E>;

/**
 * The test lane alone: called by stripe-webhook ONLY after the live secret has
 * rejected the delivery. Null unless a configured test secret signs it AND the
 * event is a test-mode event.
 */
export async function verifyTestLaneEvent<E extends { livemode?: boolean }>(
  body: string,
  signature: string,
  testSecret: string | null | undefined,
  construct: ConstructEvent<E>,
): Promise<E | null> {
  if (!testSecret || !testSecret.startsWith("whsec_")) return null;
  let event: E;
  try {
    event = await construct(body, signature, testSecret);
  } catch {
    return null;
  }
  return event.livemode === false ? event : null;
}

/** Both lanes in stripe-webhook's order: live first, then the test lane. */
export async function verifyStripeEventLanes<E extends { livemode?: boolean }>(
  body: string,
  signature: string,
  secrets: LaneSecrets,
  construct: ConstructEvent<E>,
): Promise<LaneEvent<E> | null> {
  try {
    return { event: await construct(body, signature, secrets.live), lane: "live" };
  } catch {
    const event = await verifyTestLaneEvent(body, signature, secrets.test, construct);
    return event ? { event, lane: "test" } : null;
  }
}

/** Event types the test lane may process at all (everything else is ignored). */
export function isTestLaneEventType(type: string): boolean {
  return (GIFT_EVENT_TYPES as readonly string[]).includes(type);
}
