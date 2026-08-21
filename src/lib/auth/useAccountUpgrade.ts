// ---------------------------------------------------------------------------
// useAccountUpgrade — typed state machine for the anonymous -> permanent flow.
//
// Phases: idle -> submitting -> converted (account usable NOW) or
// verification_pending (confirmation email outstanding), or -> error.
//
// AUTH1: the common path is `converted`. Email and password are collected
// together and the account becomes permanent in one submit, so a guest never
// has to leave the site to finish signing up. `verification_pending` is the
// retained fallback for a project that requires email confirmation; the
// callback (/auth/callback) still drives that branch.
//
// Guarantees: never signs out, never calls signUp(), blocks duplicate submits,
// enforces a resend cooldown, and survives reload via the pending record.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  clearPendingUpgrade,
  readPendingUpgrade,
  resendUpgradeConfirmation,
} from "@/lib/auth/account-upgrade";
import { validateNewPassword } from "@/lib/auth/password-policy";
import { resetGateState } from "@/lib/quiz/onboarding-gate";

export type UpgradePhase =
  | "idle"
  | "submitting"
  | "verification_pending"
  | "converted"
  | "error";

const RESEND_COOLDOWN_SECONDS = 60;

export interface AccountUpgradeState {
  phase: UpgradePhase;
  email: string;
  error: string | null;
  /** Supabase reports the email already belongs to an account. */
  emailInUse: boolean;
  cooldown: number;
  isAnonymous: boolean;
  authLoading: boolean;
  /**
   * Collect email + password in ONE step. `confirmPassword` is optional so a
   * surface without a confirmation field can omit it; when present it is
   * checked by the shared policy, not by a local rule.
   */
  submit: (email: string, password: string, confirmPassword?: string) => Promise<void>;
  resend: () => Promise<void>;
  changeEmail: () => void;
}

/**
 * @param returnTo Already-validated safe relative path for post-conversion.
 * @param onConverted Called when the account became permanent immediately, so
 *        the caller can route the user back to what they were doing. Optional
 *        purely so tests and non-routing consumers can observe the phase.
 */
export function useAccountUpgrade(
  returnTo: string,
  onConverted?: (destination: string) => void,
): AccountUpgradeState {
  const { user, loading: authLoading, upgradeAnonymousEmail } = useAuth();

  const initialPending = useRef(readPendingUpgrade()).current;
  const [phase, setPhase] = useState<UpgradePhase>(
    initialPending ? "verification_pending" : "idle",
  );
  const [email, setEmail] = useState<string>(initialPending?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [emailInUse, setEmailInUse] = useState(false);
  const [cooldown, setCooldown] = useState(initialPending ? RESEND_COOLDOWN_SECONDS : 0);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /**
   * Where the confirmation link must land. Memoised on `returnTo` alone so the
   * two callbacks below can name it in their dependency arrays honestly —
   * previously it was a plain function recreated every render and therefore
   * silently omitted from both.
   */
  const callbackUrl = useCallback(
    () => `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );

  const submit = useCallback(
    async (rawEmail: string, password: string, confirmPassword?: string) => {
      // Wait for auth to resolve; require an anonymous user; block duplicates.
      if (authLoading) return;
      if (submittingRef.current) return;
      const trimmed = rawEmail.trim();
      if (!trimmed) {
        setError("Enter your email to continue.");
        setPhase("error");
        return;
      }
      // One policy, shared with every other password surface.
      const pw = validateNewPassword(password, confirmPassword);
      if (!pw.ok) {
        setError(pw.error ?? "Choose a password.");
        setPhase("error");
        return;
      }
      if (!user || user.is_anonymous !== true) {
        setError("No anonymous session to upgrade. Please reload the page.");
        setPhase("error");
        return;
      }
      submittingRef.current = true;
      setPhase("submitting");
      setError(null);
      setEmailInUse(false);
      const res = await upgradeAnonymousEmail(trimmed, password, callbackUrl());
      submittingRef.current = false;
      if (res.ok) {
        setEmail(trimmed);
        if (res.converted) {
          // The account is usable right now. Clear the guest signup gate and
          // hand the destination back so the caller can resume the user's
          // original intent — no inbox round-trip.
          resetGateState();
          setPhase("converted");
          onConverted?.(returnTo);
        } else {
          setPhase("verification_pending");
          setCooldown(RESEND_COOLDOWN_SECONDS);
        }
      } else {
        setError(res.error ?? "Could not start account creation.");
        setEmailInUse(!!res.emailInUse);
        setPhase("error");
      }
    },
    [authLoading, user, upgradeAnonymousEmail, returnTo, onConverted, callbackUrl],
  );

  /**
   * Re-send the confirmation email for the pending record.
   *
   * Reachable ONLY from the verification_pending screen, which exists only
   * when the project requires confirmation. The password is already set on the
   * account by then (see account-upgrade step 1), so this re-issues the email
   * via a plain email update rather than re-running the whole submit — asking
   * the user to retype a password they already chose would be nonsense.
   */
  const resend = useCallback(async () => {
    if (cooldown > 0 || submittingRef.current) return;
    if (!email) return;
    submittingRef.current = true;
    const res = await resendUpgradeConfirmation({ email, redirectTo: callbackUrl() });
    submittingRef.current = false;
    if (res.ok) {
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setError(res.error ?? "Could not resend the confirmation email.");
    }
  }, [cooldown, email, callbackUrl]);

  const changeEmail = useCallback(() => {
    clearPendingUpgrade();
    setPhase("idle");
    setError(null);
    setEmailInUse(false);
    setCooldown(0);
  }, []);

  return {
    phase,
    email,
    error,
    emailInUse,
    cooldown,
    isAnonymous: user?.is_anonymous === true,
    authLoading,
    submit,
    resend,
    changeEmail,
  };
}
