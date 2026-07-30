import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Swords, Flame, Newspaper, ArrowRight, BrainCircuit, FileText, X, Zap, Heart, Brain, Coins, History as HistoryIcon, Layers } from "lucide-react";
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
import { markHubVisited } from "@/lib/quiz/onboarding-gate";
import LolWelcomeIntro from "@/components/lol/LolWelcomeIntro";
import { useRankedTutorialStatus } from "@/hooks/useRankedTutorialStatus";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { playUiSfx } from "@/lib/ui-sfx";
import academyLibraryDesktop from "@/academy/hub/academy-library-desktop.png";
import academyLibraryMobile from "@/academy/hub/academy-library-mobile.png";

const LOL_TAG = "League of Legends";

type HubDestination = {
  to: string;
  title: string;
  subtitle: string;
  Icon: React.ElementType;
  championName: string;
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
    subtitle: "Study. Practice. Ascend.",
    Icon: BrainCircuit,
    championName: "Ryze",
    splashPosition: "95% center",
  },
  {
    to: "/quiz/stat-check",
    title: "Stat Check",
    subtitle: "Build. Compare. Outplay.",
    Icon: Layers,
    championName: "Twisted Fate",
    splashPosition: "95% center",
  },
  {
    to: "/lol/history",
    title: "Quiz History",
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
    subtitle: "Practice. Analyze. Dominate.",
    Icon: Swords,
    championName: "Akali",
    splashPosition: "44% center",
  },
  {
    to: "/lol/docs",
    title: "Mogzy Archives",
    subtitle: "Explore League knowledge.",
    Icon: FileText,
    championName: "Viktor",
    splashPosition: "44% center",
  },
  {
    to: "/lol/patch-reports",
    title: "Patch Reports",
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

// League Swipe MVP games (see /league-swipe). The hub subsection is currently
// hidden — Meta Reflex now lives inside Leaguecraft — but the code is kept so
// it can be re-enabled without reconstruction.
const SHOW_SWIPE_GAMES = false;
const SWIPE_GAME_CARDS = [
  { slug: "favorite-champion", title: "Favorite Champion", description: "Choose your favorites and shape the community ranking.", Icon: Heart },
  { slug: "most-annoying-champion", title: "Most Annoying Champion", description: "Vote on League's most tilting champions.", Icon: Flame },
  { slug: "higher-base-stat", title: "Stat Duel", description: "Guess which champion has the higher stat.", Icon: Brain },
  { slug: "item-cost-duel", title: "Item Cost Duel", description: "Learn item costs through quick comparisons.", Icon: Coins },
];

export default function LolHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: posts = [], isLoading } = useBlogList({ limit: 24, tag: LOL_TAG });
  const { data: championAssets } = useChampionAssets();
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
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
  const { loading: tutorialLoading, completed: tutorialCompleted, error: tutorialError } =
    useRankedTutorialStatus();
  const showWelcome = !tutorialLoading && !tutorialError && isAnonymous && !tutorialCompleted;

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

  const onDestinationClick = (to: string) => {
    playUiSfx("sectionOpen");
    if (to === "/quiz") {
      trackFunnelEvent("lol_start_quiz_clicked", { cta: "hub_book" });
    }
  };

  const DESKTOP_BOOK_STACK_Y_PX = -50;

  const DESKTOP_BOOK_STACK_INSET_PX = 120;

  const renderBook = (d: HubDestination, side: "left" | "right") => (
    // Book size. BookModeCard reclaims ALL of the frame PNG's transparent
    // padding, so the card box IS the drawn book: height = width × 0.542, and
    // width = the drawn book's width.
    //
    // The size tracks viewport height on a deliberately SHALLOWER slope than a
    // strict three-rows-above-the-fold fit (which would be ≈ 0.615 × usable
    // height). At 1080 the two coincide, so 1920×1080 still shows all six books
    // without scrolling; below that the books stay large and the third row is
    // allowed to run slightly past the fold, which is the intended trade.
    //   0.308 × 100dvh + 176px  →  1080: 509px · 900: 453px · 768: 413px
    // The min() keeps the book inside its grid column so it can never clip.
    //
    // Each column is pushed OUTWARD (mr-auto / ml-auto) instead of centred, so
    // the books sit near the viewport edges and the central Mogzy lane opens up.
    <div
      key={d.to}
      className={`w-full ${side === "left" ? "mr-auto" : "ml-auto"}`}
      style={{ maxWidth: "min(100%, calc(100dvh * 0.308 + 176px))" }}
    >
      <BookModeCard
        to={d.to}
        title={d.title}
        subtitle={d.subtitle}
        splashUrl={getChampionSplash(championAssets, d.championName)}
        splashPosition={d.splashPosition}
        onClick={() => onDestinationClick(d.to)}
      />
    </div>
  );

  return (
    <div>
      {showWelcome && <LolWelcomeIntro />}
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
      <section className="relative w-full md:min-h-[calc(100dvh-var(--app-header-h))] md:flex md:flex-col overflow-hidden">
        {/* Full-bleed library backgrounds (desktop / mobile) */}
        <img
          src={academyLibraryDesktop}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover md:block"
          style={{ objectPosition: "center 72%" }}
        />
        <img
          src={academyLibraryMobile}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top md:hidden"
        />
        {/* Readability scrim — kept light so the painting stays visible */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(4,7,15,0.55) 0%, rgba(4,7,15,0.15) 22%, rgba(4,7,15,0.05) 55%, rgba(4,7,15,0.45) 100%)",
          }}
          aria-hidden
        />

        <div className="relative z-10 flex w-full flex-1 flex-col px-4 md:px-3 lg:px-4 xl:px-6 pt-3 md:pt-2 pb-6 md:pb-1">
          {/* Anonymous sign-up nudge banner */}
          {isAnonymous && !nudgeDismissed && (
            // Desktop keeps this strip compact (md:*) so the book grid gets the
            // vertical room; mobile spacing is unchanged.
            <div className="relative mx-auto mb-3 md:mb-1.5 flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[#c9a84c]/30 bg-[#0a1020]/70 backdrop-blur-sm py-2 pl-3 pr-10 sm:px-4 sm:py-2.5 md:py-1 text-sm">
              <span className="flex-1 min-w-[9rem] text-xs sm:text-sm text-[#f5e9c8]/90">
                {/* Concise on mobile; full pitch from sm up. */}
                <span className="sm:hidden">Save XP and streaks across devices.</span>
                <span className="hidden sm:inline">
                  Sign up to save your XP, streaks, and progress across Mogzy League.
                </span>
              </span>
              <button
                onClick={() => {
                  playUiSfx("primaryAction");
                  navigate("/auth?mode=signup&returnTo=/lol");
                }}
                className="shrink-0 inline-flex min-h-[32px] sm:min-h-[40px] md:min-h-[28px] items-center rounded-md bg-[#c9a84c]/20 px-2.5 py-1 sm:px-3 sm:py-2 md:py-0.5 text-xs sm:text-sm md:text-xs font-semibold text-[#f0d78c] hover:bg-[#c9a84c]/30 transition-colors"
              >
                Sign up free
              </button>
              <button
                onClick={() => setNudgeDismissed(true)}
                className="absolute right-0 top-0 p-2.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Compact centered academy heading */}
          <header className="text-center">
            <h1
              className="academy-hub-title mx-auto font-medium leading-[1.12] text-transparent bg-clip-text"
              style={{
                fontSize: "clamp(1.35rem, 2.2vw + 0.6rem, 2.4rem)",
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

          {/* Desktop: six open books flanking Mogzy's central lane */}
          <div className="mt-0.5 hidden min-h-0 flex-1 md:grid grid-cols-[1fr_minmax(200px,0.34fr)_1fr] items-center gap-x-2 lg:gap-x-3">
            <div
              className="flex min-h-0 flex-col justify-center gap-y-[clamp(2px,0.8vh,12px)]"
              style={{
                transform: `translate(${DESKTOP_BOOK_STACK_INSET_PX}px, ${DESKTOP_BOOK_STACK_Y_PX}px)`,
              }}
            >
              {LEFT_DESTINATIONS.map((d) => renderBook(d, "left"))}
            </div>

            {/* Central lane — Mogzy hovers above the painted stack of books.
                Absolutely positioned inside the lane so the float transform
                never affects layout height. */}
            <div className="relative h-full min-h-0" aria-hidden>
              <div className="academy-mogzy-float absolute inset-x-0 bottom-[16%] flex justify-center">
                <div className="relative">
                  <div
                    className="absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2"
                    style={{
                      background:
                        "radial-gradient(ellipse at center, rgba(255,214,140,0.28) 0%, rgba(120,160,255,0.12) 45%, transparent 70%)",
                      filter: "blur(14px)",
                    }}
                  />
                  <img
                    src="/mascot/mogzy-mascot-base-v1.png"
                    alt=""
                    draggable={false}
                    className="relative w-[clamp(110px,11vw,190px)] drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)]"
                  />
                </div>
              </div>
            </div>

            <div
              className="flex min-h-0 flex-col justify-center gap-y-[clamp(2px,0.8vh,12px)]"
              style={{
                transform: `translate(-${DESKTOP_BOOK_STACK_INSET_PX}px, ${DESKTOP_BOOK_STACK_Y_PX}px)`,
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
        </div>
      </section>

      {/* ================= Below the fold ================= */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <AdSlot placement="lol_hub_mid" className="mt-2" />

        {/* League Swipe Games — hidden while Meta Reflex lives inside Leaguecraft */}
        {SHOW_SWIPE_GAMES && (
          <div className="mt-8">
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 text-[#c9a84c]">
                  <Zap className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">League Swipe Games</span>
                </div>
                <h2 className="text-lg md:text-xl font-bold text-foreground">Two options. One tap.</h2>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  to="/league-swipe/stats"
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 py-2 -my-2"
                >
                  Stats <ArrowRight className="h-3 w-3" />
                </Link>
                <Link
                  to="/league-swipe"
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
