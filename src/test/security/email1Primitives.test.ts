// @vitest-environment node
/** EMAIL1 — tokens, topics, rendering, provider adapter, webhook verification, config. */
import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_TTL_HOURS, hashIp, looksLikeConfirmationToken, makeUnsubscribeToken, newConfirmationToken,
  randomToken, sha256Hex, timingSafeEqual, verifyUnsubscribeToken,
} from "../../../supabase/functions/_shared/newsletter/tokens";
import { CONSENT_TEXT, CONSENT_VERSION, EMAIL_TOPICS, SIGNUP_TOPIC_GROUPS, parseTopics } from "../../../supabase/functions/_shared/newsletter/topics";
import {
  escapeHtml, isSafeHttpsUrl, renderCampaign, renderConfirmation, renderMarkdown,
} from "../../../supabase/functions/_shared/newsletter/render";
import {
  createResendProvider, disabledProvider, listUnsubscribeHeaders, selectProvider,
} from "../../../supabase/functions/_shared/newsletter/provider";
import { suppressionFromEvent, verifySvixSignature } from "../../../supabase/functions/_shared/newsletter/webhook";
import { loadConfig, sendBlocker } from "../../../supabase/functions/_shared/newsletter/config";

const SECRET = "s".repeat(40);
const SUB = "30000000-0000-4000-8000-000000000001";

describe("topics", () => {
  it("accepts known topics, dedupes, canonicalises", () => {
    expect(parseTopics(["events", "daily_reminder", "events"])).toEqual(["daily_reminder", "events"]);
  });
  it("rejects anything unknown, mistyped or oversized rather than dropping it", () => {
    for (const bad of [["nope"], ["events", "nope"], "events", null, undefined, [1], [{}], Array(20).fill("events")]) {
      expect(parseTopics(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it("every topic has consent wording under the current version, and promotions are never a signup checkbox", () => {
    for (const t of EMAIL_TOPICS) expect(CONSENT_TEXT[CONSENT_VERSION][t]).toBeTruthy();
    expect(Object.values(SIGNUP_TOPIC_GROUPS).flat()).not.toContain("promotions");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips and is bound to the subscription", async () => {
    const t = await makeUnsubscribeToken(SUB, SECRET);
    expect(await verifyUnsubscribeToken(t, SECRET)).toBe(SUB);
  });
  it("rejects tampering, another secret, another id, junk and wrong types", async () => {
    const t = await makeUnsubscribeToken(SUB, SECRET);
    const [v, id, sig] = t.split(".");
    const other = "30000000-0000-4000-8000-000000000002";
    for (const bad of [
      `${v}.${other}.${sig}`, `${v}.${id}.${sig.slice(0, -2)}AA`, `x1.${id}.${sig}`, `${v}.${id}`, "", "u1..", "u1.not-a-uuid.sig",
      null, undefined, 42, {}, "u1." + "a".repeat(500),
    ]) {
      expect(await verifyUnsubscribeToken(bad, SECRET), String(bad)).toBeNull();
    }
    expect(await verifyUnsubscribeToken(t, "x".repeat(40))).toBeNull();
  });
  it("refuses to mint or verify with a missing or short secret", async () => {
    await expect(makeUnsubscribeToken(SUB, "short")).rejects.toThrow("newsletter_secret_not_configured");
    await expect(verifyUnsubscribeToken("u1.a.b", "")).rejects.toThrow("newsletter_secret_not_configured");
    await expect(makeUnsubscribeToken("nope", SECRET)).rejects.toThrow();
  });
  it("normalises the id case", async () => {
    const t = await makeUnsubscribeToken(SUB.toUpperCase(), SECRET);
    expect(await verifyUnsubscribeToken(t, SECRET)).toBe(SUB);
  });
});

describe("confirmation tokens and helpers", () => {
  it("are 256-bit, unique, and only their hash is derivable for storage", async () => {
    const a = await newConfirmationToken();
    const b = await newConfirmationToken();
    expect(a.token).not.toBe(b.token);
    expect(looksLikeConfirmationToken(a.token)).toBe(true);
    expect(a.tokenHash).toBe(await sha256Hex(a.token));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).not.toContain(a.token);
    expect(CONFIRMATION_TTL_HOURS).toBeLessThanOrEqual(168);
  });
  it("rejects malformed confirmation tokens before touching the database", () => {
    for (const bad of ["", "short", "a".repeat(44), "a".repeat(42) + "!", null, 5, "a b".padEnd(43, "a")]) {
      expect(looksLikeConfirmationToken(bad)).toBe(false);
    }
    expect(randomToken(32)).toHaveLength(43);
  });
  it("timingSafeEqual and hashIp behave", async () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(await hashIp("1.2.3.4", SECRET)).toBe(await hashIp("1.2.3.4", SECRET));
    expect(await hashIp("1.2.3.4", SECRET)).not.toContain("1.2.3.4");
    expect(await hashIp("", SECRET)).toBeNull();
  });
});

describe("rendering", () => {
  const base = {
    subject: "Hi", preheader: "pre", topic: "events" as const, siteName: "Mogzy", siteUrl: "https://mogzy.lol",
    postalAddress: "1 Main St\nTown", unsubscribeUrl: "https://mogzy.lol/email/unsubscribe?t=X", preferencesUrl: "https://mogzy.lol/settings",
  };

  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<script>alert("x")&'</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;&lt;/script&gt;");
  });

  it("cannot inject markup or scripts through the body, subject, preheader or address", () => {
    const evil = `<img src=x onerror=alert(1)> <script>alert(1)</script> [x](javascript:alert(1)) [y](https://a.example/"onmouseover="alert(1)) **<b>**`;
    const { html } = renderCampaign({ ...base, subject: evil, preheader: evil, bodyMarkdown: evil, postalAddress: evil });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    // "javascript:" may survive as inert, escaped TEXT; it must never be a URL.
    expect(html).not.toMatch(/(href|src|action)\s*=\s*["']?\s*javascript:/i);
    // No real element may carry an event-handler attribute (escaped text is fine).
    expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
    expect((html.match(/<a /g) ?? []).length).toBe(3); // unsubscribe, preferences, and the one legitimate https link
  });

  it("links: https only, rendered as anchors; other schemes stay inert text", () => {
    const html = renderMarkdown("[ok](https://mogzy.lol/a?b=1&c=2) [no](http://x.example) [no2](mailto:a@b.c) [no3](//evil.example)");
    expect(html).toContain('<a href="https://mogzy.lol/a?b=1&amp;c=2"');
    expect(html).not.toMatch(/href="http:/);
    expect(html).not.toMatch(/href="mailto:/);
    expect(html).not.toMatch(/href="\/\//);
    expect(isSafeHttpsUrl("https://u:p@x.example")).toBe(false);
    expect(isSafeHttpsUrl("https://x.example/a b")).toBe(false);
    expect(isSafeHttpsUrl("https://x.example/ok")).toBe(true);
  });

  it("supports headings, lists, bold, italics and paragraphs", () => {
    const html = renderMarkdown("# Title\n\nHello **world** and *you*.\n\n- one\n- two");
    expect(html).toMatch(/<h2[^>]*>Title<\/h2>/);
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("<em>you</em>");
    expect(html).toMatch(/<ul[^>]*><li[^>]*>one<\/li><li[^>]*>two<\/li><\/ul>/);
  });

  it("every campaign carries an unsubscribe link, a preferences link and the postal address — the author cannot remove them", () => {
    const { html, text } = renderCampaign({ ...base, bodyMarkdown: "Body" });
    for (const out of [html, text]) {
      expect(out).toContain("https://mogzy.lol/email/unsubscribe?t=X");
      expect(out).toContain("https://mogzy.lol/settings");
      expect(out).toContain("1 Main St");
    }
    expect(html).toContain("Unsubscribe");
  });

  it("a preview without a configured address says so rather than inventing one", () => {
    expect(renderCampaign({ ...base, postalAddress: null, bodyMarkdown: "x" }).html).toContain("postal address not configured");
  });

  it("the confirmation email names the topics, the link and the ignore-me promise", () => {
    const { html, text } = renderConfirmation({ siteName: "Mogzy", siteUrl: "https://mogzy.lol", topics: ["daily_reminder"], confirmUrl: "https://mogzy.lol/email/confirm?t=abc", ttlHours: 72 });
    expect(html).toContain("Daily Challenge reminders");
    expect(html).toContain("https://mogzy.lol/email/confirm?t=abc");
    expect(text).toMatch(/ignore this email/i);
    expect(text).toMatch(/nothing happens until you confirm/i);
  });
});

describe("resend provider", () => {
  const msg = {
    from: "Mogzy <hi@news.example.com>", to: "a@b.c", subject: "S", html: "<p>h</p>", text: "t",
    headers: listUnsubscribeHeaders("https://f.example/email-link?a=unsubscribe&t=1"), idempotencyKey: "campaign:1:2",
    tags: [{ name: "kind", value: "campaign" }],
  };
  const fakeFetch = (status: number, body: unknown = { id: "re_1" }) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const f = async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
    return { f, calls };
  };

  it("sends the documented request, with one-click headers and an idempotency key", async () => {
    const { f, calls } = fakeFetch(200);
    const r = await createResendProvider("re_key", f).send(msg);
    expect(r).toEqual({ ok: true, id: "re_1" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer re_key");
    expect(h["Idempotency-Key"]).toBe("campaign:1:2");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.to).toEqual(["a@b.c"]);
    expect(body.headers["List-Unsubscribe"]).toBe("<https://f.example/email-link?a=unsubscribe&t=1>");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("classifies failures: 429/5xx/network are retryable, other 4xx are not", async () => {
    expect(await createResendProvider("k", fakeFetch(429, {}).f).send(msg)).toMatchObject({ ok: false, retryable: true });
    expect(await createResendProvider("k", fakeFetch(503, {}).f).send(msg)).toMatchObject({ ok: false, retryable: true });
    expect(await createResendProvider("k", fakeFetch(422, {}).f).send(msg)).toMatchObject({ ok: false, retryable: false, code: "http_422" });
    const boom = async () => { throw new Error("net"); };
    expect(await createResendProvider("k", boom as never).send(msg)).toMatchObject({ ok: false, retryable: true, code: "network_error" });
  });

  it("is disabled unless explicitly selected AND keyed; unknown values fail closed", async () => {
    const env = (o: Record<string, string>) => ({ get: (n: string) => o[n] });
    expect(selectProvider(env({}))).toBe(disabledProvider);
    expect(selectProvider(env({ NEWSLETTER_EMAIL_PROVIDER: "resend" }))).toBe(disabledProvider);
    expect(selectProvider(env({ NEWSLETTER_EMAIL_PROVIDER: "sendgrid", RESEND_API_KEY: "k" }))).toBe(disabledProvider);
    expect(selectProvider(env({ NEWSLETTER_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k" })).canSend).toBe(true);
    expect(await disabledProvider.send(msg)).toEqual({ ok: false, retryable: false, code: "provider_disabled" });
  });
});

describe("provider webhook", () => {
  const whsec = "whsec_" + btoa("0123456789abcdef0123456789abcdef");
  async function sign(id: string, ts: string, body: string) {
    const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(whsec.slice(6)), (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
    return "v1," + btoa(String.fromCharCode(...sig));
  }
  const now = 1_800_000_000;

  it("accepts a correct signature (also among several) and rejects everything else", async () => {
    const body = '{"type":"email.bounced"}';
    const good = await sign("msg_1", String(now), body);
    const h = (signature: string | null, id: string | null = "msg_1", timestamp: string | null = String(now)) => ({ id, timestamp, signature });
    expect(await verifySvixSignature(whsec, body, h(good), now)).toBe(true);
    expect(await verifySvixSignature(whsec, body, h(`v1,AAAA ${good}`), now)).toBe(true);
    expect(await verifySvixSignature(whsec, body + " ", h(good), now)).toBe(false); // body changed
    expect(await verifySvixSignature(whsec, body, h(good, "msg_2"), now)).toBe(false);
    expect(await verifySvixSignature(whsec, body, h("v1,AAAA"), now)).toBe(false);
    expect(await verifySvixSignature(whsec, body, h(null), now)).toBe(false);
    expect(await verifySvixSignature("", body, h(good), now)).toBe(false);
    expect(await verifySvixSignature("whsec_" + btoa("different-secret-different-secret-xx"), body, h(good), now)).toBe(false);
    expect(await verifySvixSignature(whsec, body, h(good, "msg_1", "notanumber"), now)).toBe(false);
  });

  it("rejects a replay outside the 5-minute window", async () => {
    const body = "{}";
    const sig = await sign("m", String(now), body);
    expect(await verifySvixSignature(whsec, body, { id: "m", timestamp: String(now), signature: sig }, now + 299)).toBe(true);
    expect(await verifySvixSignature(whsec, body, { id: "m", timestamp: String(now), signature: sig }, now + 301)).toBe(false);
    expect(await verifySvixSignature(whsec, body, { id: "m", timestamp: String(now), signature: sig }, now - 301)).toBe(false);
  });

  it("maps only permanent bounces and complaints to suppressions", () => {
    const ev = (type: string, extra: object = {}, to: unknown = ["Ann@Example.com"]) => ({ type, data: { to, ...extra } });
    expect(suppressionFromEvent("e1", ev("email.complained"))).toEqual({ eventId: "e1", email: "ann@example.com", reason: "complaint" });
    expect(suppressionFromEvent("e2", ev("email.bounced", { bounce: { type: "Permanent" } }))).toMatchObject({ reason: "hard_bounce" });
    expect(suppressionFromEvent("e3", ev("email.bounced", { bounce: { type: "Transient" } }))).toBeNull();
    expect(suppressionFromEvent("e4", ev("email.delivered"))).toBeNull();
    expect(suppressionFromEvent(null, ev("email.complained"))).toBeNull();
    expect(suppressionFromEvent("e5", ev("email.complained", {}, []))).toBeNull();
    expect(suppressionFromEvent("e6", ev("email.complained", {}, "Bob <bob@example.com>"))).toMatchObject({ email: "bob@example.com" });
    expect(suppressionFromEvent("e7", null)).toBeNull();
  });
});

describe("config and the send kill-switch", () => {
  const env = (o: Record<string, string>) => ({ get: (n: string) => o[n] });
  const full = {
    NEWSLETTER_TOKEN_SECRET: SECRET, NEWSLETTER_FROM: "Mogzy <hi@news.mogzy.lol>", NEWSLETTER_POSTAL_ADDRESS: "1 Main St",
    SUPABASE_URL: "https://x.supabase.co", NEWSLETTER_SENDING_ENABLED: "true",
  };

  it("ships OFF: nothing configured means no sending", () => {
    const cfg = loadConfig(env({}));
    expect(cfg.sendingEnabled).toBe(false);
    expect(sendBlocker(cfg, true)).toBe("sending_disabled");
    expect(cfg.siteUrl).toBe("https://mogzy.lol");
  });

  it("only the exact string 'true' enables sending", () => {
    for (const v of ["1", "yes", "TRUE", "true ", "on", ""]) {
      expect(loadConfig(env({ ...full, NEWSLETTER_SENDING_ENABLED: v })).sendingEnabled, v).toBe(false);
    }
    expect(loadConfig(env(full)).sendingEnabled).toBe(true);
  });

  it("reports the first missing prerequisite", () => {
    expect(sendBlocker(loadConfig(env(full)), false)).toBe("provider_not_configured");
    expect(sendBlocker(loadConfig(env({ ...full, NEWSLETTER_TOKEN_SECRET: "short" })), true)).toBe("token_secret_missing");
    expect(sendBlocker(loadConfig(env({ ...full, NEWSLETTER_FROM: "" })), true)).toBe("from_address_missing");
    expect(sendBlocker(loadConfig(env({ ...full, NEWSLETTER_POSTAL_ADDRESS: " " })), true)).toBe("postal_address_missing");
    expect(sendBlocker(loadConfig(env({ ...full, SUPABASE_URL: "" })), true)).toBe("functions_url_missing");
    expect(sendBlocker(loadConfig(env(full)), true)).toBeNull();
  });
});
