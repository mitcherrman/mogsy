// ---------------------------------------------------------------------------
// Test-only builders shaped like the LIVE playable-duel HTTP bodies (backend
// commits 8d9520e / de04485): the five-field envelope plus the additive
// `question` and `progression_pending_players` fields the gameplay routes add
// to the public body. Literal values only — no combat math anywhere.
// ---------------------------------------------------------------------------

export const MATCH_ID = "m1";
export const ME = "alice";
export const OPPONENT = "bob";

interface PlayerOverrides {
  hp?: number;
  level?: number;
  totalXp?: number;
  hasSubmitted?: boolean;
}

const player = (playerId: string, classId: string, o: PlayerOverrides = {}) => ({
  player_id: playerId,
  class_id: classId,
  hp: o.hp ?? 170,
  total_xp: o.totalXp ?? 0,
  level: o.level ?? 1,
  has_submitted: o.hasSubmitted ?? false,
  ability_selection_phase: "open",
  has_ability_selected: false,
});

export const QUESTION_OPTIONS = ["Sunfire Aegis", "Heartsteel", "Thornmail", "Randuin's Omen"];

export interface PublicOptions {
  roundNumber?: number;
  me?: PlayerOverrides;
  opponent?: PlayerOverrides;
  pending?: string[];
  matchOver?: boolean;
  winnerId?: string | null;
  question?: boolean;
  deadline?: string;
}

export const publicEnvelope = (o: PublicOptions) => {
  const roundNumber = o.roundNumber ?? 1;
  return {
    schema_version: "ranked_duel.public_round.v1",
    projection_type: "public_round",
    match_id: MATCH_ID,
    round_number: roundNumber,
    payload: {
      match_id: MATCH_ID,
      match_status: o.matchOver ? "complete" : "active",
      completed_rounds: roundNumber - 1,
      players: [player(ME, "tank", o.me), player(OPPONENT, "mage", o.opponent)],
      active_round: {
        round_number: roundNumber,
        started_at: "2026-07-14T12:00:00+00:00",
        active_deadline: o.deadline ?? "2026-07-14T12:00:20+00:00",
        duration_seconds: 20,
        pressure_applied: false,
        ready_to_resolve: false,
      },
      next_round_duration_seconds: 20,
      match_over: o.matchOver ?? false,
      winner_id: o.winnerId ?? null,
      completion_reason: o.matchOver ? "knockout" : null,
    },
    question:
      o.question === false
        ? null
        : {
            question_id: `staffq-1:r${roundNumber}`,
            prompt: "Which item grants the Immolate passive aura?",
            options: QUESTION_OPTIONS,
            category: "items",
          },
    progression_pending_players: o.pending ?? [],
  };
};

export interface PrivateOptions {
  ownerId?: string;
  roundNumber?: number;
  hasSubmitted?: boolean;
  unlocked?: string[];
  locked?: string[];
  charges?: Record<string, number | null>;
  level2Options?: string[];
  level2Choice?: string | null;
  level3?: boolean;
  level?: number;
}

export const privateEnvelope = (o: PrivateOptions) => {
  const ownerId = o.ownerId ?? ME;
  const roundNumber = o.roundNumber ?? 1;
  const pub = publicEnvelope({ roundNumber, me: { level: o.level ?? 1, hasSubmitted: o.hasSubmitted } });
  return {
    schema_version: "ranked_duel.private_player.v1",
    projection_type: "private_player",
    match_id: MATCH_ID,
    round_number: roundNumber,
    payload: {
      ...pub.payload,
      owner_player_id: ownerId,
      own_selection: { phase: "open", selected_ability_id: null },
      own_abilities: {
        unlocked_ability_ids: o.unlocked ?? ["tank.fortify"],
        locked_ability_ids: o.locked ?? ["tank.brace", "tank.barrier"],
        level2_choice_made: o.level2Choice != null,
        level2_choice: o.level2Choice ?? null,
        level2_options: o.level2Options ?? ["tank.brace", "tank.barrier"],
        level3_final_unlock_id: o.level3 ? "tank.barrier" : null,
        level3_unlocked: o.level3 ?? false,
        remaining_charges: o.charges ?? { "tank.fortify": 3 },
      },
      own_carryover: {
        pending_fortify: false,
        pending_arcane_charge: false,
        pending_focus: false,
        pending_insight: false,
        pending_tempo: false,
        consecutive_correct: 0,
      },
      own_combat_lab_unlock_delta_seconds: 0,
    },
  };
};

const resolvedPlayer = (
  playerId: string,
  classId: string,
  o: {
    outcome?: string;
    dealt?: number;
    received?: number;
    hpBefore?: number;
    hpAfter?: number;
    levelBefore?: number;
    levelAfter?: number;
    levelUp?: boolean;
    ability?: string | null;
    zero?: boolean;
  } = {},
) => ({
  player_id: playerId,
  class_id: classId,
  outcome: o.outcome ?? "incorrect",
  submitted_at: "2026-07-14T12:00:05+00:00",
  answered_first: false,
  timed_out: false,
  selected_ability_id: o.ability ?? null,
  damage: {
    base_damage_dealt: o.dealt ?? 0,
    outgoing_bonus: 0,
    final_damage_dealt: o.dealt ?? 0,
    shield_absorbed: 0,
    incoming_reduction: 0,
    final_damage_received: o.received ?? 0,
  },
  hp_before: o.hpBefore ?? 170,
  hp_after: o.hpAfter ?? 170,
  reached_zero_hp: o.zero ?? false,
  xp_gained: 16,
  total_xp_after: 16,
  level_before: o.levelBefore ?? 1,
  level_after: o.levelAfter ?? 1,
  level_up_events: o.levelUp
    ? [
        {
          previous_level: o.levelBefore ?? 1,
          new_level: o.levelAfter ?? 2,
          total_xp_after: 40,
          thresholds_crossed: [40],
        },
      ]
    : [],
  charge_consumed: false,
  consumed_ability_id: null,
  remaining_charges: { "tank.fortify": 3 },
  carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 0 },
  combat_lab_unlock_delta_seconds: 0,
});

export interface ResolvedOptions {
  roundNumber?: number;
  me?: Parameters<typeof resolvedPlayer>[2];
  opponent?: Parameters<typeof resolvedPlayer>[2];
  matchOver?: boolean;
  winnerId?: string | null;
  completionReason?: string | null;
}

export const resolvedEnvelope = (o: ResolvedOptions) => {
  const roundNumber = o.roundNumber ?? 1;
  return {
    schema_version: "ranked_duel.resolved_round.v1",
    projection_type: "resolved_round",
    match_id: MATCH_ID,
    round_number: roundNumber,
    payload: {
      match_id: MATCH_ID,
      round_number: roundNumber,
      question_id: `staffq-1:r${roundNumber}`,
      end_reason: "both_answered",
      started_at: "2026-07-14T12:00:00+00:00",
      original_deadline: "2026-07-14T12:00:20+00:00",
      final_deadline: "2026-07-14T12:00:20+00:00",
      pressure_applied: false,
      players: [resolvedPlayer(ME, "tank", o.me), resolvedPlayer(OPPONENT, "mage", o.opponent)],
      next_round_duration_seconds: 20,
      next_round_duration_delta: 0,
      match_over: o.matchOver ?? false,
      winner_id: o.winnerId ?? null,
      completion_reason: o.matchOver ? (o.completionReason ?? "knockout") : null,
    },
  };
};

/** The backend's error envelope, as the routes emit it. */
export const errorBody = (errorCode: string, message: string, extra: Record<string, unknown> = {}) => ({
  detail: { error_code: errorCode, message, ...extra },
});
