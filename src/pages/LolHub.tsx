import { Link } from "react-router-dom";
import { Swords, Flame, Newspaper, ArrowRight, Trophy, BrainCircuit } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import BlogPostCard from "@/components/blog/BlogPostCard";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import lolIcon from "@/assets/lol-icon.png";

const LOL_TAG = "League of Legends";

export default function LolHub() {
  const { data: posts = [], isLoading } = useBlogList({ limit: 24, tag: LOL_TAG });

  return (
    <div className="min-h-dvh bg-background">
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
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428] via-[#091428] to-[#0a0a1a] p-6 md:p-10">
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

        {/* Action tiles */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <HubTile
            to="/combat-lab"
            title="Combat Lab"
            description="Simulate champion matchups, theorycraft builds and run damage tests."
            Icon={Swords}
            accent="from-[#1e3a5f] to-[#0a1428]"
          />
          <HubTile
            to="/swipe"
            title="Swipe LoL Champions"
            description="Tap into the swipe game and rank League of Legends content head-to-head."
            Icon={Flame}
            accent="from-[#5c2018] to-[#0a0a1a]"
          />
          <HubTile
            to="/lol/tier-list"
            title="LoL Tier List"
            description="Meta rankings for every role this patch — Top, Jungle, Mid, ADC and Support."
            Icon={Trophy}
            accent="from-[#3a2d10] to-[#0a0a1a]"
          />
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
      className={`group relative overflow-hidden rounded-xl border border-border bg-gradient-to-br ${accent} p-5 hover:border-primary/50 transition-all hover:scale-[1.01]`}
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