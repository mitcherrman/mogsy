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

// ------------------------------ multi-challenge segments (Phase B slice 4)

const ABILITY_DEADLINE = "2026-07-18T12:00:05+00:00";
const CHALLENGE_DEADLINE = "2026-07-18T12:00:30+00:00";

function duelItem(n: number) {
  return {
    item_id: `Item ${n}`, name: `Item ${n}`, item_type: "legendary",
    asset_path: `assets/items/${n}.png`,
  };
}

/** Backend-shaped `segment` discriminator for an Item Cost Duel segment. */
export function icdSegmentMeta(over: Partial<Record<string, unknown>> = {}) {
  return {
    module_id: "item_cost_duel", module_version: 1, challenge_count: 5,
    challenge_index: 0, segment_number: 3, phase: "ability",
    ability_deadline: ABILITY_DEADLINE, challenge_started_at: null,
    challenge_deadline: null, pressure_applied: false, resolved: false,
    ...over,
  };
}

/**
 * Backend-shaped `segment_state`. Mirrors `service.segment_state_view` — the
 * opponent appears only as a count and a confirmation flag, and there is no
 * cost, correct item, or correctness anywhere in it.
 */
export function icdSegmentState(over: Partial<Record<string, unknown>> = {}) {
  return {
    active: true,
    segment_number: 3,
    module_id: "item_cost_duel",
    module_version: 1,
    phase: "ability",
    challenge_count: 5,
    ability_deadline: ABILITY_DEADLINE,
    challenge_started_at: null,
    challenge_deadline: null,
    pressure_applied: false,
    own_ability: {
      selected_ability_id: null, confirmed: false,
      available_ability_ids: ["tank.fortify"],
      unavailable_ability_ids: {},
    },
    opponent_ability_confirmed: false,
    own_next_challenge_index: 0,
    own_submitted_choices: [null, null, null, null, null],
    own_challenges_completed: 0,
    opponent_challenges_completed: 0,
    opponent_finished: false,
    own_finished: false,
    ...over,
  };
}

/** Challenge-phase state at `index`, with the earlier choices filled in. */
export function icdChallengeState(index: number,
                                  over: Partial<Record<string, unknown>> = {}) {
  const choices = Array.from({ length: 5 }, (_, i) =>
    i < index ? { item_id: `Item ${i * 2}` } : null);
  return icdSegmentState({
    phase: "challenges",
    challenge_started_at: "2026-07-18T12:00:05+00:00",
    challenge_deadline: CHALLENGE_DEADLINE,
    own_ability: {
      selected_ability_id: "tank.fortify", confirmed: true,
      available_ability_ids: ["tank.fortify"], unavailable_ability_ids: {},
    },
    opponent_ability_confirmed: true,
    own_next_challenge_index: index,
    own_submitted_choices: choices,
    own_challenges_completed: index,
    own_finished: index >= 5,
    challenges: {
      prompt: "Which item costs more?",
      challenge_count: 5,
      challenges: Array.from({ length: 5 }, (_, i) => ({
        challenge_index: i, left: duelItem(i * 2), right: duelItem(i * 2 + 1),
      })),
    },
    ...over,
  });
}

/** A resolved Item Cost Duel settlement payload (post-reveal). */
export function icdResolvedPayload(over: Partial<Record<string, unknown>> = {}) {
  const items: Record<string, unknown> = {};
  for (let i = 0; i < 10; i += 1) items[`Item ${i}`] = duelItem(i);
  return {
    round_number: 3,
    players: [
      { player_id: "userA", class_id: "tank", selected_ability_id: "tank.fortify",
        damage: { final_damage_dealt: 15, final_damage_received: 0 } },
      { player_id: "userB", class_id: "mage", selected_ability_id: null,
        damage: { final_damage_dealt: 0, final_damage_received: 15 } },
    ],
    segment_reveal: {
      module_id: "item_cost_duel",
      module_version: 1,
      challenge_count: 5,
      challenges: Array.from({ length: 5 }, (_, i) => ({
        challenge_index: i,
        left_item_id: `Item ${i * 2}`, right_item_id: `Item ${i * 2 + 1}`,
        left_cost: 1000 + i * 100, right_cost: 2000 + i * 100,
        correct_item_id: `Item ${i * 2 + 1}`, price_gap: 1000,
      })),
      players: {
        userA: { segment_result: "win", correct: 5, incorrect: 0, unanswered: 0,
          total_response_ms: 5000,
          per_challenge_ms: [1000, 1000, 1000, 1000, 1000],
          choices: Array.from({ length: 5 }, (_, i) => `Item ${i * 2 + 1}`) },
        userB: { segment_result: "loss", correct: 1, incorrect: 3, unanswered: 1,
          total_response_ms: 9000,
          per_challenge_ms: [2000, 2000, 2000, 3000, null],
          choices: ["Item 1", "Item 2", "Item 4", "Item 6", null] },
      },
      items,
    },
    ...over,
  };
}
