import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Palette, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { profileThemes } from "@/lib/profile-themes";
import { supabase } from "@/integrations/supabase/client";
import OnboardingDots from "./OnboardingDots";

const THEME_COLORS: Record<string, [string, string]> = {
  light: ["hsl(209,40%,96%)", "hsl(210,80%,60%)"],
  dark: ["hsl(222,47%,11%)", "hsl(210,80%,65%)"],
  midnight: ["hsl(250,50%,25%)", "hsl(260,60%,50%)"],
  forest: ["hsl(150,40%,25%)", "hsl(130,50%,35%)"],
  sunset: ["hsl(20,80%,50%)", "hsl(340,70%,50%)"],
  aurora: ["hsl(170,60%,40%)", "hsl(220,60%,50%)"],
  royal: ["hsl(45,90%,50%)", "hsl(280,40%,30%)"],
  lol: ["hsl(45,100%,50%)", "hsl(200,60%,40%)"],
  cyberpunk: ["hsl(320,100%,50%)", "hsl(180,100%,50%)"],
};

interface Props {
  chosenTheme: string | null;
  setChosenTheme: (t: string | null) => void;
  onFinish: () => void;
  saving: boolean;
  skipToTheme?: boolean;
}

export default function OnboardingTheme({ chosenTheme, setChosenTheme, onFinish, saving, skipToTheme }: Props) {
  const proThemes = profileThemes.filter(t => t.isPro);
  const [themeIcons, setThemeIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "onboarding_config")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "object" && "theme_icons" in (data.value as any)) {
          setThemeIcons((data.value as any).theme_icons || {});
        }
      });
  }, []);

  return (
    <motion.div
      key="theme"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center text-center max-w-md w-full"
    >
      <Palette className="h-8 w-8 text-primary mb-4" />
      <h2 className="text-2xl font-extrabold text-foreground mb-2">Choose Your Vibe</h2>
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
          const customIcon = themeIcons[theme.id];
          return (
            <motion.button
              key={theme.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setChosenTheme(isChosen ? null : theme.id)}
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className={`w-14 h-14 rounded-full border-3 transition-all flex items-center justify-center text-lg ${
                  isChosen
                    ? "border-primary ring-4 ring-primary/30 shadow-lg scale-110"
                    : "border-border hover:border-primary/50"
                }`}
                style={{
                  background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
                  borderWidth: 3,
                }}
              >
                {customIcon && <span className="drop-shadow-sm">{customIcon}</span>}
              </div>
              <span className={`text-xs font-semibold ${isChosen ? "text-primary" : "text-muted-foreground"}`}>
                {theme.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button onClick={onFinish} disabled={saving} className="gap-2 rounded-full px-8" size="lg">
          {saving ? "Saving..." : skipToTheme ? "Done" : "Let's Go!"}
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!chosenTheme && (
          <button onClick={onFinish} disabled={saving} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Skip for now
          </button>
        )}
      </div>
      <OnboardingDots current="theme" />
    </motion.div>
  );
}