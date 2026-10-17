// PT1.6b — Stripe webhook handling for the custom one-time offer.
//
// Called by stripe-webhook AFTER signature verification. Pure TypeScript with
// injected Stripe/RPC so vitest can drive every event shape.
//
// Entitlement is granted ONLY here, and only when:
//   * the event is for a Checkout Session this offer created (server metadata),
//   * the session reports payment_status = "paid", AND
//   * the PaymentIntent, re-read from Stripe, has status "succeeded".
// The captured amount and currency go to SQL, which compares them against the
// SQL terms and holds anything else for review — it never grants on a mismatch.
//
// Errors THROW so stripe-webhook answers 500 and Stripe retries (transient DB
// or Stripe failures). Outcomes that a retry cannot change are ledgered and
// return normally, so Stripe is not made to retry them for days.
import { isCustomOfferSession, type SessionLike } from "./custom-offer.ts";
import type { Rpc } from "./custom-offer-checkout.ts";

export interface ChargeLike {
  id: string;
  payment_intent?: string | { id: string } | null;
  amount_refunded?: number | null;
  refunded?: boolean | null;
}

export interface PaymentIntentLike {
  id: string;
  status?: string;
  amount_received?: number | null;
  currency?: string | null;
  latest_charge?: string | ChargeLike | null;
}

export interface DisputeLike {
  id: string;
  status?: string;
  payment_intent?: string | { id: string } | null;
}

export interface WebhookStripe {
  /** Must expand `latest_charge`. */
  retrievePaymentIntent(id: string): Promise<PaymentIntentLike>;
}

export interface WebhookDeps {
  rpc: Rpc;
  stripe: WebhookStripe;
  log: (message: string, detail?: Record<string, unknown>) => void;
}

export interface EventLike {
  id: string;
  type: string;
  data: { object: unknown };
}

export interface CustomOfferOutcome {
  /** False when the event is not about this offer — the caller carries on. */
  handled: boolean;
  outcome: string;
}

export const CUSTOM_OFFER_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.closed",
] as const;

const idOf = (v: string | { id: string } | null | undefined): string | null =>
  typeof v === "string" ? v : v?.id ?? null;

async function call(deps: WebhookDeps, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await deps.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message ?? "unknown"}`);
  return data;
}

async function ledger(deps: WebhookDeps, event: string, session: SessionLike, detail: Record<string, unknown>) {
  await call(deps, "custom_offer_log_event", {
    _event: event,
    _claim_id: session.metadata?.custom_offer_claim_id ?? null,
    _user_id: session.metadata?.supabase_user_id ?? null,
    _stripe_object_id: session.id,
    _detail: detail,
  });
}

async function activate(event: EventLike, session: SessionLike, deps: WebhookDeps): Promise<string> {
  if (session.payment_status !== "paid") {
    // Card-only sessions settle synchronously, but if a delayed method ever
    // slips in, async_payment_succeeded brings us back here when it is paid.
    await ledger(deps, "payment_pending", session, { event: event.id, payment_status: session.payment_status });
    return "payment_pending";
  }
  const piId = idOf(session.payment_intent);
  const claimId = session.metadata?.custom_offer_claim_id;
  const userId = session.metadata?.supabase_user_id;
  if (!piId || !claimId || !userId) {
    await ledger(deps, "activation_missing_reference", session, { event: event.id, has_pi: !!piId });
    return "missing_reference";
  }

  const pi = await deps.stripe.retrievePaymentIntent(piId);
  if (pi.status !== "succeeded") {
    await ledger(deps, "payment_not_succeeded", session, { event: event.id, pi_status: pi.status });
    return "payment_not_succeeded";
  }

  const result = (await call(deps, "custom_offer_activate_purchase", {
    _session_id: session.id,
    _claim_id: claimId,
    _user_id: userId,
    _payment_intent_id: pi.id,
    _customer_id: idOf(session.customer),
    // What Stripe actually captured, not what the session advertised.
    _amount_cents: pi.amount_received ?? null,
    _currency: pi.currency ?? session.currency ?? null,
  })) as { result: string; reason?: string };

  if (result.result === "review" || result.result === "unattributable") {
    deps.log("custom-offer: purchase held for owner review", { session: session.id, ...result });
  }

  // A refund that raced ahead of activation must still take effect.
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  if (charge && (charge.amount_refunded ?? 0) > 0) {
    const r = await call(deps, "custom_offer_record_refund", {
      _payment_intent_id: pi.id,
      _amount_refunded_cents: charge.amount_refunded,
      _reason: "refund",
      _stripe_object_id: charge.id,
    });
    return `${result.result}+${r}`;
  }
  return result.result;
}

/**
 * Handle one verified Stripe event if it belongs to the custom offer.
 * Returns `{ handled: false }` for anything else, untouched.
 */
export async function handleCustomOfferEvent(event: EventLike, deps: WebhookDeps): Promise<CustomOfferOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as SessionLike;
      if (!isCustomOfferSession(session)) return { handled: false, outcome: "not_custom_offer" };
      return { handled: true, outcome: await activate(event, session, deps) };
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object as SessionLike;
      if (!isCustomOfferSession(session)) return { handled: false, outcome: "not_custom_offer" };
      // Abandoned or failed: free the claim for the SAME customer to retry.
      const r = await call(deps, "custom_offer_release_checkout", {
        _session_id: session.id,
        _reason: event.type === "checkout.session.expired" ? "expired" : "async_payment_failed",
      });
      return { handled: true, outcome: String(r) };
    }
    case "charge.refunded": {
      const charge = event.data.object as ChargeLike;
      const piId = idOf(charge.payment_intent);
      if (!piId) return { handled: false, outcome: "no_payment_intent" };
      const r = String(await call(deps, "custom_offer_record_refund", {
        _payment_intent_id: piId,
        _amount_refunded_cents: charge.amount_refunded ?? 0,
        _reason: "refund",
        _stripe_object_id: charge.id,
      }));
      return { handled: r !== "not_found", outcome: r };
    }
    case "charge.dispute.closed": {
      const dispute = event.data.object as DisputeLike;
      const piId = idOf(dispute.payment_intent);
      if (!piId || dispute.status !== "lost") return { handled: false, outcome: "not_lost" };
      const r = String(await call(deps, "custom_offer_record_refund", {
        _payment_intent_id: piId,
        _amount_refunded_cents: 0,
        _reason: "dispute_lost",
        _stripe_object_id: dispute.id,
      }));
      return { handled: r !== "not_found", outcome: r };
    }
    default:
      return { handled: false, outcome: "unrelated_event" };
  }
}
