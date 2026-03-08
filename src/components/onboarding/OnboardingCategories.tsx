import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import OnboardingDots from "./OnboardingDots";

const DEFAULT_CATEGORY_EMOJIS: Record<string, string> = {
  Anime: "🎌", Movies: "🎬", "Video Games": "🎮", Celebrities: "⭐",
  Sports: "⚽", Food: "🍔", Other: "🌈",
};

interface Props {
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  onNext: () => void;
}

export default function OnboardingCategories({ selected, setSelected, onNext }: Props) {
  const [categories, setCategories] = useState<{ name: string; emoji: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: settingsData } = await supabase
        .from("app_settings").select("value").eq("key", "onboarding_categories").single();

      if (settingsData?.value && Array.isArray((settingsData.value as any)?.categories)) {
        const cats = (settingsData.value as any).categories as { name: string; emoji: string }[];
        if (cats.length > 0) { setCategories(cats); return; }
      }

      const { data: leagues } = await supabase
        .from("leagues").select("category").not("category", "is", null);
      if (leagues) {
        const unique = [...new Set(leagues.map(l => l.category).filter(Boolean))] as string[];
        setCategories(unique.map(name => ({ name, emoji: DEFAULT_CATEGORY_EMOJIS[name] || "📁" })));
      }
    };
    load();
  }, []);

  const toggle = (cat: string) => {
    setSelected(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  return (
    <motion.div
      key="pick"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center text-center max-w-md w-full"
    >
      <Sparkles className="h-8 w-8 text-primary mb-4" />
      <h2 className="text-2xl font-extrabold text-foreground mb-2">What are you into?</h2>
      <p className="text-muted-foreground text-sm mb-6">
        Pick at least <span className="font-bold text-primary">3 categories</span> to personalize your experience.
      </p>

      <div className="flex flex-wrap justify-center gap-3 mb-8">
        {categories.map((cat, i) => {
          const isSelected = selected.includes(cat.name);
          return (
            <motion.button
              key={cat.name}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggle(cat.name)}
              className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold border-2 transition-all ${
                isSelected
                  ? "border-primary bg-primary/15 text-primary shadow-md"
                  : "border-border bg-card text-foreground hover:border-primary/30"
              }`}
            >
              <span className="text-lg">{cat.emoji}</span>
              {cat.name}
            </motion.button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button onClick={onNext} disabled={selected.length < 3} className="gap-2 rounded-full px-8" size="lg">
          Continue <ChevronRight className="h-4 w-4" />
        </Button>
        {selected.length < 3 && (
          <p className="text-xs text-muted-foreground">{selected.length}/3 selected</p>
        )}
      </div>
      <OnboardingDots current="pick" />
    </motion.div>
  );
}
