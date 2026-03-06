import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Lock, Crown, Check } from "lucide-react";
import { profileThemes } from "@/lib/profile-themes";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

interface ThemeConfig {
  free_themes: string[];
  pro_themes: string[];
  disabled_themes: string[];
}

function getCircleGradient(theme: typeof profileThemes[number]): string {
  if (theme.id === "default") return "linear-gradient(135deg, hsl(210,80%,60%), hsl(270,60%,65%))";
  if (theme.styles.pageBg) return theme.styles.pageBg;
  return "hsl(210,80%,60%)";
}

export default function FloatingThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const { themeId, isPro, setActiveTheme, chosenFreeTheme } = useSitewideTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const [themeConfig, setThemeConfig] = useState<ThemeConfig | null>(null);

  // Load theme config from DB
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "theme_config")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setThemeConfig(data.value as any);
      });
  }, []);

  // Listen for admin updates
  useEffect(() => {
    const handler = (e: Event) => {
      const config = (e as CustomEvent).detail;
      if (config) setThemeConfig(config);
    };
    window.addEventListener("theme-config-updated", handler);
    return () => window.removeEventListener("theme-config-updated", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Filter out disabled themes
  const visibleThemes = profileThemes.filter((t) => {
    if (t.id === "default") return true;
    if (themeConfig?.disabled_themes?.includes(t.id)) return false;
    return true;
  });

  const isThemePro = (id: string) => {
    if (id === "default") return false;
    if (themeConfig) return themeConfig.pro_themes?.includes(id) ?? false;
    const theme = profileThemes.find((t) => t.id === id);
    return theme?.isPro ?? false;
  };

  const canUseTheme = (id: string) => {
    if (id === "default") return true;
    if (isPro) return true;
    if (chosenFreeTheme === id) return true;
    if (themeConfig) {
      if (themeConfig.free_themes?.includes(id)) return true;
      return false;
    }
    const theme = profileThemes.find((t) => t.id === id);
    if (theme && !theme.isPro) return true;
    return false;
  };

  const handleSelect = (id: string) => {
    setOpen(false);
    setActiveTheme(id);
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div ref={menuRef} className="fixed bottom-6 right-6 z-[60] flex flex-col items-center gap-2">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-2.5 mb-2 p-3 rounded-2xl bg-card/90 backdrop-blur-xl border border-border shadow-xl max-h-[70vh] overflow-y-auto"
            >
              {visibleThemes.map((theme) => {
                const locked = !canUseTheme(theme.id);
                const isActive = themeId === theme.id;
                const pro = isThemePro(theme.id);
                const bg = getCircleGradient(theme);

                return (
                  <Tooltip key={theme.id}>
                    <TooltipTrigger asChild>
                      <motion.button
                        whileHover={{ scale: locked ? 1 : 1.15 }}
                        whileTap={{ scale: locked ? 1 : 0.9 }}
                        onClick={() => !locked && handleSelect(theme.id)}
                        className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all relative shrink-0 ${
                          isActive
                            ? "border-primary ring-2 ring-primary/40 shadow-lg"
                            : locked
                            ? "border-border opacity-50 cursor-not-allowed"
                            : "border-border hover:border-primary/50"
                        }`}
                        style={{ background: bg }}
                      >
                        {isActive && (
                          <Check className="h-4 w-4 drop-shadow-md" style={{ color: "white" }} />
                        )}
                        {locked && !isActive && (
                          <Lock className="h-3 w-3 drop-shadow" style={{ color: "rgba(255,255,255,0.8)" }} />
                        )}
                        {pro && !locked && !isActive && (
                          <Crown className="h-3 w-3 drop-shadow absolute -top-1 -right-1" style={{ color: "hsl(45,100%,55%)" }} />
                        )}
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs font-medium z-[70]" sideOffset={12}>
                      {theme.label}{locked ? " (Pro)" : ""}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main FAB */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setOpen((o) => !o)}
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center border-2 border-primary/50 hover:shadow-2xl transition-shadow"
        >
          <Palette className="h-5 w-5" />
        </motion.button>
      </div>
    </TooltipProvider>
  );
}
