import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Swords, Flame, Newspaper, ArrowRight, Trophy, BrainCircuit, FileText, X } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL, LEAGUE_ONLY_MODE } from "@/lib/site-config";
import BlogPostCard from "@/components/blog/BlogPostCard";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import lolIcon from "@/assets/lol-icon.png";
import HexZipperCard, { type HexZipperSide, type HexPopoutStyle } from "@/components/lol/HexZipperCard";
import { useChampionAssets, getChampionCutout, getChampionSplash, getChampionLoading } from "@/hooks/useChampionAssets";
import LolPopoutStyleToggle from "@/components/lol/LolPopoutStyleToggle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markHubVisited } from "@/lib/quiz/onboarding-gate";
import LolWelcomeIntro, { hasSeenLolWelcome } from "@/components/lol/LolWelcomeIntro";

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
    to: "/lol/tier-list",
    title: "LoL Tier List",
    description: "Meta rankings for Top, Jungle, Mid, ADC and Support this patch.",
    Icon: Trophy,
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
    to: "/lol/docs",
    title: "League Docs",
    description: "Searchable, timestamped log of every change to LoL pages.",
    Icon: FileText,
    side: "right",
    championName: "Viktor",
    cutoutOffsetPct: -2,
  },
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
        title="Mogsy LoL Quiz | League of Legends Trivia and Training"
        description="Play League of Legends quizzes about champions, items, abilities, builds, objectives, patch knowledge, and esports history. Test damage in the Combat Lab. Start playing without an account."
        path="/lol"
        keywords="league of legends quiz, lol quiz, league trivia, champion quiz, item quiz, ability quiz, esports trivia, league learning game, league of legends training tool, combat lab, lol tier list"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Mogsy LoL Quiz",
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
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/8 px-4 py-2.5 text-sm">
            <span className="flex-1 min-w-[12rem] text-[#f5e9c8]/90">
              Sign up to save your XP, streaks, and progress across Mogsy League.
            </span>
            <button
              onClick={() => navigate("/auth?mode=signup&returnTo=/lol")}
              className="shrink-0 inline-flex min-h-[40px] items-center rounded-md bg-[#c9a84c]/20 px-3 py-2 text-sm font-semibold text-[#f0d78c] hover:bg-[#c9a84c]/30 transition-colors"
            >
              Sign up free
            </button>
            <button
              onClick={() => setNudgeDismissed(true)}
              className="shrink-0 -m-1 p-2.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-10">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <img src={lolIcon} alt="" aria-hidden className="absolute -right-10 -top-10 w-80 h-80 object-contain blur-2xl" />
          </div>
          <div className="relative flex items-center gap-4">
            <img src={lolIcon} alt="League of Legends" className="h-16 w-16 md:h-20 md:w-20 rounded-xl shadow-lg" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#c9a84c] font-bold">Mogsy x LoL</div>
              <h1 className="text-2xl md:text-4xl font-bold text-foreground">League of Legends Quiz &amp; Training</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-xl">
                Mogsy is a League of Legends learning game. Play LoL quizzes about champions, items,
                abilities, builds, objectives, patch changes and esports history — one question at a
                time — and test damage math in the Combat Lab simulator.
              </p>
              <button
                onClick={() => navigate("/quiz")}
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#c9a84c] to-[#a8862f] px-4 py-2.5 text-sm font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f] transition-colors"
              >
                Start Quiz — No Account Needed
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Hextech Zipper — desktop only */}
        <div className="mt-12 hidden md:flex flex-col gap-8 relative">
          {ZIPPER_FEATURES.map((f, i) => {
            const widthCls = f.flagship ? "w-[78%]" : "w-[72%]";
            const alignCls = f.side === "right" ? "self-end" : "self-start";
            // Slight negative margin from card #2 onward for the zipper overlap.
            const stagger = i === 0 ? "" : "-mt-4";
            return (
              <div key={f.to} className={`${widthCls} ${alignCls} ${stagger}`}>
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

        {/* Mobile fallback — keep existing simple stacked tiles */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:hidden">
          {ZIPPER_FEATURES.map((f) => (
            <HubTile
              key={f.to}
              to={f.to}
              title={f.title}
              description={f.description}
              Icon={f.Icon}
              accent="from-[#1e3a5f]/90 to-[#0a1428]/90"
            />
          ))}
        </div>

        {/* News / Blog */}
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
          ) : posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              No League of Legends posts yet. Check back soon for patch breakdowns, tier lists and drama recaps.
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {posts.map((p) => (
                <BlogPostCard key={p.id} post={p} size="sm" />
              ))}
            </div>
          )}
        </div>
      </div>
      <LolPopoutStyleToggle value={popoutStyle} onChange={setPopoutStyle} />
    </div>
  );
}

function HubTile({
  to,
  title,
  description,
  Icon,
  accent,
}: {
  to: string;
  title: string;
  description: string;
  Icon: React.ElementType;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-xl border border-border bg-gradient-to-br ${accent} backdrop-blur-sm p-5 hover:border-primary/50 transition-all hover:scale-[1.01]`}
    >
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-black/40 border border-white/10 p-3">
          <Icon className="h-6 w-6 text-[#c9a84c]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base md:text-lg font-bold text-foreground">{title}</h3>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </Link>
  );
}