// @vitest-environment node
/**
 * PT1.7 — gift payment and redemption SQL, RUN on Postgres (PGlite) over the
 * production migration chain (see giftDbFixture). Every case calls the
 * functions as the role that will call them in production.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { M0004, addUser, bootGiftDb } from "./giftDbFixture";
import { PRIVATE_GIFT_TERMS } from "../../../supabase/functions/_shared/private-annual-gift";

const OWNER = "10000000-0000-4000-8000-000000000001"; // buyer
const FRIEND = "10000000-0000-4000-8000-000000000002"; // intended recipient
const STRANGER = "10000000-0000-4000-8000-000000000003";
const UNVERIFIED = "10000000-0000-4000-8000-000000000004";
const GUEST = "10000000-0000-4000-8000-000000000005";
const UNVERIFIED_BUYER = "10000000-0000-4000-8000-000000000006";
const FRIEND_EMAIL = "Friend@Example.com";

let db: PGlite;
let seq = 0;

async function call<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>, role = "service_role"): Promise<T> {
  const names = Object.keys(args);
  await db.exec(`SET ROLE ${role}`);
  try {
    const { rows } = await db.query<{ r: T }>(
      `SELECT public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) AS r`,
      names.map((n) => args[n]),
    );
    return rows[0].r;
  } finally {
    await db.exec("RESET ROLE");
  }
}

async function rejected(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); } catch (e) { return e instanceof Error ? e.message : String(e); }
  throw new Error("expected a rejection");
}

const gift = async (id: string) =>
  (await db.query<Record<string, unknown>>(`SELECT * FROM public.gifts WHERE id = $1::uuid`, [id])).rows[0];
const grantOf = async (user: string) =>
  (await db.query<{ k: string | null; e: Date | null; reason: string | null }>(
    `SELECT pro_grant_kind AS k, pro_grant_expires_at AS e, pro_grant_reason AS reason FROM public.profiles WHERE user_id = $1::uuid`,
    [user])).rows[0];

/** A private gift from OWNER to `to`, attached to a fresh session and (optionally) paid. */
async function privateGift(to = FRIEND_EMAIL, paid = true) {
  const p = await call<{ ok: boolean; gift_id: string }>("gift_private_prepare",
    { _sender: OWNER, _recipient_email: to, _message: "Happy birthday" });
  expect(p.ok).toBe(true);
  const session = `cs_test_${++seq}`;
  expect((await call<{ result: string }>("gift_attach_session",
    { _gift_id: p.gift_id, _sender: OWNER, _session_id: session, _price_id: "price_gift50" })).result).toBe("attached");
  const pi = `pi_test_${seq}`;
  if (paid) {
    expect((await call<{ result: string }>("gift_record_payment", {
      _gift_id: p.gift_id, _session_id: session, _payment_intent: pi, _state: "paid",
      _amount: 5000, _currency: "usd", _note: null })).result).toBe("paid");
  }
  const row = await gift(p.gift_id);
  return { id: p.gift_id, code: row.redeem_code as string, session, pi };
}

const pay = (g: { id: string; session: string; pi: string }, state: string, amount = 5000, currency = "usd") =>
  call<{ result: string; status: string }>("gift_record_payment",
    { _gift_id: g.id, _session_id: g.session, _payment_intent: g.pi, _state: state, _amount: amount, _currency: currency, _note: state });
const redeem = (code: string, user: string) =>
  call<{ success: boolean; reason?: string; grant_starts_at?: string; grant_ends_at?: string; premium_days?: number }>(
    "gift_redeem", { _code: code, _user_id: user });

beforeAll(async () => {
  db = await bootGiftDb(false);
  await addUser(db, OWNER, "owner@example.com", { name: "Owner" });
  await addUser(db, FRIEND, "friend@example.com", { name: "Friend" });
  await addUser(db, STRANGER, "stranger@example.com");
  await addUser(db, UNVERIFIED, "friend2@example.com", { verified: false });
  await addUser(db, GUEST, "guest@example.com", { anonymous: true });
  await addUser(db, UNVERIFIED_BUYER, "buyer2@example.com", { verified: false });
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("before 0004 — the defects it fixes", () => {
  it("G2/G1: redeem_gift_code lets ANY signed-in account redeem a paid gift, and grants no Premium", async () => {
    await db.exec(`INSERT INTO public.gifts (sender_user_id, recipient_email, gift_type, status, redeem_code)
                   VALUES ('${OWNER}', 'friend@example.com', 'pro_annual', 'paid', 'OLDGIFT001')`);
    await db.exec(`UPDATE public._ctx SET uid = '${STRANGER}'`);
    await db.exec("SET ROLE authenticated");
    const r = (await db.query<{ r: { success: boolean } }>(`SELECT public.redeem_gift_code('oldgift001') AS r`)).rows[0].r;
    await db.exec("RESET ROLE");
    expect(r.success).toBe(true);                              // a stranger consumed the friend's gift
    expect((await grantOf(STRANGER)).k).toBeNull();            // ...and Premium lives in a separate JS step
    await db.exec(`DELETE FROM public.gifts WHERE redeem_code = 'OLDGIFT001'; UPDATE public._ctx SET uid = NULL`);
  });

  it("G5: the 20260624 column REVOKE never took effect (table-level SELECT wins)", async () => {
    const r = (await db.query<{ a: boolean; b: boolean }>(`
      SELECT has_column_privilege('authenticated', 'public.gifts', 'stripe_session_id', 'SELECT') AS a,
             has_table_privilege('anon', 'public.gifts', 'SELECT') AS b`)).rows[0];
    expect(r).toEqual({ a: true, b: true });
  });

  it("applies 0004 with its own assertions", async () => {
    await db.exec(M0004);
  });
});

describe("privileges after 0004", () => {
  it("anon has nothing; authenticated reads only display columns of its own gifts and writes nothing", async () => {
    await db.exec(`UPDATE public._ctx SET uid = '${OWNER}'`);
    for (const [role, sql] of [
      ["anon", "SELECT id FROM public.gifts"],
      ["authenticated", "SELECT stripe_session_id FROM public.gifts"],
      ["authenticated", "SELECT stripe_payment_intent_id FROM public.gifts"],
      ["authenticated", `INSERT INTO public.gifts (gift_type) VALUES ('pro_annual')`],
      ["authenticated", `UPDATE public.gifts SET status = 'paid'`],
      ["authenticated", "TRUNCATE public.gifts"],
    ] as const) {
      await db.exec(`SET ROLE ${role}`);
      const msg = await rejected(() => db.query(sql));
      await db.exec("RESET ROLE");
      expect(msg, `${role}: ${sql}`).toMatch(/permission denied/);
    }
    await db.exec(`UPDATE public._ctx SET uid = NULL`);
  });

  it("every gift function refuses anon and authenticated, and redeem_gift_code is gone", async () => {
    const msg = await rejected(() => call("gift_redeem", { _code: "ABCDEF", _user_id: FRIEND }, "authenticated"));
    expect(msg).toMatch(/permission denied/);
    for (const fn of ["gift_record_payment", "gift_private_prepare", "gift_attach_session", "gift_list_for_recipient"]) {
      const n = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_proc WHERE proname = $1 AND has_function_privilege('authenticated', oid, 'EXECUTE')`, [fn])).rows[0].n;
      expect(n, fn).toBe(0);
    }
    expect((await db.query(`SELECT 1 FROM pg_proc WHERE proname = 'redeem_gift_code'`)).rows).toHaveLength(0);
  });

  it("TS terms equal SQL terms", async () => {
    expect(await call("private_gift_terms", {})).toEqual(PRIVATE_GIFT_TERMS);
  });
});

describe("buying a private gift", () => {
  it("requires a verified, non-guest buyer and a real, different recipient", async () => {
    const prep = (sender: string, to: string) => call<{ ok: boolean; reason?: string }>("gift_private_prepare",
      { _sender: sender, _recipient_email: to, _message: null });
    expect(await prep(UNVERIFIED_BUYER, FRIEND_EMAIL)).toEqual({ ok: false, reason: "email_unverified" });
    expect(await prep(GUEST, FRIEND_EMAIL)).toEqual({ ok: false, reason: "account_required" });
    expect(await prep(OWNER, "not-an-email")).toEqual({ ok: false, reason: "invalid_recipient" });
    expect(await prep(OWNER, " OWNER@example.com ")).toEqual({ ok: false, reason: "self_gift" });
  });

  it("keeps one pending private gift per buyer and reports its open session", async () => {
    const a = await call<{ ok: boolean; gift_id: string; existing_session_id: string | null }>("gift_private_prepare",
      { _sender: OWNER, _recipient_email: FRIEND_EMAIL, _message: "hi" });
    const b = await call<{ gift_id: string }>("gift_private_prepare",
      { _sender: OWNER, _recipient_email: FRIEND_EMAIL, _message: "hi" });
    expect(b.gift_id).toBe(a.gift_id);
    const row = await gift(a.gift_id);
    expect(row).toMatchObject({ recipient_email: "friend@example.com", gift_type: "pro_annual",
      offer_id: "first_customer_annual_gift", status: "pending", sender_email: "owner@example.com" });

    expect((await call<{ result: string }>("gift_attach_session",
      { _gift_id: a.gift_id, _sender: OWNER, _session_id: "cs_one", _price_id: "price_gift50" })).result).toBe("attached");
    expect(await call("gift_attach_session",
      { _gift_id: a.gift_id, _sender: OWNER, _session_id: "cs_two", _price_id: "price_gift50" }))
      .toEqual({ result: "conflict", current_session_id: "cs_one" });
    expect((await call<{ result: string }>("gift_attach_session",
      { _gift_id: a.gift_id, _sender: STRANGER, _session_id: "cs_x", _price_id: "price_gift50" })).result).toBe("refused");

    const again = await call<{ existing_session_id: string; same_details: boolean }>("gift_private_prepare",
      { _sender: OWNER, _recipient_email: "someone.else@example.com", _message: "hi" });
    expect(again).toMatchObject({ existing_session_id: "cs_one", same_details: false });

    // The buyer replaces it: the old gift is retired, a new one may be prepared.
    expect(await call("gift_private_abandon", { _gift_id: a.gift_id, _sender: OWNER, _session_id: "cs_one" })).toBe(true);
    expect((await gift(a.gift_id)).status).toBe("expired");
    const c = await call<{ gift_id: string }>("gift_private_prepare",
      { _sender: OWNER, _recipient_email: FRIEND_EMAIL, _message: null });
    expect(c.gift_id).not.toBe(a.gift_id);
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE id = '${c.gift_id}'`);
  });
});

describe("payment state machine", () => {
  it("only an exact $50.00 USD payment makes a private gift paid", async () => {
    const g = await privateGift(FRIEND_EMAIL, false);
    expect((await pay(g, "paid", 4999)).result).toBe("invalid");
    expect((await gift(g.id)).status).toBe("invalid");
    expect((await pay(g, "paid")).result).toBe("terminal");    // invalid is terminal
    const g2 = await privateGift(FRIEND_EMAIL, false);
    expect((await pay(g2, "paid", 5000, "eur")).result).toBe("invalid");
  });

  it("refuses facts about a different session or PaymentIntent", async () => {
    const g = await privateGift(FRIEND_EMAIL, false);
    expect((await call<{ result: string }>("gift_record_payment", { _gift_id: g.id, _session_id: "cs_other",
      _payment_intent: g.pi, _state: "paid", _amount: 5000, _currency: "usd", _note: null })).result).toBe("session_mismatch");
    await pay(g, "pending");
    expect((await call<{ result: string }>("gift_record_payment", { _gift_id: g.id, _session_id: g.session,
      _payment_intent: "pi_other", _state: "paid", _amount: 5000, _currency: "usd", _note: null })).result).toBe("payment_intent_mismatch");
    expect((await gift(g.id)).status).toBe("pending");
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE id = '${g.id}'`);
  });

  it("converges whatever order Stripe delivers events in (retries are no-ops)", async () => {
    const g = await privateGift(FRIEND_EMAIL, false);
    expect((await pay(g, "refunded")).result).toBe("refunded");  // refund observed first
    expect((await pay(g, "paid")).result).toBe("terminal");      // the late "completed" cannot revive it
    expect((await pay(g, "paid")).result).toBe("terminal");
    const g2 = await privateGift(FRIEND_EMAIL, false);
    expect((await pay(g2, "pending")).result).toBe("unchanged");
    expect((await pay(g2, "paid")).result).toBe("paid");
    expect((await pay(g2, "paid")).result).toBe("unchanged");    // webhook retry
    expect((await pay(g2, "pending")).result).toBe("unchanged"); // stale event cannot downgrade
    expect((await pay(g2, "expired")).result).toBe("unchanged");
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE id = '${g2.id}'`);
  });

  it("an abandoned checkout expires; a session paid as it was replaced still counts", async () => {
    const g = await privateGift(FRIEND_EMAIL, false);
    expect((await pay(g, "expired")).result).toBe("expired");
    expect((await pay(g, "paid")).result).toBe("paid");
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE id = '${g.id}'`);
  });
});

describe("redemption", () => {
  it("is refused before payment, to the wrong account, unverified and guest accounts", async () => {
    const g = await privateGift(FRIEND_EMAIL, false);
    expect(await redeem(g.code, FRIEND)).toMatchObject({ success: false, reason: "not_paid" });
    await pay(g, "paid");
    expect(await redeem(g.code, STRANGER)).toMatchObject({ success: false, reason: "recipient_mismatch" });
    expect(await redeem(g.code, UNVERIFIED)).toMatchObject({ success: false, reason: "email_unverified" });
    expect(await redeem(g.code, GUEST)).toMatchObject({ success: false, reason: "account_required" });
    expect(await redeem("ZZZZZZZZZZ", FRIEND)).toMatchObject({ success: false, reason: "invalid_code" });
    expect(await redeem("../x", FRIEND)).toMatchObject({ success: false, reason: "invalid_code" });
    expect((await gift(g.id)).status).toBe("paid");
    await db.exec(`UPDATE public.gifts SET status = 'expired' WHERE id = '${g.id}'`);
  });

  it("grants 365 days from redemption, atomically with consuming the gift, exactly once", async () => {
    const g = await privateGift();
    const r = await redeem(g.code.toLowerCase(), FRIEND);
    expect(r).toMatchObject({ success: true, premium_days: 365 });
    const ok = (await db.query<{ ok: boolean; fresh: boolean }>(
      `SELECT $2::timestamptz = $1::timestamptz + interval '365 days' AS ok,
              $1::timestamptz > now() - interval '1 minute' AS fresh`,
      [r.grant_starts_at, r.grant_ends_at])).rows[0];
    expect(ok).toEqual({ ok: true, fresh: true });
    const grant = await grantOf(FRIEND);
    expect(grant.k).toBe("gift");
    expect(new Date(grant.e!).toISOString()).toBe(new Date(r.grant_ends_at!).toISOString());
    expect(await gift(g.id)).toMatchObject({ status: "redeemed", recipient_user_id: FRIEND, grant_applied: true });
    expect(await redeem(g.code, FRIEND)).toMatchObject({ success: false, reason: "already_redeemed" });
    expect(await redeem(g.code, STRANGER)).toMatchObject({ success: false, reason: "recipient_mismatch" });
    expect((await grantOf(FRIEND)).e!.toString()).toBe(grant.e!.toString());
  });

  it("concurrent redemptions of one code: exactly one succeeds", async () => {
    const twin = "10000000-0000-4000-8000-000000000010";
    await addUser(db, twin, "twin@example.com");
    const g = await privateGift("twin@example.com");
    const results = await Promise.all([redeem(g.code, twin), redeem(g.code, twin), redeem(g.code, twin)]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => r.reason === "already_redeemed")).toHaveLength(2);
  });

  it("stacks after a still-valid expiring grant, and never touches permanent Premium", async () => {
    const stacked = "10000000-0000-4000-8000-000000000011";
    await addUser(db, stacked, "stacked@example.com");
    await db.query(`UPDATE public.profiles SET pro_grant_kind = 'promo', pro_grant_expires_at = now() + interval '20 days'
                    WHERE user_id = $1::uuid`, [stacked]);
    const before = await grantOf(stacked);
    const g = await privateGift("stacked@example.com");
    const r = await redeem(g.code, stacked);
    expect(new Date(r.grant_starts_at!).toISOString()).toBe(new Date(before.e!).toISOString());

    const forever = "10000000-0000-4000-8000-000000000012";
    await addUser(db, forever, "forever@example.com");
    await db.query(`UPDATE public.profiles SET pro_grant_kind = 'manual' WHERE user_id = $1::uuid`, [forever]);
    const g2 = await privateGift("forever@example.com");
    expect(await redeem(g2.code, forever)).toMatchObject({ success: false, reason: "already_permanent" });
    expect((await gift(g2.id)).status).toBe("paid");
  });

  it("an expired grant is replaced, and Premium actually lapses after 365 days", async () => {
    const lapsed = "10000000-0000-4000-8000-000000000013";
    await addUser(db, lapsed, "lapsed@example.com");
    await db.query(`UPDATE public.profiles SET pro_grant_kind = 'gift', pro_grant_expires_at = now() - interval '1 day'
                    WHERE user_id = $1::uuid`, [lapsed]);
    const g = await privateGift("lapsed@example.com");
    const r = await redeem(g.code, lapsed);
    expect(new Date(r.grant_starts_at!).getTime()).toBeGreaterThan(Date.now() - 60_000);
    const at = (await db.query<{ now: boolean; later: boolean }>(`
      SELECT public.pro_grant_is_valid(pro_grant_kind, pro_grant_expires_at) AS now,
             (pro_grant_expires_at > now() + interval '364 days' AND pro_grant_expires_at < now() + interval '366 days') AS later
      FROM public.profiles WHERE user_id = $1::uuid`, [lapsed])).rows[0];
    expect(at).toEqual({ now: true, later: true });
  });
});

describe("refunds and disputes", () => {
  it("before redemption: refunded or disputed gifts cannot be redeemed; a won dispute restores them", async () => {
    const r1 = "10000000-0000-4000-8000-000000000020";
    await addUser(db, r1, "r1@example.com");
    const g = await privateGift("r1@example.com");
    expect((await pay(g, "disputed")).result).toBe("disputed");
    expect(await redeem(g.code, r1)).toMatchObject({ success: false, reason: "payment_on_hold" });
    expect((await pay(g, "paid")).result).toBe("paid");         // dispute won
    expect((await pay(g, "refunded")).result).toBe("refunded");
    expect(await redeem(g.code, r1)).toMatchObject({ success: false, reason: "unavailable" });
    expect((await grantOf(r1)).k).toBeNull();
  });

  it("after redemption: a full refund revokes the gift and restores what it stacked on", async () => {
    const r2 = "10000000-0000-4000-8000-000000000021";
    await addUser(db, r2, "r2@example.com");
    await db.query(`UPDATE public.profiles SET pro_grant_kind = 'playtest', pro_grant_expires_at = now() + interval '10 days',
                    pro_grant_reason = 'Playtest' WHERE user_id = $1::uuid`, [r2]);
    const prior = await grantOf(r2);
    const g = await privateGift("r2@example.com");
    await redeem(g.code, r2);
    expect((await pay(g, "refunded")).result).toBe("revoked_restored_prior");
    const after = await grantOf(r2);
    expect(after).toMatchObject({ k: "playtest", reason: "Playtest" });
    expect(after.e!.toString()).toBe(prior.e!.toString());
    expect(await gift(g.id)).toMatchObject({ status: "refunded", revoke_note: "revoked_restored_prior" });
    expect((await pay(g, "refunded")).result).toBe("terminal");
  });

  it("after redemption: a dispute keeps Premium until it is lost, then revokes it", async () => {
    const r3 = "10000000-0000-4000-8000-000000000022";
    await addUser(db, r3, "r3@example.com");
    const g = await privateGift("r3@example.com");
    await redeem(g.code, r3);
    expect((await pay(g, "disputed")).result).toBe("redeemed_disputed");
    expect((await grantOf(r3)).k).toBe("gift");
    expect((await pay(g, "paid")).result).toBe("redeemed_dispute_won");
    expect((await pay(g, "disputed")).result).toBe("redeemed_disputed");
    expect((await pay(g, "refunded")).result).toBe("revoked");   // lost
    expect((await grantOf(r3)).k).toBeNull();
  });

  it("if the grant changed after redemption, a refund flags it instead of guessing", async () => {
    const r4 = "10000000-0000-4000-8000-000000000023";
    await addUser(db, r4, "r4@example.com");
    const g = await privateGift("r4@example.com");
    await redeem(g.code, r4);
    await db.query(`UPDATE public.profiles SET pro_grant_kind = 'manual', pro_grant_expires_at = NULL WHERE user_id = $1::uuid`, [r4]);
    expect((await pay(g, "refunded")).result).toBe("revoked_needs_review");
    expect((await grantOf(r4)).k).toBe("manual");
  });
});

describe("existing gift products keep working, now verified and recipient-bound", () => {
  async function legacyGift(type: string, to: string, diamonds = 0) {
    const session = `cs_legacy_${++seq}`;
    const id = (await db.query<{ id: string }>(
      `INSERT INTO public.gifts (sender_user_id, sender_email, recipient_email, gift_type, diamond_amount, stripe_price_id, stripe_session_id)
       VALUES ($1::uuid, 'owner@example.com', $2, $3, $4, 'price_legacy', $5) RETURNING id`,
      [OWNER, to, type, diamonds, session])).rows[0].id;
    const g = { id, session, pi: `pi_legacy_${seq}`, code: (await gift(id)).redeem_code as string };
    // Legacy gifts may carry promotion codes, so the amount is recorded, not pinned.
    expect((await pay(g, "paid", 799)).result).toBe("paid");
    return g;
  }

  it("a monthly Pro gift grants 30 days to the right recipient only", async () => {
    const m = "10000000-0000-4000-8000-000000000030";
    await addUser(db, m, "monthly@example.com");
    const g = await legacyGift("pro_monthly", "monthly@example.com");
    expect(await redeem(g.code, STRANGER)).toMatchObject({ success: false, reason: "recipient_mismatch" });
    expect(await redeem(g.code, m)).toMatchObject({ success: true, premium_days: 30 });
  });

  it("a diamonds gift credits diamonds in the same transaction", async () => {
    const d = "10000000-0000-4000-8000-000000000031";
    await addUser(db, d, "diamonds@example.com");
    const g = await legacyGift("diamonds", "diamonds@example.com", 200);
    expect(await redeem(g.code, d)).toMatchObject({ success: true, gift_type: "diamonds" });
    expect((await db.query<{ d: number }>(`SELECT diamonds AS d FROM public.profiles WHERE user_id = $1::uuid`, [d])).rows[0].d).toBe(200);
    expect(await redeem(g.code, d)).toMatchObject({ success: false, reason: "already_redeemed" });
  });
});

describe("recipient inbox", () => {
  it("lists paid gifts only to the verified owner of the address", async () => {
    const inbox = "10000000-0000-4000-8000-000000000040";
    const unverifiedTwin = "10000000-0000-4000-8000-000000000041";
    await addUser(db, inbox, "inbox@example.com");
    await addUser(db, unverifiedTwin, "INBOX@example.com ", { verified: false });
    const g = await privateGift("inbox@example.com");
    const list = await call<Array<{ redeem_code: string; from: string }>>("gift_list_for_recipient", { _user_id: inbox });
    expect(list).toEqual([expect.objectContaining({ redeem_code: g.code, from: "Owner" })]);
    expect(await call("gift_list_for_recipient", { _user_id: unverifiedTwin })).toEqual([]);
    expect(await call("gift_list_for_recipient", { _user_id: STRANGER })).toEqual([]);
  });
});
