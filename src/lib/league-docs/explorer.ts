/**
 * Pro Data Explorer data-access + URL-state layer.
 *
 * Server-side querying only: filters, sort, and paging are sent to
 * GET /api/docs/pro/explorer and the backend returns a single page of rows plus
 * summary/coverage/filter-option metadata. The raw fact table (146k+ rows) is
 * never loaded into the browser.
 *
 * The filter object is the single source of truth and round-trips through the
 * URL query string so a filtered view can be shared and restored.
 */
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";
import { ApiStatusError } from "@/lib/league-docs/api";

export type ExplorerMode = "aggregate" | "raw";
export type ExplorerEventType = "all" | "pick" | "ban";
export type ExplorerResult = "all" | "win" | "loss";
export type ExplorerOrder = "asc" | "desc";

export const EXPLORER_MODES: ExplorerMode[] = ["aggregate", "raw"];
export const EXPLORER_EVENT_TYPES: ExplorerEventType[] = ["all", "pick", "ban"];
export const EXPLORER_RESULTS: ExplorerResult[] = ["all", "win", "loss"];
export const EXPLORER_SIDES = ["Blue", "Red"] as const;
export const EXPLORER_PAGE_SIZES = [10, 25, 50, 100] as const;
export const EXPLORER_DEFAULT_PAGE_SIZE = 25;

/** Sort keys the backend accepts, per mode (must match services/pro_explorer.py). */
export const AGGREGATE_SORTS = [
  "presence", "picks", "bans", "wins", "losses", "win_rate",
  "champion", "unique_players", "unique_teams",
] as const;
export const RAW_SORTS = [
  "match_date", "champion", "tournament", "team", "player", "patch",
  "event_type", "role", "side",
] as const;
export const DEFAULT_AGGREGATE_SORT = "presence";
export const DEFAULT_RAW_SORT = "match_date";

// Taxonomy allowlists — must match services/esports_taxonomy.py. Used to
// sanitize hand-edited URLs before they reach the backend.
export const LEAGUE_GROUP_IDS = [
  "tier1", "major_regional", "challengers", "erl", "academy_amateur",
  "international", "other",
] as const;
export const REGION_IDS = [
  "emea", "korea", "china", "north_america", "brazil", "asia_pacific",
  "international", "asia",
] as const;
export const FAMILY_IDS = ["first_stand", "msi", "worlds", "ewc", "other_international"] as const;
export const SPLIT_IDS = ["spring", "summer", "winter", "split_1", "split_2", "none"] as const;
export const STAGE_IDS = [
  "regular_season", "playoffs", "play_in", "group_stage", "qualifier",
  "promotion", "relegation", "main_event", "finals", "unknown",
] as const;
export const PRESET_IDS = [
  "all-imported", "tier1", "major", "international", "erls", "challengers",
  "amateur", "custom",
] as const;
/** Legacy Phase 1 scope values still honored in shared URLs. */
export const LEGACY_SCOPE_IDS = ["all-imported", "major", "international"] as const;

export type ExplorerFilters = {
  mode: ExplorerMode;
  year: number | null;
  // Competition / event taxonomy selection (Phase 2)
  competition_preset: string | null;
  league_groups: string[];
  leagues: string[];
  regions: string[];
  tournament_families: string[];
  tournaments: string[];
  splits: string[];
  stages: string[];
  // Single-value filters
  champion: string | null;
  tournament: string | null;
  team: string | null;
  player: string | null;
  role: string | null;
  patch: string | null;
  side: string | null;
  event_type: ExplorerEventType;
  result: ExplorerResult;
  date_from: string | null;
  date_to: string | null;
  sort: string;
  order: ExplorerOrder;
  page: number;
  page_size: number;
};

/** Array-valued taxonomy filter keys (URL param name === filter key). */
export const ARRAY_FILTER_KEYS = [
  "league_groups", "leagues", "regions", "tournament_families",
  "tournaments", "splits", "stages",
] as const;
type ArrayFilterKey = (typeof ARRAY_FILTER_KEYS)[number];

const ARRAY_ALLOWED: Record<ArrayFilterKey, readonly string[] | null> = {
  league_groups: LEAGUE_GROUP_IDS,
  leagues: null, // league ids are open-ended; validated server-side
  regions: REGION_IDS,
  tournament_families: FAMILY_IDS,
  tournaments: null, // composite keys; validated server-side
  splits: SPLIT_IDS,
  stages: STAGE_IDS,
};

export const DEFAULT_SCOPE = "all-imported";

export function defaultSortForMode(mode: ExplorerMode): string {
  return mode === "aggregate" ? DEFAULT_AGGREGATE_SORT : DEFAULT_RAW_SORT;
}

export function defaultFilters(): ExplorerFilters {
  return {
    mode: "aggregate",
    year: null,
    competition_preset: null,
    league_groups: [],
    leagues: [],
    regions: [],
    tournament_families: [],
    tournaments: [],
    splits: [],
    stages: [],
    champion: null,
    tournament: null,
    team: null,
    player: null,
    role: null,
    patch: null,
    side: null,
    event_type: "all",
    result: "all",
    date_from: null,
    date_to: null,
    sort: DEFAULT_AGGREGATE_SORT,
    order: "desc",
    page: 1,
    page_size: EXPLORER_DEFAULT_PAGE_SIZE,
  };
}

// --- Response types ---------------------------------------------------------

export type ExplorerAggregateRow = {
  champion: string;
  slug: string;
  picks: number;
  bans: number;
  presence_games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  unique_players: number;
  unique_teams: number;
};

export type ExplorerRawRow = {
  game_id: string | null;
  match_date: string | null;
  tournament: string | null;
  league: string | null;
  region: string | null;
  patch: string | null;
  champion: string;
  slug: string;
  event_type: string | null;
  player: string | null;
  role: string | null;
  team: string | null;
  opponent: string | null;
  side: string | null;
  result: "win" | "loss" | null;
  source: string | null;
  source_url: string | null;
};

export type ExplorerCoverage = {
  year: number | null;
  coverage_status: string | null;
  is_current_year: boolean;
  data_as_of: string | null;
};

export type ExplorerSummary = {
  distinct_games: number;
  picks: number;
  bans: number;
  unique_champions: number;
  unique_players: number;
  unique_teams: number;
  tournaments: number;
  earliest_match_date: string | null;
  latest_match_date: string | null;
};

export type ExplorerPagination = {
  page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
};

export type ExplorerIdLabel = { id: string; label: string; games?: number | null };

export type ExplorerLeagueOption = {
  id: string;
  label: string;
  group: string;
  region: string;
  games: number;
};

export type ExplorerLeagueGroup = {
  id: string;
  label: string;
  games: number;
  leagues: ExplorerLeagueOption[];
};

export type ExplorerTournamentOption = {
  id: string;
  label: string | null;
  league_id: string;
  group: string;
  region: string;
  family: string | null;
  split: string;
  stage: string;
  stage_confidence: string;
  games: number;
};

export type ExplorerFilterOptions = {
  years: number[];
  event_types: string[];
  results: string[];
  sides: string[];
  page_sizes: number[];
  roles: string[];
  patches: string[];
  teams: string[];
  presets: ExplorerIdLabel[];
  league_groups: ExplorerLeagueGroup[];
  tournament_families: ExplorerIdLabel[];
  splits: ExplorerIdLabel[];
  stages: ExplorerIdLabel[];
  regions: ExplorerIdLabel[];
  tournaments: ExplorerTournamentOption[];
  unclassified: { stage_unknown_games: number; split_none_games: number };
};

export type ExplorerResponse = {
  ok?: boolean;
  filters: Record<string, unknown>;
  coverage: ExplorerCoverage;
  summary: ExplorerSummary;
  mode: ExplorerMode;
  rows: (ExplorerAggregateRow | ExplorerRawRow)[];
  pagination: ExplorerPagination;
  filter_options: ExplorerFilterOptions;
};

// --- Request building -------------------------------------------------------

/** Build the query string sent to the backend (only meaningful params). */
export function filtersToRequestParams(f: ExplorerFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("mode", f.mode);
  p.set("sort", f.sort);
  p.set("order", f.order);
  p.set("page", String(f.page));
  p.set("page_size", String(f.page_size));
  if (f.year !== null) p.set("year", String(f.year));
  if (f.competition_preset) p.set("competition_preset", f.competition_preset);
  if (f.event_type !== "all") p.set("event_type", f.event_type);
  if (f.result !== "all") p.set("result", f.result);
  for (const key of ARRAY_FILTER_KEYS) {
    for (const v of f[key]) p.append(key, v);
  }
  for (const key of ["champion", "tournament", "team", "player", "role", "patch", "side", "date_from", "date_to"] as const) {
    const val = f[key];
    if (val) p.set(key, String(val));
  }
  return p;
}

export async function getProExplorer(f: ExplorerFilters): Promise<ExplorerResponse> {
  const qs = filtersToRequestParams(f).toString();
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/docs/pro/explorer?${qs}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new ApiStatusError(res.status, res.statusText);
  const data = (await res.json()) as ExplorerResponse;
  return {
    ...data,
    rows: Array.isArray(data?.rows) ? data.rows : [],
  };
}

// --- URL <-> filters round-tripping -----------------------------------------

function isOneOf<T extends readonly string[]>(v: string | null, allowed: T): v is T[number] {
  return v !== null && (allowed as readonly string[]).includes(v);
}

/** Parse filters from URL search params, falling back to defaults for anything
 * missing or invalid (so a hand-edited URL never crashes the view). */
export function filtersFromSearch(sp: URLSearchParams): ExplorerFilters {
  const d = defaultFilters();
  const mode: ExplorerMode = isOneOf(sp.get("mode"), EXPLORER_MODES) ? (sp.get("mode") as ExplorerMode) : d.mode;

  const sortParam = sp.get("sort");
  const sortAllowed = mode === "aggregate" ? AGGREGATE_SORTS : RAW_SORTS;
  const sort = isOneOf(sortParam, sortAllowed) ? sortParam : defaultSortForMode(mode);

  const yearRaw = sp.get("year");
  const year = yearRaw !== null && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

  const pageRaw = Number(sp.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const psRaw = Number(sp.get("page_size"));
  const page_size = (EXPLORER_PAGE_SIZES as readonly number[]).includes(psRaw) ? psRaw : d.page_size;

  const str = (key: string): string | null => {
    const v = sp.get(key);
    return v && v.trim() ? v.trim() : null;
  };

  const dateOk = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  // Array taxonomy filters: keep only allowlisted values (open-ended lists pass through).
  const arr = (key: ArrayFilterKey): string[] => {
    const allowed = ARRAY_ALLOWED[key];
    const raw = sp.getAll(key).map((v) => v.trim()).filter(Boolean);
    const values = allowed ? raw.filter((v) => (allowed as readonly string[]).includes(v)) : raw;
    return Array.from(new Set(values));
  };

  // Competition preset: explicit competition_preset wins; else a legacy scope
  // value (Phase 1 URLs) is honored as an alias.
  let competition_preset: string | null = null;
  const presetParam = str("competition_preset");
  if (presetParam && isOneOf(presetParam, PRESET_IDS)) {
    competition_preset = presetParam;
  } else {
    const scopeParam = str("scope");
    if (scopeParam && isOneOf(scopeParam, LEGACY_SCOPE_IDS)) competition_preset = scopeParam;
  }

  return {
    mode,
    year,
    competition_preset,
    league_groups: arr("league_groups"),
    leagues: arr("leagues"),
    regions: arr("regions"),
    tournament_families: arr("tournament_families"),
    tournaments: arr("tournaments"),
    splits: arr("splits"),
    stages: arr("stages"),
    champion: str("champion"),
    tournament: str("tournament"),
    team: str("team"),
    player: str("player"),
    role: str("role"),
    patch: str("patch"),
    side: isOneOf(sp.get("side"), EXPLORER_SIDES) ? sp.get("side") : null,
    event_type: isOneOf(sp.get("event_type"), EXPLORER_EVENT_TYPES) ? (sp.get("event_type") as ExplorerEventType) : "all",
    result: isOneOf(sp.get("result"), EXPLORER_RESULTS) ? (sp.get("result") as ExplorerResult) : "all",
    date_from: dateOk(str("date_from")),
    date_to: dateOk(str("date_to")),
    sort,
    order: sp.get("order") === "asc" ? "asc" : "desc",
    page,
    page_size,
  };
}

const FILTER_PARAM_KEYS = [
  "mode", "year", "scope", "competition_preset", "champion", "tournament",
  "team", "player", "role", "patch", "side", "event_type", "result",
  "date_from", "date_to", "sort", "order", "page", "page_size",
  ...ARRAY_FILTER_KEYS,
] as const;

/** Serialize filters back onto an existing URLSearchParams (preserving other
 * params like `view`). Default-valued filters are omitted to keep URLs short.
 * Legacy `scope=` is dropped in favor of `competition_preset=` on write. */
export function writeFiltersToSearch(f: ExplorerFilters, existing: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(existing);
  for (const key of FILTER_PARAM_KEYS) next.delete(key);

  if (f.mode !== "aggregate") next.set("mode", f.mode);
  if (f.competition_preset) next.set("competition_preset", f.competition_preset);
  if (f.sort !== defaultSortForMode(f.mode)) next.set("sort", f.sort);
  if (f.order !== "desc") next.set("order", f.order);
  if (f.page !== 1) next.set("page", String(f.page));
  if (f.page_size !== EXPLORER_DEFAULT_PAGE_SIZE) next.set("page_size", String(f.page_size));
  if (f.year !== null) next.set("year", String(f.year));
  if (f.event_type !== "all") next.set("event_type", f.event_type);
  if (f.result !== "all") next.set("result", f.result);
  for (const key of ARRAY_FILTER_KEYS) {
    for (const v of f[key]) next.append(key, v);
  }
  for (const key of ["champion", "tournament", "team", "player", "role", "patch", "side", "date_from", "date_to"] as const) {
    if (f[key]) next.set(key, String(f[key]));
  }
  return next;
}

/** Count of active (non-default) filters, for the summary chip. */
export function activeFilterCount(f: ExplorerFilters): number {
  let n = 0;
  if (f.year !== null) n += 1;
  if (f.competition_preset && f.competition_preset !== "all-imported") n += 1;
  for (const key of ARRAY_FILTER_KEYS) n += f[key].length;
  for (const key of ["champion", "tournament", "team", "player", "role", "patch", "side", "date_from", "date_to"] as const) {
    if (f[key]) n += 1;
  }
  if (f.event_type !== "all") n += 1;
  if (f.result !== "all") n += 1;
  return n;
}

/** Stable React Query cache key for a filter set. */
export function explorerQueryKey(f: ExplorerFilters): unknown {
  return filtersToRequestParams(f).toString();
}
