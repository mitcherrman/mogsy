/**
 * Public Pro Play statistics table API client.
 *
 * Thin wrapper over `GET /api/pro-play/stats/players`. No auth, no identity:
 * this is the public leaderboard behind the Pro Play hub.
 *
 * THE TWO GAME COUNTS ARE NOT INTERCHANGEABLE. Every row carries `games`
 * (canonical player-games — present for every season back to 2013) and
 * `stat_backed_games` (those that carry detailed statistics). The W-L record
 * derives from the first; K/D/A and the per-minute rates derive from the
 * second, and arrive as `null` — never `0` — when it is zero. A 2013 player
 * legitimately has a win rate and no KDA. Render null as an em dash; never
 * coalesce it to zero, and never print a rate beside `games` as though it
 * were earned over all of them.
 */

const API_BASE_URL =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000";

/** Sortable columns, mirroring the backend's allow-list. */
export type ProStatsTeamSort =
  | "team"
  | "games"
  | "wins"
  | "losses"
  | "win_rate"
  | "stat_backed_games"
  | "kills_per_game"
  | "deaths_per_game"
  | "gold_per_min"
  | "damage_per_min"
  | "towers_per_game"
  | "dragons_per_game"
  | "barons_per_game";

export type ProStatsSort =
  | "player"
  | "games"
  | "wins"
  | "losses"
  | "win_rate"
  | "stat_backed_games"
  | "kills"
  | "deaths"
  | "assists"
  | "kda"
  | "cs_per_min"
  | "gold_per_min"
  | "damage_per_min";

export type ProStatsPlayerRow = {
  player: string;
  /** Canonical player-games. Always present. */
  games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  /** The subset of `games` carrying statistics. */
  stat_backed_games: number;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  /** Null when there are no statistics OR when deaths are zero ("Perfect"). */
  kda: number | null;
  cs_per_min: number | null;
  gold_per_min: number | null;
  damage_per_min: number | null;
};

export type ProStatsFilters = {
  year: number | null;
  league: string | null;
  patch: string | null;
  role: string | null;
  player: string | null;
  team: string | null;
  champion: string | null;
  /** The floor the server applied; 0 when none. */
  min_games: number;
};

export type ProStatsTeamRow = {
  team: string;
  /** Canonical team-games. Always present. */
  games: number;
  wins: number;
  losses: number;
  /** Over DECIDED games; null when none were decided. */
  win_rate: number | null;
  /** The subset of `games` carrying statistics. */
  stat_backed_games: number;
  kills_per_game: number | null;
  deaths_per_game: number | null;
  gold_per_min: number | null;
  damage_per_min: number | null;
  towers_per_game: number | null;
  dragons_per_game: number | null;
  barons_per_game: number | null;
};

export type ProStatsView = "players" | "teams";

export type ProStatsResponse = {
  schema_version: number;
  view: ProStatsView;
  rows: ProStatsPlayerRow[] | ProStatsTeamRow[];
  page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
  sort: string;
  dir: "asc" | "desc";
  /** The EFFECTIVE filters the server used, including any it defaulted. */
  filters: ProStatsFilters;
  /** Keys differ per view; the view config maps them to strip tiles. */
  aggregates: Record<string, number | null>;
  coverage: {
    games: number;
    stat_backed_games: number;
    missing_stat_games: number;
    stat_coverage_pct: number | null;
  };
};

export type ProStatsQuery = {
  year?: number | null;
  league?: string | null;
  patch?: string | null;
  role?: string | null;
  player?: string | null;
  team?: string | null;
  champion?: string | null;
  /** Canonical-game floor. 0/absent = no minimum. */
  minGames?: number | null;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export class ProStatsApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProStatsApiError";
    this.code = code;
  }
}

/** Only the keys the caller actually set reach the query string, so an unset
 *  filter stays unset rather than becoming an empty-string filter. */
export function buildStatsParams(query: ProStatsQuery): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    params.set(key, String(value));
  };
  put("year", query.year);
  put("league", query.league);
  put("patch", query.patch);
  put("role", query.role);
  put("player", query.player);
  put("team", query.team);
  put("champion", query.champion);
  if (query.minGames) put("min_games", query.minGames);
  put("sort", query.sort);
  put("dir", query.dir);
  if (query.page && query.page > 1) put("page", query.page);
  put("page_size", query.pageSize);
  return params;
}

export type ProStatsFilterOptions = {
  schema_version: number;
  /** Most-played first — the ordering is the usability. */
  leagues: string[];
  /** Newest first. */
  patches: string[];
  champions: string[];
  roles: string[];
  years: number[];
};

/** The option lists behind the exact-match filters. Effectively static, so
 *  callers should hold it with a long staleTime rather than refetching. */
export async function getProStatsFilterOptions(
  signal?: AbortSignal,
): Promise<ProStatsFilterOptions> {
  const response = await fetch(`${API_BASE_URL}/api/pro-play/stats/filters`, {
    signal,
  });
  if (!response.ok) {
    throw new ProStatsApiError(
      "PPS_FILTERS_FAILED",
      "Filter options are unavailable.",
    );
  }
  return (await response.json()) as ProStatsFilterOptions;
}

export async function getProStats(
  view: ProStatsView,
  query: ProStatsQuery,
  signal?: AbortSignal,
): Promise<ProStatsResponse> {
  const params = buildStatsParams(query);
  const response = await fetch(
    `${API_BASE_URL}/api/pro-play/stats/${view}?${params.toString()}`,
    { signal },
  );
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body?.detail)
      .catch(() => null);
    throw new ProStatsApiError(
      detail?.code ?? "PPS_REQUEST_FAILED",
      detail?.message ?? "Pro Play statistics are unavailable right now.",
    );
  }
  return (await response.json()) as ProStatsResponse;
}

/** Players-only wrapper kept for callers (and tests) that predate Teams. */
export async function getProPlayerStats(
  query: ProStatsQuery,
  signal?: AbortSignal,
): Promise<ProStatsResponse> {
  return getProStats("players", query, signal);
}
