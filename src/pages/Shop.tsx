import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Crown, Zap, Eye, Undo2, Shield, Sparkles, Check, Diamond, ArrowLeft, ExternalLink, CreditCard, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/SEOHead";
import { useToast } from "@/hooks/use-toast";
import { useShopSound } from "@/hooks/useShopSound";

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
  { id: "pack_50", amount: 50, price: 0.99, stripePriceId: "price_1T3UbgD9NqEQUIGhYrBcRg9p", tag: null },
  { id: "pack_200", amount: 200, price: 2.99, stripePriceId: "price_1T3UbyD9NqEQUIGhjzroRY0y", tag: null },
  { id: "pack_500", amount: 500, price: 4.99, stripePriceId: "price_1T3UcSD9NqEQUIGhHHKuZRgT", tag: "Popular" },
  { id: "pack_1500", amount: 1500, price: 9.99, stripePriceId: "price_1T3UcdD9NqEQUIGhSzHaDXi1", tag: "Best Value" },
  { id: "pack_5000", amount: 5000, price: 24.99, stripePriceId: "price_1T3UcpD9NqEQUIGhjNr7NtLu", tag: "Mega" },
];

const powerUps = [
  { id: "boost", name: "Exposure Boost", desc: "2x visibility for 24h", icon: Zap, diamondCost: 50, field: "boost_credits" as const, color: "from-yellow-500/20 to-amber-500/20" },
  { id: "elo_shield", name: "ELO Shield", desc: "Protect from 3 losses", icon: Shield, diamondCost: 30, field: "elo_shields" as const, color: "from-blue-500/20 to-cyan-500/20" },
  { id: "reveal", name: "Reveal", desc: "See who voted for you", icon: Eye, diamondCost: 25, field: "reveals" as const, color: "from-purple-500/20 to-pink-500/20" },
  { id: "rewind", name: "Rewind", desc: "Undo your last swipe", icon: Undo2, diamondCost: 15, field: "rewinds" as const, color: "from-green-500/20 to-emerald-500/20" },
];

function DiamondSparkles({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <AnimatePresence>
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
          animate={{ opacity: 0, scale: 1.5, x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 120 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ left: "50%", top: "50%" }}
        >
          <Diamond className="h-3 w-3 text-primary" />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

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
  const [sparklingPack, setSparklingPack] = useState<string | null>(null);
  const { playPurchaseSound, playDiamondTap, playPowerUpSound } = useShopSound();

  useEffect(() => {
    if (user) {
      loadProfile();
      checkSubscription();
    }
  }, [user]);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      playPurchaseSound();
      toast({ title: "🎉 Payment successful!", description: "Your purchase is being processed." });
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
    if (mode === "payment") {
      playDiamondTap();
      setSparklingPack(priceId);
      setTimeout(() => setSparklingPack(null), 700);
    }
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
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Subscription", description: data.error, variant: "destructive" });
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
    playPowerUpSound();
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
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen px-3 sm:px-4 py-4 sm:py-8">
      <SEOHead title="Shop — Mogsy" description="Get diamonds, boosts, shields, and premium items in the Mogsy shop. Power up your leaderboard experience." />
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <h1 className="text-xl sm:text-3xl font-extrabold text-foreground">Shop</h1>
          <motion.div
            className="ml-auto flex items-center gap-1 sm:gap-1.5 rounded-full bg-primary/10 px-2 sm:px-3 py-1 sm:py-1.5 border border-primary/20"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Diamond className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            <span className="text-xs sm:text-sm font-bold text-primary">{(profile?.diamonds || 0).toLocaleString()}</span>
          </motion.div>
        </div>

        {/* 1. Power-Ups (moved to top) */}
        <section className="mb-6 sm:mb-10">
          <h2 className="text-sm sm:text-lg font-bold text-foreground flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-4">
            <Sparkles className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary" /> Power-Ups
          </h2>
          <div className="grid gap-2 sm:gap-4 grid-cols-2">
            {powerUps.map((pu, i) => {
              const owned = (profile?.[pu.field] as number) || 0;
              const canAfford = (profile?.diamonds || 0) >= pu.diamondCost;
              return (
                <motion.div
                  key={pu.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                  className={`rounded-xl sm:rounded-2xl border border-border bg-gradient-to-br ${pu.color} p-2.5 sm:p-5 flex flex-col`}
                >
                  <div className="flex items-start gap-2 sm:gap-3 mb-1.5 sm:mb-2">
                    <motion.div
                      className="flex h-7 w-7 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-card/80 border border-border shrink-0"
                      whileHover={{ rotate: 10 }}
                    >
                      <pu.icon className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary" />
                    </motion.div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-foreground text-xs sm:text-base leading-tight">{pu.name}</h3>
                      <p className="text-[10px] sm:text-xs text-muted-foreground leading-snug">{pu.desc}</p>
                    </div>
                  </div>
                  <div className="mt-auto pt-1.5 sm:pt-3 flex items-center justify-between">
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      <Diamond className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                      <span className="text-sm sm:text-lg font-extrabold text-foreground">{pu.diamondCost}</span>
                      {owned > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="ml-1 text-[9px] sm:text-xs text-primary font-medium bg-primary/10 px-1 sm:px-1.5 py-0.5 rounded-full"
                        >
                          {owned}
                        </motion.span>
                      )}
                    </div>
                    <motion.div whileTap={{ scale: 0.9 }}>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px] sm:h-9 sm:px-3 sm:text-sm"
                        onClick={() => handlePowerUpPurchase(pu)}
                        disabled={purchasing === pu.id || !canAfford}
                      >
                        {purchasing === pu.id ? "…" : canAfford ? "Buy" : "Need 💎"}
                      </Button>
                    </motion.div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* 2. Buy Diamonds (middle) */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6 sm:mb-10">
          <h2 className="text-sm sm:text-lg font-bold text-foreground flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-4">
            <Diamond className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary" /> Buy Diamonds
          </h2>
          <div className="grid gap-2 sm:gap-3 grid-cols-3 sm:grid-cols-3 lg:grid-cols-5">
            {diamondPacks.map((pack, i) => (
              <motion.button
                key={pack.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleStripeCheckout(pack.stripePriceId, "payment")}
                disabled={purchasing === pack.stripePriceId}
                className="relative rounded-xl sm:rounded-2xl border border-border bg-card p-2 sm:p-4 text-center transition-colors hover:border-primary/40 hover:shadow-[0_0_25px_hsl(var(--primary)/0.15)] disabled:opacity-50 overflow-hidden"
              >
                {pack.tag && (
                  <div className="absolute top-0 left-0 right-0">
                    <span className="inline-block bg-primary text-primary-foreground text-[8px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-b-md">
                      {pack.tag}
                    </span>
                  </div>
                )}

                <div className="relative flex items-center justify-center">
                  <motion.div
                    animate={sparklingPack === pack.stripePriceId ? { rotate: [0, 15, -15, 10, -10, 0], scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    <Diamond className={`h-5 w-5 sm:h-8 sm:w-8 text-primary mx-auto mb-1 sm:mb-2 ${pack.tag ? "mt-2 sm:mt-3" : ""}`} />
                  </motion.div>
                  <DiamondSparkles show={sparklingPack === pack.stripePriceId} />
                </div>

                <p className="text-sm sm:text-lg font-extrabold text-foreground">{pack.amount.toLocaleString()}</p>
                <p className="text-xs sm:text-sm font-bold text-primary">${pack.price}</p>

                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -skew-x-12 pointer-events-none"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
                />
              </motion.button>
            ))}
          </div>
        </motion.section>

        {/* 3. Mogsy Pro (bottom) */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-10">
          <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 p-4 sm:p-8">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                <motion.div
                  className="flex h-8 w-8 sm:h-12 sm:w-12 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20"
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Crown className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                </motion.div>
                <div>
                  <h2 className="text-lg sm:text-2xl font-extrabold text-foreground">Mogsy Pro</h2>
                  <p className="text-muted-foreground text-xs sm:text-sm">$9.99/month · 7-day free trial</p>
                </div>
                {profile?.is_pro && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="ml-auto rounded-full bg-primary/10 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-primary border border-primary/20"
                  >
                    {isTrial ? "Trial Active" : "Active"}
                  </motion.span>
                )}
              </div>

              <ul className="grid gap-1 sm:gap-2 sm:grid-cols-2 mb-3 sm:mb-6">
                {proFeatures.map((feature, i) => (
                  <motion.li
                    key={feature}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-1.5 sm:gap-2 text-[11px] sm:text-sm text-foreground"
                  >
                    <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary mt-0.5 flex-shrink-0" />
                    {feature}
                  </motion.li>
                ))}
              </ul>

              {profile?.is_pro ? (
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="text-xs sm:text-sm text-primary font-medium">
                    ✨ You're a Pro member!
                    {subscriptionEnd && (
                      <span className="text-muted-foreground ml-1 sm:ml-2">
                        {isTrial ? "Trial ends" : "Renews"}: {new Date(subscriptionEnd).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                  <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={purchasing === "portal"} className="gap-1.5 h-7 text-xs sm:h-9 sm:text-sm">
                    <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
                    {purchasing === "portal" ? "Opening…" : "Manage Subscription"}
                  </Button>
                </div>
              ) : (
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="hero"
                    size="lg"
                    className="w-full sm:w-auto gap-1.5 sm:gap-2 h-9 text-xs sm:h-12 sm:text-base"
                    onClick={() => handleStripeCheckout(STRIPE_PRO_PRICE_ID, "subscription")}
                    disabled={purchasing === STRIPE_PRO_PRICE_ID}
                  >
                    <Crown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    {purchasing === STRIPE_PRO_PRICE_ID ? "Opening checkout…" : "Start Free Trial — $9.99/mo"}
                    <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
