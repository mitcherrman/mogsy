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

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
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
