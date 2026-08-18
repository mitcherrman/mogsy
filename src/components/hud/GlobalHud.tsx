import { Link, useLocation } from "react-router-dom";
import { Palette, Settings as SettingsIcon, Shield, User, UserPlus, Users } from "lucide-react";

import AcademyRadioControls from "@/components/audio/AcademyRadioControls";
import UserNotificationBell from "@/components/UserNotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAuth } from "@/lib/admin-auth/AdminAuthProvider";
import { ADMIN_DIRECTORY_PATH } from "@/lib/admin/admin-directory";
import { useAppSettings } from "@/hooks/useAppSettings";
import { LEAGUE_ONLY_MODE, LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { isLolSectionPath } from "@/lib/startup-shell";
import { prefetchRoute } from "@/lib/route-prefetch";
import { playUiSfx } from "@/lib/ui-sfx";

/**
 * Global HUD — the app's chrome after the traditional navbar (top bar + mobile
 * bottom bar, previously src/components/Navbar.tsx) was retired in favour of
 * game-style corner controls:
 *
 *   [ Mogzy → home ]                    [ music ] [ bell ] [ account menu ]
 *
 * The HUD reserves NO layout space of its own: it floats inside the band the
 * shell already keeps clear via `--app-header-h` (Layout's `pt-[var(...)]`),
 * so every page's geometry, sticky offset and `--app-viewport-h` consumer is
 * untouched. The wrapper ignores the pointer; only the controls take it back,
 * so the band's empty middle never steals a click from page content.
 *
 * Route reachability contract (what replaced each navbar control):
 *  - Mogsy wordmark + Home tab  → the Mogzy home control (top-left);
 *  - Profile tab                → account menu → Profile;
 *  - /settings (was Profile-page-only) → account menu → Settings;
 *  - Admin link                 → account menu → Admin, same backend-verified
 *    `useAdminAuth` gate: the item exists in the DOM only after authorization
 *    resolves positively — no placeholder, no reserved slot;
 *  - Academy Radio              → the `hud` variant (one trigger, full panel);
 *  - notification bell          → unchanged, in the cluster;
 *  - Quiz tab                   → in-product: the hub's Leaguecraft book;
 *  - non-League navbar surfaces (Play/Swipe tabs, shop pill, Friends and
 *    Theme buttons on the mobile bottom bar) → account menu entries, gated
 *    exactly as before (`nav_tab_mode`, LEAGUE_ONLY_MODE, LoL section).
 */

/** Shared chip look: dark Academy glass with a brass edge, readable over any
 *  page painting without laying a full-width bar back down. */
const hudChip =
  "pointer-events-auto rounded-full border border-[#c9a84c]/25 bg-[#0a1020]/70 shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-md";

const menuItemClass = "gap-2 text-sm cursor-pointer";

function menuLinkProps(path: string) {
  return {
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
    onTouchStart: () => prefetchRoute(path),
    onClick: () => playUiSfx("navClick"),
  };
}

function AccountMenu({
  isAnonymous,
  signupHref,
}: {
  isAnonymous: boolean;
  signupHref: string;
}) {
  const { pathname } = useLocation();
  const { settings } = useAppSettings();
  // Backend-verified admin authorization only; never inferred from the user
  // object, roles, or storage. The item is navigation convenience — the
  // /admin/directory route keeps its own independent guards.
  const { isAuthorized: isAdminAuthorized } = useAdminAuth();

  // The theme picker (FloatingThemeSwitcher) is only mounted outside the LoL
  // section; inside it the item would dispatch an event nobody hears.
  const canOpenThemePicker = !isLolSectionPath(pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Profile and settings"
        title="Profile and settings"
        data-testid="hud-account-trigger"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      >
        <User className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="z-[60] w-52">
        {/* Guest conversion — the fuller companion to the HUD chip. Same
            anonymous-upgrade flow and returnTo; gone once signed in. */}
        {isAnonymous && (
          <>
            <DropdownMenuItem asChild className={menuItemClass}>
              <Link
                to={signupHref}
                data-testid="hud-signup-menu-item"
                onMouseEnter={() => prefetchRoute("/auth")}
                onFocus={() => prefetchRoute("/auth")}
                onClick={() => {
                  playUiSfx("navClick");
                  trackFunnelEvent("hud_signup_menu_clicked", {
                    returnTo: pathname,
                  });
                }}
              >
                <UserPlus className="h-4 w-4 shrink-0 text-[#c9a84c]" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="font-semibold">Sign up free</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    Save your XP, streaks, and progress.
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Account
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link to="/profile" {...menuLinkProps("/profile")}>
            <User className="h-4 w-4" aria-hidden="true" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link to="/settings" {...menuLinkProps("/settings")}>
            <SettingsIcon className="h-4 w-4" aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>

        {/* Legacy full-Mogzy surfaces: only outside League-only mode, exactly
            the set the old navbar exposed (Play/Swipe follow nav_tab_mode). */}
        {!LEAGUE_ONLY_MODE && (
          <>
            <DropdownMenuSeparator />
            {settings.nav_tab_mode === "play" ? (
              <DropdownMenuItem asChild className={menuItemClass}>
                <Link to="/play" {...menuLinkProps("/play")}>
                  Play
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild className={menuItemClass}>
                <Link to="/swipe" {...menuLinkProps("/swipe")}>
                  Swipe
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className={menuItemClass}>
              <Link to="/lol" {...menuLinkProps("/lol")}>
                League Hub
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={menuItemClass}>
              <Link to="/shop" {...menuLinkProps("/shop")}>
                Shop
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemClass}
              onClick={() => window.dispatchEvent(new CustomEvent("open-friends-panel"))}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              Friends
            </DropdownMenuItem>
          </>
        )}

        {canOpenThemePicker && (
          <DropdownMenuItem
            className={menuItemClass}
            onClick={() => window.dispatchEvent(new CustomEvent("open-theme-picker"))}
          >
            <Palette className="h-4 w-4" aria-hidden="true" />
            Theme
          </DropdownMenuItem>
        )}

        {isAdminAuthorized === true && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className={menuItemClass}>
              <Link
                to={ADMIN_DIRECTORY_PATH}
                data-testid="hud-admin-link"
                {...menuLinkProps(ADMIN_DIRECTORY_PATH)}
              >
                <Shield className="h-4 w-4" aria-hidden="true" />
                Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function GlobalHud() {
  const homeRoute = LEAGUE_ONLY_MODE ? LEAGUE_HOME_ROUTE : "/";
  const { pathname } = useLocation();
  const { user } = useAuth();

  // Same guest test the retired /lol banner used. A missing session counts:
  // most surfaces sign visitors in anonymously on arrival, and anyone they
  // miss is equally a guest whose progress is device-local.
  const isAnonymous = !user || user.is_anonymous === true;
  // The anonymous-upgrade flow, returning to wherever signup started — the
  // Auth page validates this with safeReturnPath, so encoding the current
  // path is the whole sender-side contract.
  const signupHref = `/auth?mode=signup&returnTo=${encodeURIComponent(pathname)}`;

  return (
    <nav
      aria-label="Mogzy controls"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      {/* The right padding folds in react-remove-scroll's published
          `--removed-body-scroll-bar-size` (set on body while any Radix modal
          surface — the account menu, dialogs — locks scrolling, inherited
          here). The HUD is fixed to the viewport, so when the scrollbar
          yields during a lock the viewport widens by its width; without this
          the right cluster would hop sideways by exactly that amount while
          the page content (compensated by the same mechanism on body) holds
          still. This is the hook that library exposes for fixed chrome — not
          an ad-hoc pixel guess; it is 0px whenever no lock is active. */}
      <div className="flex h-[var(--app-header-h)] items-center justify-between pl-2 pr-[calc(0.5rem+var(--removed-body-scroll-bar-size,0px))] sm:pl-3 sm:pr-[calc(0.75rem+var(--removed-body-scroll-bar-size,0px))]">
        {/* Home — the persistent product identity. The mascot IS the button:
            small, no wordmark, no bar. */}
        <Link
          to={homeRoute}
          aria-label="Mogzy — home"
          title="Home"
          onMouseEnter={() => prefetchRoute(homeRoute)}
          onFocus={() => prefetchRoute(homeRoute)}
          onTouchStart={() => prefetchRoute(homeRoute)}
          onClick={() => playUiSfx("navClick")}
          data-testid="hud-home"
          className={`${hudChip} flex h-9 w-9 items-center justify-center overflow-hidden transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/70`}
        >
          {/* Head crop of the full-body mascot: the PNG is 2:3 portrait with
              the head in the top third, so a 200%-tall cover crop anchored to
              the top shows the face inside the round chip. */}
          <img
            src="/mascot/mogzy-mascot-base-v1.png"
            alt=""
            draggable={false}
            className="h-[200%] w-full self-start object-cover object-top"
          />
        </Link>

        <div className={`${hudChip} flex items-center gap-0.5 px-1 py-0.5`}>
          {/* Guest conversion chip — the one visible (but quiet) signup
              affordance, replacing the retired full-width /lol banner. It
              lives inside the cluster chip so the HUD stays two clusters,
              not a bar; the longer value phrase collapses away below lg so
              narrow widths keep a plain "Sign up". Hidden entirely once the
              visitor has a real account. */}
          {isAnonymous && (
            <Link
              to={signupHref}
              data-testid="hud-signup-chip"
              aria-label="Sign up free — save your progress"
              title="Sign up free — save your progress"
              onMouseEnter={() => prefetchRoute("/auth")}
              onFocus={() => prefetchRoute("/auth")}
              onClick={() => {
                playUiSfx("primaryAction");
                trackFunnelEvent("hud_signup_chip_clicked", { returnTo: pathname });
              }}
              className="mr-0.5 flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#c9a84c]/20 px-2.5 text-xs font-semibold text-[#f0d78c] transition-colors hover:bg-[#c9a84c]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              <span className="hidden font-normal text-[#cfc4a5] lg:inline">
                Save progress ·
              </span>
              Sign up
            </Link>
          )}
          {/* Fixed order: music → profile → notifications, bell on the far
              right. DOM order IS the tab order — keep them matched. */}
          <AcademyRadioControls variant="hud" />
          <AccountMenu isAnonymous={isAnonymous} signupHref={signupHref} />
          <UserNotificationBell />
        </div>
      </div>
    </nav>
  );
}
