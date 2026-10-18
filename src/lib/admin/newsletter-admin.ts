// EMAIL1 — Admin › Users › Newsletter: the data layer. Every call is owner-gated
// on the server (assert_owner in SQL, requireOwner in the Edge Function); this
// file only decides what to ASK the owner for (see lib/admin-auth/ownerAction).

import { supabase } from "@/integrations/supabase/client";
import { ownerActionNotice, runOwnerAction } from "@/lib/admin-auth/ownerAction";
import type { EmailTopic } from "@/lib/email/topics";

export type CampaignStatus = "draft" | "ready" | "sending" | "sent" | "cancelled";

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  body_markdown: string;
  topic: EmailTopic;
  status: CampaignStatus;
  approved_recipient_count: number | null;
  approved_at: string | null;
  send_started_at: string | null;
  send_completed_at: string | null;
  updated_at: string;
}

export interface CampaignDraft {
  id: string | null;
  name: string;
  subject: string;
  preheader: string;
  body_markdown: string;
  topic: EmailTopic;
}

export const EMPTY_DRAFT: CampaignDraft = {
  id: null, name: "", subject: "", preheader: "", body_markdown: "", topic: "product_news",
};

export interface SendProgress {
  queued: number; sending: number; sent: number; failed: number; skipped: number;
}

export interface ConfigStatus {
  provider: string;
  provider_ready: boolean;
  sending_enabled: boolean;
  send_blocker: string | null;
  postal_address_set: boolean;
  from_set: boolean;
}

/** Copy for a blocker code from newsletter-admin / sendBlocker(). */
export const BLOCKER_COPY: Record<string, string> = {
  sending_disabled: "Sending is switched off (NEWSLETTER_SENDING_ENABLED is not \"true\"). This is the default.",
  provider_not_configured: "No email provider is configured (NEWSLETTER_EMAIL_PROVIDER + RESEND_API_KEY).",
  token_secret_missing: "NEWSLETTER_TOKEN_SECRET is missing or shorter than 32 characters.",
  from_address_missing: "NEWSLETTER_FROM (the sender address on your sending domain) is not set.",
  postal_address_missing: "NEWSLETTER_POSTAL_ADDRESS is not set. Every campaign must carry a mailing address.",
  functions_url_missing: "SUPABASE_URL is unavailable to the function.",
};

/** The phrase the owner must type to start a send — it names the exact audience size. */
export const sendConfirmPhrase = (count: number) => `SEND ${count}`;

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

type Called = { data: unknown; error: { message?: string } | null };

async function owner<T extends Called>(
  level: "trusted" | "fresh", reason: string, idempotent: boolean, call: () => PromiseLike<T>,
): Promise<Result<T["data"]>> {
  const outcome = await runOwnerAction({ level, reason, idempotent }, () => Promise.resolve(call()));
  if (outcome.status !== "done") return { ok: false, message: ownerActionNotice(outcome) ?? "Cancelled." };
  const { data, error } = outcome.result;
  if (error) {
    const body = data as { error?: string } | null;
    return { ok: false, message: friendly(body?.error ?? error.message ?? "Request failed") };
  }
  const body = data as { error?: string } | null;
  if (body && typeof body === "object" && "error" in body && body.error) return { ok: false, message: friendly(body.error) };
  return { ok: true, value: data };
}

function friendly(code: string): string {
  if (BLOCKER_COPY[code]) return BLOCKER_COPY[code];
  if (/function .* does not exist|schema cache|relation .* does not exist/i.test(code)) {
    return "The newsletter database objects are not installed yet (the EMAIL1 SQL has not been applied).";
  }
  return code.replace(/_/g, " ");
}

const rpc = (fn: string, args?: Record<string, unknown>) =>
  supabase.rpc(fn as never, (args ?? {}) as never) as unknown as PromiseLike<Called>;
const edge = (body: Record<string, unknown>) =>
  supabase.functions.invoke("newsletter-admin", { body }) as unknown as PromiseLike<Called>;

export async function loadStats() {
  return owner("trusted", "Loading newsletter stats", true, () => rpc("admin_email_stats"));
}
export async function loadCampaigns(): Promise<Result<Campaign[]>> {
  const r = await owner("trusted", "Loading campaigns", true, () => rpc("admin_newsletter_list_campaigns"));
  return r.ok === false ? r : { ok: true, value: (r.value as Campaign[]) ?? [] };
}
export async function loadSubscribers(status: string | null, offset: number) {
  return owner("trusted", "Loading subscribers", true, () =>
    rpc("admin_email_list_subscribers", { _status: status, _limit: 25, _offset: offset }));
}
export async function audienceCount(topic: EmailTopic): Promise<Result<number>> {
  const r = await owner("trusted", "Counting the audience", true, () => rpc("admin_newsletter_audience", { _topic: topic }));
  return r.ok === false ? r : { ok: true, value: Number(r.value) };
}
export async function saveCampaign(d: CampaignDraft): Promise<Result<string>> {
  const r = await owner("trusted", "Saving a campaign draft", true, () =>
    rpc("admin_newsletter_save_campaign", {
      _id: d.id, _name: d.name, _subject: d.subject, _preheader: d.preheader || null,
      _body_markdown: d.body_markdown, _topic: d.topic,
    }));
  return r.ok === false ? r : { ok: true, value: String(r.value) };
}
/** draft -> ready needs a FRESH owner session (and records the audience); the rest is routine. */
export async function setCampaignStatus(id: string, status: "draft" | "ready" | "cancelled") {
  return owner(status === "ready" ? "fresh" : "trusted", status === "ready" ? "Approving a campaign for sending" : "Changing campaign status", true, () =>
    rpc("admin_newsletter_set_status", { _id: id, _status: status }));
}
export async function configStatus(): Promise<Result<ConfigStatus>> {
  const r = await owner("trusted", "Checking email configuration", true, () => edge({ action: "config_status" }));
  return r.ok === false ? r : { ok: true, value: r.value as ConfigStatus };
}
export async function renderPreview(d: CampaignDraft): Promise<Result<{ html: string; text: string }>> {
  const r = await owner("trusted", "Previewing a campaign", true, () =>
    edge({ action: "preview", subject: d.subject, preheader: d.preheader || null, body_markdown: d.body_markdown, topic: d.topic }));
  return r.ok === false ? r : { ok: true, value: r.value as { html: string; text: string } };
}
export async function sendTest(campaignId: string) {
  return owner("trusted", "Sending a test email to yourself", false, () => edge({ action: "test_send", campaign_id: campaignId }));
}
export async function startSend(campaignId: string, count: number): Promise<Result<{ progress?: SendProgress; queued?: number }>> {
  const r = await owner("fresh", "Sending a campaign to subscribers", false, () =>
    edge({ action: "send_start", campaign_id: campaignId, expected_count: count, confirm: sendConfirmPhrase(count) }));
  return r.ok === false ? r : { ok: true, value: r.value as { progress?: SendProgress } };
}
export async function continueSend(campaignId: string): Promise<Result<{ progress?: SendProgress; result?: string }>> {
  const r = await owner("trusted", "Continuing a campaign send", true, () => edge({ action: "send_continue", campaign_id: campaignId }));
  return r.ok === false ? r : { ok: true, value: r.value as { progress?: SendProgress } };
}

export function sendDone(p: SendProgress | undefined): boolean {
  return !!p && p.queued === 0 && p.sending === 0;
}
