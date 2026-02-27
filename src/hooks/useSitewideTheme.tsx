import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getThemeById, profileThemes, ProfileTheme } from "@/lib/profile-themes";

interface SitewideThemeContextType {
  theme: ProfileTheme;
  themeId: string;
  isEnabled: boolean;
  isPro: boolean;
  chosenFreeTheme: string | null;
  setActiveTheme: (id: string) => void;
}

const SitewideThemeContext = createContext<SitewideThemeContextType>({
  theme: getThemeById("default"),
  themeId: "default",
  isEnabled: false,
  isPro: false,
  chosenFreeTheme: null,
  setActiveTheme: () => {},
});

export function SitewideThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [themeId, setThemeId] = useState(() => localStorage.getItem("mogsy-active-theme") || "default");
  const [isEnabled, setIsEnabled] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [chosenFreeTheme, setChosenFreeTheme] = useState<string | null>(null);

  // Load admin setting
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

  // Load user profile
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

  // Apply theme CSS class on <html>
  useEffect(() => {
    const root = document.documentElement;
    // Remove all old theme classes
    root.className = root.className.replace(/theme-\S+/g, "").trim();

    if (themeId === "default") {
      // Default: use system dark mode preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      // All custom profile themes use dark base
      root.classList.add("dark");
      root.classList.add(`theme-${themeId}`);
    }
  }, [themeId]);

  const setActiveTheme = useCallback((id: string) => {
    // Validate it's an actual profile theme
    const valid = profileThemes.some((t) => t.id === id);
    if (!valid) return;
    localStorage.setItem("mogsy-active-theme", id);
    setThemeId(id);
    // Save to profile if logged in
    if (user) {
      supabase
        .from("profiles")
        .update({ custom_theme: id })
        .eq("user_id", user.id);
    }
  }, [user]);

  const theme = getThemeById(themeId);
  const hasCustomTheme = isEnabled && themeId !== "default";

  return (
    <SitewideThemeContext.Provider
      value={{
        theme: hasCustomTheme ? theme : getThemeById("default"),
        themeId,
        isEnabled: hasCustomTheme,
        isPro,
        chosenFreeTheme,
        setActiveTheme,
      }}
    >
      {children}
    </SitewideThemeContext.Provider>
  );
}

export function useSitewideTheme() {
  return useContext(SitewideThemeContext);
}
