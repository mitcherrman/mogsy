import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Swords, Flame, Newspaper, ArrowRight, BrainCircuit, FileText, Zap, Heart, Brain, Coins, History as HistoryIcon, Layers } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import BlogPostCard from "@/components/blog/BlogPostCard";
import AdSlot from "@/components/ads/AdSlot";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import BookModeCard from "@/components/lol/BookModeCard";
import HexPanelLink from "@/components/lol/HexPanelLink";
import { useChampionAssets, getChampionSplash } from "@/hooks/useChampionAssets";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  markHubVisited,
  markTutorialPopupDismissed,
  hasDismissedTutorialPopup,
} from "@/lib/quiz/onboarding-gate";
import LolWelcomeIntro from "@/components/lol/LolWelcomeIntro";
import { hasHandledAcademyWelcome } from "@/lib/welcome/academy-welcome";
import MogzyHubGuide from "@/components/lol/MogzyHubGuide";
import {
  HUB_GUIDE_MODES,
  hubGuideDescriptionId,
  useHubGuideState,
  type HubGuideModeId,
} from "@/components/lol/hub-guide";
import { useRankedTutorialStatus } from "@/hooks/useRankedTutorialStatus";
import { useAppSettings } from "@/hooks/useAppSettings";
import { evaluateTutorialPresentation } from "@/lib/platform-policy/policy";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { LEAGUE_SWIPE_GAMES } from "@/lib/league-swipe/api";
import {
  META_REFLEX_NAME,
  META_REFLEX_ROUTE,
  META_REFLEX_STATS_ROUTE,
  META_REFLEX_TAGLINE,
} from "@/lib/league-swipe/branding";
import { playUiSfx } from "@/lib/ui-sfx";
import AcademyBroadcastCenterpiece from "@/components/lol/broadcast/AcademyBroadcastCenterpiece";
import { usePatchBriefFeed } from "@/components/lol/broadcast/usePatchBriefFeed";
import academyLibraryDesktop from "@/academy/hub/academy-library-desktop.png";
import academyLibraryMobile from "@/academy/hub/academy-library-mobile.png";
import {
  BOOK_MAX_WIDTH_CSS,
  BOOK_STACK_LIFT_CSS,
  CENTERPIECE_WIDTH_CSS,
  TITLE_FONT_SIZE_CSS,
} from "@/components/lol/academy-layout";

const LOL_TAG = "League of Legends";

/** Inert 1×1 GIF: the <picture> fallback that must never cost a request. */
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

type HubDestination = {
  to: string;
  title: string;
  subtitle: string;
  Icon: React.ElementType;
  championName: string;
  /** Stable id into HUB_GUIDE_MODES — drives Mogzy's contextual reaction. */
  guideId: HubGuideModeId;
  /**
   * object-position for the splash crop inside the left book cover. The panel
   * crops horizontally only (see BookModeCard), so the X value frames the
   * champion's face; each value is tuned per splash.
   */
  splashPosition?: string;
};

// Approved academy IA — six destinations, book columns read left/right per row:
//   Leaguecraft | Combat Lab / Stat Check | Mogzy Archives / Quiz History | Patch Reports
const LEFT_DESTINATIONS: HubDestination[] = [
  {
    to: "/quiz",
    title: "Leaguecraft",
    guideId: "leaguecraft",
    subtitle: "Study. Practice. Ascend.",
    Icon: BrainCircuit,
    championName: "Ryze",
    splashPosition: "95% center",
  },
  {
    to: "/quiz/stat-check",
    title: "Stat Check",
    guideId: "stat-check",
    subtitle: "Build. Compare. Outplay.",
    Icon: Layers,
    championName: "Twisted Fate",
    splashPosition: "95% center",
  },
  {
    to: "/lol/history",
    title: "Quiz History",
    guideId: "quiz-history",
    subtitle: "Review your past results.",
    Icon: HistoryIcon,
    championName: "Zilean",
    splashPosition: "70% center",
  },
];
const RIGHT_DESTINATIONS: HubDestination[] = [
  {
    to: "/combat-lab",
    title: "Combat Lab",
    guideId: "combat-lab",
    subtitle: "Practice. Analyze. Dominate.",
    Icon: Swords,
    championName: "Akali",
    splashPosition: "44% center",
  },
  {
    to: "/lol/docs",
    title: "Mogzy Archives",
    guideId: "archives",
    subtitle: "Explore League knowledge.",
    Icon: FileText,
    championName: "Viktor",
    splashPosition: "44% center",
  },
  {
    to: "/lol/patch-reports",
    title: "Patch Reports",
    guideId: "patch-reports",
    subtitle: "Track every gameplay change.",
    Icon: Newspaper,
    championName: "Jayce",
    splashPosition: "98% center",
  },
];
// Mobile list order follows the desktop grid row-major (by priority), not
// column-major: Leaguecraft, Combat Lab, Stat Check, Archives, History, Patch.
const ALL_DESTINATIONS = LEFT_DESTINATIONS.flatMap((d, i) => {
  const right = RIGHT_DESTINATIONS[i];
  return right ? [d, right] : [d];
});

// Personalized academy lines. One is picked at random per hub entry and stays
// fixed for the whole visit (see academyLineIndex below).
const ACADEMY_LINES: ((name: string) => string)[] = [
  (name) => `Have you been studying, ${name}?`,
  (name) => `Remember to train your combat skills, ${name}.`,
  (name) => `Don’t fall behind on the patch notes, ${name}!`,
];
/** Fallback address for anonymous users and profiles with no display name. */
const ACADEMY_FALLBACK_NAME = "Summoner";

// Meta Reflex games (internally League Swipe; see /league-swipe).
//
// This subsection was hidden on 2026-07-29 on the stated basis that Meta Reflex
// "now lives inside Leaguecraft" — but that Leaguecraft entry point was never
// actually built, so the feature ended up with no front door at all. The entry
// now exists (Quiz.tsx §2d), and the owner has confirmed the two surfaces are
// complementary, not exclusive: Meta Reflex is a full standalone experience AND
// is reachable from Leaguecraft.
const SHOW_SWIPE_GAMES = true;

/** Icon per game slug. The only hub-specific fact — titles and descriptions
 *  come from the shared catalog so the hub cannot drift from the game pages. */
const SWIPE_GAME_ICONS: Record<string, typeof Heart> = {
  "favorite-champion": Heart,
  "most-annoying-champion": Flame,
  "higher-base-stat": Brain,
  "item-cost-duel": Coins,
};
const SWIPE_GAME_CARDS = LEAGUE_SWIPE_GAMES.map((g) => ({
  slug: g.slug,
  title: g.title,
  description: g.description,
  Icon: SWIPE_GAME_ICONS[g.slug] ?? Zap,
}));

export default function LolHub() {
  const { user } = useAuth();
  const { data: posts = [], isLoading } = useBlogList({ limit: 24, tag: LOL_TAG });
  const { data: championAssets } = useChampionAssets();
  // One Patch Brief feed serves the desktop and mobile centerpieces alike.
  const broadcastFeed = usePatchBriefFeed();
  // Pick the academy line ONCE per mount — lazy initializer, so no Math.random()
  // during render and the line never changes while the user stays on the hub.
  const [academyLineIndex] = useState(() => Math.floor(Math.random() * ACADEMY_LINES.length));
  const [displayName, setDisplayName] = useState<string | null>(null);

  const isAnonymous = !user || user.is_anonymous === true;
  // First-visit tutorial onboarding. Authoritative source is the profile's
  // tutorial-completion state, NOT localStorage: show the popup to an anonymous
  // user who has not completed the tutorial, once status has finished loading.
  // Fail-open on a genuine read error (don't trap the user behind a
  // non-dismissible popup); loading is distinct from error and simply waits.
  //
  // Layered on top: the admin-controlled global policy. `autoPopupEnabled`
  // suppresses ONLY this automatic overlay — the tutorial itself and its
  // permanent Leaguecraft route stay available either way — and
  // `completionRequiredForNewUsers` decides whether the overlay is escapable.
  const { loading: tutorialLoading, completed: tutorialCompleted, error: tutorialError } =
    useRankedTutorialStatus();
  const { settings, loading: settingsLoading } = useAppSettings();
  const [popupDismissed, setPopupDismissed] = useState(hasDismissedTutorialPopup);
  // Read once per mount, like popupDismissed above: the value cannot change
  // while the hub is on screen, and a lazy initializer keeps storage access out
  // of render.
  const [academyWelcomeHandled] = useState(hasHandledAcademyWelcome);

  const { showAutoPopup, popupDismissible } = evaluateTutorialPresentation({
    autoPopupEnabled: settings.policy.tutorial.autoPopupEnabled,
    completionRequiredForNewUsers: settings.policy.tutorial.completionRequiredForNewUsers,
    completed: tutorialCompleted,
    eligibleForFirstVisit: isAnonymous,
  });
  // HI1: a visitor who has already been through the Academy introduction has
  // been onboarded, and must never then be handed the legacy popup on arrival —
  // that would be two first-run experiences back to back.
  //
  // Deliberately the smallest possible change: the popup component, its policy
  // rows, and this whole evaluation stay exactly as they were, so HI1 can be
  // reverted by removing one condition. The popup is separately switched off in
  // production via `tutorial_auto_popup_enabled`; this does not depend on that
  // and does not alter it.
  const showWelcome =
    !tutorialLoading &&
    !settingsLoading &&
    !tutorialError &&
    showAutoPopup &&
    !popupDismissed &&
    !academyWelcomeHandled;

  const dismissWelcome = () => {
    markTutorialPopupDismissed();
    setPopupDismissed(true);
  };

  // Mark hub visited (suppresses /quiz → hub redirect this session) and ensure anon session.
  useEffect(() => {
    markHubVisited();
    if (!user) {
      supabase.auth.signInAnonymously();
    }
  }, [user]);

  // Funnel: landing view, once per mount.
  useEffect(() => {
    trackFunnelEvent("lol_landing_viewed");
    // appEnter SFX — playUiSfx skips this internally on a cold page load
    // (no user gesture yet), so it only sounds after internal navigation.
    playUiSfx("appEnter");
  }, []);

  // Display name for the academy line. Anonymous users keep the "Summoner"
  // fallback and never hit the network; a signed-in user with no display_name
  // set falls back too. Read-only, best-effort — failures stay silent.
  useEffect(() => {
    if (!user || isAnonymous) {
      setDisplayName(null);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (active) setDisplayName((data as { display_name?: string | null } | null)?.display_name?.trim() || null);
    })();
    return () => {
      active = false;
    };
  }, [user, isAnonymous]);

  const academyLine = ACADEMY_LINES[academyLineIndex](displayName || ACADEMY_FALLBACK_NAME);

  // Mogzy's contextual guide: hover/focus on a desktop book card reports its
  // mode upward; MogzyHubGuide renders the reaction. Deactivation is delayed
  // slightly inside the hook so moving between adjacent cards never flashes
  // the idle state.
  const { activeModeId, activate: activateGuide, deactivate: deactivateGuide } =
    useHubGuideState();

  const onDestinationClick = (to: string) => {
    playUiSfx("sectionOpen");
    if (to === "/quiz") {
      trackFunnelEvent("lol_start_quiz_clicked", { cta: "hub_book" });
    }
  };

  // Vertical bias of both book columns. Was a fixed −50px tuned at 1080; now
  // eases to 0 on short viewports (see academy-layout.ts) so the columns can
  // never rise into the title band when the fold leaves them no slack above.
  const DESKTOP_BOOK_STACK_Y = BOOK_STACK_LIFT_CSS;

  // How far each book column is pulled back toward the center from its outer
  // edge. At wide viewports this is the original 120px composition; below
  // ~1440px it eases off to 0 so the inner book edges never lean into the
  // central lane, where the Academy Radio console now lives — at 1280 the
  // fixed 120px put book edges 34px into the lane, under the console.
  const DESKTOP_BOOK_STACK_INSET = "clamp(0px, (100vw - 1200px) * 0.5, 120px)";

  const renderBook = (d: HubDestination, side: "left" | "right") => (
    // Book size. BookModeCard reclaims ALL of the frame PNG's transparent
    // padding, so the card box IS the drawn book: height = width × 0.542, and
    // width = the drawn book's width.
    //
    // The size is height-aware with two regimes (academy-layout.ts): at
    // heights ≥ ~1000px the original shallow slope binds (0.308 × 100dvh +
    // 176px — 1080 keeps its approved 509px books), below that a steeper
    // fit slope takes over so heading + three rows + padding always fit the
    // fold — the old "third row runs past the fold" trade predated the MALT
    // title/HUD and is retired. The min() with 100% keeps the book inside
    // its grid column so it can never clip.
    //
    // Each column is pushed OUTWARD (mr-auto / ml-auto) instead of centred, so
    // the books sit near the viewport edges and the central Mogzy lane opens up.
    // Hover/focus (focus bubbles up from the Link inside BookModeCard) drive
    // Mogzy's contextual guide. Purely additive: click/navigation semantics
    // stay on the Link itself.
    <div
      key={d.to}
      data-guide-mode={d.guideId}
      onMouseEnter={() => activateGuide(d.guideId)}
      onMouseLeave={deactivateGuide}
      onFocus={() => activateGuide(d.guideId)}
      onBlur={deactivateGuide}
      className={`w-full ${side === "left" ? "mr-auto" : "ml-auto"}`}
      style={{ maxWidth: BOOK_MAX_WIDTH_CSS }}
    >
      <BookModeCard
        to={d.to}
        title={d.title}
        subtitle={d.subtitle}
        splashUrl={getChampionSplash(championAssets, d.championName)}
        splashPosition={d.splashPosition}
        describedBy={hubGuideDescriptionId(d.guideId)}
        onClick={() => onDestinationClick(d.to)}
      />
    </div>
  );

  return (
    <div>
      {showWelcome && (
        <LolWelcomeIntro dismissible={popupDismissible} onDismiss={dismissWelcome} />
      )}
      <SEOHead
        title="Mogzy LoL Quiz | League of Legends Trivia and Training"
        description="Play League of Legends quizzes about champions, items, abilities, builds, objectives, patch knowledge, and esports history. Test damage in the Combat Lab. Start playing without an account."
        path="/lol"
        keywords="league of legends quiz, lol quiz, league trivia, champion quiz, item quiz, ability quiz, esports trivia, league learning game, league of legends training tool, combat lab, lol tier list"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Mogzy LoL Quiz",
            url: `${SITE_URL}/lol`,
            applicationCategory: "GameApplication",
            operatingSystem: "Web",
            description:
              "League of Legends quiz and training tool: champion, item, ability, build and esports trivia, plus a damage simulator.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
        ]}
      />

      {/* ================= Academy Library — above-the-fold hub ================= */}
      {/* Desktop pulls itself up under the floating HUD (the shell still pads
          by --app-header-h for every ordinary page): the painted library runs
          to the very top of the viewport and the section owns a full 100dvh.
          The negative margin cancels the shell's padding exactly, so the
          document does not overflow. The heading stack starts inside the HUD
          band — its centered column never reaches the corner controls (the
          one full-width exception, the sign-up strip, handles its own
          clearance) — and the reclaimed room surfaces as the gap between the
          radio dock and Mogzy; see the inner container's pt/pb comment. */}
      <section className="relative w-full md:-mt-[var(--app-header-h)] md:min-h-[100dvh] md:flex md:flex-col overflow-hidden">
        {/* Full-bleed library background. One <picture> rather than two <img>
            elements hidden by CSS: the browser resolves the media query itself
            and fetches exactly one file, so phones never pull the desktop
            painting and vice versa. Crops are preserved per breakpoint via
            object-position. This is the hub's LCP visual, hence eager+high.

            Both paintings are declared as <source>s and the <img> falls back to
            an inert 1×1 pixel ON PURPOSE. React sets attributes on the <img>
            while it is still detached from the <picture>, so a real file in
            `src` starts downloading before the sources exist — which is exactly
            the double-download this change is meant to remove. The two media
            queries are exhaustive, so a real painting always wins selection. */}
        <picture>
          <source media="(min-width: 768px)" srcSet={academyLibraryDesktop} />
          <source media="(max-width: 767px)" srcSet={academyLibraryMobile} />
          <img
            src={TRANSPARENT_PIXEL}
            alt=""
            aria-hidden
            data-testid="academy-library-background"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top md:[object-position:center_72%]"
          />
        </picture>
        {/* Readability scrim — kept light so the painting stays visible */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(4,7,15,0.55) 0%, rgba(4,7,15,0.15) 22%, rgba(4,7,15,0.05) 55%, rgba(4,7,15,0.45) 100%)",
          }}
          aria-hidden
        />

        {/* Desktop spacing: the upper stack (heading → Broadcast book → radio)
            sits INSIDE the HUD band — the centered content never meets the
            corner controls, so reserving the whole --app-header-h strip just
            left a ghost navbar. The 3.25rem the top padding gives up moves to
            the bottom padding ON PURPOSE: total flow height is unchanged, so
            the section (and with it the painted library's crop — Mogzy's
            pedestal) keeps its exact geometry in both regimes (content-driven
            below ~1000px viewports, min-h-driven above), and the whole
            reclaimed band becomes clean air between the radio dock and Mogzy
            (see the guide wrapper's matching 3.25rem offset in the lane). */}
        <div className="relative z-10 flex w-full flex-1 flex-col px-4 md:px-3 lg:px-4 xl:px-6 pt-3 md:pt-2 pb-6 md:pb-14">
          {/* Guest signup lives in the global HUD now (GlobalHud's chip and
              account-menu entry) — the old full-width banner that sat here
              competed with the Academy title and its dismissal never
              persisted. */}

          {/* Compact centered academy heading */}
          <header className="text-center">
            <h1
              className="academy-hub-title mx-auto font-medium leading-[1.12] text-transparent bg-clip-text"
              style={{
                // Smallest of: width-fluid (original), height-fit (short
                // laptops), HUD-clearance (narrow desktops) — academy-layout.ts.
                fontSize: TITLE_FONT_SIZE_CSS,
                fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif',
                backgroundImage:
                  "linear-gradient(180deg, #e3d7b2 0%, #b9a46b 55%, #78652f 100%)",
                WebkitBackgroundClip: "text",
                // Inline overrides: .theme-lol h1 paints a solid gold color and a
                // text-shadow, both of which break background-clip gradient text.
                color: "transparent",
                textShadow: "none",
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.75))",
              }}
            >
              <span className="block text-balance">Mogzy’s Academy of</span>
              <span className="block text-balance">Leaguecraft and Technology</span>
            </h1>
            {/* Sub-lines are mobile-only: on desktop that vertical band goes to
                the book grid instead. Mobile presentation is unchanged. */}
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.34em] text-[#c9a84c]/90 md:hidden">
              Welcome back, Summoner
            </p>
            <p className="mt-1 text-xs text-[#cfc4a5]/85 md:hidden">
              Chart your path. Sharpen your edge.
            </p>
            {/* Randomized personalized academy line (desktop). Chosen once per
                mount; the entrance fade is disabled under prefers-reduced-motion
                by .academy-personal-line in index.css. */}
            <p className="academy-personal-line mx-auto mt-1 hidden text-[13px] leading-tight tracking-[0.02em] text-[#7ad6ff]/85 md:block lg:text-sm">
              {academyLine}
            </p>
          </header>

          {/* Screen-reader-only guide descriptions. Each desktop book card
              points here via aria-describedby, so AT announces the mode's
              contextual description on keyboard focus. Kept OUTSIDE the
              aria-hidden mascot lane (whose speech bubble stays purely
              visual) and static in the DOM — no aria-live, so pointer hover
              announces nothing. */}
          <div className="sr-only">
            {Object.values(HUB_GUIDE_MODES).map((mode) => (
              <span key={mode.id} id={hubGuideDescriptionId(mode.id)}>
                {mode.description}
              </span>
            ))}
          </div>

          {/* Desktop: six open books flanking Mogzy's central lane */}
          <div className="mt-0.5 hidden min-h-0 flex-1 md:grid grid-cols-[1fr_minmax(200px,0.34fr)_1fr] items-center gap-x-2 lg:gap-x-3">
            <div
              className="flex min-h-0 flex-col justify-center gap-y-[clamp(2px,0.8vh,12px)]"
              style={{
                transform: `translate(calc(${DESKTOP_BOOK_STACK_INSET}), ${DESKTOP_BOOK_STACK_Y})`,
              }}
            >
              {LEFT_DESTINATIONS.map((d) => renderBook(d, "left"))}
            </div>

            {/* Central lane — the Academy Broadcast centerpiece (magic-book
                surface with the radio dock at its base) sits in the upper
                lane, lowered enough to clear the heading and subtitle, and
                Mogzy hovers above the painted stack of books below it. Both
                are absolutely positioned inside the lane so neither affects
                the book grid's layout height. The lane itself ignores the
                pointer so book edges that lean into it stay clickable; only
                the centerpiece takes events back. */}
            <div className="pointer-events-none relative h-full min-h-0">
              {/* Fixed 12px drop from the lane top keeps the book tucked close
                  under the subtitle at every height — the earlier 7% offset
                  grew with the lane and pushed the dock into Mogzy's hat on
                  tall viewports. */}
              <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
                {/* Fixed width + shrink-0: the tome centres over the narrow grid
                    lane and may spill evenly into the cleared gaps beside the
                    book columns. The width term tracks the free zone the grid
                    leaves (~216px until the book inset eases at 1200px, then
                    one extra px per viewport px); the height term compresses
                    the tome on short viewports so the dock stops crowding
                    Mogzy — see academy-layout.ts. */}
                <AcademyBroadcastCenterpiece
                  feed={broadcastFeed}
                  className="pointer-events-auto shrink-0"
                  style={{ width: CENTERPIECE_WIDTH_CSS }}
                />
              </div>
              {/* Mogzy contextual guide — replaces the static mascot float
                  with identical geometry (the guide's root IS the same
                  academy-mogzy-float / bottom-[16%] wrapper). aria-hidden
                  stays scoped to the mascot subtree exactly as before — the
                  interactive Broadcast centerpiece above must stay visible to
                  AT — and z-10 keeps the speech bubble above the transformed
                  book columns. Pointer events stay off: the guide never
                  blocks a card or the radio dock.

                  The 3.25rem offsets undo the spacing pass for Mogzy alone:
                  the container moved that much padding from top to bottom, so
                  the lane (and the centerpiece pinned to its top) rose 3.25rem
                  while the section held its height. Shifting the guide's
                  coordinate box back down by the same amount keeps the
                  bottom-[16%] anchor resolving to the exact pixels it had
                  before the pass — the heading/book/radio stack rises, Mogzy
                  and his painted pedestal do not. The box hangs 3.25rem into
                  the container's bottom padding, which the section still owns,
                  so nothing clips. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-[3.25rem] -bottom-[3.25rem] z-10"
              >
                <MogzyHubGuide activeModeId={activeModeId} />
              </div>
            </div>

            <div
              className="flex min-h-0 flex-col justify-center gap-y-[clamp(2px,0.8vh,12px)]"
              style={{
                transform: `translate(calc(-1 * (${DESKTOP_BOOK_STACK_INSET})), ${DESKTOP_BOOK_STACK_Y})`,
              }}
            >
              {RIGHT_DESTINATIONS.map((d) => renderBook(d, "right"))}
            </div>
          </div>

          {/* Mobile fallback — clipped Hextech panels (unchanged presentation) */}
          <div className="mt-5 grid grid-cols-1 gap-3 md:hidden">
            {ALL_DESTINATIONS.map((d) => (
              <HexPanelLink
                key={d.to}
                to={d.to}
                title={d.title}
                description={d.subtitle}
                Icon={d.Icon}
                accent={d.to === "/combat-lab" ? "gold" : "cyan"}
                onClick={() => onDestinationClick(d.to)}
              />
            ))}
          </div>

          {/* Mobile Academy Broadcast — the stacked magic-book card with the
              radio dock beneath it, after the six destinations so primary
              navigation keeps the top of the list. */}
          <div className="mt-4 md:hidden">
            <AcademyBroadcastCenterpiece variant="mobile" feed={broadcastFeed} />
          </div>
        </div>
      </section>

      {/* ================= Below the fold ================= */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <AdSlot placement="lol_hub_mid" className="mt-2" />

        {/* Meta Reflex games — the standalone surface, alongside the
            Leaguecraft entry in Quiz.tsx §2d rather than instead of it. */}
        {SHOW_SWIPE_GAMES && (
          <div className="mt-8" data-testid="lol-hub-meta-reflex-section">
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 text-[#c9a84c]">
                  <Zap className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">
                    {META_REFLEX_NAME}
                  </span>
                </div>
                <h2 className="text-lg md:text-xl font-bold text-foreground">
                  {META_REFLEX_TAGLINE}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  to={META_REFLEX_STATS_ROUTE}
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 py-2 -my-2"
                >
                  Stats <ArrowRight className="h-3 w-3" />
                </Link>
                <Link
                  to={META_REFLEX_ROUTE}
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 py-2 -my-2"
                >
                  All games <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {SWIPE_GAME_CARDS.map((g) => (
                <HexPanelLink
                  key={g.slug}
                  to={`/league-swipe/${g.slug}`}
                  title={g.title}
                  description={g.description}
                  Icon={g.Icon}
                  accent="gold"
                  compact
                  onClick={() => playUiSfx("sectionOpen")}
                />
              ))}
            </div>
          </div>
        )}

        {/* News / Blog — hidden entirely when there are no League posts */}
        {(isLoading || posts.length > 0) && (
        <div className="mt-8">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 text-[#c9a84c]">
                <Newspaper className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-widest font-bold">News & Blog</span>
              </div>
              <h2 className="text-lg md:text-xl font-bold text-foreground">Latest LoL Stories</h2>
            </div>
            <Link
              to="/blog"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 py-2 -my-2"
            >
              All posts <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {posts.map((p) => (
                <BlogPostCard key={p.id} post={p} size="sm" />
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
