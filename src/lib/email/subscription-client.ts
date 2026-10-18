// EMAIL1 — thin browser client for the email Edge Functions and the one table
// the browser may read (its OWN row, via RLS). Never takes an email address as
// input: the server uses the signed-in account's.

import { supabase } from "@/integrations/supabase/client";
import type { EmailTopic } from "./topics";

export type SubscriptionStatus = "none" | "pending" | "subscribed" | "unsubscribed" | "suppressed";

export interface OwnSubscription {
  status: SubscriptionStatus;
  topics: EmailTopic[];
  pendingTopics: EmailTopic[];
  /** The mailbox this row consented for. */
  emailNormalized: string;
}

export interface RequestOutcome {
  ok: boolean;
  result?: string;
  emailSent?: boolean;
  reason?: string;
  error?: string;
}

async function invoke(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) return { ok: false as const, data: null, error: error.message };
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    return { ok: false as const, data, error: String((data as { error: unknown }).error) };
  }
  return { ok: true as const, data: (data ?? {}) as Record<string, unknown>, error: undefined };
}

/** The signed-in user's own subscription for their current address (RLS: own rows only). */
export async function fetchOwnSubscription(userId: string, accountEmail: string): Promise<OwnSubscription | null> {
  const { data, error } = await supabase
    .from("email_subscriptions" as never)
    .select("status, topics, pending_topics, email_normalized")
    .eq("user_id", userId)
    .eq("email_normalized", accountEmail.trim().toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    status: SubscriptionStatus; topics: EmailTopic[]; pending_topics: EmailTopic[]; email_normalized: string;
  };
  return {
    status: row.status,
    topics: row.topics ?? [],
    pendingTopics: row.pending_topics ?? [],
    emailNormalized: row.email_normalized,
  };
}

export async function requestEmailSubscription(topics: EmailTopic[]): Promise<RequestOutcome> {
  const r = await invoke("email-subscription", { action: "request", topics });
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    result: String(r.data.result),
    emailSent: r.data.email_sent as boolean | undefined,
    reason: r.data.reason as string | undefined,
  };
}

export async function setEmailTopics(topics: EmailTopic[]): Promise<RequestOutcome> {
  const r = await invoke("email-subscription", { action: "set_topics", topics });
  return r.ok ? { ok: true, result: String(r.data.result) } : { ok: false, error: r.error };
}

export async function unsubscribeSelf(): Promise<RequestOutcome> {
  const r = await invoke("email-subscription", { action: "unsubscribe" });
  return r.ok ? { ok: true, result: String(r.data.result) } : { ok: false, error: r.error };
}

export async function consumeSignupIntent(): Promise<RequestOutcome> {
  const r = await invoke("email-subscription", { action: "consume_signup_intent" });
  return r.ok
    ? { ok: true, result: String(r.data.result), emailSent: r.data.email_sent as boolean | undefined }
    : { ok: false, error: r.error };
}

// --- public, token-authorised (no session) ----------------------------------

export interface TokenOutcome {
  ok: boolean;
  result?: string;
  emailMasked?: string;
  topics?: EmailTopic[];
}

async function publicCall(body: Record<string, unknown>): Promise<TokenOutcome> {
  const r = await invoke("email-link", body);
  if (!r.ok) return { ok: false };
  return {
    ok: true,
    result: String(r.data.result),
    emailMasked: r.data.email_masked as string | undefined,
    topics: r.data.topics as EmailTopic[] | undefined,
  };
}

export const confirmEmailToken = (token: string) => publicCall({ action: "confirm", token });
export const previewUnsubscribe = (token: string) => publicCall({ action: "unsubscribe_preview", token });
export const unsubscribeWithToken = (token: string) => publicCall({ action: "unsubscribe", token });
