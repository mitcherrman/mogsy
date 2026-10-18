// @vitest-environment node
/**
 * PT1.7 — the whole gift path end to end, with only Stripe faked: the REAL
 * gift-checkout, redeem-gift and webhook handlers, the REAL reconciler, the
 * REAL SQL (production chain → 0004) on PGlite. The fake Stripe models what
 * matters: sessions open/expire/complete, PaymentIntents, charges, refunds,
 * disputes, Stripe Tax and prices.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, bootGiftDb } from "./giftDbFixture";
import {
  handleGiftCheckoutRequest,
  type BuyerGiftRow,
  type CheckoutSessionLike,
  type GiftCheckoutDeps,
  type GiftCheckoutRequest,
} from "../../../supabase/functions/_shared/gift-checkout";
import { handleGiftRedeemRequest, type GiftRedeemDeps } from "../../../supabase/functions/_shared/gift-redeem";
import {
  handleGiftEvent,
  reconcileByMode,
  reconcileGiftPayment,
  type ChargeLike,
  type DisputeLike,
  type GiftPaymentDeps,
  type GiftRow,
  type GiftSessionLike,
  type IntentLike,
} from "../../../supabase/functions/_shared/gift-payment";
import type { PriceLike, PrivateGiftConfig } from "../../../supabase/functions/_shared/private-annual-gift";

const OWNER = "20000000-0000-4000-8000-000000000001";
const FRIEND = "20000000-0000-4000-8000-000000000002";
const STRANGER = "20000000-0000-4000-8000-000000000003";
const UNVERIFIED_FRIEND = "20000000-0000-4000-8000-000000000004";
const OTHER_BUYER = "20000000-0000-4000-8000-000000000005";
const UNVERIFIED_BUYER = "20000000-0000-4000-8000-000000000006";
const LEGACY_MONTHLY_PRICE = "price_1TZS2yD9NqEQUIGhP9HWjgy1"; // gift-catalog fallback (pro_monthly)

let db: PGlite;

// ---- service-role RPC and row reads, as PostgREST would do them -----------
const rpc = async (fn: string, args: Record<string, unknown>) => {
  const names = Object.keys(args);
  await db.exec("SET ROLE service_role");
  try {
    const { rows } = await db.query<{ r: unknown }>(
      `SELECT public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) AS r`,
      names.map((n) => args[n]));
    return { data: rows[0]?.r ?? null, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  } finally {
    await db.exec("RESET ROLE");
  }
};
const giftWhere = async (col: string, v: string) =>
  ((await db.query<BuyerGiftRow>(`SELECT * FROM public.gifts WHERE ${col} = $1`, [v])).rows[0] ?? null);

// ---- fake Stripe -----------------------------------------------------------
let seq = 0;
const prices = new Map<string, PriceLike>();
type FakeSession = GiftSessionLike & CheckoutSessionLike & { params: Record<string, unknown> };
const sessions = new Map<string, FakeSession>();
const intents = new Map<string, IntentLike & { latest_charge: ChargeLike }>();
const disputes = new Map<string, DisputeLike[]>();
const created: Record<string, unknown>[] = [];
let stripeDown = false;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// Two Stripe accounts, as in reality: a live client cannot see test objects
// and a test client cannot see live ones ("No such checkout.session").
type Mode = "live" | "test";
const accountOf = new Map<string, Mode>();
const own = (mode: Mode, id: string) => {
  if (accountOf.get(id) !== mode) throw new Error(`No such object in ${mode} mode: ${id}`);
};

function makeFakeStripe(mode: Mode) {
  return {
    retrievePrice: async (id: string) => clone(prices.get(id)!),
    findCustomerIdByEmail: async () => null,
    createSession: async (params: Record<string, unknown>) => {
      created.push(params);
      const id = `cs_${mode}_${++seq}`;
      accountOf.set(id, mode);
      const li = (params.line_items as Array<{ price: string; quantity: number }>)[0];
      const s: FakeSession = {
        id, params, mode: "payment", status: "open", url: `https://checkout.stripe.test/${id}`,
        expires_at: params.expires_at as number, payment_status: "unpaid", payment_intent: null,
        amount_total: prices.get(li.price)!.unit_amount!, currency: "usd",
        metadata: clone(params.metadata as Record<string, string>),
        total_details: { amount_discount: 0 },
        automatic_tax: { enabled: !!(params.automatic_tax as { enabled?: boolean } | undefined)?.enabled, status: null },
        line_items: { has_more: false, data: [{ quantity: li.quantity, price: clone(prices.get(li.price)!) }] },
      };
      sessions.set(id, s);
      return clone(s);
    },
    retrieveSession: async (id: string) => {
      if (stripeDown) throw new Error("stripe unavailable");
      own(mode, id);
      return clone(sessions.get(id)!);
    },
    expireSession: async (id: string) => {
      own(mode, id);
      const s = sessions.get(id)!;
      if (s.status !== "open") throw new Error("not open");
      s.status = "expired";
    },
    retrievePaymentIntent: async (id: string) => {
      if (stripeDown) throw new Error("stripe unavailable");
      own(mode, id);
      return clone(intents.get(id)!);
    },
    listDisputes: async (pi: string) => { own(mode, pi); return clone(disputes.get(pi) ?? []); },
  };
}
const fakeStripe = makeFakeStripe("live");
const fakeTestStripe = makeFakeStripe("test");

/** The buyer pays on Stripe's page; returns the event Stripe would send. */
function pay(sessionId: string, amount = 5000) {
  const s = sessions.get(sessionId)!;
  const mode = accountOf.get(sessionId)!;
  const pi = `pi_${mode}_${++seq}`;
  accountOf.set(pi, mode);
  intents.set(pi, {
    id: pi, status: "succeeded", amount_received: amount, currency: "usd",
    metadata: clone((s.params.payment_intent_data as { metadata: Record<string, string> }).metadata),
    latest_charge: { id: `ch_${pi}`, paid: true, amount, amount_refunded: 0, refunded: false, disputed: false, currency: "usd", payment_intent: pi },
  });
  Object.assign(s, { status: "complete", payment_status: "paid", payment_intent: pi, amount_total: amount });
  if (s.automatic_tax?.enabled) s.automatic_tax.status = "complete";
  return completed(sessionId);
}
const completed = (sessionId: string) =>
  ({ id: `evt_${++seq}`, type: "checkout.session.completed", data: { object: clone(sessions.get(sessionId)!) } });
function refund(pi: string, amount = 5000) {
  const c = intents.get(pi)!.latest_charge;
  Object.assign(c, { amount_refunded: amount, refunded: amount >= (c.amount ?? 0) });
  return { id: `evt_${++seq}`, type: "charge.refunded", data: { object: clone(c) } };
}
function dispute(pi: string, status: string) {
  intents.get(pi)!.latest_charge.disputed = true;
  const d = { id: `dp_${pi}`, status, payment_intent: pi };
  disputes.set(pi, [d]);
  return { id: `evt_${++seq}`, type: status === "lost" || status === "won" ? "charge.dispute.closed" : "charge.dispute.created", data: { object: d } };
}

// ---- deps wiring (mirrors the Edge Functions) ------------------------------
const logs: string[] = [];
const paymentDeps: GiftPaymentDeps = {
  rpc, log: (m) => { logs.push(m); }, mode: "live",
  stripe: fakeStripe,
  getGiftById: (id) => giftWhere("id::text", id),
  getGiftByPaymentIntent: (pi) => giftWhere("stripe_payment_intent_id", pi),
};
const config: PrivateGiftConfig = {
  enabled: true, reason: null, priceId: "price_gift50", taxMode: "approved_not_taxable", liveMode: false,
  stripeMode: "live", buyerIds: [OWNER],
};
const checkoutDeps = (c: PrivateGiftConfig = config): GiftCheckoutDeps => ({
  config: c, rpc, stripe: fakeStripe, now: () => Date.now(), log: (m) => { logs.push(m); },
  getGift: (id) => giftWhere("id::text", id),
  reconcile: (g) => reconcileGiftPayment(paymentDeps, g as GiftRow),
});
const redeemDeps: GiftRedeemDeps = {
  rpc, log: (m) => { logs.push(m); },
  getGiftByCode: (code) => giftWhere("redeem_code", code),
  reconcile: (g) => reconcileGiftPayment(paymentDeps, g),
};

const buyer = (id = OWNER, emailConfirmed = true) => ({ id, email: `${id.slice(-2)}@buyer.test`, emailConfirmed, isAnonymous: false });
const checkout = (to: string, extra: Partial<GiftCheckoutRequest> = {}, c = config) =>
  handleGiftCheckoutRequest({ action: "checkout", recipientEmail: to, message: "Enjoy!", user: buyer(), origin: "https://mogzy.lol", ...extra }, checkoutDeps(c));
const status = (giftId: string, user = buyer()) =>
  handleGiftCheckoutRequest({ action: "status", giftId, user, origin: "https://mogzy.lol" }, checkoutDeps());
const redeem = (code: string, user: string) =>
  handleGiftRedeemRequest({ action: "redeem", code, user: { id: user, isAnonymous: false } }, redeemDeps);
const sessionOf = (r: Record<string, unknown>) => (r.url as string).split("/").pop()!;
const grantOf = async (user: string) => (await db.query<{ k: string | null; e: Date | null }>(
  `SELECT pro_grant_kind AS k, pro_grant_expires_at AS e FROM public.profiles WHERE user_id = $1::uuid`, [user])).rows[0];

async function paidGift(to: string) {
  const r = await checkout(to);
  const sid = sessionOf(r);
  expect((await handleGiftEvent(pay(sid), paymentDeps)).outcome).toBe("paid:paid");
  const g = (await giftWhere("id::text", r.gift_id as string))!;
  return { id: g.id, code: g.redeem_code, sid, pi: g.stripe_payment_intent_id! };
}

beforeAll(async () => {
  db = await bootGiftDb();
  prices.set("price_gift50", { id: "price_gift50", active: true, type: "one_time", unit_amount: 5000, currency: "usd", recurring: null, tax_behavior: "inclusive" });
  prices.set(LEGACY_MONTHLY_PRICE, { id: LEGACY_MONTHLY_PRICE, active: true, type: "one_time", unit_amount: 999, currency: "usd", recurring: null });
  await addUser(db, OWNER, "20000000-0000-4000-8000-000000000001".slice(-2) + "@buyer.test", { name: "Owner" });
  await addUser(db, FRIEND, "friend@ca.example", { name: "Friend" });
  await addUser(db, STRANGER, "stranger@example.com");
  await addUser(db, UNVERIFIED_FRIEND, "unverified@ca.example", { verified: false });
  await addUser(db, OTHER_BUYER, "05@buyer.test");
  await addUser(db, UNVERIFIED_BUYER, "06@buyer.test", { verified: false });
}, 120_000);

describe("who may buy", () => {
  it("availability is answered only to an allowlisted, signed-in buyer", async () => {
    const ask = (user: ReturnType<typeof buyer>, c = config) =>
      handleGiftCheckoutRequest({ action: "availability", user, origin: "x" }, checkoutDeps(c));
    expect(await ask(buyer())).toMatchObject({ available: true, amount_cents: 5000, premium_days: 365, auto_renews: false });
    expect(await ask(buyer(OTHER_BUYER))).toEqual({ available: false });
    expect(await ask({ ...buyer(), isAnonymous: true })).toEqual({ available: false });
    expect(await ask(buyer(), { ...config, enabled: false, reason: "not_enabled" })).toEqual({ available: false });
  });

  it("refuses guests, unverified emails, non-allowlisted buyers and a disabled offer — before any Stripe call", async () => {
    const before = created.length;
    expect(await checkout("friend@ca.example", { user: { ...buyer(), isAnonymous: true } })).toMatchObject({ code: "ACCOUNT_REQUIRED" });
    expect(await checkout("friend@ca.example", { user: buyer(OWNER, false) })).toMatchObject({ code: "EMAIL_UNVERIFIED" });
    expect(await checkout("friend@ca.example", { user: buyer(OTHER_BUYER) })).toMatchObject({ code: "OFFER_NOT_AVAILABLE" });
    expect(await checkout("friend@ca.example", {}, { ...config, enabled: false, reason: "live_not_approved" })).toMatchObject({ code: "OFFER_NOT_AVAILABLE" });
    expect(await checkout("not an email")).toMatchObject({ code: "INVALID_RECIPIENT" });
    expect(await checkout("01@BUYER.test")).toMatchObject({ code: "SELF_GIFT" });
    expect(await checkout("friend@ca.example", { message: "x".repeat(501) })).toMatchObject({ code: "MESSAGE_TOO_LONG" });
    expect(created.length).toBe(before);
  });

  it("SQL independently refuses an unverified buyer even if the edge check were bypassed", async () => {
    const r = await rpc("gift_private_prepare", { _sender: UNVERIFIED_BUYER, _recipient_email: "friend@ca.example", _message: null });
    expect(r.data).toEqual({ ok: false, reason: "email_unverified" });
  });

  it("a mis-configured Stripe Price is refused before a session exists", async () => {
    const before = created.length;
    for (const bad of [{ unit_amount: 4999 }, { currency: "eur" }, { type: "recurring", recurring: { interval: "year" } }, { active: false }]) {
      prices.set("price_bad", { ...prices.get("price_gift50")!, id: "price_bad", ...bad });
      expect(await checkout("friend@ca.example", {}, { ...config, priceId: "price_bad" })).toMatchObject({ code: "OFFER_NOT_AVAILABLE" });
    }
    prices.set("price_excl", { ...prices.get("price_gift50")!, id: "price_excl", tax_behavior: "exclusive" });
    expect(await checkout("friend@ca.example", {}, { ...config, priceId: "price_excl", taxMode: "stripe_tax_inclusive" }))
      .toMatchObject({ code: "OFFER_NOT_AVAILABLE" });
    expect(created.length).toBe(before);
    // Clear the pending gift those refusals left (they never had a session).
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE status = 'pending'`);
  });
});

describe("the first-customer gift, end to end", () => {
  it("buy → Stripe confirms → recipient redeems 365 days; the redirect alone proves nothing", async () => {
    const r = await checkout(" Friend@CA.example ", { message: "Happy birthday from both of us" });
    expect(r).toMatchObject({ url: expect.stringContaining("checkout.stripe.test"), gift_id: expect.any(String) });
    const giftId = r.gift_id as string;
    const params = created.at(-1)!;
    expect(params.line_items).toEqual([{ price: "price_gift50", quantity: 1 }]);
    expect(params.allow_promotion_codes).toBe(false);
    expect(params.success_url).toBe(`https://mogzy.lol/lol/premium/gift?gift=${giftId}&checkout=success`);
    expect(JSON.stringify(params)).not.toContain((await giftWhere("id::text", giftId))!.redeem_code);

    // The buyer lands on the success URL before Stripe has confirmed anything.
    expect(await status(giftId)).toMatchObject({ status: "pending", redeem_code: null });
    expect(await redeem((await giftWhere("id::text", giftId))!.redeem_code, FRIEND)).toMatchObject({ success: false, reason: "not_paid" });
    expect((await grantOf(FRIEND)).k).toBeNull();

    const evt = pay(sessionOf(r));
    expect(await handleGiftEvent(evt, paymentDeps)).toEqual({ handled: true, outcome: "paid:paid" });
    expect(await handleGiftEvent(evt, paymentDeps)).toEqual({ handled: true, outcome: "paid:unchanged" }); // retry
    const view = await status(giftId);
    expect(view).toMatchObject({ status: "paid", recipient_email: "friend@ca.example", amount_cents: 5000,
      message: "Happy birthday from both of us", redeem_code: expect.stringMatching(/^[A-Z0-9]{10}$/) });
    expect((await grantOf(FRIEND)).k).toBeNull(); // still nothing until redeemed

    // The recipient sees it in their inbox without being told the code.
    const inbox = await handleGiftRedeemRequest({ action: "list", user: { id: FRIEND, isAnonymous: false } }, redeemDeps);
    expect(inbox.gifts).toEqual([expect.objectContaining({ redeem_code: view.redeem_code, from: "Owner" })]);

    const code = view.redeem_code as string;
    expect(await redeem(code, STRANGER)).toMatchObject({ success: false, reason: "recipient_mismatch" });
    expect(await redeem(code, UNVERIFIED_FRIEND)).toMatchObject({ success: false, reason: "email_unverified" });
    const ok = await redeem(code.toLowerCase(), FRIEND);
    expect(ok).toMatchObject({ success: true, gift_type: "pro_annual", premium_days: 365 });
    const g = await grantOf(FRIEND);
    expect(g.k).toBe("gift");
    const days = (new Date(g.e!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364.9);
    expect(days).toBeLessThan(365.01);
    expect(await redeem(code, FRIEND)).toMatchObject({ success: false, reason: "already_redeemed" });
    expect(await status(giftId)).toMatchObject({ status: "redeemed" });
  });

  it("Stripe Tax mode keeps the $50 total and requires a completed tax calculation", async () => {
    const taxed = { ...config, taxMode: "stripe_tax_inclusive" as const };
    const r = await checkout("taxed@ca.example", {}, taxed);
    expect(created.at(-1)).toMatchObject({ automatic_tax: { enabled: true }, billing_address_collection: "required" });
    const sid = sessionOf(r);
    pay(sid);
    sessions.get(sid)!.automatic_tax!.status = "requires_location_inputs";
    expect((await handleGiftEvent(completed(sid), paymentDeps)).outcome).toBe("invalid:invalid");
  });
});

describe("tampered or failed payments never become a redeemable gift", () => {
  it.each([
    ["amount", (s: FakeSession) => { s.amount_total = 4000; }],
    ["currency", (s: FakeSession) => { s.currency = "eur"; }],
    ["quantity", (s: FakeSession) => { s.line_items!.data![0].quantity = 2; }],
    ["discount", (s: FakeSession) => { s.total_details = { amount_discount: 1000 }; }],
    ["price", (s: FakeSession) => { s.line_items!.data![0].price = { ...s.line_items!.data![0].price!, id: "price_other" }; }],
    ["metadata", (s: FakeSession) => { s.metadata = { ...s.metadata!, recipient_email: "attacker@example.com" }; }],
  ])("%s mismatch → invalid", async (_name, mutate) => {
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE status = 'pending'`);
    const r = await checkout(`victim${++seq}@ca.example`);
    const sid = sessionOf(r);
    pay(sid);
    mutate(sessions.get(sid)!);
    expect((await handleGiftEvent(completed(sid), paymentDeps)).outcome).toBe("invalid:invalid");
    const g = (await giftWhere("id::text", r.gift_id as string))!;
    expect(g.status).toBe("invalid");
  });

  it("an unpaid or still-processing session stays pending", async () => {
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE status = 'pending'`);
    const r = await checkout("slow@ca.example");
    const sid = sessionOf(r);
    expect((await handleGiftEvent(completed(sid), paymentDeps)).outcome).toBe("pending:unchanged");
    pay(sid);
    intents.get(sessions.get(sid)!.payment_intent as string)!.status = "processing";
    expect((await handleGiftEvent(completed(sid), paymentDeps)).outcome).toBe("pending:unchanged");
    intents.get(sessions.get(sid)!.payment_intent as string)!.status = "succeeded";
    expect((await handleGiftEvent(completed(sid), paymentDeps)).outcome).toBe("paid:paid");
  });
});

describe("abandoned and replaced checkouts", () => {
  it("reopening reuses the same open session; changing the recipient replaces it", async () => {
    const a = await checkout("reuse@ca.example");
    expect(await checkout("reuse@ca.example")).toMatchObject({ url: a.url, reused: true });
    const b = await checkout("changed@ca.example");
    expect(b.url).not.toBe(a.url);
    expect(sessions.get(sessionOf(a))!.status).toBe("expired");
    expect((await giftWhere("id::text", a.gift_id as string))!.status).toBe("expired");
    // The replaced session's expiry event later is harmless.
    const late = { id: "evt_late", type: "checkout.session.expired", data: { object: clone(sessions.get(sessionOf(a))!) } };
    expect((await handleGiftEvent(late, paymentDeps)).outcome).toBe("expired:unchanged");
    // Abandon B too: Stripe expires it.
    sessions.get(sessionOf(b))!.status = "expired";
    const exp = { id: "evt_exp", type: "checkout.session.expired", data: { object: clone(sessions.get(sessionOf(b))!) } };
    expect((await handleGiftEvent(exp, paymentDeps)).outcome).toBe("expired:expired");
    // ...and the buyer can simply start again.
    expect(await checkout("changed@ca.example")).toHaveProperty("url");
  });

  it("a session already paid is never replaced", async () => {
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE status = 'pending'`);
    const a = await checkout("inflight@ca.example");
    pay(sessionOf(a)); // paid on Stripe, webhook not delivered yet
    expect(await checkout("someone@ca.example")).toMatchObject({ code: "PAYMENT_PROCESSING", gift_id: a.gift_id });
    expect(await status(a.gift_id as string)).toMatchObject({ status: "paid" }); // the return page reconciles
  });
});

describe("redemption safety", () => {
  it("concurrent redemptions: exactly one grant", async () => {
    const twin = "20000000-0000-4000-8000-000000000010";
    await addUser(db, twin, "twin@ca.example");
    const g = await paidGift("twin@ca.example");
    const results = await Promise.all([redeem(g.code, twin), redeem(g.code, twin), redeem(g.code, twin)]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
  });

  it("re-reads Stripe at redemption: a refund the webhook has not delivered still blocks it", async () => {
    const r1 = "20000000-0000-4000-8000-000000000011";
    await addUser(db, r1, "late-refund@ca.example");
    const g = await paidGift("late-refund@ca.example");
    refund(g.pi); // no webhook delivered
    expect(await redeem(g.code, r1)).toMatchObject({ success: false, reason: "unavailable" });
    expect((await grantOf(r1)).k).toBeNull();
  });

  it("fails closed when Stripe cannot be reached", async () => {
    const r2 = "20000000-0000-4000-8000-000000000012";
    await addUser(db, r2, "outage@ca.example");
    const g = await paidGift("outage@ca.example");
    stripeDown = true;
    try {
      expect(await redeem(g.code, r2)).toMatchObject({ success: false, reason: "payment_check_unavailable" });
    } finally { stripeDown = false; }
    expect((await giftWhere("id::text", g.id))!.status).toBe("paid");
    expect(await redeem(g.code, r2)).toMatchObject({ success: true });
  });
});

describe("refunds, disputes and out-of-order webhooks", () => {
  it("a refund delivered BEFORE checkout.session.completed still wins", async () => {
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE status = 'pending'`);
    const r = await checkout("ooo@ca.example");
    const sid = sessionOf(r);
    const done = pay(sid);
    const pi = sessions.get(sid)!.payment_intent as string;
    const refundEvt = refund(pi);
    // The gift has no PaymentIntent recorded yet: found via PI metadata.
    expect((await handleGiftEvent(refundEvt, paymentDeps)).outcome).toBe("refunded:refunded");
    expect((await handleGiftEvent(done, paymentDeps)).outcome).toBe("refunded:terminal");
    expect((await giftWhere("id::text", r.gift_id as string))!.status).toBe("refunded");
  });

  it("refund after redemption revokes the Premium it granted", async () => {
    const r3 = "20000000-0000-4000-8000-000000000013";
    await addUser(db, r3, "refund-after@ca.example");
    const g = await paidGift("refund-after@ca.example");
    await redeem(g.code, r3);
    expect((await grantOf(r3)).k).toBe("gift");
    expect((await handleGiftEvent(refund(g.pi, 1000), paymentDeps)).outcome).toBe("paid:unchanged"); // partial
    expect((await grantOf(r3)).k).toBe("gift");
    expect((await handleGiftEvent(refund(g.pi, 5000), paymentDeps)).outcome).toBe("refunded:revoked");
    expect((await grantOf(r3)).k).toBeNull();
  });

  it("disputes hold an unredeemed gift; won restores it, lost revokes a redeemed one", async () => {
    const r4 = "20000000-0000-4000-8000-000000000014";
    await addUser(db, r4, "dispute@ca.example");
    const g = await paidGift("dispute@ca.example");
    expect((await handleGiftEvent(dispute(g.pi, "needs_response"), paymentDeps)).outcome).toBe("disputed:disputed");
    expect(await redeem(g.code, r4)).toMatchObject({ success: false, reason: "payment_on_hold" });
    expect((await handleGiftEvent(dispute(g.pi, "won"), paymentDeps)).outcome).toBe("paid:paid");
    expect(await redeem(g.code, r4)).toMatchObject({ success: true });
    expect((await handleGiftEvent(dispute(g.pi, "under_review"), paymentDeps)).outcome).toBe("disputed:redeemed_disputed");
    expect((await grantOf(r4)).k).toBe("gift");   // kept while under review
    expect((await handleGiftEvent(dispute(g.pi, "lost"), paymentDeps)).outcome).toBe("refunded:revoked");
    expect((await grantOf(r4)).k).toBeNull();
  });

  it("events for payments that are not gifts are left alone", async () => {
    accountOf.set("pi_diamonds", "live");
    intents.set("pi_diamonds", { id: "pi_diamonds", status: "succeeded", metadata: {}, latest_charge: { id: "ch_d", paid: true } });
    const evt = { id: "evt_d", type: "charge.refunded", data: { object: { id: "ch_d", payment_intent: "pi_diamonds", amount_refunded: 499 } } };
    expect(await handleGiftEvent(evt, paymentDeps)).toEqual({ handled: false, outcome: "not_a_gift" });
    const sub = { id: "evt_s", type: "checkout.session.completed", data: { object: { id: "cs_sub", mode: "subscription", metadata: {} } } };
    expect(await handleGiftEvent(sub, paymentDeps)).toEqual({ handled: false, outcome: "not_a_gift" });
  });
});

describe("existing catalog gifts keep working through the same verified path", () => {
  it("a create-checkout monthly gift is verified against the catalog and grants 30 days to its recipient", async () => {
    const recipient = "20000000-0000-4000-8000-000000000020";
    await addUser(db, recipient, "monthly@example.com");
    // What create-checkout's gift branch writes and sends to Stripe today.
    const id = (await db.query<{ id: string; redeem_code: string }>(
      `INSERT INTO public.gifts (sender_user_id, sender_email, recipient_email, gift_type, diamond_amount, stripe_price_id)
       VALUES ($1::uuid, '05@buyer.test', 'monthly@example.com', 'pro_monthly', 0, $2) RETURNING id, redeem_code`,
      [OTHER_BUYER, LEGACY_MONTHLY_PRICE])).rows[0];
    const s = await fakeStripe.createSession({
      mode: "payment", line_items: [{ price: LEGACY_MONTHLY_PRICE, quantity: 1 }], allow_promotion_codes: true,
      metadata: { supabase_user_id: OTHER_BUYER, gift_id: id.id, gift_type: "pro_monthly", recipient_email: "monthly@example.com", redeem_code: id.redeem_code },
      payment_intent_data: { metadata: {} },
    });
    await db.query(`UPDATE public.gifts SET stripe_session_id = $1 WHERE id = $2::uuid`, [s.id, id.id]);
    expect((await handleGiftEvent(pay(s.id, 799), paymentDeps)).outcome).toBe("paid:paid"); // promo code: any amount
    expect(await redeem(id.redeem_code, STRANGER)).toMatchObject({ success: false, reason: "recipient_mismatch" });
    expect(await redeem(id.redeem_code, recipient)).toMatchObject({ success: true, gift_type: "pro_monthly", premium_days: 30 });
  });
});

// ─────────────────────────────── PT1.7-T — the Stripe test-key lane

describe("PT1.7-T test-key lane: a full test-mode gift on the production code path", () => {
  const testPaymentDeps: GiftPaymentDeps = { ...paymentDeps, mode: "test", stripe: fakeTestStripe };
  const lanes = { live: paymentDeps, test: testPaymentDeps };
  const testConfig: PrivateGiftConfig = { ...config, stripeMode: "test", priceId: "price_gift50_test" };
  const testCheckoutDeps = (): GiftCheckoutDeps => ({
    ...checkoutDeps(testConfig), stripe: fakeTestStripe, reconcile: (g) => reconcileByMode(g as GiftRow, lanes),
  });
  const laneRedeemDeps = (test: GiftPaymentDeps | null = testPaymentDeps): GiftRedeemDeps => ({
    ...redeemDeps, reconcile: (g) => reconcileByMode(g, { live: paymentDeps, test }),
  });

  beforeAll(async () => {
    prices.set("price_gift50_test", { ...prices.get("price_gift50")!, id: "price_gift50_test" });
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE status = 'pending'`);
  });

  it("buy → test-lane webhook → redeem 365 days → refund revokes; the live lane never touches it", async () => {
    const tester = "20000000-0000-4000-8000-000000000030";
    await addUser(db, tester, "tester@ca.example");

    const avail = await handleGiftCheckoutRequest({ action: "availability", user: buyer(), origin: "x" }, testCheckoutDeps());
    expect(avail).toMatchObject({ available: true, test_mode: true });

    const r = await handleGiftCheckoutRequest(
      { action: "checkout", recipientEmail: "tester@ca.example", message: "test", user: buyer(), origin: "http://localhost:5173" },
      testCheckoutDeps());
    const sid = sessionOf(r);
    expect(sid).toMatch(/^cs_test_/);
    expect(created.at(-1)).toMatchObject({
      line_items: [{ price: "price_gift50_test", quantity: 1 }],
      metadata: { stripe_mode: "test", private_offer: "first_customer_annual_gift" },
    });
    const evt = pay(sid);

    // Delivered to the LIVE lane (wrong secret can't happen, but the guard holds anyway).
    expect(await handleGiftEvent(evt, paymentDeps)).toEqual({ handled: true, outcome: "other_mode" });
    expect((await giftWhere("id::text", r.gift_id as string))!.status).toBe("pending");

    // The test lane records it.
    expect(await handleGiftEvent(evt, testPaymentDeps)).toEqual({ handled: true, outcome: "paid:paid" });
    const view = await handleGiftCheckoutRequest({ action: "status", giftId: r.gift_id, user: buyer(), origin: "x" }, testCheckoutDeps());
    expect(view).toMatchObject({ status: "paid", test_mode: true, amount_cents: 5000 });

    // Redemption re-reads Stripe with the TEST key (the live key cannot see cs_test_).
    const ok = await handleGiftRedeemRequest({ action: "redeem", code: view.redeem_code, user: { id: tester, isAnonymous: false } }, laneRedeemDeps());
    expect(ok).toMatchObject({ success: true, premium_days: 365 });
    expect((await grantOf(tester)).k).toBe("gift");

    // A live-lane refund event for a test payment is ignored; the test lane revokes.
    const pi = (await giftWhere("id::text", r.gift_id as string))!.stripe_payment_intent_id!;
    const rf = refund(pi);
    expect(await handleGiftEvent(rf, paymentDeps)).toEqual({ handled: true, outcome: "other_mode" });
    expect((await grantOf(tester)).k).toBe("gift");
    expect(await handleGiftEvent(rf, testPaymentDeps)).toEqual({ handled: true, outcome: "refunded:revoked" });
    expect((await grantOf(tester)).k).toBeNull();
  });

  it("a test gift fails closed when the test key is gone", async () => {
    const t2 = "20000000-0000-4000-8000-000000000031";
    await addUser(db, t2, "t2@ca.example");
    const r = await handleGiftCheckoutRequest(
      { action: "checkout", recipientEmail: "t2@ca.example", message: "", user: buyer(), origin: "x" }, testCheckoutDeps());
    await handleGiftEvent(pay(sessionOf(r)), testPaymentDeps);
    const code = (await giftWhere("id::text", r.gift_id as string))!.redeem_code;
    expect(await handleGiftRedeemRequest({ action: "redeem", code, user: { id: t2, isAnonymous: false } }, laneRedeemDeps(null)))
      .toMatchObject({ success: false, reason: "payment_check_unavailable" });
    expect((await grantOf(t2)).k).toBeNull();
  });

  it("switching modes never leaves two payable checkouts; a stale other-mode one is retired", async () => {
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE status = 'pending'`);
    const liveOpen = await checkout("switch@ca.example");             // live checkout left open
    expect(sessionOf(liveOpen)).toMatch(/^cs_live_/);
    const req = { action: "checkout", recipientEmail: "switch@ca.example", message: "", user: buyer(), origin: "x" };
    expect(await handleGiftCheckoutRequest(req, testCheckoutDeps())).toMatchObject({ code: "CHECKOUT_BUSY" });
    // 33 minutes later the live session can no longer be paid: retire it, start in test mode.
    await db.query(`UPDATE public.gifts SET created_at = now() - interval '33 minutes' WHERE id = $1::uuid`, [liveOpen.gift_id]);
    const t = await handleGiftCheckoutRequest(req, testCheckoutDeps());
    expect(sessionOf(t)).toMatch(/^cs_test_/);
    expect((await giftWhere("id::text", liveOpen.gift_id as string))!.status).toBe("expired");
  });
});

