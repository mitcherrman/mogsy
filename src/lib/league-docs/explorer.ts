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

export type ExplorerFilters = {
  mode: ExplorerMode;
  year: number | null;
  scope: string;
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

export const DEFAULT_SCOPE = "all-imported";

export function defaultSortForMode(mode: ExplorerMode): string {
  return mode === "aggregate" ? DEFAULT_AGGREGATE_SORT : DEFAULT_RAW_SORT;
}

export function defaultFilters(): ExplorerFilters {
  return {
    mode: "aggregate",
    year: null,
    scope: DEFAULT_SCOPE,
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

export type ExplorerScopeOption = { name: string; label: string };

export type ExplorerFilterOptions = {
  scopes: ExplorerScopeOption[];
  years: number[];
  event_types: string[];
  results: string[];
  sides: string[];
  page_sizes: number[];
  roles: string[];
  patches: string[];
  tournaments: string[];
  teams: string[];
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
  p.set("scope", f.scope);
  p.set("sort", f.sort);
  p.set("order", f.order);
  p.set("page", String(f.page));
  p.set("page_size", String(f.page_size));
  if (f.year !== null) p.set("year", String(f.year));
  if (f.event_type !== "all") p.set("event_type", f.event_type);
  if (f.result !== "all") p.set("result", f.result);
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

  return {
    mode,
    year,
    scope: str("scope") ?? d.scope,
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
  "mode", "year", "scope", "champion", "tournament", "team", "player", "role",
  "patch", "side", "event_type", "result", "date_from", "date_to", "sort",
  "order", "page", "page_size",
] as const;

/** Serialize filters back onto an existing URLSearchParams (preserving other
 * params like `view`). Default-valued filters are omitted to keep URLs short. */
export function writeFiltersToSearch(f: ExplorerFilters, existing: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(existing);
  for (const key of FILTER_PARAM_KEYS) next.delete(key);

  if (f.mode !== "aggregate") next.set("mode", f.mode);
  if (f.scope !== DEFAULT_SCOPE) next.set("scope", f.scope);
  if (f.sort !== defaultSortForMode(f.mode)) next.set("sort", f.sort);
  if (f.order !== "desc") next.set("order", f.order);
  if (f.page !== 1) next.set("page", String(f.page));
  if (f.page_size !== EXPLORER_DEFAULT_PAGE_SIZE) next.set("page_size", String(f.page_size));
  if (f.year !== null) next.set("year", String(f.year));
  if (f.event_type !== "all") next.set("event_type", f.event_type);
  if (f.result !== "all") next.set("result", f.result);
  for (const key of ["champion", "tournament", "team", "player", "role", "patch", "side", "date_from", "date_to"] as const) {
    if (f[key]) next.set(key, String(f[key]));
  }
  return next;
}

/** Stable React Query cache key for a filter set. */
export function explorerQueryKey(f: ExplorerFilters): unknown {
  return filtersToRequestParams(f).toString();
}
