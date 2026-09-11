// ---------------------------------------------------------------------------
// Typed client for the Pro Play research API (/api/pro-play/research/*).
//
// AUTHORIZATION: NONE, DELIBERATELY. This is the public Pro Play identity
// layer — Search and the three canonical entity profiles — and the backend
// router carries no gate either (see routes/pro_play_search.py). It previously
// sent buildAdminHeaders(); that import is gone rather than left inert,
// because a public page must not pull the admin-credential module into its
// bundle or read a stored admin key it has no use for.
//
// The base URL is declared here rather than imported from the admin module
// for the same reason, and matches `statsApi.ts` exactly — the two public Pro
// Play clients now resolve the same backend the same way.
//
// LABELS COME FROM THE SERVER. Scope labels, match-type labels and ambiguity
// reasons are served by /contract and rendered verbatim. Nothing in this file
// infers "2025–2026" from `recent_2025_2026`, so the en dash and the current
// season stay defined in one place — the backend.
// ---------------------------------------------------------------------------

import { proPlayProfileUrl } from "@/lib/pro-play/routes";

const API_BASE_URL = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export type EntityKind = "player" | "team" | "champion";

export type MatchType = "canonical_page" | "handle" | "alias" | "prefix" | "contains";

export type AmbiguityState = "unique" | "ambiguous" | "no_match";

export interface WorldsFocusMarker {
  in_focus_set: boolean;
  asserts_qualification: boolean;
}

export interface SearchResult {
  kind: EntityKind;
  key: string;
  display_name: string;
  handle: string | null;
  match_type: MatchType;
  matched_on: string | null;
  source: string;
  in_registry: boolean;
  games: number;
  last_played_at: string | null;
  has_pro_play_facts: boolean;
  // Kind-specific context, present only where the registry carries it.
  real_name?: string | null;
  country?: string | null;
  primary_role?: string | null;
  declared_current_team?: string | null;
  is_retired?: boolean | null;
  short?: string | null;
  region?: string | null;
  is_disbanded?: boolean | null;
  renamed_to?: string | null;
  worlds_focus?: WorldsFocusMarker;
}

export interface Ambiguity {
  state: AmbiguityState;
  best_match_type: MatchType | null;
  tied_candidates: number;
  resolved_key: string | null;
  by_kind: Record<string, number>;
  reason: string | null;
  /** Present only when state === "ambiguous"; carries EVERY tied candidate
   *  regardless of the result limit, so a disambiguation prompt is complete. */
  candidates?: SearchResult[];
}

export interface SearchResponse {
  contract_version: string;
  query: string;
  kinds: EntityKind[];
  registry_available: boolean;
  results: SearchResult[];
  ambiguity: Ambiguity;
  interpretation: Interpretation | null;
  truncated: boolean;
  total_matches?: number;
}

export interface Interpretation {
  kind: "entity_champion" | "entity_scope";
  subject: { kind: EntityKind; key: string; display_name: string; match_type: MatchType };
  subject_ambiguity: Ambiguity;
  champion_key: string | null;
  scope_id: string | null;
}

export interface ScopeDescriptor {
  scope_id: string;
  label: string;
  kind: string;
}

export interface ScopeStats {
  games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  first_played_at: string | null;
  last_played_at: string | null;
  champion_pool_size?: number;
  top_champions?: ChampionRow[];
  teams?: EntityRow[];
  players?: EntityRow[];
  roles?: string[];
  distinct_players?: number;
  distinct_teams?: number;
  top_players?: EntityRow[];
  top_teams?: EntityRow[];
}

export interface ChampionRow {
  key: string;
  games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  first_played_at: string | null;
  last_played_at: string | null;
  champion_share: number | null;
}

export interface EntityRow {
  key: string;
  games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  first_played_at: string | null;
  last_played_at: string | null;
}

export interface ScopePayload {
  scope: { scope_id: string; kind: string; label: string; bounded: boolean };
  /** "participated" | "did_not_participate". NEVER collapse these: a scope the
   *  entity did not attend has `stats === null`, which is structurally
   *  different from attending and recording zero games on a champion. */
  participation: "participated" | "did_not_participate";
  entity_games_in_scope: number;
  tournaments_in_scope: string[];
  leagues_in_scope: string[];
  stats: ScopeStats | null;
}

export interface ComparisonPayload {
  contract_version: string;
  entity: { kind: string; id: string; display_name?: string; champion_key?: string };
  league_filter: string;
  scope_order: string[];
  scopes: Record<string, ScopePayload>;
}

export interface RosterPlayer {
  player_lp_page: string;
  display_name: string;
  role: string | null;
  games: number;
  wins: number;
  first_played_at: string | null;
  last_played_at: string | null;
  share_of_team_games: number | null;
  declared_member: boolean;
}

export interface Roster {
  team_key: string;
  scope_id: string;
  scope_label: string;
  team_games_in_scope: number;
  players: RosterPlayer[];
  by_role: Record<string, RosterPlayer[]>;
  completeness: {
    state: "complete" | "partial" | "absent";
    roles_covered: string[];
    roles_missing: string[];
    ambiguous_roles: { role: string; reason: string }[] | string[];
    has_full_five: boolean;
  };
  /** Present when the roster registry was attached: which demonstrated
   *  players are also DECLARED, and the two ways the two lists disagree.
   *  null when the registry was unavailable — a degraded but honest result,
   *  never a claim that the lists agree. */
  declared_corroboration: {
    declared_open_memberships: number;
    declared_not_played_in_scope: string[];
    played_but_not_declared: string[];
  } | null;
}

export interface FocusBlock {
  team_key: string;
  owner_label: string;
  group: string;
  status: string;
  asserts_qualification: boolean;
  qualification_evidence: string | null;
  target_event: string;
  meaning: string;
  applies_via?: string;
}

export interface PlayerProfile {
  contract_version: string;
  entity: { kind: "player"; key: string; display_name: string; handle: string | null };
  identity: Record<string, unknown> & { in_registry: boolean; registry_available: boolean; note: string | null };
  roles: { roles: string[]; from_scope: string | null };
  team_context: {
    demonstrated: { team_key: string; games: number; wins: number; last_played_at: string | null; from_scope: string; teams_in_scope: number } | null;
    declared: { raw: string; resolved_team_key: string | null; resolution: AmbiguityState; resolution_reason: string | null } | null;
    agreement: "agree" | "differ" | "declared_only" | "demonstrated_only" | "unknown";
    note: string | null;
  };
  worlds_focus: FocusBlock | null;
  champion_pool_note: string;
  comparison: ComparisonPayload;
}

/** Whether the Matchup Explorer's board can be pointed at this team.
 *
 *  NOT `worlds_focus`. The focus set is editorial (which orgs Mogzy is
 *  watching for Worlds) and the Explorer pool is that set PLUS every team
 *  admitted on measured data — 38 against 16 on the live registry. Gating an
 *  "open in the Explorer" action on `worlds_focus` hides it for the 22 teams
 *  in between, all of which the board serves. */
export interface ExplorerPoolMarker {
  in_explorer_pool: boolean;
  pool_version: string;
  meaning: string;
}

export interface TeamProfile {
  contract_version: string;
  entity: { kind: "team"; key: string; display_name: string };
  identity: Record<string, unknown> & { in_registry: boolean; registry_available: boolean };
  worlds_focus: FocusBlock | null;
  /** Absent on an older payload; treated as "not in the pool", so the action
   *  is withheld rather than offered on a guess. */
  explorer_pool?: ExplorerPoolMarker;
  roster: Roster | null;
  roster_error: string | null;
  roster_note: string;
  comparison: ComparisonPayload;
}

export interface DraftRow {
  games_in_scope: number;
  picks: number;
  wins: number | null;
  losses: number | null;
  win_rate: number | null;
  ban_events: number;
  games_banned_in: number;
  pick_rate: number | null;
  ban_rate: number | null;
  presence: number | null;
  participation: string | null;
}

export interface ChampionProfile {
  contract_version: string;
  entity: { kind: "champion"; key: string; display_name: string };
  identity: Record<string, unknown>;
  draft: Record<string, DraftRow>;
  draft_note: string;
  comparison: ComparisonPayload | null;
  comparison_error: string | null;
}

export interface ResearchContract {
  search: {
    contract_version: string;
    kinds: EntityKind[];
    match_types: { id: MatchType; label: string; note: string | null }[];
    ambiguity_states: AmbiguityState[];
    max_limit: number;
    min_query_chars: number;
  };
  profile_contract_version: string;
  scopes: ScopeDescriptor[];
  default_scope_ids: string[];
  league_filters: { curated: string; every_competition: string };
}

export class ResearchApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ResearchApiError";
    this.status = status;
  }
}

const BASE = `${API_BASE_URL}/api/pro-play/research`;

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${BASE}${path}`;
  // No headers: a signed-out reader must get exactly what a signed-in one
  // does. Sending credentials here would also make the response vary by
  // viewer for data that does not.
  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) {
    // The backend's own detail string is the most accurate thing we can show —
    // a 404 here means "no canonical games", not "page missing".
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      /* a non-JSON error body is not worth a second failure mode */
    }
    throw new ResearchApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export function fetchContract(signal?: AbortSignal) {
  return get<ResearchContract>("/contract", signal);
}

export function searchEntities(
  q: string,
  opts: { kinds?: EntityKind[]; limit?: number } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ q });
  if (opts.kinds?.length) params.set("kinds", opts.kinds.join(","));
  if (opts.limit) params.set("limit", String(opts.limit));
  return get<SearchResponse>(`/search?${params}`, signal);
}

/** Leaguepedia pages carry parentheses and punctuation ("Knight (Zhuo Ding)").
 *  Encode each path segment; the backend route uses a :path converter so a
 *  slash inside a key survives too. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function fetchPlayerProfile(key: string, signal?: AbortSignal) {
  return get<PlayerProfile>(`/player/${encodeKey(key)}`, signal);
}

export function fetchTeamProfile(key: string, signal?: AbortSignal) {
  return get<TeamProfile>(`/team/${encodeKey(key)}`, signal);
}

export function fetchChampionProfile(key: string, signal?: AbortSignal) {
  return get<ChampionProfile>(`/champion/${encodeKey(key)}`, signal);
}

/** Delegates to the router's own constant so a path change lands in one place
 *  (`lib/pro-play/routes.ts`) rather than drifting between link and route. */
export function profilePath(kind: EntityKind, key: string): string {
  return proPlayProfileUrl(kind, key);
}

// --- formatting -------------------------------------------------------------

/** A rate over zero games is NOT 0% — the backend sends null and so does this.
 *  Rendering "0%" for "no games" is the exact misreading the authority layer
 *  refuses to encode, and it must not be reintroduced at the last step. */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Registry text arrives with raw HTML entities in it — 1,516 esports_players
 * rows carry `&nbsp;` inside a real name ("Nicolas&nbsp;Ignacio Viluron"), and
 * React renders text nodes literally, so the escape is visible to the reader.
 *
 * This decodes for DISPLAY ONLY. It does not correct the registry, which is
 * the identity workstream's data to own; the value sent to the API and the
 * value stored upstream are both untouched. Deliberately a fixed, tiny table
 * rather than an innerHTML round-trip, which would execute markup that
 * arrived from a scraped source.
 */
const ENTITIES: Record<string, string> = {
  "&nbsp;": "\u00a0",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

export function decodeRegistryText<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string" || !value.includes("&")) return value;
  return value.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m) as T;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function formatRecord(wins: number | null | undefined, losses: number | null | undefined): string {
  if (wins === null || wins === undefined || losses === null || losses === undefined) return "—";
  return `${wins}–${losses}`;
}

/**
 * The PUBLIC not-found message for an entity with no canonical games.
 *
 * The server's own `detail` is the accurate thing to show an operator and the
 * wrong thing to show a reader: it names the internal filter parameter
 * (`league_filter='MAJOR_PRO'`) and, for a key that is simply mistyped, would
 * assert the page "exists in the roster registry" when it does not. These
 * pages were admin-only when that was written. They are public now, so a 404
 * renders this instead, and the server detail is surfaced only for the errors
 * that are not a clean not-found.
 *
 * It says what IS true in every 404 case: this surface profiles entities with
 * canonical professional games, and this key has none.
 */
export function notFoundMessage(kind: EntityKind, key: string): { message: string; hint: string } {
  const noun = { player: "player", team: "team", champion: "champion" }[kind];
  return {
    message: `No professional record for “${key}”.`,
    hint:
      kind === "champion"
        ? "This champion has not been picked or banned in the professional games this profile draws from. Check the spelling, or search for it."
        : `This ${noun} has no games in the major professional competitions these profiles cover. The name may be spelled differently — try searching for it.`,
  };
}

/**
 * Entity suggestions for the public Stats Explorer's Player and Team filters.
 *
 * REUSES THE CANONICAL SEARCH THIS WORKSTREAM ALREADY MADE PUBLIC. No new
 * endpoint and no new ingestion: `/api/pro-play/research/search` returns
 * `key` = `player_lp_page` / `team_key`, which are exactly the values the
 * stats API filters on and the profile routes take. The identity vocabulary
 * is shared, which is the whole reason this is a client-side change.
 *
 * The stats `/filters` endpoint deliberately does NOT enumerate players
 * (~12,000) or teams (~2,500) — it never has — so pulling a list to filter
 * locally was never an option and is not one now.
 */
export async function searchEntitySuggestions(
  kind: EntityKind,
  query: string,
  limit = 12,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const response = await searchEntities(query, { kinds: [kind], limit }, signal);
  // The API ranks across kinds; keep only the one this filter means, in case
  // a future contract widens what a kind-scoped query may return.
  return response.results.filter((r) => r.kind === kind);
}

/**
 * The second line under a suggestion. It exists to DISAMBIGUATE, not to
 * decorate: the corpus holds two players whose handle is "Doran", and the
 * canonical keys differ only by a real name in parentheses. Role, current
 * team and game count are what let a reader pick the right one.
 */
export function suggestionHint(result: SearchResult): string | undefined {
  const parts: string[] = [];
  if (result.primary_role) parts.push(String(result.primary_role));
  if (result.declared_current_team) parts.push(String(result.declared_current_team));
  else if (result.region) parts.push(String(result.region));
  if (result.games) parts.push(`${result.games.toLocaleString("en-US")} games`);
  // The key itself only when it says something the display name does not.
  if (!parts.length && result.key !== result.display_name) parts.push(result.key);
  return parts.length ? parts.join(" · ") : undefined;
}
