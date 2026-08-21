import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import mogsyLogo from "@/assets/mogsy-logo-text.png";
import SEOHead from "@/components/SEOHead";
import { safeReturnPath } from "@/lib/auth/safe-return";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT, validateNewPassword } from "@/lib/auth/password-policy";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  // Supabase appends its own params to the recovery link; a returnTo survives
  // alongside them when the requesting surface attached one.
  const resetReturnTo = safeReturnPath(searchParams.get("returnTo"), "/home");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasRecoveryToken, setHasRecoveryToken] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Recovery links can arrive in three forms:
    // 1) Legacy hash:  #access_token=...&type=recovery
    // 2) PKCE query:   ?code=...   (Supabase auto-exchanges when detectSessionInUrl is on)
    // 3) Error hash:   #error=access_denied&error_code=otp_expired
    const hash = window.location.hash || "";
    const search = window.location.search || "";

    if (hash.includes("error=") || hash.includes("otp_expired")) {
      setHasRecoveryToken(false);
      return;
    }

    if (hash.includes("type=recovery") || search.includes("code=")) {
      setHasRecoveryToken(true);
    }

    // Listen for Supabase auth events. PKCE recovery fires PASSWORD_RECOVERY
    // (or SIGNED_IN once the code is exchanged).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasRecoveryToken(true);
      }
    });

    // If a session already exists when landing here (code was exchanged before mount), allow reset.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasRecoveryToken(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Same policy as signup — a password you could create must be one you can
    // reset to (AUTH1 §2).
    const pw = validateNewPassword(password, confirmPassword);
    if (!pw.ok) {
      toast({ title: pw.error, variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSuccess(true);
      // A password reset is an interruption too: return the user to wherever
      // the reset link was requested from when that was preserved.
      setTimeout(() => navigate(resetReturnTo, { replace: true }), 2000);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <CheckCircle className="h-16 w-16 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground">Password updated!</h2>
          <p className="text-sm text-muted-foreground mt-2">Redirecting you now…</p>
        </motion.div>
      </div>
    );
  }

  if (!hasRecoveryToken) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Invalid or expired reset link.</p>
          <Button onClick={() => navigate("/auth")}>Back to Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <SEOHead title="Reset Password — Mogsy" description="Set a new password for your Mogsy account." />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8"
      >
        <div className="mb-6 text-center">
          <img src={mogsyLogo} alt="Mogsy" className="h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground">Set new password</h2>
          <p className="text-sm text-muted-foreground mt-1">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
          <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Update Password
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
