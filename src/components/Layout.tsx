import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import Navbar from "./Navbar";
import ThemeOverlay from "./ThemeOverlay";
import FloatingThemeSwitcher from "./FloatingThemeSwitcher";
import FloatingScrollButton from "./FloatingScrollButton";
import FloatingFriendsButton from "./FloatingFriendsButton";
import TutorialTipPopup from "./TutorialTipPopup";
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
    return <RouteLoader />;
  }

  return (
    <div
      className="min-h-screen relative animate-page-fade-in"
      style={{ background: "#0a0a1a" }}
    >
      {/* Stage: paints the app background only behind the centered column,
          with both vertical edges feathered into the body color. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[88rem] bg-background mask-fade-x z-0"
        style={{
          ...(isEnabled && theme.styles.pageBg ? { background: theme.styles.pageBg } : {}),
        }}
      />
      {/* Ambient halo so the column feels lit rather than cut */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[96rem] z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% 50%, hsl(var(--background) / 0.35), transparent 70%)",
        }}
      />
      {/* Fade-to-black overlay for cycle theme transitions */}
      <div
        className="fixed inset-0 bg-black pointer-events-none z-[15] transition-opacity duration-700 ease-in-out"
        style={{ opacity: isCycleFading ? 1 : 0 }}
      />
      <Navbar themeId={isEnabled ? visualThemeId : undefined} />
      {isEnabled && <ThemeOverlay themeId={visualThemeId} />}
      <main className="pt-14 pb-16 sm:pb-0 relative z-20 max-w-7xl mx-auto w-full px-0 md:px-4 lg:px-8">
        <Suspense fallback={<RouteLoader />}>
          <Outlet context={{ sitewideTheme: isEnabled ? theme : null, sitewideThemeId: isEnabled ? visualThemeId : null }} />
        </Suspense>
      </main>
      <FloatingFriendsButton />
      <FloatingThemeSwitcher />
      <FloatingScrollButton />
      <TutorialTipPopup />
    </div>
  );
}

/** Lightweight branded loader for in-app route transitions and auth/settings boot.
 *  Mirrors the static FCP shell in index.html so transitions feel continuous. */
function RouteLoader() {
  return (
    <div
      className="min-h-screen relative flex items-center justify-center"
      style={{ background: "#0a0a1a" }}
    >
      {/* Feathered stage so the loader matches the app's soft column edges */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[88rem] bg-background mask-fade-x"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[96rem]"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% 50%, hsl(var(--background) / 0.35), transparent 70%)",
        }}
      />
      <img
        src="/mogsy-logo-text.png"
        alt=""
        aria-hidden="true"
        width={264}
        height={176}
        className="relative z-10 h-20 sm:h-24 object-contain opacity-70 animate-pulse"
        decoding="async"
      />
    </div>
  );
}
