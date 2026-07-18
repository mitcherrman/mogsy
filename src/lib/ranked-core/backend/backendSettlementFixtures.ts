// ---------------------------------------------------------------------------
// Deterministic fixtures shaped EXACTLY like the serialized output of the
// backend's `project_resolved_round(match, combat_record)` at commit 3eaba46
// (snake_case, enum value strings, ISO-8601 UTC timestamps, players sorted by
// player_id). Every number is an already-resolved literal — the helpers below
// only merge literal overrides over literal defaults and never calculate any
// combat-domain value (damage, HP, XP, levels, charges, winner, timers,
// carryover, streaks, or Combat Lab deltas).
//
// Frontend-local dev data; not a production transport contract.
// ---------------------------------------------------------------------------

import {
  BackendResolvedPlayer,
  BackendResolvedRoundProjection,
} from "./backendSettlementTypes";

// Player ids follow the backend tests' convention (sorted: alice < bob).
export const FIXTURE_P1_ID = "alice";
export const FIXTURE_P2_ID = "bob";

/**
 * The authoritative frontend association for these fixtures: which backend
 * player_id the prototype presents as p1 and p2. Passed explicitly to the
 * adapter — identity is never taken from the array's lexical sort order.
 */
export const FIXTURE_PLAYER_IDS = {
  p1PlayerId: FIXTURE_P1_ID,
  p2PlayerId: FIXTURE_P2_ID,
} as const;

const T = {
  started: "2026-07-13T12:00:00+00:00",
  originalDeadline: "2026-07-13T12:00:20+00:00",
  finalDeadline: "2026-07-13T12:00:20+00:00",
  submitEarly: "2026-07-13T12:00:04+00:00",
  submitLate: "2026-07-13T12:00:09+00:00",
};

const ZERO_DAMAGE = {
  base_damage_dealt: 0,
  outgoing_bonus: 0,
  final_damage_dealt: 0,
  shield_absorbed: 0,
  incoming_reduction: 0,
  final_damage_received: 0,
};

/** Literal defaults for a quiet player record (merge only — no formulas). */
const mkPlayer = (
  playerId: string,
  classId: string,
  overrides: Partial<BackendResolvedPlayer>,
): BackendResolvedPlayer => ({
  player_id: playerId,
  class_id: classId,
  outcome: "incorrect",
  submitted_at: T.submitLate,
  answered_first: false,
  timed_out: false,
  selected_ability_id: null,
  damage: { ...ZERO_DAMAGE },
  hp_before: 90,
  hp_after: 90,
  reached_zero_hp: false,
  xp_gained: 16,
  total_xp_after: 16,
  level_before: 1,
  level_after: 1,
  level_up_events: [],
  charge_consumed: false,
  consumed_ability_id: null,
  remaining_charges: {},
  carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 0 },
  combat_lab_unlock_delta_seconds: 0,
  ...overrides,
});

const mk = (
  roundNumber: number,
  p1: Partial<BackendResolvedPlayer>,
  p2: Partial<BackendResolvedPlayer>,
  rest?: Partial<Omit<BackendResolvedRoundProjection, "players" | "round_number">>,
): BackendResolvedRoundProjection => ({
  match_id: "mock-match-001",
  round_number: roundNumber,
  question_id: "q-mock-1",
  end_reason: "both_answered",
  started_at: T.started,
  original_deadline: T.originalDeadline,
  final_deadline: T.finalDeadline,
  pressure_applied: false,
  players: [mkPlayer(FIXTURE_P1_ID, "tank", p1), mkPlayer(FIXTURE_P2_ID, "mage", p2)],
  next_round_duration_seconds: 20,
  next_round_duration_delta: 0,
  match_over: false,
  winner_id: null,
  completion_reason: null,
  ...rest,
});

const CORRECT_FIRST: Partial<BackendResolvedPlayer> = {
  outcome: "correct",
  submitted_at: T.submitEarly,
  answered_first: true,
  xp_gained: 20,
  total_xp_after: 20,
};

export interface SettlementScenario {
  key: string;
  label: string;
  settlement: BackendResolvedRoundProjection;
}

export const SETTLEMENT_SCENARIOS: SettlementScenario[] = [
  {
    key: "solo-correct",
    label: "Sole correct — full damage, no modifiers",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      { damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
    ),
  },
  {
    key: "both-correct-faster",
    label: "Both correct — faster player deals reduced damage",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 18, final_damage_dealt: 18 } },
      {
        outcome: "correct",
        answered_first: false,
        xp_gained: 20,
        total_xp_after: 20,
        damage: { ...ZERO_DAMAGE, final_damage_received: 18 },
        hp_after: 72,
      },
    ),
  },
  {
    key: "both-incorrect-wash",
    label: "Both incorrect — wash",
    settlement: mk(1, {}, {}),
  },
  {
    key: "timed-out",
    label: "Player 2 timed out (deadline expired)",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      {
        outcome: "timeout",
        submitted_at: null,
        timed_out: true,
        xp_gained: 14,
        total_xp_after: 14,
        damage: { ...ZERO_DAMAGE, final_damage_received: 30 },
        hp_after: 60,
      },
      { end_reason: "deadline_expired" },
    ),
  },
  {
    key: "no-ability",
    label: "No active ability selected by either player",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, selected_ability_id: null, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      { selected_ability_id: null, damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
    ),
  },
  {
    key: "shield-absorb",
    label: "Shield absorbs part of incoming damage",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      {
        selected_ability_id: "mage.overload",
        damage: { ...ZERO_DAMAGE, shield_absorbed: 12, final_damage_received: 18 },
        hp_after: 72,
      },
    ),
  },
  {
    key: "damage-reduction",
    label: "Incoming reduction lowers final damage",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      {
        damage: { ...ZERO_DAMAGE, incoming_reduction: 10, final_damage_received: 20 },
        hp_after: 70,
      },
    ),
  },
  {
    key: "shield-plus-reduction",
    label: "Shield + incoming reduction in one settlement",
    settlement: mk(
      1,
      {
        ...CORRECT_FIRST,
        damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, outgoing_bonus: 5, final_damage_dealt: 35 },
      },
      {
        damage: { ...ZERO_DAMAGE, shield_absorbed: 8, incoming_reduction: 7, final_damage_received: 20 },
        hp_after: 70,
      },
    ),
  },
  {
    key: "charge-consumed",
    label: "Selected ability consumes a charge",
    settlement: mk(
      1,
      {
        ...CORRECT_FIRST,
        selected_ability_id: "tank.brace",
        charge_consumed: true,
        consumed_ability_id: "tank.brace",
        // Immutable post-round snapshot as committed by the backend.
        remaining_charges: { "tank.fortify": 2, "tank.brace": 2 },
        damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 },
      },
      { damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
    ),
  },
  {
    key: "charge-not-consumed",
    label: "Ability selected but no charge consumed",
    settlement: mk(
      1,
      {
        ...CORRECT_FIRST,
        selected_ability_id: "tank.fortify",
        charge_consumed: false,
        consumed_ability_id: null,
        remaining_charges: { "tank.fortify": 2 },
        damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 },
      },
      { damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
    ),
  },
  {
    key: "uncharged-policy",
    label: "Edge: remaining charge null (uncharged use policy)",
    settlement: mk(
      1,
      {
        ...CORRECT_FIRST,
        selected_ability_id: "tank.fortify",
        remaining_charges: { "tank.fortify": null, "tank.brace": 3 },
        damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 },
      },
      { damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
    ),
  },
  {
    key: "carryover-gained",
    label: "Carryover effect gained (banked for a later round)",
    settlement: mk(
      1,
      {
        ...CORRECT_FIRST,
        selected_ability_id: "mage.arcane_charge",
        carryover: {
          effects_gained: ["mage.arcane_charge"],
          effects_consumed: [],
          consecutive_correct: 1,
        },
        damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 },
      },
      { damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
    ),
  },
  {
    key: "carryover-consumed",
    label: "Carryover effect consumed this round",
    settlement: mk(
      2,
      {
        ...CORRECT_FIRST,
        carryover: {
          effects_gained: [],
          effects_consumed: ["mage.arcane_charge"],
          consecutive_correct: 2,
        },
        damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, outgoing_bonus: 5, final_damage_dealt: 35 },
      },
      { damage: { ...ZERO_DAMAGE, final_damage_received: 35 }, hp_after: 55 },
    ),
  },
  {
    key: "combat-lab-delta",
    label: "Combat Lab unlock delta (data only, no damage change)",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      {
        selected_ability_id: "mage.insight",
        combat_lab_unlock_delta_seconds: -5.0,
        damage: { ...ZERO_DAMAGE, final_damage_received: 30 },
        hp_after: 60,
      },
    ),
  },
  {
    key: "timer-increased",
    label: "Next-round shared timer increased (25s)",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, selected_ability_id: "tank.fortify", damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      { damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
      { next_round_duration_seconds: 25, next_round_duration_delta: 5.0 },
    ),
  },
  {
    key: "timer-decreased",
    label: "Next-round shared timer decreased (18s)",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      { selected_ability_id: "marksman.tempo", damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
      { next_round_duration_seconds: 18, next_round_duration_delta: -2.0 },
    ),
  },
  {
    key: "level-up",
    label: "Level-up from XP award (backend level-up event)",
    settlement: mk(
      2,
      {
        ...CORRECT_FIRST,
        xp_gained: 20,
        total_xp_after: 40,
        level_before: 1,
        level_after: 2,
        level_up_events: [
          { previous_level: 1, new_level: 2, total_xp_after: 40, thresholds_crossed: [40] },
        ],
      },
      {
        xp_gained: 16,
        total_xp_after: 32,
        damage: { ...ZERO_DAMAGE, final_damage_received: 30 },
        hp_after: 60,
      },
    ),
  },
  {
    key: "match-over",
    label: "Match over — knockout, Player 1 wins",
    settlement: mk(
      3,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      {
        hp_before: 30,
        hp_after: 0,
        reached_zero_hp: true,
        damage: { ...ZERO_DAMAGE, final_damage_received: 30 },
      },
      { match_over: true, winner_id: FIXTURE_P1_ID, completion_reason: "knockout" },
    ),
  },
  {
    key: "double-knockout",
    label: "Match over — simultaneous knockout (draw, no winner)",
    settlement: mk(
      3,
      {
        ...CORRECT_FIRST,
        hp_before: 10,
        hp_after: 0,
        reached_zero_hp: true,
        damage: { ...ZERO_DAMAGE, base_damage_dealt: 18, final_damage_dealt: 18, final_damage_received: 18 },
      },
      {
        outcome: "correct",
        xp_gained: 20,
        total_xp_after: 20,
        hp_before: 15,
        hp_after: 0,
        reached_zero_hp: true,
        damage: { ...ZERO_DAMAGE, base_damage_dealt: 18, final_damage_dealt: 18, final_damage_received: 18 },
      },
      { match_over: true, winner_id: null, completion_reason: "simultaneous_knockout" },
    ),
  },
  {
    key: "plain-round",
    label: "Plain non-terminal round (no winner)",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      { damage: { ...ZERO_DAMAGE, final_damage_received: 30 }, hp_after: 60 },
    ),
  },
  {
    key: "zero-final-damage",
    label: "Both take zero final damage after modifiers",
    settlement: mk(
      1,
      {
        ...CORRECT_FIRST,
        answered_first: false,
        damage: { ...ZERO_DAMAGE, shield_absorbed: 18, final_damage_received: 0 },
      },
      {
        outcome: "correct",
        answered_first: true,
        submitted_at: T.submitEarly,
        xp_gained: 20,
        total_xp_after: 20,
        damage: {
          base_damage_dealt: 18,
          outgoing_bonus: 0,
          final_damage_dealt: 0,
          shield_absorbed: 20,
          incoming_reduction: 10,
          final_damage_received: 0,
        },
      },
    ),
  },
  {
    key: "pressure-applied",
    label: "Edge: pressure-shortened round (deadline moved up)",
    settlement: mk(
      1,
      { ...CORRECT_FIRST, damage: { ...ZERO_DAMAGE, base_damage_dealt: 30, final_damage_dealt: 30 } },
      {
        outcome: "timeout",
        submitted_at: null,
        timed_out: true,
        xp_gained: 14,
        total_xp_after: 14,
        damage: { ...ZERO_DAMAGE, final_damage_received: 30 },
        hp_after: 60,
      },
      {
        end_reason: "deadline_expired",
        pressure_applied: true,
        final_deadline: "2026-07-13T12:00:15+00:00",
      },
    ),
  },
];

export const getScenario = (key: string): SettlementScenario | undefined =>
  SETTLEMENT_SCENARIOS.find((s) => s.key === key);
