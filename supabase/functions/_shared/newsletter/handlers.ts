// EMAIL1 — request handlers with injected dependencies (database RPC, email
// provider, config). The index.ts files only authenticate and wire these up, so
// the behaviour that matters is unit-testable without Deno or a network.

import {
  CONFIRMATION_TTL_HOURS, hashIp, isUuid, looksLikeConfirmationToken, makeUnsubscribeToken,
  newConfirmationToken, sha256Hex, verifyUnsubscribeToken,
} from "./tokens.ts";
import { CONSENT_TEXT, CONSENT_VERSION, SIGNUP_TOPIC_GROUPS, parseTopics, type EmailTopic } from "./topics.ts";
import { renderConfirmation } from "./render.ts";
import type { EmailProvider } from "./provider.ts";
import type { NewsletterConfig } from "./config.ts";

export interface Db {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: any; error: { message: string } | null }>;
}

export interface Deps {
  db: Db;
  provider: EmailProvider;
  cfg: NewsletterConfig;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

export interface Caller {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  /** auth user_metadata — user-writable, so only ever read as an INTENT. */
  metadata: Record<string, unknown>;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

const bad = (code: string, status = 400): Reply => ({ status, body: { error: code } });
const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });

/** Account metadata key a signup form leaves for the post-signup consumer. */
export const SIGNUP_INTENT_KEY = "email_opt_in_intent";

const SIGNUP_ALLOWED: ReadonlySet<EmailTopic> = new Set<EmailTopic>(
  Object.values(SIGNUP_TOPIC_GROUPS).flat(),
);

function requirePermanent(caller: Caller): Reply | null {
  if (caller.isAnonymous || !caller.email) return bad("account_required", 403);
  return null;
}

async function pseudonym(deps: Deps, meta: RequestMeta): Promise<string | null> {
  return deps.cfg.tokenSecret ? await hashIp(meta.ip, deps.cfg.tokenSecret) : null;
}

/**
 * Ask to subscribe: record a PENDING request and email the confirmation link.
 * The address is always the account's own — it is never taken from the client.
 */
export async function requestSubscription(
  deps: Deps, caller: Caller, rawTopics: unknown,
  source: "settings" | "signup_intent", meta: RequestMeta,
): Promise<Reply> {
  const denied = requirePermanent(caller);
  if (denied) return denied;
  const topics = parseTopics(rawTopics);
  if (!topics || topics.length === 0) return bad("invalid_topics");
  if (!deps.cfg.tokenSecret) return bad("not_configured", 503);

  const { token, tokenHash } = await newConfirmationToken();
  const consentText = topics.map((t) => CONSENT_TEXT[CONSENT_VERSION][t]).join(" ");
  const { data, error } = await deps.db.rpc("email_request_subscription", {
    _user_id: caller.id, _email: caller.email, _topics: topics, _source: source,
    _consent_version: CONSENT_VERSION, _consent_text: consentText,
    _ip_hash: await pseudonym(deps, meta), _user_agent: meta.userAgent,
    _token_hash: tokenHash, _ttl_hours: CONFIRMATION_TTL_HOURS,
  });
  if (error) return bad("request_failed", 500);
  const result = String(data?.result ?? "");
  if (result !== "confirmation_required") return ok({ result, topics: data?.topics ?? undefined, status: data?.status });

  // Pending is recorded either way; whether the email left the building is
  // reported honestly so the UI never claims "check your inbox" when it was not sent.
  if (!deps.provider.canSend || !deps.cfg.from) {
    return ok({ result, email_sent: false, reason: "email_not_configured", topics });
  }
  const msg = renderConfirmation({
    siteName: deps.cfg.siteName, siteUrl: deps.cfg.siteUrl, topics,
    confirmUrl: `${deps.cfg.siteUrl}/email/confirm?t=${encodeURIComponent(token)}`,
    ttlHours: CONFIRMATION_TTL_HOURS,
  });
  const sent = await deps.provider.send({
    from: deps.cfg.from, to: caller.email!, subject: "Confirm your Mogzy email preferences",
    html: msg.html, text: msg.text, replyTo: deps.cfg.replyTo ?? undefined,
    idempotencyKey: `confirm:${tokenHash}`, tags: [{ name: "kind", value: "confirmation" }],
  });
  return ok({ result, email_sent: sent.ok, topics, ...(sent.ok ? {} : { reason: "send_failed" }) });
}

/**
 * After signup: turn the account-metadata INTENT left by the signup checkbox
 * into a pending request. The topics come from the server's reading of the
 * metadata (restricted to the topics a signup form may offer), the intent is
 * cleared afterwards, and an existing subscription state always wins.
 */
export async function consumeSignupIntent(
  deps: Deps, caller: Caller, meta: RequestMeta,
  clearIntent: (userId: string, metadata: Record<string, unknown>) => Promise<void>,
): Promise<Reply> {
  const denied = requirePermanent(caller);
  if (denied) return denied;
  const intent = caller.metadata[SIGNUP_INTENT_KEY] as { topics?: unknown } | null | undefined;
  if (!intent || typeof intent !== "object") return ok({ result: "no_intent" });
  const topics = parseTopics(intent.topics)?.filter((t) => SIGNUP_ALLOWED.has(t)) ?? [];
  let reply: Reply;
  if (topics.length === 0) {
    reply = ok({ result: "no_intent" });
  } else {
    reply = await requestSubscription(deps, caller, topics, "signup_intent", meta);
    // A transient failure keeps the intent so the next load retries it.
    if (reply.status >= 500) return reply;
  }
  await clearIntent(caller.id, caller.metadata);
  return reply;
}

export async function setTopics(deps: Deps, caller: Caller, rawTopics: unknown, meta: RequestMeta): Promise<Reply> {
  const denied = requirePermanent(caller);
  if (denied) return denied;
  const topics = parseTopics(rawTopics);
  if (!topics) return bad("invalid_topics");
  const { data, error } = await deps.db.rpc("email_set_topics", {
    _user_id: caller.id, _email: caller.email, _topics: topics,
    _ip_hash: await pseudonym(deps, meta), _user_agent: meta.userAgent,
  });
  if (error) return bad("request_failed", 500);
  return ok({ result: data?.result, topics: data?.topics });
}

export async function unsubscribeSelf(deps: Deps, caller: Caller, meta: RequestMeta): Promise<Reply> {
  const denied = requirePermanent(caller);
  if (denied) return denied;
  // Resolved by the account's own mailbox, never by a client-supplied id.
  const found = await deps.db.rpc("email_find_subscription_id", { _user_id: caller.id, _email: caller.email });
  const id = found.data;
  if (found.error) return bad("request_failed", 500);
  if (!isUuid(id)) return ok({ result: "not_subscribed" });
  const { data, error } = await deps.db.rpc("email_unsubscribe", {
    _subscription_id: id, _source: "settings", _ip_hash: await pseudonym(deps, meta), _user_agent: meta.userAgent,
  });
  if (error) return bad("request_failed", 500);
  return ok({ result: data?.result });
}

// --- public, token-authorised ----------------------------------------------

export async function confirmWithToken(deps: Deps, token: unknown, meta: RequestMeta): Promise<Reply> {
  if (!looksLikeConfirmationToken(token)) return ok({ result: "invalid" });
  const { data, error } = await deps.db.rpc("email_confirm_subscription", {
    _token_hash: await sha256Hex(token), _ip_hash: await pseudonym(deps, meta), _user_agent: meta.userAgent,
  });
  if (error) return bad("request_failed", 500);
  return ok({ result: data?.result ?? "invalid", topics: data?.topics, email_masked: data?.email_masked });
}

export async function previewUnsubscribe(deps: Deps, token: unknown): Promise<Reply> {
  if (!deps.cfg.tokenSecret) return bad("not_configured", 503);
  const id = await verifyUnsubscribeToken(token, deps.cfg.tokenSecret);
  if (!id) return ok({ result: "invalid" });
  const { data, error } = await deps.db.rpc("email_unsubscribe_preview", { _subscription_id: id });
  if (error) return bad("request_failed", 500);
  return ok({ result: data?.result === "ok" ? "ok" : "invalid", status: data?.status, email_masked: data?.email_masked });
}

export async function unsubscribeWithToken(
  deps: Deps, token: unknown, source: "unsubscribe_link" | "one_click", meta: RequestMeta,
): Promise<Reply> {
  if (!deps.cfg.tokenSecret) return bad("not_configured", 503);
  const id = await verifyUnsubscribeToken(token, deps.cfg.tokenSecret);
  if (!id) return ok({ result: "invalid" });
  const { data, error } = await deps.db.rpc("email_unsubscribe", {
    _subscription_id: id, _source: source, _ip_hash: await pseudonym(deps, meta), _user_agent: meta.userAgent,
  });
  if (error) return bad("request_failed", 500);
  return ok({ result: data?.result === "not_found" ? "invalid" : data?.result, email_masked: data?.email_masked });
}

/** Absolute URLs a campaign carries for one subscriber. */
export async function recipientLinks(cfg: NewsletterConfig, subscriptionId: string) {
  const token = await makeUnsubscribeToken(subscriptionId, cfg.tokenSecret!);
  return {
    // POSTed by mail clients for RFC 8058 one-click.
    oneClickUrl: `${cfg.functionsUrl}/email-link?a=unsubscribe&t=${encodeURIComponent(token)}`,
    // A human opens this: a page with an explicit button.
    unsubscribeUrl: `${cfg.siteUrl}/email/unsubscribe?t=${encodeURIComponent(token)}`,
    preferencesUrl: `${cfg.siteUrl}/settings#email-preferences`,
  };
}
