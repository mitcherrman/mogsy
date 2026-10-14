// ---------------------------------------------------------------------------
// Client for a tournament context (DCGI1; v2 for Worlds 2026, PW4-B):
//   GET /api/live-esports/tournament/{context_id}
//
// One request answers the whole page. `context` is the backend's editorial
// registry (identity, stage venues, canonical team keys, the lineup each team
// registered FOR THIS EVENT, the Worlds relation); `state` is derived on every
// request from upstream's own getSchedule for the event's league (match
// states, results, Swiss records from completed matches only, upstream's
// knockout placement). Nothing here is computed from guesses, and the page
// never draws a standing the backend did not serve.
//
// TWO CONTRACTS, BRANCHED EXPLICITLY. `tournament_context_v1` (DCGI) is read
// exactly as before. `tournament_context_v2` (Worlds 2026, backend PW4-A) is a
// strict superset: a Play-In stage, the phases `play_in` / `between_stages` /
// `unknown`, upstream standings (bracket cells, slot origins, Swiss rounds),
// schedule coverage and per-source freshness. Any other version is refused as
// unsupported, and a body without its version's shape is refused as
// malformed: the page says so instead of half-drawing an event.
// ---------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";

import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export const TOURNAMENT_POLL_MS = 120_000;

export type LineupRole = "top" | "jungle" | "mid" | "bot" | "support";

export interface TournamentLineupSlot {
  role: LineupRole;
  /** Canonical `player_lp_page`. */
  player_key: string;
  handle: string;
  /** Set only where the event lineup is verified to differ from the team's
   *  ordinary roster, e.g. "Replaces STEPZ for DCGI". */
  change: string | null;
}

export interface TournamentParticipant {
  /** Upstream schedule code, unique within the event. */
  code: string;
  /** Canonical `esports_teams.lp_page`. */
  team_key: string;
  region: string;
  lineup: TournamentLineupSlot[];
}

export interface TournamentStage {
  key: "swiss" | "knockout" | string;
  name: string;
  block_names: string[];
  starts: string;
  ends: string;
  venue: string;
  format_note: string;
}

export interface TournamentRelatedEvent {
  name: string;
  league_slug: string;
  starts: string;
  ends: string;
  relation: string;
}

export interface TournamentContext {
  context_id: string;
  name: string;
  short_name: string;
  league: { slug: string; id: string };
  tournament: { id: string; slug: string };
  starts: string;
  ends: string;
  regions: string[];
  stages: TournamentStage[];
  participants: TournamentParticipant[];
  related: TournamentRelatedEvent[];
  sources: string[];
  notes: string[];
}

export type TournamentMatchState = "completed" | "live" | "upcoming";

export interface TournamentMatchTeam {
  code: string | null;
  upstream_name: string | null;
  team_key: string | null;
  tbd: boolean;
  game_wins: number;
  outcome: "win" | "loss" | null;
}

export interface TournamentMatch {
  match_id: string;
  scheduled_start: string;
  stage: string | null;
  block_name: string | null;
  best_of: number | null;
  state: TournamentMatchState;
  teams: [TournamentMatchTeam, TournamentMatchTeam];
  winner_code: string | null;
  live1_game_ids: string[];
}

export interface SwissRecord {
  code: string;
  team_key: string;
  wins: number;
  losses: number;
  played: number;
}

export type TournamentPhase = "pre_event" | "swiss" | "knockout" | "complete";

export interface TournamentState {
  phase: TournamentPhase;
  next_match_id: string | null;
  matches: TournamentMatch[];
  swiss_records: SwissRecord[];
  knockout_teams: string[];
  counts: { matches: number; completed: number; live: number };
  warnings: { kind: string; code?: string | null; name?: string | null }[];
}

/** The v1 contract (DCGI). */
export interface TournamentResponse {
  contract_version: string;
  generated_at: string;
  source: string;
  source_ok: boolean;
  stale: boolean;
  fetched_at: string | null;
  context: TournamentContext;
  state: TournamentState;
}

/* ── v2 (backend PW4-A) ──────────────────────────────────────────────────── */

export const CONTRACT_V1 = "tournament_context_v1";
export const CONTRACT_V2 = "tournament_context_v2";

/** Results phase (v2). `between_stages` carries `phase_detail`; `unknown`
 *  means no schedule could be read at all, and is never a pre-event state. */
export type TournamentPhaseV2 =
  | "pre_event"
  | "play_in"
  | "swiss"
  | "knockout"
  | "between_stages"
  | "complete"
  | "unknown";

export const PHASES_V2: readonly TournamentPhaseV2[] = [
  "pre_event",
  "play_in",
  "swiss",
  "knockout",
  "between_stages",
  "complete",
  "unknown",
];

/** What the official calendar says (UTC dates), independent of results. */
export type CalendarStage = "pre_event" | "play_in" | "swiss" | "knockout" | "between_stages" | "post_event";

/** Where a bracket slot's team comes from, per upstream standings: a draw, or
 *  the winner / loser of an earlier match. */
export interface SlotSource {
  kind: "draw" | "winner_of" | "loser_of" | "unknown";
  match_id?: string;
}

export interface TournamentMatchTeamV2 extends TournamentMatchTeam {
  /** Null when standings do not name this match, or are unavailable. */
  slot: SlotSource | null;
}

export interface MatchBracketCell {
  section: string | null;
  /** Upstream's cell name: "Upper Bracket - Semifinals", "Round 3", "Finals". */
  cell: string | null;
  cell_slug: string | null;
}

export interface TournamentMatchV2 extends Omit<TournamentMatch, "teams"> {
  teams: [TournamentMatchTeamV2, TournamentMatchTeamV2];
  bracket: MatchBracketCell | null;
  swiss_round: number | null;
}

export type LineupStatus = "registered" | "not_certified" | (string & {});

export interface TournamentParticipantV2 extends TournamentParticipant {
  esports_team_id?: string;
  /** The event's official display name ("Team Liquid Alienware"). Not identity. */
  name?: string;
  entry_stage?: "play_in" | "swiss" | (string & {});
  swiss_tier?: number;
  /** The seed the primer wrote as a placeholder ("CBLOL1"). */
  qualification?: string;
  lineup_status?: LineupStatus;
}

export type StageBracket = "double_elimination" | "swiss" | "single_elimination" | (string & {});

export interface TournamentStageV2 extends TournamentStage {
  bracket?: StageBracket;
  standings_slug?: string;
  expected_matches?: number;
  wins_to_advance?: number;
  losses_to_eliminate?: number;
}

export interface TournamentContextV2 extends Omit<TournamentContext, "stages" | "participants"> {
  stages: TournamentStageV2[];
  participants: TournamentParticipantV2[];
}

export interface StageRecord {
  code: string;
  team_key: string;
  wins: number;
  losses: number;
  played: number;
}

/** "standings": upstream's bracket still has the shape the context was
 *  certified with; "incomplete": its shape changed; "unavailable": no
 *  standings. Only "standings" lets eliminations and a stage winner stand. */
export type BracketAuthority = "standings" | "incomplete" | "unavailable";

export interface BracketSummary {
  stage: string;
  bracket: StageBracket | null;
  bracket_authority: BracketAuthority;
  /** Standings order (schedule order without standings). */
  match_ids: string[];
  records: StageRecord[];
  eliminated: string[];
  winner_code: string | null;
  unverified_completed_matches: number;
}

export type SwissStatus = "advanced" | "eliminated" | "active";

export interface SwissRecordV2 extends SwissRecord {
  status: SwissStatus;
}

export interface SwissSummary {
  wins_to_advance: number | null;
  losses_to_eliminate: number | null;
  /** Empty until the first Swiss result: never a 0–0 table. */
  records: SwissRecordV2[];
  /** Mapped codes upstream has written into Swiss matches. */
  placed_codes: string[];
  /** Upstream's own round cells: "1" → match ids. */
  rounds: Record<string, string[]>;
  unverified_completed_matches: number;
}

export interface ScheduleCoverage {
  pages_read: number | null;
  page_failure: unknown;
  found_matches: number;
  /** "unverified" = standings unavailable, and `complete` is null. */
  basis: "standings" | "unverified";
  complete: boolean | null;
  expected_matches: number | null;
  missing_match_ids: string[];
  unlisted_match_ids: string[];
}

export interface TournamentWarning {
  kind: string;
  [key: string]: unknown;
}

export interface TournamentStateV2 {
  phase: TournamentPhaseV2;
  phase_basis: "results" | "no_schedule" | (string & {});
  phase_detail: { completed_stage: string; next_stage: string } | null;
  calendar_stage: CalendarStage | (string & {});
  next_match_id: string | null;
  matches: TournamentMatchV2[];
  swiss_records: SwissRecordV2[];
  knockout_teams: string[];
  counts: { matches: number; completed: number; live: number };
  play_in: BracketSummary;
  swiss: SwissSummary;
  knockout: BracketSummary & { champion_code: string | null };
  coverage: ScheduleCoverage;
  warnings: TournamentWarning[];
}

export interface SourceFreshness {
  ok: boolean;
  stale: boolean;
  fetched_at: string | null;
  pages_read?: number | null;
  page_failure?: unknown;
}

export interface TournamentResponseV2 {
  contract_version: typeof CONTRACT_V2;
  generated_at: string;
  source: string;
  source_ok: boolean;
  stale: boolean;
  fetched_at: string | null;
  sources?: { schedule?: SourceFreshness; standings?: SourceFreshness };
  context: TournamentContextV2;
  state: TournamentStateV2;
}

/** Either contract, as served. Branch with `isTournamentV2`. */
export type AnyTournamentResponse = TournamentResponse | TournamentResponseV2;

export function isTournamentV2(r: AnyTournamentResponse): r is TournamentResponseV2 {
  return r.contract_version === CONTRACT_V2;
}

export class TournamentNotFound extends Error {}

/** A contract version (or v2 phase) this page does not know how to read. */
export class TournamentUnsupported extends Error {
  constructor(readonly version: string) {
    super(`unsupported tournament contract: ${version}`);
  }
}

/** A body without its declared contract's shape. */
export class TournamentMalformed extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function v1Shape(body: Record<string, unknown>): boolean {
  const ctx = body.context;
  const state = body.state;
  return isObj(ctx) && Array.isArray(ctx.participants) && isObj(state) && Array.isArray(state.matches);
}

function v2Shape(body: Record<string, unknown>): boolean {
  if (!v1Shape(body)) return false;
  const ctx = body.context as Record<string, unknown>;
  const state = body.state as Record<string, unknown>;
  if (!Array.isArray(ctx.stages) || !Array.isArray(ctx.regions) || !isStr(ctx.name)) return false;
  if (!isObj(ctx.league) || !isStr(ctx.league.slug) || !isStr(ctx.starts) || !isStr(ctx.ends)) return false;
  if (!(ctx.stages as unknown[]).every((s) => isObj(s) && isStr(s.key))) return false;
  if (!(ctx.participants as unknown[]).every((p) => isObj(p) && isStr(p.code) && isStr(p.team_key))) return false;
  for (const k of ["play_in", "swiss", "knockout", "coverage"]) if (!isObj(state[k])) return false;
  const swiss = state.swiss as Record<string, unknown>;
  if (!Array.isArray(swiss.records) || !isObj(swiss.rounds) || !Array.isArray(swiss.placed_codes)) return false;
  for (const k of ["play_in", "knockout"]) {
    const b = state[k] as Record<string, unknown>;
    if (!Array.isArray(b.match_ids) || !Array.isArray(b.eliminated) || !isStr(b.bracket_authority)) return false;
  }
  if (!Array.isArray(state.warnings) || !Array.isArray(state.knockout_teams)) return false;
  return (state.matches as unknown[]).every(
    (m) =>
      isObj(m) &&
      isStr(m.match_id) &&
      isStr(m.scheduled_start) &&
      Array.isArray(m.teams) &&
      m.teams.length === 2 &&
      m.teams.every(isObj) &&
      Array.isArray(m.live1_game_ids),
  );
}

/**
 * Reads a tournament body by its declared contract. A body without a version
 * is read as v1, the shape DCGI1 shipped. Throws `TournamentUnsupported` for a
 * version or v2 phase this page cannot read, and `TournamentMalformed` for a
 * body without its version's shape.
 */
export function parseTournament(body: unknown, path = "tournament"): AnyTournamentResponse {
  if (!isObj(body)) throw new TournamentMalformed(`${path} -> unexpected payload`);
  const version = body.contract_version;
  if (version === undefined || version === CONTRACT_V1) {
    if (!v1Shape(body)) throw new TournamentMalformed(`${path} -> unexpected payload`);
    return body as unknown as TournamentResponse;
  }
  if (version !== CONTRACT_V2) throw new TournamentUnsupported(String(version));
  if (!v2Shape(body)) throw new TournamentMalformed(`${path} -> unexpected ${CONTRACT_V2} payload`);
  const phase = (body.state as Record<string, unknown>).phase;
  if (!PHASES_V2.includes(phase as TournamentPhaseV2)) {
    throw new TournamentUnsupported(`${CONTRACT_V2} phase ${String(phase)}`);
  }
  return body as unknown as TournamentResponseV2;
}

export async function fetchTournament(contextId: string): Promise<AnyTournamentResponse> {
  const path = `/api/live-esports/tournament/${encodeURIComponent(contextId)}`;
  const res = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) throw new TournamentNotFound(contextId);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  // A 200 of an unexpected shape (an older backend, a proxy page) is an error
  // for the caller, never a half-drawn page.
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new TournamentMalformed(`${path} -> not JSON`);
  }
  return parseTournament(body, path);
}

/** Errors a retry cannot fix. */
const permanent = (error: unknown) =>
  error instanceof TournamentNotFound ||
  error instanceof TournamentUnsupported ||
  error instanceof TournamentMalformed;

/** One tournament read's query: shared by `useTournament` and by callers that
 *  read several contexts at once (`useQueries`, HUB-NEXT1), so every reader of
 *  a context uses the same cache entry and the same retry rule. */
export function tournamentQuery(contextId: string | undefined) {
  return {
    queryKey: ["live-esports", "tournament", contextId],
    queryFn: () => fetchTournament(contextId as string),
    enabled: Boolean(contextId),
    refetchInterval: TOURNAMENT_POLL_MS,
    // A failed refresh keeps the last good answer on screen (react-query's
    // default), and the page marks it with the backend's own `stale` flags.
    retry: (count: number, error: unknown) => !permanent(error) && count < 2,
  };
}

export function useTournament(contextId: string | undefined) {
  return useQuery(tournamentQuery(contextId));
}
