// ---------------------------------------------------------------------------
// Anonymous guest -> permanent account upgrade (Concern B).
//
// Single source of truth for the confirmation-aware upgrade. Every anonymous
// "Create account" / "Save progress" surface routes through these helpers.
//
// AUTH1 flow (password-first, then email; verified against auth-js 2.97.0):
//   1. updateUser({ password }) — sets the password on the CURRENT anonymous
//      auth user, while it is still trivially the user in front of us. Doing
//      this first means the credential exists no matter which branch step 2
//      takes, so the user never has to come back to a form to finish.
//   2. updateUser({ email }, { emailRedirectTo }) — attaches the email to the
//      SAME auth user (same id, all progress intact).
//   3. Re-read the authoritative user:
//        - already permanent  -> conversion is DONE. Sync the profile and let
//          the caller route onward immediately. This is the path taken when
//          the project does not require email confirmation, and it is what
//          makes an unverified account a normal, usable account (AUTH1 §3).
//        - still anonymous    -> a confirmation link is required. Persist the
//          pending record and show the (retained) verification screen. The
//          password is already set, so /auth/callback has nothing left to ask.
//   4. profiles.is_anonymous is synced only once auth is authoritatively
//      non-anonymous — in step 3 or in the callback, never optimistically.
//
// Verification INFRASTRUCTURE is deliberately intact: the pending record, the
// resend, the callback and the confirmation screens all still exist, so
// verification can be reintroduced later as an optional incentive without
// rebuilding any of it. What changed is that it no longer BLOCKS.
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
  /**
   * A password was ALREADY set on this auth user before the email was sent
   * (AUTH1 password-first order). The confirmation callback uses this to skip
   * its password step — there is nothing left to collect. Absent on records
   * written by the pre-AUTH1 email-first flow, which is why the callback
   * treats it as "false unless explicitly true" rather than defaulting to
   * true: an old pending record must still get its password screen.
   *
   * NEVER the password itself — no secret is persisted here, ever.
   */
  passwordSet?: boolean;
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
      return {
        userId: parsed.userId,
        email: parsed.email,
        returnTo: parsed.returnTo,
        passwordSet: parsed.passwordSet === true,
      };
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
  /**
   * The account became permanent DURING this call — no confirmation link is
   * needed and the caller should route the user onward right now. False (or
   * absent) means a confirmation email is outstanding.
   */
  converted?: boolean;
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
 * Upgrade the CURRENT anonymous guest to a permanent account in place.
 *
 * NEVER signs out and NEVER calls signUp() — those orphaned the guest profile
 * and its progress. Requires the caller to have confirmed a current anonymous
 * user (id passed in) and to have validated the password against
 * `validateNewPassword`.
 *
 * Resolves with `converted: true` when the account is permanent already (no
 * email round-trip needed), or `converted: false` with a pending record
 * persisted (no secrets) so the verification screen survives a reload.
 */
export async function initiateAnonymousEmailUpgrade(params: {
  userId: string;
  email: string;
  /** The password to set on the account, already validated by the caller. */
  password: string;
  redirectTo: string;
}): Promise<UpgradeResult> {
  const email = params.email.trim();

  // Step 1 — password on the current anonymous user. Done first so that
  // whichever branch step 2 takes, the credential already exists.
  const pwRes = await supabase.auth.updateUser({ password: params.password });
  if (pwRes.error) return toUpgradeError(pwRes.error.message);

  // Step 2 — attach the email to the SAME auth user.
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: params.redirectTo },
  );
  if (error) return toUpgradeError(error.message);

  // Step 3 — ask auth what actually happened rather than assuming. When the
  // project does not require confirmation the user is already permanent here.
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (isConvertedPermanentUser(user)) {
    const sync = await syncProfilePermanent(params.userId);
    if (!sync.ok) return sync;
    clearPendingUpgrade();
    return { ok: true, converted: true };
  }

  // Confirmation outstanding: keep the (retained) pending flow, now knowing
  // the password is already set so the callback has nothing to collect.
  writePendingUpgrade({
    userId: params.userId,
    email,
    returnTo: params.redirectTo,
    passwordSet: true,
  });
  return { ok: true, converted: false };
}

/**
 * Re-send the confirmation email for an upgrade already in flight.
 *
 * Re-issues the SAME email update, which is what makes Supabase send another
 * confirmation link. Deliberately does not touch the password: it was already
 * set when the upgrade was initiated, and asking for it again would be a
 * second credential prompt for one account.
 */
export async function resendUpgradeConfirmation(params: {
  email: string;
  redirectTo: string;
}): Promise<UpgradeResult> {
  const { error } = await supabase.auth.updateUser(
    { email: params.email.trim() },
    { emailRedirectTo: params.redirectTo },
  );
  if (error) return toUpgradeError(error.message);
  return { ok: true, converted: false };
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
