import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Swords, Flame, Newspaper, ArrowRight, BrainCircuit, FileText, X, Zap, Heart, Brain, Coins, History as HistoryIcon } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL, LEAGUE_ONLY_MODE } from "@/lib/site-config";
import BlogPostCard from "@/components/blog/BlogPostCard";
import AdSlot from "@/components/ads/AdSlot";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import HexZipperCard, { type HexZipperSide, type HexPopoutStyle } from "@/components/lol/HexZipperCard";
import HexPanelLink from "@/components/lol/HexPanelLink";
import HexTrainingHero from "@/components/lol/HexTrainingHero";
import { useChampionAssets, getChampionCutout, getChampionSplash, getChampionLoading } from "@/hooks/useChampionAssets";
import LolPopoutStyleToggle from "@/components/lol/LolPopoutStyleToggle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markHubVisited } from "@/lib/quiz/onboarding-gate";
import LolWelcomeIntro, { hasSeenLolWelcome } from "@/components/lol/LolWelcomeIntro";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { playUiSfx } from "@/lib/ui-sfx";

const LOL_TAG = "League of Legends";

type ZipperFeature = {
  to: string;
  title: string;
  description: string;
  Icon: React.ElementType;
  side: HexZipperSide;
  championName: string;
  flagship?: boolean;
  /** Per-champion horizontal nudge (%) for cutout balance. */
  cutoutOffsetPct?: number;
};

// Easy to reorder / re-map champions later.
const ALL_ZIPPER_FEATURES: ZipperFeature[] = [
  {
    to: "/combat-lab",
    title: "Combat Lab",
    description: "Simulate matchups, theorycraft builds, and run damage tests.",
    Icon: Swords,
    side: "right",
    championName: "Akali",
    flagship: true,
    cutoutOffsetPct: -4,
  },
  {
    to: "/quiz",
    title: "League Quiz",
    description: "Champion trivia, mechanics, items — prove your knowledge.",
    Icon: BrainCircuit,
    side: "left",
    championName: "Ryze",
    cutoutOffsetPct: -2,
  },
  {
    to: "/league-swipe",
    title: "League Swipe",
    description: "Quick head-to-head duels — vote favorites, guess stats and item costs.",
    Icon: Zap,
    side: "right",
    championName: "Jinx",
    cutoutOffsetPct: 0,
  },
  {
    to: "/swipe",
    title: "Swipe Champions",
    description: "Tap in and rank League of Legends champions head-to-head.",
    Icon: Flame,
    side: "left",
    championName: "Draven",
    cutoutOffsetPct: 2,
  },
  {
    to: "/lol/history",
    title: "Quiz History",
    description: "Review your recent quiz results — scores, accuracy, and pace.",
    Icon: HistoryIcon,
    side: "left",
    championName: "Zilean",
    cutoutOffsetPct: 0,
  },
  {
    to: "/lol/docs",
    title: "League Docs",
    description: "Browse champion stats, items, mechanics, and patch knowledge.",
    Icon: FileText,
    side: "right",
    championName: "Viktor",
    cutoutOffsetPct: -2,
  },
];

// League Swipe MVP games surfaced on the hub (see /league-swipe).
const SWIPE_GAME_CARDS = [
  { slug: "favorite-champion", title: "Favorite Champion", description: "Choose your favorites and shape the community ranking.", Icon: Heart },
  { slug: "most-annoying-champion", title: "Most Annoying Champion", description: "Vote on League's most tilting champions.", Icon: Flame },
  { slug: "higher-base-stat", title: "Stat Duel", description: "Guess which champion has the higher stat.", Icon: Brain },
  { slug: "item-cost-duel", title: "Item Cost Duel", description: "Learn item costs through quick comparisons.", Icon: Coins },
];

// The general swipe hub is hidden while the site is League-only.
const ZIPPER_FEATURES = LEAGUE_ONLY_MODE
  ? ALL_ZIPPER_FEATURES.filter((f) => f.to !== "/swipe").map((f, i) => ({
      ...f,
      // Re-alternate sides so the zipper stays zig-zagged after filtering.
      side: (i % 2 === 0 ? "right" : "left") as HexZipperSide,
    }))
  : ALL_ZIPPER_FEATURES;

export default function LolHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: posts = [], isLoading } = useBlogList({ limit: 24, tag: LOL_TAG });
  const { data: championAssets } = useChampionAssets();
  const [popoutStyle, setPopoutStyle] = useState<HexPopoutStyle>("splash");
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const isAnonymous = !user || user.is_anonymous === true;
  // First-visit guest welcome — decided once on mount so signing in
  // anonymously mid-session doesn't pop it up again.
  const [showWelcome] = useState(() => isAnonymous && !hasSeenLolWelcome());

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

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "lol_hub_popout_style")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const s = (data?.value as any)?.style;
        if (s === "cutout" || s === "splash" || s === "portrait") setPopoutStyle(s);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Anonymous sign-up nudge banner */}
        {isAnonymous && !nudgeDismissed && (
          <div className="relative mb-3 sm:mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/8 py-2 pl-3 pr-10 sm:px-4 sm:py-2.5 text-sm">
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

        {/* Hero — Hextech Training Chamber */}
        <HexTrainingHero
          assets={championAssets}
          onStartQuiz={() => trackFunnelEvent("lol_start_quiz_clicked", { cta: "hero" })}
        />

        {/* Hextech Zipper — desktop only */}
        <div className="mt-10 hidden md:flex flex-col gap-5 relative">
          {ZIPPER_FEATURES.map((f, i) => {
            const widthCls = f.flagship ? "w-[78%]" : "w-[72%]";
            const alignCls = f.side === "right" ? "self-end" : "self-start";
            // Slight negative margin from card #2 onward for the zipper overlap.
            const stagger = i === 0 ? "" : "-mt-4";
            return (
              <div key={f.to} className={`${widthCls} ${alignCls} ${stagger}`} onClick={() => playUiSfx("sectionOpen")}>
                <HexZipperCard
                  to={f.to}
                  title={f.title}
                  description={f.description}
                  Icon={f.Icon}
                  side={f.side}
                  cutoutUrl={
                    popoutStyle === "cutout"
                      ? getChampionCutout(championAssets, f.championName)
                      : popoutStyle === "portrait"
                      ? getChampionLoading(championAssets, f.championName)
                      : getChampionSplash(championAssets, f.championName)
                  }
                  flagship={f.flagship}
                  cutoutOffsetPct={f.cutoutOffsetPct}
                  popoutStyle={popoutStyle}
                />
              </div>
            );
          })}
        </div>

        {/* Mobile fallback — clipped Hextech panels matching the hero's visual language */}
        <div className="mt-5 grid grid-cols-1 gap-3 md:hidden">
          {ZIPPER_FEATURES.map((f) => (
            <HexPanelLink
              key={f.to}
              to={f.to}
              title={f.title}
              description={f.description}
              Icon={f.Icon}
              accent={f.flagship ? "gold" : "cyan"}
              onClick={() => playUiSfx("sectionOpen")}
            />
          ))}
        </div>

        <AdSlot placement="lol_hub_mid" className="mt-8" />

        {/* League Swipe Games */}
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
      <LolPopoutStyleToggle value={popoutStyle} onChange={setPopoutStyle} />
    </div>
  );
}