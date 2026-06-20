import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Swords, Flame, Newspaper, ArrowRight, Trophy, BrainCircuit, FileText } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import BlogPostCard from "@/components/blog/BlogPostCard";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import lolIcon from "@/assets/lol-icon.png";
import HexZipperCard, { type HexZipperSide, type HexPopoutStyle } from "@/components/lol/HexZipperCard";
import { useChampionAssets, getChampionCutout, getChampionSplash } from "@/hooks/useChampionAssets";
import LolPopoutStyleToggle from "@/components/lol/LolPopoutStyleToggle";
import { supabase } from "@/integrations/supabase/client";

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
const ZIPPER_FEATURES: ZipperFeature[] = [
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

export default function LolHub() {
  const { data: posts = [], isLoading } = useBlogList({ limit: 24, tag: LOL_TAG });
  const { data: championAssets } = useChampionAssets();
  const [popoutStyle, setPopoutStyle] = useState<HexPopoutStyle>("splash");

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
      <SEOHead
        title="Mogsy League of Legends — Rankings, News & Combat Lab"
        description="The League of Legends hub on Mogsy. Rank champions, simulate fights in the Combat Lab, and read the latest LoL news and tier lists."
        path="/lol"
        keywords="league of legends, lol tier list, lol champions, combat lab, lol news, mogsy"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Mogsy League of Legends Hub",
            url: `${SITE_URL}/lol`,
          },
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-10">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <img src={lolIcon} alt="" aria-hidden className="absolute -right-10 -top-10 w-80 h-80 object-contain blur-2xl" />
          </div>
          <div className="relative flex items-center gap-4">
            <img src={lolIcon} alt="League of Legends" className="h-16 w-16 md:h-20 md:w-20 rounded-xl shadow-lg" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#c9a84c] font-bold">Mogsy x LoL</div>
              <h1 className="text-2xl md:text-4xl font-bold text-foreground">League of Legends Hub</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-xl">
                Rank champions, run matchups in the Combat Lab, and catch up on the latest LoL drops.
              </p>
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
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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