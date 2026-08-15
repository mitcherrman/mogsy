/**
 * LIVE1 dev API client — normalized live esports state from the combat
 * backend's /api/live-esports routes (separate live_esports.db store).
 * Diagnostic surface only; no auth, read-only.
 */
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export type LiveFreshness = {
  label:
    | "live_fresh"
    | "delayed"
    | "stale"
    | "stale_source_failing"
    | "no_stats"
    | "no_data"
    | "final";
  seconds_since_success: number | null;
  source_frame_ts: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
};

export type LiveTeamSummary = {
  name: string | null;
  code: string | null;
  esports_team_id: string | null;
  resolved_page: string | null;
  series_wins: number | null;
};

export type LiveGameSummary = {
  game_id: string;
  match_id: string;
  league: { slug: string | null; name: string | null };
  block_name: string | null;
  best_of: number | null;
  game_number: number | null;
  teams: { blue: LiveTeamSummary; red: LiveTeamSummary };
  patch_version: string | null;
  game_state: string | null;
  availability: string;
  availability_detail: string | null;
  scheduled_start: string | null;
  first_frame_ts: string | null;
  freshness: LiveFreshness;
};

export type LiveTeamState = {
  esports_team_id: string | null;
  kills: number | null;
  total_gold: number | null;
  towers: number | null;
  inhibitors: number | null;
  barons: number | null;
  dragons: string[];
  frame_ts: string | null;
};

export type LiveEvent = {
  id: number;
  frame_ts: string;
  event_type: string;
  side: string | null;
  participant_id: number | null;
  count: number | null;
  detail: string | null;
};

export type LivePlayer = {
  participant_id: number;
  side: string | null;
  esports_player_id: string | null;
  summoner_name: string | null;
  champion_id: string | null;
  role: string | null;
  resolved_player_page: string | null;
  resolved_player_name: string | null;
  resolution_method: string | null;
  resolved_champion_name: string | null;
  level: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  total_gold: number | null;
  creep_score: number | null;
  current_health: number | null;
  max_health: number | null;
  attack_damage: number | null;
  ability_power: number | null;
  armor: number | null;
  magic_resistance: number | null;
  attack_speed: number | null;
  wards_placed: number | null;
  wards_destroyed: number | null;
  kill_participation: number | null;
  champion_damage_share: number | null;
  items: number[] | null;
  abilities: string[] | null;
};

export type LiveGamesResponse = {
  enabled: boolean;
  generated_at: string;
  games: LiveGameSummary[];
};

export type LiveGameDetailResponse = {
  enabled: boolean;
  generated_at: string;
  game: LiveGameSummary;
  team_state: Partial<Record<"blue" | "red", LiveTeamState>>;
  recent_events: LiveEvent[];
};

export type LivePlayersResponse = {
  enabled: boolean;
  generated_at: string;
  game_id: string;
  availability: string;
  freshness: LiveFreshness;
  identity_resolution: { resolved: number; total: number; rate: number | null };
  players: LivePlayer[];
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function fetchLiveGames(): Promise<LiveGamesResponse> {
  return getJson("/api/live-esports/games");
}

export function fetchLiveGame(gameId: string): Promise<LiveGameDetailResponse> {
  return getJson(`/api/live-esports/games/${encodeURIComponent(gameId)}`);
}

export function fetchLivePlayers(gameId: string): Promise<LivePlayersResponse> {
  return getJson(`/api/live-esports/games/${encodeURIComponent(gameId)}/players`);
}

/* ── Phase 4A bounded read models ────────────────────────────────────────────
 * `/games` returns the whole catalogue (63 KB in production, growing with
 * every archived game) and is unusable for a 10-second poll. The viewer uses
 * these bounded reads instead.
 */

export type LiveFeedResponse = {
  enabled: boolean;
  generated_at: string;
  /** Currently receiving frames. A row merely LABELLED live but stale for
   * hours lands in `recent` instead — the backend decides, not the UI. */
  live: LiveGameSummary[];
  recent: LiveGameSummary[];
  limits: { live: number; recent: number };
};

export type GoldPoint = {
  ts: string;
  /** Seconds since the first stored frame. */
  t: number | null;
  blue: number;
  red: number;
  /** blue - red */
  diff: number;
};

export type GoldSeriesResponse = {
  enabled: boolean;
  generated_at: string;
  game_id: string;
  availability: string;
  freshness: LiveFreshness;
  retention: string | null;
  points: number;
  downsampled: boolean;
  series: GoldPoint[];
};

export function fetchLiveFeed(): Promise<LiveFeedResponse> {
  return getJson("/api/live-esports/live");
}

export function fetchGoldSeries(gameId: string): Promise<GoldSeriesResponse> {
  return getJson(`/api/live-esports/games/${encodeURIComponent(gameId)}/gold`);
}
