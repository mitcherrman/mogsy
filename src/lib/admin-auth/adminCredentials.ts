// ---------------------------------------------------------------------------
// Shared admin credential helper (OWN1).
//
// Admin backend requests carry exactly one credential: the current Supabase
// access token as `Authorization: Bearer`. The browser admin-key fallback
// (X-Admin-Key) was removed in OWN1 — there is no static key a browser can
// present. Credentials are attached ONLY for the configured Mogsy backend
// origin (VITE_COMBAT_API_URL). Nothing here logs a token.
// ---------------------------------------------------------------------------

import { getBackendAuthHeaders } from "@/lib/backend-auth";

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

/** Build admin auth headers: Supabase Bearer only; none for foreign origins. */
export async function buildAdminHeaders(url?: string): Promise<Record<string, string>> {
  if (url !== undefined && !isBackendUrl(url)) return {};
  return { ...(await getBackendAuthHeaders()) };
}
