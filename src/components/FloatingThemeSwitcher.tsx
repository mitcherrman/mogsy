import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Sun, Moon, Lock, Crown } from "lucide-react";
import { profileThemes } from "@/lib/profile-themes";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";

const THEME_COLORS: Record<string, string> = {
  default: "transparent",
  midnight: "hsl(250,50%,25%)",
  forest: "hsl(150,40%,25%)",
  sunset: "hsl(20,80%,50%)",
  aurora: "hsl(170,60%,40%)",
  royal: "hsl(45,90%,50%)",
  lol: "hsl(45,100%,50%)",
  cyberpunk: "hsl(320,100%,50%)",
};

const THEME_SECONDARY: Record<string, string> = {
  default: "transparent",
  midnight: "hsl(260,60%,50%)",
  forest: "hsl(130,50%,35%)",
  sunset: "hsl(340,70%,50%)",
  aurora: "hsl(220,60%,50%)",
  royal: "hsl(280,40%,30%)",
  lol: "hsl(200,60%,40%)",
  cyberpunk: "hsl(180,100%,50%)",
};

export default function FloatingThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const { themeId, isPro, setActiveTheme, chosenFreeTheme } = useSitewideTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Light and dark are always available
  const lightDarkOptions = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  // Build theme options
  const themeCircles = profileThemes.filter((t) => t.id !== "default");

  const canUseTheme = (id: string) => {
    if (isPro) return true;
    // Free users can use their one chosen free theme
    if (chosenFreeTheme === id) return true;
    // Free themes
    const theme = profileThemes.find((t) => t.id === id);
    if (theme && !theme.isPro) return true;
    return false;
  };

  const handleSelect = (id: string) => {
    setOpen(false);
    setActiveTheme(id);
  };

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-[60] flex flex-col items-center gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center gap-2.5 mb-2 p-3 rounded-2xl bg-card/90 backdrop-blur-xl border border-border shadow-xl"
          >
            {/* Light/Dark */}
            {lightDarkOptions.map((opt) => (
              <motion.button
                key={opt.id}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleSelect(opt.id)}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                  themeId === opt.id
                    ? "border-primary ring-2 ring-primary/40 shadow-lg"
                    : "border-border hover:border-primary/50"
                }`}
                style={{
                  background: opt.id === "light" ? "hsl(0,0%,96%)" : "hsl(222,47%,11%)",
                }}
                title={opt.label}
              >
                {opt.id === "light" ? (
                  <Sun className="h-4 w-4 text-amber-500" />
                ) : (
                  <Moon className="h-4 w-4 text-blue-300" />
                )}
              </motion.button>
            ))}

            {/* Divider */}
            <div className="w-6 h-[1px] bg-border" />

            {/* Theme circles */}
            {themeCircles.map((theme) => {
              const locked = !canUseTheme(theme.id);
              const isActive = themeId === theme.id;
              return (
                <motion.button
                  key={theme.id}
                  whileHover={{ scale: locked ? 1 : 1.15 }}
                  whileTap={{ scale: locked ? 1 : 0.9 }}
                  onClick={() => !locked && handleSelect(theme.id)}
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all relative ${
                    isActive
                      ? "border-primary ring-2 ring-primary/40 shadow-lg"
                      : locked
                      ? "border-border opacity-50 cursor-not-allowed"
                      : "border-border hover:border-primary/50"
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${THEME_COLORS[theme.id] || "#333"}, ${THEME_SECONDARY[theme.id] || "#555"})`,
                  }}
                  title={theme.label + (locked ? " (Pro)" : "")}
                >
                  {locked && (
                    <Lock className="h-3 w-3 text-white/80 drop-shadow" />
                  )}
                  {theme.isPro && !locked && (
                    <Crown className="h-3 w-3 text-yellow-400 drop-shadow absolute -top-1 -right-1" />
                  )}
                </motion.button>
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
  );
}
