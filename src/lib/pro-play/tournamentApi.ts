// ---------------------------------------------------------------------------
// Client for a tournament context (DCGI1):
//   GET /api/live-esports/tournament/{context_id}
//
// One request answers the whole page. `context` is the backend's editorial
// registry (identity, stage venues, canonical team keys, the lineup each team
// registered FOR THIS EVENT, the Worlds relation); `state` is derived on every
// request from upstream's own getSchedule for the event's league (match
// states, results, Swiss records from completed matches only, upstream's
// knockout placement). Nothing here is computed from guesses, and the page
// never draws a standing the backend did not serve.
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

export class TournamentNotFound extends Error {}

export async function fetchTournament(contextId: string): Promise<TournamentResponse> {
  const path = `/api/live-esports/tournament/${encodeURIComponent(contextId)}`;
  const res = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) throw new TournamentNotFound(contextId);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  const body = (await res.json()) as Partial<TournamentResponse> | null;
  // A 200 of an unexpected shape (an older backend, a proxy page) is an error
  // for the caller, never a half-drawn page.
  if (
    !body?.context ||
    !Array.isArray(body.context.participants) ||
    !body.state ||
    !Array.isArray(body.state.matches)
  ) {
    throw new Error(`${path} -> unexpected payload`);
  }
  return body as TournamentResponse;
}

export function useTournament(contextId: string | undefined) {
  return useQuery({
    queryKey: ["live-esports", "tournament", contextId],
    queryFn: () => fetchTournament(contextId as string),
    enabled: Boolean(contextId),
    refetchInterval: TOURNAMENT_POLL_MS,
    retry: (count, error) => !(error instanceof TournamentNotFound) && count < 2,
  });
}
