import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Crown, Zap, Eye, Undo2, Shield, Sparkles, Check, Diamond, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  id: string;
  is_pro: boolean;
  boost_credits: number;
  elo_shields: number;
  reveals: number;
  rewinds: number;
  diamonds: number;
}

const proFeatures = [
  "Unlimited custom league creation",
  "Detailed ELO analytics & history",
  "Premium profile frames & themes",
  "Exposure boosts included monthly",
  "Ad-free experience",
  "Priority in swipe queues",
];

const diamondPacks = [
  { id: "pack_50", amount: 50, price: 0.99 },
  { id: "pack_200", amount: 200, price: 2.99 },
  { id: "pack_500", amount: 500, price: 4.99 },
  { id: "pack_1500", amount: 1500, price: 9.99 },
  { id: "pack_5000", amount: 5000, price: 24.99 },
];

const powerUps = [
  {
    id: "boost",
    name: "Exposure Boost",
    desc: "2x visibility in swipes for 24 hours",
    icon: Zap,
    diamondCost: 50,
    field: "boost_credits" as const,
  },
  {
    id: "elo_shield",
    name: "ELO Shield",
    desc: "Protect your rating from the next 3 losses",
    icon: Shield,
    diamondCost: 30,
    field: "elo_shields" as const,
  },
  {
    id: "reveal",
    name: "Reveal",
    desc: "See who voted for you in the last 24 hours",
    icon: Eye,
    diamondCost: 25,
    field: "reveals" as const,
  },
  {
    id: "rewind",
    name: "Rewind",
    desc: "Undo your last swipe and re-vote",
    icon: Undo2,
    diamondCost: 15,
    field: "rewinds" as const,
  },
];

export default function Shop() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, is_pro, boost_credits, elo_shields, reveals, rewinds, diamonds")
      .eq("user_id", user!.id)
      .single();
    if (data) setProfile(data as ProfileData);
    setLoading(false);
  };

  const handleProPurchase = async () => {
    if (!profile) return;
    setPurchasing("pro");
    await supabase.from("profiles").update({ is_pro: true }).eq("id", profile.id);
    await supabase.from("purchases").insert({
      profile_id: profile.id,
      item_type: "pro_subscription",
      amount_cents: 999,
    });
    setProfile({ ...profile, is_pro: true });
    toast({ title: "🎉 Welcome to Pro!", description: "All premium features are now unlocked." });
    setPurchasing(null);
  };

  const handleBuyDiamonds = async (pack: typeof diamondPacks[0]) => {
    if (!profile) return;
    setPurchasing(pack.id);
    const newDiamonds = (profile.diamonds || 0) + pack.amount;
    await supabase.from("profiles").update({ diamonds: newDiamonds }).eq("id", profile.id);
    await supabase.from("purchases").insert({
      profile_id: profile.id,
      item_type: `diamonds_${pack.amount}`,
      amount_cents: Math.round(pack.price * 100),
    });
    setProfile({ ...profile, diamonds: newDiamonds });
    toast({ title: `💎 ${pack.amount} diamonds purchased!`, description: `You now have ${newDiamonds.toLocaleString()} diamonds.` });
    setPurchasing(null);
  };

  const handlePowerUpPurchase = async (powerUp: typeof powerUps[0]) => {
    if (!profile) return;
    if ((profile.diamonds || 0) < powerUp.diamondCost) {
      toast({ title: "Not enough diamonds", description: `You need ${powerUp.diamondCost} 💎 but have ${profile.diamonds || 0}.`, variant: "destructive" });
      return;
    }
    setPurchasing(powerUp.id);
    const currentValue = (profile[powerUp.field] as number) || 0;
    const newDiamonds = (profile.diamonds || 0) - powerUp.diamondCost;
    await supabase
      .from("profiles")
      .update({ [powerUp.field]: currentValue + 1, diamonds: newDiamonds })
      .eq("id", profile.id);
    await supabase.from("purchases").insert({
      profile_id: profile.id,
      item_type: powerUp.id,
      amount_cents: 0,
    });
    setProfile({ ...profile, [powerUp.field]: currentValue + 1, diamonds: newDiamonds });
    toast({ title: `${powerUp.name} purchased!`, description: `You now have ${currentValue + 1}. (${newDiamonds} 💎 remaining)` });
    setPurchasing(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground">Shop</h1>
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5">
            <Diamond className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-primary">{(profile?.diamonds || 0).toLocaleString()}</span>
          </div>
        </div>

        {/* Buy Diamonds */}
        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
            <Diamond className="h-5 w-5 text-primary" /> Buy Diamonds
          </h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {diamondPacks.map((pack) => (
              <button
                key={pack.id}
                onClick={() => handleBuyDiamonds(pack)}
                disabled={purchasing === pack.id}
                className="rounded-2xl border border-border bg-card p-4 text-center transition-all hover:border-primary/30 hover:shadow-[0_0_15px_hsl(210_80%_60%/0.1)] hover:-translate-y-0.5 disabled:opacity-50"
              >
                <Diamond className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-lg font-extrabold text-foreground">{pack.amount.toLocaleString()}</p>
                <p className="text-sm font-bold text-primary">${pack.price}</p>
              </button>
            ))}
          </div>
        </motion.section>

        {/* Pro Subscription */}
        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-10">
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Crown className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-foreground">Mogsy Pro</h2>
                  <p className="text-muted-foreground text-sm">$9.99/month</p>
                </div>
                {profile?.is_pro && (
                  <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Active</span>
                )}
              </div>

              <ul className="grid gap-2 sm:grid-cols-2 mb-6">
                {proFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {profile?.is_pro ? (
                <p className="text-sm text-primary font-medium">✨ You're a Pro member — all features unlocked!</p>
              ) : (
                <Button variant="hero" size="lg" className="w-full sm:w-auto" onClick={handleProPurchase} disabled={purchasing === "pro"}>
                  <Crown className="h-4 w-4" />
                  {purchasing === "pro" ? "Processing…" : "Subscribe to Pro — $9.99/mo"}
                </Button>
              )}
            </div>
          </div>
        </motion.section>

        {/* Power-Ups */}
        <section>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" /> Power-Ups
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {powerUps.map((pu, i) => {
              const owned = (profile?.[pu.field] as number) || 0;
              const canAfford = (profile?.diamonds || 0) >= pu.diamondCost;
              return (
                <motion.div
                  key={pu.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border border-border bg-card p-5 flex flex-col"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <pu.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{pu.name}</h3>
                      <p className="text-xs text-muted-foreground">{pu.desc}</p>
                    </div>
                  </div>
                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Diamond className="h-4 w-4 text-primary" />
                      <span className="text-lg font-extrabold text-foreground">{pu.diamondCost}</span>
                      {owned > 0 && (
                        <span className="ml-2 text-xs text-primary font-medium">{owned} owned</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handlePowerUpPurchase(pu)}
                      disabled={purchasing === pu.id || !canAfford}
                    >
                      {purchasing === pu.id ? "…" : canAfford ? "Buy" : "Need 💎"}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
