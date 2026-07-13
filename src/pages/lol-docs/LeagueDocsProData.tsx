import { lazy, Suspense, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Compass,
  Database,
  Hourglass,
  Info,
  LayoutList,
  Loader2,
  RefreshCw,
  Trophy,
  Users,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { useProCoverage } from "@/hooks/useProCoverage";
import type { ProCoverageStatus, ProYearSummary } from "@/lib/league-docs/api";

const ProExplorer = lazy(() => import("@/pages/lol-docs/pro-explorer/ProExplorer"));

type ProDataView = "overview" | "explorer";

const GOLD = "#c9a84c";

/**
 * Status presentation: readable text label + icon per status so meaning never
 * relies on color alone. Pending/no-data are neutral (waiting), not failures.
 */
const STATUS_CONFIG: Record<
  ProCoverageStatus,
  { label: string; hint: string; Icon: React.ElementType; className: string }
> = {
  complete: {
    label: "Complete",
    hint: "Every champion imported for this year's current coverage.",
    Icon: CheckCircle2,
    className: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  },
  in_progress: {
    label: "In progress",
    hint: "Import is running — stats may change as more champions are processed.",
    Icon: Loader2,
    className: "border-[#c9a84c]/40 bg-[#c9a84c]/10 text-[#c9a84c]",
  },
  pending: {
    label: "Waiting for import",
    hint: "Queued for the historical import — no data imported yet.",
    Icon: Hourglass,
    className: "border-border bg-card/60 text-muted-foreground",
  },
  partial: {
    label: "Partial",
    hint: "Some data exists but completeness isn't fully tracked yet.",
    Icon: CircleDashed,
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  no_data: {
    label: "No data",
    hint: "No imported games for this year.",
    Icon: CircleDashed,
    className: "border-border bg-card/40 text-muted-foreground",
  },
};

const SCOPE_LABELS: Record<string, string> = {
  "all-imported": "All imported",
  major: "Major leagues",
  international: "International",
};

const nf = new Intl.NumberFormat("en-US");

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // Stored as "YYYY-MM-DD HH:MM:SS" — the date part is enough here.
  const datePart = value.split(" ")[0];
  return datePart || null;
}

function StatusBadge({ status }: { status: ProCoverageStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.no_data;
  return (
    <span
      title={cfg.hint}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cfg.className}`}
    >
      <cfg.Icon className="h-3 w-3" aria-hidden />
      {cfg.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon: React.ElementType;
}) {
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

function ScopedStatsCell({ scopes }: { scopes: Record<string, number> }) {
  const names = Object.keys(scopes);
  if (names.length === 0) {
    return <span className="text-muted-foreground">Not built yet</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {names.sort().map((name) => (
        <span
          key={name}
          className="rounded border border-teal-500/30 bg-teal-500/5 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300"
        >
          {SCOPE_LABELS[name] ?? name}
        </span>
      ))}
    </span>
  );
}

function YearRows({ year }: { year: ProYearSummary }) {
  const patchNull =
    year.data.patch_null_pct === null ? "—" : `${year.data.patch_null_pct}%`;
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-[#c9a84c]/5 transition-colors">
      <td className="px-3 py-2.5">
        <Link
          to={`/lol/docs/pro/years/${year.year}`}
          className="font-bold text-foreground hover:text-[#c9a84c] underline decoration-[#c9a84c]/30 underline-offset-2 transition-colors"
        >
          {year.year}
        </Link>
      </td>
      <td className="px-3 py-2.5"><StatusBadge status={year.coverage_status} /></td>
      <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(year.data.game_rows)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(year.data.pick_rows)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(year.data.ban_rows)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{year.data.unique_champions}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{patchNull}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {year.jobs.failed > 0 ? (
          <span className="text-amber-300">{year.jobs.failed}</span>
        ) : (
          0
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(year.jobs.pending)}</td>
      <td className="px-3 py-2.5"><ScopedStatsCell scopes={year.scoped_stats} /></td>
    </tr>
  );
}

function YearCard({ year }: { year: ProYearSummary }) {
  const cfg = STATUS_CONFIG[year.coverage_status] ?? STATUS_CONFIG.no_data;
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/lol/docs/pro/years/${year.year}`}
          className="text-lg font-bold text-foreground hover:text-[#c9a84c] underline decoration-[#c9a84c]/30 underline-offset-2 transition-colors"
        >
          {year.year}
        </Link>
        <StatusBadge status={year.coverage_status} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{cfg.hint}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <CardStat label="Imported rows" value={nf.format(year.data.game_rows)} />
        <CardStat label="Champions" value={String(year.data.unique_champions)} />
        <CardStat label="Pick rows" value={nf.format(year.data.pick_rows)} />
        <CardStat label="Ban rows" value={nf.format(year.data.ban_rows)} />
        <CardStat
          label="Missing patch"
          value={year.data.patch_null_pct === null ? "—" : `${year.data.patch_null_pct}%`}
        />
        <CardStat label="Failed jobs" value={String(year.jobs.failed)} />
        <CardStat label="Pending jobs" value={nf.format(year.jobs.pending)} />
      </dl>
      <div className="mt-2.5 flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Scoped stats:</span>
        <ScopedStatsCell scopes={year.scoped_stats} />
      </div>
    </div>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export default function LeagueDocsProData() {
  // isPending, not isLoading: a query paused before its first result must
  // show the skeleton, not the "no data imported" empty state.
  const { data, isPending, isError, refetch, isRefetching } = useProCoverage();

  const [searchParams, setSearchParams] = useSearchParams();
  const view: ProDataView = searchParams.get("view") === "explorer" ? "explorer" : "overview";
  const setView = (next: ProDataView) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("view");
    else params.set("view", next);
    setSearchParams(params, { replace: true });
  };

  const years = useMemo(
    () => (data?.years ?? []).slice().sort((a, b) => b.year - a.year),
    [data],
  );

  const summary = useMemo(() => {
    const count = (status: ProCoverageStatus) =>
      years.filter((y) => y.coverage_status === status).length;
    const totalRows = years.reduce((sum, y) => sum + (y.data.game_rows || 0), 0);
    const latestMatch = years
      .map((y) => y.data.max_match_date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop();
    return {
      complete: count("complete"),
      inProgress: count("in_progress"),
      pending: count("pending"),
      totalRows,
      latestMatch: formatDate(latestMatch) ?? "Not available",
    };
  }, [years]);

  /** Backend-authored caveats, deduplicated across years, with year attribution. */
  const caveats = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const y of years) {
      for (const caveat of y.caveats ?? []) {
        map.set(caveat, [...(map.get(caveat) ?? []), y.year]);
      }
    }
    return [...map.entries()].map(([text, yrs]) => ({ text, years: yrs.sort() }));
  }, [years]);

  const detailYears = years.filter(
    (y) => y.coverage_status === "complete" || y.coverage_status === "in_progress",
  );

  return (
    <div>
      <SEOHead
        title="Pro Data — Esports Data Coverage — League Docs | Mogsy"
        description="See exactly what professional League of Legends esports data Mogsy has imported: coverage by year, champions with data, pick and ban rows, and known data caveats."
        path="/lol/docs/pro"
        keywords="league of legends esports data, lol pro play stats, esports data coverage, leaguepedia data"
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <Link
          to="/lol/docs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-[#c9a84c] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> League Docs
        </Link>

        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[#c9a84c]/40 bg-black/40 p-3">
              <Trophy className="h-6 w-6" style={{ color: GOLD }} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
                League Docs · Pro Data
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Pro Data</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">
                Mogsy's imported professional League dataset and its coverage, year by year. This
                page shows exactly what pro-play data exists here today — not a complete esports
                wiki. Historical years are being imported incrementally, and incomplete years are
                marked as such.
              </p>
            </div>
          </div>
        </div>

        {/* View switcher: Overview | Explorer (state lives in ?view=) */}
        <ViewSwitcher view={view} onSelect={setView} />

        {view === "explorer" ? (
          <Suspense
            fallback={<div className="h-[360px] rounded-xl border border-border bg-card/40 animate-pulse" />}
          >
            <ProExplorer />
          </Suspense>
        ) : isPending ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading pro data coverage">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[84px] rounded-xl border border-border bg-card/40 animate-pulse" />
              ))}
            </div>
            <div className="h-[360px] rounded-xl border border-border bg-card/40 animate-pulse" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn't load pro data coverage. Check your connection and try again.
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
        ) : years.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No pro data has been imported yet. Coverage will appear here as the esports import runs.
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <section aria-label="Coverage summary">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <SummaryCard label="Complete years" value={String(summary.complete)} Icon={CheckCircle2} />
                <SummaryCard label="In progress" value={String(summary.inProgress)} Icon={Loader2} />
                <SummaryCard label="Waiting for import" value={String(summary.pending)} Icon={Hourglass} />
                <SummaryCard label="Imported game rows" value={nf.format(summary.totalRows)} Icon={Database} />
                <SummaryCard label="Latest match" value={summary.latestMatch} Icon={CalendarClock} />
              </div>
            </section>

            {/* Coverage by year */}
            <section>
              <SectionHeading label="Coverage" title="Data by year" />
              <p className="mb-3 text-xs text-muted-foreground max-w-3xl">
                Each year reflects the current state of Mogsy's import queue.
                "Waiting for import" years are queued, not broken. "In progress"
                years will change as more champions are processed.
              </p>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card/60">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th scope="col" className="px-3 py-2.5 font-bold">Year</th>
                      <th scope="col" className="px-3 py-2.5 font-bold">Status</th>
                      <th scope="col" className="px-3 py-2.5 font-bold text-right">Rows</th>
                      <th scope="col" className="px-3 py-2.5 font-bold text-right">Picks</th>
                      <th scope="col" className="px-3 py-2.5 font-bold text-right">Bans</th>
                      <th scope="col" className="px-3 py-2.5 font-bold text-right">Champions</th>
                      <th scope="col" className="px-3 py-2.5 font-bold text-right" title="Percent of rows without a recorded patch">
                        No patch
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-bold text-right">Failed jobs</th>
                      <th scope="col" className="px-3 py-2.5 font-bold text-right">Pending jobs</th>
                      <th scope="col" className="px-3 py-2.5 font-bold">Scoped stats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((y) => (
                      <YearRows key={y.year} year={y} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {years.map((y) => (
                  <YearCard key={y.year} year={y} />
                ))}
              </div>
            </section>

            {/* Year detail CTAs */}
            <section>
              <SectionHeading label="Details" title="Year deep dives" />
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="text-xs text-muted-foreground">
                  Per-year detail pages show top picks, top bans, presence leaders, and each year's
                  data-quality caveats. Any year in the table above is browsable.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {detailYears.map((y) => (
                    <Button
                      key={y.year}
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
                    >
                      <Link to={`/lol/docs/pro/years/${y.year}`}>View {y.year} details</Link>
                    </Button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
                  >
                    <Link to="/lol/docs/pro/champions">Browse champions</Link>
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    See which champions have imported pro data. Per-champion detail pages arrive
                    after that.
                  </p>
                </div>
              </div>
            </section>

            {/* Scope definitions */}
            <section>
              <SectionHeading label="Scopes" title="How stats are scoped" />
              <p className="mb-3 text-xs text-muted-foreground max-w-3xl">
                Aggregated stats are computed per scope so numbers always say what they cover. These
                definitions come straight from the data pipeline:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(data?.scope_definitions ?? {}).map(([name, definition]) => (
                  <div key={name} className="rounded-xl border border-border bg-card/60 p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Users className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden />
                      <h3 className="text-sm font-bold text-foreground">
                        {SCOPE_LABELS[name] ?? name}
                      </h3>
                      <span className="font-mono text-[10px] text-muted-foreground">{name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{definition}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Data quality & caveats */}
            <section>
              <SectionHeading label="Trust" title="Data quality and caveats" />
              <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden />
                  <p className="text-xs text-muted-foreground">
                    This page shows what Mogsy has imported — coverage of the import, not a claim
                    that every historical pro match ever played is represented. Years marked
                    "waiting for import" are queued and will fill in over time.
                  </p>
                </div>
                {caveats.map(({ text, years: yrs }) => (
                  <div key={text} className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-300" aria-hidden />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground/80">
                        {yrs.length > 3 ? `${yrs[0]}–${yrs[yrs.length - 1]}` : yrs.join(", ")}:
                      </span>{" "}
                      {text}
                    </p>
                  </div>
                ))}
                <div className="flex items-start gap-2.5">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden />
                  <p className="text-xs text-muted-foreground">
                    Where a game's patch isn't recorded (common for early seasons), the "No patch"
                    column reports it honestly instead of guessing a value.
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

function ViewSwitcher({
  view,
  onSelect,
}: {
  view: ProDataView;
  onSelect: (view: ProDataView) => void;
}) {
  const tabs: { id: ProDataView; label: string; Icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", Icon: LayoutList },
    { id: "explorer", label: "Explorer", Icon: Compass },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-card/60 p-0.5" role="tablist" aria-label="Pro Data view">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          onClick={() => onSelect(id)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            view === id ? "bg-[#c9a84c]/15 text-[#c9a84c]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

function SectionHeading({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: GOLD }}>
        {label}
      </div>
      <h2 className="text-lg md:text-xl font-bold text-foreground">{title}</h2>
    </div>
  );
}
