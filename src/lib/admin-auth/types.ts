// Shared admin-auth types (account-bound Supabase admin authorization).

/**
 * Backend auth method reported by GET /api/admin/session.
 *
 * OWN1.1: Railway reports `supabase_owner` (routes/_auth.py
 * AUTH_METHOD_SUPABASE_OWNER) — a verified Supabase bearer for the canonical
 * owner whose session `owner_auth_state()` authorizes. It is the ONLY accepted
 * value: `admin_key` and the pre-OWN1 `supabase_user` fail closed.
 */
export type AdminAuthMethod = "supabase_owner";

/** Safe principal context from an authorized session response. */
export interface AdminPrincipal {
  authMethod: AdminAuthMethod;
  userId: string | null;
  email: string | null;
}

/** Outcome of a single GET /api/admin/session check. */
export type AdminSessionOutcome =
  | { kind: "authorized"; principal: AdminPrincipal }
  | { kind: "forbidden" } // 403 — credentials do not authorize admin
  | { kind: "unavailable" } // network error / 5xx — backend down, NOT non-admin
  | { kind: "malformed" }; // 2xx but body failed validation — fail closed

/**
 * Centralized admin-auth state for Railway-backed admin workspaces. Derived
 * from the shared owner session first; Railway is consulted only for the
 * authorized owner. Distinct states so the gate shows the right affordance.
 */
export type AdminAuthStatus =
  | "loading" // owner session still initializing
  | "signed_out" // no real Supabase user
  | "checking" // first GET /api/admin/session in flight
  | "authorized" // owner session authorized AND Railway agreed
  | "signed_in_non_admin" // real account, not the owner
  | "needs_step_up" // the owner, on a session that needs MFA / device trust
  | "owner_denied" // the authorized owner, yet Railway refused (after one re-attest)
  | "expired_session" // session token gone/expired; re-sign-in required
  | "backend_unavailable" // could not reach the admin backend (or Supabase)
  | "malformed_response"; // backend returned an unusable response

export interface AdminAuthContextValue {
  status: AdminAuthStatus;
  principal: AdminPrincipal | null;
  /** True only for authorized. */
  isAuthorized: boolean;
  /** Force one controlled recheck (e.g. user pressed Retry). */
  recheck: () => void;
  /**
   * Invalidate authorization after a relevant admin API failure (e.g. a read
   * got 403). Triggers a controlled recheck; never auto-retries mutations.
   */
  invalidate: () => void;
}
