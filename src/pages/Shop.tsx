import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Crown, Zap, Eye, Undo2, Shield, Sparkles, Check, Diamond, ArrowLeft, ExternalLink, CreditCard } from "lucide-react";
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

const STRIPE_PRO_PRICE_ID = "price_1T3Ua6D9NqEQUIGhfXFmV6V6";

const diamondPacks = [
  { id: "pack_50", amount: 50, price: 0.99, stripePriceId: "price_1T3UbgD9NqEQUIGhYrBcRg9p" },
  { id: "pack_200", amount: 200, price: 2.99, stripePriceId: "price_1T3UbyD9NqEQUIGhjzroRY0y" },
  { id: "pack_500", amount: 500, price: 4.99, stripePriceId: "price_1T3UcSD9NqEQUIGhHHKuZRgT" },
  { id: "pack_1500", amount: 1500, price: 9.99, stripePriceId: "price_1T3UcdD9NqEQUIGhSzHaDXi1" },
  { id: "pack_5000", amount: 5000, price: 24.99, stripePriceId: "price_1T3UcpD9NqEQUIGhjNr7NtLu" },
];

const powerUps = [
  { id: "boost", name: "Exposure Boost", desc: "2x visibility in swipes for 24 hours", icon: Zap, diamondCost: 50, field: "boost_credits" as const },
  { id: "elo_shield", name: "ELO Shield", desc: "Protect your rating from the next 3 losses", icon: Shield, diamondCost: 30, field: "elo_shields" as const },
  { id: "reveal", name: "Reveal", desc: "See who voted for you in the last 24 hours", icon: Eye, diamondCost: 25, field: "reveals" as const },
  { id: "rewind", name: "Rewind", desc: "Undo your last swipe and re-vote", icon: Undo2, diamondCost: 15, field: "rewinds" as const },
];

export default function Shop() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [isTrial, setIsTrial] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
      checkSubscription();
    }
  }, [user]);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast({ title: "🎉 Payment successful!", description: "Your purchase is being processed." });
      // Refresh data
      if (user) {
        loadProfile();
        checkSubscription();
      }
    }
    if (searchParams.get("canceled") === "true") {
      toast({ title: "Payment canceled", description: "No charges were made.", variant: "destructive" });
    }
  }, [searchParams]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, is_pro, boost_credits, elo_shields, reveals, rewinds, diamonds")
      .eq("user_id", user!.id)
      .single();
    if (data) setProfile(data as ProfileData);
    setLoading(false);
  };

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) return;
      if (data?.subscribed) {
        setSubscriptionEnd(data.subscription_end);
        setIsTrial(data.is_trial || false);
      }
    } catch {}
  };

  const handleStripeCheckout = async (priceId: string, mode: "payment" | "subscription") => {
    setPurchasing(priceId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, mode },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      toast({ title: "Checkout error", description: err.message || "Something went wrong", variant: "destructive" });
    }
    setPurchasing(null);
  };

  const handleManageSubscription = async () => {
    setPurchasing("portal");
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) {
        // Try to parse the error body for a user-friendly message
        const errorBody = typeof error === "object" && error?.context?.body
          ? await error.context.json?.().catch(() => null)
          : null;
        const msg = data?.error || errorBody?.error || "Something went wrong";
        toast({ title: "Portal error", description: msg, variant: "destructive" });
        setPurchasing(null);
        return;
      }
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      toast({ title: "Portal error", description: "Something went wrong", variant: "destructive" });
    }
    setPurchasing(null);
  };

  const handlePowerUpPurchase = async (powerUp: typeof powerUps[0]) => {
    if (!profile) return;
    if ((profile.diamonds || 0) < powerUp.diamondCost) {
      toast({ title: "Not enough diamonds", description: `You need ${powerUp.diamondCost} 💎 but have ${profile.diamonds || 0}.`, variant: "destructive" });
      return;
    }
    setPurchasing(powerUp.id);
    try {
      const { data, error } = await supabase.rpc("purchase_powerup", {
        _profile_id: profile.id,
        _powerup_field: powerUp.field,
        _diamond_cost: powerUp.diamondCost,
      });
      if (error) {
        const msg = error.message?.includes("Insufficient") ? "Not enough diamonds." : error.message || "Purchase failed.";
        toast({ title: "Purchase failed", description: msg, variant: "destructive" });
        await loadProfile();
        setPurchasing(null);
        return;
      }
      const newDiamonds = (data as any)?.diamonds ?? 0;
      const newValue = (data as any)?.powerup_value ?? 0;
      setProfile({ ...profile, [powerUp.field]: newValue, diamonds: newDiamonds });
      toast({ title: `${powerUp.name} purchased!`, description: `You now have ${newValue}. (${newDiamonds} 💎 remaining)` });
    } catch (err: any) {
      toast({ title: "Purchase failed", description: "Something went wrong.", variant: "destructive" });
      await loadProfile();
    }
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

        {/* Pro Subscription */}
        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Crown className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-foreground">Mogsy Pro</h2>
                  <p className="text-muted-foreground text-sm">$9.99/month · 7-day free trial</p>
                </div>
                {profile?.is_pro && (
                  <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    {isTrial ? "Trial Active" : "Active"}
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
                <div className="space-y-2">
                  <p className="text-sm text-primary font-medium">
                    ✨ You're a Pro member — all features unlocked!
                    {subscriptionEnd && (
                      <span className="text-muted-foreground ml-2">
                        {isTrial ? "Trial ends" : "Renews"}: {new Date(subscriptionEnd).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                  <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={purchasing === "portal"} className="gap-1.5">
                    <CreditCard className="h-4 w-4" />
                    {purchasing === "portal" ? "Opening…" : "Manage Subscription"}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="hero"
                  size="lg"
                  className="w-full sm:w-auto gap-2"
                  onClick={() => handleStripeCheckout(STRIPE_PRO_PRICE_ID, "subscription")}
                  disabled={purchasing === STRIPE_PRO_PRICE_ID}
                >
                  <Crown className="h-4 w-4" />
                  {purchasing === STRIPE_PRO_PRICE_ID ? "Opening checkout…" : "Start Free Trial — then $9.99/mo"}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </motion.section>

        {/* Buy Diamonds */}
        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-10">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
            <Diamond className="h-5 w-5 text-primary" /> Buy Diamonds
          </h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {diamondPacks.map((pack) => (
              <button
                key={pack.id}
                onClick={() => handleStripeCheckout(pack.stripePriceId, "payment")}
                disabled={purchasing === pack.stripePriceId}
                className="rounded-2xl border border-border bg-card p-4 text-center transition-all hover:border-primary/30 hover:shadow-[0_0_15px_hsl(210_80%_60%/0.1)] hover:-translate-y-0.5 disabled:opacity-50"
              >
                <Diamond className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-lg font-extrabold text-foreground">{pack.amount.toLocaleString()}</p>
                <p className="text-sm font-bold text-primary">${pack.price}</p>
              </button>
            ))}
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
