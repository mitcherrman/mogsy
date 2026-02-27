import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getThemeById, ProfileTheme } from "@/lib/profile-themes";

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

function getStoredBaseTheme(): "light" | "dark" {
  const stored = localStorage.getItem("mogsy-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyBaseTheme(mode: "light" | "dark") {
  document.documentElement.classList.toggle("dark", mode === "dark");
  localStorage.setItem("mogsy-theme", mode);
}

export function SitewideThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [themeId, setThemeId] = useState(() => localStorage.getItem("mogsy-active-theme") || "dark");
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
          // Load chosen free theme from custom_theme field or localStorage
          const stored = localStorage.getItem("mogsy-chosen-free-theme");
          if (stored) setChosenFreeTheme(stored);
        }
      });
  }, [user]);

  // Apply theme on mount and change
  useEffect(() => {
    if (themeId === "light" || themeId === "dark") {
      applyBaseTheme(themeId);
      // Remove any theme class
      document.documentElement.className = document.documentElement.className
        .replace(/theme-\S+/g, "")
        .trim();
      if (themeId === "dark") document.documentElement.classList.add("dark");
    } else {
      // Custom theme - always dark base
      applyBaseTheme("dark");
      // Remove old theme classes, add new one
      document.documentElement.className = document.documentElement.className
        .replace(/theme-\S+/g, "")
        .trim();
      document.documentElement.classList.add(`theme-${themeId}`);
    }
  }, [themeId]);

  const setActiveTheme = useCallback((id: string) => {
    localStorage.setItem("mogsy-active-theme", id);
    setThemeId(id);
    // Save to profile if logged in and it's a custom theme
    if (user && id !== "light" && id !== "dark") {
      supabase
        .from("profiles")
        .update({ custom_theme: id })
        .eq("user_id", user.id);
    }
  }, [user]);

  const theme = getThemeById(themeId === "light" || themeId === "dark" ? "default" : themeId);
  const effectiveEnabled = isEnabled && themeId !== "light" && themeId !== "dark" && themeId !== "default";

  return (
    <SitewideThemeContext.Provider
      value={{
        theme: effectiveEnabled ? theme : getThemeById("default"),
        themeId,
        isEnabled: effectiveEnabled,
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
