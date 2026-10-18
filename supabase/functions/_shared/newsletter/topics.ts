// EMAIL1 — the optional-email topic catalogue. Pure TypeScript (no Deno or
// network imports) so vitest can run it. The browser keeps a mirror at
// src/lib/email/topics.ts; src/test/security/email1TopicParity.test.ts fails
// if the two drift, because the consent wording and version recorded in the
// audit trail must be what the user actually saw.

export const EMAIL_TOPICS = ["daily_reminder", "product_news", "events", "promotions"] as const;
export type EmailTopic = (typeof EMAIL_TOPICS)[number];

export const EMAIL_TOPIC_LABELS: Record<EmailTopic, string> = {
  daily_reminder: "Daily Challenge reminders",
  product_news: "New game modes and features",
  events: "Mogzy and League of Legends events",
  promotions: "Mogzy offers and promotions",
};

/**
 * Bump when ANY consent wording changes. Every opt-in event stores the version
 * it was given under, so an old consent is never presented as agreement to
 * newer wording.
 */
export const CONSENT_VERSION = "2026-10-18.v1";

export const CONSENT_TEXT: Record<string, Record<EmailTopic, string>> = {
  [CONSENT_VERSION]: {
    daily_reminder: "Email me a reminder when the Daily Challenge is ready.",
    product_news: "Email me about new Mogzy game modes and features.",
    events: "Email me about Mogzy and League of Legends events.",
    promotions: "Email me Mogzy offers and promotions.",
  },
};

export const EMAIL_SOURCES = [
  "signup_direct",
  "signup_upgrade",
  "signup_intent",
  "settings",
] as const;
export type EmailSource = (typeof EMAIL_SOURCES)[number];

/** Topics a signup form may offer. Promotions need a deliberate, separate ask. */
export const SIGNUP_TOPIC_GROUPS = {
  daily: ["daily_reminder"],
  news: ["product_news", "events"],
} as const satisfies Record<string, readonly EmailTopic[]>;

const TOPIC_SET: ReadonlySet<string> = new Set(EMAIL_TOPICS);

/**
 * Validate a client-supplied topic list. Returns null when ANYTHING is wrong
 * (unknown topic, wrong type, too long) rather than silently dropping entries:
 * a partially understood consent request is not a consent request.
 * Duplicates collapse; order is canonical.
 */
export function parseTopics(input: unknown): EmailTopic[] | null {
  if (!Array.isArray(input) || input.length > EMAIL_TOPICS.length * 2) return null;
  const seen = new Set<string>();
  for (const t of input) {
    if (typeof t !== "string" || !TOPIC_SET.has(t)) return null;
    seen.add(t);
  }
  return EMAIL_TOPICS.filter((t) => seen.has(t));
}

export function isEmailTopic(v: unknown): v is EmailTopic {
  return typeof v === "string" && TOPIC_SET.has(v);
}

export function isEmailSource(v: unknown): v is EmailSource {
  return typeof v === "string" && (EMAIL_SOURCES as readonly string[]).includes(v);
}
