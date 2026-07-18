import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  FlaskConical,
  Library,
  Scale,
  ScrollText,
  Search as SearchIcon,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import { Input } from "@/components/ui/input";
import { useChampionAssets, getChampionIcon } from "@/hooks/useChampionAssets";
import { useChampionBaseStats } from "@/hooks/useChampionBaseStats";
import { championSlug } from "@/lib/league-docs/api";

const GOLD = "#c9a84c";

type Category = {
  title: string;
  description: string;
  Icon: React.ElementType;
  to?: string;
};

const CATEGORIES: Category[] = [
  {
    title: "Glossary",
    description: "Precise definitions for every mechanical term: raw vs post-mitigation damage, lethal damage, ability haste, penetration, and more.",
    Icon: Library,
    to: "/lol/glossary",
  },
  {
    title: "Champions",
    description: "Base stats, per-level growth, and level projections for every champion.",
    Icon: Users,
    to: "/lol/docs/champions",
  },
  {
    title: "Items",
    description: "Costs, stats, build paths, and gold efficiency.",
    Icon: Swords,
  },
  {
    title: "Mechanics",
    description: "Armor, penetration, ability haste, on-hit effects, and more.",
    Icon: BookOpen,
  },
  {
    title: "Pro Data",
    description: "Esports data coverage: what pro-play data Mogzy has imported, year by year.",
    Icon: Trophy,
    to: "/lol/docs/pro",
  },
  {
    title: "Patch Changes",
    description: "Structured before-and-after values for every tracked change.",
    Icon: ScrollText,
  },
  {
    title: "Compare",
    description: "Champions and items side by side.",
    Icon: Scale,
  },
];

export default function LeagueDocsLanding() {
  const [query, setQuery] = useState("");
  const { data: champions, isLoading } = useChampionBaseStats();
  const { data: assets } = useChampionAssets();

  const sorted = useMemo(
    () => (champions ?? []).slice().sort((a, b) => a.champion_name.localeCompare(b.champion_name)),
    [champions],
  );
  const featured = sorted.slice(0, 12);
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return sorted.filter((c) => c.champion_name.toLowerCase().includes(q)).slice(0, 8);
  }, [sorted, query]);

  return (
    <div>
      <SEOHead
        title="League Docs — League of Legends Knowledge Base | Mogzy"
        description="Browse structured League of Legends reference data: champion base stats and growth, items, mechanics, and patch changes. Every page shows its data patch and source."
        path="/lol/docs"
        keywords="league of legends wiki, lol champion stats, champion base stats, lol knowledge base, league docs"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "League Docs — Mogzy",
          url: `${SITE_URL}/lol/docs`,
          description:
            "Structured League of Legends knowledge base: champions, items, mechanics, and patch changes.",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Hero + search */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-10">
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
            Mogzy x LoL · Knowledge Base
          </div>
          <h1 className="mt-1 text-3xl md:text-4xl font-bold text-foreground">League Docs</h1>
          <p className="mt-1 text-sm md:text-base font-semibold" style={{ color: GOLD }}>
            League of Legends Knowledge Base
          </p>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
            Browse structured League information — champion stats and growth, items, mechanics, and
            patch changes. No quiz or simulation required: look things up first, interact when useful.
          </p>

          <div className="mt-5 max-w-xl">
            <div className="rounded-xl border border-[#c9a84c]/30 bg-black/50 backdrop-blur">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search champions…"
                  aria-label="Search champions"
                  className="pl-9 border-0 bg-transparent focus-visible:ring-[#c9a84c]/40"
                />
              </div>
              {query.trim() && (
                <div className="max-h-[300px] overflow-y-auto border-t border-[#c9a84c]/20 p-1">
                  {searchResults.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {isLoading ? "Loading champions…" : "No champion matches that search."}
                    </p>
                  ) : (
                    searchResults.map((c) => {
                      const icon = getChampionIcon(assets, c.champion_name);
                      return (
                        <Link
                          key={c.champion_name}
                          to={`/lol/docs/champions/${championSlug(c.champion_name)}`}
                          className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-[#c9a84c]/10 transition-colors"
                        >
                          {icon ? (
                            <img
                              src={icon}
                              alt=""
                              loading="lazy"
                              className="h-7 w-7 rounded border border-[#c9a84c]/30 object-cover"
                            />
                          ) : (
                            <span className="h-7 w-7 rounded border border-border bg-black/40" />
                          )}
                          <span className="font-semibold text-foreground">{c.champion_name}</span>
                          <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Champion search for now — items, mechanics, and patches join as those sections open.
            </p>
          </div>
        </div>

        {/* Browse categories */}
        <section>
          <SectionHeading label="Browse" title="Explore the library" />
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATEGORIES.map((cat) =>
              cat.to ? (
                <Link
                  key={cat.title}
                  to={cat.to}
                  className="group rounded-xl border border-border bg-gradient-to-br from-[#1e3a5f]/60 to-[#0a1428]/90 backdrop-blur-sm p-4 hover:border-[#c9a84c]/50 transition-all hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="rounded-lg bg-black/40 border border-white/10 p-2">
                      <cat.Icon className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <h3 className="text-sm font-bold text-foreground flex-1">{cat.title}</h3>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-[#c9a84c] transition-all" />
                  </div>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </Link>
              ) : (
                <div
                  key={cat.title}
                  className="rounded-xl border border-border/60 bg-card/30 p-4 opacity-70"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="rounded-lg bg-black/40 border border-white/10 p-2">
                      <cat.Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground flex-1">{cat.title}</h3>
                    <span className="rounded-md border border-[#c9a84c]/30 bg-[#c9a84c]/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#c9a84c]">
                      Soon
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </div>
              ),
            )}
          </div>
        </section>

        {/* Champion discovery */}
        <section>
          <div className="flex items-end justify-between mb-3">
            <SectionHeading label="Champions" title="Start with a champion" className="mb-0" />
            <Link
              to="/lol/docs/champions"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 py-2 -my-2"
            >
              Browse all champions <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg border border-border bg-card/40 animate-pulse" />
              ))}
            </div>
          ) : featured.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
              {featured.map((c) => {
                const icon = getChampionIcon(assets, c.champion_name);
                return (
                  <Link
                    key={c.champion_name}
                    to={`/lol/docs/champions/${championSlug(c.champion_name)}`}
                    className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card/40 p-2 hover:border-[#c9a84c]/50 transition-colors"
                    title={c.champion_name}
                  >
                    {icon ? (
                      <img
                        src={icon}
                        alt={c.champion_name}
                        loading="lazy"
                        className="w-full aspect-square rounded border border-[#c9a84c]/20 object-cover"
                      />
                    ) : (
                      <span className="w-full aspect-square rounded border border-border bg-black/40" />
                    )}
                    <span className="w-full truncate text-center text-[10px] font-semibold text-foreground/90 group-hover:text-[#c9a84c] transition-colors">
                      {c.champion_name}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
              Champion data is unavailable right now — try the full index instead.
            </div>
          )}
        </section>

        {/* Mogzy integrations + data trust */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="h-4 w-4" style={{ color: GOLD }} />
              <h2 className="text-sm font-bold text-foreground">Built to connect</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              League Docs is part of Mogzy, so reference pages will progressively link into the rest
              of the toolkit — quiz yourself on a champion you're reading about, or open a build in
              the damage simulator. Those contextual actions arrive section by section; in the
              meantime both tools are a click away.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/quiz"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a84c]/40 bg-black/40 px-2.5 py-1.5 text-xs font-semibold text-[#c9a84c] hover:border-[#c9a84c] hover:bg-[#c9a84c]/10 transition-colors"
              >
                <BrainCircuit className="h-3.5 w-3.5" /> League Quiz
              </Link>
              <Link
                to="/combat-lab"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a84c]/40 bg-black/40 px-2.5 py-1.5 text-xs font-semibold text-[#c9a84c] hover:border-[#c9a84c] hover:bg-[#c9a84c]/10 transition-colors"
              >
                <Swords className="h-3.5 w-3.5" /> Combat Lab
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4" style={{ color: GOLD }} />
              <h2 className="text-sm font-bold text-foreground">Data you can check</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Every League Docs data page states where its numbers come from: the data patch, the
              source, and when it was last updated or verified. Values come from Mogzy's structured
              League database and may lag the very latest patch — when a page can't state its patch
              yet, it says so instead of guessing.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeading({ label, title, className = "mb-3" }: { label: string; title: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: GOLD }}>
        {label}
      </div>
      <h2 className="text-lg md:text-xl font-bold text-foreground">{title}</h2>
    </div>
  );
}
