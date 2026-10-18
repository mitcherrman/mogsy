// @vitest-environment node
/**
 * EMAIL1 — subscription, consent, unsubscribe, suppression, RLS and admin
 * authorization, RUN on Postgres (PGlite) against the staged migration itself.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  EMAIL1_MIGRATION, EMAIL1_ROLLBACK, addUser, asRole, bootEmailDb, fakeHash, rejected,
} from "./email1DbFixture";

const OWNER = "20000000-0000-4000-8000-000000000001";
const ALICE = "20000000-0000-4000-8000-0000000000a1";
const BOB = "20000000-0000-4000-8000-0000000000b1";
const CAROL = "20000000-0000-4000-8000-0000000000c1";
const GUEST = "20000000-0000-4000-8000-0000000000d1";
const LEGACY1 = "20000000-0000-4000-8000-0000000000e1";
const LEGACY2 = "20000000-0000-4000-8000-0000000000e2";

let db: PGlite;
let seq = 0;
const h = () => fakeHash(`b${(++seq).toString(16)}`);

type Json = Record<string, any>;

async function svc<T = Json>(fn: string, args: Record<string, unknown>): Promise<T> {
  const names = Object.keys(args);
  return asRole(db, "service_role", {}, async () => {
    const { rows } = await db.query<{ r: T }>(
      `SELECT public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) AS r`,
      names.map((n) => args[n]),
    );
    return rows[0].r;
  });
}

const claim = async (campaignId: string) =>
  asRole(db, "service_role", {}, async () =>
    (await db.query<Json>(`SELECT * FROM public.newsletter_claim_batch($1, 10)`, [campaignId])).rows);
const request = (user: string, email: string, topics: string[], source = "settings", token = h()) =>
  svc<Json>("email_request_subscription", {
    _user_id: user, _email: email, _topics: topics, _source: source, _consent_version: "v-test",
    _consent_text: "Email me stuff.", _ip_hash: "iphash", _user_agent: "vitest", _token_hash: token,
  }).then((r): Json => ({ ...r, token }));
const confirm = (token: string) => svc("email_confirm_subscription", { _token_hash: token, _ip_hash: null, _user_agent: "vitest" });
const unsubscribe = (id: string, source = "unsubscribe_link") =>
  svc("email_unsubscribe", { _subscription_id: id, _source: source, _ip_hash: null, _user_agent: null });
const sub = async (email: string) =>
  (await db.query<Json>(`SELECT * FROM public.email_subscriptions WHERE email_normalized = $1`, [email.toLowerCase()])).rows[0];
const events = async (email: string) =>
  (await db.query<{ event_type: string; source: string }>(
    `SELECT event_type, source FROM public.email_consent_events WHERE email_normalized = $1 ORDER BY id`, [email.toLowerCase()])).rows;
const backdate = (email: string) =>
  db.query(`UPDATE public.email_subscriptions SET last_confirmation_sent_at = now() - interval '2 minutes' WHERE email_normalized = $1`, [email]);

/** A fully confirmed subscriber. */
async function subscribe(user: string, email: string, topics = ["daily_reminder"]) {
  const r = await request(user, email, topics);
  expect(r.result).toBe("confirmation_required");
  expect((await confirm(r.token)).result).toBe("confirmed");
  return r.subscription_id as string;
}

beforeAll(async () => {
  db = await bootEmailDb({
    preUsers: [
      { id: LEGACY1, email: "legacy1@example.com" },
      { id: LEGACY2, email: "legacy2@example.com" },
      { id: GUEST, email: null, anonymous: true },
    ],
  });
  await addUser(db, OWNER, "owner@example.com");
  await addUser(db, ALICE, "Alice@Example.com");
  await addUser(db, BOB, "bob@example.com");
  await addUser(db, CAROL, "carol@example.com");
}, 60_000);
afterAll(async () => { await db?.close(); });

describe("existing users are never subscribed", () => {
  it("the migration leaves every table empty although users existed beforehand", async () => {
    for (const t of ["email_subscriptions", "email_consent_events", "email_confirmation_tokens", "email_suppressions", "newsletter_campaigns"]) {
      const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${t}`);
      expect(rows[0].n, t).toBe(0);
    }
  });

  it("the migration contains no backfill and no trigger on auth.users or profiles", () => {
    const sql = EMAIL1_MIGRATION.replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.email_subscriptions[\s\S]{0,400}?\bSELECT\b/i);
    expect(sql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER[^;]*\bON\s+(auth\.users|public\.profiles)/i);
    expect(sql).not.toMatch(/\bFROM\s+(auth\.users|public\.profiles)\b[^;]*\bINSERT\b/i);
  });

  it("is idempotent: applying it twice neither errors nor creates rows", async () => {
    await db.exec(EMAIL1_MIGRATION);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.email_subscriptions`);
    expect(rows[0].n).toBe(0);
  });
});

describe("double opt-in", () => {
  it("a request is PENDING, not subscribed, and records consent evidence", async () => {
    const r = await request(ALICE, "alice@example.com", ["daily_reminder", "events"], "signup_direct");
    expect(r.result).toBe("confirmation_required");
    const s = await sub("alice@example.com");
    expect(s.status).toBe("pending");
    expect(s.topics).toEqual([]);
    expect(s.pending_topics).toEqual(["daily_reminder", "events"]);
    const ev = (await db.query<Json>(`SELECT * FROM public.email_consent_events WHERE email_normalized = 'alice@example.com'`)).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event_type: "opt_in_requested", source: "signup_direct", consent_version: "v-test", consent_text: "Email me stuff." });
  });

  it("a pending subscriber is not eligible to be emailed", async () => {
    const n = await svc<number>("newsletter_audience_count", { _topic: "daily_reminder" });
    expect(n).toBe(0);
  });

  it("only the emailed token confirms, then the topics go live", async () => {
    const s = await sub("alice@example.com");
    const t = (await db.query<{ token_hash: string }>(`SELECT token_hash FROM public.email_confirmation_tokens WHERE subscription_id = $1`, [s.id])).rows[0];
    expect((await confirm(fakeHash("not-the-token"))).result).toBe("invalid");
    expect((await confirm("short")).result).toBe("invalid");
    const ok = await confirm(t.token_hash);
    expect(ok).toMatchObject({ result: "confirmed", topics: ["daily_reminder", "events"] });
    expect(ok.email_masked).toBe("a***@example.com");
    const after = await sub("alice@example.com");
    expect(after).toMatchObject({ status: "subscribed", topics: ["daily_reminder", "events"], pending_topics: [] });
    expect((await events("alice@example.com")).map((e) => e.event_type)).toEqual(["opt_in_requested", "opt_in_confirmed"]);
  });

  it("a second click (or a mail scanner) is harmless and a consumed token cannot be replayed after opting out", async () => {
    const s = await sub("alice@example.com");
    const hash = (await db.query<{ token_hash: string }>(`SELECT token_hash FROM public.email_confirmation_tokens WHERE subscription_id = $1`, [s.id])).rows[0].token_hash;
    expect((await confirm(hash)).result).toBe("already_confirmed");
    await unsubscribe(s.id);
    expect((await confirm(hash)).result).toBe("invalid");
    expect((await sub("alice@example.com")).status).toBe("unsubscribed");
  });

  it("an expired token does not subscribe", async () => {
    const r = await request(BOB, "bob@example.com", ["product_news"]);
    await db.query(`UPDATE public.email_confirmation_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`, [r.token]);
    expect((await confirm(r.token)).result).toBe("expired");
    expect((await sub("bob@example.com")).status).toBe("pending");
  });

  it("a newer request invalidates the older link", async () => {
    await backdate("bob@example.com");
    const first = (await db.query<{ token_hash: string }>(`SELECT token_hash FROM public.email_confirmation_tokens WHERE subscription_id = (SELECT id FROM public.email_subscriptions WHERE email_normalized = 'bob@example.com')`)).rows[0].token_hash;
    const r2 = await request(BOB, "bob@example.com", ["events"]);
    expect(r2.result).toBe("confirmation_required");
    expect((await confirm(first)).result).toBe("invalid");
    expect(await confirm(r2.token)).toMatchObject({ result: "confirmed", topics: ["events"] });
  });
});

describe("request validation", () => {
  it("refuses an address that is not the account's own, and guests", async () => {
    expect((await request(CAROL, "someone-else@example.com", ["events"])).result).toBe("email_mismatch");
    expect((await request(GUEST, "guest@example.com", ["events"])).result).toBe("email_mismatch");
    expect((await request("20000000-0000-4000-8000-00000000ffff", "carol@example.com", ["events"])).result).toBe("email_mismatch");
    expect(await sub("someone-else@example.com")).toBeUndefined();
  });

  it("rejects unknown topics, empty topics, bad sources and malformed token hashes", async () => {
    expect(await rejected(() => request(CAROL, "carol@example.com", ["newsletter_everything"]))).toMatch(/invalid_topics/);
    expect(await rejected(() => request(CAROL, "carol@example.com", []))).toMatch(/invalid_topics/);
    expect(await rejected(() => request(CAROL, "carol@example.com", ["events"], "admin_import"))).toMatch(/invalid_source/);
    expect(await rejected(() => request(CAROL, "carol@example.com", ["events"], "settings", "tooshort"))).toMatch(/invalid_token/);
  });

  it("matches the address case-insensitively", async () => {
    // ALICE's auth email is stored as "Alice@Example.com".
    const r = await request(ALICE, " ALICE@example.com ", ["promotions"]);
    expect(["confirmation_required", "throttled"]).toContain(r.result);
    expect((await sub("alice@example.com")).email_normalized).toBe("alice@example.com");
  });

  it("throttles confirmation emails: one a minute and five a day", async () => {
    await backdate("carol@example.com");
    expect((await request(CAROL, "carol@example.com", ["events"])).result).toBe("confirmation_required");
    expect((await request(CAROL, "carol@example.com", ["events"])).result).toBe("throttled");
    for (let i = 0; i < 4; i++) {
      await backdate("carol@example.com");
      expect((await request(CAROL, "carol@example.com", ["events"])).result).toBe("confirmation_required");
    }
    await backdate("carol@example.com");
    expect((await request(CAROL, "carol@example.com", ["events"])).result).toBe("throttled");
  });
});

describe("signup intent is a hint, never an override", () => {
  const U = "20000000-0000-4000-8000-0000000000f1";
  const V = "20000000-0000-4000-8000-0000000000f2";
  beforeAll(async () => {
    await addUser(db, U, "intent-new@example.com");
    await addUser(db, V, "intent-optout@example.com");
  });

  it("creates the first request for a brand-new mailbox", async () => {
    expect((await request(U, "intent-new@example.com", ["daily_reminder"], "signup_intent")).result).toBe("confirmation_required");
  });

  it("does not restart a pending request, re-subscribe an opt-out or touch a live subscription", async () => {
    expect((await request(U, "intent-new@example.com", ["events"], "signup_intent")).result).toBe("exists");
    const id = await subscribe(V, "intent-optout@example.com", ["events"]);
    await unsubscribe(id, "one_click");
    expect(await request(V, "intent-optout@example.com", ["events", "promotions"], "signup_intent")).toMatchObject({ result: "exists", status: "unsubscribed" });
    expect((await sub("intent-optout@example.com")).status).toBe("unsubscribed");
    // ...but a deliberate request from Settings may.
    await backdate("intent-optout@example.com");
    expect((await request(V, "intent-optout@example.com", ["events"], "settings")).result).toBe("confirmation_required");
  });
});

describe("unsubscribe", () => {
  const W = "20000000-0000-4000-8000-0000000000a9";
  beforeAll(async () => { await addUser(db, W, "wendy@example.com"); });

  it("clears topics, is idempotent, and records who and how", async () => {
    const id = await subscribe(W, "wendy@example.com", ["daily_reminder", "promotions"]);
    expect(await unsubscribe(id, "one_click")).toMatchObject({ result: "unsubscribed", email_masked: "w***@example.com" });
    expect((await unsubscribe(id)).result).toBe("already_unsubscribed");
    expect(await sub("wendy@example.com")).toMatchObject({ status: "unsubscribed", topics: [], pending_topics: [] });
    const evs = await events("wendy@example.com");
    expect(evs.filter((e) => e.event_type === "unsubscribed")).toEqual([{ event_type: "unsubscribed", source: "one_click" }]);
    expect((await svc("email_unsubscribe_preview", { _subscription_id: id })).email_masked).toBe("w***@example.com");
    expect((await unsubscribe("20000000-0000-4000-8000-00000000dead")).result).toBe("not_found");
  });

  it("an opted-out mailbox is excluded from every audience", async () => {
    for (const t of ["daily_reminder", "product_news", "events", "promotions"]) {
      const { rows } = await db.query(`SELECT 1 FROM public._newsletter_eligible($1) WHERE email = 'wendy@example.com'`, [t]);
      expect(rows).toHaveLength(0);
    }
  });
});

describe("settings: change topics", () => {
  const X = "20000000-0000-4000-8000-0000000000b9";
  beforeAll(async () => { await addUser(db, X, "xena@example.com"); });
  const setTopics = (topics: string[]) =>
    svc("email_set_topics", { _user_id: X, _email: "xena@example.com", _topics: topics, _ip_hash: null, _user_agent: null });

  it("requires an existing confirmed subscription", async () => {
    expect((await setTopics(["events"])).result).toBe("not_subscribed");
    await subscribe(X, "xena@example.com", ["events"]);
  });

  it("narrows, widens and logs; empty means unsubscribe", async () => {
    expect(await setTopics(["events", "product_news"])).toMatchObject({ result: "updated", topics: ["events", "product_news"] });
    expect(await setTopics(["product_news"])).toMatchObject({ topics: ["product_news"] });
    expect(await rejected(() => setTopics(["nope"]))).toMatch(/invalid_topics/);
    expect((await setTopics([])).result).toBe("unsubscribed");
    expect((await sub("xena@example.com")).status).toBe("unsubscribed");
    expect((await events("xena@example.com")).map((e) => e.event_type)).toEqual(
      ["opt_in_requested", "opt_in_confirmed", "preferences_changed", "preferences_changed", "unsubscribed"]);
  });

  it("cannot be used to act on someone else's mailbox", async () => {
    expect((await svc("email_set_topics", { _user_id: X, _email: "bob@example.com", _topics: ["events"], _ip_hash: null, _user_agent: null })).result).toBe("email_mismatch");
  });
});

describe("suppression (bounce / complaint)", () => {
  const Y = "20000000-0000-4000-8000-0000000000c9";
  beforeAll(async () => { await addUser(db, Y, "yara@example.com"); });

  it("suppresses, is idempotent on the provider event id, and blocks every way back in", async () => {
    const pending = await request(Y, "yara@example.com", ["events"]);
    const applied = await svc("email_apply_suppression", { _email: "Yara@Example.com", _reason: "complaint", _source: "provider_webhook", _provider_event_id: "evt_1" });
    expect(applied.result).toBe("suppressed");
    expect((await svc("email_apply_suppression", { _email: "yara@example.com", _reason: "complaint", _source: "provider_webhook", _provider_event_id: "evt_1" })).result).toBe("duplicate");
    expect(await sub("yara@example.com")).toMatchObject({ status: "suppressed", topics: [], pending_topics: [] });
    expect((await confirm(pending.token)).result).toBe("invalid"); // its token was deleted
    expect((await request(Y, "yara@example.com", ["events"])).result).toBe("suppressed");
    expect(await rejected(() => svc("email_apply_suppression", { _email: "y@e.com", _reason: "because", _source: "x", _provider_event_id: null }))).toMatch(/invalid_reason/);
    expect((await unsubscribe((await sub("yara@example.com")).id)).result).toBe("already_unsubscribed");
    expect((await sub("yara@example.com")).status).toBe("suppressed");
  });

  it("suppresses an address that never subscribed (so it can never be added later)", async () => {
    await svc("email_apply_suppression", { _email: "stranger@example.com", _reason: "hard_bounce", _source: "provider_webhook", _provider_event_id: "evt_2" });
    expect(await sub("stranger@example.com")).toBeUndefined();
    const S = "20000000-0000-4000-8000-0000000000d9";
    await addUser(db, S, "stranger@example.com");
    expect((await request(S, "stranger@example.com", ["events"])).result).toBe("suppressed");
  });
});

describe("mailbox reassigned to a different account", () => {
  it("does not carry the previous holder's consent over", async () => {
    const OLD = "20000000-0000-4000-8000-0000000000aa";
    const NEW = "20000000-0000-4000-8000-0000000000ab";
    await addUser(db, OLD, "shared@example.com");
    await subscribe(OLD, "shared@example.com", ["promotions"]);
    await db.query(`DELETE FROM public.profiles WHERE user_id = $1`, [OLD]);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [OLD]); // FK: user_id -> NULL, mailbox row kept
    expect((await sub("shared@example.com")).user_id).toBeNull();
    await addUser(db, NEW, "shared@example.com");
    const r = await request(NEW, "shared@example.com", ["events"], "signup_intent");
    expect(r.result).toBe("confirmation_required");
    expect(await sub("shared@example.com")).toMatchObject({ user_id: NEW, status: "pending", topics: [] });
    expect((await events("shared@example.com")).map((e) => e.event_type)).toContain("rebound");
  });
});

describe("eligibility is one definition", () => {
  const E1 = "20000000-0000-4000-8000-0000000000e3";
  const E2 = "20000000-0000-4000-8000-0000000000e4";
  const E3 = "20000000-0000-4000-8000-0000000000e5";
  beforeAll(async () => {
    await addUser(db, E1, "elig1@example.com");
    await addUser(db, E2, "elig2@example.com");
    await addUser(db, E3, "elig3@example.com");
    await subscribe(E1, "elig1@example.com", ["product_news"]);
    await subscribe(E2, "elig2@example.com", ["product_news"]);
    await subscribe(E3, "elig3@example.com", ["events"]);
  });
  const emails = async (topic: string) =>
    (await db.query<{ email: string }>(`SELECT email FROM public._newsletter_eligible($1) ORDER BY email`, [topic])).rows.map((r) => r.email);

  it("returns exactly the confirmed subscribers of the topic", async () => {
    expect(await emails("product_news")).toEqual(expect.arrayContaining(["elig1@example.com", "elig2@example.com"]));
    expect(await emails("product_news")).not.toContain("elig3@example.com");
  });

  it("drops a subscriber whose account email changed after consent", async () => {
    await db.query(`UPDATE auth.users SET email = 'elig2-new@example.com' WHERE id = $1`, [E2]);
    expect(await emails("product_news")).not.toContain("elig2@example.com");
    await db.query(`UPDATE auth.users SET email = 'elig2@example.com' WHERE id = $1`, [E2]);
    expect(await emails("product_news")).toContain("elig2@example.com");
  });

  it("drops a subscriber who became anonymous or was suppressed", async () => {
    await db.query(`UPDATE auth.users SET is_anonymous = true WHERE id = $1`, [E1]);
    expect(await emails("product_news")).not.toContain("elig1@example.com");
    await db.query(`UPDATE auth.users SET is_anonymous = false WHERE id = $1`, [E1]);
    await db.query(`INSERT INTO public.email_suppressions (email_normalized, reason, source) VALUES ('elig1@example.com', 'manual', 'test')`);
    expect(await emails("product_news")).not.toContain("elig1@example.com");
    await db.query(`DELETE FROM public.email_suppressions WHERE email_normalized = 'elig1@example.com'`);
  });
});

describe("privileges and RLS", () => {
  it("a user sees only their own subscription row, and never the raw email column", async () => {
    const rows = await asRole(db, "authenticated", { uid: ALICE }, async () =>
      (await db.query<Json>(`SELECT email_normalized, status FROM public.email_subscriptions`)).rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.email_normalized === "alice@example.com")).toBe(true);
    const err = await asRole(db, "authenticated", { uid: ALICE }, () =>
      rejected(() => db.query(`SELECT email FROM public.email_subscriptions`)));
    expect(err).toMatch(/permission denied/i);
  });

  it("a user sees only their own consent history", async () => {
    const rows = await asRole(db, "authenticated", { uid: BOB }, async () =>
      (await db.query<Json>(`SELECT user_id, event_type FROM public.email_consent_events`)).rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.user_id === BOB)).toBe(true);
    const leak = await asRole(db, "authenticated", { uid: BOB }, () =>
      rejected(() => db.query(`SELECT ip_hash FROM public.email_consent_events`)));
    expect(leak).toMatch(/permission denied/i);
  });

  it("browser roles cannot write any EMAIL1 table", async () => {
    const writes = [
      `INSERT INTO public.email_subscriptions (user_id, email, email_normalized, status, topics) VALUES ('${ALICE}', 'x@y.z', 'x@y.z', 'subscribed', '{events}')`,
      `UPDATE public.email_subscriptions SET status = 'subscribed', topics = '{events}'`,
      `DELETE FROM public.email_subscriptions`,
      `INSERT INTO public.email_consent_events (email_normalized, event_type, source) VALUES ('a@b.c', 'opt_in_confirmed', 'x')`,
      `DELETE FROM public.email_suppressions`,
      `INSERT INTO public.newsletter_campaigns (name, subject, body_markdown, topic) VALUES ('n','s','b','events')`,
    ];
    for (const role of ["authenticated", "anon"] as const) {
      for (const sql of writes) {
        const msg = await asRole(db, role, { uid: ALICE }, () => rejected(() => db.exec(sql)));
        expect(msg, `${role}: ${sql}`).toMatch(/permission denied|row-level security/i);
      }
    }
  });

  it("browser roles cannot read tokens, suppressions, campaigns or deliveries", async () => {
    for (const t of ["email_confirmation_tokens", "email_suppressions", "newsletter_campaigns", "newsletter_deliveries"]) {
      for (const role of ["authenticated", "anon"] as const) {
        const msg = await asRole(db, role, { uid: ALICE }, () => rejected(() => db.query(`SELECT * FROM public.${t}`)));
        expect(msg, `${role} ${t}`).toMatch(/permission denied/i);
      }
    }
  });

  it("anonymous visitors cannot read subscriptions at all", async () => {
    const msg = await asRole(db, "anon", {}, () => rejected(() => db.query(`SELECT id FROM public.email_subscriptions`)));
    expect(msg).toMatch(/permission denied/i);
  });

  it("the lifecycle and send functions are service-role only", async () => {
    const calls = [
      `SELECT public.email_request_subscription('${ALICE}', 'alice@example.com', '{events}', 'settings', 'v', 't', null, null, '${fakeHash("z")}', 72)`,
      `SELECT public.email_confirm_subscription('${fakeHash("z")}', null, null)`,
      `SELECT public.email_unsubscribe('${ALICE}', 'x', null, null)`,
      `SELECT public.email_apply_suppression('a@b.c', 'manual', 'x', null)`,
      `SELECT public.newsletter_audience_count('events')`,
      `SELECT * FROM public._newsletter_eligible('events')`,
      `SELECT public.newsletter_begin_send('${ALICE}', 0)`,
    ];
    for (const role of ["authenticated", "anon"] as const) {
      for (const sql of calls) {
        const msg = await asRole(db, role, { uid: ALICE, owner: true, fresh: true }, () => rejected(() => db.query(sql)));
        expect(msg, `${role}: ${sql}`).toMatch(/permission denied/i);
      }
    }
  });

  it("the consent trail is append-only, even for the service role", async () => {
    const attempts = [
      `UPDATE public.email_consent_events SET event_type = 'opt_in_confirmed'`,
      `DELETE FROM public.email_consent_events`,
      `TRUNCATE public.email_consent_events`,
    ];
    for (const sql of attempts) {
      const msg = await asRole(db, "service_role", {}, () => rejected(() => db.exec(sql)));
      expect(msg, sql).toMatch(/append-only/);
    }
  });

  it("subscription states are constrained: topics only while subscribed", async () => {
    const msg = await rejected(() => db.query(
      `UPDATE public.email_subscriptions SET status = 'unsubscribed', topics = '{events}' WHERE email_normalized = 'alice@example.com'`));
    expect(msg).toMatch(/email_subscriptions_topics_state_chk|violates check/);
  });
});

describe("admin authorization", () => {
  it("every admin RPC refuses a non-owner and an anonymous caller", async () => {
    const calls = [
      `SELECT * FROM public.admin_email_subscription_status(ARRAY['${ALICE}']::uuid[])`,
      `SELECT public.admin_email_stats()`,
      `SELECT * FROM public.admin_email_list_subscribers(NULL, 10, 0)`,
      `SELECT public.admin_newsletter_audience('events')`,
      `SELECT * FROM public.admin_newsletter_list_campaigns()`,
      `SELECT public.admin_newsletter_save_campaign(NULL, 'n', 's', NULL, 'b', 'events')`,
      `SELECT public.admin_newsletter_set_status('${ALICE}', 'cancelled')`,
    ];
    for (const sql of calls) {
      const asUser = await asRole(db, "authenticated", { uid: ALICE, owner: false }, () => rejected(() => db.query(sql)));
      expect(asUser, sql).toMatch(/owner_required/);
      const asAnon = await asRole(db, "anon", {}, () => rejected(() => db.query(sql)));
      expect(asAnon, sql).toMatch(/permission denied/i);
    }
  });

  const owner = <T>(fn: () => Promise<T>, fresh = false) => asRole(db, "authenticated", { uid: OWNER, owner: true, fresh }, fn);

  it("the owner can read status, stats and the audited subscriber list", async () => {
    const st = await owner(async () => (await db.query<Json>(`SELECT * FROM public.admin_email_subscription_status(ARRAY['${ALICE}','${BOB}']::uuid[])`)).rows);
    expect(st.map((r) => r.user_id).sort()).toEqual([ALICE, BOB].sort());
    const stats = await owner(async () => (await db.query<{ s: Json }>(`SELECT public.admin_email_stats() AS s`)).rows[0].s);
    expect(stats.by_status).toBeTypeOf("object");
    const before = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.admin_audit_log WHERE action = 'newsletter_list_subscribers'`)).rows[0].n;
    const list = await owner(async () => (await db.query<Json>(`SELECT * FROM public.admin_email_list_subscribers('subscribed', 5, 0)`)).rows);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(5);
    const after = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.admin_audit_log WHERE action = 'newsletter_list_subscribers'`)).rows[0].n;
    expect(after).toBe(before + 1);
  });

  it("caps batch size and validates filters", async () => {
    const ids = Array.from({ length: 201 }, () => `'${ALICE}'`).join(",");
    expect(await owner(() => rejected(() => db.query(`SELECT * FROM public.admin_email_subscription_status(ARRAY[${ids}]::uuid[])`)))).toMatch(/too_many_ids/);
    expect(await owner(() => rejected(() => db.query(`SELECT * FROM public.admin_email_list_subscribers('everyone', 5, 0)`)))).toMatch(/invalid_status/);
    expect(await owner(() => rejected(() => db.query(`SELECT public.admin_newsletter_audience('spam')`)))).toMatch(/invalid_topic/);
  });
});

describe("campaigns: draft, approve, send", () => {
  const owner = <T>(fn: () => Promise<T>, fresh = false) => asRole(db, "authenticated", { uid: OWNER, owner: true, fresh }, fn);
  let campaign: string;
  const P1 = "20000000-0000-4000-8000-0000000000f5";
  const P2 = "20000000-0000-4000-8000-0000000000f6";
  const P3 = "20000000-0000-4000-8000-0000000000f7";
  let s1: string; let s2: string; let s3: string;

  beforeAll(async () => {
    for (const [id, e] of [[P1, "promo1@example.com"], [P2, "promo2@example.com"], [P3, "promo3@example.com"]]) await addUser(db, id, e);
    s1 = await subscribe(P1, "promo1@example.com", ["promotions"]);
    s2 = await subscribe(P2, "promo2@example.com", ["promotions"]);
    s3 = await subscribe(P3, "promo3@example.com", ["promotions"]);
  });
  const q = async (sql: string, p: unknown[] = []) => (await db.query<Json>(sql, p)).rows;

  it("drafts are owner-created, validated and editable only while draft", async () => {
    campaign = await owner(async () => (await q(`SELECT public.admin_newsletter_save_campaign(NULL, 'Oct promo', 'Hello', 'pre', '# Hi\n\nBody', 'promotions') AS id`))[0].id);
    expect((await q(`SELECT status FROM public.newsletter_campaigns WHERE id = $1`, [campaign]))[0].status).toBe("draft");
    await owner(() => q(`SELECT public.admin_newsletter_save_campaign($1, 'Oct promo', 'Hello again', NULL, 'Body 2', 'promotions')`, [campaign]));
    expect((await q(`SELECT subject, preheader FROM public.newsletter_campaigns WHERE id = $1`, [campaign]))[0]).toEqual({ subject: "Hello again", preheader: null });
    expect(await owner(() => rejected(() => q(`SELECT public.admin_newsletter_save_campaign(NULL, 'n', '', NULL, 'b', 'events')`)))).toMatch(/violates check/);
    expect(await owner(() => rejected(() => q(`SELECT public.admin_newsletter_save_campaign(NULL, 'n', 's', NULL, 'b', 'not_a_topic')`)))).toMatch(/violates check/);
  });

  it("approval needs a FRESH owner session and snapshots the audience", async () => {
    expect(await owner(() => rejected(() => q(`SELECT public.admin_newsletter_set_status($1, 'ready')`, [campaign])), false)).toMatch(/step_up_required/);
    const r = await owner(async () => (await q(`SELECT public.admin_newsletter_set_status($1, 'ready') AS r`, [campaign]))[0].r, true);
    expect(r).toMatchObject({ status: "ready", audience: 3 });
    expect((await q(`SELECT approved_recipient_count, approved_by FROM public.newsletter_campaigns WHERE id = $1`, [campaign]))[0]).toEqual({ approved_recipient_count: 3, approved_by: OWNER });
  });

  it("an approved campaign is frozen", async () => {
    expect(await owner(() => rejected(() => q(`SELECT public.admin_newsletter_save_campaign($1, 'x', 'y', NULL, 'z', 'promotions')`, [campaign])))).toMatch(/campaign_not_editable/);
  });

  it("refuses to start when the audience changed since the owner looked", async () => {
    expect(await svc("newsletter_begin_send", { _campaign_id: campaign, _expected_count: 2 })).toMatchObject({ result: "count_changed", current: 3 });
    expect((await q(`SELECT status FROM public.newsletter_campaigns WHERE id = $1`, [campaign]))[0].status).toBe("ready");
    expect((await q(`SELECT count(*)::int AS n FROM public.newsletter_deliveries`))[0].n).toBe(0);
  });

  it("starts, skips people who opted out meanwhile, retries transient failures, and completes", async () => {
    expect(await svc("newsletter_begin_send", { _campaign_id: campaign, _expected_count: 3 })).toMatchObject({ result: "started", queued: 3 });
    expect((await svc("newsletter_begin_send", { _campaign_id: campaign, _expected_count: 3 })).result).toBe("already_sending");
    await unsubscribe(s3, "one_click"); // opts out AFTER the campaign was queued

    const batch = await claim(campaign);
    expect(batch.map((b) => b.email).sort()).toEqual(["promo1@example.com", "promo2@example.com"]);
    const [d1, d2] = batch;
    await svc("newsletter_record_delivery", { _delivery_id: d1.delivery_id, _ok: true, _provider_message_id: "m1", _error_code: null, _retryable: false });
    await svc("newsletter_record_delivery", { _delivery_id: d2.delivery_id, _ok: false, _provider_message_id: null, _error_code: "http_429", _retryable: true });
    expect((await svc("newsletter_progress", { _campaign_id: campaign }))).toMatchObject({ queued: 1, sent: 1, skipped: 1 });

    const retry = await claim(campaign);
    expect(retry).toHaveLength(1);
    await svc("newsletter_record_delivery", { _delivery_id: retry[0].delivery_id, _ok: true, _provider_message_id: "m2", _error_code: null, _retryable: false });
    expect(await svc("newsletter_progress", { _campaign_id: campaign })).toMatchObject({ queued: 0, sending: 0, sent: 2, skipped: 1 });
    expect((await q(`SELECT status FROM public.newsletter_campaigns WHERE id = $1`, [campaign]))[0].status).toBe("sent");
    // a finished campaign hands out nothing, ever
    expect(await claim(campaign)).toHaveLength(0);
  });

  it("a delivery is recorded once per recipient per campaign", async () => {
    const dup = await rejected(() => db.query(`INSERT INTO public.newsletter_deliveries (campaign_id, subscription_id) VALUES ($1, $2)`, [campaign, s1]));
    expect(dup).toMatch(/duplicate key|unique/i);
  });

  it("a non-ready campaign cannot start", async () => {
    const d = await owner(async () => (await q(`SELECT public.admin_newsletter_save_campaign(NULL, 'draft only', 's', NULL, 'b', 'promotions') AS id`))[0].id);
    expect(await svc("newsletter_begin_send", { _campaign_id: d, _expected_count: 0 })).toMatchObject({ result: "not_ready", status: "draft" });
  });
});

describe("rollback", () => {
  it("removes everything the migration created", async () => {
    const fresh = await bootEmailDb();
    await fresh.exec(EMAIL1_ROLLBACK);
    const { rows } = await fresh.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND (c.relname LIKE 'email\\_%' OR c.relname LIKE 'newsletter\\_%')`);
    expect(rows[0].n).toBe(0);
    await fresh.close();
  });
});
