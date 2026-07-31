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
import { LEAGUE_ONLY_MODE } from "@/lib/site-config";
import { isLolSectionPath, baseBackgroundForPath } from "@/lib/startup-shell";
import { StartupSurface } from "@/components/startup/StartupShells";

export default function Layout() {
  useTrackActivity();
  const { loading } = useAuth();
  const { loading: settingsLoading } = useAppSettings();
  const { theme, themeId, visualThemeId, isEnabled, isCycleFading } = useSitewideTheme();
  const { pathname } = useLocation();

  // League of Legends section uses its own LoLdle-inspired theme and overrides
  // any sitewide Mogsy theme so the visual language stays cohesive across the
  // /lol, /combat-lab and /quiz surface area.
  const isLolSection = isLolSectionPath(pathname);

  // Layout-timed so the class lands before the browser paints the new route:
  // client-side navigation into /lol must not flash a frame of the general dark
  // theme. The sitewide theme provider deliberately skips className mutations
  // while the path is in the LoL section (see useSitewideTheme), so running
  // earlier than its effect does not cost the LoL palette its precedence.
  useLayoutEffect(() => {
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

  // Full-bleed routes escape the centered max-w-7xl reading column so a game
  // table can use the whole viewport. The page supplies its own background
  // and gutters. Stat Check tabletop (dev + live routes) plus the /lol academy
  // library hub, whose painted background and book grid span the viewport.
  const isStatCheckSurface =
    pathname === "/dev/stat-check" || pathname.startsWith("/quiz/stat-check");
  const isFullBleed = isStatCheckSurface || pathname === "/lol";

  // The friends drawer is a floating overlay. On the full-bleed Stat Check
  // gameplay surface it would sit on top of the tabletop and its trigger would
  // compete with the board for clicks, so it is suppressed there. The /lol hub
  // is full-bleed but not a gameplay surface, so the drawer stays.
  const showFriendsDrawer = !isStatCheckSurface;

  // Combat Lab renders the League Hub control inline in its own compact page
  // header, so the shell's copy is suppressed there to avoid a duplicate. Its
  // sub-routes (e.g. /combat-lab/diagnostics) still get the shell control.
  const pageOwnsHubControl = pathname === "/combat-lab";
  const showShellHubControl = isLolSection && pathname !== "/lol" && !pageOwnsHubControl;

  // After first paint, warm the chunks the user is most likely to visit next.
  // In League-only mode /home, /play, /swipe and /shop are <Navigate> stubs that
  // redirect to /lol, so warming their chunks downloads code nothing can render.
  // /profile is not league-gated and stays reachable, so it stays warmed.
  useEffect(() => {
    if (loading || settingsLoading) return;
    prefetchLikelyRoutes(
      LEAGUE_ONLY_MODE
        ? ["/profile"]
        : ["/home", "/play", "/swipe", "/profile", "/shop"],
    );
  }, [loading, settingsLoading]);

  // Authority gate — unchanged policy: nothing inside the shell renders until
  // auth and app settings have resolved. Only the *visual* output changed, to
  // the destination route's base colour and nothing else.
  if (loading || settingsLoading) {
    return <StartupSurface pathname={pathname} />;
  }

  return (
    <div
      className="min-h-dvh relative animate-page-fade-in pb-bottom-nav"
      style={{ background: baseBackgroundForPath(pathname) }}
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
      <main
        className={
          isFullBleed
            ? "pt-[var(--app-header-h)] relative z-20 w-full"
            : "pt-[var(--app-header-h)] relative z-20 max-w-7xl mx-auto w-full px-0 md:px-4 lg:px-8"
        }
      >
        {showShellHubControl && (
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
        {/* The shell — navbar, background, theme — is already mounted here, so a
            resolving route chunk only needs its content area held open. A
            full-screen loader would blank a page the visitor can already see. */}
        <Suspense fallback={<div aria-hidden className="min-h-[50vh]" />}>
          <Outlet context={{ sitewideTheme: themingActive ? theme : null, sitewideThemeId: themingActive ? visualThemeId : null }} />
        </Suspense>
      </main>
      {/* Footer renders sitewide (incl. /lol) so trust/legal links and the
          Riot disclaimer stay visible; it self-hides on gameplay routes. */}
      <Footer />
      {showShellHubControl && (
        <Link
          to="/lol"
          aria-label="Back to League hub"
          className="hidden md:inline-flex fixed top-[calc(var(--app-header-h)+0.5rem)] left-4 z-[55] items-center gap-1.5 rounded-full border border-[#c9a84c]/40 bg-[#0a1428]/85 px-3 py-1.5 text-xs font-semibold text-[#c9a84c] backdrop-blur-md shadow-lg hover:bg-[#0a1428] hover:border-[#c9a84c] transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          League Hub
        </Link>
      )}
      {showFriendsDrawer && <FloatingFriendsButton />}
      {!isLolSection && <FloatingThemeSwitcher />}
      <FloatingScrollButton />
      <TutorialTipPopup />
    </div>
  );
}

/**
 * Full-page placeholder for standalone routes that mount outside the shell
 * (auth, reset-password, admin viewers). It holds the viewport open in the app's
 * base colour and nothing else — deliberately no logo and no pulsing mark, so a
 * slow chunk never turns into a branded splash screen mid-navigation.
 *
 * Routes that know where they are heading pass their pathname to
 * <StartupSurface> directly so the colour matches the destination.
 */
export function RouteLoader() {
  return <StartupSurface />;
}
