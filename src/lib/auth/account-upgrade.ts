// ---------------------------------------------------------------------------
// Anonymous guest -> permanent account upgrade.
//
// Single source of truth for the conversion. Every anonymous "Create account" /
// "Save progress" surface routes through these helpers.
//
// AUTH2 — WHY THIS WAS REWRITTEN
// ------------------------------
// AUTH1 ordered the conversion password-FIRST:
//     1. updateUser({ password })   // on the still-anonymous user
//     2. updateUser({ email })
// Step 1 is rejected by the auth server, every time, with
//     422 validation_failed
//     "Updating password of an anonymous user without an email or phone is
//      not allowed"
// so guest signup could not succeed at all. The AUTH1 note claimed the order
// was "verified against auth-js 2.97.0", but this rule lives in the GoTrue
// SERVER, not the JS client — checking the client version could not have
// caught it. Measured against the live project rather than reasoned about
// (docs/AUTH2_AUDIT.md records the probe output).
//
// THE FLOW NOW — one call, one round trip:
//   1. updateUser({ email, password }) — the server accepts the password
//      because the same request carries the email that de-anonymises the user.
//      The auth user id is UNCHANGED, so every row already keyed to this guest
//      (profile, XP, streak, tutorial stamp, quiz + Ranked history, settings)
//      stays exactly where it is. Nothing is copied, so nothing can be lost in
//      the copying. Measured: same uid before and after, is_anonymous false,
//      email_confirmed_at set, an "email" identity attached, session still
//      live, and the new credential works for a fresh sign-in.
//   2. Re-read the authoritative user:
//        - permanent  -> conversion is DONE; sync the profile flag and let the
//          caller route onward immediately. This is the normal path.
//        - still anonymous -> the project requires a confirmation link, so
//          persist the pending record and show the (retained) verification
//          screen. The password is already set; the callback asks nothing.
//   3. profiles.is_anonymous is synced only once auth is authoritatively
//      non-anonymous — never optimistically.
//
// A narrow fallback covers the ordering rule being tightened in a future
// GoTrue (email-then-password, which also works today). It is keyed to that
// one error, so it cannot mask an unrelated failure.
//
// Verification INFRASTRUCTURE is deliberately intact: the pending record, the
// resend, the callback and the confirmation screens all still exist, so
// verification can return later as an optional incentive without rebuilding
// any of it. It simply does not BLOCK.
//
// linkIdentity() is NOT used: in auth-js 2.97.0 it only accepts OAuth/OIDC
// credentials, not email/password.
//
// SECURITY: passwords are NEVER persisted here — not in storage, not in the
// pending record, not in redirect URLs. Only the (non-secret) user id + the
// entered email are remembered so the pending screen survives a reload.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { mapAuthError, type SupabaseAuthErrorLike } from "@/lib/auth/auth-errors";

const PENDING_KEY = "mogzy.account-upgrade.pending.v1";

export interface PendingUpgrade {
  /** The anonymous auth user id being upgraded (not a secret; already in JWT). */
  userId: string;
  /** The email the user asked us to attach. */
  email: string;
  /** Where to send the user after conversion completes (already validated). */
  returnTo: string;
  /**
   * A password was ALREADY set on this auth user before the email was sent, so
   * the confirmation callback can skip its password step. Absent on records
   * written by the pre-AUTH1 email-first flow, which is why the callback treats
   * it as "false unless explicitly true".
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
  /** Safe, user-facing error message when ok === false. Never a raw auth string. */
  error?: string;
  /** True when the email is already attached to an account — offer Sign In. */
  emailInUse?: boolean;
  /**
   * The account became permanent DURING this call — no confirmation link is
   * needed and the caller should route the user onward right now. False (or
   * absent) means a confirmation email is outstanding.
   */
  converted?: boolean;
}

/** Normalize an auth error into a safe, user-facing result. */
function toUpgradeError(error: SupabaseAuthErrorLike | null | undefined): UpgradeResult {
  const mapped = mapAuthError(error, "upgrade");
  return {
    ok: false,
    emailInUse: mapped.kind === "email_in_use",
    // The panel renders a "Sign in" button immediately after this text, so the
    // shared copy ("That email already has an account.") is the whole sentence
    // — appending "Sign in instead." made it read "…Sign in instead. Sign in".
    error: mapped.message,
  };
}

/**
 * The one error that means "this server wants the email attached before the
 * password". Matched narrowly — on the anonymous-password sentence itself —
 * so the fallback below can never swallow an unrelated validation failure.
 */
function isAnonymousPasswordRejection(error: SupabaseAuthErrorLike | null | undefined): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("anonymous user") && msg.includes("password");
}

/**
 * Upgrade the CURRENT anonymous guest to a permanent account in place.
 *
 * NEVER signs out and NEVER calls signUp(). signUp() with an anonymous session
 * active mints a DIFFERENT user id (measured), which would strand every row
 * belonging to the guest — that is the failure mode this whole module exists
 * to avoid.
 *
 * Requires the caller to have confirmed a current anonymous user (id passed in)
 * and to have validated the password against `validateNewPassword`.
 */
export async function initiateAnonymousEmailUpgrade(params: {
  userId: string;
  email: string;
  /** The password to set on the account, already validated by the caller. */
  password: string;
  redirectTo: string;
}): Promise<UpgradeResult> {
  const email = params.email.trim();

  // Step 1 — email AND password in ONE request. Attaching the email in the
  // same call is what makes setting the password legal on an anonymous user.
  let res = await supabase.auth.updateUser(
    { email, password: params.password },
    { emailRedirectTo: params.redirectTo },
  );

  if (res.error && isAnonymousPasswordRejection(res.error)) {
    // A stricter server validated the password against the STORED user row
    // rather than this request. Attaching the email de-anonymises the user, so
    // the password becomes legal on a second call. Also verified to work.
    const emailRes = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: params.redirectTo },
    );
    if (emailRes.error) return toUpgradeError(emailRes.error);
    res = await supabase.auth.updateUser({ password: params.password });
  }

  if (res.error) return toUpgradeError(res.error);

  // Step 2 — ask auth what actually happened rather than assuming. When the
  // project does not require confirmation the user is already permanent here.
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (isConvertedPermanentUser(user)) {
    // The account IS permanent from this point on. A failure to flip the
    // DERIVED profile flag must not be reported as "signup failed" and must not
    // send the user back to a form — the credential already works, so telling
    // them it didn't would be false and would dead-end them. It is repaired
    // instead: syncProfilePermanent retries, and ensureProfilePermanent (called
    // on every load of a permanent session) catches anything that still slipped.
    const sync = await syncProfilePermanent(params.userId);
    if (!sync.ok) {
      console.error("[auth:upgrade] profile flag not synced; will self-repair", sync.error);
    }
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
  if (error) return toUpgradeError(error);
  return { ok: true, converted: false };
}

/**
 * Set a password on the ALREADY-VERIFIED (non-anonymous) session. Call only
 * from the confirmation callback after auth is authoritatively non-anonymous.
 */
export async function setPasswordForVerifiedUser(password: string): Promise<UpgradeResult> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return toUpgradeError(error);
  return { ok: true };
}

/**
 * Sync the DERIVED profile flag once auth is authoritatively non-anonymous.
 * Touches only is_anonymous on the same user_id — never tutorial columns, XP,
 * streaks, or history — then re-reads to confirm. Retry-safe, and retries once
 * itself because the cost of leaving the flag stale is real: the admin
 * `purge-anonymous-users` function selects rows by `profiles.is_anonymous` and
 * hard-deletes the auth user, so a permanent account still flagged anonymous is
 * on a deletion path.
 */
export async function syncProfilePermanent(userId: string): Promise<UpgradeResult> {
  let last: UpgradeResult = { ok: false, error: "Profile sync did not run." };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    last = await syncProfilePermanentOnce(userId);
    if (last.ok) return last;
  }
  return last;
}

async function syncProfilePermanentOnce(userId: string): Promise<UpgradeResult> {
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
    return { ok: false, error: "Profile did not confirm as permanent." };
  }
  return { ok: true };
}

/**
 * Self-repair for a permanent account whose profile still says anonymous.
 *
 * Cheap (one indexed read) and a no-op in the overwhelming majority of loads.
 * It exists because the two states are written by two different systems: auth
 * flips `is_anonymous` server-side during conversion, while the profile flag is
 * a separate client write that can fail on a dropped connection, a closed tab,
 * or a transient RLS hiccup. When they disagree, `purge-anonymous-users`
 * believes the profile — and hard-deletes a real account. Reconciling on load
 * closes that window for accounts already stuck in it, not just future ones.
 *
 * Never throws and never blocks a caller: it is fire-and-forget by design.
 */
export async function ensureProfilePermanent(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("is_anonymous")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data || data.is_anonymous !== true) return;
    await supabase.from("profiles").update({ is_anonymous: false }).eq("user_id", userId);
  } catch {
    /* best effort — a failure here leaves exactly the state we started with */
  }
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
