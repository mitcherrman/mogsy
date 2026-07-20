// Test-only identity injection for Combat Sim Battles end-to-end acceptance.
//
// SAFETY: this is double-gated and CANNOT ship enabled.
//   1. `import.meta.env.DEV` is statically `false` in any production `vite
//      build`, so Vite dead-code-eliminates every branch guarded by
//      `e2eEnabled()` out of the production bundle entirely.
//   2. `VITE_E2E_AUTH` must be explicitly "1" (only set by the E2E runner /
//      the local acceptance harness).
//
// When enabled, the E2E runner writes a persona into localStorage before the
// app boots (Playwright `addInitScript`, or a manual `localStorage.setItem`).
// The persona's `token` is a real Supabase-format HS256 JWT that the LOCAL
// backend verifies through its ordinary `SUPABASE_JWT_SECRET` path — so no
// verification is bypassed on either side; the seam only decides WHICH real
// token/user to present in the browser.

import type { User, Session } from "@supabase/supabase-js";

export type E2EIdentity = {
  token: string;
  user: { id: string; email: string | null; is_anonymous: boolean };
  admin: boolean;
};

export const E2E_STORAGE_KEY = "mogsy_e2e_identity";

/** True only in a dev build with the explicit E2E flag set. */
export function e2eEnabled(): boolean {
  return import.meta.env.DEV === true && import.meta.env.VITE_E2E_AUTH === "1";
}

/** The injected persona, or null when E2E mode is off or nothing was injected. */
export function getE2EIdentity(): E2EIdentity | null {
  if (!e2eEnabled()) return null;
  try {
    const raw = localStorage.getItem(E2E_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.token !== "string" || !parsed.user?.id) return null;
    return {
      token: parsed.token,
      user: {
        id: String(parsed.user.id),
        email: parsed.user.email ?? null,
        is_anonymous: Boolean(parsed.user.is_anonymous),
      },
      admin: Boolean(parsed.admin),
    };
  } catch {
    return null;
  }
}

/** Build a minimal Supabase-shaped user/session from an injected persona. */
export function e2eSession(identity: E2EIdentity): { user: User; session: Session } {
  const user = {
    id: identity.user.id,
    email: identity.user.email ?? undefined,
    is_anonymous: identity.user.is_anonymous,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  } as unknown as User;
  const session = {
    access_token: identity.token,
    refresh_token: "e2e-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  } as unknown as Session;
  return { user, session };
}
