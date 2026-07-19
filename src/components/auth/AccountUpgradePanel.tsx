// ---------------------------------------------------------------------------
// AccountUpgradePanel — the single shared "Save your progress" upgrade UI for
// anonymous guests. Rendered by /auth (signup intent) and reusable elsewhere.
//
// Email-first: collects EMAIL ONLY, initiates the confirmation-aware upgrade,
// then shows a pending-verification state. The password is set later, after the
// verified session is restored (see /auth/callback). No password is collected
// or stored here.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccountUpgrade } from "@/lib/auth/useAccountUpgrade";

interface Props {
  /** Already-validated safe relative path for after conversion completes. */
  returnTo: string;
  /** Route to the sign-in view for an existing account (separate action). */
  onSignInInstead: () => void;
}

export default function AccountUpgradePanel({ returnTo, onSignInInstead }: Props) {
  const navigate = useNavigate();
  const upgrade = useAccountUpgrade(returnTo);
  const [emailInput, setEmailInput] = useState(upgrade.email);

  const busy = upgrade.phase === "submitting";

  if (upgrade.phase === "verification_pending") {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Check your email to finish creating your account</h2>
        <p className="text-sm text-muted-foreground">We sent a confirmation link to</p>
        <p className="text-sm font-semibold text-foreground" data-testid="pending-email">
          {upgrade.email}
        </p>
        <p className="text-xs text-muted-foreground">
          Your progress is safe. You can keep using Mogzy while you wait — click the link when it
          arrives to finish setting up your account. Check your spam folder if you don&apos;t see it.
        </p>

        <div className="space-y-2 pt-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void upgrade.resend()}
            disabled={upgrade.cooldown > 0}
            data-testid="upgrade-resend"
          >
            {upgrade.cooldown > 0 ? `Resend in ${upgrade.cooldown}s` : "Resend confirmation email"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={upgrade.changeEmail}
            data-testid="upgrade-change-email"
          >
            Use a different email
          </Button>
          <Button
            variant="hero"
            className="w-full"
            onClick={() => navigate(returnTo)}
            data-testid="upgrade-continue-guest"
          >
            Continue using Mogzy
          </Button>
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          Already have an account?{" "}
          <button onClick={onSignInInstead} className="text-primary font-semibold hover:underline">
            Sign in
          </button>
        </p>
      </div>
    );
  }

  // idle / submitting / error → email-only form
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-foreground">Save your progress</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create a free account to keep your XP, streaks, tutorial progress, and history — on the
          same profile you&apos;re using now.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void upgrade.submit(emailInput);
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="upgrade-email">Email</Label>
          <Input
            id="upgrade-email"
            type="email"
            placeholder="you@example.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            required
            autoComplete="email"
            data-testid="upgrade-email-input"
          />
          <p className="text-[11px] text-muted-foreground">
            We&apos;ll email you a link to confirm. You&apos;ll set a password after confirming.
          </p>
        </div>

        {upgrade.error && (
          <p className="text-sm text-destructive" role="alert" data-testid="upgrade-error">
            {upgrade.error}
            {upgrade.emailInUse && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={onSignInInstead}
                  className="text-primary font-semibold hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        )}

        <Button
          type="submit"
          variant="hero"
          className="w-full"
          size="lg"
          disabled={busy || upgrade.authLoading}
          data-testid="upgrade-submit"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Create account &amp; keep progress
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <button onClick={onSignInInstead} className="text-primary font-semibold hover:underline">
          Sign in
        </button>
      </p>
    </div>
  );
}
