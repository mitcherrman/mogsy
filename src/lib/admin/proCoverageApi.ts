// ---------------------------------------------------------------------------
// Read-only client for the admin Pro Play coverage reconciliation.
//
//   GET /api/admin/pro-coverage/summary     everything in one call
//   GET /api/admin/pro-coverage/by-league   the FULL league table (?limit=)
//
// READS ONLY, and adds nothing to the backend: both routes already exist
// behind `require_admin`. Credentials come from the shared
// buildAdminHeaders() helper, so this uses exactly the same authorization
// path as adminOpsApi and every other admin client.
//
// WHY TWO CALLS RATHER THAN ONE
// ─────────────────────────────
// `summary.by_league` is CAPPED at 60 rows, sorted by missing count. It is a
// "worst offenders" list, not the league universe, and rendering it as the
// league table would silently omit every fully-covered league. The page
// therefore reads the dedicated by-league endpoint with a high limit and uses
// summary's copy for nothing. The two calls are independent: a page that got
// its totals can still say the league table failed, rather than showing
// nothing.
// ---------------------------------------------------------------------------

import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

/** The by-league limit the page asks for. The endpoint caps at 500. */
export const LEAGUE_LIMIT = 500;

export interface ProCoverageDenominators {
  source_games: number;
  canonical_not_from_source: number;
  canonical_games: number;
  oe_eligible_games: number;
  oe_source_games: number;
  enriched_games: number;
  player_stat_rows: number;
  team_stat_rows: number;
  pct_of_source?: number | null;
  pct_of_canonical?: number | null;
  pct_of_oe_eligible?: number | null;
}

export interface ProCoverageBucket {
  bucket: string;
  label: string;
  games: number;
  pct_of_canonical?: number | null;
  pct_of_oe_eligible?: number | null;
}

export interface ProCoverageYear {
  year?: number | null;
  canonical_games: number;
  oe_eligible: number;
  matched: number;
  missing: number;
  coverage_pct?: number | null;
  coverage_pct_of_canonical?: number | null;
}

export interface ProCoverageLeague {
  league: string;
  league_label?: string | null;
  league_group?: string | null;
  canonical_games: number;
  oe_eligible: number;
  matched: number;
  missing: number;
  coverage_pct?: number | null;
}

export interface ProCoverageMissingContributor {
  league?: string | null;
  league_group?: string | null;
  year?: number | null;
  bucket: string;
  label: string;
  games: number;
}

export interface ProCoverageReason {
  reason: string;
  oe_games: number;
  attributed: number;
}

export interface ProCoverageDisagreements {
  rows_compared: number;
  disagreeing_rows?: number | null;
  disagreeing_games?: number | null;
}

export interface ProCoverageSummary {
  denominators: ProCoverageDenominators;
  buckets: ProCoverageBucket[];
  by_year: ProCoverageYear[];
  /** CAPPED AT 60 by the server. Never render this as the league universe. */
  by_league: ProCoverageLeague[];
  top_missing: ProCoverageMissingContributor[];
  missing_reasons: ProCoverageReason[];
  disagreements: ProCoverageDisagreements;
  oe_first_year: number;
}

export interface ProCoverageLeagues {
  leagues: ProCoverageLeague[];
  top_missing: ProCoverageMissingContributor[];
}

/** A read that failed, described well enough to render honestly. */
export class ProCoverageError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "ProCoverageError";
    this.status = status;
  }
}

async function coverageGet<T>(path: string): Promise<T> {
  const url = `${ADMIN_API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: await buildAdminHeaders(url) });
  } catch {
    throw new ProCoverageError("Could not reach the admin backend.", null);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ProCoverageError(
      "The backend refused this request. Backend admin access is a separate authority from your Supabase role.",
      res.status,
    );
  }
  // 503 is the deliberate answer when the promotion pipeline has not run on
  // this deployment. Saying so beats rendering zeros that read as data loss.
  if (res.status === 503) {
    throw new ProCoverageError(
      "This deployment has no promoted pro-play corpus yet, so there is nothing to reconcile.",
      503,
    );
  }
  if (!res.ok) {
    throw new ProCoverageError(`Backend returned ${res.status}.`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProCoverageError(
      "Backend returned a response this page could not read.",
      res.status,
    );
  }
}

export const fetchProCoverageSummary = () =>
  coverageGet<ProCoverageSummary>("/api/admin/pro-coverage/summary");

export const fetchProCoverageLeagues = (limit: number = LEAGUE_LIMIT) =>
  coverageGet<ProCoverageLeagues>(`/api/admin/pro-coverage/by-league?limit=${limit}`);

/** `12.3%`, or an em dash when the server computed no percentage. */
export function formatPct(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toFixed(2)}%` : "—";
}

export function formatCount(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "—";
}

/** The display name of a league row: its label when the server has one. */
export function leagueName(row: ProCoverageLeague): string {
  return row.league_label?.trim() || row.league;
}
