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
import { RouteBootShell, NeutralBootShell } from "@/components/startup/StartupShells";

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

  // Ranked is a fixed GAME VIEWPORT from `lg` up, not a scrolling document:
  // <main> is sized to exactly --app-viewport-h and the page fills it, so the
  // round HUD, timer, HP and ability controls can never be pushed below the
  // fold. The in-flow mobile hub control is a flex sibling, so it shrinks the
  // arena rather than overflowing it.
  //
  // Below `lg` the model is deliberately NOT applied: at 390×844 the arena's
  // current component sizes (223px duelist panels, a 230px ability tray, the
  // scenario band's 200px floor) exceed the 732px budget on their own, so
  // pinning the height would collapse the question column to zero. Until those
  // are rescaled, small screens keep ordinary document scrolling — still
  // exactly one scrollbar, and never a nested one.
  const isRankedArena = pathname === "/quiz/ranked";

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
  // auth and app settings have resolved. Only the *visual* output changed, from
  // a full-screen branded loader to the destination route's own shell.
  if (loading || settingsLoading) {
    return <RouteBootShell pathname={pathname} />;
  }

  // The header offset lives on the SAME box as min-h-dvh below, not on <main>.
  // Under border-box sizing that makes the shell's content area exactly
  // --app-viewport-h, so a child sized with that token fits without overflow.
  // Rendered geometry is unchanged for every existing route: the padding was
  // already inside this box, just declared one level down.
  return (
    <div
      className="min-h-dvh relative animate-page-fade-in pt-[var(--app-header-h)] pb-bottom-nav"
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
        className={[
          "relative z-20 w-full",
          isFullBleed ? "" : "max-w-7xl mx-auto px-0 md:px-4 lg:px-8",
          // `overflow-y-auto` rather than `hidden`: a live round is sized to fit
          // exactly (so no bar appears), while the lobby — class select, bot
          // playtest, match history — is free to be taller than the viewport and
          // scrolls HERE. Either way exactly one vertical scrollbar exists, and
          // the document itself never scrolls on this route at lg+.
          isRankedArena
            ? "flex flex-col lg:h-[var(--app-viewport-h)] lg:overflow-y-auto"
            : "",
        ].filter(Boolean).join(" ")}
      >
        {showShellHubControl && (
          /* Mobile: back control in normal flow so it reserves space and never
             overlays cards. Desktop keeps the floating pill (see below). */
          <div className="md:hidden shrink-0 px-4 pt-2">
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
        {/* `contents` off the ranked route makes this wrapper invisible to
            layout, so no other route's flow changes at all. */}
        <div className={isRankedArena ? "flex flex-col lg:min-h-0 lg:flex-1" : "contents"}>
          {/* The shell — navbar, background, theme — is already mounted here, so a
              resolving route chunk only needs its content area held open. A
              full-screen loader would blank a page the visitor can already see,
              and `min-h-dvh` under the fixed header would overflow the document
              by the header height for the duration of the load. */}
          <Suspense fallback={<div aria-hidden className="min-h-[50vh]" />}>
            <Outlet context={{ sitewideTheme: themingActive ? theme : null, sitewideThemeId: themingActive ? visualThemeId : null }} />
          </Suspense>
        </div>
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
 * Startup and entry→hub paths use the destination-shaped shells in
 * components/startup/StartupShells.tsx instead.
 *
 * OUTSIDE THE SHELL ONLY. NeutralBootShell is `min-h-dvh`, which is correct
 * when it IS the page (no header is painted above it) and wrong under the fixed
 * header, where it would add the header height on top of a box that is already
 * full-height. In-shell waits use the `min-h-[50vh]` Suspense fallback above.
 */
export function RouteLoader() {
  return <NeutralBootShell />;
}
