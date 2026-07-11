import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search, Users } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChampionAssets, getChampionIcon } from "@/hooks/useChampionAssets";
import { useChampionBaseStats } from "@/hooks/useChampionBaseStats";
import { championSlug } from "@/lib/league-docs/api";

const GOLD = "#c9a84c";

export default function LeagueDocsChampionIndex() {
  const [query, setQuery] = useState("");
  const { data: champions, isLoading, isError, refetch, isRefetching } = useChampionBaseStats();
  const { data: assets } = useChampionAssets();

  const filtered = useMemo(() => {
    const rows = (champions ?? []).slice().sort((a, b) => a.champion_name.localeCompare(b.champion_name));
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => c.champion_name.toLowerCase().includes(q));
  }, [champions, query]);

  return (
    <div>
      <SEOHead
        title="Champions — League Docs | Mogsy"
        description="Alphabetical index of every League of Legends champion with base stats and per-level growth. Search and open any champion's reference page."
        path="/lol/docs/champions"
        keywords="league of legends champions list, lol champion base stats, champion index"
      />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Link
          to="/lol/docs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-[#c9a84c] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> League Docs
        </Link>

        {/* Header */}
        <div className="mt-3 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[#c9a84c]/40 bg-black/40 p-3">
              <Users className="h-6 w-6" style={{ color: GOLD }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
                League Docs · Champions
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Champion Index</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">
                Every champion, alphabetically. Open one for base stats, per-level growth, and
                level projections.
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 rounded-xl border border-border bg-card/60 p-3 sticky top-14 z-10 backdrop-blur">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search champions…"
              className="pl-9 bg-black/40 border-[#c9a84c]/20 focus-visible:ring-[#c9a84c]/40"
              aria-label="Search champions"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-3 min-[420px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card/40 p-2 animate-pulse">
                  <div className="w-full aspect-square rounded bg-black/40" />
                  <div className="mt-1.5 h-3 rounded bg-black/40" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Couldn't load champion data. Check your connection and try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
              No champion matches “{query.trim()}”.
            </div>
          ) : (
            <>
              <div className="mb-2 text-[11px] text-muted-foreground">
                {filtered.length} champion{filtered.length === 1 ? "" : "s"}
              </div>
              <div className="grid grid-cols-3 min-[420px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                {filtered.map((c) => {
                  const icon = getChampionIcon(assets, c.champion_name);
                  return (
                    <Link
                      key={c.champion_name}
                      to={`/lol/docs/champions/${championSlug(c.champion_name)}`}
                      className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card/40 p-2 hover:border-[#c9a84c]/50 transition-colors"
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
                      <span className="w-full truncate text-center text-[11px] font-semibold text-foreground/90 group-hover:text-[#c9a84c] transition-colors">
                        {c.champion_name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
