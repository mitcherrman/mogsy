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

/**
 * One team the board can be pointed at.
 *
 * NOT a `FocusTeamRow`. The Worlds focus set is an editorial watchlist; this
 * pool is "can a five-lane board be built for this org honestly", and a team
 * admitted on measured data carries no focus status at all. Rendering a
 * `status` here would put a Worlds-shaped word on twenty-two teams nobody
 * claimed anything about.
 */
export interface ExplorerTeamRow {
  team_key: string;
  /** The org's registry name. Never an owner short code — "KT" and "DK" each
   *  match several real orgs. */
  label: string;
  group: string;
  /** "worlds_focus_set" | "data_admitted". */
  source: string;
  in_worlds_focus_set: boolean;
  admission: {
    games: number;
    lanes_covered: number;
    league_slug: string;
    measured_on: string;
  } | null;
  note: string | null;
}

export interface ExplorerTeamPool {
  explorer_pool_version: string;
  sources: string[];
  admission_policy: Record<string, string | number | boolean>;
  groups: string[];
  teams: ExplorerTeamRow[];
  team_count: number;
  focus_set_count: number;
  data_admitted_count: number;
  note: string;
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
  explorer_pool: string;
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
  /** What the team selector renders. `focus_set` is a strict subset of it. */
  explorer_teams: ExplorerTeamPool;
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
  /** Why this team is selectable. Present whenever `team` is. */
  explorer: ExplorerTeamRow | null;
  /** The Worlds watchlist entry, or null for a team admitted on data alone.
   *  Null is the honest answer to "is Mogzy watching this org for Worlds" —
   *  never render it as a status. */
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
  explorer: ExplorerTeamRow;
  /** Null for a team in the pool on measured evidence alone. */
  focus: FocusTeamRow | null;
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
  /** Step 3: which dossier is open, and against whom. Optional and additive —
   *  a board with no study parses and renders exactly as it did before, and
   *  every URL shared before Step 3 still resolves. See `StudySelection`. */
  study?: StudySelection | null;
  /** Step 4: which historical meeting is open. Optional and additive in
   *  exactly the way `study` is — see `MeetingSelection`. */
  meeting?: MeetingSelection | null;
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
  /** STEP 4: the times these two teams met inside this scope, newest first.
   *  Served ON THE BOARD rather than from a route of its own — the board has
   *  already named the only three things the question takes, and a sibling
   *  request could return an answer that disagrees with the lanes above it.
   *  Empty when either side is unresolved. */
  meetings: MeetingSummary[];
  meetings_total: number;
  meetings_limit: number;
  notes: MatchupNotes & {
    team_mode: string;
    pool_bound: string;
    team_summary: string;
    meetings: string;
  };
}

/** Empty team selection: the board's first paint. */
export const EMPTY_TEAM_SELECTION: TeamSelection = {
  team_a: null,
  team_b: null,
  bans: [],
  scope_id: "current_2026",
  study: null,
  meeting: null,
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
  // Step 3's open dossier. Written for the address bar and stripped from the
  // request by `boardRequestSelection` — the board's five lanes do not change
  // because one dossier is open, and refetching them on every tile click would
  // be a regression dressed up as consistency.
  studyToParams(params, selection.study ?? null);
  // Step 4's open meeting, written for the address bar and stripped from the
  // request by `boardRequestSelection` for the same reason the study is.
  return meetingToParams(params, selection.meeting ?? null);
}

/** The exact inverse. */
export function teamSelectionFromParams(params: URLSearchParams): TeamSelection {
  return {
    team_a: params.get("team_a") || null,
    team_b: params.get("team_b") || null,
    bans: [...new Set(params.getAll("ban").filter(Boolean))].sort(),
    scope_id: params.get("scope") || EMPTY_TEAM_SELECTION.scope_id,
    study: studyFromParams(params),
    meeting: meetingFromParams(params),
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
  // The study is stripped: `/team` has no parameter for it and the board it
  // returns does not change because one dossier is open. Sending it would make
  // every tile click a new request URL and refetch five lanes for nothing.
  const qs = teamSelectionToParams(boardRequestSelection(selection), false).toString();
  return get<TeamMatchupResponse>(`/team${qs ? `?${qs}` : ""}`, signal);
}

// --- team-mode selection edits ---------------------------------------------

export function withTeamSide(
  selection: TeamSelection,
  side: SideId,
  teamKey: string | null,
): TeamSelection {
  // A new team is a new board, and an open dossier belongs to the old one.
  // Repointing it at a player who may not be on this team would put one
  // player's figures under another's name; dropping it is the honest default,
  // and it is the same rule `withTeam` follows in lane mode.
  return {
    ...selection,
    [side === "a" ? "team_a" : "team_b"]: teamKey,
    study: null,
    // A meeting is a meeting BETWEEN TWO TEAMS. Change either of them and the
    // open one is not a meeting of the pair on screen — leaving it would put
    // one pair's games under another pair's board.
    meeting: null,
  };
}

export function withTeamScope(selection: TeamSelection, scopeId: string): TeamSelection {
  // A selection made in one scope is not a selection in another: the same
  // rule, and the same reason, as a team change. The meetings LIST is rebuilt
  // from the new scope, so an open meeting found in the old one may not be in
  // the section behind it any more.
  return { ...selection, scope_id: scopeId, study: null, meeting: null };
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
  // The study SURVIVES a swap: reading the same board the other way round does
  // not change which player is on which champion, and dropping an open dossier
  // for a purely presentational flip would be a surprise, not a safeguard.
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
    // The lane explorer holds no study and no meeting, so crossing into the
    // board opens neither.
    study: null,
    meeting: null,
  };
}

// --- player x champion dossier ----------------------------------------------
//
// The drawer behind a champion tile. A THIRD ROUTE over the same composition:
// `/explore` is lane-shaped, `/team` returns five lanes, and this returns ONE
// player-and-champion with an opponent axis neither of them carries.
//
// EVERY DEFINITION IS SERVED, NOT WRITTEN HERE. `definitions` and
// `unavailable_metrics` come from the server for the same reason the contract's
// notes do: a sentence that lives in the frontend can be reworded by a
// frontend, and these are the words the semantics are guaranteed in.

/** A record over a set of games. `win_rate` is null over zero games — never
 *  0.0, which would render as a result. */
export interface DossierRecord {
  games: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  first_played_at: string | null;
  last_played_at: string | null;
}

/** One game in the recent-form strip, newest first. */
export interface DossierFormGame {
  canonical_game_id: string;
  win: boolean;
  result: "W" | "L";
  game_date: string | null;
  team_key: string;
  opponent_team_key: string | null;
  league_slug: string | null;
  tournament_id: string | null;
}

/**
 * Drafts in which the OPPOSING team banned this champion, over the drafts whose
 * opposing-side ban record exists. `games_without_ban_record` is the difference,
 * reported so a reader can tell a genuine 0/8 from an 0/8 that is really 0/2.
 *
 * Never a motive: this is contextual draft behaviour, not "banned because of
 * this player".
 */
export interface DossierBanPressure {
  banned_in: number;
  drafts_with_ban_record: number;
  games_without_ban_record: number;
  rate: number | null;
}

/**
 * The Oracle's Elixir figures for one slice, and the coverage that produced
 * them.
 *
 * A SEPARATE OBJECT FROM `DossierRecord`, DELIBERATELY. The record's games,
 * wins and win rate are Leaguepedia's and cover every game in the slice. These
 * cover only the games Oracle's Elixir enriched — OE reaches ~80% of the
 * canonical corpus and nothing before 2014 — so they arrive with their own
 * denominator and must never be printed against the record's game count.
 *
 * EVERY VALUE IS NULLABLE AND NULL IS NEVER ZERO. A slice with no enriched
 * games is not a player who dealt no damage; the client renders a dash.
 */
export interface DossierStatCoverage {
  /** Canonical games in this slice — equals the record's `games`. */
  total_games: number;
  /** Those carrying Oracle's Elixir statistics. */
  stat_games: number;
  missing_stat_games: number;
}

/** Raw components and the derived ratio. `perfect` is true only when deaths
 *  were genuinely zero across games that exist — an empty slice also has a
 *  null ratio, and the two must not be rendered the same way. */
export interface DossierKda {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  ratio: number | null;
  perfect: boolean;
  games: number;
}

/** A per-minute rate, weighted by game length, with the games it covers. A
 *  row can be enriched and still be missing one column, so this count is not
 *  always `coverage.stat_games`. */
export interface DossierRate {
  value: number | null;
  games: number;
}

export interface DossierStatistics {
  coverage: DossierStatCoverage;
  kda: DossierKda;
  cs_per_min: DossierRate;
  gold_per_min: DossierRate;
  damage_per_min: DossierRate;
}

/** A metric the authority cannot serve, named rather than silently missing. */
export interface UnavailableMetric {
  metric: string;
  label: string;
  reason: string;
}

export interface PlayerChampionDossier {
  contract_version: string;
  entity: {
    kind: "player_champion_dossier";
    player_lp_page: string;
    display_name: string;
    champion_key: string;
    teams_in_scope: string[];
    opponent_team_key: string | null;
    opponent_display_name: string | null;
  };
  scope: ScopeDescriptor;
  league_filter: string;
  /** Always false. Two columns of one player's record is not a score between
   *  two players, and the drawer renders nothing that implies one. */
  head_to_head: false;
  participation: string;
  /** Y in "X / Y total games". */
  player_games_in_scope: number;
  /** The player's games against that opponent on ANY champion; null when no
   *  opponent was supplied. */
  player_games_vs_opponent: number | null;
  /** Null exactly when the player did not participate in the scope — which is
   *  a different fact from a record of zeroes. */
  overall: DossierRecord | null;
  versus_opponent: DossierRecord | null;
  champion_share: number | null;
  recent_form: DossierFormGame[];
  /** The true number of games on the champion; `recent_form` is capped. */
  recent_form_total: number;
  ban_pressure: {
    overall: DossierBanPressure;
    versus_opponent: DossierBanPressure | null;
  } | null;
  /** Oracle's Elixir statistics, a sibling of `ban_pressure` and null for the
   *  same reason: the player was not in this scope at all. `versus_opponent`
   *  is null when no opponent was supplied. */
  statistics: {
    overall: DossierStatistics;
    versus_opponent: DossierStatistics | null;
  } | null;
  unavailable_metrics: UnavailableMetric[];
  definitions: Record<string, string>;
}

export interface DossierQuery {
  player_lp_page: string;
  champion: string;
  opponent_team_key: string | null;
  scope_id: string;
}

export function fetchPlayerChampionDossier(query: DossierQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({
    player: query.player_lp_page,
    champion: query.champion,
    scope: query.scope_id,
  });
  // Omitted rather than sent empty: the server distinguishes "no opponent
  // selected" (the column is absent) from "an opponent they never met" (a real
  // zero record), and an empty string would blur the two.
  if (query.opponent_team_key) params.set("opponent", query.opponent_team_key);
  return get<PlayerChampionDossier>(`/player-champion?${params.toString()}`, signal);
}

// ---------------------------------------------------------------------------
// Step 3 — the exact matchup study (/api/pro-play/matchup/exact).
//
// A FOURTH ROUTE, AND THE FIRST THAT IS A REAL HEAD-TO-HEAD. The dossier's
// opponent axis is a TEAM: "Doran's Olaf, including against Gen.G". This one
// joins on the GAME — the subject's row and the opposing row must share a
// canonical game, carry their two named champions, and sit on opposing teams.
// Nothing qualifies through roster membership or through the two champions
// appearing in separate games, and no looser team-level sample is substituted
// for an empty one. `head_to_head` is TRUE here and only here; the board and
// the dossier still assert false and this client must keep the two apart.
//
// EVERY DEFINITION AND EVERY LIMIT IS THE SERVER'S, including the sentence
// explaining why some real examples cannot be opened on the board.
// ---------------------------------------------------------------------------

/** Tier labels for `other_pro_examples`, served rather than invented. Every
 *  one names a counted relation, never a judgement. */
export const REL_SAME_SUBJECT = "same_subject_player";
export const REL_SAME_OPPONENT = "same_opposing_player";
export const REL_BOARD_TEAM = "involves_a_board_team";
export const REL_OTHER = "other_professional_example";

export interface ExactRecord {
  games: number;
  wins: number;
  losses: number;
  /** Null over zero games — never 0.0, which would render as a result. */
  win_rate: number | null;
  first_played_at: string | null;
  last_played_at: string | null;
}

export interface ExactMeeting {
  canonical_game_id: string;
  game_date: string | null;
  /** From the SUBJECT's side. */
  result: "W" | "L";
  win: boolean;
  subject_team_key: string;
  opposing_team_key: string;
  league_slug: string | null;
  tournament_id: string | null;
  /** STEP 4: the MEETING this game was played in, and where in it. Both are
   *  columns already on the game the record counted, so this is a projection
   *  and not a second read — and it is what lets an aggregate claim be opened
   *  into the evidence underneath it. */
  match_id: string | null;
  game_number: number | null;
}

/** One named player's standing in the scope. Three states, kept apart so a
 *  zero can say WHICH zero it is. */
export interface ExactPlayerFacts {
  player_lp_page: string;
  display_name: string;
  champion_key: string;
  participation: "participated" | "did_not_participate";
  games_in_scope: number;
  champion_games_in_scope: number;
  teams_in_qualifying_games: string[];
}

/**
 * Where a side journey lands, and whether it can.
 *
 * `explorer_navigable` is false when either team is outside the Explorer's
 * team pool — the orgs whose five-lane board the corpus can build. That is a
 * data boundary, not the Worlds watchlist: widening the watchlist to make a
 * link work would have been a claim about Worlds. The example is still real
 * evidence — it is served, not filtered — so the UI renders it as a row with
 * the server's reason instead of as a link that would 404.
 */
export interface ExampleNavigation {
  team_a: string;
  team_b: string;
  scope_id: string;
  lane: string | null;
  subject_player_lp_page: string;
  subject_champion: string;
  opposing_player_lp_page: string;
  opposing_champion: string;
  explorer_navigable: boolean;
  teams_outside_explorer_pool: string[];
}

export interface ExampleSide {
  player_lp_page: string;
  display_name: string;
  champion_key: string;
  team_key: string;
  team_display_name: string;
  role: string | null;
}

export interface OtherProExample {
  relation: string;
  subject: ExampleSide;
  opposing: ExampleSide;
  record: ExactRecord;
  most_recent: ExactMeeting;
  navigation: ExampleNavigation;
}

/**
 * STEP 7 — the aggregate scouting figures over the exact sample.
 *
 * MEASURED OVER THE SAME GAMES AS `exact.record` AND NO OTHERS. Not this
 * champion against the opposing team, not these two players regardless of
 * champion, not this champion matchup played by other people. Each of those
 * is a bigger and easier number, and each answers a different question from
 * the heading above it.
 *
 * EVERY FIGURE CARRIES ITS OWN DENOMINATOR, because a three-game record can
 * carry a KDA on three games and a 15-minute figure on two. `null` is never
 * zero: a lane with no recorded checkpoint is not a level lane.
 */
export interface ExactStatCoverage {
  /** The record's own count. Every other number here is <= this. */
  exact_games: number;
  /** Those carrying statistics at all. */
  stat_games: number;
  missing_stat_games: number;
  /**
   * Why each exact game did or did not yield a 15-minute figure. Sums to
   * `exact_games`. The keys are the server's, and the four that are not
   * `available` are four genuinely different absences — none of them a zero.
   */
  at15_games: Partial<Record<ExactAt15State, number>>;
}

export type ExactAt15State =
  | "available"
  | "not_reached"
  | "unavailable"
  | "opponent_unresolved"
  /** The subject faced somebody ELSE in lane in this game. Real and not rare:
   *  a champion played in two positions produces genuinely cross-lane exact
   *  pairs, and a figure printed under two names whose second half came from
   *  a third player would be a false sentence. */
  | "lane_opponent_is_another_player";

/** Raw components and the derived ratio, from TOTALS and never from the mean
 *  of per-game ratios. `perfect` is true only over games that exist — an empty
 *  sample also has a null ratio and the two must not render the same way. */
export interface ExactKda {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  ratio: number | null;
  perfect: boolean;
  games: number;
}

/** The MEDIAN per-game difference at 15 minutes, read from the subject's side:
 *  positive is a lead, negative a deficit, and 0 a measured tie. Null when no
 *  game in the sample produced one. */
export interface ExactAt15Median {
  median: number | null;
  games: number;
}

/** CS at 15 minutes, which is not published for every matchup. `supported` is
 *  false when the server has ruled the figure out — a support matchup, or a
 *  sample whose positions are not recorded — and `unsupported_reason` is the
 *  server's own sentence for it. */
export interface ExactAt15CsMedian extends ExactAt15Median {
  supported: boolean;
  unsupported_reason: string | null;
}

export interface ExactStatistics {
  coverage: ExactStatCoverage;
  kda: ExactKda;
  gold_diff_at15: ExactAt15Median;
  cs_diff_at15: ExactAt15CsMedian;
  /** The positions the subject was actually recorded in across the sample. */
  subject_positions: string[];
  definitions: Record<string, string>;
}

export interface ExactMatchupPayload {
  contract_version: string;
  kind: "exact_player_champion_matchup";
  scope: ScopeDescriptor;
  league_filter: string;
  /** TRUE, and only here. Two named players on two named champions in the
   *  same games really is a head-to-head record. */
  head_to_head: true;
  subject: ExactPlayerFacts;
  opposing: ExactPlayerFacts;
  exact: {
    record: ExactRecord;
    meetings: ExactMeeting[];
    meetings_total: number;
    /** Newest first, from the subject's side. */
    result_sequence: Array<"W" | "L">;
    most_recent: ExactMeeting | null;
  };
  /** STEP 7. A SIBLING OF `exact`, not a widening of `exact.record`. The
   *  record covers every exact game; these cover fewer, and the 15-minute
   *  figures fewer again. */
  statistics: ExactStatistics;
  /** Every qualifying pair of these two champions in scope, exact included. */
  champion_matchup_games_in_scope: number;
  other_pro_examples: OtherProExample[];
  example_limit: number;
  board_team_keys: string[];
  unavailable_metrics: UnavailableMetric[];
  definitions: Record<string, string>;
}

export interface ExactMatchupQuery {
  subject_player: string;
  subject_champion: string;
  opposing_player: string;
  opposing_champion: string;
  scope_id: string;
  /** The teams on screen. Affects ONE TIER of the example ordering and
   *  nothing else — never which games qualify. */
  board_team_keys?: string[];
}

export function fetchExactMatchup(query: ExactMatchupQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({
    subject_player: query.subject_player,
    subject_champion: query.subject_champion,
    opposing_player: query.opposing_player,
    opposing_champion: query.opposing_champion,
    scope: query.scope_id,
  });
  // Repeated, not comma-joined: a team key may contain punctuation, and
  // splitting on a separator that can appear inside a key is how
  // "LYON (2024 American Team)" becomes two teams.
  for (const key of query.board_team_keys ?? []) {
    if (key) params.append("board_team", key);
  }
  return get<ExactMatchupPayload>(`/exact?${params.toString()}`, signal);
}

// --- the study selection, in the URL ---------------------------------------
//
// THE URL IS THE STATE, AND STEP 3 IS WHY THAT HAD TO EXTEND. Step 2 held the
// open dossier in React state, which was enough while the only way in was a
// click on the board. A side journey has to establish a DIFFERENT board plus a
// player, a champion, an opposing player and an opposing champion in one
// navigation — and the board already re-reads its whole selection from the
// query string, so the smallest coherent extension was four more optional keys
// rather than a second navigation mechanism beside the one that exists.
//
// It is additive: every URL ever shared still parses, `mode`, teams, bans and
// scope are untouched, and a board with no study reads exactly as before.

export interface StudySelection {
  subject_player: string;
  subject_champion: string;
  /** Null until the reader picks the other side of the matchup. */
  opposing_player: string | null;
  opposing_champion: string | null;
}

const STUDY_PARAMS = {
  subject_player: "focus_player",
  subject_champion: "focus_champion",
  opposing_player: "vs_player",
  opposing_champion: "vs_champion",
} as const;

export function studyToParams(params: URLSearchParams, study: StudySelection | null) {
  if (!study) return params;
  params.set(STUDY_PARAMS.subject_player, study.subject_player);
  params.set(STUDY_PARAMS.subject_champion, study.subject_champion);
  // An opposing side is only half-chosen for a moment; writing an empty key
  // would make "not chosen yet" indistinguishable from "chosen as nothing".
  if (study.opposing_player) params.set(STUDY_PARAMS.opposing_player, study.opposing_player);
  if (study.opposing_champion) {
    params.set(STUDY_PARAMS.opposing_champion, study.opposing_champion);
  }
  return params;
}

export function studyFromParams(params: URLSearchParams): StudySelection | null {
  const subjectPlayer = params.get(STUDY_PARAMS.subject_player);
  const subjectChampion = params.get(STUDY_PARAMS.subject_champion);
  // Both halves of the subject or nothing: a champion with no player is not a
  // dossier, and half a question would open a drawer with no answer in it.
  if (!subjectPlayer || !subjectChampion) return null;
  return {
    subject_player: subjectPlayer,
    subject_champion: subjectChampion,
    opposing_player: params.get(STUDY_PARAMS.opposing_player) || null,
    opposing_champion: params.get(STUDY_PARAMS.opposing_champion) || null,
  };
}

/**
 * The board's own selection, with the study removed.
 *
 * THE BOARD FETCH MUST NOT DEPEND ON THE STUDY. Five lanes, ten rosters and
 * six champion pools do not change because a reader opened one dossier, and a
 * request keyed on the study would refetch all of it on every tile click.
 */
export function boardRequestSelection(selection: TeamSelection): TeamSelection {
  // The MEETING goes with the study, for the same reason: `/team` has no
  // parameter for either, and the five lanes do not change because a reader
  // opened one historical meeting underneath them.
  const { study: _study, meeting: _meeting, ...board } = selection;
  return board;
}

export function withStudySubject(
  selection: TeamSelection,
  subject: { player: string; champion: string } | null,
): TeamSelection {
  // Closing the dossier closes the meeting opened FROM it. Nothing else on
  // screen would still be naming it, and a meeting shell with no question
  // above it is a match page — which is exactly what this is not.
  if (!subject) return { ...selection, study: null, meeting: null };
  // A new subject is a new question: the opposing side chosen for the previous
  // one is not an answer to this one, so it goes rather than being re-pointed
  // at different numbers.
  return {
    ...selection,
    study: {
      subject_player: subject.player,
      subject_champion: subject.champion,
      opposing_player: null,
      opposing_champion: null,
    },
    // A meeting reached as evidence for one exact matchup is not evidence for
    // a different one.
    meeting: null,
  };
}

export function withStudyOpponent(
  selection: TeamSelection,
  opponent: { player: string | null; champion: string | null },
): TeamSelection {
  if (!selection.study) return selection;
  return {
    ...selection,
    study: {
      ...selection.study,
      opposing_player: opponent.player,
      // A different opposing PLAYER invalidates the champion chosen from the
      // previous one's pool, exactly as `withPlayer` does upstream.
      opposing_champion:
        opponent.player === selection.study.opposing_player ? opponent.champion : null,
    },
    // Same rule as a new subject: the source meeting belonged to the exact
    // matchup that was on screen, and that question just changed.
    meeting: null,
  };
}

/**
 * Where clicking an "Other pro example" lands: the example's own matchup, with
 * both sides of the study already established.
 *
 * The bans carry over because they are the reader's, not the example's. The
 * scope comes from the example — the server put it there, and an example found
 * in 2026 is a 2026 example.
 */
export function sideJourneySelection(
  current: TeamSelection,
  navigation: ExampleNavigation,
): TeamSelection {
  return {
    team_a: navigation.team_a,
    team_b: navigation.team_b,
    bans: current.bans,
    scope_id: navigation.scope_id,
    study: {
      subject_player: navigation.subject_player_lp_page,
      subject_champion: navigation.subject_champion,
      opposing_player: navigation.opposing_player_lp_page,
      opposing_champion: navigation.opposing_champion,
    },
    // A side journey is a new board AND a new study; a meeting held open
    // across it would belong to neither.
    meeting: null,
  };
}


// --- Step 4: historical meetings -------------------------------------------
//
// A MEETING IS ONE `match_id` — Leaguepedia's series identity, on every one of
// the 113,815 canonical games. "Meeting" and not "series" because 59% of them
// carry exactly ONE game: Bo1 leagues are the majority of the corpus, and a
// layer that called every match_id a series would be inventing a best-of
// around a single game. The server reports `kind`, and this client renders the
// word it is given rather than choosing one.
//
// NOT A MATCH-HISTORY PAGE. The board's section is date, score and event; the
// shell below it is the games in order with who played and what they took.
// Per-player K/D/A, CS, gold, damage, vision, objectives and any draft ORDER
// are deliberately absent — see `unavailable_metrics`, which names each in
// words rather than leaving it missing.

export const MEETING_SERIES = "series";
export const MEETING_SINGLE_GAME = "single_game";
export type MeetingKind = typeof MEETING_SERIES | typeof MEETING_SINGLE_GAME;

export interface MeetingTeamRef {
  team_key: string;
  display_name: string;
  /** Whether the BOARD can be pointed at this org. A meeting names the teams
   *  that played it, which is a different question from the team pool. */
  explorer_navigable: boolean;
}

/** One side of the score, as an ordered pair. The winner is first, so a client
 *  renders `T1 2–1 Gen.G` without deciding anything itself. */
export interface MeetingScoreEntry {
  team_key: string;
  wins: number;
}

/** A row in the board's compact section. */
export interface MeetingSummary {
  match_id: string;
  kind: MeetingKind;
  game_count: number;
  started_at: string | null;
  league_slug: string | null;
  tournament_id: string | null;
  score_line: MeetingScoreEntry[];
  undecided: number;
  /** Null when the meeting is drawn, or when the games still unresolved could
   *  close the gap. A lead is not a result. */
  winner_team_key: string | null;
  teams: MeetingTeamRef[];
  /** One patch, or null when the meeting straddled two. */
  patch: string | null;
  patches: string[];
  /** Set only on a one-game meeting: there is no series above it to choose
   *  from, so it is entered with its game already named. */
  single_game_number: number | null;
}

export interface MeetingParticipant {
  team_key: string | null;
  display_name: string | null;
  role: string | null;
  side: string | null;
  player_lp_page: string | null;
  /** The champion this player took. This IS the pick; there is no separate
   *  trustworthy pick projection and no pick ORDER anywhere in the corpus. */
  champion_key: string | null;
  win: boolean | null;
}

export interface MeetingGame {
  canonical_game_id: string;
  game_number: number;
  game_date: string | null;
  patch: string | null;
  blue_team_key: string | null;
  red_team_key: string | null;
  winner_team_key: string | null;
  decided: boolean;
  /** Null where the statistics do not reach — 80% coverage, and a zero would
   *  be a lie about a game that was played. */
  duration_seconds: number | null;
  /** The players who ACTUALLY played, read off the game's own rows, so a
   *  substitution appears in the game it happened in. */
  participants: MeetingParticipant[];
}

export interface MeetingPayload {
  match_id: string;
  kind: MeetingKind;
  game_count: number;
  teams: MeetingTeamRef[];
  league_slug: string | null;
  league_name: string | null;
  tournament_id: string | null;
  tournament_name: string | null;
  started_at: string | null;
  patch: string | null;
  patches: string[];
  score_line: MeetingScoreEntry[];
  undecided: number;
  winner_team_key: string | null;
  scope_id: string | null;
  /** Whether the meeting falls inside the scope the board is reading. It
   *  REPORTS; it never filters. Dropping games from a meeting because of a
   *  scope would print a score that was never played. */
  in_scope: boolean | null;
  games: MeetingGame[];
  unavailable_metrics: UnavailableMetric[];
}

/**
 * Which meeting is open, in the URL.
 *
 * THE SAME EXTENSION `study` ALREADY MADE, and deliberately not a new one. Two
 * more optional query keys on the board's existing selection: `meeting` is the
 * `match_id`, `game` a `game_number` within it — never a bare
 * `canonical_game_id`, because a number is legible in a URL and the pair is
 * unique across the whole corpus (measured: zero duplicate
 * `(match_id, game_number)` in 113,815 games).
 *
 * `game_number` is carried now so a one-game meeting can be entered with its
 * game already named; the per-game state itself is Step 5.
 */
export interface MeetingSelection {
  match_id: string;
  game_number: number | null;
}

const MEETING_PARAMS = { match_id: "meeting", game_number: "game" } as const;

export function meetingToParams(params: URLSearchParams, meeting: MeetingSelection | null) {
  if (!meeting) return params;
  params.set(MEETING_PARAMS.match_id, meeting.match_id);
  if (meeting.game_number != null) {
    params.set(MEETING_PARAMS.game_number, String(meeting.game_number));
  }
  return params;
}

export function meetingFromParams(params: URLSearchParams): MeetingSelection | null {
  const matchId = params.get(MEETING_PARAMS.match_id);
  // A GAME WITHOUT A MEETING IS MEANINGLESS and is dropped, the same way
  // `boardRequestSelection` strips what a request has no parameter for: a
  // game number identifies nothing without the meeting it numbers.
  if (!matchId) return null;
  const raw = params.get(MEETING_PARAMS.game_number);
  const gameNumber = raw == null ? null : Number.parseInt(raw, 10);
  return {
    match_id: matchId,
    game_number: Number.isFinite(gameNumber as number) && (gameNumber as number) > 0
      ? (gameNumber as number)
      : null,
  };
}

/** Open a meeting. The study above it is KEPT: the reader arrived at this
 *  meeting through that question, and closing it behind them would lose their
 *  place. */
export function withMeeting(
  selection: TeamSelection,
  meeting: MeetingSelection | null,
): TeamSelection {
  return { ...selection, meeting };
}

export function fetchMeeting(
  matchId: string,
  scopeId: string,
  signal?: AbortSignal,
): Promise<MeetingPayload> {
  const params = new URLSearchParams({ match_id: matchId, scope: scopeId });
  return get<MeetingPayload>(`/series?${params.toString()}`, signal);
}

// --- Step 5: one game ------------------------------------------------------
//
// THE TERMINAL LAYER of the drilldown, and the first payload in the Explorer
// that carries a combat statistic:
//
//   team matchup -> player x champion -> exact matchup -> MEETING -> GAME
//
// IDENTIFIED BY `match_id` + `game_number`, which is the state the board's
// selection already holds — Step 4 added both keys and only rendered the
// first. So Step 5 is a render and a fetch, not a state change.
//
// UNAVAILABLE IS NOT ZERO, and the payload's SHAPE is what says so. A game the
// corpus never enriched has `stats_available: false` and player rows whose
// `stats` is `null` — never a row of zeroes, which is a real scoreline
// somebody could have had. And because `kda_ratio: null` only ever appears
// INSIDE a non-null `stats`, it means exactly one thing: a deathless game.
//
// NO DRAFT ORDER. `sequence` is -1 on every pick/ban row in the corpus. Bans
// arrive as an alphabetically sorted set per side with `ordered: false`, and
// nothing in this client may lay them out as a phase or a rotation.

/** One lane checkpoint. `opp_*` is the direct lane opponent's VALUE — OE never
 *  publishes their name, and the opponent's identity is on the player rows of
 *  this same payload. Served for a later analysis layer; Step 5 renders none
 *  of it. */
export interface GameCheckpoint {
  gold: number | null;
  opp_gold: number | null;
  xp: number | null;
  opp_xp: number | null;
  cs: number | null;
  opp_cs: number | null;
  kills: number | null;
  opp_kills: number | null;
  deaths: number | null;
  opp_deaths: number | null;
  assists: number | null;
  opp_assists: number | null;
  /** False when the game never reached this mark — the honest shape for a
   *  22-minute game, and not a row of zeroes. */
  reached: boolean;
}

/** RAW COMPONENTS ONLY. Every field is a stored fact; a `null` here is a NULL
 *  column on an otherwise-enriched row (a 2016 game has no vision score), which
 *  is a different statement from the game carrying no statistics. */
export interface GamePlayerStats {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  double_kills: number | null;
  triple_kills: number | null;
  quadra_kills: number | null;
  penta_kills: number | null;
  first_blood_kill: number | null;
  first_blood_assist: number | null;
  first_blood_victim: number | null;
  total_cs: number | null;
  minion_kills: number | null;
  monster_kills: number | null;
  total_gold: number | null;
  earned_gold: number | null;
  gold_spent: number | null;
  damage_to_champions: number | null;
  damage_to_towers: number | null;
  vision_score: number | null;
  wards_placed: number | null;
  wards_killed: number | null;
  control_wards_bought: number | null;
  /** `(kills + assists) / deaths`, and `null` when deaths is 0 — the standard
   *  League "Perfect". Unambiguous because it only exists inside a stats
   *  object that a statless game does not have at all. */
  kda_ratio: number | null;
  checkpoints: Record<string, GameCheckpoint>;
  data_completeness: string | null;
}

/** The at-15 lane state, Step 6. Exactly one status, and a number under only
 *  one of them.
 *
 *  THE OPPONENT IS THE ONE THE PLAYER ACTUALLY FACED — the opposing row
 *  carrying the same Oracle's Elixir lane position in this same game, checked
 *  against the value OE already recorded for the subject's opponent. No
 *  roster, no starter, no board, and never Leaguepedia's role label, which
 *  disagrees with the lane actually played on real games in the corpus.
 *
 *  FOUR ABSENCES, AND NONE OF THEM IS ZERO. `gold_diff` and `cs_diff` are
 *  non-null only under `available`, so a client cannot render a gap as a
 *  level lane. A `0` here is always a measured tie. */
export type GameLaneStatus =
  | "available"
  | "not_reached"
  | "unavailable"
  | "opponent_unresolved";

export interface GameLaneOpponent {
  player_lp_page: string | null;
  team_key: string | null;
  display_name: string | null;
  champion_key: string | null;
  oe_position: string | null;
}

export interface GameLaneCheckpoint {
  /** Always 15. The other marks are served raw and rendered nowhere. */
  mark: number;
  status: GameLaneStatus;
  gold_diff: number | null;
  cs_diff: number | null;
  /** True for the support position, where the server does not publish a CS
   *  differential. Measured, not assumed — see the payload's own sentence. */
  cs_diff_suppressed: boolean;
  opponent: GameLaneOpponent | null;
}

export interface GamePlayer {
  player_lp_page: string | null;
  team_key: string | null;
  display_name: string | null;
  /** Leaguepedia's role — the one the rest of the Explorer is keyed on. */
  role: string | null;
  /** OE's own position, kept beside it rather than substituted for it. */
  oe_position: string | null;
  side: string | null;
  champion_key: string | null;
  win: boolean | null;
  /** Null when this game carries no Oracle's Elixir row. NEVER zeroes. */
  stats: GamePlayerStats | null;
  /** Present on EVERY player row, including one with no statistics — the
   *  state is about the row, and a row with nothing to say still says so. */
  lane_checkpoint: GameLaneCheckpoint;
}

export interface GameTeamRow {
  team_key: string;
  display_name: string;
  explorer_navigable: boolean;
  side: string | null;
  /** Read from the team fact table, never summed from the player rows.
   *  `turret_plates` is absent by design and never arrives. */
  objectives: Record<string, number | null>;
  firsts: Record<string, boolean | null>;
  /** The CANONICAL result, not Oracle's Elixir's. */
  win: boolean | null;
  data_completeness: string | null;
}

export interface GameBans {
  team_key: string | null;
  display_name: string | null;
  side: string | null;
  champions: string[];
  /** Always false. Sorted alphabetically precisely so no reader can mistake
   *  the list for a draft sequence. */
  ordered: boolean;
}

export interface GameDetailPayload {
  canonical_game_id: string;
  match_id: string;
  game_number: number;
  meeting: { kind: MeetingKind; game_count: number; game_numbers: number[] };
  league_slug: string | null;
  league_name: string | null;
  tournament_id: string | null;
  tournament_name: string | null;
  game_date: string | null;
  patch: string | null;
  blue_team: MeetingTeamRef & { side: string };
  red_team: MeetingTeamRef & { side: string };
  winner_team_key: string | null;
  decided: boolean;
  duration_seconds: number | null;
  scope_id: string | null;
  in_scope: boolean | null;
  stats_available: boolean;
  stat_player_rows: number;
  team_stats_available: boolean;
  /** The server's own sentence for an unstatted game. Rendered as given. */
  stats_note: string | null;
  players: GamePlayer[];
  teams: GameTeamRow[];
  bans: GameBans[];
  bans_note: string;
  /** OPERATOR DIAGNOSTIC, never a sentence for a reader. A reader did not ask
   *  about Mogzy's ingestion, and the canonical result already won. */
  diagnostics: Record<string, boolean>;
  unavailable_metrics: UnavailableMetric[];
}

/** Open a game inside the meeting that is already open.
 *
 *  THE MEETING IS PRESERVED and only `game_number` changes — a game number is
 *  a position inside a meeting and means nothing without it, which is why the
 *  two live in ONE selection key rather than two. Every Step 4 clearing rule
 *  therefore covers `game` for free: whatever drops the meeting drops the
 *  game with it, and there is no path that can strand one. */
export function withMeetingGame(
  selection: TeamSelection,
  gameNumber: number | null,
): TeamSelection {
  const meeting = selection.meeting ?? null;
  // A game with no meeting is not a state this selection can hold.
  if (!meeting) return selection;
  return { ...selection, meeting: { ...meeting, game_number: gameNumber } };
}

export function fetchGameDetail(
  matchId: string,
  gameNumber: number,
  scopeId: string,
  signal?: AbortSignal,
): Promise<GameDetailPayload> {
  const params = new URLSearchParams({
    match_id: matchId,
    game_number: String(gameNumber),
    scope: scopeId,
  });
  return get<GameDetailPayload>(`/game?${params.toString()}`, signal);
}
