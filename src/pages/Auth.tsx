import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

type AuthMode = "signin" | "signup" | "forgot" | "confirm-sent" | "reset-sent";

export default function Auth() {
  const [searchParamsInit] = useState(() => new URLSearchParams(window.location.search));
  const initialMode = searchParamsInit.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { user, signIn, signUp, linkAnonymousAccount } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");
  const returnTo = searchParams.get("returnTo") || "/home";

  // Only allow relative paths to prevent open-redirect attacks.
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/home";

  const isAnonymous = user?.is_anonymous === true;
  const [showLinkFlow, setShowLinkFlow] = useState(false);

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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
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

    if (isAnonymous && showLinkFlow) {
      if (password !== confirmPassword) {
        toast({ title: "Passwords don't match", variant: "destructive" });
        setLoading(false);
        return;
      }
      const { error } = await linkAnonymousAccount(email, password);
      if (error) {
        toast({ title: "Linking failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Account created!", description: "Your progress has been saved." });
        if (user) await redeemInvite(user.id);
        navigate(safeReturnTo);
      }
      setLoading(false);
      return;
    }

    if (mode === "signin") {
      // Sign out anonymous session first so we can sign in as a real user
      if (isAnonymous) {
        await supabase.auth.signOut();
      }
      const { error } = await signIn(email, password);
      if (error) {
        if (error.message?.includes("Email not confirmed")) {
          toast({
            title: "Email not confirmed",
            description: "Check your inbox for a confirmation link, or resend it below.",
            variant: "destructive",
          });
          setMode("confirm-sent");
        } else if (error.message?.includes("Invalid login credentials")) {
          toast({
            title: "Invalid credentials",
            description: "Wrong email or password. Need an account? Switch to Sign Up.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Login failed", description: error.message, variant: "destructive" });
        }
      } else {
        navigate(safeReturnTo);
      }
    } else if (mode === "signup") {
      if (password !== confirmPassword) {
        toast({ title: "Passwords don't match", variant: "destructive" });
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        toast({ title: "Password too short", description: "Minimum 6 characters.", variant: "destructive" });
        setLoading(false);
        return;
      }
      // Sign out anonymous session first
      if (isAnonymous) {
        await supabase.auth.signOut();
      }
      const { error } = await signUp(email, password);
      if (error) {
        if (error.message?.includes("already been registered")) {
          toast({
            title: "Account already exists",
            description: "Try signing in instead, or reset your password.",
            variant: "destructive",
          });
          setMode("signin");
        } else {
          toast({ title: "Signup failed", description: error.message, variant: "destructive" });
        }
      } else {
        setMode("confirm-sent");
      }
    }

    setLoading(false);
  };

  // Confirmation sent / Reset sent screens
  if (mode === "confirm-sent" || mode === "reset-sent") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <SEOHead title="Check Your Email — Mogsy" description="Confirm your email to finish signing up for Mogsy." />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center"
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
      <div className="flex min-h-dvh items-center justify-center px-4">
        <SEOHead title="Reset Password — Mogsy" description="Reset your Mogsy password." />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-8"
        >
          <div className="mb-6 text-center">
            <Link to="/" className="inline-block mb-4">
              <img src={mogsyLogo} alt="Mogsy" className="h-12 mx-auto" />
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

  // Main sign in / sign up form
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <SEOHead
        title={mode === "signup" ? "Sign Up — Mogsy" : "Sign In — Mogsy"}
        description="Sign in or create your Mogsy account. Start voting, competing, and climbing the leaderboard."
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8"
      >
        <div className="mb-6 text-center">
          <Link to="/" className="inline-block mb-4">
            <img src={mogsyLogo} alt="Mogsy" className="h-14 mx-auto" />
          </Link>
          {isAnonymous && showLinkFlow ? (
            <>
              <h2 className="text-xl font-bold text-foreground">Claim your account</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Keep all your progress, matches, and settings
              </p>
            </>
          ) : (
            <h2 className="text-xl font-bold text-foreground">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
          )}
          {inviteCode && mode === "signup" && !showLinkFlow && (
            <p className="text-xs text-primary font-medium mt-2">🎁 You've been invited! Sign up to claim your rewards.</p>
          )}
        </div>

        {/* Sign In / Sign Up toggle tabs */}
        {!showLinkFlow && (
          <div className="flex rounded-lg bg-muted p-1 mb-6">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-2 text-sm font-bold transition-all ${
                mode === "signin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-2 text-sm font-bold transition-all ${
                mode === "signup"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {isAnonymous && showLinkFlow && (
          <div className="mb-4 rounded-lg bg-primary/10 border border-primary/20 p-3">
            <p className="text-xs text-primary font-medium">
              ✨ Your match history, Elo ratings, diamonds, and settings will all be preserved!
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>

          {/* Confirm password for signup / anonymous linking */}
          <AnimatePresence>
            {(mode === "signup" || showLinkFlow) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {(mode === "signup" || showLinkFlow) && (
            <p className="text-[10px] text-muted-foreground">
              Password must be at least 6 characters
            </p>
          )}

          <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {showLinkFlow
              ? "Create Account & Keep Progress"
              : mode === "signin"
              ? "Sign In"
              : "Create Account"}
          </Button>
        </form>

        {/* Quick switch hint at bottom */}
        {!showLinkFlow && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>New to Mogsy?{" "}
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
        )}

        {/* Link for anonymous users to keep progress */}
        {isAnonymous && !showLinkFlow && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Want to keep your current progress?{" "}
            <button onClick={() => setShowLinkFlow(true)} className="text-primary font-semibold hover:underline">
              Link your account
            </button>
          </p>
        )}
        {showLinkFlow && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <button onClick={() => { setShowLinkFlow(false); setMode("signin"); }} className="text-primary font-semibold hover:underline">
              ← Back to Sign In
            </button>
          </p>
        )}
      </motion.div>
    </div>
  );
}
