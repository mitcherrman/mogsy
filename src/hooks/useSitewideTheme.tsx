import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getThemeById, profileThemes, ProfileTheme } from "@/lib/profile-themes";

const CYCLE_INTERVAL = 8000;
const FADE_DURATION = 600;

interface SitewideThemeContextType {
  theme: ProfileTheme;
  themeId: string;
  visualThemeId: string;
  isEnabled: boolean;
  isPro: boolean;
  chosenFreeTheme: string | null;
  setActiveTheme: (id: string) => void;
  isCycleFading: boolean;
}

const SitewideThemeContext = createContext<SitewideThemeContextType>({
  theme: getThemeById("default"),
  themeId: "default",
  visualThemeId: "default",
  isEnabled: false,
  isPro: false,
  chosenFreeTheme: null,
  setActiveTheme: () => {},
  isCycleFading: false,
});

const cyclableThemes = profileThemes.filter((t) => t.id !== "cycle" && t.id !== "default");

export function SitewideThemeProvider({ children }: { children: ReactNode }) {
  let authUser: ReturnType<typeof useAuth>["user"] = null;
  try { authUser = useAuth().user; } catch {}
  const user = authUser;
  const [themeId, setThemeId] = useState(() => localStorage.getItem("mogsy-active-theme") || "default");
  const [isEnabled, setIsEnabled] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [chosenFreeTheme, setChosenFreeTheme] = useState<string | null>(null);

  const [cycleIndex, setCycleIndex] = useState(0);
  const [isCycleFading, setIsCycleFading] = useState(false);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "sitewide_themes_enabled")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIsEnabled((data.value as any)?.enabled ?? true);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("custom_theme, is_pro")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setIsPro(data.is_pro ?? false);
          const stored = localStorage.getItem("mogsy-chosen-free-theme");
          if (stored) setChosenFreeTheme(stored);
        }
      });
  }, [user]);

  const isCycling = themeId === "cycle";
  const visualThemeId = isCycling
    ? (cyclableThemes[cycleIndex % cyclableThemes.length]?.id ?? "default")
    : themeId;

  useEffect(() => {
    if (!isCycling) {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
      setIsCycleFading(false);
      return;
    }

    cycleTimerRef.current = setInterval(() => {
      setIsCycleFading(true);
      setTimeout(() => {
        setCycleIndex((i) => (i + 1) % cyclableThemes.length);
        setTimeout(() => setIsCycleFading(false), 50);
      }, FADE_DURATION);
    }, CYCLE_INTERVAL);

    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    };
  }, [isCycling]);

  useEffect(() => {
    const root = document.documentElement;
    root.className = root.className.replace(/theme-\S+/g, "").trim();

    if (visualThemeId === "default") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.add("dark");
      root.classList.add(`theme-${visualThemeId}`);
    }
  }, [visualThemeId]);

  const setActiveTheme = useCallback((id: string) => {
    const valid = profileThemes.some((t) => t.id === id);
    if (!valid) return;
    localStorage.setItem("mogsy-active-theme", id);
    setThemeId(id);
    if (id === "cycle") setCycleIndex(0);
    if (user) {
      supabase
        .from("profiles")
        .update({ custom_theme: id })
        .eq("user_id", user.id);
    }
  }, [user]);

  const theme = getThemeById(visualThemeId);
  const hasCustomTheme = isEnabled && visualThemeId !== "default";

  return (
    <SitewideThemeContext.Provider
      value={{
        theme: hasCustomTheme ? theme : getThemeById("default"),
        themeId,
        visualThemeId,
        isEnabled: hasCustomTheme,
        isPro,
        chosenFreeTheme,
        setActiveTheme,
        isCycleFading,
      }}
    >
      {children}
    </SitewideThemeContext.Provider>
  );
}

export function useSitewideTheme() {
  return useContext(SitewideThemeContext);
}
