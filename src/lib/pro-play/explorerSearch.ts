/**
 * The Pro Stats Explorer's universal search, and the reader-facing names of
 * leagues and events.
 *
 * ONE QUERY, EVERY KIND. `GET /api/pro-play/stats/lookup?q=` answers players,
 * teams, champions, leagues and events in one round trip, grouped, and each
 * result carries the exact table filter it applies (`{ player: "Faker" }`,
 * `{ league: "LoL Champions Korea" }`, `{ league: "World Championship",
 * year: 2025 }`). The filter values are the canonical keys the stats API
 * already takes — this module never invents one.
 *
 * INDEPENDENT OF THE TABLE. The lookup reads the backend's in-memory entity
 * index and cached league coverage, never a leaderboard, so the search box is
 * usable while the statistics table is still loading.
 *
 * LEAGUE NAMES COME FROM THE SERVER. The alias authority is
 * `pro_authority/competition_search.py` (over `competition_policy.py`). The
 * `/stats/filters` payload carries a `competitions` catalog with each league's
 * reader-facing code ("LCK"), region and years; the UI reads that and holds no
 * alias table of its own.
 */

import type { ProStatsFilterOptions } from "@/lib/pro-play/statsApi";

const API_BASE_URL = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export type ExplorerResultKind = "player" | "team" | "champion" | "league" | "event";

/** The URL filter keys a result may set. Same keys `buildStatsParams` sends. */
export type ExplorerFilterPatch = {
  player?: string;
  team?: string;
  champion?: string;
  league?: string;
  year?: number;
};

export type ExplorerResult = {
  kind: ExplorerResultKind;
  /** Stable per result. For an event edition: `<slug>|<year>`. */
  key: string;
  label: string;
  hint?: string | null;
  games?: number;
  match_type: string;
  filters: ExplorerFilterPatch;
  /** Player / team / champion results have a public profile. */
  has_profile: boolean;
  // Competitions only.
  code?: string;
  name?: string;
  region?: string | null;
  note?: string | null;
  year?: number | null;
};

export type ExplorerGroup = {
  kind: ExplorerResultKind;
  label: string;
  results: ExplorerResult[];
};

export type ExplorerLookupResponse = {
  schema_version: number;
  query: string;
  groups: ExplorerGroup[];
};

export class ExplorerSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplorerSearchError";
  }
}

/** Matches the backend's `explorer_lookup.MAX_QUERY_CHARS`. */
export const EXPLORER_QUERY_MAX = 80;

export async function lookupExplorer(
  query: string,
  signal?: AbortSignal,
  limit = 5,
): Promise<ExplorerLookupResponse> {
  const q = query.trim().slice(0, EXPLORER_QUERY_MAX);
  const params = new URLSearchParams({ q, limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/api/pro-play/stats/lookup?${params}`, {
    signal,
  });
  if (!response.ok) {
    throw new ExplorerSearchError("Search is unavailable right now.");
  }
  return (await response.json()) as ExplorerLookupResponse;
}

// ---------------------------------------------------------------------------
// Competitions — the display side of the alias layer
// ---------------------------------------------------------------------------

export type ProStatsCompetition = {
  /** The canonical `league_slug` — the filter value. */
  slug: string;
  /** What a reader calls it: "LCK", "Worlds", "EU LCS". */
  code: string;
  name: string;
  region: string | null;
  kind: "league" | "event";
  tier: number;
  note: string | null;
  curated: boolean;
  games: number;
  first_year: number | null;
  last_year: number | null;
};

/** The filters payload with the catalog the backend now serves beside the
 *  unchanged `leagues` list. Optional so an older backend still types. */
export type ProStatsFilterOptionsWithCompetitions = ProStatsFilterOptions & {
  competitions?: ProStatsCompetition[];
};

export function competitionIndex(
  competitions: ProStatsCompetition[] | undefined,
): Map<string, ProStatsCompetition> {
  return new Map((competitions ?? []).map((c) => [c.slug, c]));
}

function span(c: ProStatsCompetition): string | null {
  if (!c.first_year) return null;
  return c.first_year === c.last_year ? String(c.first_year) : `${c.first_year}–${c.last_year}`;
}

/** The second line under a league option: region, official name (when the
 *  code differs from it), a predecessor note, and the years covered. */
export function competitionHint(c: ProStatsCompetition): string | undefined {
  const parts: string[] = [];
  if (c.region) parts.push(c.region);
  if (c.code !== c.name) parts.push(c.name);
  if (c.note) parts.push(c.note);
  const years = span(c);
  if (years) parts.push(years);
  return parts.length ? parts.join(" · ") : undefined;
}

/** "LCK" for a known slug; the slug itself otherwise (always a true name). */
export function competitionLabel(
  index: Map<string, ProStatsCompetition>,
  slug: string,
): string {
  return index.get(slug)?.code ?? slug;
}

/** Singular noun for an active-filter chip. */
export function competitionNoun(
  index: Map<string, ProStatsCompetition>,
  slug: string,
): "League" | "Event" {
  return index.get(slug)?.kind === "event" ? "Event" : "League";
}

// ---------------------------------------------------------------------------
// Roles — display only; the value sent is unchanged
// ---------------------------------------------------------------------------

/** The API's role values are Top / Jungle / Mid / Bot / Support. League
 *  players say both "Bot" and "ADC"; the label carries both so neither reader
 *  hunts. The value sent is still `Bot`. */
export function roleLabel(role: string): string {
  return role === "Bot" ? "Bot (ADC)" : role;
}
