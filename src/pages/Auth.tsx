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

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, signIn, signUp, linkAnonymousAccount } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");

  const isAnonymous = user?.is_anonymous === true;

  // Store invite code in localStorage so we can redeem after signup
  useEffect(() => {
    if (inviteCode) {
      localStorage.setItem("mogsy-invite-code", inviteCode);
    }
  }, [inviteCode]);

  const redeemInvite = async (userId: string) => {
    const code = localStorage.getItem("mogsy-invite-code");
    if (!code) return;

    const { data: invite } = await supabase
      .from("invite_links")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .single();

    if (!invite) return;

    // Check expiry & max uses
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) return;
    if (invite.max_uses && invite.times_used >= invite.max_uses) return;

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .single();
    if (!profile) return;

    // Apply rewards
    const updates: Record<string, any> = {};
    if (invite.grant_pro) updates.is_pro = true;
    if (invite.grant_diamonds > 0) updates.diamonds = invite.grant_diamonds;
    if (invite.grant_boost_credits > 0) updates.boost_credits = invite.grant_boost_credits;
    if (invite.grant_elo_shields > 0) updates.elo_shields = invite.grant_elo_shields;
    if (invite.grant_reveals > 0) updates.reveals = invite.grant_reveals;
    if (invite.grant_rewinds > 0) updates.rewinds = invite.grant_rewinds;

    // Set recommended categories as preferred
    const cats = invite.recommended_categories as string[];
    if (cats && cats.length > 0) {
      updates.preferred_categories = cats;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("profiles").update(updates).eq("id", profile.id);
    }

    // Grant admin role if specified
    if (invite.grant_admin) {
      await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    }

    // Record redemption
    await supabase.from("invite_redemptions").insert({
      invite_link_id: invite.id,
      redeemed_by_user_id: userId,
      referrer_user_id: invite.type === "user" ? invite.created_by_user_id : null,
    });

    // Increment usage
    await supabase.from("invite_links").update({ times_used: invite.times_used + 1 }).eq("id", invite.id);

    // If user-type invite, reward the referrer
    if (invite.type === "user") {
      const { data: settings } = await supabase.from("user_invite_settings").select("*").limit(1).single();
      if (settings && settings.is_enabled) {
        const { data: referrerProfile } = await supabase
          .from("profiles")
          .select("id, diamonds, boost_credits")
          .eq("user_id", invite.created_by_user_id)
          .single();
        if (referrerProfile) {
          await supabase.from("profiles").update({
            diamonds: (referrerProfile.diamonds || 0) + (settings.referrer_diamonds || 0),
            boost_credits: (referrerProfile.boost_credits || 0) + (settings.referrer_boost_credits || 0),
          }).eq("id", referrerProfile.id);
        }
      }
    }

    localStorage.removeItem("mogsy-invite-code");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isAnonymous) {
      const { error } = await linkAnonymousAccount(email, password);
      if (error) {
        toast({ title: "Linking failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Account created!", description: "Your anonymous progress has been saved to your new account." });
        if (user) await redeemInvite(user.id);
        navigate("/swipe");
      }
    } else if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
      } else {
        navigate("/swipe");
      }
    } else {
      const { error } = await signUp(email, password);
      if (error) {
        toast({ title: "Signup failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Check your email", description: "We sent you a confirmation link." });
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SEOHead title="Sign In — Mogsy" description="Sign in or create your Mogsy account. Start voting, ranking, and competing in head-to-head leagues." />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8"
      >
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block mb-4">
            <img src={mogsyLogo} alt="Mogsy" className="h-14 mx-auto" />
          </Link>
          <h2 className="text-xl font-bold text-foreground">
            {isAnonymous ? "Claim your account" : isLogin ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isAnonymous
              ? "Create an account to keep all your progress, matches, and settings"
              : isLogin ? "Log in to continue ranking" : "Start climbing the ranks"}
          </p>
          {inviteCode && !isLogin && (
            <p className="text-xs text-primary font-medium mt-2">🎁 You've been invited! Sign up to claim your rewards.</p>
          )}
        </div>

        {isAnonymous && (
          <div className="mb-4 rounded-lg bg-primary/10 border border-primary/20 p-3">
            <p className="text-xs text-primary font-medium">
              ✨ Your match history, Elo ratings, diamonds, and settings will all be preserved!
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
            {loading ? "Loading…" : isAnonymous ? "Create Account & Keep Progress" : isLogin ? "Log In" : "Sign Up"}
          </Button>
        </form>

        {!isAnonymous && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-semibold hover:underline">
              {isLogin ? "Sign up" : "Log in"}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
