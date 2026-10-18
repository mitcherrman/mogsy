// ---------------------------------------------------------------------------
// EMAIL1 — the switch that lets optional-email UI merge before its backend
// exists. Same contract as VITE_WORLDS_EXPERIENCE_ENABLED:
//   * FAIL-CLOSED: only "1" / "true" / "yes" / "on" enable.
//   * BUILD-TIME: Vite inlines the value; nothing a visitor controls changes it.
//
// With it OFF no signup checkbox, no Settings card and no intent consumer
// exists, so a build without the staged SQL applied behaves exactly as before.
// Not a security boundary: every action is authorised again server-side.
// The public /email/confirm and /email/unsubscribe pages work either way (a
// person holding an old link must always be able to opt out).
// ---------------------------------------------------------------------------

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function isEmailSubscriptionsEnabled(): boolean {
  const raw = import.meta.env?.VITE_EMAIL_SUBSCRIPTIONS_ENABLED as string | undefined;
  return TRUE_VALUES.has(String(raw ?? "").trim().toLowerCase());
}
