import { motion } from "framer-motion";
import { LogOut, LogIn, UserPlus, ArrowLeft, Lock, Mail, Volume2, Eye, Sparkles, Type, Contrast, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import TwoFactorAuth from "@/components/TwoFactorAuth";
import UiSfxSettings from "@/components/UiSfxSettings";

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    // Clear all cached data before signing out to prevent stale state
    queryClient.clear();
    await signOut();
    // Navigate to landing after sign-out
    navigate("/", { replace: true });
  };

  const isAnonymousOrNoUser = !user || user.is_anonymous;

  // Security
  const [currentPwdForPwd, setCurrentPwdForPwd] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [currentPwdForEmail, setCurrentPwdForEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Personalization / accessibility (localStorage backed)
  const readFlag = (k: string) => typeof window !== "undefined" && localStorage.getItem(k) === "1";
  const [soundsMuted, setSoundsMuted] = useState(() => readFlag("mogsy-sounds-muted"));
  const [reduceMotion, setReduceMotion] = useState(() => readFlag("mogsy-reduce-motion"));
  const [largeText, setLargeText] = useState(() => readFlag("mogsy-large-text"));
  const [highContrast, setHighContrast] = useState(() => readFlag("mogsy-high-contrast"));

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
    localStorage.setItem("mogsy-reduce-motion", reduceMotion ? "1" : "0");
  }, [reduceMotion]);
  useEffect(() => {
    document.documentElement.classList.toggle("large-text", largeText);
    localStorage.setItem("mogsy-large-text", largeText ? "1" : "0");
  }, [largeText]);
  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", highContrast);
    localStorage.setItem("mogsy-high-contrast", highContrast ? "1" : "0");
  }, [highContrast]);
  useEffect(() => {
    localStorage.setItem("mogsy-sounds-muted", soundsMuted ? "1" : "0");
    window.dispatchEvent(new Event("mogsy-sounds-muted-changed"));
  }, [soundsMuted]);

  const handleChangePassword = async () => {
    if (!currentPwdForPwd) { toast.error("Enter your current password"); return; }
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (!user?.email) { toast.error("No email on account"); return; }
    setSavingPwd(true);
    // Reauthenticate by re-verifying the current password
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPwdForPwd,
    });
    if (reauthError) {
      setSavingPwd(false);
      toast.error("Current password is incorrect");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPwd(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    setNewPassword(""); setConfirmPassword(""); setCurrentPwdForPwd("");
  };

  const handleChangeEmail = async () => {
    if (!currentPwdForEmail) { toast.error("Enter your current password to confirm"); return; }
    if (!newEmail.includes("@")) { toast.error("Enter a valid email"); return; }
    if (!user?.email) { toast.error("No email on account"); return; }
    if (newEmail.toLowerCase() === user.email.toLowerCase()) { toast.error("New email matches current email"); return; }
    setSavingEmail(true);
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPwdForEmail,
    });
    if (reauthError) {
      setSavingEmail(false);
      toast.error("Current password is incorrect");
      return;
    }
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: window.location.origin }
    );
    setSavingEmail(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Confirmation email sent to your new address");
    setNewEmail(""); setCurrentPwdForEmail("");
  };

  return (
    <div className="min-h-dvh px-4 py-8">
      <SEOHead title="Settings — Mogsy" description="Manage your Mogsy settings. Change theme, sign out, and customize your experience." />
      <div className="container mx-auto max-w-2xl lg:max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => navigate("/home")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground">Settings</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Use the <span className="font-semibold text-primary">theme button</span> in the bottom-right corner to change your app appearance.
        </p>

        {/* Security */}
        {!isAnonymousOrNoUser && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-card p-6 mb-6"
          >
            <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <Lock className="h-4 w-4" /> Security
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Change password</Label>
                <Input type="password" autoComplete="current-password" placeholder="Current password" value={currentPwdForPwd} onChange={(e) => setCurrentPwdForPwd(e.target.value)} />
                <Input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <Button onClick={handleChangePassword} disabled={savingPwd || !newPassword || !currentPwdForPwd} className="w-full sm:w-auto">
                  {savingPwd ? "Updating..." : "Update password"}
                </Button>
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <Label className="text-sm font-medium flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Change email</Label>
                <p className="text-xs text-muted-foreground">Current: {user?.email}</p>
                <Input type="email" placeholder="new@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Input type="password" autoComplete="current-password" placeholder="Confirm with current password" value={currentPwdForEmail} onChange={(e) => setCurrentPwdForEmail(e.target.value)} />
                <Button onClick={handleChangeEmail} disabled={savingEmail || !newEmail || !currentPwdForEmail} className="w-full sm:w-auto">
                  {savingEmail ? "Sending..." : "Send confirmation"}
                </Button>
                <p className="text-xs text-muted-foreground">You'll receive a confirmation link at the new address.</p>
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <Label className="text-sm font-medium flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Two-factor authentication</Label>
                <TwoFactorAuth />
              </div>
            </div>
          </motion.section>
        )}

        {/* Personalization */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-border bg-card p-6 mb-6"
        >
          <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Personalization
          </h2>
          <ToggleRow
            icon={<Volume2 className="h-3.5 w-3.5" />}
            label="Mute all sounds"
            description="Silence swipes, chimes, animations, and shop sounds"
            checked={soundsMuted}
            onChange={setSoundsMuted}
          />
        </motion.section>

        {/* Sound Effects (main app UI SFX) */}
        <UiSfxSettings />

        {/* Accessibility */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl border border-border bg-card p-6 mb-6"
        >
          <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Eye className="h-4 w-4" /> Accessibility
          </h2>
          <div className="space-y-3">
            <ToggleRow
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Reduce motion"
              description="Minimize animations and transitions across the app"
              checked={reduceMotion}
              onChange={setReduceMotion}
            />
            <ToggleRow
              icon={<Type className="h-3.5 w-3.5" />}
              label="Larger text"
              description="Increase base font size for easier reading"
              checked={largeText}
              onChange={setLargeText}
            />
            <ToggleRow
              icon={<Contrast className="h-3.5 w-3.5" />}
              label="High contrast"
              description="Boost contrast for better visibility"
              checked={highContrast}
              onChange={setHighContrast}
            />
          </div>
        </motion.section>

        {/* Account */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border bg-card p-6"
        >
          <h2 className="font-bold text-foreground mb-4">Account</h2>

          {isAnonymousOrNoUser ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {user?.is_anonymous
                  ? "You're playing as a guest. Save your progress to keep it across devices."
                  : "You are not signed in."}
              </p>
              {/* Primary: upgrade the current guest in place (email-first flow). */}
              <Button
                variant="default"
                onClick={() => navigate("/auth?mode=signup&returnTo=%2Fsettings")}
                className="w-full mb-2"
                data-testid="settings-create-account"
              >
                <UserPlus className="h-4 w-4 mr-2" /> Save progress / Create account
              </Button>
              {/* Separate explicit action: sign in to an existing account. */}
              <Button
                variant="outline"
                onClick={() => navigate("/auth?returnTo=%2Fsettings")}
                className="w-full"
                data-testid="settings-sign-in"
              >
                <LogIn className="h-4 w-4 mr-2" /> Sign in to an existing account
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">Signed in as {user.email}</p>
              <Button variant="destructive" onClick={handleSignOut} className="w-full">
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </Button>
            </>
          )}
        </motion.section>
      </div>
    </div>
  );
}

function ToggleRow({ icon, label, description, checked, onChange }: {
  icon: React.ReactNode; label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 p-3">
      <div className="min-w-0">
        <Label className="text-sm font-medium flex items-center gap-1.5">{icon}{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
