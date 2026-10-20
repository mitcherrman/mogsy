// PT1.7 — adapts the real service-role Supabase client and Stripe client to the
// injected interfaces of gift-payment.ts, so every gift Edge Function (and the
// webhook) reconciles payments through the same code.
import {
  reconcileByMode,
  type DisputeLike,
  type GiftPaymentDeps,
  type GiftRow,
  type GiftSessionLike,
  type IntentLike,
  type ReconcileResult,
} from "./gift-payment.ts";
import type { GiftStripeMode } from "./private-annual-gift.ts";

interface Query {
  select(cols: string): Query;
  eq(col: string, value: string): Query;
  maybeSingle(): Promise<{ data: unknown; error: { message?: string } | null }>;
}
export interface AdminClientLike {
  from(table: string): Query;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}
export interface StripeLike {
  checkout: { sessions: { retrieve(id: string, opts?: Record<string, unknown>): Promise<unknown> } };
  paymentIntents: { retrieve(id: string, opts?: Record<string, unknown>): Promise<unknown> };
  disputes: { list(opts: Record<string, unknown>): Promise<{ data: unknown[] }> };
}

async function one(admin: AdminClientLike, col: string, value: string): Promise<GiftRow | null> {
  const { data, error } = await admin.from("gifts").select("*").eq(col, value).maybeSingle();
  if (error) throw new Error(`gift lookup failed: ${error.message ?? "unknown"}`);
  return (data as GiftRow | null) ?? null;
}

export function giftPaymentDeps(admin: AdminClientLike, stripe: StripeLike, mode: GiftStripeMode = "live"): GiftPaymentDeps {
  return {
    mode,
    rpc: async (fn, args) => await admin.rpc(fn, args),
    log: (message, detail) => console.warn(message, detail ?? {}),
    getGiftById: (id) => one(admin, "id", id),
    getGiftByPaymentIntent: (pi) => one(admin, "stripe_payment_intent_id", pi),
    stripe: {
      retrieveSession: async (id) =>
        (await stripe.checkout.sessions.retrieve(id, { expand: ["line_items"] })) as GiftSessionLike,
      retrievePaymentIntent: async (id) =>
        (await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] })) as IntentLike,
      listDisputes: async (pi) =>
        (await stripe.disputes.list({ payment_intent: pi, limit: 1 })).data as DisputeLike[],
    },
  };
}

/**
 * PT1.7-T: reconcile a gift with the Stripe client of ITS OWN mode (fixed by
 * its Checkout Session id). A test gift with no test key configured fails
 * closed: the caller sees an error, never a guess.
 */
export function giftLanes(admin: AdminClientLike, live: StripeLike, test: StripeLike | null) {
  const depsFor = (mode: GiftStripeMode): GiftPaymentDeps => {
    if (mode === "test" && !test) throw new Error("test-mode gift but STRIPE_TEST_SECRET_KEY is not configured");
    return giftPaymentDeps(admin, mode === "test" ? test! : live, mode);
  };
  return {
    depsFor,
    reconcile: async (gift: GiftRow): Promise<ReconcileResult> =>
      await reconcileByMode(gift, {
        live: giftPaymentDeps(admin, live, "live"),
        test: test ? giftPaymentDeps(admin, test, "test") : null,
      }),
  };
}

export async function giftByCode(admin: AdminClientLike, code: string): Promise<GiftRow | null> {
  return await one(admin, "redeem_code", code);
}
