// @vitest-environment node
//
// PGlite loads its wasm build through fetch/Response; jsdom's shims break that,
// so this suite runs on the node environment. It touches no DOM.
/**
 * PT1.6b — the custom one-time $50 / 12-month Premium offer, RUN on a real
 * Postgres (PGlite) rather than grepped.
 *
 * The chain is the production chain: the real PT1.4 entitlement migration, the
 * real 0002 exactly as it was applied, then 0003. The fixture supplies only
 * what Supabase would: anon/authenticated/service_role with Supabase's default
 * table AND function privileges, auth.users, auth.uid(), pgcrypto in the
 * `extensions` schema, ADM2's admin_audit_log, and owner-gate stand-ins with
 * OWN1's exact error vocabulary.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import {
  ALICE, BOB, COMPED, FIXTURE, GIFTED, GUEST, M0002, M0003, OWNER, PT14, SUBSCRIBER,
} from "./customOfferDbFixture";
import { CUSTOM_OFFER_TERMS, hashClaimToken } from "../../../supabase/functions/_shared/custom-offer";

let db: PGlite;

type Who = { uid: string | null; owner?: boolean; fresh?: boolean; role: "anon" | "authenticated" | "service_role" };

async function as<T>(who: Who, work: () => Promise<T>): Promise<T> {
  await db.query(`UPDATE public._ctx SET uid = $1::uuid, owner = $2, fresh = $3`, [
    who.uid, !!who.owner, !!who.fresh,
  ]);
  await db.exec(`SET ROLE ${who.role}`);
  try {
    return await work();
  } finally {
    await db.exec("RESET ROLE");
  }
}
const service = <T>(work: () => Promise<T>) => as({ uid: null, role: "service_role" }, work);

async function rejected(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the database to reject this");
}

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];

const sha256 = async (token: string) =>
  (await one<{ h: string }>(`SELECT encode(extensions.digest($1, 'sha256'), 'hex') AS h`, [token])).h;

async function mintClaim(opts: { forUser?: string; expires?: string } = {}) {
  const r = await as({ uid: OWNER, owner: true, fresh: true, role: "authenticated" }, () =>
    one<{ c: { claim_id: string; token: string; expires_at: string } }>(
      `SELECT public.owner_create_custom_offer_claim('PT1.6b test', ${opts.expires ?? "NULL"}, $1::uuid) AS c`,
      [opts.forUser ?? null],
    ));
  return { ...r.c, hash: await sha256(r.c.token) };
}

const status = (hash: string, user: string) =>
  service(() => one<{ s: { state: string } }>(`SELECT public.custom_offer_claim_status($1, $2::uuid) AS s`, [hash, user]))
    .then((r) => r.s);
const prepare = (hash: string, user: string) =>
  service(() => one<{ p: { ok: boolean; state: string; claim_id?: string; current_session_id?: string | null } }>(
    `SELECT public.custom_offer_prepare_checkout($1, $2::uuid) AS p`, [hash, user])).then((r) => r.p);
const attach = (claim: string, user: string, prev: string | null, next: string) =>
  service(() => one<{ a: { result: string; current_session_id?: string } }>(
    `SELECT public.custom_offer_attach_checkout($1::uuid, $2::uuid, $3, $4, now() + interval '30 minutes') AS a`,
    [claim, user, prev, next])).then((r) => r.a);
const release = (session: string) =>
  service(() => one<{ r: string }>(`SELECT public.custom_offer_release_checkout($1, 'expired') AS r`, [session]))
    .then((r) => r.r);
const activate = (session: string, claim: string, user: string, pi: string, amount = 5000, currency = "usd") =>
  service(() => one<{ a: { result: string; reason?: string; entitlement_starts_at?: string; entitlement_ends_at?: string } }>(
    `SELECT public.custom_offer_activate_purchase($1, $2::uuid, $3::uuid, $4, 'cus_test', $5, $6) AS a`,
    [session, claim, user, pi, amount, currency])).then((r) => r.a);
const refund = (pi: string, cents: number, reason = "refund") =>
  service(() => one<{ r: string }>(`SELECT public.custom_offer_record_refund($1, $2, $3, 'ch_test') AS r`,
    [pi, cents, reason])).then((r) => r.r);
const grantOf = (user: string) =>
  one<{ pro_grant_kind: string | null; pro_grant_expires_at: Date | null; pro_grant_reason: string | null }>(
    `SELECT pro_grant_kind, pro_grant_expires_at, pro_grant_reason FROM public.profiles WHERE user_id = $1::uuid`, [user]);

/** Mint, bind and open a checkout for `user`; returns the claim and session. */
async function openCheckout(user: string, session: string) {
  const claim = await mintClaim();
  const p = await prepare(claim.hash, user);
  expect(p.ok).toBe(true);
  expect((await attach(claim.claim_id, user, null, session)).result).toBe("attached");
  return claim;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(FIXTURE);
  await db.exec(PT14);
  await db.exec(M0002);
  await db.exec(`
    INSERT INTO auth.users (id, is_anonymous) VALUES
      ('${OWNER}', false), ('${ALICE}', false), ('${BOB}', false), ('${GUEST}', true),
      ('${SUBSCRIBER}', false), ('${COMPED}', false), ('${GIFTED}', false);
    INSERT INTO public.profiles (user_id, display_name, is_pro) VALUES
      ('${OWNER}', 'Owner', false), ('${ALICE}', 'Alice', false), ('${BOB}', 'Bob', false),
      ('${GUEST}', NULL, false), ('${SUBSCRIBER}', 'Sub', true), ('${COMPED}', 'Comped', false),
      ('${GIFTED}', 'Gifted', false);
    UPDATE public.profiles SET pro_grant_kind = 'manual', pro_grant_expires_at = NULL
      WHERE user_id = '${COMPED}';
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("0002 as applied — the defect 0003 exists to fix", () => {
  it("D1: the 0002 purchase recorder cannot succeed (NULL actor into NOT NULL audit column)", async () => {
    // Superuser, so grants are not what stops it: the function itself fails.
    await db.exec(`
      INSERT INTO public.custom_offer_claims (token_hash, created_by, expires_at, redeemed_by_user_id, redeemed_at)
      VALUES (repeat('a', 64), '${OWNER}', now() + interval '1 day', '${ALICE}', now());
    `);
    const claim = await one<{ id: string }>(`SELECT id FROM public.custom_offer_claims WHERE token_hash = repeat('a', 64)`);
    const message = await rejected(() =>
      db.query(
        `SELECT public.record_custom_offer_purchase($1::uuid, $2::uuid, 'cs_d1', 'pi_d1', 5000, 'usd', now() + interval '1 year')`,
        [ALICE, claim.id],
      ));
    expect(message).toMatch(/actor_user_id/);
    // ...and it rolled back: no purchase, no grant.
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM public.custom_offer_purchases`)).n).toBe(0);
    expect((await grantOf(ALICE)).pro_grant_kind).toBeNull();
    await db.exec(`DELETE FROM public.custom_offer_claims`);
  });

  it("D2: browser roles hold table privileges on the 0002 tables", async () => {
    const r = await one<{ t: boolean }>(
      `SELECT has_table_privilege('anon', 'public.custom_offer_claims', 'TRUNCATE') AS t`);
    expect(r.t).toBe(true);
  });

  it("applies 0003 on top, including its in-transaction assertions", async () => {
    await db.exec(M0003);
  });
});

describe("privileges after 0003", () => {
  it("no browser role can read, write or truncate any custom-offer table", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      for (const t of ["custom_offer_claims", "custom_offer_purchases", "custom_offer_events"]) {
        const msg = await rejected(() => as({ uid: ALICE, role }, () => db.query(`SELECT * FROM public.${t}`)));
        expect(msg).toMatch(/permission denied/);
        expect(await rejected(() => as({ uid: ALICE, role }, () => db.query(`TRUNCATE public.${t}`))))
          .toMatch(/permission denied/);
      }
    }
  });

  it("service-only functions refuse anon and authenticated", async () => {
    const calls = [
      `SELECT public.custom_offer_prepare_checkout(repeat('a', 64), '${ALICE}')`,
      `SELECT public.custom_offer_claim_status(repeat('a', 64), '${ALICE}')`,
      `SELECT public.custom_offer_activate_purchase('cs_x', '${ALICE}', '${ALICE}', 'pi_x', 'cus_x', 5000, 'usd')`,
      `SELECT public.custom_offer_record_refund('pi_x', 5000, 'refund', 'ch_x')`,
      `SELECT public.custom_offer_release_checkout('cs_x', 'expired')`,
      `SELECT public.custom_offer_attach_checkout('${ALICE}', '${ALICE}', NULL, 'cs_x', now())`,
      `SELECT public.custom_offer_log_event('x', NULL, NULL, NULL, '{}')`,
      `SELECT public.custom_offer_terms()`,
      `SELECT public.apply_pro_grant('${ALICE}', 'purchase', now() + interval '1 year', 'x')`,
    ];
    for (const role of ["anon", "authenticated"] as const) {
      for (const sql of calls) {
        expect(await rejected(() => as({ uid: ALICE, role }, () => db.query(sql)))).toMatch(/permission denied/);
      }
    }
  });

  it("the superseded 0002 writers are gone", async () => {
    const r = await one<{ n: number }>(`
      SELECT count(*)::int AS n FROM pg_proc WHERE proname IN
        ('redeem_custom_offer_claim', 'restore_custom_offer_claim', 'record_custom_offer_purchase', 'refund_custom_offer_purchase')`);
    expect(r.n).toBe(0);
  });
});

describe("owner claim minting", () => {
  it("refuses non-owners and owners without fresh MFA", async () => {
    expect(await rejected(() => as({ uid: ALICE, role: "authenticated" }, () =>
      db.query(`SELECT public.owner_create_custom_offer_claim()`)))).toMatch(/owner_required/);
    expect(await rejected(() => as({ uid: OWNER, owner: true, fresh: false, role: "authenticated" }, () =>
      db.query(`SELECT public.owner_create_custom_offer_claim()`)))).toMatch(/step_up_required/);
    expect(await rejected(() => as({ uid: null, role: "anon" }, () =>
      db.query(`SELECT public.owner_create_custom_offer_claim()`)))).toMatch(/permission denied/);
  });

  it("returns the raw token once and stores only its SHA-256", async () => {
    const c = await mintClaim();
    expect(c.token).toMatch(/^mgy1_[0-9a-f]{48}$/);
    const row = await one<{ token_hash: string; n: number }>(
      `SELECT token_hash, (SELECT count(*)::int FROM public.custom_offer_claims WHERE token_hash = $1) AS n
       FROM public.custom_offer_claims WHERE id = $2::uuid`, [c.token, c.claim_id]);
    expect(row.token_hash).toBe(c.hash);
    expect(row.n).toBe(0); // the raw token is not stored anywhere
  });

  it("bounds the claim lifetime and rejects unknown target accounts", async () => {
    const owner = { uid: OWNER, owner: true, fresh: true, role: "authenticated" as const };
    expect(await rejected(() => as(owner, () =>
      db.query(`SELECT public.owner_create_custom_offer_claim(NULL, now() + interval '10 minutes')`)))).toMatch(/expiry_out_of_range/);
    expect(await rejected(() => as(owner, () =>
      db.query(`SELECT public.owner_create_custom_offer_claim(NULL, now() + interval '120 days')`)))).toMatch(/expiry_out_of_range/);
    expect(await rejected(() => as(owner, () =>
      db.query(`SELECT public.owner_create_custom_offer_claim(NULL, NULL, '99999999-0000-4000-8000-000000000000')`)))).toMatch(/unknown_user/);
  });

  it("owner listing and revocation are owner-only", async () => {
    expect(await rejected(() => as({ uid: ALICE, role: "authenticated" }, () =>
      db.query(`SELECT * FROM public.owner_list_custom_offer_claims()`)))).toMatch(/owner_required/);
    const c = await mintClaim();
    expect(await rejected(() => as({ uid: ALICE, role: "authenticated" }, () =>
      db.query(`SELECT public.owner_revoke_custom_offer_claim($1::uuid)`, [c.claim_id])))).toMatch(/owner_required/);
    const owner = { uid: OWNER, owner: true, role: "authenticated" as const };
    const r = await as(owner, () => one<{ r: string }>(`SELECT public.owner_revoke_custom_offer_claim($1::uuid) AS r`, [c.claim_id]));
    expect(r.r).toBe("revoked");
    expect((await status(c.hash, ALICE)).state).toBe("unavailable");
    const list = await as(owner, () => db.query<{ claim_id: string; status: string }>(
      `SELECT claim_id, status FROM public.owner_list_custom_offer_claims()`));
    expect(list.rows.find((x) => x.claim_id === c.claim_id)?.status).toBe("revoked");
  });
});

describe("customer-specific claim workflow", () => {
  it("binds to the first account that checks out and refuses everyone else", async () => {
    const c = await mintClaim();
    expect((await status(c.hash, ALICE)).state).toBe("available");
    expect((await status(c.hash, BOB)).state).toBe("available"); // status never binds
    expect((await prepare(c.hash, ALICE)).ok).toBe(true);
    expect((await status(c.hash, BOB)).state).toBe("other_account");
    expect(await prepare(c.hash, BOB)).toMatchObject({ ok: false, state: "other_account" });
  });

  it("honours an owner-chosen target account", async () => {
    const c = await mintClaim({ forUser: BOB });
    expect(await prepare(c.hash, ALICE)).toMatchObject({ ok: false, state: "other_account" });
    expect((await prepare(c.hash, BOB)).ok).toBe(true);
  });

  it("refuses guests, subscribers and permanent Premium without binding", async () => {
    const c = await mintClaim();
    expect(await prepare(c.hash, GUEST)).toMatchObject({ ok: false, state: "account_required" });
    expect(await prepare(c.hash, SUBSCRIBER)).toMatchObject({ ok: false, state: "active_subscription" });
    expect(await prepare(c.hash, COMPED)).toMatchObject({ ok: false, state: "permanent_premium" });
    expect((await status(c.hash, ALICE)).state).toBe("available"); // still unbound
  });

  it("refuses malformed and unknown token hashes identically", async () => {
    expect((await prepare("not-a-hash", ALICE)).state).toBe("unavailable");
    expect((await prepare("b".repeat(64), ALICE)).state).toBe("unavailable");
  });

  it("an expired claim cannot start a checkout", async () => {
    const c = await mintClaim();
    await db.query(`UPDATE public.custom_offer_claims SET expires_at = now() - interval '1 second' WHERE id = $1::uuid`, [c.claim_id]);
    expect(await prepare(c.hash, ALICE)).toMatchObject({ ok: false, state: "unavailable" });
  });
});

describe("checkout sessions: one payable session per claim, abandonment recovery", () => {
  it("compare-and-set attach: a racing second session loses", async () => {
    const c = await mintClaim();
    const p = await prepare(c.hash, ALICE);
    expect((await attach(c.claim_id, ALICE, null, "cs_first")).result).toBe("attached");
    expect(await attach(c.claim_id, ALICE, null, "cs_second")).toEqual({ result: "conflict", current_session_id: "cs_first" });
    expect((await status(c.hash, ALICE)).state).toBe("checkout_open");
    expect((await prepare(c.hash, ALICE)).current_session_id).toBe("cs_first");
    expect(p.current_session_id).toBeNull();
    // Another account can never attach a session to this claim.
    expect((await attach(c.claim_id, BOB, "cs_first", "cs_bob")).result).toBe("refused");
  });

  it("an expired/failed session is released, but the customer binding is kept", async () => {
    const c = await openCheckout(ALICE, "cs_abandon");
    expect(await release("cs_abandon")).toBe("released");
    expect(await release("cs_abandon")).toBe("not_current"); // idempotent
    expect((await status(c.hash, ALICE)).state).toBe("available");
    expect((await status(c.hash, BOB)).state).toBe("other_account");
    const again = await prepare(c.hash, ALICE);
    expect(again).toMatchObject({ ok: true, current_session_id: null });
    expect((await attach(c.claim_id, ALICE, null, "cs_retry")).result).toBe("attached");
  });
});

describe("payment-confirmed activation", () => {
  it("grants exactly 12 calendar months of Premium, once", async () => {
    const c = await openCheckout(ALICE, "cs_alice_paid");
    const a = await activate("cs_alice_paid", c.claim_id, ALICE, "pi_alice");
    expect(a.result).toBe("activated");
    const check = await one<{ ok: boolean }>(
      `SELECT ($1::timestamptz + interval '12 months') = $2::timestamptz AS ok`,
      [a.entitlement_starts_at, a.entitlement_ends_at]);
    expect(check.ok).toBe(true);
    const g = await grantOf(ALICE);
    expect(g.pro_grant_kind).toBe("purchase");
    expect(new Date(g.pro_grant_expires_at!).toISOString()).toBe(new Date(a.entitlement_ends_at!).toISOString());
    const eff = await one<{ e: boolean }>(
      `SELECT public.pro_entitlement_is_effective(is_pro, pro_grant_kind, pro_grant_expires_at) AS e
       FROM public.profiles WHERE user_id = $1::uuid`, [ALICE]);
    expect(eff.e).toBe(true);

    // Stripe redelivery of the same event: no second row, no second grant.
    expect((await activate("cs_alice_paid", c.claim_id, ALICE, "pi_alice")).result).toBe("duplicate");
    expect((await grantOf(ALICE)).pro_grant_expires_at!.toString()).toBe(g.pro_grant_expires_at!.toString());

    // The claim is consumed and its open session cleared.
    expect((await status(c.hash, ALICE)).state).toBe("already_paid");
    expect(await prepare(c.hash, ALICE)).toMatchObject({ ok: false, state: "already_paid" });
  });

  it("a second paid session for the same claim is held for review, not granted twice", async () => {
    const c = await openCheckout(BOB, "cs_bob_1");
    expect((await activate("cs_bob_1", c.claim_id, BOB, "pi_bob_1")).result).toBe("activated");
    const before = await grantOf(BOB);
    const second = await activate("cs_bob_2", c.claim_id, BOB, "pi_bob_2");
    expect(second).toMatchObject({ result: "review", reason: "duplicate_payment" });
    expect((await grantOf(BOB)).pro_grant_expires_at!.toString()).toBe(before.pro_grant_expires_at!.toString());
  });

  it("a wrong amount or currency never grants (the $50 total is a SQL constant)", async () => {
    const owner2 = "00000000-0000-4000-8000-0000000000a2";
    await db.exec(`INSERT INTO auth.users VALUES ('${owner2}', false);
                   INSERT INTO public.profiles (user_id, display_name) VALUES ('${owner2}', 'Carol');`);
    const c = await openCheckout(owner2, "cs_cheap");
    expect(await activate("cs_cheap", c.claim_id, owner2, "pi_cheap", 100)).toMatchObject({ result: "review", reason: "amount_mismatch" });
    expect((await grantOf(owner2)).pro_grant_kind).toBeNull();
    // The claim is closed until the owner resolves the held payment.
    expect((await status(c.hash, owner2)).state).toBe("already_paid");
    const c2 = await openCheckout(owner2, "cs_eur");
    expect(await activate("cs_eur", c2.claim_id, owner2, "pi_eur", 5000, "eur")).toMatchObject({ result: "review", reason: "amount_mismatch" });
    expect((await grantOf(owner2)).pro_grant_kind).toBeNull();
    // A full refund of a review row is recorded and touches no entitlement.
    expect(await refund("pi_cheap", 100)).toBe("refunded_unactivated");
  });

  it("an unattributable session is ledgered, not thrown (retrying cannot fix it)", async () => {
    const r = await activate("cs_ghost", "99999999-0000-4000-8000-000000000000", ALICE, "pi_ghost");
    expect(r.result).toBe("unattributable");
    const ev = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.custom_offer_events WHERE event = 'activation_unattributable' AND stripe_object_id = 'cs_ghost'`);
    expect(ev.n).toBe(1);
  });

  it("stacks after a still-valid gift and a refund restores that gift exactly", async () => {
    await db.query(
      `UPDATE public.profiles SET pro_grant_kind = 'gift', pro_grant_expires_at = now() + interval '30 days',
         pro_grant_reason = 'Redeemed pro_monthly gift' WHERE user_id = $1::uuid`, [GIFTED]);
    const gift = await grantOf(GIFTED);
    const c = await openCheckout(GIFTED, "cs_gifted");
    const a = await activate("cs_gifted", c.claim_id, GIFTED, "pi_gifted");
    expect(a.result).toBe("activated");
    expect(new Date(a.entitlement_starts_at!).toISOString()).toBe(new Date(gift.pro_grant_expires_at!).toISOString());

    expect(await refund("pi_gifted", 2500)).toBe("partial_recorded");
    expect((await grantOf(GIFTED)).pro_grant_kind).toBe("purchase");

    expect(await refund("pi_gifted", 5000)).toBe("revoked_restored_prior");
    const after = await grantOf(GIFTED);
    expect(after.pro_grant_kind).toBe("gift");
    expect(after.pro_grant_expires_at!.toString()).toBe(gift.pro_grant_expires_at!.toString());
    expect(after.pro_grant_reason).toBe("Redeemed pro_monthly gift");
    expect(await refund("pi_gifted", 5000)).toBe("already_refunded");
  });
});

describe("refunds and disputes", () => {
  it("a full refund of a fresh purchase returns the account to Free", async () => {
    expect(await refund("pi_alice", 5000)).toBe("revoked");
    expect((await grantOf(ALICE)).pro_grant_kind).toBeNull();
  });

  it("a lost dispute revokes even without a refund amount", async () => {
    const dave = "00000000-0000-4000-8000-0000000000a3";
    await db.exec(`INSERT INTO auth.users VALUES ('${dave}', false);
                   INSERT INTO public.profiles (user_id, display_name) VALUES ('${dave}', 'Dave');`);
    const c = await openCheckout(dave, "cs_dave");
    await activate("cs_dave", c.claim_id, dave, "pi_dave");
    expect(await refund("pi_dave", 0, "dispute_lost")).toBe("revoked");
    expect((await grantOf(dave)).pro_grant_kind).toBeNull();
  });

  it("if the grant slot changed after activation, a refund flags instead of guessing", async () => {
    const erin = "00000000-0000-4000-8000-0000000000a4";
    await db.exec(`INSERT INTO auth.users VALUES ('${erin}', false);
                   INSERT INTO public.profiles (user_id, display_name) VALUES ('${erin}', 'Erin');`);
    const c = await openCheckout(erin, "cs_erin");
    await activate("cs_erin", c.claim_id, erin, "pi_erin");
    // A gift redeemed on top (redeem-gift rewrites kind + extends expiry).
    await db.query(`UPDATE public.profiles SET pro_grant_kind = 'gift',
      pro_grant_expires_at = pro_grant_expires_at + interval '30 days' WHERE user_id = $1::uuid`, [erin]);
    expect(await refund("pi_erin", 5000)).toBe("revoked_needs_review");
    expect((await grantOf(erin)).pro_grant_kind).toBe("gift");
  });

  it("refunds for unrelated payments (diamond packs, gifts) are ignored", async () => {
    expect(await refund("pi_not_ours", 999)).toBe("not_found");
    expect(await rejected(() => refund("pi_alice", 5000, "chargeback"))).toMatch(/invalid_reason/);
  });
});

describe("customer self view", () => {
  it("my_custom_offer_purchases only ever returns the caller's rows", async () => {
    const mine = await as({ uid: BOB, role: "authenticated" }, () =>
      db.query<{ status: string }>(`SELECT * FROM public.my_custom_offer_purchases()`));
    expect(mine.rows.map((r) => r.status).sort()).toEqual(["paid", "review"]);
    const anonymous = await rejected(() => as({ uid: null, role: "anon" }, () =>
      db.query(`SELECT * FROM public.my_custom_offer_purchases()`)));
    expect(anonymous).toMatch(/permission denied/);
    const nobody = await as({ uid: null, role: "authenticated" }, () =>
      db.query(`SELECT * FROM public.my_custom_offer_purchases()`));
    expect(nobody.rows).toHaveLength(0);
  });
});

describe("TypeScript and SQL agree", () => {
  it("custom_offer_terms() is exactly the edge functions' CUSTOM_OFFER_TERMS", async () => {
    const r = await one<{ t: unknown }>(`SELECT public.custom_offer_terms() AS t`);
    expect(r.t).toEqual(CUSTOM_OFFER_TERMS);
  });

  it("the edge function's token hash is the hash SQL stored", async () => {
    const c = await mintClaim();
    expect(await hashClaimToken(c.token)).toBe(c.hash);
  });
});
