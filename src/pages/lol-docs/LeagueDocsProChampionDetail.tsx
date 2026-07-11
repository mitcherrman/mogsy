import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Hourglass,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  Swords,
  Trophy,
  X,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { useProChampion, isPlausibleChampionSlug } from "@/hooks/useProChampion";
import { useProChampions } from "@/hooks/useProChampions";
import { useChampionAssets, getChampionIcon } from "@/hooks/useChampionAssets";
import {
  ApiStatusError,
  type ProChampionDetail,
  type ProChampionImportJob,
  type ProChampionYearlyStats,
} from "@/lib/league-docs/api";
import {
  buildProYearUrl,
  isProChampionSection,
  normalizeScopeName,
  proScopeLabel,
  type ProChampionSection,
} from "@/lib/league-docs/pro-data-links";

const GOLD = "#c9a84c";

const nf = new Intl.NumberFormat("en-US");

/** Champion-stat rates come back as fractions (0.54 = 54%). */
function pct(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return "—";
  return `${(fraction * 100).toFixed(1)}%`;
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : nf.format(value);
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split(" ")[0] || null;
}

function gameYear(matchDate: string | null): number | null {
  const d = dateOnly(matchDate);
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  return Number.isInteger(y) ? y : null;
}

/**
 * User-facing import-job status. Failure classifications (rate_limited etc.)
 * stay behind a generic retryable label — no internal detail leaks.
 */
function jobPresentation(job: ProChampionImportJob): { label: string; className: string } {
  if (job.status === "done") {
    return job.skip_reason === "valid_empty_zero_rows"
      ? { label: "No games", className: "border-border bg-card/60 text-muted-foreground" }
      : { label: "Imported", className: "border-teal-500/40 bg-teal-500/10 text-teal-300" };
  }
  if (job.status === "pending") {
    return { label: "Waiting", className: "border-border bg-card/60 text-muted-foreground" };
  }
  if (job.status === "failed") {
    return { label: "Failed (retryable)", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
  }
  if (job.status === "skipped") {
    return job.skip_reason === "champion_not_released"
      ? { label: "Not yet released", className: "border-border bg-card/40 text-muted-foreground" }
      : { label: "Skipped", className: "border-border bg-card/40 text-muted-foreground" };
  }
  return { label: "Running", className: "border-[#c9a84c]/40 bg-[#c9a84c]/10 text-[#c9a84c]" };
}

const JUMP_SECTIONS: { id: ProChampionSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "rows-by-year", label: "Rows by year" },
  { id: "yearly-stats", label: "Yearly stats" },
  { id: "scoped-stats", label: "Scoped stats" },
  { id: "import-status", label: "Import status" },
  { id: "recent-games", label: "Recent games" },
  { id: "data-quality", label: "Data quality" },
];

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

function EmptyNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function FilterNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card/60 p-3" role="note">
      <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden />
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

/** Small pill-style toggle used for the year and scope view controls. */
function ViewToggle({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/40 ${
        active
          ? "border-[#c9a84c]/60 bg-[#c9a84c]/15 text-[#c9a84c]"
          : "border-border bg-black/30 text-muted-foreground hover:border-[#c9a84c]/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <Link to="/lol/docs" className="hover:text-[#c9a84c] transition-colors inline-flex items-center gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" /> League Docs
      </Link>
      <span aria-hidden>/</span>
      <Link to="/lol/docs/pro" className="hover:text-[#c9a84c] transition-colors">Pro Data</Link>
      <span aria-hidden>/</span>
      <Link to="/lol/docs/pro/champions" className="hover:text-[#c9a84c] transition-colors">Champions</Link>
      <span aria-hidden>/</span>
      <span className="text-foreground/80">{current}</span>
    </nav>
  );
}

function StatsTable({ rows, showScope }: { rows: ProChampionYearlyStats[]; showScope: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-3 py-2.5 font-bold">Year</th>
            {showScope && <th scope="col" className="px-3 py-2.5 font-bold">Scope</th>}
            <th scope="col" className="px-3 py-2.5 font-bold text-right">Picks</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right">Bans</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right">Wins</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right">Losses</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right">Win rate</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right" title="Share of the scope's imported games where this champion was picked or banned">
              Presence
            </th>
            <th scope="col" className="px-3 py-2.5 font-bold">Top role</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={`${s.year}-${s.scope_name ?? i}`} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 font-bold text-foreground">
                <Link
                  to={buildProYearUrl(s.year)}
                  className="hover:text-[#c9a84c] underline decoration-[#c9a84c]/30 underline-offset-2 transition-colors"
                >
                  {s.year}
                </Link>
              </td>
              {showScope && (
                <td className="px-3 py-2">
                  <span className="rounded border border-teal-500/30 bg-teal-500/5 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300 whitespace-nowrap">
                    {proScopeLabel(s.scope_name)}
                  </span>
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums">{num(s.picks)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(s.bans)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(s.wins)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(s.losses)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(s.win_rate)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(s.presence_rate)}</td>
              <td className="px-3 py-2">{s.top_role ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LeagueDocsProChampionDetail() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = isPlausibleChampionSlug(slugParam) ? slugParam.trim() : null;

  const { data, isPending, isError, error, refetch, isRefetching } = useProChampion(slug);
  const { data: assets } = useChampionAssets();
  // Cached index (if visited) → alphabetical previous/next champion links.
  const { data: index } = useProChampions();

  const neighbors = useMemo(() => {
    if (!data || !index?.champions?.length) return { prev: null, next: null } as const;
    const sorted = index.champions.slice().sort((a, b) => a.champion.localeCompare(b.champion));
    const i = sorted.findIndex((c) => c.slug === data.slug);
    if (i === -1) return { prev: null, next: null } as const;
    return { prev: sorted[i - 1] ?? null, next: sorted[i + 1] ?? null } as const;
  }, [data, index]);

  const notFound = isError && error instanceof ApiStatusError && error.status === 404;

  if (slug === null) {
    return (
      <div>
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
          <SEOHead title="Pro Data by Champion — League Docs | Mogsy" description="Imported professional League of Legends data by champion." path="/lol/docs/pro/champions" />
          <Breadcrumb current="Invalid champion" />
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
            <p className="text-sm font-semibold text-foreground">That doesn't look like a champion.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Champion pages use simple name slugs, like akali or kaisa.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
              <Link to="/lol/docs/pro/champions">Browse champions with pro data</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <SEOHead
          title={`${data?.champion ?? slug} Pro Data — League Docs | Mogsy`}
          description={`Imported professional League of Legends esports data for ${data?.champion ?? slug}: rows by year, yearly and scoped stats, import status, and recent games with sources.`}
          path={`/lol/docs/pro/champions/${slug}`}
          keywords={`${data?.champion ?? slug} pro play, ${data?.champion ?? slug} esports stats, lol pro data`}
        />
        <Breadcrumb current={data?.champion ?? slug} />

        {isPending ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading champion pro data">
            <div className="h-[120px] rounded-2xl border border-border bg-card/40 animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[84px] rounded-xl border border-border bg-card/40 animate-pulse" />
              ))}
            </div>
            <div className="h-[320px] rounded-xl border border-border bg-card/40 animate-pulse" />
          </div>
        ) : notFound ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
            <p className="text-sm font-semibold text-foreground">
              No imported pro data was found for this champion.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Either the name isn't recognized, or no pro-play rows have been imported for it yet.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
              <Link to="/lol/docs/pro/champions">Browse champions with pro data</Link>
            </Button>
          </div>
        ) : isError || !data ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn't load this champion's pro data. Check your connection and try again.
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
          <ChampionContent
            data={data}
            icon={getChampionIcon(assets, data.champion)}
            neighbors={neighbors}
          />
        )}
      </div>
    </div>
  );
}

/** Scroll to the URL hash once, after data has rendered. Never re-yanks on later scrolls. */
function useInitialHashScroll(ready: boolean) {
  const { hash } = useLocation();
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    const id = hash.replace(/^#/, "");
    if (!id || !isProChampionSection(id)) return;
    const el = document.getElementById(id);
    if (!el) return;
    done.current = true;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [ready, hash]);
}

function CopyLinkButton() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={copy}
      aria-label="Copy link to this view"
      className="border-[#c9a84c]/30 text-muted-foreground hover:text-[#c9a84c] hover:bg-[#c9a84c]/10"
    >
      {state === "copied" ? (
        <>
          <Check className="h-3.5 w-3.5 mr-1.5 text-teal-300" aria-hidden /> Link copied
        </>
      ) : state === "failed" ? (
        "Couldn't copy — use the address bar"
      ) : (
        <>
          <Link2 className="h-3.5 w-3.5 mr-1.5" aria-hidden /> Copy link to this view
        </>
      )}
    </Button>
  );
}

function ChampionContent({
  data,
  icon,
  neighbors,
}: {
  data: ProChampionDetail;
  icon: string | undefined;
  neighbors: { prev: { champion: string; slug: string } | null; next: { champion: string; slug: string } | null };
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Year focus (view filter, not a data claim). Malformed or
  // unrepresented values never refetch — they just show a notice.
  const yearParam = searchParams.get("year");
  const yearRequested = yearParam !== null && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  const yearValid = yearRequested !== null && data.years_with_data.includes(yearRequested);
  const focusYear = yearValid ? yearRequested : null;

  // ---- Scope focus, matched against scopes actually returned (normalizing
  // the backend's "all" ↔ "all-imported" alias for matching only).
  const availableScopes = useMemo(() => {
    const seen: string[] = [];
    for (const s of data.scoped_stats) {
      const n = normalizeScopeName(s.scope_name);
      if (n && !seen.includes(n)) seen.push(n);
    }
    return seen.sort();
  }, [data]);
  const scopeParam = searchParams.get("scope");
  const scopeRequested = normalizeScopeName(scopeParam);
  const scopeValid = scopeRequested !== null && availableScopes.includes(scopeRequested);
  const focusScope = scopeValid ? scopeRequested : null;

  const setViewParams = (next: { year?: number | null; scope?: string | null }) => {
    const params = new URLSearchParams(searchParams);
    if ("year" in next) {
      if (next.year === null || next.year === undefined) params.delete("year");
      else params.set("year", String(next.year));
    }
    if ("scope" in next) {
      if (!next.scope) params.delete("scope");
      else params.set("scope", next.scope);
    }
    // Replace: filter tweaks shouldn't pile up in browser history.
    setSearchParams(params, { replace: true });
  };

  useInitialHashScroll(true);

  const totals = useMemo(() => {
    const picks = data.rows_by_year.reduce((s, r) => s + (r.pick_rows || 0), 0);
    const bans = data.rows_by_year.reduce((s, r) => s + (r.ban_rows || 0), 0);
    const patchNull = data.rows_by_year.reduce((s, r) => s + (r.patch_null_rows || 0), 0);
    const latest = data.rows_by_year
      .map((r) => r.max_match_date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop();
    return { picks, bans, rows: picks + bans, patchNull, latest: dateOnly(latest) };
  }, [data]);

  const jobsByYear = useMemo(
    () => new Map(data.import_jobs.map((j) => [j.year, j])),
    [data],
  );
  const importOngoing = data.import_jobs.some(
    (j) => j.status === "pending" || j.status === "failed" || !["done", "skipped", "pending", "failed"].includes(j.status),
  );

  const years = data.years_with_data;
  const firstYear = years.length ? years[0] : null;
  const lastYear = years.length ? years[years.length - 1] : null;

  // ---- Focused views (all derived client-side from the same response).
  const yearlyStatsShown = focusYear
    ? data.yearly_stats.filter((s) => s.year === focusYear)
    : data.yearly_stats;
  const scopedStatsShown = data.scoped_stats.filter(
    (s) =>
      (!focusYear || s.year === focusYear) &&
      (!focusScope || normalizeScopeName(s.scope_name) === focusScope),
  );
  const importJobsShown = focusYear
    ? data.import_jobs.filter((j) => j.year === focusYear)
    : data.import_jobs;
  const recentGamesShown = focusYear
    ? data.recent_games.filter((g) => gameYear(g.match_date) === focusYear)
    : data.recent_games;

  const filtersActive = yearParam !== null || scopeParam !== null;
  const activeSummary = [
    focusYear ? `Viewing ${focusYear} data` : null,
    focusScope ? `${proScopeLabel(focusScope)} scope` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-8">
        <div className="flex items-start gap-4">
          {icon ? (
            <img src={icon} alt="" className="h-14 w-14 rounded-xl border border-[#c9a84c]/40 object-cover" />
          ) : (
            <div className="rounded-xl border border-[#c9a84c]/40 bg-black/40 p-3">
              <Trophy className="h-6 w-6" style={{ color: GOLD }} aria-hidden />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
              League Docs · Pro Data
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{data.champion} Pro Data</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">
              Mogsy's imported professional League/esports rows for {data.champion} — coverage,
              stats, import status, and sources. Imported coverage doesn't guarantee every
              historical match is represented, and historical imports may still be in progress.
            </p>
          </div>
        </div>
      </div>

      {/* Jump navigation + copy link */}
      <nav aria-label="Page sections" className="rounded-xl border border-border bg-card/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Jump to</span>
          {JUMP_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md border border-border bg-black/30 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-[#c9a84c]/40 hover:text-[#c9a84c] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/40"
            >
              {s.label}
            </a>
          ))}
          <span className="ml-auto">
            <CopyLinkButton />
          </span>
        </div>
      </nav>

      {importOngoing && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#c9a84c]/40 bg-[#c9a84c]/5 p-4" role="note">
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} aria-hidden />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold" style={{ color: GOLD }}>Historical import in progress.</span>{" "}
            Some years for {data.champion} are still waiting to be imported, so counts and stats on
            this page may grow over time.
          </p>
        </div>
      )}

      {/* Year focus control + active-filter summary */}
      <div className="rounded-xl border border-border bg-card/60 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Focus a year">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Year view</span>
          <ViewToggle active={focusYear === null} onClick={() => setViewParams({ year: null })}>
            All years
          </ViewToggle>
          {years.map((y) => (
            <ViewToggle
              key={y}
              active={focusYear === y}
              onClick={() => setViewParams({ year: y })}
              ariaLabel={`Focus on ${y} data`}
            >
              {y}
            </ViewToggle>
          ))}
          {filtersActive && (
            <span className="ml-auto flex items-center gap-2">
              {activeSummary && (
                <span className="text-[11px] font-semibold" style={{ color: GOLD }}>
                  {activeSummary}
                </span>
              )}
              <button
                type="button"
                onClick={() => setViewParams({ year: null, scope: null })}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-black/30 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-[#c9a84c]/40 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/40"
              >
                <X className="h-3 w-3" aria-hidden /> Clear filters
              </button>
            </span>
          )}
        </div>
        {yearRequested !== null && !yearValid && (
          <FilterNotice>
            No imported rows are available for {data.champion} in {yearRequested}. Showing all
            years instead — only {years.join(", ") || "none"} have imported data.
          </FilterNotice>
        )}
        {yearParam !== null && yearRequested === null && (
          <FilterNotice>
            The requested year isn't a valid four-digit year, so all years are shown.
          </FilterNotice>
        )}
      </div>

      {/* Overview */}
      <section id="overview" aria-label="Overview" className="scroll-mt-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Imported rows (all years)" value={nf.format(totals.rows)} Icon={Database} />
          <StatCard label="Pick rows (all years)" value={nf.format(totals.picks)} Icon={Swords} />
          <StatCard label="Ban rows (all years)" value={nf.format(totals.bans)} Icon={Ban} />
          <StatCard
            label="Years with data"
            value={
              years.length === 0
                ? "0"
                : firstYear === lastYear
                  ? `${years.length} (${firstYear})`
                  : `${years.length} (${firstYear}–${lastYear})`
            }
            Icon={CalendarRange}
          />
        </div>
        <div className="mt-3 rounded-xl border border-border bg-card/60 p-4">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
            <MetaStat
              label="Rows without patch (all years)"
              value={`${nf.format(totals.patchNull)}${totals.rows ? ` (${((totals.patchNull / totals.rows) * 100).toFixed(1)}%)` : ""}`}
            />
            <MetaStat label="Latest imported match" value={totals.latest ?? "Not available"} />
            <MetaStat label="Scoped stat rows" value={String(data.scoped_stats.length)} />
          </dl>
          {focusYear && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Overview totals always cover all imported years — the {focusYear} view below focuses
              the per-year sections.
            </p>
          )}
        </div>
      </section>

      {/* Rows by year */}
      <section id="rows-by-year" className="scroll-mt-24">
        <SectionHeading label="Rows" title="Imported rows by year" />
        {data.rows_by_year.length === 0 ? (
          <EmptyNote message="No imported rows to break down yet." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card/60">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-3 py-2.5 font-bold">Year</th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-right">Picks</th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-right">Bans</th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-right">Total</th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-right" title="Rows with no recorded patch">No patch</th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-right">Match dates</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">Import status</th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-right"><span className="sr-only">Focus</span></th>
                </tr>
              </thead>
              <tbody>
                {data.rows_by_year.map((r) => {
                  const job = jobsByYear.get(r.year);
                  const jp = job ? jobPresentation(job) : null;
                  const patchPct = r.game_rows ? ` (${((r.patch_null_rows / r.game_rows) * 100).toFixed(0)}%)` : "";
                  const isFocused = focusYear === r.year;
                  return (
                    <tr
                      key={r.year}
                      className={`border-b border-border/60 last:border-0 ${
                        isFocused ? "bg-[#c9a84c]/10" : focusYear ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-bold text-foreground">
                        <Link
                          to={buildProYearUrl(r.year)}
                          className="hover:text-[#c9a84c] underline decoration-[#c9a84c]/30 underline-offset-2 transition-colors"
                        >
                          {r.year}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.pick_rows)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.ban_rows)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{nf.format(r.game_rows)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {nf.format(r.patch_null_rows)}{patchPct}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {dateOnly(r.min_match_date) ?? "—"} → {dateOnly(r.max_match_date) ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {jp ? (
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${jp.className}`}>
                            {jp.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setViewParams({ year: isFocused ? null : r.year })}
                          aria-label={isFocused ? `Stop focusing on ${r.year}` : `Focus page on ${r.year}`}
                          className="rounded border border-border bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-[#c9a84c]/40 hover:text-[#c9a84c] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/40 whitespace-nowrap"
                        >
                          {isFocused ? "Unfocus" : "Focus"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Yearly stats */}
      <section id="yearly-stats" className="scroll-mt-24">
        <SectionHeading label="Stats" title={focusYear ? `Yearly stats — ${focusYear}` : "Yearly stats"} />
        {data.yearly_stats.length === 0 ? (
          <EmptyNote message="Yearly stats haven't been computed for this champion yet — they're built after a year's import settles." />
        ) : yearlyStatsShown.length === 0 ? (
          <EmptyNote
            message={`${data.champion} has imported rows in ${focusYear}, but yearly stats haven't been computed for that year yet.`}
          />
        ) : (
          <>
            <StatsTable rows={yearlyStatsShown} showScope={false} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Rates are relative to the imported games for each year, and years still importing will
              shift. Missing values show as “—” rather than zero.
            </p>
          </>
        )}
      </section>

      {/* Scoped stats */}
      <section id="scoped-stats" className="scroll-mt-24">
        <SectionHeading label="Scopes" title="Scoped stats" />
        <p className="mb-3 text-xs text-muted-foreground max-w-3xl">
          Scopes are alternative views over the same imported rows — filtered by competition tier —
          not additive totals. See scope definitions on the{" "}
          <Link to="/lol/docs/pro" className="font-semibold text-[#c9a84c] hover:underline">
            Pro Data coverage page
          </Link>.
        </p>
        {availableScopes.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Focus a scope">
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Scope view</span>
            <ViewToggle active={focusScope === null} onClick={() => setViewParams({ scope: null })}>
              All scopes
            </ViewToggle>
            {availableScopes.map((s) => (
              <ViewToggle
                key={s}
                active={focusScope === s}
                onClick={() => setViewParams({ scope: s })}
                ariaLabel={`Focus on ${proScopeLabel(s)} scope`}
              >
                {proScopeLabel(s)}
              </ViewToggle>
            ))}
          </div>
        )}
        {scopeParam !== null && !scopeValid && (
          <div className="mb-3">
            <FilterNotice>
              That scope isn't available for {data.champion}
              {availableScopes.length ? ` — available scopes: ${availableScopes.map(proScopeLabel).join(", ")}` : ""}.
              Showing all scopes.
            </FilterNotice>
          </div>
        )}
        {data.scoped_stats.length === 0 ? (
          <EmptyNote message="Scoped stats haven't been built for this champion yet — they arrive once a year's import is complete." />
        ) : scopedStatsShown.length === 0 ? (
          <EmptyNote
            message={
              focusYear
                ? `No scoped stats exist for ${focusYear}${focusScope ? ` in the ${proScopeLabel(focusScope)} scope` : ""} yet — they're built once a year's import is complete.`
                : `No scoped-stat rows match the ${proScopeLabel(focusScope)} scope for this champion yet.`
            }
          />
        ) : (
          <StatsTable rows={scopedStatsShown} showScope />
        )}
      </section>

      {/* Import status by year */}
      <section id="import-status" className="scroll-mt-24">
        <SectionHeading
          label="Import"
          title={focusYear ? `Import status — ${focusYear}` : "Import status by year"}
        />
        {data.import_jobs.length === 0 ? (
          <EmptyNote message="No import queue entries for this champion." />
        ) : importJobsShown.length === 0 ? (
          <EmptyNote message={`No import queue entry exists for ${focusYear}.`} />
        ) : (
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {importJobsShown.map((j) => {
                const jp = jobPresentation(j);
                return (
                  <li key={j.year} className="rounded-lg border border-border/60 bg-black/30 p-2 text-center">
                    <div className="text-xs font-bold text-foreground">{j.year}</div>
                    <div className={`mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${jp.className}`}>
                      {jp.label}
                    </div>
                    {j.rows_created !== null && j.rows_created > 0 && (
                      <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                        {nf.format(j.rows_created)} rows
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              “Not yet released” years predate this champion and are skipped by design. Failed
              imports are retryable — usually temporary throttling, not lost data.
            </p>
          </div>
        )}
      </section>

      {/* Recent games */}
      <section id="recent-games" className="scroll-mt-24">
        <SectionHeading
          label="Sources"
          title={focusYear ? `Recent imported games — ${focusYear}` : "Recent imported games"}
        />
        {data.recent_games.length === 0 ? (
          <EmptyNote message="No imported pick games to show yet." />
        ) : recentGamesShown.length === 0 ? (
          <EmptyNote
            message={`No recent imported games from ${focusYear} appear in the latest returned game sample — the sample only covers the ${data.recent_games.length} most recent imported pick games.`}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border bg-card/60">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-3 py-2.5 font-bold">Date</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Tournament</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Team</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Opponent</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Player</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Role</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Result</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Patch</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGamesShown.map((g, i) => (
                    <tr key={`${g.game_id ?? i}`} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{dateOnly(g.match_date) ?? "—"}</td>
                      <td className="px-3 py-2">{g.tournament ?? g.league ?? "—"}</td>
                      <td className="px-3 py-2">{g.team ?? "—"}</td>
                      <td className="px-3 py-2">{g.opponent ?? "—"}</td>
                      <td className="px-3 py-2">{g.player ?? "—"}</td>
                      <td className="px-3 py-2">{g.role ?? "—"}</td>
                      <td className="px-3 py-2">
                        {g.win === 1 ? (
                          <span className="inline-flex items-center gap-1 text-teal-300"><CheckCircle2 className="h-3 w-3" aria-hidden /> Win</span>
                        ) : g.win === 0 ? (
                          <span className="text-muted-foreground">Loss</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {g.patch ?? <span className="text-muted-foreground">Patch unavailable</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {g.source_url ? (
                          <a
                            href={g.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#c9a84c] hover:underline whitespace-nowrap"
                          >
                            View source <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {focusYear
                ? `Games from ${focusYear} within the ${data.recent_games.length} most recent imported pick games.`
                : `The ${data.recent_games.length} most recent imported pick games.`}{" "}
              Source links open the external page the data was imported from.
            </p>
          </>
        )}
      </section>

      {/* Caveats */}
      <section id="data-quality" className="scroll-mt-24">
        <SectionHeading label="Trust" title="Data quality and caveats" />
        <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
          <CaveatRow Icon={Hourglass} tone="gold">
            Historical imports may still be incomplete — years marked “Waiting” above will fill in
            over time, and stats can change as they do.
          </CaveatRow>
          <CaveatRow Icon={AlertTriangle} tone="amber">
            Rows without a recorded patch (common before 2015) are counted and shown honestly, never
            silently filled in.
          </CaveatRow>
          <CaveatRow Icon={Info} tone="gold">
            Year coverage can be sparse — only the years listed above have imported rows. Imported
            coverage is a view of Mogsy's database, not a claim that every historical pro match is
            represented. Source links are provided for inspection where available.
          </CaveatRow>
        </div>
      </section>

      {/* Prev/next champion + back navigation */}
      <nav aria-label="Champion navigation" className="flex items-center justify-between gap-2">
        {neighbors.prev ? (
          <Button asChild variant="outline" size="sm" className="border-[#c9a84c]/30 text-foreground hover:bg-[#c9a84c]/10">
            <Link to={`/lol/docs/pro/champions/${neighbors.prev.slug}`}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> {neighbors.prev.champion}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <Button asChild variant="outline" size="sm" className="border-[#c9a84c]/30 text-foreground hover:bg-[#c9a84c]/10">
          <Link to="/lol/docs/pro/champions">
            All champions <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
        {neighbors.next ? (
          <Button asChild variant="outline" size="sm" className="border-[#c9a84c]/30 text-foreground hover:bg-[#c9a84c]/10">
            <Link to={`/lol/docs/pro/champions/${neighbors.next.slug}`}>
              {neighbors.next.champion} <ChevronRight className="h-3.5 w-3.5 ml-1" />
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

function CaveatRow({
  Icon,
  tone,
  children,
}: {
  Icon: React.ElementType;
  tone: "gold" | "amber";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon
        className={`h-4 w-4 mt-0.5 shrink-0 ${tone === "amber" ? "text-amber-300" : ""}`}
        style={tone === "gold" ? { color: GOLD } : undefined}
        aria-hidden
      />
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}
