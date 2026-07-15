// Session-scoped reviewer identity for Ranked Duel candidate decisions.
// Every mutation the backend accepts requires a non-empty reviewer; this keeps
// the staff reviewer's name for the browser session (never a secret, never
// sent anywhere but the decision body).
const KEY = "mogsy.ranked_duel_reviewer";

export function getReviewer(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setReviewer(name: string): void {
  try {
    sessionStorage.setItem(KEY, name);
  } catch {
    /* noop */
  }
}
