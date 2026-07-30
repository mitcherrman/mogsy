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
  /** object-position for the splash crop inside the left book cover. */
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
    splashPosition: "center 18%",
  },
  {
    to: "/quiz/stat-check",
    title: "Stat Check",
    subtitle: "Build. Compare. Outplay.",
    Icon: Layers,
    championName: "Twisted Fate",
    splashPosition: "center 15%",
  },
  {
    to: "/lol/history",
    title: "Quiz History",
    subtitle: "Review your past results.",
    Icon: HistoryIcon,
    championName: "Zilean",
    splashPosition: "center 20%",
  },
];
const RIGHT_DESTINATIONS: HubDestination[] = [
  {
    to: "/combat-lab",
    title: "Combat Lab",
    subtitle: "Practice. Analyze. Dominate.",
    Icon: Swords,
    championName: "Akali",
    splashPosition: "center 22%",
  },
  {
    to: "/lol/docs",
    title: "Mogzy Archives",
    subtitle: "Explore League knowledge.",
    Icon: FileText,
    championName: "Viktor",
    splashPosition: "center 18%",
  },
  {
    to: "/lol/patch-reports",
    title: "Patch Reports",
    subtitle: "Track every gameplay change.",
    Icon: Newspaper,
    championName: "Jayce",
    splashPosition: "center 20%",
  },
];
// Mobile list order follows the desktop grid row-major (by priority), not
// column-major: Leaguecraft, Combat Lab, Stat Check, Archives, History, Patch.
const ALL_DESTINATIONS = LEFT_DESTINATIONS.flatMap((d, i) => {
  const right = RIGHT_DESTINATIONS[i];
  return right ? [d, right] : [d];
});

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

  const onDestinationClick = (to: string) => {
    playUiSfx("sectionOpen");
    if (to === "/quiz") {
      trackFunnelEvent("lol_start_quiz_clicked", { cta: "hub_book" });
    }
  };

  const renderBook = (d: HubDestination) => (
    // Width is additionally capped against viewport height so three book rows
    // always fit above the fold: a card's visible height ≈ width × 0.507
    // (3:2 canvas minus the frame's reclaimed transparent padding), and
    // ~350px of the viewport goes to navbar + heading + paddings + gaps.
    <div
      key={d.to}
      className="mx-auto w-full"
      style={{ maxWidth: "min(100%, calc((100dvh - 350px) * 0.64))" }}
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

        <div className="relative z-10 flex w-full flex-1 flex-col px-4 md:px-6 lg:px-10 xl:px-14 pt-3 md:pt-4 pb-6 md:pb-4">
          {/* Anonymous sign-up nudge banner */}
          {isAnonymous && !nudgeDismissed && (
            <div className="relative mx-auto mb-3 flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[#c9a84c]/30 bg-[#0a1020]/70 backdrop-blur-sm py-2 pl-3 pr-10 sm:px-4 sm:py-2.5 text-sm">
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
                className="shrink-0 inline-flex min-h-[32px] sm:min-h-[40px] items-center rounded-md bg-[#c9a84c]/20 px-2.5 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-[#f0d78c] hover:bg-[#c9a84c]/30 transition-colors"
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
            <p className="mt-2 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.34em] text-[#c9a84c]/90">
              Welcome back, Summoner
            </p>
            <p className="mt-1 text-xs md:text-sm text-[#cfc4a5]/85">
              Chart your path. Sharpen your edge.
            </p>
          </header>

          {/* Desktop: six open books flanking Mogzy's central lane */}
          <div className="mt-2 hidden min-h-0 flex-1 md:grid grid-cols-[1fr_minmax(220px,0.62fr)_1fr] items-center gap-x-2 lg:gap-x-4">
            <div className="flex min-h-0 flex-col justify-center gap-y-[clamp(4px,1.6vh,26px)]">
              {LEFT_DESTINATIONS.map(renderBook)}
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

            <div className="flex min-h-0 flex-col justify-center gap-y-[clamp(4px,1.6vh,26px)]">
              {RIGHT_DESTINATIONS.map(renderBook)}
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
