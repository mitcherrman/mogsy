import { Link, useLocation } from "react-router-dom";

import AcademyRadioControls from "@/components/audio/AcademyRadioControls";
import MogzyIdentityMenu from "@/components/hud/MogzyIdentityMenu";
import { useAuth } from "@/hooks/useAuth";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { isGuestUser, signupHrefFor } from "@/lib/hud/identity";
import { hudChipSurface, hudHitTarget, hudPopVisual } from "@/lib/hud/chrome";
import { LEAGUE_ONLY_MODE, LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { prefetchRoute } from "@/lib/route-prefetch";
import { playUiSfx } from "@/lib/ui-sfx";

/**
 * Global HUD — the app's chrome after the traditional navbar (top bar + mobile
 * bottom bar, previously src/components/Navbar.tsx) was retired in favour of
 * game-style corner controls:
 *
 *   [ Mogzy's hat → home ]              [ music ] [ (Mogzy⁷) │ ▾ ]
 *
 * The identity model is deliberately two symbols, not two menus:
 *  - the HAT is the product. It means Home / Academy, nothing else;
 *  - MOGZY is you. The portrait links to your profile and carries your unread
 *    badge; the chevron beside it opens notifications, whose panel ends in the
 *    account utilities (Settings, Admin, Theme).
 *
 * Both halves of the top-right compound live in MogzyIdentityMenu, because the
 * badge on the portrait and the list behind the chevron are the same unread
 * state — splitting them across components would mean two subscriptions and
 * two counts free to disagree.
 *
 * The HUD reserves NO layout space of its own: it floats inside the band the
 * shell already keeps clear via `--app-header-h` (Layout's `pt-[var(...)]`),
 * so every page's geometry, sticky offset and `--app-viewport-h` consumer is
 * untouched. The wrapper ignores the pointer; only the controls take it back,
 * so the band's empty middle never steals a click from page content.
 *
 * Route reachability contract (what replaced each navbar control):
 *  - Mogsy wordmark + Home tab  → the hat home control (top-left);
 *  - Profile tab                → the Mogzy portrait (top-right), one click;
 *  - /settings (was Profile-page-only, then the account menu) → the footer of
 *    the notifications panel. That page is also where sign-out lives — the
 *    account menu never owned a sign-out of its own;
 *  - Admin link                 → the same notifications-panel footer, same
 *    backend-verified `useAdminAuth` gate: the item exists in the DOM only
 *    after authorization resolves positively — no placeholder, no reserved
 *    slot. The footer renders on the guest branch too, because the explicit
 *    admin-key fallback authorizes without a real account;
 *  - Academy Radio              → the `hud` variant (one trigger, full panel);
 *  - notification bell          → the chevron of the identity compound;
 *  - Quiz tab                   → in-product: the hub's Leaguecraft book;
 *  - non-League navbar surfaces (Play/Swipe tabs, shop pill, Friends and
 *    Theme) → the same footer, gated exactly as before (`nav_tab_mode`,
 *    LEAGUE_ONLY_MODE, LoL section).
 */

/** The cluster's own glass, on the box that takes the pointer back from the
 *  pointer-events-none nav wrapper. The bare surface (no pointer behaviour)
 *  lives in @/lib/hud/chrome, because the home control now paints it on a
 *  child that scales while the interactive box holds still. */
const hudChip = `pointer-events-auto ${hudChipSurface}`;

export default function GlobalHud() {
  const homeRoute = LEAGUE_ONLY_MODE ? LEAGUE_HOME_ROUTE : "/";
  const { pathname } = useLocation();
  const { user } = useAuth();

  // Same guest test the retired /lol banner used, now shared with the identity
  // menu so the chip and the menu can never disagree about who is a guest.
  const isAnonymous = isGuestUser(user);
  const signupHref = signupHrefFor(pathname);

  return (
    <nav
      aria-label="Mogzy controls"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      {/* The right padding folds in react-remove-scroll's published
          `--removed-body-scroll-bar-size` (set on body while any Radix modal
          surface — dialogs — locks scrolling, inherited here). The HUD is
          fixed to the viewport, so when the scrollbar yields during a lock the
          viewport widens by its width; without this the right cluster would
          hop sideways by exactly that amount while the page content
          (compensated by the same mechanism on body) holds still. This is the
          hook that library exposes for fixed chrome — not an ad-hoc pixel
          guess; it is 0px whenever no lock is active. The identity menu's own
          panel is a plain absolutely-positioned div that locks nothing, so it
          opens with the token still at 0px and shifts nothing at all. */}
      <div className="flex h-[var(--app-header-h)] items-center justify-between pl-2 pr-[calc(0.5rem+var(--removed-body-scroll-bar-size,0px))] sm:pl-3 sm:pr-[calc(0.75rem+var(--removed-body-scroll-bar-size,0px))]">
        {/* Home — the persistent product identity. Mogzy's hat IS the button:
            small, no wordmark, no bar. The hat and not the mascot, so the
            top-left reads as "the Academy" and the top-right portrait is
            unambiguously "you". */}
        <Link
          to={homeRoute}
          aria-label="Home — Mogzy Academy"
          title="Home"
          onMouseEnter={() => prefetchRoute(homeRoute)}
          onFocus={() => prefetchRoute(homeRoute)}
          onTouchStart={() => prefetchRoute(homeRoute)}
          onClick={() => playUiSfx("navClick")}
          data-testid="hud-home"
          className={`pointer-events-auto ${hudHitTarget} z-10`}
        >
          {/* The whole chip — glass, brass edge and hat together — is what
              pops, so the hover reads as the control lifting toward you rather
              than a picture swelling inside a fixed ring. It is a child of the
              44px target above, which is the box the layout sees; this span
              reserves nothing and can therefore paint well outside it. The
              parent keeps `overflow` visible for exactly that reason; the crop
              circle is this span's own `overflow-hidden`. */}
          <span
            aria-hidden="true"
            className={`${hudChipSurface} ${hudPopVisual} flex h-9 w-9 items-center justify-center overflow-hidden`}
          >
            {/* The source PNG is square (1254²) with the hat inset in it: ~12%
                dead space above the point, ~22% below the brim, and the
                silhouette's own centre sitting at 45% of the height. Rendered
                1:1 in a circular chip the hat therefore reads small and hangs
                high. `scale-110` plus a 5% downward nudge re-frames it so the
                content — not the canvas — is centred in the circle and fills
                it, at the cost of only the outermost pixels of the brim tips.
                Both are pure transforms over a square-in-square `object-cover`:
                the aspect ratio is never touched, and the asset itself is
                untouched. Cover rather than contain because the PNG's
                background is opaque black — contain would float a black square
                on the navy glass. */}
            <img
              src="/mascot/mogzy-hat.png"
              alt=""
              draggable={false}
              className="h-full w-full translate-y-[5%] scale-110 object-cover object-center"
            />
          </span>
        </Link>

        <div className={`${hudChip} flex items-center gap-1 px-1 py-0.5`}>
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
              className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#c9a84c]/20 px-2.5 text-xs font-semibold text-[#f0d78c] transition-colors hover:bg-[#c9a84c]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              <span className="hidden font-normal text-[#cfc4a5] lg:inline">
                Save progress ·
              </span>
              Sign up
            </Link>
          )}
          {/* Fixed order: music → Mogzy (profile) → notifications chevron.
              DOM order IS the tab order — keep them matched. */}
          <AcademyRadioControls variant="hud" />
          <MogzyIdentityMenu />
        </div>
      </div>
    </nav>
  );
}
