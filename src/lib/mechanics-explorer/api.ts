// Typed client for the Phase 5A Mechanics Explorer API
// (GET /api/mechanics/explorer/*). Follows the mechanics-xp client pattern:
// every canonical value comes from the backend engine; this module only
// shapes requests, types responses, and performs presentation arithmetic
// (game-time parsing/formatting). No respawn or wave math lives here.
//
// Decimal values arrive as exact strings ("42.680625", "0.850") and are
// rendered verbatim — never coerced to float for display.

import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

// ---------------------------------------------------------------------------
// Shared DTOs
// ---------------------------------------------------------------------------

/** One canonical mechanic consumed by a result, with verification status. */
export interface MechanicProvenance {
  mechanic_id: string;
  /** Manifest verification status, e.g. "verified" | "unresolved". */
  status: string;
  effective_patch: string;
  verified_through: string;
  empirical_test_required: boolean;
  caveat: string;
}

export interface ExplorerRequestContext {
  patch: string;
  map: string;
  mode: string;
}

export interface ExplorerContext {
  default_patch: string;
  map: string;
  mode: string;
  unsupported_context_behavior: string;
  surfaces: {
    respawn: { endpoint: string; certified_patch_min: string; certified_patch_max: string };
    waves: { endpoint: string; certified_patch_min: string; certified_patch_max: string };
    minions: { endpoint: string; certified_patch_min: string; certified_patch_max: string };
    structures: { endpoint: string; certified_patch_min: string; certified_patch_max: string };
    supers: { endpoint: string; certified_patch_min: string; certified_patch_max: string };
  };
}

export interface RespawnResult {
  context: ExplorerRequestContext;
  input: { level: number; game_time_s: string; game_time_display: string | null };
  base_respawn_wait_s: string;
  time_increase_factor_percent: string;
  time_increase_s: string;
  duration_s: string;
  displayed_timer_s: number;
  tif_active: boolean;
  at_tif_cap: boolean;
  step_rule: string;
  boundary: { on_step_boundary: boolean; alternate_duration_s: string | null };
  explanation: string;
  provenance: MechanicProvenance[];
}

export interface WaveRef {
  wave_number: number;
  spawn_time_s: number;
  spawn_time_display: string;
  /** Present only on `next_wave_to_spawn` for game-time lookups. */
  seconds_until_spawn?: number;
}

export interface WaveCadence {
  interval_before_s: number | null;
  interval_after_s: number | null;
  is_first_wave_of_game: boolean;
  is_first_wave_of_cadence: boolean;
  is_last_wave_of_cadence: boolean;
}

export interface WaveDetail {
  wave_number: number;
  spawn_time_s: number;
  spawn_time_display: string;
  composition: Record<string, number>;
  is_cannon_wave: boolean;
  next_cannon_wave: WaveRef | null;
  cadence: WaveCadence;
  previous_wave: WaveRef | null;
  next_wave: WaveRef | null;
  provenance: MechanicProvenance[];
}

export interface WaveLookupResult {
  context: ExplorerRequestContext;
  query:
    | { by: "wave_number"; wave_number: number }
    | {
        by: "game_time";
        game_time_s: number;
        game_time_display: string;
        resolution_rule: string;
      };
  /**
   * By wave number: the requested wave. By game time: the most recent wave
   * to have spawned at or before the query time — null before 0:30.
   */
  wave: WaveDetail | null;
  next_wave_to_spawn: WaveRef | null;
  explanation: string;
  provenance: MechanicProvenance[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** API failure with the backend's machine-readable code when present. */
export class MechanicsApiError extends Error {
  /** e.g. "invalid_input" | "unsupported_patch" | "unsupported_context". */
  code: string | null;
  status: number;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "MechanicsApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * FastAPI `detail` arrives in three shapes; always surface a clean human
 * message, never stringified JSON:
 *  - Phase 5A structured: {"error": code, "message": text}
 *  - plain string (legacy endpoints)
 *  - Pydantic validation list: [{loc, msg, ...}, ...]
 */
function detailToError(detail: unknown, status: number): MechanicsApiError {
  if (typeof detail === "string" && detail) {
    return new MechanicsApiError(detail, status);
  }
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const structured = detail as { error?: unknown; message?: unknown };
    if (typeof structured.message === "string") {
      return new MechanicsApiError(
        structured.message,
        status,
        typeof structured.error === "string" ? structured.error : null,
      );
    }
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) =>
        entry && typeof entry === "object" && typeof (entry as { msg?: unknown }).msg === "string"
          ? (entry as { msg: string }).msg
          : null,
      )
      .filter((msg): msg is string => msg !== null);
    if (messages.length > 0) {
      return new MechanicsApiError(messages.join("; "), status);
    }
  }
  return new MechanicsApiError(`Request failed (${status})`, status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = (await response.json())?.detail;
    } catch {
      // no JSON body — keep the status-only message
    }
    throw detailToError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Endpoints (Phase 5B1 uses context / respawn / wave only)
// ---------------------------------------------------------------------------

const BASE = "/api/mechanics/explorer";

export function fetchExplorerContext(): Promise<ExplorerContext> {
  return request<ExplorerContext>(`${BASE}/context`);
}

export function fetchRespawn(params: { level: number; gameTimeS: number }): Promise<RespawnResult> {
  const query = new URLSearchParams({
    level: String(params.level),
    game_time_s: String(params.gameTimeS),
  });
  return request<RespawnResult>(`${BASE}/respawn?${query.toString()}`);
}

export function fetchWaveByNumber(waveNumber: number): Promise<WaveLookupResult> {
  const query = new URLSearchParams({ wave_number: String(waveNumber) });
  return request<WaveLookupResult>(`${BASE}/wave?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Phase 5B2: minion stat inspector
// ---------------------------------------------------------------------------

/**
 * One stat with an explicit certification status. `value: null` always
 * travels with `status: "unresolved"` and a backend reason — the UI must
 * render that state, never a 0 or a guess.
 */
export interface StatValue {
  value: string | null;
  status: string;
  unresolved_reason?: string;
}

/** Canonical minion vocabulary (the API also accepts the alias "cannon"). */
export const MINION_TYPES = ["melee", "caster", "siege", "super"] as const;
export type MinionTypeToken = (typeof MINION_TYPES)[number];

export interface MinionResult {
  context: ExplorerRequestContext;
  minion_type: string;
  requested_type: string;
  game_time_s: number;
  game_time_display: string;
  upgrades: {
    count: number;
    last_upgrade_at_s: number | null;
    next_upgrade_at_s: number;
  };
  stats: {
    health: StatValue;
    attack_damage: StatValue;
    armor: StatValue;
    magic_resist: StatValue;
    attack_speed: StatValue;
    attack_range: StatValue;
    movement_speed: StatValue;
    gold: StatValue;
    experience: StatValue;
  };
  health_breakdown: { base: string; from_upgrades: string; capped: boolean };
  minion_slayer: {
    has_passive: boolean;
    passive_name: string | null;
    percent_current_health: string | null;
    damage_type: string | null;
    applies_to: string;
  };
  structure_damage: Record<string, { damage_multiplier: string; mechanic_id: string }>;
  aggro: {
    attacking_minion_triggers_aggro: boolean;
    removed_in_patch: string;
    champion_triggers: string[];
    ignored_while_attacking_turret: boolean;
  };
  /** Present only for siege: the certified/unresolved AD boundary instant. */
  siege_attack_damage_transition?: {
    certified_strictly_before_s: number;
    certified_strictly_before_display: string;
    unresolved_from_display: string;
  };
  explanation: string;
  provenance: MechanicProvenance[];
}

export function fetchMinion(
  minionType: string,
  gameTimeS: number,
): Promise<MinionResult> {
  const query = new URLSearchParams({ game_time_s: String(gameTimeS) });
  return request<MinionResult>(
    `${BASE}/minions/${encodeURIComponent(minionType)}?${query.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// Phase 5B2: structure / turret inspector
// ---------------------------------------------------------------------------

export const STRUCTURE_TOKENS = [
  "turret_outer",
  "turret_inner",
  "turret_inhibitor",
  "turret_nexus",
  "inhibitor",
  "nexus",
] as const;
export type StructureToken = (typeof STRUCTURE_TOKENS)[number];

export type LaneToken = "top" | "middle" | "bottom";

export interface StructureInspectRequest {
  structure: string;
  game_time_s: number;
  lane?: LaneToken;
  bulwark?: { stacks: number; nearby_enemy_champions: number };
  overgrowth?: { team_average_level: number; seconds_since_available: number };
  backdoor?: {
    enemy_minion_nearby: boolean;
    seconds_since_minion_state_change?: number;
  };
  base_state?: {
    lanes: Partial<
      Record<
        LaneToken,
        {
          outer_turret_destroyed?: boolean;
          inner_turret_destroyed?: boolean;
          inhibitor_turret_destroyed?: boolean;
          inhibitor_destroyed?: boolean;
        }
      >
    >;
    nexus_turrets_destroyed: number;
  };
}

/** A response section that either applies (with its payload) or says why not. */
export type StructureSection<T> =
  | ({ applicable: true } & T)
  | { applicable: false; reason: string };

export interface PlateThreshold {
  index: number;
  missing_hp_fraction: string;
  remaining_hp_fraction: string;
  health_at_threshold: string;
  segment_health: string;
  destroys_turret: boolean;
  grants_bulwark_stack: boolean;
}

export interface StructureInspectResult {
  context: ExplorerRequestContext;
  identity: {
    structure: string;
    kind: string; // "turret" | "inhibitor" | "nexus"
    display_name: string;
    lane: string | null;
  };
  game_time_s: string;
  game_time_display: string | null;
  stats: {
    max_health: string;
    armor: string;
    magic_resist: string;
    // Turret-only fields:
    attack_damage?: string;
    attack_speed?: string;
    attack_range?: string;
    has_plating?: boolean;
    respawn_health_fraction?: string | null;
    // Both (nullability differs by kind):
    health_regen_per_second?: string | null;
    respawn_after_s?: string | null;
    // Building-only fields:
    last_hitter_gold?: string | null;
    count_per_team?: number;
  };
  plates: StructureSection<{
    plate_count: number;
    thresholds: PlateThreshold[];
    current_gold_per_plate: string;
    gold_decayed: boolean;
    gold_schedule: {
      base_gold: string;
      decays: boolean;
      decay_start_s?: number;
      per_minute_loss?: string;
      floor_gold?: string;
      floor_reached_at_s?: number;
    };
  }>;
  warming_up: StructureSection<{
    multipliers_by_consecutive_hit: Record<string, string>;
    reset_after_s: string;
    resets_on_target_switch: boolean;
  }>;
  penetration: {
    flat_armor_penetration_applies: boolean;
    percent_armor_penetration_applies: boolean;
    armor_reduction_applies: boolean;
    magic_penetration_applies: boolean;
    magic_penetration_moot: boolean;
    critical_strike_applies: boolean;
    life_steal_applies: boolean;
    turret_own_armor_penetration_fraction?: string;
    melee_damage_taken_multiplier?: string;
  };
  bulwark: StructureSection<{
    stacks: number;
    nearby_enemy_champions: number;
    per_stack: string;
    bonus_armor: string;
    bonus_magic_resist: string;
    duration_s: string;
    radius: string;
    durations_overlap: boolean;
  }> | null;
  overgrowth: StructureSection<{
    team_average_level: string;
    seconds_since_available: string;
    ramp_progress: string;
    damage_fraction_of_turret_max_health: string;
    damage: string;
    level_interpolation_assumed: boolean;
    suppressed_by_backdoor_protection: boolean;
  }> | null;
  backdoor: StructureSection<{
    protection_active: boolean;
    damage_reduction: string;
    damage_multiplier: string;
    applies_to_true_damage: boolean;
    reactivation_delay_s: string;
    seconds_until_active: string | null;
    explanation: string;
  }> | null;
  dependencies: {
    required_predecessors: string[];
    targetability: {
      targetable: boolean;
      blocked_by: string[];
      explanation: string;
    } | null;
  };
  explanation: string;
  provenance: MechanicProvenance[];
}

export function postStructureInspect(
  body: StructureInspectRequest,
): Promise<StructureInspectResult> {
  return request<StructureInspectResult>(`${BASE}/structures/inspect`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Phase 5B3: inhibitor / super-minion explorer
// ---------------------------------------------------------------------------

/** One lane's inhibitor timeline; omit `destroyed_at_s` for standing.
 * `respawn_at_s` defaults to the canonical 5:00 after destruction. */
export interface InhibitorTimelineInput {
  destroyed_at_s?: number;
  respawn_at_s?: number;
}

export interface SupersStateRequest {
  wave_number?: number;
  game_time_s?: number;
  inhibitors?: Partial<Record<LaneToken, InhibitorTimelineInput>>;
}

export interface SupersLaneState {
  inhibitor: {
    down_at_spawn: boolean;
    destroyed_at_s: number | null;
    respawn_at_s: number | null;
    respawn_display: string | null;
  };
  super_minion_count: number;
  suppressed_by_cutoff: boolean;
  waves_until_respawn: number | null;
  composition: Record<string, number>;
  is_cannon_wave: boolean;
  siege_replaced_by_super: boolean;
  explanation: string;
  provenance: MechanicProvenance[];
}

export interface SupersStateResult {
  context: ExplorerRequestContext;
  wave: { wave_number: number; spawn_time_s: number; spawn_time_display: string };
  derivation: {
    queried_by: "wave_number" | "game_time";
    game_time_s?: number;
    game_time_display?: string;
    resolution_rule?: string;
  };
  all_inhibitors_down_at_spawn: boolean;
  lanes: Record<LaneToken, SupersLaneState>;
  explanation: string;
}

export function postSupersState(body: SupersStateRequest): Promise<SupersStateResult> {
  return request<SupersStateResult>(`${BASE}/supers/state`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchWaveByTime(gameTimeS: number): Promise<WaveLookupResult> {
  const query = new URLSearchParams({ game_time_s: String(gameTimeS) });
  return request<WaveLookupResult>(`${BASE}/wave?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Presentation arithmetic (allowed client-side work: formatting only)
// ---------------------------------------------------------------------------

export type GameTimeParse = { ok: true; seconds: number } | { ok: false; error: string };

/**
 * Parse a user game-time string. Accepts "MM:SS" (any minute count, seconds
 * 00–59) or a bare number, read as MINUTES — "21" means 21:00, which is the
 * intuitive reading for game clocks. Capped at 999:59 to stay inside the
 * backend's wave-schedule range.
 */
export function parseGameTimeInput(raw: string): GameTimeParse {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Enter a game time, e.g. 21:15." };
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(text);
  if (clock) {
    return { ok: true, seconds: Number(clock[1]) * 60 + Number(clock[2]) };
  }
  if (/^\d{1,3}$/.test(text)) {
    return { ok: true, seconds: Number(text) * 60 };
  }
  return {
    ok: false,
    error: 'Use MM:SS (e.g. "21:15"), or a bare number of minutes.',
  };
}

/** Seconds → "MM:SS" for display. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Exact half-up rounding of a decimal STRING — no float artifacts, so
 * "5.525" rounds to "5.53" (Number-based toFixed would give "5.52"). */
function roundDecimalString(text: string, places: number): string {
  const negative = text.startsWith("-");
  const [ints, decs = ""] = (negative ? text.slice(1) : text).split(".");
  if (decs.length <= places) return text;
  const digits = (ints + decs.slice(0, places)).split("").map(Number);
  if (Number(decs[places]) >= 5) {
    let i = digits.length - 1;
    while (i >= 0 && digits[i] === 9) {
      digits[i] = 0;
      i -= 1;
    }
    if (i < 0) digits.unshift(1);
    else digits[i] += 1;
  }
  const joined = digits.join("");
  const intPart = joined.slice(0, joined.length - places) || "0";
  const decPart = joined.slice(joined.length - places);
  return `${negative ? "-" : ""}${intPart}.${decPart}`;
}

/**
 * Display rounding for user-facing numbers (Phase 5B4): trailing zeros are
 * trimmed ("3.060" → "3.06", "1.00" → "1") and long decimals are rounded
 * half-up to two places ("44.848125" → "44.85"). Integers and short
 * decimals pass through untouched; non-numeric strings are returned as-is.
 * Presentation only — API values themselves are never altered, and deep
 * provenance/explanation text keeps full precision.
 */
export function formatDisplayNumber(raw: string): string {
  const text = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return raw;
  if (!text.includes(".")) return text;
  const trim = (value: string) => value.replace(/0+$/, "").replace(/\.$/, "");
  const trimmed = trim(text);
  if (!trimmed.includes(".")) return trimmed;
  if (trimmed.split(".")[1].length <= 2) return trimmed;
  return trim(roundDecimalString(trimmed, 2));
}
