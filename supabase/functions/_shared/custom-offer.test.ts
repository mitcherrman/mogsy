import { describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_SESSION_TTL_SECONDS,
  CUSTOM_OFFER_TERMS,
  buildCheckoutSessionParams,
  hashClaimToken,
  isCustomOfferSession,
  isValidClaimToken,
  readCustomOfferConfig,
  returnOrigin,
  validateCustomOfferPrice,
} from "./custom-offer.ts";
import { handleCustomOfferEvent, type WebhookDeps } from "./custom-offer-webhook.ts";
import { resolveGiftByPriceId } from "./gift-catalog.ts";

/**
 * PT1.6b — the pure rules of the custom one-time offer. The SQL is exercised
 * on a real Postgres in src/test/security/pt16CustomOffer*.test.ts.
 */

const env = (vars: Record<string, string>) => (name: string) => vars[name];
const LIVE_READY = {
  CUSTOM_OFFER_CHECKOUT_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_PRICE_CUSTOM_ONE_TIME_50: "price_live50",
};

describe("terms", () => {
  it("are $50.00 USD for 12 months, one time", () => {
    expect(CUSTOM_OFFER_TERMS).toEqual({
      offer_id: "custom_one_time_50", amount_cents: 5000, currency: "usd", months: 12, auto_renews: false,
    });
  });
});

describe("readCustomOfferConfig — fail closed", () => {
  it("is off by default", () => {
    expect(readCustomOfferConfig(env({}))).toMatchObject({ enabled: false, reason: "not_enabled" });
  });
  it("is off without a real price", () => {
    expect(readCustomOfferConfig(env({ ...LIVE_READY, STRIPE_PRICE_CUSTOM_ONE_TIME_50: "" })))
      .toMatchObject({ enabled: false, reason: "price_not_configured" });
    expect(readCustomOfferConfig(env({ ...LIVE_READY, STRIPE_PRICE_CUSTOM_ONE_TIME_50: "prod_123" })))
      .toMatchObject({ enabled: false, reason: "price_not_configured" });
  });
  it("is off without a Stripe key", () => {
    expect(readCustomOfferConfig(env({ ...LIVE_READY, STRIPE_SECRET_KEY: "" })))
      .toMatchObject({ enabled: false, reason: "stripe_not_configured" });
  });
  it("refuses a LIVE key until live is explicitly approved", () => {
    expect(readCustomOfferConfig(env(LIVE_READY))).toMatchObject({ enabled: false, reason: "live_not_approved", liveMode: true });
    expect(readCustomOfferConfig(env({ ...LIVE_READY, STRIPE_SECRET_KEY: "rk_live_x" })))
      .toMatchObject({ enabled: false, reason: "live_not_approved" });
    expect(readCustomOfferConfig(env({ ...LIVE_READY, CUSTOM_OFFER_LIVE_APPROVED: "true" })))
      .toMatchObject({ enabled: true, reason: null, liveMode: true });
  });
  it("runs in Stripe test mode without live approval", () => {
    expect(readCustomOfferConfig(env({ ...LIVE_READY, STRIPE_SECRET_KEY: "sk_test_x" })))
      .toMatchObject({ enabled: true, liveMode: false, automaticTax: false });
  });
  it("only the literal string true enables anything", () => {
    expect(readCustomOfferConfig(env({ ...LIVE_READY, STRIPE_SECRET_KEY: "sk_test_x", CUSTOM_OFFER_CHECKOUT_ENABLED: "1" })).enabled).toBe(false);
    expect(readCustomOfferConfig(env({ ...LIVE_READY, CUSTOM_OFFER_LIVE_APPROVED: "yes" })).enabled).toBe(false);
  });
});

describe("claim tokens", () => {
  it("accepts only the minted format", () => {
    expect(isValidClaimToken("mgy1_" + "a1".repeat(24))).toBe(true);
    for (const bad of ["", "mgy1_", "mgy1_" + "A".repeat(48), "mgy2_" + "a".repeat(48), "mgy1_" + "a".repeat(47), null, 42]) {
      expect(isValidClaimToken(bad)).toBe(false);
    }
  });
  it("hashes to lowercase SHA-256 hex", async () => {
    expect(await hashClaimToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("validateCustomOfferPrice", () => {
  const good = { active: true, type: "one_time", unit_amount: 5000, currency: "usd", recurring: null, tax_behavior: "unspecified" };
  it("accepts exactly a $50.00 one-time USD price", () => {
    expect(validateCustomOfferPrice(good, false)).toBeNull();
    expect(validateCustomOfferPrice({ ...good, currency: "USD" }, false)).toBeNull();
  });
  it("rejects anything else", () => {
    expect(validateCustomOfferPrice(null, false)).toBe("price_missing");
    expect(validateCustomOfferPrice({ ...good, active: false }, false)).toBe("price_inactive");
    expect(validateCustomOfferPrice({ ...good, type: "recurring", recurring: { interval: "year" } }, false)).toBe("price_not_one_time");
    expect(validateCustomOfferPrice({ ...good, unit_amount: 4999 }, false)).toBe("price_amount_mismatch");
    expect(validateCustomOfferPrice({ ...good, unit_amount: null }, false)).toBe("price_amount_mismatch");
    expect(validateCustomOfferPrice({ ...good, currency: "eur" }, false)).toBe("price_currency_mismatch");
  });
  it("with automatic tax, demands a tax-inclusive price so the total stays $50", () => {
    expect(validateCustomOfferPrice(good, true)).toBe("price_not_tax_inclusive");
    expect(validateCustomOfferPrice({ ...good, tax_behavior: "exclusive" }, true)).toBe("price_not_tax_inclusive");
    expect(validateCustomOfferPrice({ ...good, tax_behavior: "inclusive" }, true)).toBeNull();
  });
});

describe("buildCheckoutSessionParams", () => {
  const base = {
    priceId: "price_live50", userId: "u1", email: "a@b.c", customerId: null, claimId: "c1",
    origin: "https://mogzy.lol", automaticTax: false, nowMs: 1_800_000_000_000,
  };
  it("is one unit of the server price, no discounts, card only, no renewal", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.mode).toBe("payment");
    expect(p.line_items).toEqual([{ price: "price_live50", quantity: 1 }]);
    expect(p.allow_promotion_codes).toBe(false);
    expect(p.payment_method_types).toEqual(["card"]);
    expect(p).not.toHaveProperty("discounts");
    expect(p).not.toHaveProperty("subscription_data");
    expect(p).not.toHaveProperty("automatic_tax");
    expect(p.metadata).toEqual({ supabase_user_id: "u1", mogzy_offer: "custom_one_time_50", custom_offer_claim_id: "c1" });
    expect((p.payment_intent_data as { metadata: unknown }).metadata).toEqual(p.metadata);
    expect(p.expires_at).toBe(1_800_000_000 + CHECKOUT_SESSION_TTL_SECONDS);
    expect(CHECKOUT_SESSION_TTL_SECONDS).toBeGreaterThanOrEqual(30 * 60);
    expect(p.success_url).toBe("https://mogzy.lol/lol/premium/claim?checkout=success");
  });
  it("reuses a known customer, otherwise creates one", () => {
    expect(buildCheckoutSessionParams({ ...base, customerId: "cus_1" })).toMatchObject({ customer: "cus_1" });
    expect(buildCheckoutSessionParams({ ...base, customerId: "cus_1" })).not.toHaveProperty("customer_email");
    expect(buildCheckoutSessionParams(base)).toMatchObject({ customer_email: "a@b.c", customer_creation: "always" });
  });
  it("turns on Stripe Tax only when configured", () => {
    expect(buildCheckoutSessionParams({ ...base, automaticTax: true })).toMatchObject({ automatic_tax: { enabled: true } });
  });
  it("never redirects off an allowlisted origin", () => {
    expect(returnOrigin("https://evil.example")).toBe("https://mogzy.lol");
    expect(returnOrigin(null)).toBe("https://mogzy.lol");
    expect(returnOrigin("http://localhost:5173")).toBe("http://localhost:5173");
  });
});

describe("isolation from existing checkout paths", () => {
  it("the custom price can never be bought through create-checkout's one-time allowlist", () => {
    expect(resolveGiftByPriceId("price_live50")).toBeNull();
  });
  it("only sessions this offer created are recognised", () => {
    expect(isCustomOfferSession({ id: "cs_1", mode: "payment", metadata: { mogzy_offer: "custom_one_time_50" } })).toBe(true);
    expect(isCustomOfferSession({ id: "cs_2", mode: "subscription", metadata: { mogzy_offer: "custom_one_time_50" } })).toBe(false);
    expect(isCustomOfferSession({ id: "cs_3", mode: "payment", metadata: { gift_id: "g" } })).toBe(false);
    expect(isCustomOfferSession({ id: "cs_4", mode: "subscription", metadata: { mogzy_offer: "standard_annual" } })).toBe(false);
  });
});

describe("handleCustomOfferEvent routing", () => {
  const deps = (rpcData: unknown = "not_found", pi = { id: "pi_1", status: "succeeded", amount_received: 5000, currency: "usd" }) => {
    const rpc = vi.fn(async () => ({ data: rpcData, error: null }));
    const d: WebhookDeps = { rpc, log: () => {}, stripe: { retrievePaymentIntent: vi.fn(async () => pi) } };
    return { d, rpc };
  };
  const session = (over: Record<string, unknown> = {}) => ({
    id: "cs_1", mode: "payment", payment_status: "paid", payment_intent: "pi_1", amount_total: 5000, currency: "usd",
    customer: "cus_1", metadata: { mogzy_offer: "custom_one_time_50", custom_offer_claim_id: "c1", supabase_user_id: "u1" },
    ...over,
  });
  const evt = (type: string, object: unknown) => ({ id: "evt_1", type, data: { object } });

  it("leaves subscription and gift sessions to the existing handler", async () => {
    const { d, rpc } = deps();
    for (const s of [session({ mode: "subscription" }), session({ metadata: { gift_id: "g1" } })]) {
      expect(await handleCustomOfferEvent(evt("checkout.session.completed", s), d)).toEqual({ handled: false, outcome: "not_custom_offer" });
      expect(await handleCustomOfferEvent(evt("checkout.session.expired", s), d)).toEqual({ handled: false, outcome: "not_custom_offer" });
    }
    expect(await handleCustomOfferEvent(evt("customer.subscription.updated", {}), d)).toEqual({ handled: false, outcome: "unrelated_event" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("activates with what Stripe CAPTURED, not with what the session advertised", async () => {
    const { d, rpc } = deps({ result: "activated" }, { id: "pi_1", status: "succeeded", amount_received: 4200, currency: "usd" });
    await handleCustomOfferEvent(evt("checkout.session.completed", session({ amount_total: 5000 })), d);
    expect(rpc).toHaveBeenCalledWith("custom_offer_activate_purchase", expect.objectContaining({
      _session_id: "cs_1", _claim_id: "c1", _user_id: "u1", _payment_intent_id: "pi_1", _amount_cents: 4200, _currency: "usd",
    }));
  });

  it("does not activate an unpaid session or an unsucceeded PaymentIntent", async () => {
    const unpaid = deps();
    expect((await handleCustomOfferEvent(evt("checkout.session.completed", session({ payment_status: "unpaid" })), unpaid.d)).outcome)
      .toBe("payment_pending");
    expect(unpaid.rpc).not.toHaveBeenCalledWith("custom_offer_activate_purchase", expect.anything());
    const processing = deps(null, { id: "pi_1", status: "processing", amount_received: 0, currency: "usd" });
    expect((await handleCustomOfferEvent(evt("checkout.session.completed", session()), processing.d)).outcome)
      .toBe("payment_not_succeeded");
    expect(processing.rpc).not.toHaveBeenCalledWith("custom_offer_activate_purchase", expect.anything());
  });

  it("applies a refund that raced ahead of activation", async () => {
    const { d, rpc } = deps({ result: "activated" }, {
      id: "pi_1", status: "succeeded", amount_received: 5000, currency: "usd",
      latest_charge: { id: "ch_1", amount_refunded: 5000 },
    } as never);
    await handleCustomOfferEvent(evt("checkout.session.completed", session()), d);
    expect(rpc).toHaveBeenLastCalledWith("custom_offer_record_refund", expect.objectContaining({
      _payment_intent_id: "pi_1", _amount_refunded_cents: 5000, _reason: "refund",
    }));
  });

  it("releases expired and failed sessions; revokes only on lost disputes", async () => {
    const { d, rpc } = deps("released");
    await handleCustomOfferEvent(evt("checkout.session.async_payment_failed", session()), d);
    expect(rpc).toHaveBeenCalledWith("custom_offer_release_checkout", { _session_id: "cs_1", _reason: "async_payment_failed" });
    const won = deps("revoked");
    expect((await handleCustomOfferEvent(evt("charge.dispute.closed", { id: "dp_1", status: "won", payment_intent: "pi_1" }), won.d)).handled).toBe(false);
    expect(won.rpc).not.toHaveBeenCalled();
    const lost = deps("revoked");
    expect(await handleCustomOfferEvent(evt("charge.dispute.closed", { id: "dp_1", status: "lost", payment_intent: "pi_1" }), lost.d))
      .toEqual({ handled: true, outcome: "revoked" });
  });

  it("ignores refunds of payments that are not this offer", async () => {
    const { d } = deps("not_found");
    expect(await handleCustomOfferEvent(evt("charge.refunded", { id: "ch_9", payment_intent: "pi_9", amount_refunded: 500 }), d))
      .toEqual({ handled: false, outcome: "not_found" });
  });

  it("throws on a database error so Stripe retries", async () => {
    const d: WebhookDeps = {
      rpc: async () => ({ data: null, error: { message: "connection reset" } }),
      log: () => {},
      stripe: { retrievePaymentIntent: async () => ({ id: "pi_1", status: "succeeded", amount_received: 5000, currency: "usd" }) },
    };
    await expect(handleCustomOfferEvent(evt("checkout.session.completed", session()), d)).rejects.toThrow(/connection reset/);
  });
});
