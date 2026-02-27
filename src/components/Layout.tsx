import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import ThemeOverlay from "./ThemeOverlay";
import FloatingThemeSwitcher from "./FloatingThemeSwitcher";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";

export default function Layout() {
  useTrackActivity();
  const { loading } = useAuth();
  const { theme, themeId, isEnabled } = useSitewideTheme();

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div
      className="min-h-screen bg-background relative"
      style={isEnabled && theme.styles.pageBg ? { background: theme.styles.pageBg } : undefined}
    >
      <Navbar themeId={isEnabled ? themeId : undefined} />
      {isEnabled && <ThemeOverlay themeId={themeId} />}
      <main className="pt-14 animate-page-fade-in relative z-20">
        <Outlet context={{ sitewideTheme: isEnabled ? theme : null, sitewideThemeId: isEnabled ? themeId : null }} />
      </main>
      <FloatingThemeSwitcher />
    </div>
  );
}
