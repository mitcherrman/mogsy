import { describe, expect, it } from "vitest";
import {
  GIFT_SESSION_TTL_SECONDS,
  PRIVATE_GIFT_TERMS,
  buildPrivateGiftSessionParams,
  buyerAllowed,
  privateGiftConfig,
  recipientMatches,
  returnOrigin,
  validPrivatePrice,
  validRecipientEmail,
} from "./private-annual-gift.ts";
import { resolveGiftByPriceId } from "./gift-catalog.ts";
import { handleGiftRedeemRequest } from "./gift-redeem.ts";
import { giftStripeMode, testStripeKey } from "./private-annual-gift.ts";
import { isTestLaneEventType, verifyStripeEventLanes } from "./stripe-lanes.ts";

/**
 * PT1.7 — pure rules of the private annual gift. The SQL and the full flow are
 * exercised on PGlite in src/test/security/pt17Gift*.test.ts.
 */
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const env = (vars: Record<string, string>) => (name: string) => vars[name];
const READY = {
  PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_PRIVATE_ANNUAL_GIFT_PRICE_ID: "price_gift50",
  PRIVATE_ANNUAL_GIFT_TAX_MODE: "approved_not_taxable",
  PRIVATE_ANNUAL_GIFT_BUYER_USER_IDS: OWNER,
};

describe("terms", () => {
  it("are $50.00 USD once, for 365 days of Premium, never renewing", () => {
    expect(PRIVATE_GIFT_TERMS).toEqual({
      offer_id: "first_customer_annual_gift", gift_type: "pro_annual", amount_cents: 5000,
      currency: "usd", premium_days: 365, auto_renews: false,
    });
  });
});

describe("privateGiftConfig — fail closed", () => {
  it("is off by default and when any prerequisite is missing", () => {
    expect(privateGiftConfig(env({})).reason).toBe("not_enabled");
    expect(privateGiftConfig(env({ ...READY, STRIPE_SECRET_KEY: "" })).reason).toBe("stripe_not_configured");
    expect(privateGiftConfig(env({ ...READY, STRIPE_PRIVATE_ANNUAL_GIFT_PRICE_ID: "prod_x" })).reason).toBe("price_not_configured");
    expect(privateGiftConfig(env({ ...READY, PRIVATE_ANNUAL_GIFT_TAX_MODE: "" })).reason).toBe("tax_not_approved");
    expect(privateGiftConfig(env({ ...READY, PRIVATE_ANNUAL_GIFT_TAX_MODE: "yes" })).reason).toBe("tax_not_approved");
    expect(privateGiftConfig(env({ ...READY, PRIVATE_ANNUAL_GIFT_BUYER_USER_IDS: "owner@example.com" })).reason).toBe("buyers_not_configured");
  });

  it("needs explicit live approval for a live key", () => {
    const live = { ...READY, STRIPE_SECRET_KEY: "sk_live_x" };
    expect(privateGiftConfig(env(live))).toMatchObject({ enabled: false, reason: "live_not_approved", liveMode: true });
    expect(privateGiftConfig(env({ ...live, PRIVATE_ANNUAL_GIFT_LIVE_APPROVED: "true" }))).toMatchObject({ enabled: true });
  });

  it("ignores the legacy recipient-email and CA-tax flags (the buyer enters the recipient; tax is TAX_MODE)", () => {
    const c = privateGiftConfig(env({ ...READY, PRIVATE_ANNUAL_GIFT_RECIPIENT_EMAIL: "x@y.z", PRIVATE_ANNUAL_GIFT_CA_TAX_APPROVED: "true", PRIVATE_ANNUAL_GIFT_TAX_MODE: "" }));
    expect(c.enabled).toBe(false);
  });

  it("only allowlisted buyers may buy", () => {
    const c = privateGiftConfig(env({ ...READY, PRIVATE_ANNUAL_GIFT_BUYER_USER_IDS: ` ${OWNER.toUpperCase()} , junk` }));
    expect(c.buyerIds).toEqual([OWNER]);
    expect(buyerAllowed(c, OWNER)).toBe(true);
    expect(buyerAllowed(c, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBe(false);
    expect(buyerAllowed({ ...c, enabled: false }, OWNER)).toBe(false);
  });
});

describe("validPrivatePrice", () => {
  const good = { active: true, type: "one_time", unit_amount: 5000, currency: "usd", recurring: null, tax_behavior: "inclusive" };
  it("accepts exactly a $50.00 one-time USD price", () => {
    expect(validPrivatePrice(good, "approved_not_taxable")).toBeNull();
    expect(validPrivatePrice(good, "stripe_tax_inclusive")).toBeNull();
  });
  it("rejects everything else, including a tax-exclusive price under Stripe Tax", () => {
    expect(validPrivatePrice({ ...good, unit_amount: 4999 }, "approved_not_taxable")).toBe("price_amount_mismatch");
    expect(validPrivatePrice({ ...good, currency: "cad" }, "approved_not_taxable")).toBe("price_currency_mismatch");
    expect(validPrivatePrice({ ...good, recurring: { interval: "year" } }, "approved_not_taxable")).toBe("price_not_one_time");
    expect(validPrivatePrice({ ...good, tax_behavior: "exclusive" }, "stripe_tax_inclusive")).toBe("price_not_tax_inclusive");
    expect(validPrivatePrice(good, null)).toBe("tax_not_approved");
  });
});

describe("the session request", () => {
  const p = buildPrivateGiftSessionParams({
    priceId: "price_gift50", giftId: "g1", buyerId: OWNER, buyerEmail: "o@x.y", customerId: null,
    recipientEmail: " Friend@CA.example ", taxMode: "approved_not_taxable", origin: "https://mogzy.lol", nowMs: 1_800_000_000_000,
  });
  it("is one unit of the server price with no discounts, no renewal and server metadata", () => {
    expect(p).toMatchObject({ mode: "payment", line_items: [{ price: "price_gift50", quantity: 1 }],
      allow_promotion_codes: false, payment_method_types: ["card"] });
    expect(p).not.toHaveProperty("discounts");
    expect(p).not.toHaveProperty("subscription_data");
    expect(p).not.toHaveProperty("automatic_tax");
    expect(p.metadata).toMatchObject({ gift_id: "g1", private_offer: "first_customer_annual_gift", recipient_email: "friend@ca.example" });
    expect((p.payment_intent_data as { metadata: unknown }).metadata).toEqual(p.metadata);
    expect(p.expires_at).toBe(1_800_000_000 + GIFT_SESSION_TTL_SECONDS);
  });
  it("can never be bought through create-checkout's public catalog", () => {
    expect(resolveGiftByPriceId("price_gift50")).toBeNull();
  });
  it("returns only to allowlisted origins", () => {
    expect(returnOrigin("https://evil.example")).toBe("https://mogzy.lol");
  });
});

describe("recipient checks (UX mirror of the SQL rule)", () => {
  const gift = { recipient_email: "friend@ca.example", recipient_user_id: null };
  it("requires a verified, non-guest account with the same email", () => {
    expect(validRecipientEmail("friend@ca.example")).toBe(true);
    expect(validRecipientEmail("friend")).toBe(false);
    expect(recipientMatches({ id: "u", email: "FRIEND@ca.example ", email_confirmed_at: "t" }, gift)).toBe(true);
    expect(recipientMatches({ id: "u", email: "friend@ca.example", email_confirmed_at: null }, gift)).toBe(false);
    expect(recipientMatches({ id: "u", email: "friend@ca.example", email_confirmed_at: "t", is_anonymous: true }, gift)).toBe(false);
    expect(recipientMatches({ id: "u", email: "other@ca.example", email_confirmed_at: "t" }, gift)).toBe(false);
  });
});

describe("handleGiftRedeemRequest — input handling", () => {
  const deps = {
    rpc: async () => ({ data: null, error: null }),
    getGiftByCode: async () => null,
    reconcile: async () => null,
    log: () => {},
  };
  it("refuses guests and malformed codes without touching the database", async () => {
    let called = 0;
    const d = { ...deps, rpc: async () => { called++; return { data: null, error: null }; } };
    expect(await handleGiftRedeemRequest({ action: "redeem", code: "ABCDEFGH", user: { id: "u", isAnonymous: true } }, d))
      .toMatchObject({ success: false, reason: "account_required" });
    expect(await handleGiftRedeemRequest({ action: "redeem", code: "'; drop", user: { id: "u", isAnonymous: false } }, d))
      .toMatchObject({ success: false, reason: "invalid_code" });
    expect(called).toBe(0);
  });
});

describe("PT1.7-T test-key lane — configuration", () => {
  const TEST = {
    ...READY,
    STRIPE_SECRET_KEY: "sk_live_realkey",
    PRIVATE_ANNUAL_GIFT_STRIPE_MODE: "test",
    STRIPE_TEST_SECRET_KEY: "sk_test_abc123",
    STRIPE_PRIVATE_ANNUAL_GIFT_TEST_PRICE_ID: "price_test50",
  };
  it("uses the test key and the TEST price, and needs no live approval", () => {
    const c = privateGiftConfig(env(TEST));
    expect(c).toMatchObject({ enabled: true, stripeMode: "test", liveMode: false, priceId: "price_test50" });
  });
  it("refuses a live or missing key in the test slot — the test lane can never charge real money", () => {
    expect(privateGiftConfig(env({ ...TEST, STRIPE_TEST_SECRET_KEY: "sk_live_oops" })).reason).toBe("test_key_not_configured");
    expect(privateGiftConfig(env({ ...TEST, STRIPE_TEST_SECRET_KEY: "" })).reason).toBe("test_key_not_configured");
  });
  it("never falls back to the live price, and rejects unknown modes", () => {
    expect(privateGiftConfig(env({ ...TEST, STRIPE_PRIVATE_ANNUAL_GIFT_TEST_PRICE_ID: "" })).reason).toBe("price_not_configured");
    expect(privateGiftConfig(env({ ...TEST, PRIVATE_ANNUAL_GIFT_STRIPE_MODE: "Test" })).reason).toBe("stripe_mode_invalid");
  });
  it("live mode is unchanged by the test variables", () => {
    const c = privateGiftConfig(env({ ...TEST, PRIVATE_ANNUAL_GIFT_STRIPE_MODE: "live" }));
    expect(c).toMatchObject({ enabled: false, reason: "live_not_approved", stripeMode: "live", priceId: "price_gift50" });
  });
  it("testStripeKey only returns real test keys", () => {
    expect(testStripeKey(env({ STRIPE_TEST_SECRET_KEY: "rk_test_x1" }))).toBe("rk_test_x1");
    expect(testStripeKey(env({ STRIPE_TEST_SECRET_KEY: "sk_live_x1" }))).toBeNull();
    expect(testStripeKey(env({}))).toBeNull();
  });
  it("a gift's mode comes from its Checkout Session id", () => {
    expect(giftStripeMode("cs_test_a1")).toBe("test");
    expect(giftStripeMode("cs_live_a1")).toBe("live");
    expect(giftStripeMode(null)).toBe("live");
  });
});

describe("PT1.7-T test-key lane — webhook verification", () => {
  const construct = (signedWith: string, livemode: boolean) =>
    async (_b: string, _s: string, secret: string) => {
      if (secret !== signedWith) throw new Error("bad signature");
      return { id: "evt", type: "checkout.session.completed", livemode };
    };
  it("the live secret wins and behaves exactly as before", async () => {
    expect(await verifyStripeEventLanes("b", "s", { live: "whsec_live", test: "whsec_test" }, construct("whsec_live", true)))
      .toMatchObject({ lane: "live" });
    expect(await verifyStripeEventLanes("b", "s", { live: "whsec_live" }, construct("whsec_other", true))).toBeNull();
  });
  it("the test secret admits only test-mode events", async () => {
    expect(await verifyStripeEventLanes("b", "s", { live: "whsec_live", test: "whsec_test" }, construct("whsec_test", false)))
      .toMatchObject({ lane: "test" });
    expect(await verifyStripeEventLanes("b", "s", { live: "whsec_live", test: "whsec_test" }, construct("whsec_test", true)))
      .toBeNull();
    expect(await verifyStripeEventLanes("b", "s", { live: "whsec_live", test: null }, construct("whsec_test", false)))
      .toBeNull();
  });
  it("the test lane accepts gift event types only", () => {
    for (const t of ["checkout.session.completed", "checkout.session.expired", "charge.refunded", "charge.dispute.closed"]) {
      expect(isTestLaneEventType(t)).toBe(true);
    }
    for (const t of ["customer.subscription.updated", "customer.subscription.deleted", "invoice.paid"]) {
      expect(isTestLaneEventType(t)).toBe(false);
    }
  });
});

