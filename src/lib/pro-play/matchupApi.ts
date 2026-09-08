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
  // Lane mode has to SAY so once the board became the default. A lane
  // selection with no lane and no player yet — exactly what the "Lane
  // explorer" tab produces — carries no lane-only key, so without this the
  // reader would be bounced straight back to the board and the tab would be
  // unreachable. Harmless on a fully specified lane URL, which `modeFromParams`
  // would have read as lane anyway.
  params.set("mode", "lane");
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

// ---------------------------------------------------------------------------
// Team mode — the five-lane board (/api/pro-play/matchup/team).
//
// A SECOND ENDPOINT, ONE CONTRACT. `/contract` still serves the vocabulary for
// both modes (see `MatchupContract.team_mode`); only the resolve call differs,
// because a team board takes none of lane mode's six lane/player/champion
// parameters and returns five lanes instead of two sides. The page's `mode`
// lives in the URL and picks which fetch to make.
//
// THE SAME FOUR THINGS THIS CLIENT MUST NOT SAY still apply, and one more:
// team mode must never read as a PREDICTION. The server ships
// `notes.team_mode` denying it in words; this file renders that note and
// invents no wording of its own.
// ---------------------------------------------------------------------------

/** The three states a lane can be in. Never collapsed into two. */
export const LANE_CLEAR_STARTER = "clear_starter";
export const LANE_TIMESHARE = "timeshare";
export const LANE_UNCOVERED = "uncovered";

export type LaneState = "clear_starter" | "timeshare" | "uncovered";

/** Warning codes the board reports rather than smoothing over. */
export const WARN_LANE_UNCOVERED = "lane_uncovered";
export const WARN_LANE_TIMESHARE = "lane_timeshare";
export const WARN_ROSTER_PARTIAL = "roster_partial";
export const WARN_TEAM_ABSENT = "team_absent_from_scope";
export const WARN_SAME_TEAM = "same_team_selected";

export interface LaneRecord {
  scope_id: string;
  scope_label: string;
  participation: "participated" | "did_not_participate";
  games: number;
  wins: number | null;
  losses: number | null;
  /** null over zero games, never 0. */
  win_rate: number | null;
  champion_pool_size: number;
  /** The server's own side-by-side sentence. Printed, never reworded. */
  note: string;
}

export interface LaneCandidate {
  player_lp_page: string;
  display_name: string;
  games: number;
  wins: number;
  share_of_team_games: number | null;
  first_played_at: string | null;
  last_played_at: string | null;
  /** What the ROSTER authority said about games already played. Never a
   *  claim about who will start. */
  is_starter: boolean;
  declared_member: boolean | null;
  record: LaneRecord | null;
  pool: DemonstratedPool | null;
  /** The pool FETCH was bounded, not the roster. This candidate's full,
   *  unfiltered pool is one lane drill-down away. */
  pool_omitted: boolean;
}

export interface LaneSide {
  team_key: string;
  lane: Lane;
  state: LaneState;
  starter: string | null;
  ambiguous: boolean;
  ambiguous_reason: string | null;
  lane_covered: boolean;
  candidates: LaneCandidate[];
  candidates_total: number;
  candidates_with_pool: number;
  /** The only player a drill-down may pre-fill; null for a timeshare and for
   *  an uncovered lane. */
  unambiguous_player: string | null;
}

export interface LaneDrilldown {
  lane: Lane;
  selection: MatchupSelection;
  player_a_prefilled: boolean;
  player_b_prefilled: boolean;
}

export interface LaneRow {
  lane: Lane;
  a: LaneSide | null;
  b: LaneSide | null;
  drilldown: LaneDrilldown | null;
}

export interface TeamChampionSummary {
  team_key: string;
  scope_id: string;
  scope_label: string;
  participation: "participated" | "did_not_participate";
  team_games_in_scope: number;
  wins: number | null;
  losses: number | null;
  win_rate: number | null;
  champion_pool_size: number;
  top_champions: PoolChampion[];
  note: string;
}

export interface TeamHeader {
  team_key: string;
  display_name: string;
  focus: FocusTeamRow;
  roster: Roster;
  completeness: Roster["completeness"];
  team_games_in_scope: number;
  declared_corroboration: Roster["declared_corroboration"];
  champion_summary: TeamChampionSummary | null;
}

export interface MatchupWarning {
  code: string;
  team_key?: string;
  lane?: Lane;
  detail: string;
}

export interface TeamSelection {
  team_a: string | null;
  team_b: string | null;
  bans: string[];
  scope_id: string;
  league_filter?: string;
}

export interface TeamMatchupResponse {
  contract_version: string;
  comparison_contract_version: string;
  mode: "team";
  comparison_kind: "players_side_by_side";
  semantics: "independent_side_by_side";
  /** Always false, on a screen showing ten records at once — which is exactly
   *  why it is asserted before any of them render. */
  head_to_head: false;
  selection: TeamSelection & { mode: "team" };
  scope: { scope_id: string; scope_label: string };
  lane_order: Lane[];
  lanes: LaneRow[];
  teams: { a: TeamHeader | null; b: TeamHeader | null };
  bans: { champions: string[]; note: string };
  warnings: MatchupWarning[];
  resolved: boolean;
  /** How many champions to show before "expand". A DISPLAY point served by
   *  the server; the payload still carries every row. */
  pool_preview: number;
  pool_candidates_per_lane: number;
  notes: MatchupNotes & {
    team_mode: string;
    pool_bound: string;
    team_summary: string;
  };
}

/** Empty team selection: the board's first paint. */
export const EMPTY_TEAM_SELECTION: TeamSelection = {
  team_a: null,
  team_b: null,
  bans: [],
  scope_id: "current_2026",
};

export type MatchupMode = "lane" | "team";

/**
 * Team-mode params, for BOTH the request and the address bar — the same rule
 * lane mode follows, so a configured board is one shareable URL.
 *
 * `mode=team` is written only for the page; the API knows its own mode from
 * which endpoint was called, and `stripMode` removes it from the request.
 */
export function teamSelectionToParams(selection: TeamSelection, withMode = true): URLSearchParams {
  const params = new URLSearchParams();
  if (withMode) params.set("mode", "team");
  if (selection.team_a) params.set("team_a", selection.team_a);
  if (selection.team_b) params.set("team_b", selection.team_b);
  // Sorted, so two people who banned the same champions in a different order
  // share one link.
  for (const ban of [...new Set(selection.bans)].filter(Boolean).sort()) {
    params.append("ban", ban);
  }
  if (selection.scope_id && selection.scope_id !== EMPTY_TEAM_SELECTION.scope_id) {
    params.set("scope", selection.scope_id);
  }
  return params;
}

/** The exact inverse. */
export function teamSelectionFromParams(params: URLSearchParams): TeamSelection {
  return {
    team_a: params.get("team_a") || null,
    team_b: params.get("team_b") || null,
    bans: [...new Set(params.getAll("ban").filter(Boolean))].sort(),
    scope_id: params.get("scope") || EMPTY_TEAM_SELECTION.scope_id,
  };
}

/** Which board the URL asks for. Lane mode is the default, so every Phase 1
 *  link ever shared keeps resolving to the lane explorer. */
/** Keys only the lane explorer can hold. A URL carrying any of them was built
 *  by, or for, the lane view. */
const LANE_ONLY_PARAMS = ["lane", "player_a", "player_b", "champion_a", "champion_b"];

/**
 * Which board a URL asks for.
 *
 * PHASE 3 FLIPPED THE DEFAULT, WITHOUT BREAKING A SINGLE SHARED LINK. The
 * five-lane board is the flagship experience, so a bare
 * `/lol/pro-play/matchup` — and a link carrying only teams, bans or a scope —
 * now opens on it rather than on an empty configuration form.
 *
 * Phase 1 links keep working because every one of them names a lane: the
 * drilldown builds `lane=`, and a hand-made lane URL needs at least a lane or
 * a player to mean anything. Any lane-only key present ⇒ lane mode, exactly
 * as before. An explicit `mode=` still wins over both, so the two mode tabs
 * can address either board unambiguously.
 */
export function modeFromParams(params: URLSearchParams): MatchupMode {
  const explicit = params.get("mode");
  if (explicit === "team") return "team";
  if (explicit === "lane") return "lane";
  return LANE_ONLY_PARAMS.some((k) => params.get(k)) ? "lane" : "team";
}

export function fetchTeamMatchup(selection: TeamSelection, signal?: AbortSignal) {
  const qs = teamSelectionToParams(selection, false).toString();
  return get<TeamMatchupResponse>(`/team${qs ? `?${qs}` : ""}`, signal);
}

// --- team-mode selection edits ---------------------------------------------

export function withTeamSide(
  selection: TeamSelection,
  side: SideId,
  teamKey: string | null,
): TeamSelection {
  // Nothing downstream to clear: the board holds no player or champion
  // choice, which is the whole reason team mode has no `needs`.
  return { ...selection, [side === "a" ? "team_a" : "team_b"]: teamKey };
}

export function withTeamScope(selection: TeamSelection, scopeId: string): TeamSelection {
  return { ...selection, scope_id: scopeId };
}

export function withTeamBanToggled(selection: TeamSelection, key: string): TeamSelection {
  const bans = new Set(selection.bans);
  if (bans.has(key)) bans.delete(key);
  else bans.add(key);
  return { ...selection, bans: [...bans].sort() };
}

/** Swap the two teams. A board is symmetric, and reading it the other way
 *  round is a real thing to want. */
export function withTeamsSwapped(selection: TeamSelection): TeamSelection {
  return { ...selection, team_a: selection.team_b, team_b: selection.team_a };
}

/**
 * The lane drill-down, as a URL for the SAME page in lane mode.
 *
 * Built from the server's own `drilldown.selection` — the teams, the lane, the
 * bans and the scope carry over, and a player appears only where the roster
 * authority named one. Nothing here decides any of that.
 */
export function drilldownUrl(path: string, drilldown: LaneDrilldown): string {
  const selection: MatchupSelection = {
    ...EMPTY_SELECTION,
    ...drilldown.selection,
    bans: drilldown.selection.bans ?? [],
  };
  const qs = selectionToParams(selection).toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

/** Back to the board from a lane view, keeping the teams, bans and scope. */
export function teamModeUrl(path: string, selection: TeamSelection): string {
  const qs = teamSelectionToParams(selection).toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

/** The team selection implied by a lane selection — used by the "back to the
 *  five-lane board" link so a round trip loses nothing but the lane. */
export function teamSelectionFromLane(selection: MatchupSelection): TeamSelection {
  return {
    team_a: selection.team_a,
    team_b: selection.team_b,
    bans: selection.bans,
    scope_id: selection.pool_scope_id,
  };
}
