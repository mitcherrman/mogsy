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

// ------------------------------ Meta Reflex, item_cost_duel.v4 (QUIZ1 P7)
//
// Shapes copied from an OBSERVED local backend response (ranked_modules
// .meta_reflex public_view + ranked_public.service.segment_state_view), not
// from a summary: five mixed cards, per-card clocks, positional card ids, and
// the deliberate asymmetry where a recognition card carries art and nothing
// else. Values are illustrative; the structure is the contract.

const CARD_STARTED = "2026-07-18T12:00:06+00:00";
const CARD_DEADLINE = "2026-07-18T12:00:12+00:00";

function namedSide(id: string, label: string, media: string | null) {
  return { entity_id: id, label, media };
}

function artSide(index: number, side: "left" | "right") {
  return { media_url: `/api/ranked/media/segment-card/m1/4/${index}/${side}.png` };
}

/** The five cards of a mixed block: 3 magnitude, 1 recognition, 1 classification. */
export function metaReflexCards() {
  return [
    { challenge_index: 0, prompt: "Which item costs more gold?", kind: "magnitude",
      entity_kind: "item",
      left: namedSide("Hexdrinker", "Hexdrinker", "assets/items/3155.png"),
      right: namedSide("Giant's Belt", "Giant's Belt", "assets/items/1011.png"),
      left_card_id: "c0:left", right_card_id: "c0:right" },
    { challenge_index: 1, prompt: "Which champion uses Energy?", kind: "classification",
      entity_kind: "champion",
      left: namedSide("Kennen", "Kennen", "assets/champions/Kennen/icon.png"),
      right: namedSide("Kha'Zix", "Kha'Zix", "assets/champions/KhaZix/icon.png"),
      left_card_id: "c1:left", right_card_id: "c1:right" },
    { challenge_index: 2, prompt: "Which one is Xerath's W?", kind: "recognition",
      entity_kind: "ability",
      left: artSide(2, "left"), right: artSide(2, "right"),
      left_card_id: "c2:left", right_card_id: "c2:right" },
    { challenge_index: 3, prompt: "Which champion is faster?", kind: "magnitude",
      entity_kind: "champion",
      // No art on the left: a card with missing media must still be playable.
      left: namedSide("Vel'Koz", "Vel'Koz", null),
      right: namedSide("Kled", "Kled", "assets/champions/Kled/icon.png"),
      left_card_id: "c3:left", right_card_id: "c3:right" },
    { challenge_index: 4, prompt: "Which item gives more Armor?", kind: "magnitude",
      entity_kind: "item",
      left: namedSide("Knight's Vow", "Knight's Vow", "assets/items/3109.png"),
      right: namedSide("Thornmail", "Thornmail", "assets/items/3075.png"),
      left_card_id: "c4:left", right_card_id: "c4:right" },
  ];
}

/** Backend-shaped `segment` discriminator for a Meta Reflex block. */
export function metaReflexSegmentMeta(over: Partial<Record<string, unknown>> = {}) {
  return {
    module_id: "item_cost_duel", module_version: 4, challenge_count: 5,
    challenge_index: 0, segment_number: 4, phase: "challenges",
    ability_deadline: null, challenge_started_at: CARD_STARTED,
    challenge_deadline: "2026-07-18T12:00:36+00:00", pressure_applied: false,
    card_timer_ms: 6000, card_started_at: CARD_STARTED,
    card_deadline: CARD_DEADLINE,
    timed_out_challenges: [false, false, false, false, false],
    resolved: false, ...over,
  };
}

/** Backend-shaped v4 `segment_state` with the viewer sitting on card `index`. */
export function metaReflexState(index = 0,
                                over: Partial<Record<string, unknown>> = {}) {
  return {
    active: true,
    segment_number: 4,
    module_id: "item_cost_duel",
    module_version: 4,
    phase: "challenges",
    challenge_count: 5,
    ability_deadline: null,
    challenge_started_at: CARD_STARTED,
    challenge_deadline: "2026-07-18T12:00:36+00:00",
    pressure_applied: false,
    own_ability: {
      selected_ability_id: null, confirmed: false,
      available_ability_ids: ["mage.arcane_charge", "mage.overload"],
      unavailable_ability_ids: {},
    },
    opponent_ability_confirmed: false,
    own_next_challenge_index: index,
    // v4 records the CARD that was picked, never the entity on it.
    own_submitted_choices: Array.from({ length: 5 }, (_, i) =>
      (i < index ? { card_id: `c${i}:left` } : null)),
    own_challenges_completed: index,
    opponent_challenges_completed: 0,
    opponent_finished: false,
    own_finished: index >= 5,
    card_timer_ms: 6000,
    own_card_index: index < 5 ? index : null,
    own_card_started_at: index < 5 ? CARD_STARTED : null,
    own_card_deadline: index < 5 ? CARD_DEADLINE : null,
    own_timed_out_challenges: [false, false, false, false, false],
    challenges: {
      prompt: "Meta Reflex",
      challenge_count: 5,
      challenges: metaReflexCards(),
    },
    ...over,
  };
}

/** A resolved Meta Reflex settlement payload (post-reveal, v4 shape). */
export function metaReflexResolvedPayload(over: Partial<Record<string, unknown>> = {}) {
  const cards = metaReflexCards();
  return {
    round_number: 4,
    players: [
      { player_id: "userA", class_id: "mage", selected_ability_id: null,
        damage: { final_damage_dealt: 6, final_damage_received: 3 } },
      { player_id: "userB", class_id: "tank", selected_ability_id: null,
        damage: { final_damage_dealt: 3, final_damage_received: 6 } },
    ],
    segment_reveal: {
      module_id: "item_cost_duel",
      module_version: 4,
      challenge_count: 5,
      mixed_content: true,
      families: ["item_cost", "resource:energy", "recognition:ability",
        "champion_stat:move-speed", "item_stat:armor"],
      challenges: cards.map((c, i) => ({
        challenge_index: i,
        family_id: "item_cost",
        kind: c.kind,
        entity_kind: c.entity_kind,
        left_entity_id: `L${i}`, right_entity_id: `R${i}`,
        left_label: `Left ${i}`, right_label: `Right ${i}`,
        // Per kind, exactly as the module's `_card_values` decides it: a number
        // for magnitude, the canonical property for classification, nothing for
        // recognition.
        left_value: c.kind === "recognition" ? null
          : c.kind === "classification" ? "Energy" : 1000 + i,
        right_value: c.kind === "recognition" ? null
          : c.kind === "classification" ? "Mana" : 2000 + i,
        correct_entity_id: `R${i}`,
        gap: c.kind === "magnitude" ? 1000 : null,
      })),
      players: {
        userA: { segment_result: "win", correct: 4, incorrect: 1, unanswered: 0,
          total_response_ms: 9000,
          per_challenge_ms: [1800, 1800, 1800, 1800, 1800],
          choices: ["c0:right", "c1:right", "c2:right", "c3:right", "c4:left"] },
        userB: { segment_result: "loss", correct: 2, incorrect: 2, unanswered: 1,
          total_response_ms: 14000,
          per_challenge_ms: [3000, 3000, 3000, 5000, null],
          choices: ["c0:right", "c1:left", "c2:right", "c3:left", null] },
      },
    },
    ...over,
  };
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
