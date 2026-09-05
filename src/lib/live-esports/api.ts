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

/**
 * What KIND of match this is (LIVE1 Phase 4B1). Every field is nullable and
 * every one is an upstream FIELD rather than an inference:
 *
 * - `league.scope` derives from getLeagues' `region` (`INTERNATIONAL` vs a
 *   geography), so domestic/international is read, never guessed from a
 *   league code.
 * - `stage.name` / `round_name` come from getStandingsV3 and exist only for
 *   BRACKET matches, because upstream publishes match ids for brackets and
 *   not for groups. A regular-season game legitimately has no stage and
 *   falls back to `block_name` — the schedule's own label ("Week 12").
 */
export type LiveCompetition = {
  league: {
    slug: string | null;
    name: string | null;
    /** Upstream verbatim: "INTERNATIONAL" | "KOREA" | "EMEA" | … */
    region: string | null;
    scope: "domestic" | "international" | null;
  };
  tournament: {
    id: string | null;
    /** "Split 3 2026" */
    name: string | null;
    slug: string | null;
    season_name: string | null;
    split_name: string | null;
  };
  stage: {
    /** "Playoffs" | "Play-Ins" | "Swiss" — bracket matches only. */
    name: string | null;
    slug: string | null;
    section_name: string | null;
    section_type: string | null;
    /** "Finals" | "Upper Bracket - Semifinals" | "Round 1" */
    round_name: string | null;
    /** Always present from the schedule: "Week 12" | "Play-Ins". */
    block_name: string | null;
  };
};

export type LiveGameSummary = {
  game_id: string;
  match_id: string;
  league: { slug: string | null; name: string | null };
  block_name: string | null;
  /** Optional: a backend older than Phase 4B1 does not send it. */
  competition?: LiveCompetition | null;
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

/* ── Phase 4B2 match insights ────────────────────────────────────────────────
 * Deterministic facts derived on read from the frames, derived events and
 * player rows LIVE1 already stores. No model, no estimate, no prediction —
 * every number traces to telemetry, and the backend ships its own thresholds
 * in `definitions` so this client never hardcodes one.
 *
 * These are a backend read model rather than viewer arithmetic because the
 * public endpoints cannot support them honestly: `/games/{id}` caps events at
 * 25 while a real game carries 28-58 in its last five minutes, and the gold
 * series is downsampled for the chart, which moves both a peak lead's
 * timestamp and the interval a swing spans.
 */

export type InsightSide = "blue" | "red" | null;

/** `t` is seconds since the first stored frame — the gold series' own clock. */
export type GoldLead = {
  diff: number;
  side: InsightSide;
  gold: number;
  /** Under the backend's `min_lead_gold`: say "even", not a precise-looking number. */
  even: boolean;
  t: number;
  frame_ts: string;
};

export type PeakLead = {
  gold: number;
  t: number;
  frame_ts: string;
  meaningful: boolean;
};

export type GoldSwing = {
  side: "blue" | "red";
  gold: number;
  from_t: number;
  to_t: number;
  from_frame_ts: string;
  to_frame_ts: string;
  duration_seconds: number;
  from_diff: number;
  to_diff: number;
};

export type GoldMomentum = {
  window_seconds: number;
  /** The stored telemetry is shorter than the window — a short game. */
  partial: boolean;
  covered_seconds: number;
  diff: number;
  side: InsightSide;
  gold: number;
  even: boolean;
  from_t: number;
  to_t: number;
};

export type LeadChange = {
  t: number;
  frame_ts: string;
  to_side: "blue" | "red";
};

export type ObjectiveTally = {
  kills: number;
  towers: number;
  inhibitors: number;
  dragons: number;
  barons: number;
};

export type ObjectiveWindow = {
  window_seconds: number;
  events: number;
  /** False when the game has no stored frame to anchor the window on. */
  usable: boolean;
  blue: ObjectiveTally;
  red: ObjectiveTally;
};

export type InsightPlayer = {
  participant_id: number | null;
  side: InsightSide;
  role: string | null;
  name: string | null;
  summoner_name: string | null;
  champion: string | null;
  total_gold: number | null;
  creep_score: number | null;
};

export type RoleGap = {
  role: string;
  gold_diff: number;
  side: InsightSide;
  gold: number;
  cs_diff: number | null;
  blue: InsightPlayer;
  red: InsightPlayer;
};

export type MatchInsightsResponse = {
  enabled: boolean;
  generated_at: string;
  game_id: string;
  availability: string;
  freshness: LiveFreshness;
  retention: string | null;
  final: boolean;
  definitions: {
    min_lead_gold: number;
    swing_window_seconds: number;
    min_swing_gold: number;
    recent_windows_seconds: number[];
    objective_event_types: string[];
    time_basis: string;
    window_anchor: string;
  };
  coverage: {
    gold_samples: number;
    first_frame_ts: string | null;
    last_frame_ts: string | null;
    elapsed_seconds: number | null;
    events: number;
  };
  gold: {
    current_lead: GoldLead | null;
    largest_lead: { blue: PeakLead | null; red: PeakLead | null };
    biggest_swing: GoldSwing | null;
    momentum: GoldMomentum[];
    lead_changes: LeadChange[];
  };
  objectives: ObjectiveWindow[];
  players: {
    top_gold: InsightPlayer | null;
    role_gaps: RoleGap[];
    biggest_role_gap: RoleGap | null;
    /** False when upstream did not publish one player per role per side. */
    role_mapping_complete: boolean;
    roles_compared: number;
  };
};

export function fetchGameInsights(gameId: string): Promise<MatchInsightsResponse> {
  return getJson(`/api/live-esports/games/${encodeURIComponent(gameId)}/insights`);
}

/* ── Archive browsing (`/history`) ───────────────────────────────────────────
 * The third listing shape, and both existing ones are wrong for browsing:
 * `/live` is bounded to what is on now plus a six-game tail, so 750+ stored
 * games cannot be reached from the viewer, and `/games` serves the whole
 * catalogue as one 958 KB payload that must never face a reader.
 *
 * Rows are compact by construction — no frames, no events, no player rows. The
 * match centre fetches all of that only when a game is actually opened.
 */

/** Deterministic, from the number of frames the store holds for the game.
 *  `full` ⇒ a real timeline; `final_snapshot` ⇒ one frame, so the gold chart
 *  and objective timeline will be empty however the row is labelled. */
export type TelemetryDepth = "none" | "final_snapshot" | "partial" | "full";

export type ArchiveTelemetry = {
  frame_count: number;
  event_count: number;
  depth: TelemetryDepth;
  has_timeline: boolean;
};

export type ArchiveTeam = {
  name: string | null;
  code: string | null;
  esports_team_id: string | null;
  series_wins: number | null;
  kills: number | null;
};

export type ArchiveGame = {
  game_id: string;
  match_id: string | null;
  scheduled_start: string | null;
  /** The value the ordering and the cursor actually used. */
  sort_ts: string | null;
  league: LiveCompetition["league"];
  tournament: LiveCompetition["tournament"];
  stage: LiveCompetition["stage"];
  best_of: number | null;
  game_number: number | null;
  teams: { blue: ArchiveTeam; red: ArchiveTeam };
  patch_version: string | null;
  availability: string;
  final: boolean;
  /** Never claimed for a game that is not final, and never inferred from
   *  kills — the backend returns null rather than guess. */
  winner: "blue" | "red" | null;
  telemetry: ArchiveTelemetry;
};

export type ArchiveFilters = {
  league?: string | null;
  tournament?: string | null;
  team?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  status?: "final" | "unfinished" | null;
  depth?: "full" | null;
};

export type ArchiveResponse = {
  enabled: boolean;
  generated_at: string;
  games: ArchiveGame[];
  /** Absent on the last page. Opaque — pass it back verbatim. */
  next_cursor: string | null;
  total: number;
  limit: number;
  filters: Required<ArchiveFilters>;
};

export type ArchiveFacets = {
  enabled: boolean;
  generated_at: string;
  leagues: { slug: string; name: string; games: number }[];
  /** `league_slug` disambiguates the five separate "Summer 2026" tournaments. */
  tournaments: { id: string; name: string | null; league_slug: string | null; games: number }[];
  teams: { id: string; name: string | null; code: string | null; games: number }[];
  date_range: { from: string | null; to: string | null };
  depth_thresholds: { full_timeline_min_frames: number };
};

export function archiveQueryString(
  filters: ArchiveFilters,
  opts: { cursor?: string | null; limit?: number } = {},
): string {
  const q = new URLSearchParams();
  // Only real values are sent, so an untouched filter never narrows the query
  // and the URL stays readable enough to share.
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, String(v));
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function fetchArchive(
  filters: ArchiveFilters,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<ArchiveResponse> {
  return getJson(`/api/live-esports/history${archiveQueryString(filters, opts)}`);
}

export function fetchArchiveFacets(): Promise<ArchiveFacets> {
  return getJson("/api/live-esports/history/filters");
}
