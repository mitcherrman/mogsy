// ---------------------------------------------------------------------------
// FRONTEND-LOCAL mirror of the backend resolved-round projection.
//
// This type mirrors backend commit 3eaba46 exactly: it is the direct
// serialized shape returned by `project_resolved_round(match, combat_record)`
// in duel_transport_projection.py (snake_case keys, enum `.value` strings,
// UTC ISO-8601 timestamps, players sorted by player_id). It contains NO
// transport metadata — no schema version, event id, or envelope fields. A
// future network envelope may wrap this object without changing the pure
// adapter that consumes it.
//
// Deterministic fixture data only; not a production network contract.
// ---------------------------------------------------------------------------

/** duel_round_engine.AnswerOutcome — note the backend spells "timeout". */
export type BackendAnswerOutcome = "correct" | "incorrect" | "timeout";

/** duel_round_engine.RoundEndReason */
export type BackendRoundEndReason = "both_answered" | "deadline_expired";

/** duel_match_engine.MatchCompletionReason */
export type BackendCompletionReason = "knockout" | "simultaneous_knockout";

/** One entry of `record.level_up_events`, filtered per player. */
export interface BackendLevelUpEvent {
  previous_level: number;
  new_level: number;
  total_xp_after: number;
  thresholds_crossed: number[];
}

/**
 * Per-player settlement audit. All numbers are backend-authoritative final
 * values; the frontend never derives one field from another.
 */
export interface BackendResolvedPlayer {
  player_id: string;
  class_id: string;
  outcome: BackendAnswerOutcome;
  /** UTC ISO-8601; null when the player never submitted (timed out). */
  submitted_at: string | null;
  answered_first: boolean;
  /** Explicit timeout flag — never inferred from a null timestamp. */
  timed_out: boolean;
  /** null = the player deliberately locked in NO ability. */
  selected_ability_id: string | null;
  /**
   * Authoritative damage audit. "dealt" fields describe this player as the
   * SOURCE; "shield_absorbed"/"incoming_reduction"/"final_damage_received"
   * describe this player as the TARGET.
   */
  damage: {
    base_damage_dealt: number;
    outgoing_bonus: number;
    final_damage_dealt: number;
    shield_absorbed: number;
    incoming_reduction: number;
    final_damage_received: number;
  };
  hp_before: number;
  hp_after: number;
  reached_zero_hp: boolean;
  xp_gained: number;
  total_xp_after: number;
  level_before: number;
  level_after: number;
  level_up_events: BackendLevelUpEvent[];
  charge_consumed: boolean;
  consumed_ability_id: string | null;
  /**
   * IMMUTABLE commit-time snapshot of remaining charges AFTER this round
   * (PlayerChargeSnapshot). Historical rounds keep projecting these values
   * even if live progression state changes later. `null` remaining means an
   * uncharged use policy. There is no charges-before field.
   */
  remaining_charges: Record<string, number | null>;
  carryover: {
    effects_gained: string[];
    effects_consumed: string[];
    consecutive_correct: number;
  };
  /**
   * Combat Lab early-unlock seconds as DATA — deliberately separate from
   * every damage field above. Never added to damage.
   */
  combat_lab_unlock_delta_seconds: number;
}

/** Exact output of project_resolved_round (backend commit 3eaba46). */
export interface BackendResolvedRoundProjection {
  match_id: string;
  round_number: number;
  question_id: string | null;
  end_reason: BackendRoundEndReason;
  started_at: string;
  original_deadline: string;
  final_deadline: string;
  pressure_applied: boolean;
  /** Exactly two entries, sorted by player_id. */
  players: BackendResolvedPlayer[];
  /**
   * ONE shared next-round duration for both players (already clamped by the
   * backend). Always present — including on terminal rounds. The delta is
   * raw audit metadata; duration is never derived from it.
   */
  next_round_duration_seconds: number;
  next_round_duration_delta: number;
  match_over: boolean;
  /**
   * Null unless match_over — and null even when match_over on
   * simultaneous_knockout (a draw has no winner).
   */
  winner_id: string | null;
  completion_reason: BackendCompletionReason | null;
}
