import { motion } from "framer-motion";
import { LogOut, ArrowLeft, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import { useCardAnimation } from "@/hooks/useCardAnimation";
import { CARD_ANIMATIONS } from "@/lib/card-animations";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { swipeAnimation, elocheckAnimation, setSwipeAnimation, setElocheckAnimation, loading: animLoading } = useCardAnimation();
  const [isPro, setIsPro] = useState(false);
  const [animConfig, setAnimConfig] = useState<Record<string, { enabled: boolean; pro_only: boolean }>>({});

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("is_pro").eq("user_id", user.id).single()
        .then(({ data }) => { if (data?.is_pro) setIsPro(true); });
    }
    supabase.from("app_settings").select("value").eq("key", "card_animations").single()
      .then(({ data }) => {
        if (data?.value) setAnimConfig(data.value as any);
      });
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isAnimAvailable = (animId: string) => {
    const cfg = animConfig[animId];
    if (cfg && !cfg.enabled) return false;
    if (cfg && cfg.pro_only && !isPro) return false;
    return true;
  };

  const availableAnims = CARD_ANIMATIONS.filter(a => {
    const cfg = animConfig[a.id];
    if (cfg && !cfg.enabled) return false;
    return true;
  });

  return (
    <div className="min-h-screen px-4 py-8">
      <SEOHead title="Settings — Mogsy" description="Manage your Mogsy settings. Change theme, sign out, and customize your experience." />
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground">Settings</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Use the <span className="font-semibold text-primary">theme button</span> in the bottom-right corner to change your app appearance.
        </p>

        {/* Card Animations */}
        {!animLoading && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-card p-6 mb-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-foreground">Card Animations</h2>
            </div>

            {/* Swipe Game */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Swipe Game</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableAnims.filter(a => a.contexts.includes("swipe")).map(anim => {
                  const available = isAnimAvailable(anim.id);
                  const selected = swipeAnimation === anim.id;
                  const cfg = animConfig[anim.id];
                  const isProOnly = cfg?.pro_only;

                  return (
                    <button
                      key={anim.id}
                      onClick={() => available && setSwipeAnimation(anim.id)}
                      disabled={!available}
                      className={`relative rounded-xl border p-3 text-left transition-all ${
                        selected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : available
                          ? "border-border bg-card hover:border-primary/50 hover:bg-secondary"
                          : "border-border bg-muted opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{anim.icon}</span>
                        <span className="text-xs font-bold text-foreground">{anim.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">{anim.description}</p>
                      {isProOnly && !isPro && (
                        <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[8px] px-1 py-0">PRO</Badge>
                      )}
                      {isProOnly && isPro && (
                        <Badge className="absolute top-1.5 right-1.5 text-[8px] px-1 py-0 bg-primary/20 text-primary border-0">PRO ✓</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Elo Check */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Elo Check</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableAnims.filter(a => a.contexts.includes("elocheck")).map(anim => {
                  const available = isAnimAvailable(anim.id);
                  const selected = elocheckAnimation === anim.id;
                  const cfg = animConfig[anim.id];
                  const isProOnly = cfg?.pro_only;

                  return (
                    <button
                      key={anim.id}
                      onClick={() => available && setElocheckAnimation(anim.id)}
                      disabled={!available}
                      className={`relative rounded-xl border p-3 text-left transition-all ${
                        selected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : available
                          ? "border-border bg-card hover:border-primary/50 hover:bg-secondary"
                          : "border-border bg-muted opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{anim.icon}</span>
                        <span className="text-xs font-bold text-foreground">{anim.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">{anim.description}</p>
                      {isProOnly && !isPro && (
                        <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[8px] px-1 py-0">PRO</Badge>
                      )}
                      {isProOnly && isPro && (
                        <Badge className="absolute top-1.5 right-1.5 text-[8px] px-1 py-0 bg-primary/20 text-primary border-0">PRO ✓</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.section>
        )}

        {/* Account */}
        {user && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <h2 className="font-bold text-foreground mb-4">Account</h2>
            <p className="text-sm text-muted-foreground mb-4">Signed in as {user.email}</p>
            <Button variant="destructive" onClick={handleSignOut} className="w-full">
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </motion.section>
        )}
      </div>
    </div>
  );
}
