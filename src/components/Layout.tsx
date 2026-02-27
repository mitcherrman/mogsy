import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import ThemeOverlay from "./ThemeOverlay";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";
import { cn } from "@/lib/utils";

export default function Layout() {
  useTrackActivity();
  const { loading } = useAuth();
  const { theme, themeId, isEnabled } = useSitewideTheme();

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  const hasCustomTheme = isEnabled && themeId !== "default";
  const themeClass = hasCustomTheme ? `theme-${themeId}` : "";

  return (
    <div
      className={cn("min-h-screen bg-background relative", themeClass)}
      style={hasCustomTheme && theme.styles.pageBg ? { background: theme.styles.pageBg } : undefined}
    >
      <Navbar themeId={hasCustomTheme ? themeId : undefined} />
      {hasCustomTheme && <ThemeOverlay themeId={themeId} />}
      <main className="pt-14 animate-page-fade-in relative z-20">
        <Outlet context={{ sitewideTheme: hasCustomTheme ? theme : null, sitewideThemeId: hasCustomTheme ? themeId : null }} />
      </main>
    </div>
  );
}
