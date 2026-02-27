import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Sun, Moon, Lock, Crown } from "lucide-react";
import { profileThemes } from "@/lib/profile-themes";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";

/** Extract a CSS gradient from pageBg or fall back to a solid from heroBg */
function getCircleGradient(theme: typeof profileThemes[number]): string {
  const s = theme.styles;
  if (s.pageBg) return s.pageBg;
  // fallback: parse hsl from heroBg class
  return "hsl(210,80%,60%)";
}

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

  // All profile themes except "default" (default is represented by light/dark)
  const themeCircles = profileThemes.filter((t) => t.id !== "default");

  const canUseTheme = (id: string) => {
    if (isPro) return true;
    if (chosenFreeTheme === id) return true;
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
            className="flex flex-col items-center gap-2.5 mb-2 p-3 rounded-2xl bg-card/90 backdrop-blur-xl border border-border shadow-xl max-h-[70vh] overflow-y-auto"
          >
            {/* Light / Dark */}
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleSelect("light")}
              className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                themeId === "light"
                  ? "border-primary ring-2 ring-primary/40 shadow-lg"
                  : "border-border hover:border-primary/50"
              }`}
              style={{ background: "hsl(209,40%,96%)" }}
              title="Light"
            >
              <Sun className="h-4 w-4" style={{ color: "hsl(35,90%,50%)" }} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleSelect("dark")}
              className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                themeId === "dark"
                  ? "border-primary ring-2 ring-primary/40 shadow-lg"
                  : "border-border hover:border-primary/50"
              }`}
              style={{ background: "hsl(222,47%,11%)" }}
              title="Dark"
            >
              <Moon className="h-4 w-4" style={{ color: "hsl(210,80%,75%)" }} />
            </motion.button>

            {/* Divider */}
            <div className="w-6 h-[1px] bg-border" />

            {/* Profile theme circles */}
            {themeCircles.map((theme) => {
              const locked = !canUseTheme(theme.id);
              const isActive = themeId === theme.id;
              const bg = getCircleGradient(theme);

              return (
                <motion.button
                  key={theme.id}
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
                  title={theme.label + (locked ? " (Pro)" : "")}
                >
                  {locked && (
                    <Lock className="h-3 w-3 drop-shadow" style={{ color: "rgba(255,255,255,0.8)" }} />
                  )}
                  {theme.isPro && !locked && (
                    <Crown className="h-3 w-3 drop-shadow absolute -top-1 -right-1" style={{ color: "hsl(45,100%,55%)" }} />
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
