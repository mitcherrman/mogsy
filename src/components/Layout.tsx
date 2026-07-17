import { Outlet, useLocation, Link } from "react-router-dom";
import { Suspense, useEffect, useLayoutEffect } from "react";
import { ArrowLeft } from "lucide-react";
import Navbar from "./Navbar";
import ThemeOverlay from "./ThemeOverlay";
import FloatingThemeSwitcher from "./FloatingThemeSwitcher";
import FloatingScrollButton from "./FloatingScrollButton";
import FloatingFriendsButton from "./FloatingFriendsButton";
import HextechAmbience from "./HextechAmbience";
import TutorialTipPopup from "./TutorialTipPopup";
import Footer from "./Footer";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";
import { prefetchLikelyRoutes } from "@/lib/route-prefetch";

export default function Layout() {
  useTrackActivity();
  const { loading } = useAuth();
  const { loading: settingsLoading } = useAppSettings();
  const { theme, themeId, visualThemeId, isEnabled, isCycleFading } = useSitewideTheme();
  const { pathname } = useLocation();

  // League of Legends section uses its own LoLdle-inspired theme and overrides
  // any sitewide Mogsy theme so the visual language stays cohesive across the
  // /lol, /combat-lab and /quiz surface area.
  const isLolSection =
    pathname === "/lol" ||
    pathname.startsWith("/lol/") ||
    pathname === "/combat-lab" ||
    pathname.startsWith("/combat-lab/") ||
    pathname === "/quiz" ||
    pathname.startsWith("/quiz/");

  // Use useLayoutEffect so the LoL theme class is applied AFTER the sitewide
  // theme provider's effect on every render — including theme cycles and
  // post-refresh hydration — guaranteeing the LoL palette always wins.
  useEffect(() => {
    const root = document.documentElement;
    if (isLolSection) {
      root.className = root.className.replace(/theme-\S+/g, "").trim();
      root.classList.add("dark");
      root.classList.add("theme-lol");
    } else {
      root.classList.remove("theme-lol");
      // Re-apply the sitewide theme class when leaving the LoL section, since
      // the provider effect skips className mutations while inside it.
      root.className = root.className.replace(/theme-\S+/g, "").trim();
      if (visualThemeId && visualThemeId !== "default") {
        root.classList.add("dark");
        root.classList.add(`theme-${visualThemeId}`);
      }
    }
  }, [isLolSection, visualThemeId, themeId]);

  // While the LoL section is active, disable all sitewide overlays/backgrounds
  // so nothing competes with the dedicated theme.
  const themingActive = isEnabled && !isLolSection;

  // After first paint, warm the chunks the user is most likely to visit next.
  useEffect(() => {
    if (loading || settingsLoading) return;
    prefetchLikelyRoutes(["/home", "/play", "/swipe", "/profile", "/shop"]);
  }, [loading, settingsLoading]);

  if (loading || settingsLoading) {
    return <RouteLoader />;
  }

  return (
    <div
      className="min-h-dvh relative animate-page-fade-in pb-bottom-nav"
      style={{ background: "#0a0a1a" }}
    >
      {/* Stage: paints the app background only behind the centered column,
          with both vertical edges feathered into the body color. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[88rem] bg-background mask-fade-x z-0"
        style={{
          ...(themingActive && theme.styles.pageBg ? { background: theme.styles.pageBg } : {}),
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
        style={{ opacity: themingActive && isCycleFading ? 1 : 0 }}
      />
      <Navbar themeId={themingActive ? visualThemeId : (isLolSection ? "lol" : undefined)} />
      {themingActive && <ThemeOverlay themeId={visualThemeId} />}
      {isLolSection && <HextechAmbience />}
      {/* Bottom-nav clearance lives once on the shell (.pb-bottom-nav above) so
          the footer clears the fixed bar too — never re-apply it per page. */}
      <main className="pt-[var(--app-header-h)] relative z-20 max-w-7xl mx-auto w-full px-0 md:px-4 lg:px-8">
        {isLolSection && pathname !== "/lol" && (
          /* Mobile: back control in normal flow so it reserves space and never
             overlays cards. Desktop keeps the floating pill (see below). */
          <div className="md:hidden px-4 pt-2">
            <Link
              to="/lol"
              aria-label="Back to League hub"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[#c9a84c]/40 bg-[#0a1428]/85 px-3 py-1.5 text-xs font-semibold text-[#c9a84c] hover:bg-[#0a1428] hover:border-[#c9a84c] transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              League Hub
            </Link>
          </div>
        )}
        <Suspense fallback={<RouteLoader />}>
          <Outlet context={{ sitewideTheme: themingActive ? theme : null, sitewideThemeId: themingActive ? visualThemeId : null }} />
        </Suspense>
      </main>
      {/* Footer renders sitewide (incl. /lol) so trust/legal links and the
          Riot disclaimer stay visible; it self-hides on gameplay routes. */}
      <Footer />
      {isLolSection && pathname !== "/lol" && (
        <Link
          to="/lol"
          aria-label="Back to League hub"
          className="hidden md:inline-flex fixed top-[calc(var(--app-header-h)+0.5rem)] left-4 z-[55] items-center gap-1.5 rounded-full border border-[#c9a84c]/40 bg-[#0a1428]/85 px-3 py-1.5 text-xs font-semibold text-[#c9a84c] backdrop-blur-md shadow-lg hover:bg-[#0a1428] hover:border-[#c9a84c] transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          League Hub
        </Link>
      )}
      <FloatingFriendsButton />
      {!isLolSection && <FloatingThemeSwitcher />}
      <FloatingScrollButton />
      <TutorialTipPopup />
    </div>
  );
}

/** Lightweight branded loader for in-app route transitions and auth/settings boot.
 *  Mirrors the static FCP shell in index.html so transitions feel continuous. */
export function RouteLoader() {
  return (
    <div
      className="min-h-dvh relative flex items-center justify-center"
      style={{ background: "#0a0a1a" }}
    >
      {/* Feathered stage so the loader matches the app's soft column edges */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[88rem] bg-background mask-fade-xy"
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
