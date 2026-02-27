import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles, Palette, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { profileThemes } from "@/lib/profile-themes";
import mogsyLogo from "@/assets/mogsy-logo-text.png";

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

const THEME_COLORS: Record<string, [string, string]> = {
  midnight: ["hsl(250,50%,25%)", "hsl(260,60%,50%)"],
  forest: ["hsl(150,40%,25%)", "hsl(130,50%,35%)"],
  sunset: ["hsl(20,80%,50%)", "hsl(340,70%,50%)"],
  aurora: ["hsl(170,60%,40%)", "hsl(220,60%,50%)"],
  royal: ["hsl(45,90%,50%)", "hsl(280,40%,30%)"],
  lol: ["hsl(45,100%,50%)", "hsl(200,60%,40%)"],
  cyberpunk: ["hsl(320,100%,50%)", "hsl(180,100%,50%)"],
};

type Step = "welcome" | "pick" | "theme";

interface OnboardingFlowProps {
  onComplete: (categories: string[]) => void;
  skipToTheme?: boolean;
}

export default function OnboardingFlow({ onComplete, skipToTheme }: OnboardingFlowProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(skipToTheme ? "theme" : "welcome");
  const [selected, setSelected] = useState<string[]>([]);
  const [chosenTheme, setChosenTheme] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleCategory = (cat: string) => {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleFinish = async () => {
    if (!skipToTheme && (selected.length < 3 || !user)) return;
    setSaving(true);

    if (chosenTheme) {
      localStorage.setItem("mogsy-chosen-free-theme", chosenTheme);
      localStorage.setItem("mogsy-active-theme", chosenTheme);
    }

    if (!skipToTheme && user) {
      await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          preferred_categories: selected,
          custom_theme: chosenTheme || "default",
        })
        .eq("user_id", user.id);
    }

    setSaving(false);
    onComplete(selected);
  };

  const proThemes = profileThemes.filter((t) => t.isPro);

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
              src={mogsyLogo}
              alt="Mogsy"
              className="h-20 sm:h-28 mb-6"
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
                onClick={() => setStep("theme")}
                disabled={selected.length < 3}
                className="gap-2 rounded-full px-8"
                size="lg"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
              {selected.length < 3 && (
                <p className="text-xs text-muted-foreground">
                  {selected.length}/3 selected
                </p>
              )}
            </div>
          </motion.div>
        )}

        {step === "theme" && (
          <motion.div
            key="theme"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center text-center max-w-md w-full"
          >
            <Palette className="h-8 w-8 text-primary mb-4" />
            <h2 className="text-2xl font-extrabold text-foreground mb-2">
              Choose Your Vibe
            </h2>
            <p className="text-muted-foreground text-sm mb-2">
              Pick <span className="font-bold text-primary">1 premium theme</span> to try for free.
            </p>
            <p className="text-muted-foreground text-xs mb-6 flex items-center gap-1">
              <Crown className="h-3 w-3 text-yellow-500" /> Pro users unlock all themes
            </p>

            <div className="flex flex-wrap justify-center gap-4 mb-8">
              {proThemes.map((theme, i) => {
                const colors = THEME_COLORS[theme.id] || ["#333", "#555"];
                const isChosen = chosenTheme === theme.id;
                return (
                  <motion.button
                    key={theme.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setChosenTheme(isChosen ? null : theme.id)}
                    className={`flex flex-col items-center gap-2 group`}
                  >
                    <div
                      className={`w-14 h-14 rounded-full border-3 transition-all ${
                        isChosen
                          ? "border-primary ring-4 ring-primary/30 shadow-lg scale-110"
                          : "border-border hover:border-primary/50"
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
                        borderWidth: 3,
                      }}
                    />
                    <span className={`text-xs font-semibold ${isChosen ? "text-primary" : "text-muted-foreground"}`}>
                      {theme.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleFinish}
                disabled={saving}
                className="gap-2 rounded-full px-8"
                size="lg"
              >
                {saving ? "Saving..." : skipToTheme ? "Done" : "Let's Go!"}
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!chosenTheme && (
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
