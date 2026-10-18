// @vitest-environment node
/** EMAIL1 — request handlers and the send pipeline, with injected database and provider. */
import { describe, expect, it, vi } from "vitest";
import {
  SIGNUP_INTENT_KEY, confirmWithToken, consumeSignupIntent, previewUnsubscribe, recipientLinks,
  requestSubscription, setTopics, unsubscribeSelf, unsubscribeWithToken, type Caller, type Db,
} from "../../../supabase/functions/_shared/newsletter/handlers";
import { loadConfig } from "../../../supabase/functions/_shared/newsletter/config";
import { disabledProvider, type EmailProvider, type OutboundEmail } from "../../../supabase/functions/_shared/newsletter/provider";
import { makeUnsubscribeToken, newConfirmationToken, sha256Hex } from "../../../supabase/functions/_shared/newsletter/tokens";
import { parsePreview, processBatch, startSend, testSend } from "../../../supabase/functions/_shared/newsletter/send";

const SECRET = "k".repeat(40);
const USER = "40000000-0000-4000-8000-000000000001";
const CAMPAIGN = "40000000-0000-4000-8000-0000000000c1";
const meta = { ip: "203.0.113.9", userAgent: "vitest" };
const env = (o: Record<string, string> = {}) => ({
  get: (n: string) => ({
    NEWSLETTER_TOKEN_SECRET: SECRET, NEWSLETTER_FROM: "Mogzy <hi@news.mogzy.lol>", NEWSLETTER_POSTAL_ADDRESS: "1 Main St",
    SUPABASE_URL: "https://proj.supabase.co", NEWSLETTER_SENDING_ENABLED: "true", ...o,
  } as Record<string, string>)[n],
});
const caller = (over: Partial<Caller> = {}): Caller => ({ id: USER, email: "me@example.com", isAnonymous: false, metadata: {}, ...over });

function fakeDb(handlers: Record<string, (args: any) => unknown>) {
  const calls: Array<{ fn: string; args: any }> = [];
  const db: Db = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const h = handlers[fn];
      if (!h) return { data: null, error: { message: `unexpected rpc ${fn}` } };
      try { return { data: h(args), error: null }; } catch (e) { return { data: null, error: { message: String(e) } }; }
    },
  };
  return { db, calls };
}
function fakeProvider(opts: { canSend?: boolean; fail?: (m: OutboundEmail) => { retryable: boolean; code: string } | null } = {}) {
  const sent: OutboundEmail[] = [];
  const provider: EmailProvider = {
    name: "fake", canSend: opts.canSend ?? true,
    async send(m) {
      const f = opts.fail?.(m);
      if (f) return { ok: false, ...f };
      sent.push(m);
      return { ok: true, id: `id_${sent.length}` };
    },
  };
  return { provider, sent };
}
const deps = (db: Db, provider: EmailProvider, e = env()) => ({ db, provider, cfg: loadConfig(e) });

describe("requestSubscription", () => {
  it("uses the ACCOUNT's email, never one from the client, and emails a confirmation link", async () => {
    const { db, calls } = fakeDb({ email_request_subscription: () => ({ result: "confirmation_required" }) });
    const { provider, sent } = fakeProvider();
    const r = await requestSubscription(deps(db, provider), caller(), ["daily_reminder"], "settings", meta);
    expect(r).toMatchObject({ status: 200, body: { result: "confirmation_required", email_sent: true } });
    expect(calls[0].args._email).toBe("me@example.com");
    expect(calls[0].args._user_id).toBe(USER);
    expect(calls[0].args._source).toBe("settings");
    expect(calls[0].args._consent_text).toContain("Daily Challenge");
    expect(calls[0].args._ip_hash).not.toContain("203.0.113.9");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("me@example.com");
    // The raw token is in the email; only its hash went to the database.
    const raw = /t=([A-Za-z0-9_-]{43})/.exec(sent[0].html)![1];
    expect(calls[0].args._token_hash).toBe(await sha256Hex(raw));
    expect(JSON.stringify(calls)).not.toContain(raw);
    expect(sent[0].html).toContain("https://mogzy.lol/email/confirm?t=");
  });

  it("refuses guests, accounts without an email and bad topics before touching the database", async () => {
    const { db, calls } = fakeDb({});
    const { provider } = fakeProvider();
    const d = deps(db, provider);
    expect((await requestSubscription(d, caller({ isAnonymous: true }), ["events"], "settings", meta)).status).toBe(403);
    expect((await requestSubscription(d, caller({ email: null }), ["events"], "settings", meta)).status).toBe(403);
    expect((await requestSubscription(d, caller(), ["events", "everything"], "settings", meta)).body).toEqual({ error: "invalid_topics" });
    expect((await requestSubscription(d, caller(), [], "settings", meta)).body).toEqual({ error: "invalid_topics" });
    expect((await requestSubscription(d, caller(), "events", "settings", meta)).body).toEqual({ error: "invalid_topics" });
    expect(calls).toHaveLength(0);
  });

  it("does not email when the database says throttled / suppressed / already subscribed", async () => {
    for (const result of ["throttled", "suppressed", "already_subscribed", "exists", "updated", "email_mismatch"]) {
      const { db } = fakeDb({ email_request_subscription: () => ({ result }) });
      const { provider, sent } = fakeProvider();
      const r = await requestSubscription(deps(db, provider), caller(), ["events"], "settings", meta);
      expect(r.body.result).toBe(result);
      expect(sent, result).toHaveLength(0);
    }
  });

  it("reports honestly when no provider is configured: pending is recorded, email_sent is false", async () => {
    const { db } = fakeDb({ email_request_subscription: () => ({ result: "confirmation_required" }) });
    const r = await requestSubscription(deps(db, disabledProvider), caller(), ["events"], "settings", meta);
    expect(r.body).toMatchObject({ result: "confirmation_required", email_sent: false, reason: "email_not_configured" });
  });

  it("reports a failed send instead of claiming success", async () => {
    const { db } = fakeDb({ email_request_subscription: () => ({ result: "confirmation_required" }) });
    const { provider } = fakeProvider({ fail: () => ({ retryable: true, code: "http_503" }) });
    const r = await requestSubscription(deps(db, provider), caller(), ["events"], "settings", meta);
    expect(r.body).toMatchObject({ email_sent: false, reason: "send_failed" });
  });

  it("fails closed without the token secret, and surfaces a database error as 500", async () => {
    const { db } = fakeDb({ email_request_subscription: () => ({ result: "confirmation_required" }) });
    const { provider } = fakeProvider();
    expect((await requestSubscription(deps(db, provider, env({ NEWSLETTER_TOKEN_SECRET: "" })), caller(), ["events"], "settings", meta)).status).toBe(503);
    const broken = fakeDb({});
    expect((await requestSubscription(deps(broken.db, provider), caller(), ["events"], "settings", meta)).status).toBe(500);
  });
});

describe("consumeSignupIntent", () => {
  const intent = (topics: unknown) => ({ [SIGNUP_INTENT_KEY]: { topics, v: 1 } });

  it("turns the signup checkbox into a PENDING request (source signup_intent) and clears the intent", async () => {
    const { db, calls } = fakeDb({ email_request_subscription: () => ({ result: "confirmation_required" }) });
    const { provider, sent } = fakeProvider();
    const clear = vi.fn(async () => {});
    const r = await consumeSignupIntent(deps(db, provider), caller({ metadata: intent(["daily_reminder", "events"]) }), meta, clear);
    expect(r.body.result).toBe("confirmation_required");
    expect(calls[0].args._source).toBe("signup_intent");
    expect(calls[0].args._topics).toEqual(["daily_reminder", "events"]);
    expect(sent).toHaveLength(1);
    expect(clear).toHaveBeenCalledOnce();
  });

  it("does nothing for an account that never ticked a box — existing users are untouched", async () => {
    const { db, calls } = fakeDb({});
    const { provider, sent } = fakeProvider();
    const clear = vi.fn(async () => {});
    for (const metadata of [{}, { display_name: "x" }, { [SIGNUP_INTENT_KEY]: null }, { [SIGNUP_INTENT_KEY]: "yes" }]) {
      expect((await consumeSignupIntent(deps(db, provider), caller({ metadata }), meta, clear)).body.result).toBe("no_intent");
    }
    expect(calls).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("will not honour topics a signup form may not offer (promotions) or unknown ones", async () => {
    const { db, calls } = fakeDb({ email_request_subscription: () => ({ result: "confirmation_required" }) });
    const { provider } = fakeProvider();
    const clear = vi.fn(async () => {});
    expect((await consumeSignupIntent(deps(db, provider), caller({ metadata: intent(["promotions"]) }), meta, clear)).body.result).toBe("no_intent");
    expect((await consumeSignupIntent(deps(db, provider), caller({ metadata: intent(["bogus"]) }), meta, clear)).body.result).toBe("no_intent");
    // A mixed list is rejected as a whole, not trimmed to its "valid" part.
    expect((await consumeSignupIntent(deps(db, provider), caller({ metadata: intent(["events", "promotions"]) }), meta, clear)).body.result).toBe("confirmation_required");
    expect(calls).toHaveLength(1);
    expect(calls[0].args._topics).toEqual(["events"]);
  });

  it("keeps the intent after a transient failure so the next load retries", async () => {
    const { db } = fakeDb({}); // every rpc errors
    const { provider } = fakeProvider();
    const clear = vi.fn(async () => {});
    const r = await consumeSignupIntent(deps(db, provider), caller({ metadata: intent(["events"]) }), meta, clear);
    expect(r.status).toBe(500);
    expect(clear).not.toHaveBeenCalled();
  });

  it("refuses guests", async () => {
    const { db } = fakeDb({});
    const { provider } = fakeProvider();
    const r = await consumeSignupIntent(deps(db, provider), caller({ isAnonymous: true, metadata: intent(["events"]) }), meta, async () => {});
    expect(r.status).toBe(403);
  });
});

describe("settings actions", () => {
  it("setTopics passes the account's own email and validates topics", async () => {
    const { db, calls } = fakeDb({ email_set_topics: () => ({ result: "updated", topics: ["events"] }) });
    const { provider } = fakeProvider();
    expect((await setTopics(deps(db, provider), caller(), ["events"], meta)).body).toEqual({ result: "updated", topics: ["events"] });
    expect(calls[0].args._email).toBe("me@example.com");
    expect((await setTopics(deps(db, provider), caller(), ["x"], meta)).body).toEqual({ error: "invalid_topics" });
    expect((await setTopics(deps(db, provider), caller({ isAnonymous: true }), ["events"], meta)).status).toBe(403);
  });

  it("unsubscribeSelf resolves the subscription from the ACCOUNT, not from client input", async () => {
    const SUB = "40000000-0000-4000-8000-0000000000a1";
    const { db, calls } = fakeDb({ email_find_subscription_id: () => SUB, email_unsubscribe: () => ({ result: "unsubscribed" }) });
    const { provider } = fakeProvider();
    expect((await unsubscribeSelf(deps(db, provider), caller(), meta)).body).toEqual({ result: "unsubscribed" });
    expect(calls[0].args).toEqual({ _user_id: USER, _email: "me@example.com" });
    expect(calls[1].args._subscription_id).toBe(SUB);
    expect(calls[1].args._source).toBe("settings");
    const none = fakeDb({ email_find_subscription_id: () => null });
    expect((await unsubscribeSelf(deps(none.db, provider), caller(), meta)).body).toEqual({ result: "not_subscribed" });
  });
});

describe("token-authorised actions", () => {
  it("confirm sends only the HASH of a well-formed token, and ignores malformed input without a query", async () => {
    const { token, tokenHash } = await newConfirmationToken();
    const { db, calls } = fakeDb({ email_confirm_subscription: () => ({ result: "confirmed", topics: ["events"], email_masked: "m***@example.com" }) });
    const { provider } = fakeProvider();
    expect((await confirmWithToken(deps(db, provider), token, meta)).body).toMatchObject({ result: "confirmed" });
    expect(calls[0].args._token_hash).toBe(tokenHash);
    for (const bad of ["", "abc", 5, null, "a".repeat(80)]) {
      expect((await confirmWithToken(deps(db, provider), bad, meta)).body).toEqual({ result: "invalid" });
    }
    expect(calls).toHaveLength(1);
  });

  it("unsubscribe requires a valid signed token; an invalid one never reaches the database", async () => {
    const SUB = "40000000-0000-4000-8000-0000000000a2";
    const { db, calls } = fakeDb({
      email_unsubscribe: () => ({ result: "unsubscribed", email_masked: "m***@example.com" }),
      email_unsubscribe_preview: () => ({ result: "ok", status: "subscribed", email_masked: "m***@example.com" }),
    });
    const { provider } = fakeProvider();
    const d = deps(db, provider);
    const good = await makeUnsubscribeToken(SUB, SECRET);
    expect((await unsubscribeWithToken(d, good, "one_click", meta)).body).toMatchObject({ result: "unsubscribed" });
    expect(calls[0].args).toMatchObject({ _subscription_id: SUB, _source: "one_click" });
    const forged = await makeUnsubscribeToken(SUB, "z".repeat(40));
    for (const bad of [forged, "u1.x.y", "", null, `${good}x`]) {
      expect((await unsubscribeWithToken(d, bad, "unsubscribe_link", meta)).body).toEqual({ result: "invalid" });
      expect((await previewUnsubscribe(d, bad)).body).toEqual({ result: "invalid" });
    }
    expect(calls).toHaveLength(1);
    expect((await previewUnsubscribe(d, good)).body).toMatchObject({ result: "ok", email_masked: "m***@example.com" });
  });

  it("fails closed (503) without the token secret", async () => {
    const { db } = fakeDb({});
    const { provider } = fakeProvider();
    expect((await unsubscribeWithToken(deps(db, provider, env({ NEWSLETTER_TOKEN_SECRET: "" })), "u1.a.b", "one_click", meta)).status).toBe(503);
  });
});

describe("campaign sending", () => {
  const campaign = { id: CAMPAIGN, name: "n", subject: "Big news", preheader: null, body_markdown: "Hello **there**", topic: "product_news", status: "sending", approved_recipient_count: 2 };
  const S1 = "40000000-0000-4000-8000-0000000000b1";
  const S2 = "40000000-0000-4000-8000-0000000000b2";

  it("parsePreview enforces the same bounds as the database", () => {
    const ok = { subject: "S", preheader: null, body_markdown: "B", topic: "events" };
    expect(parsePreview(ok)).toMatchObject({ ok: true });
    for (const bad of [
      { ...ok, subject: "" }, { ...ok, subject: "x".repeat(151) }, { ...ok, subject: "a\nBcc: evil@example.com" },
      { ...ok, preheader: "x".repeat(201) }, { ...ok, body_markdown: "  " }, { ...ok, body_markdown: "x".repeat(20_001) }, { ...ok, topic: "spam" },
    ]) expect(parsePreview(bad as never), JSON.stringify(bad).slice(0, 60)).toMatchObject({ ok: false });
  });

  it("the kill-switch blocks start and batch even for a ready campaign and a configured provider", async () => {
    const { db, calls } = fakeDb({});
    const { provider, sent } = fakeProvider();
    const off = deps(db, provider, env({ NEWSLETTER_SENDING_ENABLED: "false" }));
    expect((await startSend(off, CAMPAIGN, 2, "SEND 2")).body).toEqual({ error: "sending_disabled" });
    expect((await processBatch(off, CAMPAIGN)).body).toEqual({ error: "sending_disabled" });
    const noProvider = deps(db, disabledProvider);
    expect((await startSend(noProvider, CAMPAIGN, 2, "SEND 2")).body).toEqual({ error: "provider_not_configured" });
    expect(calls).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("start requires the typed confirmation that names the recipient count", async () => {
    const { db, calls } = fakeDb({});
    const { provider } = fakeProvider();
    const d = deps(db, provider);
    for (const confirm of [undefined, "", "SEND", "send 2", "SEND 3", "SEND 2 "]) {
      expect((await startSend(d, CAMPAIGN, 2, confirm)).body, String(confirm)).toEqual({ error: "confirmation_mismatch" });
    }
    expect((await startSend(d, "nope", 2, "SEND 2")).body).toEqual({ error: "invalid_campaign" });
    expect((await startSend(d, CAMPAIGN, -1, "SEND -1")).body).toEqual({ error: "invalid_count" });
    expect((await startSend(d, CAMPAIGN, "2", "SEND 2")).body).toEqual({ error: "invalid_count" });
    expect(calls).toHaveLength(0);
  });

  it("start surfaces a changed audience / non-ready campaign as 409 and sends nothing", async () => {
    for (const r of [{ result: "count_changed", current: 5 }, { result: "not_ready", status: "draft" }, { result: "not_found" }]) {
      const { db } = fakeDb({ newsletter_begin_send: () => r });
      const { provider, sent } = fakeProvider();
      const out = await startSend(deps(db, provider), CAMPAIGN, 2, "SEND 2");
      expect(out.status).toBe(409);
      expect(out.body.error).toBe(r.result);
      expect(sent).toHaveLength(0);
    }
  });

  it("sends one message per recipient, each with its OWN one-click header, unsubscribe link and idempotency key", async () => {
    const delivered: Array<{ id: number; ok: boolean }> = [];
    const { db } = fakeDb({
      newsletter_begin_send: () => ({ result: "started", queued: 2 }),
      newsletter_load_campaign: () => campaign,
      newsletter_claim_batch: () => [
        { delivery_id: 1, subscription_id: S1, email: "one@example.com" },
        { delivery_id: 2, subscription_id: S2, email: "two@example.com" },
      ],
      newsletter_record_delivery: (a) => { delivered.push({ id: a._delivery_id, ok: a._ok }); },
      newsletter_progress: () => ({ queued: 0, sending: 0, sent: 2, failed: 0, skipped: 0 }),
    });
    const { provider, sent } = fakeProvider();
    const r = await startSend(deps(db, provider), CAMPAIGN, 2, "SEND 2");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ started: true, processed: 2 });
    expect(sent.map((m) => m.to)).toEqual(["one@example.com", "two@example.com"]);
    for (const [m, sub] of [[sent[0], S1], [sent[1], S2]] as const) {
      const token = await makeUnsubscribeToken(sub, SECRET);
      expect(m.html).toContain(`/email/unsubscribe?t=${encodeURIComponent(token)}`);
      expect(m.text).toContain(token);
      expect(m.headers!["List-Unsubscribe"]).toBe(`<https://proj.supabase.co/functions/v1/email-link?a=unsubscribe&t=${encodeURIComponent(token)}>`);
      expect(m.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(m.idempotencyKey).toBe(`campaign:${CAMPAIGN}:${sub}`);
      expect(m.html).toContain("1 Main St");
    }
    expect(delivered.sort((a, b) => a.id - b.id)).toEqual([{ id: 1, ok: true }, { id: 2, ok: true }]);
  });

  it("records failures with their retryability and keeps going", async () => {
    const recorded: any[] = [];
    const { db } = fakeDb({
      newsletter_load_campaign: () => campaign,
      newsletter_claim_batch: () => [
        { delivery_id: 1, subscription_id: S1, email: "bad@example.com" },
        { delivery_id: 2, subscription_id: S2, email: "good@example.com" },
      ],
      newsletter_record_delivery: (a) => { recorded.push(a); },
      newsletter_progress: () => ({}),
    });
    const { provider, sent } = fakeProvider({ fail: (m) => (m.to === "bad@example.com" ? { retryable: true, code: "http_429" } : null) });
    await processBatch(deps(db, provider), CAMPAIGN);
    expect(sent.map((m) => m.to)).toEqual(["good@example.com"]);
    expect(recorded.find((r) => r._delivery_id === 1)).toMatchObject({ _ok: false, _retryable: true, _error_code: "http_429" });
    expect(recorded.find((r) => r._delivery_id === 2)).toMatchObject({ _ok: true });
  });

  it("does nothing for a campaign that is not in the sending state", async () => {
    const { db, calls } = fakeDb({ newsletter_load_campaign: () => ({ ...campaign, status: "draft" }) });
    const { provider, sent } = fakeProvider();
    expect((await processBatch(deps(db, provider), CAMPAIGN)).body).toEqual({ result: "not_sending", status: "draft" });
    expect(sent).toHaveLength(0);
    expect(calls.map((c) => c.fn)).toEqual(["newsletter_load_campaign"]);
  });

  it("test-send goes to the owner's own address only, tagged [TEST], and is not gated by the kill-switch", async () => {
    const { db } = fakeDb({ newsletter_load_campaign: () => campaign });
    const { provider, sent } = fakeProvider();
    const off = deps(db, provider, env({ NEWSLETTER_SENDING_ENABLED: "false" }));
    expect((await testSend(off, CAMPAIGN, "owner@example.com")).body).toEqual({ result: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("owner@example.com");
    expect(sent[0].subject).toBe("[TEST] Big news");
    expect(sent[0].headers).toBeUndefined(); // no one-click header: there is no subscription to act on
    expect((await testSend(off, CAMPAIGN, null)).body).toEqual({ error: "owner_email_missing" });
    expect((await testSend(deps(db, disabledProvider), CAMPAIGN, "o@example.com")).status).toBe(409);
  });

  it("recipientLinks builds absolute, token-bearing URLs", async () => {
    const links = await recipientLinks(loadConfig(env()), S1);
    expect(links.oneClickUrl).toMatch(/^https:\/\/proj\.supabase\.co\/functions\/v1\/email-link\?a=unsubscribe&t=u1\./);
    expect(links.unsubscribeUrl).toMatch(/^https:\/\/mogzy\.lol\/email\/unsubscribe\?t=u1\./);
    expect(links.preferencesUrl).toBe("https://mogzy.lol/settings#email-preferences");
  });
});
