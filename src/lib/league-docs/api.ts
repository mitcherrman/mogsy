/**
 * League Docs data-access layer.
 *
 * Public, read-only reference data for the /lol/docs knowledge base. Reuses the
 * canonical Combat API base URL (VITE_COMBAT_API_URL) — do not add separate
 * fallback URLs here. Only endpoints that are already public may be used;
 * admin endpoints and keys must never appear in this file.
 */
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export type ChampionBaseStats = {
  champion_name: string;
  hp: number;
  hp_per_level: number;
  hp5: number;
  mp: number;
  mp_per_level: number;
  ad: number;
  ad_per_level: number;
  attack_speed: number;
  /** Percent growth per level (League attack-speed growth is percentage-based). */
  attack_speed_per_level: number;
  armor: number;
  armor_per_level: number;
  magic_resist: number;
  magic_resist_per_level: number;
  move_speed: number;
  attack_range: number;
};

export type ChampionStatsResponse = {
  ok?: boolean;
  champion_stats?: ChampionBaseStats[];
};

/** Fetch base stats + per-level growth for every champion (public endpoint). */
export async function fetchChampionBaseStats(): Promise<ChampionBaseStats[]> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/meta/champion-stats`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as ChampionStatsResponse;
  const rows = Array.isArray(data?.champion_stats) ? data.champion_stats : [];
  return rows.filter((r) => typeof r?.champion_name === "string" && r.champion_name.trim());
}

// ---------------------------------------------------------------------------
// Pro data (esports) coverage — GET /api/docs/pro/coverage
// ---------------------------------------------------------------------------

export type ProCoverageStatus = "complete" | "in_progress" | "pending" | "partial" | "no_data";

export type ProYearJobs = {
  total: number;
  done: number;
  pending: number;
  failed: number;
  skipped_not_released: number;
  /** Running / stale / unexpected job states that keep a year open. */
  other: number;
};

export type ProYearData = {
  game_rows: number;
  pick_rows: number;
  ban_rows: number;
  unique_champions: number;
  min_match_date: string | null;
  max_match_date: string | null;
  patch_null_rows: number;
  /** Percent of rows with no patch recorded; null when the year has no rows. */
  patch_null_pct: number | null;
};

export type ProYearSummary = {
  year: number;
  coverage_status: ProCoverageStatus;
  jobs: ProYearJobs;
  data: ProYearData;
  /** Scope name → scoped-stat row count (empty until a year's scopes are built). */
  scoped_stats: Record<string, number>;
  /** Backend-authored data-quality caveats for this year. */
  caveats: string[];
};

export type ProCoverageResponse = {
  ok?: boolean;
  total_champions: number;
  scope_definitions: Record<string, string>;
  years: ProYearSummary[];
};

/** Fetch esports data coverage by year (public, read-only endpoint). */
export async function getProCoverage(): Promise<ProCoverageResponse> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/docs/pro/coverage`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as ProCoverageResponse;
  return {
    ...data,
    years: Array.isArray(data?.years) ? data.years : [],
    scope_definitions: data?.scope_definitions ?? {},
  };
}

/** HTTP error carrying its status so callers can branch (e.g. 404 → "untracked year"). */
export class ApiStatusError extends Error {
  status: number;
  constructor(status: number, statusText: string) {
    super(`API ${status}: ${statusText}`);
    this.name = "ApiStatusError";
    this.status = status;
  }
}

export type ProTopChampion = {
  champion: string;
  slug: string;
  count: number;
  /** Present for picked champions only. */
  wins?: number | null;
  win_rate?: number | null;
};

export type ProPresenceChampion = {
  champion: string;
  slug: string;
  presence_games: number;
  /** Percent of the year's distinct games this champion was picked or banned in. */
  presence_rate: number | null;
};

export type ProYearDetail = ProYearSummary & {
  ok?: boolean;
  total_champions: number;
  top_picked: ProTopChampion[];
  top_banned: ProTopChampion[];
  top_presence: ProPresenceChampion[];
};

/** Fetch one year of esports coverage detail. Throws ApiStatusError(404) for untracked years. */
export async function getProYear(year: number): Promise<ProYearDetail> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/docs/pro/years/${year}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new ApiStatusError(res.status, res.statusText);
  const data = (await res.json()) as ProYearDetail;
  return {
    ...data,
    top_picked: Array.isArray(data?.top_picked) ? data.top_picked : [],
    top_banned: Array.isArray(data?.top_banned) ? data.top_banned : [],
    top_presence: Array.isArray(data?.top_presence) ? data.top_presence : [],
    caveats: Array.isArray(data?.caveats) ? data.caveats : [],
    scoped_stats: data?.scoped_stats ?? {},
  };
}

// ---------------------------------------------------------------------------
// Pro data canonical link coverage — GET /api/docs/pro/link-coverage
// ---------------------------------------------------------------------------

/**
 * Highest link-coverage schema version this frontend understands. A response
 * reporting a known numeric version above this must be treated as unsupported
 * (quiet unavailable state), never crashed on.
 */
export const PRO_LINK_COVERAGE_SUPPORTED_SCHEMA_VERSION = 1;

/** Backend may add statuses; unknown values get degraded-style treatment. */
export type ProLinkProjectionStatus = "healthy" | "degraded" | "unavailable";

export type ProLinkLeagueBreakdown = {
  league: string;
  league_name: string;
  source_games: number;
  linked_games: number;
  known_unlinked_games: number;
  coverage_rate: number | null;
};

/** Only tournaments with residual (single-source) games appear here. */
export type ProLinkTournamentBreakdown = {
  league: string;
  tournament: string;
  source_games: number;
  linked_games: number;
  unlinked_games: number;
};

export type ProLinkCoverageResponse = {
  ok?: boolean;
  schema_version: number | null;
  projection_status: ProLinkProjectionStatus | string;
  /** UTC ISO-8601 timestamp of when the backend computed the response. */
  queried_at: string;
  active_links: number;
  deactivated_links: number;
  eligible_source_games: number;
  linked_games: number;
  known_unlinked_games: number;
  missing_or_inconsistent_games: number;
  outside_validated_scope_games: number;
  /** linked/eligible fraction (0–1); null when links are unavailable. */
  coverage_rate: number | null;
  league_breakdown: ProLinkLeagueBreakdown[];
  tournament_breakdown: ProLinkTournamentBreakdown[];
  known_residual_acknowledged: boolean;
  problems: string[];
};

/**
 * Fetch cross-source link coverage (public endpoint). Never pass
 * `strict_links=true` from the browser — strict mode is an operational probe
 * that 503s on drift and is not a user-facing product state.
 */
export async function getProLinkCoverage(): Promise<ProLinkCoverageResponse> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/docs/pro/link-coverage`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new ApiStatusError(res.status, res.statusText);
  const data = (await res.json()) as ProLinkCoverageResponse;
  return {
    ...data,
    league_breakdown: Array.isArray(data?.league_breakdown) ? data.league_breakdown : [],
    tournament_breakdown: Array.isArray(data?.tournament_breakdown)
      ? data.tournament_breakdown
      : [],
    problems: Array.isArray(data?.problems) ? data.problems : [],
  };
}

export type ProChampionIndexEntry = {
  champion: string;
  slug: string;
  /** Count of distinct years with imported rows (spans may be sparse, not continuous). */
  years_with_data: number;
  first_year: number | null;
  last_year: number | null;
  pick_rows: number;
  ban_rows: number;
};

export type ProChampionsIndexResponse = {
  ok?: boolean;
  champions: ProChampionIndexEntry[];
};

/** Fetch the index of champions with imported pro-data rows (public endpoint). */
export async function getProChampions(): Promise<ProChampionsIndexResponse> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/docs/pro/champions`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new ApiStatusError(res.status, res.statusText);
  const data = (await res.json()) as ProChampionsIndexResponse;
  return { ...data, champions: Array.isArray(data?.champions) ? data.champions : [] };
}

export type ProChampionRowsByYear = {
  year: number;
  game_rows: number;
  pick_rows: number;
  ban_rows: number;
  patch_null_rows: number;
  min_match_date: string | null;
  max_match_date: string | null;
};

/** Rates on champion stats are FRACTIONS (0.54 = 54%), unlike the year endpoint's percents. */
export type ProChampionYearlyStats = {
  year: number;
  scope_name: string | null;
  picks: number | null;
  bans: number | null;
  presence_games: number | null;
  wins: number | null;
  losses: number | null;
  total_games_in_scope: number | null;
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  presence_rate: number | null;
  top_role: string | null;
  top_role_share: number | null;
};

export type ProChampionScopedStats = ProChampionYearlyStats & {
  scope_description: string | null;
};

export type ProChampionImportJob = {
  year: number;
  status: string;
  skip_reason: string | null;
  rows_created: number | null;
  latest_match_date: string | null;
};

export type ProChampionGame = {
  game_id: string | null;
  tournament: string | null;
  league: string | null;
  region: string | null;
  match_date: string | null;
  patch: string | null;
  team: string | null;
  opponent: string | null;
  player: string | null;
  role: string | null;
  side: string | null;
  win: number | null;
  event_type: string | null;
  source_url: string | null;
};

export type ProChampionDetail = {
  ok?: boolean;
  champion: string;
  slug: string;
  years_with_data: number[];
  rows_by_year: ProChampionRowsByYear[];
  yearly_stats: ProChampionYearlyStats[];
  scoped_stats: ProChampionScopedStats[];
  import_jobs: ProChampionImportJob[];
  recent_games: ProChampionGame[];
};

/** Fetch pro-data detail for one champion. Throws ApiStatusError(404) for unknown slugs. */
export async function getProChampion(slug: string): Promise<ProChampionDetail> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/docs/pro/champions/${encodeURIComponent(slug)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new ApiStatusError(res.status, res.statusText);
  const data = (await res.json()) as ProChampionDetail;
  return {
    ...data,
    years_with_data: Array.isArray(data?.years_with_data) ? data.years_with_data : [],
    rows_by_year: Array.isArray(data?.rows_by_year) ? data.rows_by_year : [],
    yearly_stats: Array.isArray(data?.yearly_stats) ? data.yearly_stats : [],
    scoped_stats: Array.isArray(data?.scoped_stats) ? data.scoped_stats : [],
    import_jobs: Array.isArray(data?.import_jobs) ? data.import_jobs : [],
    recent_games: Array.isArray(data?.recent_games) ? data.recent_games : [],
  };
}

// ---------------------------------------------------------------------------
// Champion documentation — GET /api/docs/champions/{slug}
// ---------------------------------------------------------------------------

export type DocChampionIdentity = {
  name: string;
  slug: string;
  id: number | null;
  title: string | null;
  resource_type: string | null;
  release_date: string | null;
};

export type DocChampionStats = {
  hp: number | null;
  hp_per_level: number | null;
  hp5: number | null;
  hp5_per_level: number | null;
  mp: number | null;
  mp_per_level: number | null;
  mp5: number | null;
  mp5_per_level: number | null;
  ad: number | null;
  ad_per_level: number | null;
  attack_speed: number | null;
  attack_speed_ratio: number | null;
  /** Percent growth per level (League attack-speed growth is percentage-based). */
  attack_speed_per_level: number | null;
  armor: number | null;
  armor_per_level: number | null;
  magic_resist: number | null;
  magic_resist_per_level: number | null;
  move_speed: number | null;
  attack_range: number | null;
};

export type DocRankValues = {
  raw: string;
  by_rank: number[] | null;
};

export type DocFormula = {
  type: string;
  label: string;
  raw: string;
  normalized: string;
  unresolved_tokens: string[];
  /** Trust only when unresolved_tokens is empty — otherwise the formula is symbolic. */
  resolved_value: number | null;
};

export type DocAbility = {
  slot: "P" | "Q" | "W" | "E" | "R";
  name: string | null;
  description: string | null;
  cooldown: DocRankValues | null;
  cost: DocRankValues | null;
  range: DocRankValues | null;
  ranks: number | null;
  source_id: number | null;
  formulas: DocFormula[];
};

export type DocMeta = {
  patch: string | null;
  source: string | null;
  last_updated: string | null;
  last_verified: string | null;
  verification_status: "verified" | "unverified" | "unknown" | string;
};

export type ChampionDoc = {
  ok?: boolean;
  champion: DocChampionIdentity;
  stats: DocChampionStats | null;
  abilities: DocAbility[];
  meta: DocMeta;
};

/**
 * Fetch the combined champion documentation (identity + stats + abilities +
 * trust metadata). Throws ApiStatusError so callers can branch on 404
 * (unknown champion) vs. generic failure; backend error detail is preserved.
 */
export async function getChampionDoc(slug: string): Promise<ChampionDoc> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/docs/champions/${encodeURIComponent(slug)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new ApiStatusError(res.status, detail);
  }
  const data = (await res.json()) as ChampionDoc;
  return {
    ...data,
    abilities: Array.isArray(data?.abilities)
      ? data.abilities.map((a) => ({ ...a, formulas: Array.isArray(a?.formulas) ? a.formulas : [] }))
      : [],
    meta: data?.meta ?? {
      patch: null,
      source: null,
      last_updated: null,
      last_verified: null,
      verification_status: "unknown",
    },
  };
}

/**
 * URL slug for a champion name: "Aurelion Sol" → "aurelion-sol",
 * "Kai'Sa" → "kaisa", "Nunu & Willump" → "nunu-willump".
 */
export function championSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findChampionBySlug<T extends { champion_name: string }>(
  rows: T[] | undefined,
  slug: string,
): T | undefined {
  if (!rows) return undefined;
  const target = slug.toLowerCase();
  return rows.find((r) => championSlug(r.champion_name) === target);
}

/**
 * Riot's stat-growth multiplier. Mirrors the backend combat engine
 * (champion_stat_profile.riot_level_multiplier) so League Docs projections
 * match Combat Lab: g(level) = (level−1) × (0.7025 + 0.0175 × (level−1)).
 */
export function riotLevelMultiplier(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return n * (0.7025 + 0.0175 * n);
}

/** Flat stats: base + growth × multiplier. */
export function statAtLevel(base: number, perLevel: number, level: number): number {
  return base + perLevel * riotLevelMultiplier(level);
}

/**
 * Attack speed grows by a PERCENT bonus applied to the champion's attack-speed
 * RATIO, added on top of base attack speed (standard League formula):
 * AS(level) = base + ratio × (growth% × multiplier) / 100.
 * When the ratio is unavailable it falls back to base attack speed — the
 * pre-ratio approximation, exact for champions whose ratio equals their base.
 */
export function attackSpeedAtLevel(
  baseAs: number,
  asPerLevelPercent: number,
  level: number,
  ratio?: number | null,
): number {
  const scaleBase = ratio ?? baseAs;
  return baseAs + (scaleBase * (asPerLevelPercent * riotLevelMultiplier(level))) / 100;
}
