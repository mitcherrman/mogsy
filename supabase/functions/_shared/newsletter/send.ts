// EMAIL1 — campaign preview, owner test-send and the batched real send.
// Dependencies are injected so the safety properties (kill-switch, count
// confirmation, per-recipient unsubscribe link, no double send) are testable.

import type { Db, Reply } from "./handlers.ts";
import { recipientLinks } from "./handlers.ts";
import { sendBlocker, type NewsletterConfig } from "./config.ts";
import { listUnsubscribeHeaders, type EmailProvider } from "./provider.ts";
import {
  MAX_BODY_LENGTH, MAX_PREHEADER_LENGTH, MAX_SUBJECT_LENGTH, renderCampaign, type RenderedMessage,
} from "./render.ts";
import { isEmailTopic, type EmailTopic } from "./topics.ts";
import { isUuid } from "./tokens.ts";

export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  body_markdown: string;
  topic: EmailTopic;
  status: string;
  approved_recipient_count: number | null;
}

export interface SendDeps {
  db: Db;
  provider: EmailProvider;
  cfg: NewsletterConfig;
}

const bad = (code: string, status = 400): Reply => ({ status, body: { error: code } });
const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });

export interface PreviewInput {
  subject: unknown;
  preheader: unknown;
  body_markdown: unknown;
  topic: unknown;
}

/** Validate untrusted preview input; the same bounds the database enforces. */
export function parsePreview(i: PreviewInput):
  | { ok: true; subject: string; preheader: string | null; body: string; topic: EmailTopic }
  | { ok: false; error: string } {
  if (typeof i.subject !== "string" || !i.subject.trim() || i.subject.length > MAX_SUBJECT_LENGTH) return { ok: false, error: "invalid_subject" };
  if (i.subject.includes("\n") || i.subject.includes("\r")) return { ok: false, error: "invalid_subject" };
  if (i.preheader != null && (typeof i.preheader !== "string" || i.preheader.length > MAX_PREHEADER_LENGTH)) return { ok: false, error: "invalid_preheader" };
  if (typeof i.body_markdown !== "string" || !i.body_markdown.trim() || i.body_markdown.length > MAX_BODY_LENGTH) return { ok: false, error: "invalid_body" };
  if (!isEmailTopic(i.topic)) return { ok: false, error: "invalid_topic" };
  return { ok: true, subject: i.subject.trim(), preheader: (i.preheader as string | null)?.trim() || null, body: i.body_markdown, topic: i.topic };
}

/** What the owner reviews. Identical code path to the real send. */
export function renderPreview(cfg: NewsletterConfig, c: Pick<CampaignRow, "subject" | "preheader" | "body_markdown" | "topic">): RenderedMessage {
  return renderCampaign({
    subject: c.subject, preheader: c.preheader, bodyMarkdown: c.body_markdown, topic: c.topic,
    siteName: cfg.siteName, siteUrl: cfg.siteUrl, postalAddress: cfg.postalAddress,
    unsubscribeUrl: `${cfg.siteUrl}/email/unsubscribe?t=PREVIEW`,
    preferencesUrl: `${cfg.siteUrl}/settings#email-preferences`,
  });
}

async function loadCampaign(db: Db, id: string): Promise<CampaignRow | null> {
  const { data } = await db.rpc("newsletter_load_campaign", { _id: id });
  return (data as CampaignRow | null) ?? null;
}

/** Send the campaign to ONE address — the owner's own. Needs a configured provider, not the kill-switch. */
export async function testSend(deps: SendDeps, campaignId: unknown, ownerEmail: string | null): Promise<Reply> {
  if (!isUuid(campaignId)) return bad("invalid_campaign");
  if (!ownerEmail) return bad("owner_email_missing");
  if (!deps.provider.canSend || !deps.cfg.from) return bad("provider_not_configured", 409);
  const c = await loadCampaign(deps.db, campaignId);
  if (!c) return bad("campaign_not_found", 404);
  const msg = renderPreview(deps.cfg, c);
  const r = await deps.provider.send({
    from: deps.cfg.from, to: ownerEmail, subject: `[TEST] ${c.subject}`, html: msg.html, text: msg.text,
    replyTo: deps.cfg.replyTo ?? undefined, idempotencyKey: `test:${c.id}:${Date.now()}`,
    tags: [{ name: "kind", value: "campaign_test" }],
  });
  return r.ok === false ? bad(`send_failed_${r.code}`, 502) : ok({ result: "sent" });
}

export const SEND_BATCH_SIZE = 50;
export const SEND_CONCURRENCY = 5;

/**
 * Send up to one batch of an already-started campaign. Safe to call repeatedly
 * and concurrently: rows are claimed with SKIP LOCKED, each send carries a
 * per-(campaign, recipient) idempotency key, and eligibility is re-checked by
 * the database at claim time.
 */
export async function processBatch(deps: SendDeps, campaignId: string): Promise<Reply> {
  const blocker = sendBlocker(deps.cfg, deps.provider.canSend);
  if (blocker) return bad(blocker, 409);
  const c = await loadCampaign(deps.db, campaignId);
  if (!c) return bad("campaign_not_found", 404);
  if (c.status !== "sending") return ok({ result: "not_sending", status: c.status });

  const claimed = await deps.db.rpc("newsletter_claim_batch", { _campaign_id: campaignId, _limit: SEND_BATCH_SIZE });
  if (claimed.error) return bad("claim_failed", 500);
  const rows = (claimed.data ?? []) as Array<{ delivery_id: number; subscription_id: string; email: string }>;

  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      let result: { ok: boolean; id: string | null; code: string | null; retryable: boolean };
      try {
        const links = await recipientLinks(deps.cfg, row.subscription_id);
        const msg = renderCampaign({
          subject: c.subject, preheader: c.preheader, bodyMarkdown: c.body_markdown, topic: c.topic,
          siteName: deps.cfg.siteName, siteUrl: deps.cfg.siteUrl, postalAddress: deps.cfg.postalAddress,
          unsubscribeUrl: links.unsubscribeUrl, preferencesUrl: links.preferencesUrl,
        });
        const r = await deps.provider.send({
          from: deps.cfg.from!, to: row.email, subject: c.subject, html: msg.html, text: msg.text,
          replyTo: deps.cfg.replyTo ?? undefined, headers: listUnsubscribeHeaders(links.oneClickUrl),
          idempotencyKey: `campaign:${c.id}:${row.subscription_id}`,
          tags: [{ name: "kind", value: "campaign" }, { name: "campaign", value: c.id }],
        });
        result = r.ok === false
          ? { ok: false, id: null, code: r.code, retryable: r.retryable }
          : { ok: true, id: r.id, code: null, retryable: false };
      } catch {
        result = { ok: false, id: null, code: "render_error", retryable: false };
      }
      await deps.db.rpc("newsletter_record_delivery", {
        _delivery_id: row.delivery_id, _ok: result.ok, _provider_message_id: result.id,
        _error_code: result.code, _retryable: result.retryable,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, rows.length) }, worker));

  const progress = await deps.db.rpc("newsletter_progress", { _campaign_id: campaignId });
  return ok({ result: "batch_done", processed: rows.length, progress: progress.data });
}

/**
 * Start a real send. Every gate is checked here AND by the database:
 *  kill-switch + configuration → campaign approved ('ready') → the recipient
 *  count the owner is looking at still equals the audience → typed confirmation.
 */
export async function startSend(
  deps: SendDeps, campaignId: unknown, expectedCount: unknown, confirm: unknown,
): Promise<Reply> {
  const blocker = sendBlocker(deps.cfg, deps.provider.canSend);
  if (blocker) return bad(blocker, 409);
  if (!isUuid(campaignId)) return bad("invalid_campaign");
  if (!Number.isInteger(expectedCount) || (expectedCount as number) < 0) return bad("invalid_count");
  if (confirm !== `SEND ${expectedCount}`) return bad("confirmation_mismatch");
  const { data, error } = await deps.db.rpc("newsletter_begin_send", {
    _campaign_id: campaignId, _expected_count: expectedCount,
  });
  if (error) return bad("start_failed", 500);
  const result = String(data?.result ?? "");
  if (result !== "started" && result !== "already_sending") return { status: 409, body: { error: result, ...data } };
  const first = await processBatch(deps, campaignId);
  return { status: first.status, body: { started: result === "started", queued: data?.queued, ...first.body } };
}
