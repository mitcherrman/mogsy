import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import mogsyLogo from "@/assets/mogsy-logo-text.png";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/SEOHead";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import { LEAGUE_ONLY_MODE, LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { resetGateState } from "@/lib/quiz/onboarding-gate";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { resolveReturnTo } from "@/lib/auth/auth-destination";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT, validateNewPassword } from "@/lib/auth/password-policy";
import { mapAuthError } from "@/lib/auth/auth-errors";
import AccountUpgradePanel from "@/components/auth/AccountUpgradePanel";
import PasswordField from "@/components/auth/PasswordField";
import UsernameField from "@/components/auth/UsernameField";
import { claimUsername } from "@/lib/identity/claim-username";
import { readPreferredUsername } from "@/lib/identity/preferred-username";
import { usernameProblem, USERNAME_MESSAGES } from "@/lib/identity/username";

type AuthMode = "signin" | "signup" | "forgot" | "confirm-sent" | "reset-sent";

export default function Auth() {
  const [searchParamsInit] = useState(() => new URLSearchParams(window.location.search));
  const initialMode = searchParamsInit.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // AUTH3 — the public Mogzy name, seeded from whatever identity this visitor
  // has already chosen. On this form there is no session yet, so the only
  // source available is the Academy registration on the device; the guest
  // upgrade panel, which DOES have a session, also considers the profile.
  // Read once, at mount: re-reading would fight the user's own edits.
  const [username, setUsername] = useState(() => readPreferredUsername().value);
  const [usernameCarried] = useState(() => readPreferredUsername().source !== "none");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /**
   * The account was created, but the username it asked for was taken.
   *
   * This state exists because the two halves of signup have different
   * reversibility. Creating the account is done and cannot be repeated —
   * pressing the button again would hit "User already registered" and bounce
   * the user, who has done nothing wrong, into the sign-in form. Choosing the
   * name is the half that failed and the only half left to retry, so from here
   * the form is a name picker with a working session behind it.
   */
  const [awaitingUsername, setAwaitingUsername] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");
  const defaultReturnTo = LEAGUE_ONLY_MODE ? LEAGUE_HOME_ROUTE : "/home";

  // Only allow safe same-origin relative paths (blocks //evil.com open
  // redirects). `explicit` records whether the user really was heading
  // somewhere, which is what gives this destination precedence over the hub
  // default and over onboarding (see lib/auth/auth-destination.ts).
  const resolvedReturn = resolveReturnTo(searchParams.get("returnTo"), defaultReturnTo);
  const safeReturnTo = resolvedReturn.path;

  const isAnonymous = user?.is_anonymous === true;
  const [showLinkFlow, setShowLinkFlow] = useState(false);
  const cameFromQuiz = initialMode === "signup" && safeReturnTo.startsWith("/quiz");

  // Funnel: signup page viewed via the post-quiz gate, once per mount.
  useEffect(() => {
    if (cameFromQuiz) {
      trackFunnelEvent("auth_signup_viewed_from_quiz", { returnTo: safeReturnTo });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guest-first onboarding: a guest arriving at "sign up" defaults into the
  // account-link flow so their anonymous quiz progress carries over.
  useEffect(() => {
    if (isAnonymous && initialMode === "signup") {
      setShowLinkFlow(true);
    }
  }, [isAnonymous, initialMode]);

  // Store invite code
  useEffect(() => {
    if (inviteCode) {
      localStorage.setItem("mogsy-invite-code", inviteCode);
    }
  }, [inviteCode]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const redeemInvite = async (userId: string) => {
    const code = localStorage.getItem("mogsy-invite-code");
    if (!code) return;

    try {
      const { data, error } = await supabase.rpc("redeem_invite_link", {
        _code: code,
        _user_id: userId,
      });

      if (error) {
        console.error("Invite redemption error:", error.message);
      }
    } catch (e) {
      console.error("Invite redemption failed:", e);
    }

    localStorage.removeItem("mogsy-invite-code");
  };

  const handleResendConfirmation = async () => {
    if (!email || resendCooldown > 0) return;
    setResendLoading(true);
    // Re-signup with same email triggers a new confirmation email
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setResendLoading(false);
    if (error) {
      toast({ title: "Failed to resend", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email sent!", description: "Check your inbox (and spam folder)." });
      setResendCooldown(60);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    // Carry the destination through the email round-trip so a reset started
    // from a specific page returns there instead of the generic home.
    const resetRedirect = `${window.location.origin}/reset-password?returnTo=${encodeURIComponent(safeReturnTo)}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: resetRedirect,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMode("reset-sent");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "signin") {
      // AUTH2: do NOT sign out first. signInWithPassword replaces the session
      // on success all by itself (measured), so the pre-emptive signOut bought
      // nothing — and it cost the user their guest session on every FAILED
      // attempt. One typo'd password used to end the anonymous session, and an
      // anonymous session has no credential to get back into: the guest's XP,
      // streak and history became permanently unreachable because they
      // mistyped. Signing in over the live session keeps the guest intact when
      // the attempt fails, and replaces it cleanly when it succeeds.
      const { error } = await signIn(email, password);
      if (error) {
        const mapped = mapAuthError(error, "signin");
        if (mapped.kind === "email_not_confirmed") {
          toast({ title: "Confirm your email", description: mapped.message, variant: "destructive" });
          setMode("confirm-sent");
        } else {
          toast({ title: "Couldn't sign in", description: mapped.message, variant: "destructive" });
        }
      } else {
        resetGateState();
        // `replace` so the browser Back button from the destination returns to
        // where the user was before the interruption, not to the auth form
        // they just completed.
        navigate(safeReturnTo, { replace: true });
      }
    } else if (mode === "signup") {
      setSubmitted(true);
      // AUTH3 — shape is checked before anything irreversible happens. It is
      // the same rule the database holds, so a name that passes here fails
      // afterwards only for the one reason the client genuinely cannot know:
      // somebody else has it.
      const nameProblem = usernameProblem(username);
      if (nameProblem) {
        setUsernameError(USERNAME_MESSAGES[nameProblem]);
        setLoading(false);
        return;
      }
      setUsernameError(null);
      // The account already exists and only the name is outstanding: claim it
      // and go. Never a second signUp() — see awaitingUsername.
      if (awaitingUsername) {
        const retry = await claimUsername(username, { onlyIfUnset: true });
        if (!retry.ok) {
          setUsernameError(retry.error ?? USERNAME_MESSAGES.unavailable);
          setLoading(false);
          return;
        }
        setAwaitingUsername(false);
        toast({ title: `Welcome to Mogzy, ${retry.username}!` });
        navigate(safeReturnTo, { replace: true });
        setLoading(false);
        return;
      }
      // One shared policy — length only, no composition rules, and no
      // confirmation field to satisfy (AUTH2; see components/auth/PasswordField).
      const pw = validateNewPassword(password);
      if (!pw.ok) {
        toast({ title: pw.error, variant: "destructive" });
        setLoading(false);
        return;
      }
      // Anonymous guests never reach this branch — they render the email-first
      // AccountUpgradePanel instead (see render gate). This path is only for a
      // brand-new account with no active guest session: never sign out + signUp
      // an anonymous user (that orphaned the guest profile and progress).
      if (isAnonymous) {
        setLoading(false);
        return;
      }
      // The name rides along as auth metadata so handle_new_user() writes it
      // on the profile row it is already creating. That is the whole
      // carry-forward: no second write, no window where the account is
      // nameless, and nothing for the user to retype.
      const { error, session } = await signUp(email, password, username);
      if (error) {
        const mapped = mapAuthError(error, "signup");
        if (mapped.offerSignIn) {
          // AUTH2: this branch used to test for the literal "already been
          // registered" while the server actually says "User already
          // registered", so the ONE error with an obvious next step fell
          // through to the generic handler and printed the raw string. The
          // shared mapper decides now. The email stays in the field and the
          // returnTo is untouched, so signing in is one password away.
          toast({
            title: "You already have an account",
            description: "Signed up before? Enter your password to sign in.",
          });
          setPassword("");
          setMode("signin");
        } else {
          toast({ title: "Couldn't create your account", description: mapped.message, variant: "destructive" });
        }
      } else {
        if (cameFromQuiz) {
          trackFunnelEvent("auth_signup_completed_from_quiz", { returnTo: safeReturnTo, flow: "email_signup" });
        }
        resetGateState();
        // handle_new_user() takes the name only if it was valid AND free. It
        // cannot report which, and it must not fail the signup to say so — an
        // account that exists and works is never worth refusing over a name.
        // So the claim is confirmed here, now that there is a session to make
        // it with: normally a no-op that agrees with the trigger, and
        // otherwise the one place the user is told the name is taken. The
        // account is already usable either way, which is why this changes the
        // form rather than the destination.
        if (session) {
          const claim = await claimUsername(username, { onlyIfUnset: true });
          if (!claim.ok && claim.taken) {
            setAwaitingUsername(true);
            setUsernameError(claim.error ?? USERNAME_MESSAGES.taken);
            toast({
              title: "Pick another username",
              description: "Your account is ready — that name is just already taken.",
            });
            setLoading(false);
            return;
          }
        }
        if (session) {
          // AUTH1 §3: the account is signed in and usable right now. Email
          // verification must not stand between signing up and continuing, so
          // resume the user's destination instead of parking them on a
          // check-your-email screen. That screen is retained below for the
          // branch where Supabase genuinely withholds the session.
          toast({ title: "Welcome to Mogzy!", description: "Your account is ready." });
          navigate(safeReturnTo, { replace: true });
        } else {
          setMode("confirm-sent");
        }
      }
    }

    setLoading(false);
  };

  // Confirmation sent / Reset sent screens
  if (mode === "confirm-sent" || mode === "reset-sent") {
    return (
      <div className="flex min-h-dvh items-start min-[768px]:items-center justify-center overflow-y-auto px-4 py-8">
        <SEOHead title="Check Your Email — Mogzy" description="Confirm your email to finish signing up for Mogzy." />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 text-center"
        >
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {mode === "confirm-sent" ? "Confirm your email" : "Check your email"}
          </h2>
          <p className="text-sm text-muted-foreground mb-1">
            We sent an email to
          </p>
          <p className="text-sm font-semibold text-foreground mb-4">{email}</p>
          <p className="text-xs text-muted-foreground mb-6">
            {mode === "confirm-sent"
              ? "Click the link in the email to activate your account. Check your spam folder if you don't see it."
              : "Click the link to reset your password."}
          </p>

          {mode === "confirm-sent" && (
            <div className="space-y-3 mb-6">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResendConfirmation}
                disabled={resendLoading || resendCooldown > 0}
              >
                {resendLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend confirmation email"}
              </Button>
            </div>
          )}

          {/* Verification is not a blocker (AUTH1 §3): whenever this screen
              does appear, the way out of it is forward, not back. */}
          <Button
            variant="hero"
            className="w-full mb-2"
            data-testid="confirm-sent-continue"
            onClick={() => navigate(safeReturnTo, { replace: true })}
          >
            Continue to Mogzy
          </Button>
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => setMode("signin")}
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Button>
        </motion.div>
      </div>
    );
  }

  // Forgot password screen
  if (mode === "forgot") {
    return (
      <div className="flex min-h-dvh items-start min-[768px]:items-center justify-center overflow-y-auto px-4 py-8">
        <SEOHead title="Reset Password — Mogzy" description="Reset your Mogzy password." />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8"
        >
          <div className="mb-6 text-center">
            <Link to="/" className="inline-block mb-4">
              <img src={mogsyLogo} alt="Mogzy" className="h-12 mx-auto" />
            </Link>
            <h2 className="text-xl font-bold text-foreground">Reset your password</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your email and we'll send a reset link
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Reset Link
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button variant="ghost" className="gap-2 text-sm" onClick={() => setMode("signin")}>
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Anonymous guest choosing to create an account -> the single shared,
  // confirmation-aware upgrade flow (email-first). Never signs out, never
  // signUp(): the current guest identity is upgraded in place.
  if (isAnonymous && (mode === "signup" || showLinkFlow)) {
    return (
      <div className="flex min-h-dvh items-start min-[768px]:items-center justify-center overflow-y-auto px-4 py-8">
        <SEOHead
          title="Save Your Progress — Mogzy"
          description="Create a free Mogzy account to keep your XP, streaks, and progress."
        />
        <AccountUpgradePanel
          returnTo={safeReturnTo}
          onSignInInstead={() => {
            setShowLinkFlow(false);
            setMode("signin");
          }}
        />
      </div>
    );
  }

  // Main sign in / sign up form
  return (
    <div className="flex min-h-dvh items-start min-[768px]:items-center justify-center overflow-y-auto px-4 py-8">
      <SEOHead
        title={mode === "signup" ? "Sign Up — Mogzy" : "Sign In — Mogzy"}
        description="Sign in or create your Mogzy account. Start voting, competing, and climbing the leaderboard."
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8"
      >
        <div className="mb-6 text-center">
          <Link to="/" className="inline-block mb-4">
            <img src={mogsyLogo} alt="Mogzy" className="h-14 mx-auto" />
          </Link>
          {/* An anonymous guest with showLinkFlow set never reaches this form —
              the AccountUpgradePanel branch above returns first — so the
              "claim your account" header this used to carry was unreachable. */}
          <h2 className="text-xl font-bold text-foreground">
            {mode === "signin"
              ? "Welcome back"
              : awaitingUsername
                ? "Pick your username"
                : "Create your account"}
          </h2>
          {inviteCode && mode === "signup" && (
            <p className="text-xs text-primary font-medium mt-2">🎁 You've been invited! Sign up to claim your rewards.</p>
          )}
        </div>

        {/* Sign In / Sign Up toggle tabs */}
        {!showLinkFlow && !awaitingUsername && (
          <div className="flex rounded-lg bg-muted p-1 mb-6">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-2.5 min-h-11 text-sm font-bold transition-all ${
                mode === "signin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-2.5 min-h-11 text-sm font-bold transition-all ${
                mode === "signup"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* AUTH2 §6 — a guest signing in to an EXISTING account switches
            identity, and the progress built up in this guest session belongs to
            the guest, not to that account. There is no merge, so the honest
            thing is to say so BEFORE the switch and point at the option that
            does keep it. Silently swapping accounts and leaving the user to
            notice their streak vanished is the outcome this replaces. */}
        {isAnonymous && mode === "signin" && (
          <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3" data-testid="guest-signin-notice">
            <p className="text-xs text-muted-foreground">
              Signing in switches to your existing account. Progress from this guest session
              stays with the guest and won&apos;t move over.{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setShowLinkFlow(true); }}
                className="text-primary font-semibold hover:underline"
              >
                Create an account instead
              </button>{" "}
              to keep it.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* AUTH3: signup only. Sign in is email + password and stays that
              way — a returning user proves who they are with a credential,
              never by remembering their public name. */}
          {mode === "signup" && (
            <UsernameField
              id="signup-username"
              value={username}
              onChange={(next) => {
                setUsername(next);
                setUsernameError(null);
              }}
              submitted={submitted}
              error={usernameError}
              carriedForward={usernameCarried}
              data-testid="signup-username-input"
            />
          )}
          {/* Both credentials are already set once the account exists; only
              the name is outstanding, so this is a name picker from here. */}
          {!awaitingUsername && (
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          )}
          {/* AUTH2: one password field with a reveal toggle. The confirmation
              field it replaces caught typos only for people not using a
              password manager, and guarded the one failure that "Forgot
              password?" already fixes in a click. */}
          {!awaitingUsername && (
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            labelAction={
              mode === "signin" ? (
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              ) : null
            }
          />
          )}

          {mode === "signup" && !awaitingUsername && (
            <p className="text-[10px] text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
          )}

          <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {mode === "signin" ? "Sign In" : awaitingUsername ? "Choose Username" : "Create Account"}
          </Button>
        </form>

        {/* Quick switch hint at bottom. Suppressed while a just-created account
            is choosing its name — there is nothing to switch to. */}
        <p className="mt-5 text-center text-xs text-muted-foreground" hidden={awaitingUsername}>
            {mode === "signin" ? (
              <>New to Mogzy?{" "}
                <button onClick={() => setMode("signup")} className="text-primary font-semibold hover:underline">
                  Create an account
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={() => setMode("signin")} className="text-primary font-semibold hover:underline">
                  Sign in
                </button>
              </>
            )}
        </p>
        {/* The old "Link your account" hint lived here. A guest is now told what
            signing in costs them, inline and above the form, rather than being
            offered a second vocabulary ("link") for the same action. */}
      </motion.div>
    </div>
  );
}
