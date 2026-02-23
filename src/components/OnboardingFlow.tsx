import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import mogsyIcon from "@/assets/mogsy-icon.png";

const ALL_CATEGORIES = [
  "Anime",
  "Movies",
  "Video Games",
  "Celebrities",
  "Sports",
  "Food",
  "Other",
];

const CATEGORY_EMOJIS: Record<string, string> = {
  Anime: "🎌",
  Movies: "🎬",
  "Video Games": "🎮",
  Celebrities: "⭐",
  Sports: "⚽",
  Food: "🍔",
  Other: "🌈",
};

type Step = "welcome" | "pick";

export default function OnboardingFlow({ onComplete }: { onComplete: (categories: string[]) => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleCategory = (cat: string) => {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleFinish = async () => {
    if (selected.length < 3 || !user) return;
    setSaving(true);
    await supabase
      .from("profiles")
      .update({
        onboarding_completed: true,
        preferred_categories: selected,
      })
      .eq("user_id", user.id);
    setSaving(false);
    onComplete(selected);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center px-4">
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            <motion.img
              src={mogsyIcon}
              alt="Mogsy"
              className="h-24 w-24 mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
            />
            <h1 className="text-3xl font-extrabold text-foreground mb-3">
              Welcome to Mogsy!
            </h1>
            <p className="text-muted-foreground text-sm mb-2">
              Swipe, rank, and discover who (or what) comes out on top.
            </p>
            <p className="text-muted-foreground text-xs mb-8">
              Pick your favorite in head-to-head matchups across collections — or compete against other users to climb the leaderboard.
            </p>
            <Button
              onClick={() => setStep("pick")}
              className="gap-2 rounded-full px-8"
              size="lg"
            >
              Let's Go <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {step === "pick" && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center text-center max-w-md w-full"
          >
            <Sparkles className="h-8 w-8 text-primary mb-4" />
            <h2 className="text-2xl font-extrabold text-foreground mb-2">
              What are you into?
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Pick at least <span className="font-bold text-primary">3 categories</span> to personalize your experience.
            </p>

            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {ALL_CATEGORIES.map((cat, i) => {
                const isSelected = selected.includes(cat);
                return (
                  <motion.button
                    key={cat}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleCategory(cat)}
                    className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold border-2 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/15 text-primary shadow-md"
                        : "border-border bg-card text-foreground hover:border-primary/30"
                    }`}
                  >
                    <span className="text-lg">{CATEGORY_EMOJIS[cat]}</span>
                    {cat}
                  </motion.button>
                );
              })}
            </div>

            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleFinish}
                disabled={selected.length < 3 || saving}
                className="gap-2 rounded-full px-8"
                size="lg"
              >
                {saving ? "Saving..." : "Continue"}
                <ChevronRight className="h-4 w-4" />
              </Button>
              {selected.length < 3 && (
                <p className="text-xs text-muted-foreground">
                  {selected.length}/3 selected
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
