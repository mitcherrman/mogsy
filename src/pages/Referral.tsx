import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Gift, Users, Diamond, Zap, Shield, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import SEOHead from "@/components/SEOHead";

interface ReferralSettings {
  is_enabled: boolean;
  reward_diamonds: number;
  reward_boost_credits: number;
  reward_elo_bonus: number;
  referrer_diamonds: number;
  referrer_boost_credits: number;
}

export default function Referral() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    const [{ data: settingsData }, { data: linkData }, { data: redemptionData }] = await Promise.all([
      supabase.from("user_invite_settings").select("*").limit(1).single(),
      supabase.from("invite_links").select("*").eq("created_by_user_id", user.id).eq("type", "user").limit(1).single(),
      supabase.from("invite_redemptions").select("id").eq("referrer_user_id", user.id),
    ]);

    setSettings(settingsData as ReferralSettings | null);
    setReferralCode(linkData?.code || null);
    setReferralCount(redemptionData?.length || 0);
    setLoading(false);
  };

  const generateLink = async () => {
    if (!user) return;
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { error } = await supabase.from("invite_links").insert({
      code,
      type: "user",
      label: "My Referral Link",
      created_by_user_id: user.id,
      grant_diamonds: 0,
      grant_boost_credits: 0,
      grant_elo_shields: 0,
      grant_reveals: 0,
      grant_rewinds: 0,
      recommended_categories: [],
    });
    if (error) {
      toast.error("Failed to create link");
    } else {
      setReferralCode(code);
      toast.success("Referral link created!");
    }
  };

  const copyLink = () => {
    if (!referralCode) return;
    const url = `${window.location.origin}/auth?invite=${referralCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const isEnabled = settings?.is_enabled ?? false;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <SEOHead title="Invite Friends — Mogsy" description="Invite friends to Mogsy and earn rewards!" />
      <div className="container mx-auto max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-extrabold text-foreground">Invite Friends</h1>
        </div>

        {!isEnabled ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Referral Program Unavailable</h2>
            <p className="text-sm text-muted-foreground">The referral program is currently disabled. Check back later!</p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* Hero Card */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6 text-center">
              <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Gift className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-extrabold text-foreground mb-2">Share Mogsy, Earn Rewards</h2>
              <p className="text-sm text-muted-foreground mb-6">
                When a friend signs up with your link, you both get rewarded!
              </p>

              {referralCode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-xl bg-background border border-border px-4 py-3">
                    <span className="flex-1 text-sm font-mono text-foreground truncate text-left">
                      {window.location.origin}/auth?invite={referralCode}
                    </span>
                    <Button size="sm" variant="outline" onClick={copyLink} className="flex-shrink-0">
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {referralCount} friend{referralCount !== 1 ? "s" : ""} joined so far
                  </p>
                </div>
              ) : (
                <Button onClick={generateLink} className="w-full">
                  <Gift className="h-4 w-4 mr-2" /> Generate My Referral Link
                </Button>
              )}
            </motion.div>

            {/* Rewards Breakdown */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
              <h3 className="text-sm font-bold text-foreground">What You Earn</h3>
              <div className="grid grid-cols-1 gap-2">
                {(settings?.referrer_diamonds ?? 0) > 0 && (
                  <RewardRow icon={Diamond} label="Diamonds" value={`+${settings!.referrer_diamonds}`} color="text-blue-400" />
                )}
                {(settings?.referrer_boost_credits ?? 0) > 0 && (
                  <RewardRow icon={Zap} label="Boost Credits" value={`+${settings!.referrer_boost_credits}`} color="text-yellow-400" />
                )}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-3">
              <h3 className="text-sm font-bold text-foreground">What Your Friend Gets</h3>
              <div className="grid grid-cols-1 gap-2">
                {(settings?.reward_diamonds ?? 0) > 0 && (
                  <RewardRow icon={Diamond} label="Diamonds" value={`+${settings!.reward_diamonds}`} color="text-blue-400" />
                )}
                {(settings?.reward_boost_credits ?? 0) > 0 && (
                  <RewardRow icon={Zap} label="Boost Credits" value={`+${settings!.reward_boost_credits}`} color="text-yellow-400" />
                )}
                {(settings?.reward_elo_bonus ?? 0) > 0 && (
                  <RewardRow icon={Shield} label="ELO Bonus" value={`+${settings!.reward_elo_bonus}`} color="text-green-400" />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

function RewardRow({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <Icon className={`h-5 w-5 ${color}`} />
      <span className="flex-1 text-sm text-foreground">{label}</span>
      <span className="text-sm font-bold text-primary">{value}</span>
    </div>
  );
}
