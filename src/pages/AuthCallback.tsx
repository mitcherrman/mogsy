// ---------------------------------------------------------------------------
// /auth/callback — completes the anonymous -> permanent conversion.
//
// Supabase (detectSessionInUrl, default on) processes the confirmation link and
// establishes the verified session. This page then, from AUTHORITATIVE auth
// state only:
//   1. confirms a non-anonymous user with an email identity exists,
//   2. verifies the id matches the pending upgrade (when known),
//   3. collects a password (email-first flow) via updateUser({ password }),
//   4. syncs profiles.is_anonymous = false (same row, nothing else),
//   5. routes by existing tutorial eligibility.
//
// Idempotent: a duplicate/re-opened callback with the pending record already
// cleared just re-syncs (no-op) and routes.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Mail, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { safeReturnPath } from "@/lib/auth/safe-return";
import {
  clearPendingUpgrade,
  isConvertedPermanentUser,
  readPendingUpgrade,
  setPasswordForVerifiedUser,
  syncProfilePermanent,
} from "@/lib/auth/account-upgrade";
import { computePostConversionDestination } from "@/lib/auth/post-conversion-route";
import type { RankedTutorialProfileFields } from "@/lib/ranked-tutorial/onboarding";

type Phase = "checking" | "password_required" | "synchronizing" | "error" | "mismatch";

const PROFILE_SELECT =
  "is_anonymous, onboarding_completed, ranked_tutorial_completed_at, ranked_tutorial_version";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));

  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const ranRef = useRef(false); // guard duplicate callback execution

  // Surface an explicit error carried on the callback URL (expired/used link).
  const urlError =
    searchParams.get("error_description") || searchParams.get("error") || null;

  /** Route by authoritative profile/tutorial state, then finish. */
  const finishAndRoute = useCallback(
    async (userId: string) => {
      const syncRes = await syncProfilePermanent(userId);
      if (!syncRes.ok) {
        setMessage(syncRes.error ?? "Could not finish syncing your profile.");
        setPhase("error");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("user_id", userId)
        .maybeSingle();
      clearPendingUpgrade();
      const dest = computePostConversionDestination(
        (data as RankedTutorialProfileFields | null) ?? null,
        returnTo,
      );
      toast({ title: "Account created!", description: "Your progress has been saved." });
      navigate(dest, { replace: true });
    },
    [navigate, returnTo, toast],
  );

  // Initial authoritative check once auth has settled.
  useEffect(() => {
    if (authLoading || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      if (urlError) {
        setMessage(urlError);
        setPhase("error");
        return;
      }

      // Authoritative user (not optimistic pre-redirect state).
      const { data, error } = await supabase.auth.getUser();
      const user = data?.user ?? null;

      if (error || !user) {
        setMessage(
          "We couldn't verify this link. It may have expired or already been used.",
        );
        setPhase("error");
        return;
      }

      if (!isConvertedPermanentUser(user)) {
        // Session exists but is still anonymous / no email identity — the link
        // did not convert the account.
        setMessage(
          "This link didn't finish creating your account. Try the confirmation link again, or start over.",
        );
        setPhase("error");
        return;
      }

      const pending = readPendingUpgrade();
      if (pending && pending.userId !== user.id) {
        // The verified identity is not the guest we started upgrading — never
        // sync a mismatched profile.
        setPhase("mismatch");
        return;
      }

      if (pending) {
        // Fresh email-first conversion: collect the password now.
        setPhase("password_required");
        return;
      }

      // No pending record (duplicate/cross-context callback): auth is already
      // permanent, so just (idempotently) sync the profile and route.
      setPhase("synchronizing");
      await finishAndRoute(user.id);
    })();
  }, [authLoading, urlError, finishAndRoute]);

  const submitPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return; // duplicate submit guard
      if (password.length < 6) {
        setMessage("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setMessage("Passwords don't match.");
        return;
      }
      setBusy(true);
      setMessage("");

      // Re-read authoritative user right before writing the password.
      const { data } = await supabase.auth.getUser();
      const user = data?.user ?? null;
      if (!user || !isConvertedPermanentUser(user)) {
        setBusy(false);
        setMessage("Your verified session was lost. Please open the confirmation link again.");
        setPhase("error");
        return;
      }
      const pending = readPendingUpgrade();
      if (pending && pending.userId !== user.id) {
        setBusy(false);
        setPhase("mismatch");
        return;
      }

      const pwRes = await setPasswordForVerifiedUser(password);
      if (!pwRes.ok) {
        setBusy(false);
        setMessage(pwRes.error ?? "Could not set your password. Please try again.");
        return;
      }
      setPhase("synchronizing");
      await finishAndRoute(user.id);
      setBusy(false);
    },
    [busy, password, confirmPassword, finishAndRoute],
  );

  // ---- render ----
  if (phase === "checking" || phase === "synchronizing") {
    return (
      <Shell>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground" data-testid="callback-checking">
          {phase === "synchronizing" ? "Finishing up…" : "Verifying your account…"}
        </p>
      </Shell>
    );
  }

  if (phase === "mismatch") {
    return (
      <Shell>
        <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden />
        <h2 className="text-lg font-bold text-foreground">Account mismatch</h2>
        <p className="text-sm text-muted-foreground" data-testid="callback-mismatch">
          This confirmation is for a different account than the guest session on this device. We
          didn&apos;t change anything. Sign in to that account instead.
        </p>
        <Button className="w-full" onClick={() => navigate("/auth")}>
          Go to sign in
        </Button>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <Mail className="h-8 w-8 text-primary" aria-hidden />
        <h2 className="text-lg font-bold text-foreground">Couldn&apos;t finish</h2>
        <p className="text-sm text-muted-foreground" data-testid="callback-error">
          {message}
        </p>
        <div className="w-full space-y-2">
          <Button className="w-full" onClick={() => navigate("/auth?mode=signup")}>
            Start account creation again
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate(returnTo)}>
            Continue using Mogzy
          </Button>
        </div>
      </Shell>
    );
  }

  // password_required
  return (
    <Shell>
      <h2 className="text-lg font-bold text-foreground">Set your password</h2>
      <p className="text-sm text-muted-foreground text-center">
        Your email is confirmed and your progress is saved. Choose a password to finish.
      </p>
      <form onSubmit={submitPassword} className="w-full space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cb-password">Password</Label>
          <Input
            id="cb-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            data-testid="callback-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cb-confirm">Confirm password</Label>
          <Input
            id="cb-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            data-testid="callback-confirm"
          />
        </div>
        {message && (
          <p className="text-sm text-destructive" role="alert" data-testid="callback-password-error">
            {message}
          </p>
        )}
        <Button type="submit" variant="hero" className="w-full" disabled={busy} data-testid="callback-set-password">
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Finish creating account
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 flex flex-col items-center gap-4 text-center">
        {children}
      </div>
    </div>
  );
}
