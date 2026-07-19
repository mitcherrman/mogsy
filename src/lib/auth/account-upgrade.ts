// ---------------------------------------------------------------------------
// Anonymous guest -> permanent account upgrade (Concern B).
//
// Single source of truth for the confirmation-aware upgrade. Every anonymous
// "Create account" / "Save progress" surface routes through these helpers.
//
// Chosen Supabase flow (email-first, verified by installed auth-js 2.97.0):
//   1. updateUser({ email }, { emailRedirectTo }) — attaches an email to the
//      CURRENT anonymous auth user and sends a confirmation email. The auth
//      user keeps the SAME id and stays anonymous until the link is clicked
//      (auto-confirm OFF + secure email change ON in production).
//   2. After the verified session is restored, updateUser({ password }) sets a
//      password so the user can sign in later.
//   3. Only THEN is profiles.is_anonymous synced to false.
//
// linkIdentity() is NOT used: in auth-js 2.97.0 it only accepts OAuth/OIDC
// credentials, not email/password.
//
// SECURITY: passwords are NEVER persisted here — not in storage, not in the
// pending record, not in redirect URLs. Only the (non-secret) user id + the
// entered email are remembered so the pending screen survives a reload.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

const PENDING_KEY = "mogzy.account-upgrade.pending.v1";

export interface PendingUpgrade {
  /** The anonymous auth user id being upgraded (not a secret; already in JWT). */
  userId: string;
  /** The email the user asked us to attach. */
  email: string;
  /** Where to send the user after conversion completes (already validated). */
  returnTo: string;
}

export function readPendingUpgrade(): PendingUpgrade | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.userId === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.returnTo === "string"
    ) {
      return parsed as PendingUpgrade;
    }
    return null;
  } catch {
    return null;
  }
}

function writePendingUpgrade(pending: PendingUpgrade): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* storage disabled — the flow still works, only reload-persistence is lost */
  }
}

export function clearPendingUpgrade(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export interface UpgradeResult {
  ok: boolean;
  /** Safe, user-facing error message when ok === false. */
  error?: string;
  /** True when Supabase reports the email is already attached to an account. */
  emailInUse?: boolean;
}

/** Normalize Supabase auth errors into safe, user-facing messages. */
function toUpgradeError(message: string | undefined): UpgradeResult {
  const msg = (message ?? "").toLowerCase();
  if (
    msg.includes("already been registered") ||
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("already in use")
  ) {
    return {
      ok: false,
      emailInUse: true,
      error: "That email is already linked to an account. Sign in instead.",
    };
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return { ok: false, error: "Too many attempts. Please wait a moment and try again." };
  }
  if (msg.includes("invalid") && msg.includes("email")) {
    return { ok: false, error: "That email address looks invalid." };
  }
  return { ok: false, error: message || "Could not start account creation. Please try again." };
}

/**
 * Initiate the email-first anonymous upgrade. NEVER signs out, NEVER calls
 * signUp(), NEVER writes the profile. Requires the caller to have confirmed a
 * current anonymous user (id passed in). Persists a pending record (no secrets)
 * so the verification screen survives a reload / "continue using Mogzy".
 */
export async function initiateAnonymousEmailUpgrade(params: {
  userId: string;
  email: string;
  redirectTo: string;
}): Promise<UpgradeResult> {
  const email = params.email.trim();
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: params.redirectTo },
  );
  if (error) return toUpgradeError(error.message);
  writePendingUpgrade({ userId: params.userId, email, returnTo: params.redirectTo });
  return { ok: true };
}

/**
 * Set a password on the ALREADY-VERIFIED (non-anonymous) session. Call only
 * from the confirmation callback after auth is authoritatively non-anonymous.
 */
export async function setPasswordForVerifiedUser(password: string): Promise<UpgradeResult> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return toUpgradeError(error.message);
  return { ok: true };
}

/**
 * Sync the DERIVED profile flag once auth is authoritatively non-anonymous.
 * Touches only is_anonymous on the same user_id — never tutorial columns, XP,
 * streaks, or history — then re-reads to confirm. Retry-safe.
 */
export async function syncProfilePermanent(userId: string): Promise<UpgradeResult> {
  const { error } = await supabase
    .from("profiles")
    .update({ is_anonymous: false })
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  const { data, error: readErr } = await supabase
    .from("profiles")
    .select("is_anonymous")
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!data || data.is_anonymous !== false) {
    return { ok: false, error: "Profile did not confirm as permanent. Please retry." };
  }
  return { ok: true };
}

/**
 * Authoritative check that the current session is a fully-converted permanent
 * account (non-anonymous, email present, email identity attached).
 */
export function isConvertedPermanentUser(
  user: { is_anonymous?: boolean; email?: string | null; identities?: Array<{ provider?: string }> | null } | null,
): boolean {
  if (!user) return false;
  if (user.is_anonymous === true) return false;
  if (!user.email) return false;
  const hasEmailIdentity =
    Array.isArray(user.identities) &&
    user.identities.some((i) => i?.provider === "email");
  return hasEmailIdentity;
}
