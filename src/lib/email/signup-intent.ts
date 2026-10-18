// EMAIL1 — what a signup form leaves on the new account so the post-signup
// consumer (useEmailSignupIntent) can start the double opt-in.
//
// This is INTENT, not consent: it carries no address and subscribes nobody. The
// server turns it into a pending request, emails the account's own address, and
// only that mailbox's click makes it a subscription. Account metadata is how it
// survives the "confirm your email, then sign in on another device" path.

import { isEmailSubscriptionsEnabled } from "./flag";
import { topicsFromSignupChoice, type EmailTopic, type SignupEmailChoice } from "./topics";

export const SIGNUP_INTENT_KEY = "email_opt_in_intent";

export interface SignupIntent {
  topics: EmailTopic[];
  v: 1;
}

/** The auth `data` fragment to merge in, or null when nothing was ticked. */
export function signupIntentData(choice: SignupEmailChoice | null | undefined): Record<string, SignupIntent> | null {
  if (!choice || !isEmailSubscriptionsEnabled()) return null;
  const topics = topicsFromSignupChoice(choice);
  return topics.length ? { [SIGNUP_INTENT_KEY]: { topics, v: 1 } } : null;
}

export function hasSignupIntent(metadata: Record<string, unknown> | null | undefined): boolean {
  const v = metadata?.[SIGNUP_INTENT_KEY] as { topics?: unknown } | null | undefined;
  return !!v && typeof v === "object" && Array.isArray(v.topics) && v.topics.length > 0;
}
