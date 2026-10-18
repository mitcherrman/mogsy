// EMAIL1 — Admin › Users: newsletter status per account.
//
// Source: admin_email_subscription_status(), an owner-gated RPC (assert_owner).
// A failure (not the owner, or the staged SQL not applied yet) degrades to "no
// status shown", never to an error on the Users list: this is context for the
// operator, not data the list depends on.

import { supabase } from "@/integrations/supabase/client";
import { EMAIL_TOPIC_LABELS, EMAIL_TOPICS, type EmailTopic } from "@/lib/email/topics";

export type AdminEmailStatus = "none" | "pending" | "subscribed" | "unsubscribed" | "suppressed";

export interface AdminEmailSub {
  status: AdminEmailStatus;
  topics: EmailTopic[];
  pendingTopics: EmailTopic[];
  confirmedAt: string | null;
  /** The consented mailbox is still the account's current email. */
  addressCurrent: boolean;
  suppressed: boolean;
}

const STATUSES = new Set<string>(["none", "pending", "subscribed", "unsubscribed", "suppressed"]);
const TOPIC_SET = new Set<string>(EMAIL_TOPICS);

export const ADMIN_EMAIL_BATCH = 200; // the RPC rejects more

/** Defensive: the RPC is called through a loosely-typed client and mocked widely. */
export function parseEmailSubscriptionRows(rows: unknown): Record<string, AdminEmailSub> {
  const out: Record<string, AdminEmailSub> = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (typeof row.user_id !== "string" || typeof row.status !== "string" || !STATUSES.has(row.status)) continue;
    const topics = (a: unknown) => (Array.isArray(a) ? a.filter((t): t is EmailTopic => TOPIC_SET.has(String(t))) : []);
    out[row.user_id] = {
      status: row.status as AdminEmailStatus,
      topics: topics(row.topics),
      pendingTopics: topics(row.pending_topics),
      confirmedAt: typeof row.confirmed_at === "string" ? row.confirmed_at : null,
      addressCurrent: row.address_current === true,
      suppressed: row.suppressed === true,
    };
  }
  return out;
}

export async function loadEmailSubscriptionStatus(userIds: string[]): Promise<Record<string, AdminEmailSub>> {
  const merged: Record<string, AdminEmailSub> = {};
  try {
    for (let i = 0; i < userIds.length; i += ADMIN_EMAIL_BATCH) {
      const { data, error } = await supabase.rpc("admin_email_subscription_status" as never, {
        _user_ids: userIds.slice(i, i + ADMIN_EMAIL_BATCH),
      } as never);
      if (error) return merged; // degrade: show what we have
      Object.assign(merged, parseEmailSubscriptionRows(data));
    }
  } catch {
    /* degrade silently */
  }
  return merged;
}

/** A subscription that would actually receive mail today. */
export function isReachable(s: AdminEmailSub | undefined): boolean {
  return !!s && s.status === "subscribed" && s.addressCurrent && !s.suppressed;
}

export interface EmailBadge {
  label: string;
  tone: "primary" | "muted" | "warning";
}

/** The one small tag on a list row; null when there is nothing worth saying. */
export function emailBadge(s: AdminEmailSub | undefined): EmailBadge | null {
  if (!s) return null;
  if (s.suppressed || s.status === "suppressed") return { label: "Email suppressed", tone: "warning" };
  if (s.status === "subscribed") {
    return s.addressCurrent ? { label: "Newsletter", tone: "primary" } : { label: "Newsletter · old address", tone: "warning" };
  }
  if (s.status === "pending") return { label: "Email pending", tone: "muted" };
  return null;
}

/** One line for the detail header. */
export function emailDetailLine(s: AdminEmailSub | undefined): string {
  if (!s || s.status === "none") return "Not subscribed to email";
  const names = (t: EmailTopic[]) => t.map((x) => EMAIL_TOPIC_LABELS[x]).join(", ");
  switch (s.status) {
    case "subscribed":
      return `Subscribed: ${names(s.topics)}${s.addressCurrent ? "" : " (consent was for a previous address — not mailable)"}`;
    case "pending":
      return `Awaiting confirmation: ${names(s.pendingTopics)}`;
    case "unsubscribed":
      return "Unsubscribed";
    case "suppressed":
      return "Suppressed (bounce or complaint) — never mailed";
  }
}
