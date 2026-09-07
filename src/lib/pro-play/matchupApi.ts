// ---------------------------------------------------------------------------
// Typed client for the Worlds Matchup Explorer (/api/pro-play/matchup/*).
//
// THE URL IS THE SELECTION, AND THIS FILE OWNS BOTH ENDS OF THAT. The page's
// query string and the API's query string are the SAME set of parameters, so
// `selectionToParams` builds both: the request, and the address bar. A
// configured matchup is therefore shareable and restorable by construction
// rather than by a separate persistence layer — paste the URL, get the
// matchup. `selectionFromParams` is the exact inverse, and the round trip is
// tested.
//
// AUTHORIZATION: unchanged. Same buildAdminHeaders() path as every other
// admin client, against the same backend require_admin. No gate of its own.
//
// LABELS COME FROM THE SERVER. Scope labels, focus statuses, the pool wording
// and the side-by-side sentence are all served by /contract and /explore and
// rendered verbatim. Nothing here rewords them, and in particular nothing here
// turns "watchlist" into "qualified" or "side-by-side" into "head-to-head".
// ---------------------------------------------------------------------------

import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

import type { ComparisonPayload, Roster, RosterPlayer, ScopeDescriptor } from "@/lib/pro-play/researchApi";

export type Lane = string;

/** `needs` values — why a side is not fully resolved. */
export const NEED_TEAM = "team_not_selected";
export const NEED_PLAYER = "player_not_selected";
export const NEED_CHAMPION = "champion_not_selected";

/** `conflicts` values — selection problems the server reports rather than
 *  silently correcting. */
export const CONFLICT_CHAMPION_BANNED = "champion_banned";
export const CONFLICT_CHAMPION_OFF_POOL = "champion_not_in_demonstrated_pool";
export const CONFLICT_PLAYER_OFF_LANE = "player_not_demonstrated_in_lane";

export interface FocusTeamRow {
  team_key: string;
  owner_label: string;
  group: string;
  /** "watchlist" | "qualified" | "confirmed" | "removed". Rendered literally. */
  status: string;
  /** The ONLY field that may drive language about a Worlds slot. */
  asserts_qualification: boolean;
  qualification_evidence: string | null;
  note: string | null;
}

export interface PendingSlot {
  group: string;
  count: number;
  reason: string;
  team_key: null;
  status: "unresolved";
}

export interface FocusSet {
  focus_set_version: string;
  target_event: string;
  statuses: string[];
  qualification_claim_statuses: string[];
  groups: string[];
  teams: FocusTeamRow[];
  pending_slots: PendingSlot[];
  teams_asserting_qualification: string[];
}

export interface MatchupNotes {
  focus: string;
  pool: string;
  side_by_side: string;
  bans: string;
}

export interface MatchupContract {
  contract_version: string;
  comparison_contract_version: string;
  semantics: string;
  head_to_head: false;
  lanes: Lane[];
  scopes: ScopeDescriptor[];
  default_scope_ids: string[];
  default_pool_scope_id: string;
  league_filters: { curated: string; every_competition: string };
  focus_set: FocusSet;
  notes: MatchupNotes;
}

export interface PoolChampion {
  key: string;
  games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  first_played_at: string | null;
  last_played_at: string | null;
  champion_share: number | null;
  /** Set by the ban list. A banned champion stays in the pool and drops out of
   *  `selectable` — seeing that you banned something he plays is the point. */
  banned: boolean;
}

export interface DemonstratedPool {
  scope_id: string;
  scope_label: string;
  participation: "participated" | "did_not_participate";
  player_games_in_scope: number;
  pool_size: number;
  champions: PoolChampion[];
  selectable: string[];
  banned_from_pool: string[];
  note: string;
}

export interface LaneCandidates {
  lane: Lane;
  players: RosterPlayer[];
  /** null with candidates present is a timeshare, not "nobody". */
  starter: string | null;
  ambiguous: boolean;
  ambiguous_reason: string | null;
  lane_covered: boolean;
}

export interface MatchupSide {
  team: { team_key: string; display_name: string } | null;
  focus: FocusTeamRow | null;
  roster: Roster | null;
  lane: Lane | null;
  lane_candidates: LaneCandidates | null;
  player: { player_lp_page: string; display_name: string } | null;
  pool: DemonstratedPool | null;
  champion_key: string | null;
  comparison: ComparisonPayload | null;
  needs: string[];
  conflicts: string[];
}

export interface MatchupSelection {
  team_a: string | null;
  team_b: string | null;
  lane: Lane | null;
  player_a: string | null;
  player_b: string | null;
  champion_a: string | null;
  champion_b: string | null;
  bans: string[];
  pool_scope_id: string;
  scope_ids?: string[];
  league_filter?: string;
}

export interface MatchupResponse {
  contract_version: string;
  comparison_contract_version: string;
  comparison_kind: "players_side_by_side";
  semantics: "independent_side_by_side";
  /** Always false. The UI must never print "head-to-head" while this is false,
   *  and there is currently no endpoint for which it would be true. */
  head_to_head: false;
  selection: MatchupSelection;
  lanes: Lane[];
  scope_order: string[];
  scope_labels: Record<string, string>;
  bans: { champions: string[]; note: string };
  sides: { a: MatchupSide; b: MatchupSide };
  resolved: boolean;
  notes: MatchupNotes;
}

export class MatchupApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MatchupApiError";
    this.status = status;
  }
}

const BASE = `${ADMIN_API_BASE_URL}/api/pro-play/matchup`;

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${BASE}${path}`;
  const headers = await buildAdminHeaders(url);
  const res = await fetch(url, { method: "GET", headers, signal });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      /* a non-JSON error body is not worth a second failure mode */
    }
    throw new MatchupApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

// --- selection <-> URL ------------------------------------------------------

/** Empty selection: the Explorer's first paint. */
export const EMPTY_SELECTION: MatchupSelection = {
  team_a: null,
  team_b: null,
  lane: null,
  player_a: null,
  player_b: null,
  champion_a: null,
  champion_b: null,
  bans: [],
  pool_scope_id: "current_2026",
};

const SCALARS = [
  "team_a",
  "team_b",
  "lane",
  "player_a",
  "player_b",
  "champion_a",
  "champion_b",
] as const;

/**
 * The selection as query parameters — used for BOTH the API request and the
 * address bar, which is what makes the two impossible to drift apart.
 *
 * Bans are REPEATED (`ban=Yone&ban=Sylas`) rather than comma-joined, matching
 * the route. A champion key can contain punctuation, and splitting on a
 * separator that may appear inside a key is how "Kai'Sa" becomes two
 * champions.
 */
export function selectionToParams(selection: MatchupSelection): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of SCALARS) {
    const value = selection[field];
    if (value) params.set(field, value);
  }
  // Sorted so the same matchup always produces the same URL — two people who
  // banned the same three champions in a different order share one link.
  for (const ban of [...new Set(selection.bans)].filter(Boolean).sort()) {
    params.append("ban", ban);
  }
  if (selection.pool_scope_id && selection.pool_scope_id !== EMPTY_SELECTION.pool_scope_id) {
    params.set("pool_scope", selection.pool_scope_id);
  }
  return params;
}

/** The exact inverse of `selectionToParams`. */
export function selectionFromParams(params: URLSearchParams): MatchupSelection {
  const selection: MatchupSelection = { ...EMPTY_SELECTION, bans: [] };
  for (const field of SCALARS) {
    selection[field] = params.get(field) || null;
  }
  selection.bans = [...new Set(params.getAll("ban").filter(Boolean))].sort();
  selection.pool_scope_id = params.get("pool_scope") || EMPTY_SELECTION.pool_scope_id;
  return selection;
}

export function fetchMatchupContract(signal?: AbortSignal) {
  return get<MatchupContract>("/contract", signal);
}

export function fetchMatchup(selection: MatchupSelection, signal?: AbortSignal) {
  const params = selectionToParams(selection);
  const qs = params.toString();
  return get<MatchupResponse>(`/explore${qs ? `?${qs}` : ""}`, signal);
}

// --- selection edits --------------------------------------------------------
//
// Changing an upstream choice must clear what it invalidated. A new team means
// the old player is no longer that team's; a new player means the old champion
// is no longer from that player's demonstrated picks. Left to the component
// these rules would be repeated at each control, so they live here once.

type SideId = "a" | "b";

const TEAM_FIELD = { a: "team_a", b: "team_b" } as const;
const PLAYER_FIELD = { a: "player_a", b: "player_b" } as const;
const CHAMPION_FIELD = { a: "champion_a", b: "champion_b" } as const;

export function withTeam(selection: MatchupSelection, side: SideId, teamKey: string | null): MatchupSelection {
  return {
    ...selection,
    [TEAM_FIELD[side]]: teamKey,
    [PLAYER_FIELD[side]]: null,
    [CHAMPION_FIELD[side]]: null,
  };
}

/** A lane change invalidates BOTH sides' players — the lane is shared. */
export function withLane(selection: MatchupSelection, lane: Lane | null): MatchupSelection {
  return {
    ...selection,
    lane,
    player_a: null,
    player_b: null,
    champion_a: null,
    champion_b: null,
  };
}

export function withPlayer(selection: MatchupSelection, side: SideId, page: string | null): MatchupSelection {
  return { ...selection, [PLAYER_FIELD[side]]: page, [CHAMPION_FIELD[side]]: null };
}

/** The cheap edit the Explorer exists for: swap a champion, keep everything
 *  else. Nothing upstream is invalidated, so nothing else is cleared. */
export function withChampion(selection: MatchupSelection, side: SideId, key: string | null): MatchupSelection {
  return { ...selection, [CHAMPION_FIELD[side]]: key };
}

/**
 * Toggle one ban. Banning a champion that is currently SELECTED does not
 * unselect it — the server reports `champion_banned` as a conflict and the UI
 * shows it, because silently dropping a reader's selection is worse than
 * telling them the two choices disagree.
 */
export function withBanToggled(selection: MatchupSelection, key: string): MatchupSelection {
  const bans = new Set(selection.bans);
  if (bans.has(key)) bans.delete(key);
  else bans.add(key);
  return { ...selection, bans: [...bans].sort() };
}

export function withPoolScope(selection: MatchupSelection, scopeId: string): MatchupSelection {
  // The pool scope re-draws both demonstrated pools, so a champion chosen from
  // the old pool may not be in the new one. It is kept: "he did not play this
  // in 2026" is a real answer, and the server flags it rather than erasing it.
  return { ...selection, pool_scope_id: scopeId };
}
