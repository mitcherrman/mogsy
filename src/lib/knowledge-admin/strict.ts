/**
 * Strict approval confirmation toggle for Knowledge Admin.
 *
 * OFF (default): approval buttons apply directly on click. Dry-run / preview
 *   is still available as an optional secondary action.
 * ON: restores the previous strict flow — dry-run first, ack warnings,
 *   type APPLY, then real approval.
 *
 * Persisted in localStorage so the preference survives tab close (unlike
 * the admin key which is intentionally session-scoped).
 */
const STORAGE_KEY = "knowledge_admin_strict_approval";
const EVENT = "knowledge-admin-strict-changed";

export function getStrictApproval(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStrictApproval(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* noop */
  }
}

export function subscribeStrictApproval(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}