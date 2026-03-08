import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import Navbar from "./Navbar";
import ThemeOverlay from "./ThemeOverlay";
import FloatingThemeSwitcher from "./FloatingThemeSwitcher";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";

export default function Layout() {
  useTrackActivity();
  const { loading } = useAuth();
  const { loading: settingsLoading } = useAppSettings();
  const { theme, themeId, isEnabled } = useSitewideTheme();

  if (loading || settingsLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div
      className="min-h-screen bg-background relative animate-page-fade-in"
      style={isEnabled && theme.styles.pageBg ? { background: theme.styles.pageBg } : undefined}
    >
      <Navbar themeId={isEnabled ? themeId : undefined} />
      {isEnabled && <ThemeOverlay themeId={themeId} />}
      <main className="pt-14 pb-16 sm:pb-0 relative z-20">
        <Suspense fallback={<div className="min-h-screen" />}>
          <Outlet context={{ sitewideTheme: isEnabled ? theme : null, sitewideThemeId: isEnabled ? themeId : null }} />
        </Suspense>
      </main>
      <FloatingThemeSwitcher />
    </div>
  );
}
