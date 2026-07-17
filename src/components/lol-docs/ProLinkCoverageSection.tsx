import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleDashed,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProLinkCoverage } from "@/hooks/useProLinkCoverage";
import {
  PRO_LINK_COVERAGE_SUPPORTED_SCHEMA_VERSION,
  type ProLinkCoverageResponse,
  type ProLinkLeagueBreakdown,
} from "@/lib/league-docs/api";

const GOLD = "#c9a84c";

const nf = new Intl.NumberFormat("en-US");

/** UTC-stable "Last checked" formatter — deterministic across environments. */
const lastCheckedFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatLastChecked(value: string | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${lastCheckedFormat.format(parsed)} UTC`;
}

/**
 * Coverage percentage as display text. Prefers the API-provided rate; falls
 * back to deriving from counts when the rate is absent but counts are usable.
 */
function coveragePercentText(data: ProLinkCoverageResponse): string | null {
  if (typeof data.coverage_rate === "number" && Number.isFinite(data.coverage_rate)) {
    return `${(data.coverage_rate * 100).toFixed(1)}%`;
  }
  if (
    typeof data.linked_games === "number" &&
    typeof data.eligible_source_games === "number" &&
    Number.isFinite(data.linked_games) &&
    Number.isFinite(data.eligible_source_games) &&
    data.eligible_source_games > 0
  ) {
    return `${((data.linked_games / data.eligible_source_games) * 100).toFixed(1)}%`;
  }
  return null;
}

function leaguePercentText(league: ProLinkLeagueBreakdown): string {
  if (typeof league.coverage_rate === "number" && Number.isFinite(league.coverage_rate)) {
    return `${(league.coverage_rate * 100).toFixed(1)}%`;
  }
  if (
    typeof league.linked_games === "number" &&
    typeof league.source_games === "number" &&
    league.source_games > 0
  ) {
    return `${((league.linked_games / league.source_games) * 100).toFixed(1)}%`;
  }
  return "—";
}

/**
 * Status presentation: text label + icon per status so meaning never relies on
 * color alone. Unknown statuses get degraded-style (caution, non-crashing)
 * treatment. Known-unlinked games are NOT an error and never styled red.
 */
function statusPresentation(status: string) {
  if (status === "healthy") {
    return {
      label: "Verified",
      Icon: ShieldCheck,
      className: "border-teal-500/40 bg-teal-500/10 text-teal-300",
    };
  }
  if (status === "unavailable") {
    return {
      label: "Verification unavailable",
      Icon: CircleDashed,
      className: "border-border bg-card/60 text-muted-foreground",
    };
  }
  // "degraded" and any unknown future status.
  return {
    label: "Verification needs review",
    Icon: AlertTriangle,
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  };
}

/** Essential fields a render needs; anything less is a malformed response. */
function hasUsableAggregates(data: ProLinkCoverageResponse): boolean {
  return (
    typeof data.linked_games === "number" &&
    Number.isFinite(data.linked_games) &&
    typeof data.eligible_source_games === "number" &&
    Number.isFinite(data.eligible_source_games)
  );
}

function isSupportedSchemaVersion(version: unknown): boolean {
  if (version === null || version === undefined) return true;
  return (
    typeof version === "number" && version <= PRO_LINK_COVERAGE_SUPPORTED_SCHEMA_VERSION
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section id="source-verification" aria-labelledby="source-verification-heading" className="scroll-mt-20">
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: GOLD }}>
          Trust
        </div>
        <h2 id="source-verification-heading" className="text-lg md:text-xl font-bold text-foreground">
          Source verification
        </h2>
      </div>
      {children}
    </section>
  );
}

function QuietUnavailable({
  onRetry,
  isRefetching,
}: {
  onRetry: () => void;
  isRefetching: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-5 text-center">
      <p className="text-xs text-muted-foreground">
        Source verification data is temporarily unavailable. The rest of the pro
        dataset is unaffected.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
        onClick={onRetry}
        disabled={isRefetching}
        aria-label="Retry loading source verification"
      >
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} aria-hidden />
        Retry
      </Button>
    </div>
  );
}

/**
 * Cross-source verification section for the Pro Data overview.
 *
 * Renders GET /api/docs/pro/link-coverage (never strict mode). Known-unlinked
 * games are expected cross-source coverage metadata — they stay in the dataset
 * and are never framed as failures, so this section reserves caution styling
 * for degraded status, reported problems, or real request errors.
 */
export default function ProLinkCoverageSection() {
  const { data, isPending, error, refetch, isRefetching } = useProLinkCoverage();
  const [residualOpen, setResidualOpen] = useState(false);

  const leagues = useMemo(() => {
    const rows = (data?.league_breakdown ?? []).filter(
      (l) => l && typeof l.league === "string",
    );
    // Deterministic: linked games descending, league code as tie-breaker.
    return rows
      .slice()
      .sort((a, b) => (b.linked_games || 0) - (a.linked_games || 0) || a.league.localeCompare(b.league));
  }, [data]);

  if (isPending) {
    return (
      <SectionShell>
        <div
          className="h-[132px] rounded-xl border border-border bg-card/40 animate-pulse"
          aria-busy="true"
          aria-label="Loading source verification"
        />
      </SectionShell>
    );
  }

  if (!data) {
    // Request failure (network error, unexpected 503, malformed JSON body).
    return (
      <SectionShell>
        <QuietUnavailable onRetry={() => refetch()} isRefetching={isRefetching} />
      </SectionShell>
    );
  }

  if (!isSupportedSchemaVersion(data.schema_version) || !hasUsableAggregates(data)) {
    return (
      <SectionShell>
        <QuietUnavailable onRetry={() => refetch()} isRefetching={isRefetching} />
      </SectionShell>
    );
  }

  if (data.projection_status === "unavailable") {
    return (
      <SectionShell>
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <p className="text-xs text-muted-foreground">
            Cross-source verification isn't enabled for this environment yet.
            All imported pro data remains available; verification status will
            appear here once links are promoted.
          </p>
        </div>
      </SectionShell>
    );
  }

  const status = statusPresentation(data.projection_status);
  const percent = coveragePercentText(data);
  const lastChecked = formatLastChecked(data.queried_at);
  const residualCount =
    typeof data.known_unlinked_games === "number" && Number.isFinite(data.known_unlinked_games)
      ? data.known_unlinked_games
      : 0;
  const tournaments = (data.tournament_breakdown ?? []).filter(
    (t) => t && typeof t.tournament === "string",
  );
  const problems = data.problems ?? [];

  return (
    <SectionShell>
      <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
        {/* Headline */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="text-base md:text-lg font-bold text-foreground">
            {nf.format(data.linked_games)} of {nf.format(data.eligible_source_games)} eligible
            games cross-verified
          </div>
          {percent !== null && (
            <div className="text-sm font-semibold tabular-nums" style={{ color: GOLD }}>
              {percent}
            </div>
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${status.className}`}
          >
            <status.Icon className="h-3 w-3" aria-hidden />
            {status.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground max-w-3xl">
          Eligible games are cross-checked against a second public esports
          dataset. Games with a single source are still fully included in every
          stat — they simply haven't been matched in the second dataset, which
          doesn't cover every tournament.
        </p>

        {/* Stale-refresh warning: cached data stays visible if a refetch fails. */}
        {error != null && (
          <p className="flex items-start gap-2 text-[11px] text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
            Couldn't refresh source verification — showing the last loaded
            values.
          </p>
        )}

        {/* Problems reported by the backend (caution, not destructive). */}
        {problems.length > 0 && (
          <ul className="space-y-1.5" aria-label="Verification notices">
            {problems.map((problem) => (
              <li key={problem} className="flex items-start gap-2 text-xs text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
                {problem}
              </li>
            ))}
          </ul>
        )}

        {/* League breakdown */}
        {leagues.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <caption className="sr-only">
                  Cross-verified games by league
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-bold">League</th>
                    <th scope="col" className="px-3 py-2 font-bold text-right">Cross-verified</th>
                    <th scope="col" className="px-3 py-2 font-bold text-right">Eligible</th>
                    <th scope="col" className="px-3 py-2 font-bold text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {leagues.map((l) => (
                    <tr key={l.league} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-semibold text-foreground">
                        {l.league}
                        {l.league_name ? (
                          <span className="ml-2 font-normal text-muted-foreground">
                            {l.league_name}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf.format(l.linked_games)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf.format(l.source_games)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{leaguePercentText(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="md:hidden space-y-2" aria-label="Cross-verified games by league">
              {leagues.map((l) => (
                <li
                  key={l.league}
                  className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-xs"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-foreground">{l.league}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {nf.format(l.linked_games)} of {nf.format(l.source_games)} ·{" "}
                      {leaguePercentText(l)}
                    </span>
                  </div>
                  {l.league_name ? (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{l.league_name}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Known-unlinked residual */}
        {residualCount > 0 ? (
          <div className="rounded-lg border border-border/60 bg-card/40">
            <button
              type="button"
              onClick={() => setResidualOpen((open) => !open)}
              aria-expanded={residualOpen}
              aria-controls="source-verification-residual"
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-foreground hover:text-[#c9a84c] transition-colors"
            >
              Games verified with one source ({nf.format(residualCount)})
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${residualOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {residualOpen && (
              <div id="source-verification-residual" className="border-t border-border/60 px-3 py-3 space-y-2.5">
                <p className="text-xs text-muted-foreground">
                  These games are in the dataset and count toward every stat.
                  They come from tournaments the second dataset doesn't cover,
                  so they can't be cross-verified — an expected coverage
                  difference between sources, not a failed import or a broken
                  record.
                </p>
                <ul className="space-y-1" aria-label="Tournaments with single-source games">
                  {tournaments.map((t) => (
                    <li
                      key={`${t.league}-${t.tournament}`}
                      className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1 last:border-0 text-xs"
                    >
                      <span className="text-foreground">
                        {t.tournament}
                        {t.league ? (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.league}
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {nf.format(t.unlinked_games)}{" "}
                        {t.unlinked_games === 1 ? "game" : "games"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            All eligible games are cross-verified.
          </p>
        )}

        {/* Freshness */}
        {lastChecked !== null && (
          <p className="text-[11px] text-muted-foreground">
            Last checked{" "}
            <time dateTime={data.queried_at}>{lastChecked}</time>
          </p>
        )}
      </div>
    </SectionShell>
  );
}
