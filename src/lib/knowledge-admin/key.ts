/**
 * Session-scoped storage of the KNOWLEDGE_ADMIN_KEY value used as the
 * `X-Admin-Key` header for every /api/admin/knowledge request. Cleared
 * when the tab closes; user can also explicitly forget it.
 */
const STORAGE_KEY = "mogsy.knowledge_admin_key";

export function getAdminKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminKey(key: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
    window.dispatchEvent(new Event("knowledge-admin-key-changed"));
  } catch {
    /* noop */
  }
}

export function clearAdminKey() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("knowledge-admin-key-changed"));
  } catch {
    /* noop */
  }
}

export function subscribeAdminKey(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("knowledge-admin-key-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("knowledge-admin-key-changed", handler);
    window.removeEventListener("storage", handler);
  };
}