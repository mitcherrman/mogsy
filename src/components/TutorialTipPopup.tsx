import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTutorialTips } from "@/hooks/useTutorialTips";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function TutorialTipPopup() {
  const location = useLocation();
  const { user } = useAuth();
  const { tips, dismissTip } = useTutorialTips(location.pathname);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setOnboardingDone(null); return; }
    supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setOnboardingDone(data?.onboarding_completed ?? false);
      });
  }, [user]);

  if (onboardingDone === false || onboardingDone === null) return null;
  if (tips.length === 0) return null;

  const tip = tips[Math.min(currentIndex, tips.length - 1)];
  if (!tip) return null;

  const isLast = currentIndex >= tips.length - 1;

  const handleNext = () => {
    dismissTip(tip.id);
    if (isLast) {
      setCurrentIndex(0);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleDismissAll = () => {
    tips.forEach((t) => dismissTip(t.id));
    setCurrentIndex(0);
  };

  return (
    <AnimatePresence>
      <motion.div
        key={tip.id}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed bottom-20 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:max-w-sm"
      >
        <div className="rounded-2xl border-2 border-primary/30 bg-card shadow-2xl shadow-primary/10 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs font-bold text-primary uppercase tracking-wide">Tip {currentIndex + 1}/{tips.length}</span>
            <button
              onClick={handleDismissAll}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 py-3">
            <h3 className="text-sm font-bold text-foreground mb-1">{tip.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{tip.message}</p>
          </div>
          <div className="flex items-center justify-between px-4 pb-3">
            <button
              onClick={handleDismissAll}
              className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip all
            </button>
            <Button size="sm" onClick={handleNext} className="h-7 px-3 text-xs gap-1">
              {isLast ? "Got it!" : "Next"}
              {!isLast && <ChevronRight className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
