// OWN1 — pure owner-authorization decision (no Deno/network imports, so it is
// unit-testable from vitest). Edge Functions call this after reading the
// caller's verified identity + owner_auth_state() with the caller's own JWT.

export type OwnerLevel = "trusted" | "aal2" | "fresh_aal2";

export interface OwnerAuthState {
  is_owner?: boolean;
  aal?: string;
  authorized?: boolean;
  fresh_aal2?: boolean;
}

export interface OwnerDecisionInput {
  /** `sub` of a JWT the auth server verified. Null when verification failed. */
  verifiedUserId: string | null;
  /** OWNER_USER_ID deployment config. */
  envOwnerId: string | null | undefined;
  /** private.owner_config value (service-role read). */
  configuredOwnerId: string | null | undefined;
  /** owner_auth_state() evaluated WITH the caller's JWT. */
  state: OwnerAuthState | null;
  level: OwnerLevel;
}

export type OwnerDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; code: "unauthorized" | "owner_required" | "step_up_required" | "owner_not_configured" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decideOwnerAccess(i: OwnerDecisionInput): OwnerDecision {
  if (!i.verifiedUserId) return { ok: false, status: 401, code: "unauthorized" };
  const env = (i.envOwnerId ?? "").trim().toLowerCase();
  const cfg = (i.configuredOwnerId ?? "").trim().toLowerCase();
  // Fail closed: both sources must be present, well-formed and identical.
  if (!UUID.test(env) || !UUID.test(cfg) || env !== cfg) {
    return { ok: false, status: 503, code: "owner_not_configured" };
  }
  if (i.verifiedUserId.toLowerCase() !== cfg) return { ok: false, status: 403, code: "owner_required" };
  const s = i.state;
  if (!s || s.is_owner !== true) return { ok: false, status: 403, code: "owner_required" };
  const pass =
    i.level === "trusted" ? s.authorized === true
    : i.level === "aal2" ? s.aal === "aal2"
    : s.aal === "aal2" && s.fresh_aal2 === true;
  return pass ? { ok: true } : { ok: false, status: 403, code: "step_up_required" };
}

/** Keys that must never leave admin-user-actions (raw recovery/action URLs). */
const FORBIDDEN_KEYS = new Set(["link", "action_link", "hashed_token", "email_otp", "redirect_to", "properties", "verification_url"]);

/** Strip anything link-shaped from an admin action response body. */
export function sanitizeAdminActionBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (typeof v === "string" && /https?:\/\//i.test(v)) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v)
      ? sanitizeAdminActionBody(v as Record<string, unknown>)
      : v;
  }
  return out;
}

/** Which assurance level each admin-user-actions action requires. */
export const ADMIN_USER_ACTION_LEVEL: Record<string, OwnerLevel> = {
  get_auth_info: "trusted",
  send_password_reset: "fresh_aal2",
  resend_verification: "fresh_aal2",
  confirm_email: "fresh_aal2",
  ban_user: "fresh_aal2",
  unban_user: "fresh_aal2",
};
