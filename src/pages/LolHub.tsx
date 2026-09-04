import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Swords, Flame, Newspaper, ArrowRight, BrainCircuit, FileText, Zap, Heart, Brain, Coins, Trophy } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import BlogPostCard from "@/components/blog/BlogPostCard";
import AdSlot from "@/components/ads/AdSlot";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import AcademyHubBook from "@/components/lol/AcademyHubBook";
import AcademyHubShelf from "@/components/lol/AcademyHubShelf";
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
import { usePlaySfx } from "@/lib/audio/usePlaySfx";
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
  CENTERPIECE_WIDTH_CSS,
  CLOSED_BOOK_MAX_WIDTH_CSS,
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
   * Title set on the closed volume's leather panel; lines split on "\n".
   * Distinct from `title`, which stays the accessible name and the guide
   * title, so "Combat Simulation" sets as COMBAT / SIMULATION while its
   * aria-label stays one string.
   */
  coverTitle?: string;
  /**
   * `object-position` for the splash inside the volume's PORTRAIT art window.
   * The window (0.88:1) is far taller than a splash (≈1.70:1), so `cover`
   * shows the splash's full height and crops horizontally only: the X value
   * frames the champion and the Y value is close to inert. Tuned per champion
   * — these are NOT the open card's old landscape-panel values.
   */
  splashPosition?: string;
};

// Approved academy IA — FOUR primary destinations in a balanced quadrant:
//
//   Leaguecraft (TL) | Combat Simulation (TR)
//   Mogzy Archives (BL) | Pro Play (BR)
//
// One registry, row-major, is the single source of truth: the desktop columns
// derive from index parity (even → left, odd → right), the mobile list walks
// it in order, and every entry carries the `guideId` that keys
// HUB_GUIDE_MODES, so a destination cannot exist without Mogzy being able to
// describe it. Stat Check, Quiz History and Patch Reports were retired from
// the primary hub on 2026-09-02 (IA cleanup); their routes, pages and other
// front doors are untouched — Stat Check from Quiz.tsx, Quiz History from the
// Leaguecraft workspace History pane and the profile, Patch Reports from the
// Academy Broadcast centerpiece below. Pro Play was promoted from the
// standalone gold panel it shipped as into a full peer destination.
const HUB_DESTINATIONS: HubDestination[] = [
  {
    to: "/quiz",
    title: "Leaguecraft",
    guideId: "leaguecraft",
    subtitle: "Study. Practice. Ascend.",
    Icon: BrainCircuit,
    championName: "Ryze",
    coverTitle: "Leaguecraft\nStudies",
    splashPosition: "78% center",
  },
  {
    // Route id, guide id and component names stay `combat-lab` on purpose —
    // only the user-facing title reads "Combat Simulation".
    to: "/combat-lab",
    title: "Combat Simulation",
    guideId: "combat-lab",
    subtitle: "Practice. Analyze. Dominate.",
    Icon: Swords,
    championName: "Akali",
    coverTitle: "Combat\nSimulation",
    splashPosition: "36% center",
  },
  {
    to: "/lol/docs",
    title: "Mogzy Archives",
    guideId: "archives",
    subtitle: "Explore League knowledge.",
    Icon: FileText,
    championName: "Viktor",
    coverTitle: "Mogzy\nArchives",
    splashPosition: "34% center",
  },
  {
    // Professional-play content — NOT /lol/pro, the subscription page.
    to: "/lol/pro-play",
    title: "Pro Play",
    guideId: "pro-play",
    subtitle: "Quiz yourself on the pro scene.",
    Icon: Trophy,
    championName: "Ahri",
    coverTitle: "Pro Play",
    splashPosition: "56% center",
  },
];

/**
 * Hub entrance choreography — the volumes being shelved.
 *
 * The library, the shelves, the header and Mogzy are the ROOM: they are
 * simply there. Only the four books arrive, in a paired stagger — the upper
 * pair, then the lower — so the hub reads as being assembled rather than as
 * four cards fading in together.
 *
 * Timing, per book: delay = ROW_DELAY[row] + (right column ? PAIR_OFFSET_MS).
 *
 *   upper-left   380ms      lower-left   600ms
 *   upper-right  455ms      lower-right  675ms
 *
 * The 75ms within-pair offset stops two books hitting on the same frame,
 * which reads as one loud thud rather than two hands working; the 220ms
 * between pairs is long enough to hear as a second beat and short enough that
 * nothing feels withheld. The last volume settles at 675 + 660 = ~1.34s.
 *
 * IMPACT_FRACTION is where in the animation the book actually touches its
 * board — the descent is the first 55%, and the overshoot/rebound after it is
 * the shelf absorbing the weight. The sound is scheduled against that, not
 * against the start, or every thud would arrive while the book is still in
 * the air.
 */
const BOOK_ENTRANCE_MS = 660;
const BOOK_ROW_DELAY_MS = [380, 600];
const BOOK_PAIR_OFFSET_MS = 75;
const BOOK_IMPACT_FRACTION = 0.55;

const bookEntranceDelayMs = (side: "left" | "right", row: number) =>
  (BOOK_ROW_DELAY_MS[row] ?? BOOK_ROW_DELAY_MS[BOOK_ROW_DELAY_MS.length - 1]) +
  (side === "right" ? BOOK_PAIR_OFFSET_MS : 0);

/**
 * Has the entrance already run in THIS page session?
 *
 * Module scope, deliberately, and no storage of any kind. A page load resets
 * it, so a fresh visit or a refresh gets the full sequence; SPA navigation
 * does not, so clicking Home from anywhere in the app puts the hub up
 * instantly. That is exactly the wanted policy — "fresh visit yes, immediate
 * repeat no" — and a sessionStorage key would have been a slower, more
 * fragile way to say the same thing while ALSO killing the entrance on a
 * genuine reload, which is the one time it is most wanted.
 */
let hubEntranceConsumed = false;

/** Desktop columns: row-major registry → two vertical pairs. */
const LEFT_DESTINATIONS = HUB_DESTINATIONS.filter((_, i) => i % 2 === 0);
const RIGHT_DESTINATIONS = HUB_DESTINATIONS.filter((_, i) => i % 2 === 1);
/** Mobile list order = registry order (desktop reading order). */
const ALL_DESTINATIONS = HUB_DESTINATIONS;
/** Mobile panels that keep the gold accent (Combat Simulation kept its own;
 *  Pro Play inherits the gold its standalone panel shipped with). */
const GOLD_ACCENT_ROUTES = new Set(["/combat-lab", "/lol/pro-play"]);

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

  // Decide during the FIRST render, not in an effect: an effect runs after
  // paint, so the books would already be sitting in their final places for a
  // frame before the animation class arrived and yanked them back into the
  // air.
  //
  // The initializer only READS the module flag — claiming it here as a side
  // effect is not StrictMode-safe, and was measurably wrong: the double
  // render made the second pass see its own first pass's claim and hand the
  // very first visitor `false`, killing the entrance exactly when it should
  // run. The claim belongs in an effect, which is idempotent under the same
  // double invocation.
  const [runEntrance] = useState(() => !hubEntranceConsumed);
  useEffect(() => {
    hubEntranceConsumed = true;
  }, []);

  // One impact per volume, scheduled at the moment it touches its board.
  // usePlaySfx is the app's single SFX gate — per-cue admin setting plus the
  // global mute — so nothing here needs its own preference, and the engine
  // stays silent until the browser has seen a user gesture. On a genuinely
  // fresh load that means the sequence is silent, which is correct: sounding
  // it would require defeating autoplay policy.
  const sfx = usePlaySfx();
  const sfxRef = useRef(sfx);
  sfxRef.current = sfx;
  useEffect(() => {
    if (!runEntrance) return;
    if (typeof window === "undefined") return;
    // Motion preference read at schedule time, not through a hook: the
    // animation itself is cancelled in CSS, and four thuds with nothing
    // moving would be worse than silence.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timers = (["left", "right"] as const).flatMap((side) =>
      [0, 1].map((row) =>
        window.setTimeout(
          () => sfxRef.current.play("bookLand"),
          bookEntranceDelayMs(side, row) + BOOK_ENTRANCE_MS * BOOK_IMPACT_FRACTION,
        ),
      ),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [runEntrance]);

  const onDestinationClick = (to: string) => {
    // Pages flicking as the volume is opened. Fires on pointer AND keyboard
    // activation, because it hangs off the Link's own onClick — React routes
    // an Enter press on an anchor through the same handler. No delay before
    // navigating: this is an SPA route change, the AudioContext is a module
    // singleton that survives it, and the already-scheduled Web Audio nodes
    // keep sounding on the next page (verified by counting voices across the
    // transition). Holding navigation for audio would be the wrong trade.
    sfxRef.current.play("bookRuffle");
    playUiSfx("sectionOpen");
    if (to === "/quiz") {
      trackFunnelEvent("lol_start_quiz_clicked", { cta: "hub_book" });
    }
  };

  // Vertical bias of both book columns. The old −50px lift (eased to 0 on
  // short viewports) existed to open the pedestal under THREE short open-book
  // rows that left slack above them. Two portrait volumes spend the fold
  // almost exactly, so any negative lift now pushes row one into the title
  // band at every height — the columns simply centre. BOOK_STACK_LIFT_CSS is
  // left exported and tested for the open card; the hub no longer applies it.
  const DESKTOP_BOOK_STACK_Y = "0px";

  // How far each book column is pulled back toward the center from its outer
  // edge. At wide viewports this is the original 120px composition; below
  // ~1440px it eases off to 0 so the inner book edges never lean into the
  // central lane, where the Academy Radio console now lives — at 1280 the
  // fixed 120px put book edges 34px into the lane, under the console.
  const DESKTOP_BOOK_STACK_INSET = "clamp(0px, (100vw - 1200px) * 0.5, 120px)";

  // WIDE-SCREEN PULL (live review, 2026-09-04). The inset above saturates at
  // 120px by 1440, so every viewport past it kept the columns pinned to the
  // outside walls while the free centre grew without limit: measured, the gap
  // between a book's inner edge and the tome ran 158px at 1440 but 329px at
  // 1920 and 586px at 2560. This second term spends that excess.
  //
  // It starts at ZERO at 1440 and only opens up beyond it, so 1366 and 1440 —
  // already compact and approved — are bit-identical to before. 0.36 of each
  // excess pixel gives ~173px per column at 1920, inside the 150–200px the
  // review asked for; the 260px cap keeps ultra-wide from over-tightening.
  //
  // DELIBERATELY SEPARATE from DESKTOP_BOOK_STACK_INSET rather than a bigger
  // cap on it. academy-layout's CENTERPIECE_WIDTH_CSS subtracts twice that
  // inset when it models the free central zone, so widening the shared value
  // would SHRINK the Patch Report — at 1920 from its approved 380px to 271px.
  // The centerpiece is approved as it stands, so the pull is a column-only
  // move and the tome's width term is left exactly as it was.
  const DESKTOP_BOOK_PULL_IN = "clamp(0px, (100vw - 1440px) * 0.36, 260px)";
  const DESKTOP_COLUMN_INWARD = `calc(${DESKTOP_BOOK_STACK_INSET} + ${DESKTOP_BOOK_PULL_IN})`;

  // Book size and placement. AcademyHubBook's layout box IS the frame PNG's
  // canvas, so the card's height is its width × 1.5 with no margin
  // arithmetic. The width is whatever two portrait rows can spend against the
  // fold — see CLOSED_BOOK_MAX_WIDTH_CSS in academy-layout.ts.
  //
  // Each column is pushed OUTWARD (mr-auto / ml-auto) so the volumes sit near
  // the viewport edges and the central Mogzy lane opens up. Hover/focus (focus
  // bubbles up from the Link inside the book) drive Mogzy's contextual guide;
  // click/navigation semantics stay on the Link itself.
  //
  // Every volume is presented HEAD-ON: the shelves explain where the books
  // are, so none of them needs to be turned toward Mogzy any more.
  const renderBook = (d: HubDestination, side: "left" | "right", row: number) => (
    <div
      key={d.to}
      data-guide-mode={d.guideId}
      onMouseEnter={() => activateGuide(d.guideId)}
      onMouseLeave={deactivateGuide}
      onFocus={() => activateGuide(d.guideId)}
      onBlur={deactivateGuide}
      className={`relative z-10 w-full ${side === "left" ? "mr-auto" : "ml-auto"}`}
      style={{
        maxWidth: CLOSED_BOOK_MAX_WIDTH_CSS,
        // Read by the entrance keyframes in index.css. Harmless when the
        // sequence is not running — nothing consumes it.
        ["--hub-book-delay" as string]: `${bookEntranceDelayMs(side, row)}ms`,
      }}
    >
      <AcademyHubBook
        to={d.to}
        title={d.title}
        coverTitle={d.coverTitle}
        splashUrl={getChampionSplash(championAssets, d.championName)}
        splashPosition={d.splashPosition}
        describedBy={hubGuideDescriptionId(d.guideId)}
        onClick={() => onDestinationClick(d.to)}
      />
    </div>
  );

  // One shelved column. The inner wrapper exists purely to give the shelf a
  // box to overlay: it shrink-wraps the pair (its max-width is the books', its
  // height is the stack's), so AcademyHubShelf needs no coordinates of its own
  // and the book positions are unchanged by its presence. The shelf paints at
  // z-0 behind the volumes, which renderBook raises to z-10.
  //
  // Both columns render the SAME shelf, unmirrored: the case is symmetrical
  // and lit from the left like every other object in the painting, so the two
  // sides read as a matching pair of display units without any counter-turn.
  const renderShelvedColumn = (
    destinations: HubDestination[],
    side: "left" | "right",
    inset: string,
  ) => (
    <div
      className="flex min-h-0 flex-col justify-center"
      style={{ transform: `translate(${inset}, ${DESKTOP_BOOK_STACK_Y})` }}
    >
      <div
        // `w-full` is load-bearing, not decoration. Without a DEFINITE width
        // this wrapper shrinks to fit, and its children are `w-full` against
        // it — a circular reference that collapses the whole stack to the
        // width of the title text. width:100% capped by max-width makes the
        // used width definite, and the auto margin then parks it at the
        // column's outer edge.
        className={`relative w-full flex flex-col gap-y-[clamp(2px,0.8vh,12px)] ${
          side === "left" ? "mr-auto" : "ml-auto"
        }`}
        style={{ maxWidth: CLOSED_BOOK_MAX_WIDTH_CSS }}
      >
        <AcademyHubShelf />
        {destinations.map((d, row) => renderBook(d, side, row))}
      </div>
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

          {/* Desktop: four books in a balanced quadrant around Mogzy's central lane */}
          <div
            data-hub-entrance={runEntrance ? "true" : "false"}
            className="mt-0.5 hidden min-h-0 flex-1 md:grid grid-cols-[1fr_minmax(200px,0.34fr)_1fr] items-center gap-x-2 lg:gap-x-3"
          >
            {renderShelvedColumn(LEFT_DESTINATIONS, "left", DESKTOP_COLUMN_INWARD)}

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

            {renderShelvedColumn(
              RIGHT_DESTINATIONS,
              "right",
              `calc(-1 * (${DESKTOP_COLUMN_INWARD}))`,
            )}
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
                accent={GOLD_ACCENT_ROUTES.has(d.to) ? "gold" : "cyan"}
                onClick={() => onDestinationClick(d.to)}
              />
            ))}
          </div>

          {/* Mobile Academy Broadcast — the stacked magic-book card with the
              radio dock beneath it, after the four destinations so primary
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
