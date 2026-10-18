// PT1.7 — what Stripe says about a gift's payment, re-read from Stripe and
// recorded through `public.gift_record_payment` (a monotonic SQL state machine).
//
// Used by stripe-webhook (every gift event), the buyer's return page
// (gift-checkout "status", verify-gift) and redemption (redeem-gift), so the
// SAME rules decide "paid" everywhere. A redirect to a success URL proves
// nothing; an event payload is only a hint to go and re-read the current
// objects, which is what makes retried and out-of-order events converge.
//
// Pure TypeScript with injected Stripe/RPC/row readers so vitest can drive it.
import { resolveGiftByPriceId } from "./gift-catalog.ts";
import {
  PRIVATE_ANNUAL_GIFT,
  PRIVATE_GIFT_AMOUNT,
  isPrivateGift,
  normalizeEmail,
  validPrivatePrice,
  type GiftTaxMode,
  type PriceLike,
} from "./private-annual-gift.ts";

export type GiftPaymentState = "pending" | "paid" | "refunded" | "disputed" | "expired" | "invalid";

export interface GiftRow {
  id: string;
  sender_user_id: string | null;
  recipient_email: string | null;
  gift_type: string;
  diamond_amount: number | null;
  stripe_session_id: string | null;
  stripe_price_id: string | null;
  stripe_payment_intent_id?: string | null;
  offer_id?: string | null;
  status: string;
}

type Ref = string | { id: string } | null | undefined;
const idOf = (v: Ref): string | null => (typeof v === "string" ? v : v?.id ?? null);

export interface ChargeLike {
  id: string;
  paid?: boolean;
  amount?: number;
  amount_refunded?: number;
  refunded?: boolean;
  disputed?: boolean;
  currency?: string;
  payment_intent?: Ref;
}

export interface IntentLike {
  id: string;
  status?: string;
  amount_received?: number;
  currency?: string;
  latest_charge?: string | ChargeLike | null;
  metadata?: Record<string, string> | null;
}

export interface DisputeLike {
  id: string;
  status?: string;
  payment_intent?: Ref;
}

export interface GiftSessionLike {
  id: string;
  mode?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_intent?: Ref;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
  total_details?: { amount_discount?: number | null } | null;
  automatic_tax?: { enabled?: boolean; status?: string | null } | null;
  line_items?: { has_more?: boolean; data?: Array<{ quantity?: number | null; price?: PriceLike | null }> } | null;
}

export interface GiftPaymentStripe {
  /** Must expand `line_items` (with `line_items.data.price`). */
  retrieveSession(id: string): Promise<GiftSessionLike>;
  /** Must expand `latest_charge`. */
  retrievePaymentIntent(id: string): Promise<IntentLike>;
  /** Most recent first. */
  listDisputes(paymentIntentId: string): Promise<DisputeLike[]>;
}

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;

export interface GiftPaymentDeps {
  rpc: Rpc;
  stripe: GiftPaymentStripe;
  getGiftById(id: string): Promise<GiftRow | null>;
  getGiftByPaymentIntent(pi: string): Promise<GiftRow | null>;
  log: (message: string, detail?: Record<string, unknown>) => void;
}

export interface Inspection {
  state: GiftPaymentState;
  note: string | null;
}

const invalid = (note: string): Inspection => ({ state: "invalid", note });

/**
 * Decide the payment state of a gift from Stripe's CURRENT objects. Pure.
 */
export function inspectGiftPayment(
  gift: GiftRow,
  session: GiftSessionLike,
  intent: IntentLike | null,
  disputes: DisputeLike[],
): Inspection {
  // ---- the session must be THIS gift's, exactly as the server created it
  const lines = session.line_items?.data ?? [];
  const line = lines[0];
  if (!gift.stripe_session_id || session.id !== gift.stripe_session_id) return invalid("session_mismatch");
  if (session.mode !== "payment") return invalid("not_payment_mode");
  if (session.metadata?.gift_id !== gift.id) return invalid("metadata_gift_mismatch");
  if (session.metadata?.supabase_user_id !== gift.sender_user_id) return invalid("metadata_buyer_mismatch");
  if (normalizeEmail(session.metadata?.recipient_email) !== normalizeEmail(gift.recipient_email)) {
    return invalid("metadata_recipient_mismatch");
  }
  if (session.line_items?.has_more || lines.length !== 1) return invalid("line_items_count");
  if (!line?.price?.id || line.price.id !== gift.stripe_price_id) return invalid("price_mismatch");
  if (line.quantity !== 1) return invalid("quantity_not_one");

  // ---- has money actually moved?
  if (session.status === "expired") return { state: "expired", note: "session_expired" };
  if (intent?.status === "canceled") return { state: "expired", note: "payment_canceled" };
  if (session.status !== "complete" || session.payment_status !== "paid") return { state: "pending", note: null };
  const pi = idOf(session.payment_intent);
  if (!pi || !intent || intent.id !== pi) return { state: "pending", note: "intent_unavailable" };
  if (intent.status !== "succeeded") return { state: "pending", note: `intent_${intent.status ?? "unknown"}` };
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  if (!charge || charge.paid !== true) return { state: "pending", note: "charge_unavailable" };

  // ---- refunds and disputes (current state, whichever event arrived first)
  if (charge.disputed) {
    const status = disputes[0]?.status;
    if (status === "lost") return { state: "refunded", note: "dispute_lost" };
    if (status !== "won" && status !== "warning_closed") return { state: "disputed", note: `dispute_${status ?? "open"}` };
  }
  const refunded = charge.amount_refunded ?? 0;
  if (charge.refunded || (charge.amount != null && refunded >= charge.amount)) {
    return { state: "refunded", note: "refunded" };
  }
  const partial = refunded > 0 ? "partial_refund" : null;

  // ---- the private offer: exactly $50.00 USD, every way Stripe can say it
  if (isPrivateGift(gift)) {
    const taxMode = session.metadata?.tax_mode as GiftTaxMode | undefined;
    if (session.metadata?.private_offer !== PRIVATE_ANNUAL_GIFT) return invalid("private_offer_metadata");
    if (session.currency !== "usd" || session.amount_total !== PRIVATE_GIFT_AMOUNT) return invalid("session_amount");
    if ((session.total_details?.amount_discount ?? 0) !== 0) return invalid("discount_applied");
    if (intent.currency !== "usd" || intent.amount_received !== PRIVATE_GIFT_AMOUNT) return invalid("intent_amount");
    if (charge.currency !== "usd" || charge.amount !== PRIVATE_GIFT_AMOUNT) return invalid("charge_amount");
    const priceProblem = validPrivatePrice(line.price, taxMode === "stripe_tax_inclusive" || taxMode === "approved_not_taxable" ? taxMode : null);
    if (priceProblem) return invalid(priceProblem);
    if (taxMode === "stripe_tax_inclusive") {
      if (!session.automatic_tax?.enabled || session.automatic_tax.status !== "complete") return invalid("tax_not_computed");
    } else if (session.automatic_tax?.enabled) {
      return invalid("unexpected_tax");
    }
  } else {
    // Existing catalog gifts: the price must still be in the server catalog
    // and agree with what the row promises the recipient.
    const entry = resolveGiftByPriceId(line.price.id);
    if (!entry || entry.giftType !== gift.gift_type || entry.diamondAmount !== (gift.diamond_amount ?? 0)) {
      return invalid("catalog_mismatch");
    }
  }
  return { state: "paid", note: partial };
}

export interface ReconcileResult {
  state: GiftPaymentState;
  note: string | null;
  result: string;
  status: string;
}

/** Re-read Stripe for one gift and record what it says. Throws on any I/O error. */
export async function reconcileGiftPayment(deps: GiftPaymentDeps, gift: GiftRow): Promise<ReconcileResult> {
  if (!gift.stripe_session_id) throw new Error("gift has no Checkout Session");
  const session = await deps.stripe.retrieveSession(gift.stripe_session_id);
  const pi = idOf(session.payment_intent);
  const intent = pi ? await deps.stripe.retrievePaymentIntent(pi) : null;
  const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const disputes = charge?.disputed && pi ? await deps.stripe.listDisputes(pi) : [];
  const { state, note } = inspectGiftPayment(gift, session, intent, disputes);
  const { data, error } = await deps.rpc("gift_record_payment", {
    _gift_id: gift.id,
    _session_id: session.id,
    _payment_intent: pi,
    _state: state,
    _amount: session.amount_total ?? null,
    _currency: session.currency ?? null,
    _note: note,
  });
  if (error) throw new Error(`gift_record_payment failed: ${error.message ?? "unknown"}`);
  const r = data as { result: string; status: string };
  if (state === "invalid") deps.log("gift payment held as invalid", { gift: gift.id, note });
  return { state, note, result: r.result, status: r.status };
}

export const GIFT_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
] as const;

export interface GiftEventOutcome {
  handled: boolean;
  outcome: string;
}

/**
 * Handle one signature-verified Stripe event if it concerns a gift. The payload
 * only identifies the gift; the state always comes from a fresh Stripe read.
 */
export async function handleGiftEvent(
  event: { id: string; type: string; data: { object: unknown } },
  deps: GiftPaymentDeps,
): Promise<GiftEventOutcome> {
  let gift: GiftRow | null = null;

  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as GiftSessionLike;
    const giftId = session.metadata?.gift_id;
    if (!giftId) return { handled: false, outcome: "not_a_gift" };
    gift = await deps.getGiftById(giftId);
    if (!gift) {
      deps.log("gift event for unknown gift", { event: event.id, giftId });
      return { handled: true, outcome: "unknown_gift" };
    }
    if (gift.stripe_session_id !== session.id) {
      // A session that is no longer this gift's (replaced before it attached).
      return { handled: true, outcome: "stale_session" };
    }
  } else if (event.type === "charge.refunded" || event.type.startsWith("charge.dispute.")) {
    const object = event.data.object as ChargeLike | DisputeLike;
    const pi = idOf(object.payment_intent);
    if (!pi) return { handled: false, outcome: "no_payment_intent" };
    gift = await deps.getGiftByPaymentIntent(pi);
    if (!gift) {
      // Refund/dispute observed before the payment was recorded: private gifts
      // carry gift_id on the PaymentIntent, so the gift is still found.
      const intent = await deps.stripe.retrievePaymentIntent(pi);
      const giftId = intent.metadata?.gift_id;
      gift = giftId ? await deps.getGiftById(giftId) : null;
    }
    if (!gift) return { handled: false, outcome: "not_a_gift" };
    if (!gift.stripe_session_id) return { handled: true, outcome: "no_session" };
  } else {
    return { handled: false, outcome: "unrelated_event" };
  }

  const r = await reconcileGiftPayment(deps, gift);
  return { handled: true, outcome: `${r.state}:${r.result}` };
}
