// ---------------------------------------------------------------------------
// Admin · Pro Play Data Coverage.
//
// The exact reconciliation of Mogzy's historical pro-play authority, so the
// owner can answer "how complete is it, and why is the rest missing?" without
// reading a handoff document or opening SQL.
//
// INTERNAL. It speaks in operational terms ("unresolved team identity",
// "unattributable") because its audience is whoever has to fix the pipeline.
// None of this belongs on a player-facing page, and nothing here links out to
// one.
//
// TWO SOURCES, ONE AUTHORITY
// ──────────────────────────
// Leaguepedia is canonical for game and result identity. Oracle's Elixir is
// STATISTICAL ENRICHMENT layered on top of it and never overwrites a canonical
// result. Where the two disagree on a winner the disagreement is reported as a
// diagnostic — which is why that number is a line of text here and not a
// warning banner: it is not an incident, it is a known 0.14%.
//
// THE 60-ROW TRAP
// ───────────────
// `/summary` caps `by_league` at 60 rows sorted by missing count. That is a
// worst-offenders list; presenting it as the league table would hide every
// league with full coverage. The league table on this page therefore comes
// from `/by-league?limit=500`, and summary's copy is deliberately unused.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, Loader2, RefreshCw } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import {
  LEAGUE_LIMIT,
  ProCoverageError,
  fetchProCoverageLeagues,
  fetchProCoverageSummary,
  formatCount,
  formatPct,
  leagueName,
  type ProCoverageLeague,
  type ProCoverageSummary,
} from "@/lib/admin/proCoverageApi";

export const ADMIN_PRO_COVERAGE_PATH = "/admin/pro-play-coverage";

/** How many league rows render before "Show more". */
const LEAGUE_PAGE_SIZE = 40;

function errorText(err: unknown): string {
  return err instanceof ProCoverageError
    ? err.message
    : "Something went wrong reading the coverage reconciliation.";
}

/** One number in the summary strip. Compact by intent — this is admin, not a
 *  marketing KPI wall. */
function Metric({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  testId: string;
}) {
  return (
    <div
      className="min-w-0 rounded-md border border-border bg-muted/20 px-2.5 py-2"
      data-testid={testId}
    >
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {note && <p className="text-[10px] leading-tight text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Tables are wide by nature; every one of them scrolls inside its own box so
 *  the admin shell never scrolls sideways on a narrow viewport. */
function TableFrame({ children }: { children: React.ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

const TH = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
const TD = "whitespace-nowrap px-2 py-1.5 text-[11px] tabular-nums";

export default function AdminProCoverage() {
  const [summary, setSummary] = useState<ProCoverageSummary | null>(null);
  const [leagues, setLeagues] = useState<ProCoverageLeague[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [leagueQuery, setLeagueQuery] = useState("");
  const [leagueCap, setLeagueCap] = useState(LEAGUE_PAGE_SIZE);

  // The two reads are independent and settled independently: the totals and
  // the league table fail separately, so one backend hiccup cannot blank a
  // page that could still tell the truth about half of itself.
  const load = useCallback(async () => {
    setLoading(true);
    setSummaryError(null);
    setLeagueError(null);
    const [s, l] = await Promise.allSettled([
      fetchProCoverageSummary(),
      fetchProCoverageLeagues(LEAGUE_LIMIT),
    ]);
    if (s.status === "fulfilled") setSummary(s.value);
    else {
      setSummary(null);
      setSummaryError(errorText(s.reason));
    }
    if (l.status === "fulfilled") setLeagues(l.value.leagues ?? []);
    else {
      setLeagues(null);
      setLeagueError(errorText(l.reason));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matchedLeagues = useMemo(() => {
    const rows = leagues ?? [];
    const q = leagueQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        leagueName(r).toLowerCase().includes(q) ||
        (r.league_group ?? "").toLowerCase().includes(q),
    );
  }, [leagues, leagueQuery]);
  const visibleLeagues = matchedLeagues.slice(0, leagueCap);
  const remainingLeagues = matchedLeagues.length - visibleLeagues.length;

  const d = summary?.denominators;
  const missingGames =
    d ? d.canonical_games - d.enriched_games : null;
  const dis = summary?.disagreements;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <SEOHead
        title="Mogzy Admin · Pro Play Data Coverage"
        description="Private administration coverage reconciliation."
        path={ADMIN_PRO_COVERAGE_PATH}
        noindex
      />

      <AdminAuthGate>
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Database className="h-5 w-5 text-primary" aria-hidden />
              Pro Play Data Coverage
            </h1>
            <p className="max-w-2xl text-xs text-muted-foreground">
              How much of the canonical pro-play corpus carries Oracle&rsquo;s Elixir
              statistics, and the mutually exclusive reason every remaining game does not.
              Read-only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void load()}
              disabled={loading}
              data-testid="pro-coverage-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
            </Button>
            <Link
              to="/admin/game-data"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Game Data
            </Link>
          </div>
        </header>

        {loading ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="pro-coverage-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading coverage
            reconciliation…
          </p>
        ) : (
          <div className="space-y-4">
            {/* ---------------------------------------------------------- */}
            {/* Totals                                                      */}
            {/* ---------------------------------------------------------- */}
            {summaryError ? (
              <p
                role="alert"
                data-testid="pro-coverage-summary-error"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {summaryError}
              </p>
            ) : d ? (
              <AdminPanel
                title="Totals"
                description="Every percentage names the denominator it was computed against — the same numerator over the source, canonical and OE-eligible corpora gives three different answers."
                testId="pro-coverage-totals"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  <Metric
                    label="Canonical games"
                    value={formatCount(d.canonical_games)}
                    note="Leaguepedia — what Mogzy can serve"
                    testId="metric-canonical-games"
                  />
                  <Metric
                    label="Enriched games"
                    value={formatCount(d.enriched_games)}
                    note="carrying OE team statistics"
                    testId="metric-enriched-games"
                  />
                  <Metric
                    label="Missing games"
                    value={formatCount(missingGames)}
                    note="canonical without OE statistics"
                    testId="metric-missing-games"
                  />
                  <Metric
                    label="Coverage"
                    value={formatPct(d.pct_of_canonical)}
                    note="of canonical games"
                    testId="metric-coverage-canonical"
                  />
                  <Metric
                    label="Coverage"
                    value={formatPct(d.pct_of_oe_eligible)}
                    note="of OE-eligible games"
                    testId="metric-coverage-eligible"
                  />
                  <Metric
                    label="OE-eligible games"
                    value={formatCount(d.oe_eligible_games)}
                    note={
                      summary?.oe_first_year
                        ? `canonical games from ${summary.oe_first_year} onward`
                        : "years OE publishes a file for"
                    }
                    testId="metric-oe-eligible"
                  />
                  <Metric
                    label="Player stat rows"
                    value={formatCount(d.player_stat_rows)}
                    testId="metric-player-rows"
                  />
                  <Metric
                    label="Team stat rows"
                    value={formatCount(d.team_stat_rows)}
                    testId="metric-team-rows"
                  />
                  <Metric
                    label="Source games"
                    value={formatCount(d.source_games)}
                    note="distinct Leaguepedia game ids"
                    testId="metric-source-games"
                  />
                  <Metric
                    label="OE upstream games"
                    value={formatCount(d.oe_source_games)}
                    note="seen by the promoter, matched or not"
                    testId="metric-oe-source-games"
                  />
                </div>

                {/* Source disagreements — compact, and framed as diagnostic. */}
                {dis && (
                  <p
                    className="mt-3 rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
                    data-testid="pro-coverage-disagreements"
                  >
                    <span className="font-semibold text-foreground">
                      Source disagreements: {formatCount(dis.disagreeing_games)} games
                    </span>{" "}
                    ({formatCount(dis.disagreeing_rows)} of {formatCount(dis.rows_compared)}{" "}
                    compared team rows). Leaguepedia remains canonical for historical game and
                    result identity; Oracle&rsquo;s Elixir is statistical enrichment. A
                    disagreement is diagnostic and never overwrites a canonical result.
                  </p>
                )}
              </AdminPanel>
            ) : null}

            {/* ---------------------------------------------------------- */}
            {/* Coverage buckets                                            */}
            {/* ---------------------------------------------------------- */}
            {summary && summary.buckets.length > 0 && (
              <AdminPanel
                title="Why games are missing"
                description="Every canonical game lands in exactly one bucket, classified by a single SQL rule shared by the total, the per-year and the per-league figures."
                testId="pro-coverage-buckets"
              >
                <TableFrame>
                  <table className="w-full min-w-[34rem] border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH}>Reason</th>
                        <th className={`${TH} text-right`}>Games</th>
                        <th className={`${TH} text-right`}>% of canonical</th>
                        <th className={`${TH} text-right`}>% of OE-eligible</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.buckets.map((b) => (
                        <tr
                          key={b.bucket}
                          className="border-b border-border/50"
                          data-testid={`bucket-row-${b.bucket}`}
                        >
                          <td className="px-2 py-1.5 text-[11px]">
                            {b.label}
                            <span className="ml-1.5 text-[10px] text-muted-foreground">
                              <code>{b.bucket}</code>
                            </span>
                          </td>
                          <td className={`${TD} text-right`}>{formatCount(b.games)}</td>
                          <td className={`${TD} text-right`}>{formatPct(b.pct_of_canonical)}</td>
                          <td className={`${TD} text-right`}>
                            {formatPct(b.pct_of_oe_eligible)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableFrame>

                {summary.missing_reasons.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 text-[11px] font-semibold">
                      Upstream OE games, by attribution outcome
                    </h3>
                    <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
                      Counted from the OE side rather than the canonical side: how many upstream
                      games the promoter saw for each outcome, and how many of those it managed to
                      attribute to a canonical game.
                    </p>
                    <TableFrame>
                      <table className="w-full min-w-[28rem] border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className={TH}>Outcome</th>
                            <th className={`${TH} text-right`}>OE games</th>
                            <th className={`${TH} text-right`}>Attributed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.missing_reasons.map((r) => (
                            <tr
                              key={r.reason}
                              className="border-b border-border/50"
                              data-testid={`reason-row-${r.reason}`}
                            >
                              <td className="px-2 py-1.5 text-[11px]">
                                <code>{r.reason}</code>
                              </td>
                              <td className={`${TD} text-right`}>{formatCount(r.oe_games)}</td>
                              <td className={`${TD} text-right`}>{formatCount(r.attributed)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableFrame>
                  </div>
                )}
              </AdminPanel>
            )}

            {/* ---------------------------------------------------------- */}
            {/* By year                                                     */}
            {/* ---------------------------------------------------------- */}
            {summary && (
              <AdminPanel
                title="By year"
                description="Coverage % is measured against OE-eligible games for that year, so a year that predates OE reads as no coverage rather than as a failure."
                testId="pro-coverage-by-year"
              >
                {summary.by_year.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-muted-foreground">
                    No years reported.
                  </p>
                ) : (
                  <TableFrame>
                    <table className="w-full min-w-[34rem] border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className={TH}>Year</th>
                          <th className={`${TH} text-right`}>Canonical</th>
                          <th className={`${TH} text-right`}>OE eligible</th>
                          <th className={`${TH} text-right`}>Matched</th>
                          <th className={`${TH} text-right`}>Missing</th>
                          <th className={`${TH} text-right`}>Coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.by_year.map((y) => (
                          <tr
                            key={y.year ?? "unknown"}
                            className="border-b border-border/50"
                            data-testid={`year-row-${y.year ?? "unknown"}`}
                          >
                            <td className={TD}>{y.year ?? "Unknown"}</td>
                            <td className={`${TD} text-right`}>
                              {formatCount(y.canonical_games)}
                            </td>
                            <td className={`${TD} text-right`}>{formatCount(y.oe_eligible)}</td>
                            <td className={`${TD} text-right`}>{formatCount(y.matched)}</td>
                            <td className={`${TD} text-right`}>{formatCount(y.missing)}</td>
                            <td className={`${TD} text-right`}>{formatPct(y.coverage_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableFrame>
                )}
              </AdminPanel>
            )}

            {/* ---------------------------------------------------------- */}
            {/* By league — the FULL universe, not summary's top-60         */}
            {/* ---------------------------------------------------------- */}
            <AdminPanel
              title="By league"
              description={`The full league table, read from /by-league (limit ${LEAGUE_LIMIT}). The summary endpoint returns only the 60 leagues with the most missing games, which is not the league universe.`}
              testId="pro-coverage-by-league"
              action={
                <Input
                  value={leagueQuery}
                  onChange={(e) => {
                    setLeagueQuery(e.target.value);
                    setLeagueCap(LEAGUE_PAGE_SIZE);
                  }}
                  placeholder="Filter leagues…"
                  aria-label="Filter leagues"
                  data-testid="pro-coverage-league-filter"
                  className="h-8 w-44 text-xs"
                />
              }
            >
              {leagueError ? (
                <p
                  role="alert"
                  data-testid="pro-coverage-league-error"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {leagueError}
                </p>
              ) : matchedLeagues.length === 0 ? (
                <p
                  className="py-4 text-center text-[11px] text-muted-foreground"
                  data-testid="pro-coverage-league-empty"
                >
                  No leagues match.
                </p>
              ) : (
                <>
                  <p
                    className="mb-2 text-[10px] text-muted-foreground"
                    data-testid="pro-coverage-league-count"
                  >
                    Showing {visibleLeagues.length.toLocaleString("en-US")} of{" "}
                    {matchedLeagues.length.toLocaleString("en-US")} leagues
                    {leagues && matchedLeagues.length !== leagues.length
                      ? ` (${leagues.length.toLocaleString("en-US")} total)`
                      : ""}
                    .
                  </p>
                  <TableFrame>
                    <table className="w-full min-w-[38rem] border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className={TH}>League</th>
                          <th className={TH}>Group</th>
                          <th className={`${TH} text-right`}>Canonical</th>
                          <th className={`${TH} text-right`}>OE eligible</th>
                          <th className={`${TH} text-right`}>Matched</th>
                          <th className={`${TH} text-right`}>Missing</th>
                          <th className={`${TH} text-right`}>Coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLeagues.map((l) => (
                          <tr
                            key={l.league}
                            className="border-b border-border/50"
                            data-testid={`league-row-${l.league}`}
                          >
                            <td className="px-2 py-1.5 text-[11px]">{leagueName(l)}</td>
                            <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                              {l.league_group ?? "—"}
                            </td>
                            <td className={`${TD} text-right`}>
                              {formatCount(l.canonical_games)}
                            </td>
                            <td className={`${TD} text-right`}>{formatCount(l.oe_eligible)}</td>
                            <td className={`${TD} text-right`}>{formatCount(l.matched)}</td>
                            <td className={`${TD} text-right`}>{formatCount(l.missing)}</td>
                            <td className={`${TD} text-right`}>{formatPct(l.coverage_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableFrame>
                  {remainingLeagues > 0 && (
                    <div className="mt-3 flex justify-center">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="pro-coverage-league-show-more"
                        onClick={() => setLeagueCap((c) => c + LEAGUE_PAGE_SIZE)}
                      >
                        Show {Math.min(LEAGUE_PAGE_SIZE, remainingLeagues).toLocaleString("en-US")}{" "}
                        more
                      </Button>
                    </div>
                  )}
                </>
              )}
            </AdminPanel>

            {/* ---------------------------------------------------------- */}
            {/* Largest missing contributors                                */}
            {/* ---------------------------------------------------------- */}
            {summary && summary.top_missing.length > 0 && (
              <AdminPanel
                title="Largest missing contributors"
                description="League × year × reason, largest first. Where to look if coverage is to be improved at all."
                testId="pro-coverage-top-missing"
              >
                <TableFrame>
                  <table className="w-full min-w-[32rem] border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH}>League</th>
                        <th className={TH}>Year</th>
                        <th className={TH}>Reason</th>
                        <th className={`${TH} text-right`}>Games</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.top_missing.map((m, i) => (
                        <tr key={`${m.league}-${m.year}-${m.bucket}-${i}`} className="border-b border-border/50">
                          <td className="px-2 py-1.5 text-[11px]">{m.league ?? "Unknown"}</td>
                          <td className={TD}>{m.year ?? "—"}</td>
                          <td className="px-2 py-1.5 text-[11px]">{m.label}</td>
                          <td className={`${TD} text-right`}>{formatCount(m.games)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableFrame>
              </AdminPanel>
            )}
          </div>
        )}
      </AdminAuthGate>
    </div>
  );
}
