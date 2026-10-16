// @vitest-environment node
/**
 * PT1.6b — the whole server path, end to end, with only Stripe faked.
 *
 * The REAL request handler (custom-offer-checkout) and the REAL webhook handler
 * (stripe-webhook's custom-offer branch) run against the REAL SQL (PT1.4 →
 * 0002 → 0003 on PGlite) through a service-role RPC adapter. Stripe is an
 * in-memory fake that behaves like Checkout: sessions open, expire, complete,
 * and PaymentIntents succeed or are refunded.
 *
 * What this proves that the unit and SQL suites do not on their own: the
 * argument names, shapes and result vocabularies of the TypeScript and the SQL
 * actually line up.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { ALICE, BOB, FIXTURE, GIFTED, M0002, M0003, OWNER, PT14 } from "./customOfferDbFixture";
import {
  handleCustomOfferRequest,
  type CheckoutDeps,
  type CustomOfferRequest,
  type Rpc,
} from "../../../supabase/functions/_shared/custom-offer-checkout";
import { handleCustomOfferEvent, type PaymentIntentLike, type WebhookDeps } from "../../../supabase/functions/_shared/custom-offer-webhook";
import type { CustomOfferConfig, SessionLike } from "../../../supabase/functions/_shared/custom-offer";

let db: PGlite;

/** service_role RPC with named arguments, like PostgREST. */
const rpc: Rpc = async (fn, args) => {
  const names = Object.keys(args);
  const sql = `SELECT public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) AS r`;
  await db.exec("SET ROLE service_role");
  try {
    const { rows } = await db.query<{ r: unknown }>(sql, names.map((n) => {
      const v = args[n];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    }));
    return { data: rows[0]?.r ?? null, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  } finally {
    await db.exec("RESET ROLE");
  }
};

// ---- a Checkout-shaped fake Stripe ----------------------------------------
let clock = Date.now(); // SQL compares against the real now()
let seq = 0;
const sessions = new Map<string, SessionLike & { params: Record<string, unknown> }>();
const intents = new Map<string, PaymentIntentLike>();
const created: Record<string, unknown>[] = [];
const expired: string[] = [];
const price = { id: "price_custom50", active: true, type: "one_time", unit_amount: 5000, currency: "usd", recurring: null, tax_behavior: "unspecified" };

const stripe: CheckoutDeps["stripe"] = {
  retrievePrice: async () => ({ ...price }),
  findCustomerIdByEmail: async () => null,
  createSession: async (params) => {
    created.push(params);
    const id = `cs_test_${++seq}`;
    const s = {
      id, params, mode: "payment", status: "open", url: `https://checkout.stripe.test/${id}`,
      expires_at: params.expires_at as number, payment_status: "unpaid", amount_total: 5000, currency: "usd",
      metadata: params.metadata as Record<string, string>, client_reference_id: params.client_reference_id as string,
      customer: null, payment_intent: null,
    };
    sessions.set(id, s);
    return { ...s };
  },
  retrieveSession: async (id) => ({ ...sessions.get(id)! }),
  expireSession: async (id) => {
    const s = sessions.get(id)!;
    if (s.status !== "open") throw new Error("session not open");
    s.status = "expired";
    expired.push(id);
  },
};

/** The buyer pays on Stripe's page. */
function pay(sessionId: string, amount = 5000) {
  const s = sessions.get(sessionId)!;
  const pi = `pi_test_${++seq}`;
  intents.set(pi, { id: pi, status: "succeeded", amount_received: amount, currency: "usd", latest_charge: { id: `ch_${pi}`, amount_refunded: 0 } });
  Object.assign(s, { status: "complete", payment_status: "paid", payment_intent: pi, customer: "cus_test" });
  return { type: "checkout.session.completed", id: `evt_${++seq}`, data: { object: { ...s } } };
}

const config: CustomOfferConfig = { enabled: true, reason: null, priceId: "price_custom50", liveMode: false, automaticTax: false };
const logs: string[] = [];
const checkoutDeps = (c: CustomOfferConfig = config): CheckoutDeps => ({
  config: c, rpc, stripe, now: () => clock, log: (m) => { logs.push(m); },
});
const webhookDeps: WebhookDeps = {
  rpc,
  log: (m) => { logs.push(m); },
  stripe: { retrievePaymentIntent: async (id) => ({ ...intents.get(id)! }) },
};

const request = (user: string, token: string, action = "checkout", extra: Record<string, unknown> = {}): CustomOfferRequest =>
  ({ action, token, user: { id: user, email: `${user.slice(-2)}@example.test`, isAnonymous: false }, origin: "https://mogzy.lol", ...extra });

async function mint(): Promise<string> {
  await db.query(`UPDATE public._ctx SET uid = $1::uuid, owner = true, fresh = true`, [OWNER]);
  await db.exec("SET ROLE authenticated");
  try {
    const { rows } = await db.query<{ c: { token: string } }>(`SELECT public.owner_create_custom_offer_claim('flow') AS c`);
    return rows[0].c.token;
  } finally {
    await db.exec("RESET ROLE");
    await db.exec(`UPDATE public._ctx SET uid = NULL, owner = false, fresh = false`);
  }
}

const grant = async (user: string) => (await db.query<{ k: string | null; e: Date | null }>(
  `SELECT pro_grant_kind AS k, pro_grant_expires_at AS e FROM public.profiles WHERE user_id = $1::uuid`, [user])).rows[0];

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(FIXTURE);
  await db.exec(PT14);
  await db.exec(M0002);
  await db.exec(M0003);
  await db.exec(`
    INSERT INTO auth.users (id) VALUES ('${OWNER}'), ('${ALICE}'), ('${BOB}'), ('${GIFTED}');
    INSERT INTO public.profiles (user_id, display_name) VALUES
      ('${OWNER}', 'Owner'), ('${ALICE}', 'Alice'), ('${BOB}', 'Bob'), ('${GIFTED}', 'Gifted');
  `);
}, 120_000);

describe("happy path: claim → checkout → paid → Premium for 12 months", () => {
  it("runs end to end, and Stripe redelivery is harmless", async () => {
    const token = await mint();
    expect(await handleCustomOfferRequest(request(ALICE, token, "status"), checkoutDeps())).toMatchObject({ state: "available" });

    const r = await handleCustomOfferRequest(request(ALICE, token), checkoutDeps());
    expect(r).toMatchObject({ url: expect.stringMatching(/^https:\/\/checkout\.stripe\.test\/cs_test_/) });
    const sessionId = (r as { url: string }).url.split("/").pop()!;
    // The session Stripe was asked for is entirely server-derived.
    const params = created.at(-1)!;
    expect(params.line_items).toEqual([{ price: "price_custom50", quantity: 1 }]);
    expect(params.allow_promotion_codes).toBe(false);
    expect(params).not.toHaveProperty("discounts");

    // Reopening the page returns the SAME session — no second payable session.
    expect(await handleCustomOfferRequest(request(ALICE, token), checkoutDeps())).toEqual({ url: (r as { url: string }).url, reused: true });
    expect(await handleCustomOfferRequest(request(ALICE, token, "status"), checkoutDeps())).toMatchObject({ state: "checkout_open" });

    expect((await grant(ALICE)).k).toBeNull(); // nothing granted before payment
    const evt = pay(sessionId);
    expect(await handleCustomOfferEvent(evt, webhookDeps)).toEqual({ handled: true, outcome: "activated" });
    const g = await grant(ALICE);
    expect(g.k).toBe("purchase");
    const check = await db.query<{ ok: boolean }>(
      `SELECT entitlement_ends_at = entitlement_starts_at + interval '12 months' AS ok
       FROM public.custom_offer_purchases WHERE stripe_session_id = $1`, [sessionId]);
    expect(check.rows[0].ok).toBe(true);

    expect(await handleCustomOfferEvent(evt, webhookDeps)).toEqual({ handled: true, outcome: "duplicate" });
    expect((await grant(ALICE)).e!.toString()).toBe(g.e!.toString());

    expect(await handleCustomOfferRequest(request(ALICE, token, "status"), checkoutDeps()))
      .toMatchObject({ state: "already_paid", purchase_status: "paid" });
    expect(await handleCustomOfferRequest(request(ALICE, token), checkoutDeps())).toMatchObject({ code: "CLAIM_ALREADY_PAID" });

    // The full refund webhook returns the account to Free.
    intents.get(evt.data.object.payment_intent as string)!.latest_charge = { id: "ch_r", amount_refunded: 5000 };
    expect(await handleCustomOfferEvent(
      { id: "evt_refund", type: "charge.refunded", data: { object: { id: "ch_r", payment_intent: evt.data.object.payment_intent, amount_refunded: 5000 } } },
      webhookDeps)).toEqual({ handled: true, outcome: "revoked" });
    expect((await grant(ALICE)).k).toBeNull();
  });
});

describe("abandoned and failed checkout recovery", () => {
  it("an expired session frees the claim for the same customer only", async () => {
    const token = await mint();
    const first = await handleCustomOfferRequest(request(BOB, token), checkoutDeps()) as { url: string };
    const firstId = first.url.split("/").pop()!;
    sessions.get(firstId)!.status = "expired";
    expect(await handleCustomOfferEvent(
      { id: "evt_x", type: "checkout.session.expired", data: { object: { ...sessions.get(firstId)! } } }, webhookDeps))
      .toEqual({ handled: true, outcome: "released" });

    expect(await handleCustomOfferRequest(request(ALICE, token), checkoutDeps())).toMatchObject({ code: "CLAIM_OTHER_ACCOUNT" });
    const retry = await handleCustomOfferRequest(request(BOB, token), checkoutDeps()) as { url: string };
    expect(retry.url).not.toBe(first.url);
    expect(await handleCustomOfferEvent(pay(retry.url.split("/").pop()!), webhookDeps)).toMatchObject({ outcome: "activated" });
  });

  it("a session close to expiry is expired and replaced rather than reused", async () => {
    const token = await mint();
    const first = await handleCustomOfferRequest(request(GIFTED, token), checkoutDeps()) as { url: string };
    const firstId = first.url.split("/").pop()!;
    clock += 30 * 60 * 1000; // 1 minute of its 31 left
    const second = await handleCustomOfferRequest(request(GIFTED, token), checkoutDeps()) as { url: string };
    expect(second.url).not.toBe(first.url);
    expect(expired).toContain(firstId);
    // Paying the stale tab anyway is caught: one paid purchase per claim.
    sessions.get(firstId)!.status = "open";
    const late = pay(firstId);
    expect(await handleCustomOfferEvent(pay(second.url.split("/").pop()!), webhookDeps)).toMatchObject({ outcome: "activated" });
    expect(await handleCustomOfferEvent(late, webhookDeps)).toMatchObject({ outcome: "review" });
  });

  it("a session that already completed is never replaced", async () => {
    const token = await mint();
    await db.exec(`INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-0000000000a9');
      INSERT INTO public.profiles (user_id, display_name) VALUES ('00000000-0000-4000-8000-0000000000a9', 'Zed');`);
    const zed = "00000000-0000-4000-8000-0000000000a9";
    const first = await handleCustomOfferRequest(request(zed, token), checkoutDeps()) as { url: string };
    pay(first.url.split("/").pop()!); // paid on Stripe, webhook not yet delivered
    expect(await handleCustomOfferRequest(request(zed, token), checkoutDeps())).toMatchObject({ code: "PAYMENT_PROCESSING" });
  });
});

describe("fail-closed configuration and client tampering", () => {
  it("a disabled offer creates no Stripe session and reports a buyable claim as not available", async () => {
    const token = await mint();
    const before = created.length;
    const off: CustomOfferConfig = { ...config, enabled: false, reason: "live_not_approved" };
    expect(await handleCustomOfferRequest(request(BOB, token), checkoutDeps(off))).toMatchObject({ code: "OFFER_NOT_AVAILABLE" });
    expect(await handleCustomOfferRequest(request(BOB, token, "status"), checkoutDeps(off))).toEqual({ state: "offer_disabled" });
    expect(created.length).toBe(before);
  });

  it("a mis-priced Stripe Price is refused before any session exists", async () => {
    const token = await mint();
    const before = created.length;
    price.unit_amount = 4999;
    try {
      expect(await handleCustomOfferRequest(request(BOB, token), checkoutDeps())).toMatchObject({ code: "OFFER_NOT_AVAILABLE" });
    } finally {
      price.unit_amount = 5000;
    }
    expect(created.length).toBe(before);
  });

  it("client-sent price, amount or quantity fields are ignored", async () => {
    const token = await mint();
    const tampered = request(BOB, token, "checkout", { price: "price_cheap", amount: 1, quantity: 99 });
    const r = await handleCustomOfferRequest(tampered, checkoutDeps());
    expect(r).toHaveProperty("url");
    expect(created.at(-1)!.line_items).toEqual([{ price: "price_custom50", quantity: 1 }]);
  });

  it("a session paid for less than $50 never grants", async () => {
    const token = await mint();
    await db.exec(`INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-0000000000a8');
      INSERT INTO public.profiles (user_id, display_name) VALUES ('00000000-0000-4000-8000-0000000000a8', 'Yan');`);
    const yan = "00000000-0000-4000-8000-0000000000a8";
    const r = await handleCustomOfferRequest(request(yan, token), checkoutDeps()) as { url: string };
    expect(await handleCustomOfferEvent(pay(r.url.split("/").pop()!, 100), webhookDeps)).toMatchObject({ outcome: "review" });
    expect((await grant(yan)).k).toBeNull();
  });

  it("guest sessions and malformed tokens are refused without touching the database", async () => {
    const guest = { ...request(BOB, "mgy1_" + "0".repeat(48)), user: { id: BOB, email: null, isAnonymous: true } };
    expect(await handleCustomOfferRequest(guest, checkoutDeps())).toMatchObject({ code: "ACCOUNT_REQUIRED" });
    expect(await handleCustomOfferRequest(request(BOB, "../../etc"), checkoutDeps())).toMatchObject({ code: "CLAIM_UNAVAILABLE" });
  });
});
