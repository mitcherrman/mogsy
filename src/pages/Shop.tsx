import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Crown, Zap, Eye, Undo2, Shield, Sparkles, Check } from "lucide-react";
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
}

const proFeatures = [
  "Unlimited custom league creation",
  "Detailed ELO analytics & history",
  "Premium profile frames & themes",
  "Exposure boosts included monthly",
  "Ad-free experience",
  "Priority in swipe queues",
];

const powerUps = [
  {
    id: "boost",
    name: "Exposure Boost",
    desc: "2x visibility in swipes for 24 hours",
    icon: Zap,
    price: 299,
    field: "boost_credits" as const,
  },
  {
    id: "elo_shield",
    name: "ELO Shield",
    desc: "Protect your rating from the next 3 losses",
    icon: Shield,
    price: 199,
    field: "elo_shields" as const,
  },
  {
    id: "reveal",
    name: "Reveal",
    desc: "See who voted for you in the last 24 hours",
    icon: Eye,
    price: 149,
    field: "reveals" as const,
  },
  {
    id: "rewind",
    name: "Rewind",
    desc: "Undo your last swipe and re-vote",
    icon: Undo2,
    price: 99,
    field: "rewinds" as const,
  },
];

export default function Shop() {
  const { user } = useAuth();
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
      .select("id, is_pro, boost_credits, elo_shields, reveals, rewinds")
      .eq("user_id", user!.id)
      .single();
    if (data) setProfile(data as ProfileData);
    setLoading(false);
  };

  const handleProPurchase = async () => {
    if (!profile) return;
    setPurchasing("pro");
    // Mock purchase
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

  const handlePowerUpPurchase = async (powerUp: typeof powerUps[0]) => {
    if (!profile) return;
    setPurchasing(powerUp.id);
    const currentValue = (profile[powerUp.field] as number) || 0;
    await supabase
      .from("profiles")
      .update({ [powerUp.field]: currentValue + 1 })
      .eq("id", profile.id);
    await supabase.from("purchases").insert({
      profile_id: profile.id,
      item_type: powerUp.id,
      amount_cents: powerUp.price,
    });
    setProfile({ ...profile, [powerUp.field]: currentValue + 1 });
    toast({ title: `${powerUp.name} purchased!`, description: `You now have ${currentValue + 1}.` });
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
        <h1 className="text-3xl font-extrabold text-foreground mb-8">Shop</h1>

        {/* Pro Subscription */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
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
                  <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    Active
                  </span>
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
                <p className="text-sm text-primary font-medium">
                  ✨ You're a Pro member — all features unlocked!
                </p>
              ) : (
                <Button
                  variant="hero"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={handleProPurchase}
                  disabled={purchasing === "pro"}
                >
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
                    <div>
                      <span className="text-lg font-extrabold text-foreground">${(pu.price / 100).toFixed(2)}</span>
                      {owned > 0 && (
                        <span className="ml-2 text-xs text-primary font-medium">
                          {owned} owned
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handlePowerUpPurchase(pu)}
                      disabled={purchasing === pu.id}
                    >
                      {purchasing === pu.id ? "…" : "Buy"}
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
