// ---------------------------------------------------------------------------
// useAccountUpgrade — typed state machine for the anonymous -> permanent flow.
//
// Phases: idle -> submitting -> verification_pending (email sent), or -> error.
// The confirmation callback (/auth/callback) drives the rest (verifying,
// password, profile sync, complete). This hook owns only the INITIATION side.
//
// Guarantees: never signs out, never calls signUp(), blocks duplicate submits,
// enforces a resend cooldown, and survives reload via the pending record.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  clearPendingUpgrade,
  readPendingUpgrade,
} from "@/lib/auth/account-upgrade";

export type UpgradePhase = "idle" | "submitting" | "verification_pending" | "error";

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
  submit: (email: string) => Promise<void>;
  resend: () => Promise<void>;
  changeEmail: () => void;
}

/**
 * @param returnTo Already-validated safe relative path for post-conversion.
 */
export function useAccountUpgrade(returnTo: string): AccountUpgradeState {
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

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;

  const submit = useCallback(
    async (rawEmail: string) => {
      // Wait for auth to resolve; require an anonymous user; block duplicates.
      if (authLoading) return;
      if (submittingRef.current) return;
      const trimmed = rawEmail.trim();
      if (!trimmed) {
        setError("Enter your email to continue.");
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
      const res = await upgradeAnonymousEmail(trimmed, callbackUrl());
      submittingRef.current = false;
      if (res.ok) {
        setEmail(trimmed);
        setPhase("verification_pending");
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setError(res.error ?? "Could not start account creation.");
        setEmailInUse(!!res.emailInUse);
        setPhase("error");
      }
    },
    // callbackUrl is derived from returnTo; deps kept minimal & stable.
    [authLoading, user, upgradeAnonymousEmail, returnTo],
  );

  const resend = useCallback(async () => {
    if (cooldown > 0 || submittingRef.current) return;
    await submit(email);
  }, [cooldown, email, submit]);

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
