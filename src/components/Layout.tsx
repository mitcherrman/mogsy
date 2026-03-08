import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import Navbar from "./Navbar";
import ThemeOverlay from "./ThemeOverlay";
import FloatingThemeSwitcher from "./FloatingThemeSwitcher";
import FloatingScrollButton from "./FloatingScrollButton";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";

export default function Layout() {
  useTrackActivity();
  const { loading } = useAuth();
  const { loading: settingsLoading } = useAppSettings();
  const { theme, themeId, visualThemeId, isEnabled, isCycleFading } = useSitewideTheme();

  if (loading || settingsLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div
      className="min-h-screen bg-background relative animate-page-fade-in"
      style={{
        ...(isEnabled && theme.styles.pageBg ? { background: theme.styles.pageBg } : {}),
        transition: "opacity 0.6s ease-in-out",
        opacity: isCycleFading ? 0 : 1,
      }}
    >
      <Navbar themeId={isEnabled ? visualThemeId : undefined} />
      {isEnabled && <ThemeOverlay themeId={visualThemeId} />}
      <main className="pt-14 pb-16 sm:pb-0 relative z-20">
        <Suspense fallback={<div className="min-h-screen" />}>
          <Outlet context={{ sitewideTheme: isEnabled ? theme : null, sitewideThemeId: isEnabled ? visualThemeId : null }} />
        </Suspense>
      </main>
      <FloatingThemeSwitcher />
      <FloatingScrollButton />
    </div>
  );
}
