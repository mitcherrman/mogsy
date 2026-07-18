import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Compass,
  Database,
  Eye,
  Hourglass,
  Info,
  Loader2,
  RefreshCw,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import DataSourcesNotice from "@/components/lol/DataSourcesNotice";
import { Button } from "@/components/ui/button";
import { useProYear, isPlausibleProYear } from "@/hooks/useProYear";
import { useProCoverage } from "@/hooks/useProCoverage";
import { useChampionAssets, getChampionIcon } from "@/hooks/useChampionAssets";
import {
  ApiStatusError,
  type ProCoverageStatus,
  type ProPresenceChampion,
  type ProTopChampion,
  type ProYearDetail,
} from "@/lib/league-docs/api";
import { buildProChampionUrl, buildProExplorerUrl } from "@/lib/league-docs/pro-data-links";

const GOLD = "#c9a84c";

/** Text label + icon per status — meaning never relies on color alone. */
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
    label: "Partial coverage",
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
  return value.split(" ")[0] || null;
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

function StatCard({ label, value, Icon }: { label: string; value: string; Icon: React.ElementType }) {
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

function ChampionCell({ name, icon, to }: { name: string; icon: string | undefined; to?: string }) {
  const inner = (
    <>
      {icon ? (
        <img
          src={icon}
          alt=""
          loading="lazy"
          className="h-6 w-6 rounded border border-[#c9a84c]/30 object-cover shrink-0"
        />
      ) : (
        <span className="h-6 w-6 rounded border border-border bg-black/40 shrink-0" />
      )}
      <span className="truncate font-semibold text-foreground">{name}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="group flex items-center gap-2 min-w-0 hover:text-[#c9a84c]">
        {inner}
      </Link>
    );
  }
  return <span className="flex items-center gap-2 min-w-0">{inner}</span>;
}

function EmptyList({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function TopList({
  title,
  Icon,
  entries,
  countLabel,
  showWinRate,
  emptyMessage,
  getIcon,
  year,
}: {
  title: string;
  Icon: React.ElementType;
  entries: ProTopChampion[];
  countLabel: string;
  showWinRate: boolean;
  emptyMessage: string;
  getIcon: (name: string) => string | undefined;
  year: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4" style={{ color: GOLD }} aria-hidden />
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <div className="p-4">
          <EmptyList message={emptyMessage} />
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <th scope="col" className="px-4 py-2 font-bold">Champion</th>
              <th scope="col" className="px-3 py-2 font-bold text-right">{countLabel}</th>
              {showWinRate && (
                <>
                  <th scope="col" className="px-3 py-2 font-bold text-right">Wins</th>
                  <th scope="col" className="px-4 py-2 font-bold text-right">Win rate</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.slug} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2">
                  <ChampionCell
                    name={e.champion}
                    icon={getIcon(e.champion)}
                    to={buildProChampionUrl({ slug: e.slug, year })}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{nf.format(e.count)}</td>
                {showWinRate && (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.wins ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {e.win_rate === null || e.win_rate === undefined ? "—" : `${e.win_rate}%`}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PresenceList({
  entries,
  emptyMessage,
  getIcon,
  year,
}: {
  entries: ProPresenceChampion[];
  emptyMessage: string;
  getIcon: (name: string) => string | undefined;
  year: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Eye className="h-4 w-4" style={{ color: GOLD }} aria-hidden />
        <h3 className="text-sm font-bold text-foreground">Top presence</h3>
        <span className="text-[10px] text-muted-foreground">picked or banned</span>
      </div>
      {entries.length === 0 ? (
        <div className="p-4">
          <EmptyList message={emptyMessage} />
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <th scope="col" className="px-4 py-2 font-bold">Champion</th>
              <th scope="col" className="px-3 py-2 font-bold text-right">Games</th>
              <th scope="col" className="px-4 py-2 font-bold text-right">Presence</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.slug} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2">
                  <ChampionCell
                    name={e.champion}
                    icon={getIcon(e.champion)}
                    to={buildProChampionUrl({ slug: e.slug, year })}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{nf.format(e.presence_games)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {e.presence_rate === null || e.presence_rate === undefined ? "—" : `${e.presence_rate}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Breadcrumb({ year }: { year: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <Link to="/lol/docs" className="hover:text-[#c9a84c] transition-colors inline-flex items-center gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" /> League Docs
      </Link>
      <span aria-hidden>/</span>
      <Link to="/lol/docs/pro" className="hover:text-[#c9a84c] transition-colors">
        Pro Data
      </Link>
      <span aria-hidden>/</span>
      <span className="text-foreground/80">{year}</span>
    </nav>
  );
}

function PageShell({ year, children }: { year: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <Breadcrumb year={year} />
        {children}
      </div>
    </div>
  );
}

export default function LeagueDocsProYear() {
  const { year: yearParam } = useParams<{ year: string }>();
  const parsed = /^\d{4}$/.test(yearParam ?? "") ? Number(yearParam) : null;
  const year = isPlausibleProYear(parsed) ? parsed : null;

  // isPending, not isLoading: a query paused before its first result must
  // show the skeleton, not fall through to the generic error state.
  const { data, isPending, isError, error, refetch, isRefetching } = useProYear(year);
  // Coverage list is cached from the Pro Data page; used only to derive
  // safe previous/next tracked-year links. Optional — no UI blocks on it.
  const { data: coverage } = useProCoverage();
  const { data: assets } = useChampionAssets();
  const getIcon = (name: string) => getChampionIcon(assets, name);

  const neighbors = useMemo(() => {
    if (!year || !coverage?.years) return { prev: null as number | null, next: null as number | null };
    const tracked = coverage.years.map((y) => y.year).sort((a, b) => a - b);
    const prev = tracked.filter((y) => y < year).pop() ?? null;
    const next = tracked.find((y) => y > year) ?? null;
    return { prev, next };
  }, [coverage, year]);

  const notFound = isError && error instanceof ApiStatusError && error.status === 404;
  const yearLabel = yearParam ?? "";

  // ---- Invalid route param: don't send a request at all.
  if (year === null) {
    return (
      <PageShell year={yearLabel || "Invalid year"}>
        {/* Invalid year param: a not-found state, not the Pro Data landing —
            distinct title, no landing canonical, and noindex (SPA soft-404). */}
        <SEOHead
          title="Pro Data year not found — League Docs | Mogzy"
          description="This pro data year doesn't exist. Browse year-by-year professional League of Legends coverage instead."
          noindex
        />
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-sm font-semibold text-foreground">That doesn't look like a year.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pro data pages use four-digit years, like 2026 or 2011.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
            <Link to="/lol/docs/pro">Browse pro data coverage</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell year={String(year)}>
      <SEOHead
        title={
          notFound
            ? `${year} Pro Data unavailable — League Docs | Mogzy`
            : `${year} Pro Data — League Docs | Mogzy`
        }
        description={`Imported professional League of Legends esports coverage for ${year}: top picked, banned, and presence champions, win rates, and data completeness.`}
        path={`/lol/docs/pro/years/${year}`}
        keywords={`lol esports ${year}, league pro play ${year}, ${year} pick ban stats`}
        noindex={notFound}
      />

      {isPending ? (
        <div className="space-y-4" aria-busy="true" aria-label={`Loading ${year} pro data`}>
          <div className="h-[120px] rounded-2xl border border-border bg-card/40 animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[84px] rounded-xl border border-border bg-card/40 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[280px] rounded-xl border border-border bg-card/40 animate-pulse" />
            ))}
          </div>
        </div>
      ) : notFound ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-sm font-semibold text-foreground">
            No tracked pro data exists for {year}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mogzy's esports import covers 2011 onward — this year isn't in the queue or the dataset.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
            <Link to="/lol/docs/pro">Browse pro data coverage</Link>
          </Button>
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Couldn't load {year} pro data. Check your connection and try again.
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
      ) : (
        <>
          <YearContent data={data} neighbors={neighbors} getIcon={getIcon} />
          <DataSourcesNotice
            leaguepedia
            freshness={`Figures for ${year} reflect Mogzy's most recent import run for that season.`}
          />
        </>
      )}
    </PageShell>
  );
}

function YearContent({
  data,
  neighbors,
  getIcon,
}: {
  data: ProYearDetail;
  neighbors: { prev: number | null; next: number | null };
  getIcon: (name: string) => string | undefined;
}) {
  const provisional = data.coverage_status === "in_progress" || data.coverage_status === "partial";
  const scopes = Object.keys(data.scoped_stats ?? {});
  const latestMatch = formatDate(data.data.max_match_date);
  const patchNull = data.data.patch_null_pct === null ? "—" : `${data.data.patch_null_pct}%`;

  return (
    <>
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
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{data.year} Pro Data</h1>
              <StatusBadge status={data.coverage_status} />
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">
              Imported professional League/esports coverage for {data.year}. Numbers reflect what
              Mogzy has imported — not a claim that every {data.year} pro match ever played is
              represented.
            </p>
            <div className="mt-3">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
              >
                <Link to={buildProExplorerUrl({ year: data.year })}>
                  <Compass className="h-3.5 w-3.5 mr-1.5" aria-hidden /> Explore {data.year} data
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Provisional notice — in-progress/partial years only */}
      {provisional && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#c9a84c]/40 bg-[#c9a84c]/5 p-4" role="note">
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold" style={{ color: GOLD }}>
              {data.coverage_status === "in_progress"
                ? "This year is still importing."
                : "Coverage for this year is partial."}
            </span>{" "}
            Stats on this page may change as more champions are processed. Check back — the numbers
            below reflect today's coverage, not the final picture.
          </p>
        </div>
      )}

      {/* Status summary */}
      <section aria-label="Year summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Imported rows" value={nf.format(data.data.game_rows)} Icon={Database} />
          <StatCard
            label="Champions with data"
            value={`${data.data.unique_champions}${data.total_champions ? ` / ${data.total_champions}` : ""}`}
            Icon={Users}
          />
          <StatCard label="Pick rows" value={nf.format(data.data.pick_rows)} Icon={Swords} />
          <StatCard label="Ban rows" value={nf.format(data.data.ban_rows)} Icon={Ban} />
        </div>
        <div className="mt-3 rounded-xl border border-border bg-card/60 p-4">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
            <MetaStat label="Rows without patch" value={patchNull} />
            <MetaStat label="Latest match" value={latestMatch ?? "Not available"} />
            <MetaStat
              label="Scoped stats"
              value={scopes.length ? scopes.sort().map((s) => SCOPE_LABELS[s] ?? s).join(" · ") : "Not built yet"}
            />
            <MetaStat label="Match dates" value={
              formatDate(data.data.min_match_date) && latestMatch
                ? `${formatDate(data.data.min_match_date)} → ${latestMatch}`
                : "Not available"
            } />
          </dl>
        </div>
      </section>

      {/* Top champions */}
      <section>
        <SectionHeading label="Champions" title={`Top champions in ${data.year}`} />
        {data.data.game_rows === 0 ? (
          <EmptyList message="No games imported for this year yet — top lists will appear once the import reaches it." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <TopList
              title="Top picked"
              Icon={Swords}
              entries={data.top_picked}
              countLabel="Picks"
              showWinRate
              emptyMessage="No pick data imported yet."
              getIcon={getIcon}
              year={data.year}
            />
            <TopList
              title="Top banned"
              Icon={Ban}
              entries={data.top_banned}
              countLabel="Bans"
              showWinRate={false}
              emptyMessage="No ban data imported yet."
              getIcon={getIcon}
              year={data.year}
            />
            <PresenceList
              entries={data.top_presence}
              emptyMessage="No presence data imported yet."
              getIcon={getIcon}
              year={data.year}
            />
          </div>
        )}
        {provisional && data.data.game_rows > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Rankings are based on imported games only and will shift as this year's import continues.
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Want the champion view?{" "}
          <Link to="/lol/docs/pro/champions" className="font-semibold text-[#c9a84c] hover:underline">
            Browse champions
          </Link>{" "}
          with imported pro data — per-champion detail pages are coming soon.
        </p>
      </section>

      {/* Import queue status */}
      <section>
        <SectionHeading label="Import" title="Import queue status" />
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-2 text-xs">
            <MetaStat label="Champions done" value={nf.format(data.jobs.done)} />
            <MetaStat label="Waiting" value={nf.format(data.jobs.pending)} />
            <MetaStat label="Failed (retryable)" value={nf.format(data.jobs.failed)} />
            <MetaStat label="Skipped (not yet released)" value={nf.format(data.jobs.skipped_not_released)} />
            <MetaStat label="Running" value={nf.format(data.jobs.other)} />
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Champions released after {data.year} are skipped by design. Failed imports are
            retryable — they usually indicate temporary throttling, not lost data.
          </p>
        </div>
      </section>

      {/* Caveats */}
      <section>
        <SectionHeading label="Trust" title="Data quality and caveats" />
        <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
          {data.caveats.map((caveat) => (
            <div key={caveat} className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-300" aria-hidden />
              <p className="text-xs text-muted-foreground">{caveat}</p>
            </div>
          ))}
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden />
            <p className="text-xs text-muted-foreground">
              Where a game's patch isn't recorded (common for early seasons), it's counted in "rows
              without patch" instead of being silently filled in.
            </p>
          </div>
          {data.caveats.length === 0 && (
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-teal-300" aria-hidden />
              <p className="text-xs text-muted-foreground">
                No outstanding data-quality caveats for this year's coverage.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Prev/next year navigation */}
      <nav aria-label="Year navigation" className="flex items-center justify-between gap-2">
        {neighbors.prev !== null ? (
          <Button asChild variant="outline" size="sm" className="border-[#c9a84c]/30 text-foreground hover:bg-[#c9a84c]/10">
            <Link to={`/lol/docs/pro/years/${neighbors.prev}`}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> {neighbors.prev}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <Button asChild variant="outline" size="sm" className="border-[#c9a84c]/30 text-foreground hover:bg-[#c9a84c]/10">
          <Link to="/lol/docs/pro">
            All years <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
        {neighbors.next !== null ? (
          <Button asChild variant="outline" size="sm" className="border-[#c9a84c]/30 text-foreground hover:bg-[#c9a84c]/10">
            <Link to={`/lol/docs/pro/years/${neighbors.next}`}>
              {neighbors.next} <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</dd>
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
