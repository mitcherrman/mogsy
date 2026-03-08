import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Lock, Crown, Check, ChevronUp, ChevronDown } from "lucide-react";
import { profileThemes } from "@/lib/profile-themes";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";
import { supabase } from "@/integrations/supabase/client";

interface ThemeConfig {
  free_themes: string[];
  pro_themes: string[];
  disabled_themes: string[];
}

function getCircleGradient(theme: typeof profileThemes[number]): string {
  if (theme.id === "cycle") return "conic-gradient(hsl(0,80%,60%), hsl(60,80%,55%), hsl(120,60%,50%), hsl(180,70%,50%), hsl(240,70%,60%), hsl(300,70%,55%), hsl(0,80%,60%))";
  if (theme.id === "default") return "linear-gradient(135deg, hsl(210,80%,60%), hsl(270,60%,65%))";
  if (theme.styles.pageBg) return theme.styles.pageBg;
  return "hsl(210,80%,60%)";
}

export default function FloatingThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const { themeId, isPro, setActiveTheme, chosenFreeTheme } = useSitewideTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const [themeConfig, setThemeConfig] = useState<ThemeConfig | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

  // Load theme config
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

  // Click outside
  useEffect(() => {
    if (!open) return;
    setPage(0);
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Cleanup hover timer
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleMouseEnter = useCallback((id: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredId(id), 400);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredId(null);
  }, []);

  const visibleThemes = (() => {
    const filtered = profileThemes.filter((t) => {
      if (t.id === "default") return true;
      if (t.id === "cycle") return !themeConfig?.disabled_themes?.includes(t.id);
      return !themeConfig?.disabled_themes?.includes(t.id);
    });
    // Move cycle to end
    const cycleIdx = filtered.findIndex((t) => t.id === "cycle");
    if (cycleIdx > -1) {
      const [cycleTheme] = filtered.splice(cycleIdx, 1);
      filtered.push(cycleTheme);
    }
    return filtered;
  })();

  const totalPages = Math.ceil(visibleThemes.length / PAGE_SIZE);
  const currentThemes = visibleThemes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const isThemePro = (id: string) => {
    if (id === "default") return false;
    if (themeConfig) return themeConfig.pro_themes?.includes(id) ?? false;
    return profileThemes.find((t) => t.id === id)?.isPro ?? false;
  };

  const canUseTheme = (id: string) => {
    if (id === "default") return true;
    if (isPro) return true;
    if (chosenFreeTheme === id) return true;
    if (themeConfig) return themeConfig.free_themes?.includes(id) ?? false;
    return !(profileThemes.find((t) => t.id === id)?.isPro ?? false);
  };

  const handleSelect = (id: string) => {
    if (!canUseTheme(id)) return;
    setOpen(false);
    setActiveTheme(id);
  };

  return (
    <div ref={menuRef} className="fixed bottom-[4.5rem] sm:bottom-6 right-3 sm:right-6 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.85 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex flex-col items-center gap-2 mb-2 p-3 rounded-2xl bg-card/90 backdrop-blur-xl border border-border shadow-xl"
          >
            {page > 0 && (
              <button
                onClick={() => setPage((p) => p - 1)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            )}
            {currentThemes.map((theme) => {
              const locked = !canUseTheme(theme.id);
              const isActive = themeId === theme.id;
              const pro = isThemePro(theme.id);
              const bg = getCircleGradient(theme);
              const showLabel = hoveredId === theme.id;

              return (
                <div key={theme.id} className="relative shrink-0">
                  <AnimatePresence>
                    {showLabel && (
                      <motion.div
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2.5 py-1 rounded-lg bg-popover border border-border shadow-lg whitespace-nowrap pointer-events-none"
                      >
                        <span className="text-xs font-medium text-popover-foreground">
                          {theme.label}
                          {pro && <span className="ml-1 text-[hsl(45,100%,55%)]">PRO</span>}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    whileHover={{ scale: locked ? 1 : 1.12 }}
                    whileTap={{ scale: locked ? 1 : 0.92 }}
                    onClick={() => handleSelect(theme.id)}
                    onMouseEnter={() => handleMouseEnter(theme.id)}
                    onMouseLeave={handleMouseLeave}
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center transition-all relative ${
                      isActive
                        ? "border-primary ring-2 ring-primary/40 shadow-lg"
                        : locked
                        ? "border-border opacity-50 cursor-not-allowed"
                        : "border-border hover:border-primary/50"
                    }`}
                    style={{
                      background: bg,
                      ...(theme.id === "cycle" && isActive ? { animation: "spin 4s linear infinite" } : {}),
                    }}
                  >
                    {isActive && (
                      <Check className="h-4 w-4 drop-shadow-md" style={{ color: "white" }} />
                    )}
                    {locked && !isActive && (
                      <Lock className="h-3 w-3 drop-shadow" style={{ color: "rgba(255,255,255,0.8)" }} />
                    )}
                    {pro && !locked && !isActive && (
                      <Crown
                        className="h-3 w-3 drop-shadow absolute -top-1 -right-1"
                        style={{ color: "hsl(45,100%,55%)" }}
                      />
                    )}
                  </motion.button>
                </div>
              );
            })}
            {page < totalPages - 1 && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center border-2 border-primary/50 hover:shadow-2xl transition-shadow"
      >
        <Palette className="h-4 w-4 sm:h-5 sm:w-5" />
      </motion.button>
    </div>
  );
}
