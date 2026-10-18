// EMAIL1 — browser mirror of supabase/functions/_shared/newsletter/topics.ts.
// src/test/security/email1TopicParity.test.ts fails if the two drift: the
// wording a person sees is the wording the audit trail must record.

export const EMAIL_TOPICS = ["daily_reminder", "product_news", "events", "promotions"] as const;
export type EmailTopic = (typeof EMAIL_TOPICS)[number];

export const EMAIL_TOPIC_LABELS: Record<EmailTopic, string> = {
  daily_reminder: "Daily Challenge reminders",
  product_news: "New game modes and features",
  events: "Mogzy and League of Legends events",
  promotions: "Mogzy offers and promotions",
};

export const CONSENT_VERSION = "2026-10-18.v1";

export const CONSENT_TEXT: Record<EmailTopic, string> = {
  daily_reminder: "Email me a reminder when the Daily Challenge is ready.",
  product_news: "Email me about new Mogzy game modes and features.",
  events: "Email me about Mogzy and League of Legends events.",
  promotions: "Email me Mogzy offers and promotions.",
};

/** What the two signup checkboxes stand for. Promotions are Settings-only. */
export const SIGNUP_TOPIC_GROUPS = {
  daily: ["daily_reminder"],
  news: ["product_news", "events"],
} as const satisfies Record<string, readonly EmailTopic[]>;

export type SignupEmailChoice = { daily: boolean; news: boolean };
export const NO_SIGNUP_EMAIL_CHOICE: SignupEmailChoice = { daily: false, news: false };

export function topicsFromSignupChoice(c: SignupEmailChoice): EmailTopic[] {
  return [...(c.daily ? SIGNUP_TOPIC_GROUPS.daily : []), ...(c.news ? SIGNUP_TOPIC_GROUPS.news : [])];
}
