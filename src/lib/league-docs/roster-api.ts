/**
 * Public Pro roster data-access layer (`/api/docs/pro/roster/*`).
 *
 * Reuses the canonical Combat API base URL (VITE_COMBAT_API_URL) and the
 * shared ApiStatusError from the League Docs client — no separate base URLs,
 * no admin endpoints, no keys.
 *
 * Two invariants are load-bearing here and are covered by tests:
 *
 * 1. IDENTITY IS EXACT. A Leaguepedia page identifier (`lpPage`) is passed
 *    through verbatim and only ever URL-encoded. It is never lowercased,
 *    trimmed into a slug, or fuzzily matched. `M1nG` (an alias of the Thai
 *    player `Flure`) and `M1ng` (a separate Taiwanese player) are different
 *    identifiers and must stay that way end to end.
 *
 * 2. ELIGIBILITY IS THE BACKEND'S CALL. Level A is public and shown by
 *    default; Level B is public only behind an explicit opt-in that carries
 *    the backend's warning codes; Level C is internal-only and is never
 *    requested. The `RosterEligibility` type makes "C" unrepresentable, so
 *    no caller can ask for it even by mistake.
 */
import { ApiStatusError } from "@/lib/league-docs/api";
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export { ApiStatusError };

/**
 * The only two eligibility selectors the backend accepts. "C" is deliberately
 * not in this union: Level C is internal/review data and the public API
 * rejects it with 422 ("Level C is not public").
 */
export type RosterEligibility = "A" | "AB";

/** Backend eligibility label on an individual membership row. */
export type MembershipEligibility = "A" | "B";

export type RosterPagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type RosterCoverage = {
  total_players: number;
  total_teams: number;
  total_memberships: number;
  membership_level_a: number;
  membership_level_b: number;
  /** Count only. Level C rows themselves are never returned to the browser. */
  membership_level_c: number;
  public_default_count: number;
  warning_eligible_count: number;
  hidden_review_count: number;
  unresolved_observations: number;
  ambiguous_observations: number;
  /** Years present in the roster source data (not a claim of game coverage). */
  source_years: number[];
  /** Backend-authored disclosure text; rendered verbatim, never paraphrased. */
  disclosure: string;
};

export type RosterPlayerSummary = {
  /** Exact Leaguepedia page identifier — the canonical route parameter. */
  page: string;
  display_name: string;
  country: string | null;
  primary_role: string | null;
  membership_count: number;
};

export type RosterTeamSummary = {
  page: string;
  display_name: string;
  region: string | null;
  membership_count: number;
};

/** Precision the source recorded for a date. "open" means still ongoing. */
export type RosterDatePrecision = "day" | "month" | "year" | "open" | string;

export type RosterMembership = {
  membership_key: string;
  player_page: string;
  player_display_name: string;
  team_page: string;
  team_display_name: string;
  region: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  start_precision: RosterDatePrecision | null;
  end_precision: RosterDatePrecision | null;
  is_active: boolean;
  source_url: string | null;
  eligibility_level: MembershipEligibility;
  /** Set on Level B rows only; null on Level A. Rendered as returned. */
  warning_code: string | null;
  reason_codes: string[];
};

export type RosterPlayersResponse = {
  players: RosterPlayerSummary[];
  pagination: RosterPagination;
};

export type RosterTeamsResponse = {
  teams: RosterTeamSummary[];
  pagination: RosterPagination;
};

export type RosterPlayerDetail = {
  page: string;
  display_name: string;
  country: string | null;
  primary_role: string | null;
  aliases: string[];
  memberships: RosterMembership[];
  /** Which levels the backend actually returned, e.g. ["A"] or ["A","B"]. */
  eligibility_shown: MembershipEligibility[];
  /** How many rows were withheld at this eligibility selection. Count only. */
  hidden_count: number;
};

export type RosterTeamDetail = {
  page: string;
  display_name: string;
  region: string | null;
  aliases: string[];
  historical_names: string[];
  memberships: RosterMembership[];
  eligibility_shown: MembershipEligibility[];
  hidden_count: number;
};

export type RosterSearchResult = {
  type: "player" | "team";
  page: string;
  display_name: string;
  /** The alias the query matched, with its original casing. Null on a direct hit. */
  matched_alias: string | null;
  region: string | null;
};

export type RosterSearchResponse = {
  query: string;
  results: RosterSearchResult[];
};

export type RosterMembershipsResponse = {
  memberships: RosterMembership[];
  pagination: RosterPagination;
  eligibility_shown: MembershipEligibility[];
  hidden_count: number;
};

/** Largest page size the backend accepts. */
export const ROSTER_MAX_PAGE_SIZE = 100;
/** Directory page size used across the roster wiki. */
export const ROSTER_PAGE_SIZE = 25;

/**
 * Encode one Leaguepedia page identifier for a URL path segment.
 *
 * encodeURIComponent preserves case and escapes spaces, slashes, parentheses
 * and non-ASCII — everything real page ids contain ("0ri (Adam Matěj)",
 * "300 (North American Team)"). No normalization of any kind happens here:
 * that is the whole point.
 */
export function encodeLpPage(lpPage: string): string {
  return encodeURIComponent(lpPage);
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      // FastAPI validation errors return detail as an array; keep statusText then.
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new ApiStatusError(res.status, detail);
  }
  return (await res.json()) as T;
}

/**
 * Append the eligibility selection. Level A (the default) is sent explicitly
 * so the request is self-describing in the network log; Level B additionally
 * sets include_warning, the backend's equivalent alias for the same opt-in.
 */
function applyEligibility(params: URLSearchParams, eligibility: RosterEligibility): void {
  params.set("eligibility", eligibility);
  if (eligibility === "AB") params.set("include_warning", "true");
}

/** Roster coverage totals and the backend's public disclosure statement. */
export async function getRosterCoverage(signal?: AbortSignal): Promise<RosterCoverage> {
  const data = await getJson<RosterCoverage>("/api/docs/pro/roster/coverage", signal);
  return { ...data, source_years: Array.isArray(data?.source_years) ? data.source_years : [] };
}

export type RosterDirectoryParams = {
  page?: number;
  pageSize?: number;
  /** Server-side substring match; passed through with its original casing. */
  query?: string;
};

export async function getRosterPlayers(
  { page = 1, pageSize = ROSTER_PAGE_SIZE, query }: RosterDirectoryParams = {},
  signal?: AbortSignal,
): Promise<RosterPlayersResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (query) params.set("query", query);
  const data = await getJson<RosterPlayersResponse>(
    `/api/docs/pro/roster/players?${params}`,
    signal,
  );
  return { ...data, players: Array.isArray(data?.players) ? data.players : [] };
}

export async function getRosterTeams(
  { page = 1, pageSize = ROSTER_PAGE_SIZE, query, region }: RosterDirectoryParams & { region?: string } = {},
  signal?: AbortSignal,
): Promise<RosterTeamsResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (query) params.set("query", query);
  if (region) params.set("region", region);
  const data = await getJson<RosterTeamsResponse>(`/api/docs/pro/roster/teams?${params}`, signal);
  return { ...data, teams: Array.isArray(data?.teams) ? data.teams : [] };
}

/**
 * One player by exact Leaguepedia page id. Throws ApiStatusError(404) when no
 * page with that exact identifier exists — including for alias spellings such
 * as "M1nG", which is an alias of "Flure" and deliberately not a page of its own.
 */
export async function getRosterPlayer(
  lpPage: string,
  eligibility: RosterEligibility = "A",
  signal?: AbortSignal,
): Promise<RosterPlayerDetail> {
  const params = new URLSearchParams();
  applyEligibility(params, eligibility);
  const data = await getJson<RosterPlayerDetail>(
    `/api/docs/pro/roster/players/${encodeLpPage(lpPage)}?${params}`,
    signal,
  );
  return normalizeDetail(data) as RosterPlayerDetail;
}

/** One team by exact Leaguepedia page id. Throws ApiStatusError(404) if unknown. */
export async function getRosterTeam(
  lpPage: string,
  eligibility: RosterEligibility = "A",
  signal?: AbortSignal,
): Promise<RosterTeamDetail> {
  const params = new URLSearchParams();
  applyEligibility(params, eligibility);
  const data = await getJson<RosterTeamDetail>(
    `/api/docs/pro/roster/teams/${encodeLpPage(lpPage)}?${params}`,
    signal,
  );
  const detail = normalizeDetail(data) as RosterTeamDetail;
  return {
    ...detail,
    historical_names: Array.isArray(data?.historical_names) ? data.historical_names : [],
  };
}

function normalizeDetail<T extends Partial<RosterPlayerDetail & RosterTeamDetail>>(data: T) {
  return {
    ...data,
    aliases: Array.isArray(data?.aliases) ? data.aliases : [],
    memberships: (Array.isArray(data?.memberships) ? data.memberships : []).map((m) => ({
      ...m,
      reason_codes: Array.isArray(m?.reason_codes) ? m.reason_codes : [],
    })),
    eligibility_shown: Array.isArray(data?.eligibility_shown) ? data.eligibility_shown : [],
    hidden_count: typeof data?.hidden_count === "number" ? data.hidden_count : 0,
  };
}

/**
 * Paginated memberships for one player. The detail endpoint already embeds the
 * full membership list, so the wiki reads from that; this exists for callers
 * that need page-at-a-time access without the identity payload.
 */
export async function getRosterPlayerMemberships(
  lpPage: string,
  {
    eligibility = "A",
    page = 1,
    pageSize = ROSTER_PAGE_SIZE,
  }: { eligibility?: RosterEligibility; page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<RosterMembershipsResponse> {
  return getMemberships("players", lpPage, eligibility, page, pageSize, signal);
}

/** Paginated memberships for one team. See getRosterPlayerMemberships. */
export async function getRosterTeamMemberships(
  lpPage: string,
  {
    eligibility = "A",
    page = 1,
    pageSize = ROSTER_PAGE_SIZE,
  }: { eligibility?: RosterEligibility; page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<RosterMembershipsResponse> {
  return getMemberships("teams", lpPage, eligibility, page, pageSize, signal);
}

async function getMemberships(
  kind: "players" | "teams",
  lpPage: string,
  eligibility: RosterEligibility,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<RosterMembershipsResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  applyEligibility(params, eligibility);
  const data = await getJson<RosterMembershipsResponse>(
    `/api/docs/pro/roster/${kind}/${encodeLpPage(lpPage)}/memberships?${params}`,
    signal,
  );
  return {
    ...data,
    memberships: Array.isArray(data?.memberships) ? data.memberships : [],
    eligibility_shown: Array.isArray(data?.eligibility_shown) ? data.eligibility_shown : [],
    hidden_count: typeof data?.hidden_count === "number" ? data.hidden_count : 0,
  };
}

/**
 * Unified player/team search. The backend matches display names and aliases
 * case-insensitively and reports which alias matched, but it never merges the
 * two: each result keeps its own canonical `page`, so an alias hit on "M1nG"
 * resolves to the page "Flure" and can never be confused with the separate
 * canonical player page "M1ng".
 */
export async function searchRoster(
  query: string,
  signal?: AbortSignal,
): Promise<RosterSearchResponse> {
  const params = new URLSearchParams({ q: query });
  const data = await getJson<RosterSearchResponse>(
    `/api/docs/pro/roster/search?${params}`,
    signal,
  );
  return { query: data?.query ?? query, results: Array.isArray(data?.results) ? data.results : [] };
}

/**
 * Retry policy for roster queries.
 *
 * A 4xx is the backend's considered answer — an unknown page (404) or a
 * rejected parameter (422) — and repeating the request cannot change it, so it
 * surfaces immediately. Transient failures (5xx, network) get exactly one
 * automatic retry before the error state is shown; anything more just makes a
 * real outage feel like a hang.
 */
export function rosterRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiStatusError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

/**
 * Shared query options for every roster request, so the retry policy above is
 * applied uniformly rather than per-call.
 *
 * Known gap, NOT introduced here: when a request fails at the network layer
 * (backend unreachable, CORS-blocked) rather than returning a readable HTTP
 * status, React Query in this app leaves the query `pending` and the page
 * holds its skeleton instead of showing the error state. The pre-existing
 * /lol/docs/pro coverage page behaves identically under the same conditions,
 * so this is an app-wide issue rather than a roster one. Setting
 * `networkMode: "always"` here was tried and did not change the behaviour, so
 * it is deliberately not carried. HTTP-status failures (404/422/500/503) do
 * render correctly — see RosterError and the profile/directory tests.
 */
export const rosterQueryOptions = {
  retry: rosterRetry,
} as const;

/** Route path for a player page id, encoded exactly. */
export function playerRoute(lpPage: string): string {
  return `/lol/docs/pro/players/${encodeLpPage(lpPage)}`;
}

/** Route path for a team page id, encoded exactly. */
export function teamRoute(lpPage: string): string {
  return `/lol/docs/pro/teams/${encodeLpPage(lpPage)}`;
}
