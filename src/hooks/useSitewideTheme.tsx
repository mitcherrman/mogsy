import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getThemeById, ProfileTheme } from "@/lib/profile-themes";

interface SitewideThemeContextType {
  theme: ProfileTheme;
  themeId: string;
  isEnabled: boolean;
  isPro: boolean;
}

const SitewideThemeContext = createContext<SitewideThemeContextType>({
  theme: getThemeById("default"),
  themeId: "default",
  isEnabled: false,
  isPro: false,
});

export function SitewideThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [themeId, setThemeId] = useState("default");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    // Load admin setting for sitewide themes
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "sitewide_themes_enabled")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIsEnabled((data.value as any)?.enabled ?? false);
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
          setThemeId(data.custom_theme || "default");
          setIsPro(data.is_pro ?? false);
        }
      });
  }, [user]);

  const theme = getThemeById(themeId);
  // Only apply sitewide theme if enabled AND user is Pro (or theme is free)
  const effectiveEnabled = isEnabled && (isPro || !theme.isPro);

  return (
    <SitewideThemeContext.Provider
      value={{
        theme: effectiveEnabled ? theme : getThemeById("default"),
        themeId: effectiveEnabled ? themeId : "default",
        isEnabled: effectiveEnabled,
        isPro,
      }}
    >
      {children}
    </SitewideThemeContext.Provider>
  );
}

export function useSitewideTheme() {
  return useContext(SitewideThemeContext);
}
