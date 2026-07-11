import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  CalendarRange,
  Database,
  Info,
  RefreshCw,
  Search,
  Swords,
  Users,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProChampions } from "@/hooks/useProChampions";
import { useChampionAssets, getChampionIcon } from "@/hooks/useChampionAssets";
import type { ProChampionIndexEntry } from "@/lib/league-docs/api";

const GOLD = "#c9a84c";

const nf = new Intl.NumberFormat("en-US");

/** Total imported rows for a champion: every imported row is a pick or ban event. */
function totalRows(c: ProChampionIndexEntry): number {
  return (c.pick_rows || 0) + (c.ban_rows || 0);
}

function yearSpan(c: ProChampionIndexEntry): string {
  if (c.first_year === null || c.last_year === null) return "—";
  return c.first_year === c.last_year ? String(c.first_year) : `${c.first_year}–${c.last_year}`;
}

type SortKey = "rows" | "picks" | "bans" | "name" | "years" | "latest" | "earliest";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "rows", label: "Most rows" },
  { key: "picks", label: "Most pick rows" },
  { key: "bans", label: "Most ban rows" },
  { key: "name", label: "Champion name" },
  { key: "years", label: "Most years" },
  { key: "latest", label: "Latest year" },
  { key: "earliest", label: "Earliest year" },
];

const SORTERS: Record<SortKey, (a: ProChampionIndexEntry, b: ProChampionIndexEntry) => number> = {
  rows: (a, b) => totalRows(b) - totalRows(a),
  picks: (a, b) => b.pick_rows - a.pick_rows,
  bans: (a, b) => b.ban_rows - a.ban_rows,
  name: (a, b) => a.champion.localeCompare(b.champion),
  years: (a, b) => b.years_with_data - a.years_with_data,
  latest: (a, b) => (b.last_year ?? 0) - (a.last_year ?? 0),
  earliest: (a, b) => (a.first_year ?? 9999) - (b.first_year ?? 9999),
};

function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((o) => o.key === value);
}

export default function LeagueDocsProChampionIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const sortParam = searchParams.get("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "rows";

  // isPending (no data yet), not isLoading (pending AND fetching): a query
  // paused before its first result must show the skeleton, not "empty dataset".
  const { data, isPending, isError, refetch, isRefetching } = useProChampions();
  const { data: assets } = useChampionAssets();

  const setParam = (key: string, value: string, defaultValue: string) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== defaultValue) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const champions = useMemo(() => data?.champions ?? [], [data]);

  const summary = useMemo(() => {
    const pickRows = champions.reduce((s, c) => s + (c.pick_rows || 0), 0);
    const banRows = champions.reduce((s, c) => s + (c.ban_rows || 0), 0);
    const firstYears = champions.map((c) => c.first_year).filter((y): y is number => y !== null);
    const lastYears = champions.map((c) => c.last_year).filter((y): y is number => y !== null);
    return {
      champions: champions.length,
      pickRows,
      banRows,
      totalRows: pickRows + banRows,
      earliestYear: firstYears.length ? Math.min(...firstYears) : null,
      latestYear: lastYears.length ? Math.max(...lastYears) : null,
    };
  }, [champions]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? champions.filter((c) => c.champion.toLowerCase().includes(q) || c.slug.includes(q))
      : champions;
    // Stable secondary order by name so equal counts don't shuffle between sorts.
    return filtered
      .slice()
      .sort((a, b) => SORTERS[sort](a, b) || a.champion.localeCompare(b.champion));
  }, [champions, query, sort]);

  return (
    <div>
      <SEOHead
        title="Pro Data by Champion — League Docs | Mogsy"
        description="Browse which League of Legends champions have imported professional esports data in Mogsy: year spans, pick rows, and ban rows per champion."
        path="/lol/docs/pro/champions"
        keywords="lol esports champion stats, league pro play by champion, champion pick ban data"
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Link to="/lol/docs" className="hover:text-[#c9a84c] transition-colors inline-flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> League Docs
          </Link>
          <span aria-hidden>/</span>
          <Link to="/lol/docs/pro" className="hover:text-[#c9a84c] transition-colors">Pro Data</Link>
          <span aria-hidden>/</span>
          <span className="text-foreground/80">Champions</span>
        </nav>

        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[#c9a84c]/40 bg-black/40 p-3">
              <Users className="h-6 w-6" style={{ color: GOLD }} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
                League Docs · Pro Data
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Pro Data by Champion</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">
                Imported professional League/esports coverage grouped by champion: which champions
                have data, across which years, and how many pick and ban rows each one has. Counts
                reflect what's in Mogsy's database — not a claim that every historical match is
                represented.
              </p>
            </div>
          </div>
        </div>

        {isPending ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading champion pro data index">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[84px] rounded-xl border border-border bg-card/40 animate-pulse" />
              ))}
            </div>
            <div className="h-[420px] rounded-xl border border-border bg-card/40 animate-pulse" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn't load champion pro data. Check your connection and try again.
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
        ) : champions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No champions have imported pro data yet — they'll appear here as the esports import runs.
          </div>
        ) : (
          <>
            {/* Summary */}
            <section aria-label="Dataset summary">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <SummaryCard label="Champions with data" value={String(summary.champions)} Icon={Users} />
                <SummaryCard label="Imported rows" value={nf.format(summary.totalRows)} Icon={Database} />
                <SummaryCard label="Pick rows" value={nf.format(summary.pickRows)} Icon={Swords} />
                <SummaryCard label="Ban rows" value={nf.format(summary.banRows)} Icon={Ban} />
                <SummaryCard
                  label="Years represented"
                  value={
                    summary.earliestYear !== null && summary.latestYear !== null
                      ? `${summary.earliestYear}–${summary.latestYear}`
                      : "—"
                  }
                  Icon={CalendarRange}
                />
              </div>
            </section>

            {/* Search + sort */}
            <div className="rounded-xl border border-border bg-card/60 p-3 sticky top-14 z-10 backdrop-blur">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    value={query}
                    onChange={(e) => setParam("q", e.target.value, "")}
                    placeholder="Search champions…"
                    aria-label="Search champions with pro data"
                    className="pl-9 bg-black/40 border-[#c9a84c]/20 focus-visible:ring-[#c9a84c]/40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="pro-champion-sort"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                  >
                    Sort by
                  </label>
                  <select
                    id="pro-champion-sort"
                    value={sort}
                    onChange={(e) => setParam("sort", e.target.value, "rows")}
                    className="h-9 rounded-md border border-[#c9a84c]/20 bg-black/40 px-2 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/40"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Results */}
            {results.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
                No champion with imported pro data matches “{query.trim()}”.
              </div>
            ) : (
              <section aria-label="Champions with imported pro data">
                <div className="mb-2 text-[11px] text-muted-foreground">
                  {results.length} champion{results.length === 1 ? "" : "s"} with imported rows
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card/60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th scope="col" className="px-4 py-2.5 font-bold">Champion</th>
                        <th scope="col" className="px-3 py-2.5 font-bold text-right">Years span</th>
                        <th scope="col" className="px-3 py-2.5 font-bold text-right" title="Distinct years with imported rows">
                          Years with data
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-bold text-right">Pick rows</th>
                        <th scope="col" className="px-3 py-2.5 font-bold text-right">Ban rows</th>
                        <th scope="col" className="px-3 py-2.5 font-bold text-right">Total rows</th>
                        <th scope="col" className="px-4 py-2.5 font-bold text-right">
                          <span className="sr-only">Details</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((c) => {
                        const icon = getChampionIcon(assets, c.champion);
                        return (
                          <tr key={c.slug} className="border-b border-border/60 last:border-0 hover:bg-[#c9a84c]/5 transition-colors">
                            <td className="px-4 py-2">
                              <span className="flex items-center gap-2.5 min-w-0">
                                {icon ? (
                                  <img src={icon} alt="" loading="lazy" className="h-7 w-7 rounded border border-[#c9a84c]/30 object-cover shrink-0" />
                                ) : (
                                  <span className="h-7 w-7 rounded border border-border bg-black/40 shrink-0" />
                                )}
                                <span className="truncate font-semibold text-foreground">{c.champion}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{yearSpan(c)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.years_with_data}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{nf.format(c.pick_rows)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{nf.format(c.ban_rows)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                              {nf.format(totalRows(c))}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Link
                                to={`/lol/docs/pro/champions/${c.slug}`}
                                aria-label={`View ${c.champion} pro data details`}
                                className="inline-flex items-center gap-1 rounded border border-[#c9a84c]/40 bg-black/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#c9a84c] hover:bg-[#c9a84c]/10 transition-colors whitespace-nowrap"
                              >
                                View details
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2.5">
                  {results.map((c) => {
                    const icon = getChampionIcon(assets, c.champion);
                    return (
                      <div key={c.slug} className="rounded-xl border border-border bg-card/60 p-3.5">
                        <div className="flex items-center gap-2.5">
                          {icon ? (
                            <img src={icon} alt="" loading="lazy" className="h-9 w-9 rounded border border-[#c9a84c]/30 object-cover shrink-0" />
                          ) : (
                            <span className="h-9 w-9 rounded border border-border bg-black/40 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-foreground">{c.champion}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {yearSpan(c)} · {c.years_with_data} year{c.years_with_data === 1 ? "" : "s"} with data
                            </div>
                          </div>
                        </div>
                        <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                          <MobileStat label="Picks" value={nf.format(c.pick_rows)} />
                          <MobileStat label="Bans" value={nf.format(c.ban_rows)} />
                          <MobileStat label="Total" value={nf.format(totalRows(c))} />
                        </dl>
                        <Link
                          to={`/lol/docs/pro/champions/${c.slug}`}
                          aria-label={`View ${c.champion} pro data details`}
                          className="mt-2.5 flex items-center justify-center rounded-md border border-[#c9a84c]/40 bg-black/30 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#c9a84c] hover:bg-[#c9a84c]/10 transition-colors"
                        >
                          View details
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Coverage framing */}
            <section>
              <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden />
                  <p className="text-xs text-muted-foreground">
                    Champions appear here only once imported pro-data rows exist for them, and year
                    spans may be sparse rather than continuous — a 2011–2026 span doesn't mean every
                    year in between has data yet.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden />
                  <p className="text-xs text-muted-foreground">
                    The historical import is still in progress, so counts grow over time — this is a
                    view of database coverage, not a measure of champion strength or competitive
                    standing. See{" "}
                    <Link to="/lol/docs/pro" className="font-semibold text-[#c9a84c] hover:underline">
                      coverage by year
                    </Link>{" "}
                    for which years are complete.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, Icon }: { label: string; value: string; Icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-black/30 px-2 py-1.5">
      <dt className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{label}</dt>
      <dd className="text-xs font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
