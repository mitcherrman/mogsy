import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Crown, Zap, Eye, Undo2, Shield, Sparkles, Check, Diamond, ArrowLeft, ExternalLink, CreditCard, Star, Plus, Wrench, Gift, Copy, Heart, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/SEOHead";
import { useToast } from "@/hooks/use-toast";
import { useShopSound } from "@/hooks/useShopSound";
import ProCinematicAd from "@/components/ProCinematicAd";

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
const STRIPE_PRO_ANNUAL_PRICE_ID = "price_1TZRqtD9NqEQUIGhXUSpw5DI";
const STRIPE_GIFT_PRO_MONTHLY_PRICE_ID = "price_1TZS2yD9NqEQUIGhP9HWjgy1";
const STRIPE_GIFT_PRO_ANNUAL_PRICE_ID = "price_1TZS92D9NqEQUIGhCx5fczRp";
const WINBACK_COUPON_ID = "sCkrnnuL"; // 30% off 3 months

const PRO_MONTHLY_PRICE = 9.99;
const PRO_ANNUAL_PRICE = 83.99;
const PRO_ANNUAL_SAVINGS_PCT = Math.round((1 - PRO_ANNUAL_PRICE / (PRO_MONTHLY_PRICE * 12)) * 100); // 30%

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDiamondAmount, setAdminDiamondAmount] = useState("1000");
  const [showAdminGrant, setShowAdminGrant] = useState(false);
  const [needDiamondsPrompt, setNeedDiamondsPrompt] = useState<{ needed: number; have: number; name: string } | null>(null);
  const [showProAd, setShowProAd] = useState(false);
  const [shopAdConfig, setShopAdConfig] = useState<{ enabled: boolean; type: string; headline: string; subtext: string } | null>(null);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [wasCustomer, setWasCustomer] = useState(false);
  const [giftType, setGiftType] = useState<"pro_monthly" | "pro_annual" | "diamonds">("pro_monthly");
  const [giftDiamondPackId, setGiftDiamondPackId] = useState(diamondPacks[2].id);
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [giftSuccess, setGiftSuccess] = useState<{ code: string; recipient: string; gift_type: string } | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const diamondSectionRef = useRef<HTMLElement>(null);
  const { playPurchaseSound, playDiamondTap, playPowerUpSound } = useShopSound();

  useEffect(() => {
    if (user) {
      setLoading(true);
      loadProfile();
      checkSubscription();
      checkAdmin();
      loadShopAdConfig();
    } else {
      setLoading(false);
      setProfile(null);
    }
  }, [user?.id]);

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
    const giftCode = searchParams.get("code");
    if (searchParams.get("gift_success") === "1" && giftCode) {
      (async () => {
        try {
          const { data } = await supabase.functions.invoke("verify-gift", { body: { code: giftCode } });
          if (data?.redeem_code) {
            setGiftSuccess({ code: data.redeem_code, recipient: data.recipient_email, gift_type: data.gift_type });
            playPurchaseSound();
          }
        } catch {}
      })();
    }
  }, [searchParams]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, is_pro, boost_credits, elo_shields, reveals, rewinds, diamonds")
      .eq("user_id", user.id)
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
        setBillingInterval(data.interval === "year" ? "year" : "month");
      } else {
        setSubscriptionEnd(null);
        setIsTrial(false);
      }
      setWasCustomer(!!data?.was_customer);
    } catch {}
  };

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (data?.some(r => r.role === "admin" || r.role === "master_admin")) {
      setIsAdmin(true);
    }
  };

  const loadShopAdConfig = async () => {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "shop_ad_config").maybeSingle();
    if (data?.value) {
      setShopAdConfig(data.value as any);
    }
  };

  const handleStripeCheckout = async (priceId: string, mode: "payment" | "subscription", extras?: { couponId?: string; gift?: any }) => {
    setPurchasing(priceId);
    if (mode === "payment") {
      playDiamondTap();
      setSparklingPack(priceId);
      setTimeout(() => setSparklingPack(null), 700);
    }
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, mode, ...(extras || {}) },
      });
      if (error) throw error;
      if (data?.url) {
        const win = window.open(data.url, "_blank", "noopener,noreferrer");
        if (!win || win.closed || typeof win.closed === "undefined") {
          // Popup blocked — fall back to in-tab navigation so user can still complete checkout
          window.location.href = data.url;
        }
      }
    } catch (err: any) {
      toast({ title: "Checkout error", description: err.message || "Something went wrong", variant: "destructive" });
    }
    setPurchasing(null);
  };

  const handleGiftCheckout = async () => {
    const email = giftRecipient.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", description: "Enter a valid recipient email.", variant: "destructive" });
      return;
    }
    let priceId = "";
    let gift: any = { recipient_email: email, message: giftMessage, gift_type: giftType };
    if (giftType === "pro_monthly") priceId = STRIPE_GIFT_PRO_MONTHLY_PRICE_ID;
    else if (giftType === "pro_annual") priceId = STRIPE_GIFT_PRO_ANNUAL_PRICE_ID;
    else {
      const pack = diamondPacks.find(p => p.id === giftDiamondPackId);
      if (!pack) return;
      priceId = pack.stripePriceId;
      gift.diamond_amount = pack.amount;
    }
    await handleStripeCheckout(priceId, "payment", { gift });
  };

  const handleRedeemGift = async () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-gift", { body: { code } });
      if (error || !data?.success) {
        toast({ title: "Could not redeem", description: data?.reason || error?.message || "Invalid code", variant: "destructive" });
      } else {
        toast({ title: "🎁 Gift redeemed!", description: data.gift_type === "diamonds" ? `+${data.diamond_amount} 💎 added.` : "Mogsy Pro is now active!" });
        setRedeemCode("");
        await loadProfile();
        await checkSubscription();
      }
    } finally {
      setRedeeming(false);
    }
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
      setNeedDiamondsPrompt({ needed: powerUp.diamondCost, have: profile.diamonds || 0, name: powerUp.name });
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

  const scrollToDiamonds = () => {
    setNeedDiamondsPrompt(null);
    setTimeout(() => {
      diamondSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const handleAdminGrantDiamonds = async () => {
    if (!profile) return;
    const amount = parseInt(adminDiamondAmount) || 0;
    if (amount <= 0) return;
    const { error } = await supabase
      .from("profiles")
      .update({ diamonds: (profile.diamonds || 0) + amount })
      .eq("id", profile.id);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      setProfile({ ...profile, diamonds: (profile.diamonds || 0) + amount });
      toast({ title: `+${amount} 💎 granted`, description: `You now have ${(profile.diamonds || 0) + amount} diamonds.` });
    }
  };

  if (loading) {
    return <div className="min-h-dvh" />;
  }

  return (
    <div className="min-h-dvh px-3 sm:px-4 py-4 sm:py-8">
      <SEOHead title="Shop — Mogsy" description="Get diamonds, boosts, shields, and premium items in the Mogsy shop. Power up your leaderboard experience." />
      <div className="container mx-auto max-w-3xl lg:max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
          <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => navigate(-1)} className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground hover:text-foreground">
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

        {/* Admin Diamond Grant */}
        {isAdmin && (
          <div className="mb-4">
            <Button variant="outline" size="sm" onClick={() => setShowAdminGrant(!showAdminGrant)} className="gap-1.5 text-xs border-primary/30 text-primary">
              <Wrench className="h-3 w-3" /> Admin: Grant Diamonds
            </Button>
            <AnimatePresence>
              {showAdminGrant && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="flex items-center gap-2 mt-2 p-3 rounded-xl border border-primary/20 bg-primary/5">
                    <Input
                      type="number"
                      min={1}
                      value={adminDiamondAmount}
                      onChange={e => setAdminDiamondAmount(e.target.value)}
                      className="w-32 h-8 text-sm"
                      placeholder="Amount"
                    />
                    <Button size="sm" onClick={handleAdminGrantDiamonds} className="h-8 gap-1">
                      <Plus className="h-3 w-3" /> Grant to myself
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Configurable Shop Ad Banner */}
        {shopAdConfig?.enabled && !profile?.is_pro && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-card p-3 sm:p-4 cursor-pointer"
            onClick={() => {
              if (shopAdConfig.type === "pro") {
                setShowProAd(true);
              } else {
                diamondSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }}
          >
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0"
              >
                {shopAdConfig.type === "pro" ? <Crown className="h-5 w-5 text-primary" /> : <Diamond className="h-5 w-5 text-primary" />}
              </motion.div>
              <div>
                <p className="text-sm font-bold text-foreground">{shopAdConfig.headline || "Upgrade to Pro!"}</p>
                <p className="text-xs text-muted-foreground">{shopAdConfig.subtext || "Unlock themes, animations, and more."}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </div>
          </motion.div>
        )}

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
                        disabled={purchasing === pu.id}
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
        <motion.section ref={diamondSectionRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6 sm:mb-10">
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
                  <p className="text-muted-foreground text-xs sm:text-sm">
                    From ${PRO_MONTHLY_PRICE}/mo · 7-day free trial
                  </p>
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

              {/* Win-back banner for lapsed subscribers */}
              {!profile?.is_pro && wasCustomer && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 flex items-center gap-2"
                  role="status"
                >
                  <Heart className="h-4 w-4 text-accent shrink-0" />
                  <p className="text-xs sm:text-sm text-foreground">
                    <span className="font-bold">Welcome back!</span> We miss you — get{" "}
                    <span className="font-bold text-accent">30% off your first 3 months</span> applied automatically.
                  </p>
                </motion.div>
              )}

              {/* Billing interval toggle (hidden if already Pro) */}
              {!profile?.is_pro && (
                <div
                  className="inline-flex items-center rounded-full border border-border bg-card p-0.5 mb-3"
                  role="tablist"
                  aria-label="Billing period"
                >
                  <button
                    role="tab"
                    aria-selected={billingInterval === "month"}
                    onClick={() => setBillingInterval("month")}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-colors ${billingInterval === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Monthly
                  </button>
                  <button
                    role="tab"
                    aria-selected={billingInterval === "year"}
                    onClick={() => setBillingInterval("year")}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-colors flex items-center gap-1.5 ${billingInterval === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Yearly
                    <span className="text-[9px] sm:text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground">
                      Save {PRO_ANNUAL_SAVINGS_PCT}%
                    </span>
                  </button>
                </div>
              )}

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
                <div className="flex flex-col sm:flex-row gap-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="hero"
                      size="lg"
                      className="w-full sm:w-auto gap-1.5 sm:gap-2 h-9 text-xs sm:h-12 sm:text-base"
                      onClick={() => {
                        const priceId = billingInterval === "year" ? STRIPE_PRO_ANNUAL_PRICE_ID : STRIPE_PRO_PRICE_ID;
                        const extras = wasCustomer && billingInterval === "month" ? { couponId: WINBACK_COUPON_ID } : undefined;
                        handleStripeCheckout(priceId, "subscription", extras);
                      }}
                      disabled={purchasing === STRIPE_PRO_PRICE_ID || purchasing === STRIPE_PRO_ANNUAL_PRICE_ID}
                      aria-label={billingInterval === "year" ? `Start Mogsy Pro yearly for ${PRO_ANNUAL_PRICE} dollars` : `Start Mogsy Pro monthly free trial`}
                    >
                      <Crown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {(purchasing === STRIPE_PRO_PRICE_ID || purchasing === STRIPE_PRO_ANNUAL_PRICE_ID)
                        ? "Opening checkout…"
                        : billingInterval === "year"
                          ? `Get Pro Yearly — $${PRO_ANNUAL_PRICE}/yr`
                          : `Start Free Trial — $${PRO_MONTHLY_PRICE}/mo`}
                      <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </Button>
                  </motion.div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs sm:h-12 sm:text-sm gap-1.5"
                    onClick={() => setShowProAd(true)}
                    aria-label="Preview Pro features"
                  >
                    <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                    Preview Pro
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* 4. Gift section */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-10">
          <div className="rounded-xl sm:rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="text-sm sm:text-lg font-bold text-foreground flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
              <Gift className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-accent" /> Send a Gift
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-3">
              Give Pro or a diamond pack to a friend. They'll get a redemption code to claim it.
            </p>

            <fieldset className="mb-3">
              <legend className="text-xs font-bold text-muted-foreground mb-1.5">Gift type</legend>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "pro_monthly", label: "Pro · 1 mo", sub: `$${PRO_MONTHLY_PRICE}` },
                  { id: "pro_annual", label: "Pro · 1 yr", sub: `$${PRO_ANNUAL_PRICE}` },
                  { id: "diamonds", label: "Diamonds", sub: "Pick pack" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGiftType(opt.id as any)}
                    aria-pressed={giftType === opt.id}
                    className={`rounded-lg border px-2 py-2 text-center transition-colors ${giftType === opt.id ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"}`}
                  >
                    <p className="text-xs sm:text-sm font-bold text-foreground">{opt.label}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{opt.sub}</p>
                  </button>
                ))}
              </div>
            </fieldset>

            {giftType === "diamonds" && (
              <div className="mb-3 flex flex-wrap gap-2">
                {diamondPacks.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setGiftDiamondPackId(pack.id)}
                    aria-pressed={giftDiamondPackId === pack.id}
                    className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${giftDiamondPackId === pack.id ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {pack.amount} 💎 · ${pack.price}
                  </button>
                ))}
              </div>
            )}

            <label className="block text-xs font-bold text-muted-foreground mb-1" htmlFor="gift-email">
              Recipient email
            </label>
            <Input
              id="gift-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="friend@example.com"
              value={giftRecipient}
              onChange={(e) => setGiftRecipient(e.target.value)}
              className="mb-2"
            />
            <label className="block text-xs font-bold text-muted-foreground mb-1" htmlFor="gift-message">
              Note (optional)
            </label>
            <Input
              id="gift-message"
              type="text"
              maxLength={140}
              placeholder="Happy birthday!"
              value={giftMessage}
              onChange={(e) => setGiftMessage(e.target.value)}
              className="mb-3"
            />

            <Button
              onClick={handleGiftCheckout}
              disabled={!giftRecipient || !!purchasing}
              className="w-full sm:w-auto gap-1.5"
              aria-label="Continue to gift checkout"
            >
              <Gift className="h-4 w-4" />
              Continue to checkout
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </motion.section>

        {/* 5. Redeem a gift */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-10">
          <div className="rounded-xl sm:rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="text-sm sm:text-lg font-bold text-foreground flex items-center gap-1.5 sm:gap-2 mb-2">
              <Tag className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-accent" /> Redeem a Gift Code
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-3">
              Got a code from a friend? Enter it here.
            </p>
            <div className="flex gap-2">
              <Input
                aria-label="Gift redemption code"
                placeholder="ABCDE12345"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                maxLength={20}
                className="uppercase tracking-widest"
              />
              <Button onClick={handleRedeemGift} disabled={!redeemCode || redeeming}>
                {redeeming ? "…" : "Redeem"}
              </Button>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Insufficient Diamonds Prompt */}
      <AnimatePresence>
        {needDiamondsPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
            onClick={() => setNeedDiamondsPrompt(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl border border-border bg-card p-5 sm:p-6 max-w-sm w-full shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <motion.div
                  animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6 }}
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/20 mb-3"
                >
                  <Diamond className="h-7 w-7 text-primary" />
                </motion.div>
                <h3 className="text-lg font-extrabold text-foreground">Need More Diamonds!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-bold text-foreground">{needDiamondsPrompt.name}</span> costs{" "}
                  <span className="text-primary font-bold">{needDiamondsPrompt.needed} 💎</span> but you only have{" "}
                  <span className="text-primary font-bold">{needDiamondsPrompt.have} 💎</span>
                </p>
              </div>
              <div className="space-y-2">
                <Button className="w-full gap-2" onClick={scrollToDiamonds}>
                  <Diamond className="h-4 w-4" /> Buy Diamonds
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => setNeedDiamondsPrompt(null)}>
                  Maybe later
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pro Cinematic Ad */}
      <AnimatePresence>
        {showProAd && <ProCinematicAd onClose={() => setShowProAd(false)} onSubscribe={() => { setShowProAd(false); handleStripeCheckout(STRIPE_PRO_PRICE_ID, "subscription"); }} />}
      </AnimatePresence>

      {/* Gift purchased — show code modal */}
      <AnimatePresence>
        {giftSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
            onClick={() => setGiftSuccess(null)}
            role="dialog"
            aria-labelledby="gift-success-title"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl border border-border bg-card p-6 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 border border-accent/20 mb-3">
                  <Gift className="h-7 w-7 text-accent" />
                </div>
                <h3 id="gift-success-title" className="text-lg font-extrabold text-foreground">Gift purchased! 🎁</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Share this code with <span className="font-bold text-foreground">{giftSuccess.recipient}</span>:
                </p>
              </div>
              <div className="flex items-center gap-2 mb-3 rounded-lg border border-border bg-background p-2.5">
                <code className="flex-1 font-mono text-center text-lg font-extrabold tracking-widest text-primary">
                  {giftSuccess.code}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copy gift code"
                  onClick={() => {
                    navigator.clipboard?.writeText(giftSuccess.code);
                    toast({ title: "Copied!", description: "Code copied to clipboard." });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center mb-3">
                They can redeem it at <span className="font-mono">/shop</span> → Redeem a Gift Code.
              </p>
              <Button className="w-full" onClick={() => setGiftSuccess(null)}>
                Done
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
