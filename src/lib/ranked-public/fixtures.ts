/**
 * Backend-shaped v2 fixtures for public Ranked, matching the F1.2–F1.4
 * projections (ranked_public/projections.py). Values are illustrative; the
 * SHAPES mirror the backend exactly so the readers/controllers are exercised
 * against real contract structure. Not used in production code.
 */

const T = "2026-07-18T12:00:00+00:00";
const DEADLINE = "2026-07-18T12:00:30+00:00";

export function publicRoundV2(over = false) {
  return {
    schema_version: "ranked_duel.public_round.v2",
    projection_type: "public_round",
    match_id: "m1",
    round_number: over ? 5 : 1,
    server_time: T,
    payload: {
      match_id: "m1",
      match_status: over ? "complete" : "active",
      completed_rounds: over ? 5 : 0,
      players: [
        { player_id: "userA", class_id: "tank", hp: 170, total_xp: 0, level: 1,
          has_submitted: false, ability_selection_phase: over ? null : "open",
          has_ability_selected: over ? null : false, max_hp: 170 },
        { player_id: "userB", class_id: "mage", hp: over ? 0 : 150, total_xp: 0, level: 1,
          has_submitted: false, ability_selection_phase: over ? null : "open",
          has_ability_selected: over ? null : false, max_hp: 150 },
      ],
      active_round: over ? null : {
        round_number: 1, started_at: T, active_deadline: DEADLINE,
        duration_seconds: 30, pressure_applied: false, ready_to_resolve: false },
      next_round_duration_seconds: 30,
      match_over: over,
      winner_id: over ? "userA" : null,
      completion_reason: over ? "knockout" : null,
      question: over ? null : {
        question_id: "q1", prompt: "Which item grants Immolate?",
        options: ["Sunfire Aegis", "Heartsteel", "Thornmail", "Randuin's Omen"],
        category: "items" },
      progression_pending_players: [],
      presence: {
        participant_status: "connected", opponent_connection_state: "connected",
        reconnect_grace_deadline: null, own_reconnect_grace_deadline: null },
    },
  };
}

export function privatePlayerV2(owner = "userA") {
  const pub = publicRoundV2().payload;
  return {
    schema_version: "ranked_duel.private_player.v2",
    projection_type: "private_player",
    match_id: "m1", round_number: 1, server_time: T,
    payload: {
      ...pub,
      owner_player_id: owner,
      own_selection: { phase: "open", selected_ability_id: null },
      own_abilities: {
        unlocked_ability_ids: ["tank.fortify"],
        locked_ability_ids: ["tank.brace", "tank.barrier"],
        level2_choice_made: false, level2_choice: null,
        level2_options: ["tank.brace", "tank.barrier"],
        level3_final_unlock_id: null, level3_unlocked: false,
        remaining_charges: { "tank.fortify": 3 },
      },
      own_carryover: {
        pending_fortify: false, pending_arcane_charge: false, pending_focus: false,
        pending_insight: false, pending_tempo: false, consecutive_correct: 0 },
      own_combat_lab_unlock_delta_seconds: 0,
    },
  };
}

export function queueStatusV1(status: string, matchId: string | null = null) {
  return {
    schema_version: "ranked_duel.queue_status.v1",
    projection_type: "queue_status",
    match_id: matchId, round_number: null, server_time: T,
    payload: { status, match_id: matchId, queue_version: 1, class_id: "tank", enqueued_at: T },
  };
}

export function matchResultV1(reason = "combat") {
  return {
    schema_version: "ranked_duel.match_result.v1",
    projection_type: "match_result",
    match_id: "m1", round_number: 5, server_time: T,
    payload: {
      match_id: "m1", outcome: "decisive", winner_user_id: "userA",
      completion_reason: reason === "combat" ? "knockout" : reason,
      terminal_reason: reason, final_round_number: 5, rating_application_status: "pending" },
  };
}

export function heartbeatOk() {
  return { status: "active", match_id: "m1", active: true };
}
