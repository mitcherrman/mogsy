// ---------------------------------------------------------------------------
// Shared admin credential helper.
//
// One place that decides which credentials go on an admin backend request:
//   * Authorization: Bearer <supabase access token> — the DEFAULT browser
//     path. Read fresh from the existing Supabase session at request time
//     (never persisted by this task; Supabase owns token storage/refresh).
//   * X-Admin-Key — attached ONLY when an explicit fallback key is present
//     (the user deliberately entered one). Reuses the existing session-scoped
//     store (`knowledge-admin/key`, sessionStorage — never localStorage).
//
// Credentials are attached ONLY for the configured Mogsy backend origin
// (VITE_COMBAT_API_URL). A request to any other origin gets no credentials.
// The backend authorizes on EITHER path, checking the key first — so a wrong
// key never blocks a valid bearer, and a wrong/absent bearer never blocks a
// valid key. Nothing here logs a token or key.
// ---------------------------------------------------------------------------

import { getBackendAuthHeaders } from "@/lib/backend-auth";
import {
  getAdminKey,
  setAdminKey,
  clearAdminKey,
  subscribeAdminKey,
} from "@/lib/knowledge-admin/key";

/** Configured Mogsy backend base URL (public config; already in the browser). */
export const ADMIN_API_BASE_URL =
  ((import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000").replace(
    /\/+$/,
    "",
  );

function backendOrigin(): string | null {
  try {
    return new URL(ADMIN_API_BASE_URL).origin;
  } catch {
    return null;
  }
}

/** True iff `url` (absolute, or relative to the backend base) is the backend origin. */
export function isBackendUrl(url: string): boolean {
  const origin = backendOrigin();
  if (origin == null) return false;
  try {
    return new URL(url, `${ADMIN_API_BASE_URL}/`).origin === origin;
  } catch {
    return false;
  }
}

/** Explicit fallback is active iff the user has entered a fallback admin key. */
export function isFallbackActive(): boolean {
  return getAdminKey() != null;
}

/** Explicit, user-initiated fallback activation (session-scoped only). */
export function activateFallbackKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) setAdminKey(trimmed);
}

/** Remove the fallback key and return to account-bound auth. */
export function clearFallbackKey(): void {
  clearAdminKey();
}

/** Subscribe to fallback-credential changes (set/clear across tabs). */
export const subscribeAdminCredential = subscribeAdminKey;

/**
 * Build the admin auth headers for a backend request. Bearer by default (when
 * a Supabase session exists); X-Admin-Key additionally when a fallback key is
 * set. Returns NO credentials for non-backend origins.
 *
 * `url` should be the request target (absolute or backend-relative). When it
 * is omitted the caller is asserting a backend request (kept for the common
 * case where clients always target the backend base).
 */
export async function buildAdminHeaders(url?: string): Promise<Record<string, string>> {
  if (url !== undefined && !isBackendUrl(url)) return {};
  const headers: Record<string, string> = {};
  // Bearer from the current Supabase session (existing convention). This helper
  // is origin-guarded above, so the token only reaches the backend origin.
  const bearer = await getBackendAuthHeaders();
  Object.assign(headers, bearer);
  const key = getAdminKey();
  if (key) headers["X-Admin-Key"] = key;
  return headers;
}
