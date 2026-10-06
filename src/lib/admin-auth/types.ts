// Shared admin-auth types (account-bound Supabase admin authorization).

/** Backend auth methods reported by GET /api/admin/session. */
/** OWN1: the browser admin-key path is gone; only the account bearer remains. */
export type AdminAuthMethod = "supabase_user";

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
 * Centralized admin-auth state. Distinct, non-collapsed states so the gate can
 * show the right affordance and never reduce every 403 to a key prompt.
 */
export type AdminAuthStatus =
  | "loading" // Supabase auth still initializing
  | "signed_out" // no real Supabase user
  | "checking" // GET /api/admin/session in flight
  | "authorized" // authorized via the account bearer
  | "signed_in_non_admin" // real account, but not allowlisted (403)
  | "expired_session" // session token gone/expired; re-sign-in required
  | "backend_unavailable" // could not reach the admin backend
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
