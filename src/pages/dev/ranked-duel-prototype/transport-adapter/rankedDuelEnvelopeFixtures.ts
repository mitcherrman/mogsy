// ---------------------------------------------------------------------------
// Deterministic envelope fixtures shaped EXACTLY like the ranked-duel read
// endpoints' responses (backend commits 8e0809a / befa025): the five-field
// envelope wrapping a verbatim projection payload.
//
// The resolved envelopes reuse the committed exact resolved-payload fixtures;
// the wrap helper only fills the literal repeated envelope fields (the same
// association the backend route makes from its path parameters). No domain
// value is calculated anywhere in this file.
// ---------------------------------------------------------------------------

import {
  SETTLEMENT_SCENARIOS,
  SettlementScenario,
} from "../backend-adapter/backendSettlementFixtures";
import {
  BackendPrivatePlayerProjection,
  BackendPublicPlayer,
  BackendPublicRoundProjection,
  PRIVATE_SCHEMA_VERSION,
  PUBLIC_SCHEMA_VERSION,
  PrivatePlayerEnvelope,
  PublicRoundEnvelope,
  RESOLVED_SCHEMA_VERSION,
  ResolvedRoundEnvelope,
} from "./rankedDuelEnvelopeTypes";

// --- Resolved envelopes: every committed settlement scenario, enveloped ----

export interface ResolvedEnvelopeScenario {
  key: string;
  label: string;
  envelope: ResolvedRoundEnvelope;
}

export const RESOLVED_ENVELOPE_SCENARIOS: ResolvedEnvelopeScenario[] =
  SETTLEMENT_SCENARIOS.map((s: SettlementScenario) => ({
    key: s.key,
    label: s.label,
    envelope: {
      schema_version: RESOLVED_SCHEMA_VERSION,
      projection_type: "resolved_round",
      // Literal pass-through of the payload's own identity — exactly what
      // the backend route echoes from its path parameters.
      match_id: s.settlement.match_id,
      round_number: s.settlement.round_number,
      payload: s.settlement,
    },
  }));

export const getResolvedEnvelopeScenario = (
  key: string,
): ResolvedEnvelopeScenario | undefined =>
  RESOLVED_ENVELOPE_SCENARIOS.find((s) => s.key === key);

// --- Public envelopes -------------------------------------------------------

const P1 = "alice";
const P2 = "bob";
const T_START = "2026-07-13T12:00:00+00:00";
const T_DEADLINE = "2026-07-13T12:00:20+00:00";
const T_DEADLINE_PRESSURED = "2026-07-13T12:00:15+00:00";

const publicPlayer = (
  playerId: string,
  classId: string,
  overrides: Partial<BackendPublicPlayer>,
): BackendPublicPlayer => ({
  player_id: playerId,
  class_id: classId,
  hp: 90,
  total_xp: 16,
  level: 1,
  has_submitted: false,
  ability_selection_phase: "open",
  has_ability_selected: false,
  ...overrides,
});

const publicPayload = (
  p1: Partial<BackendPublicPlayer>,
  p2: Partial<BackendPublicPlayer>,
  rest?: Partial<BackendPublicRoundProjection>,
): BackendPublicRoundProjection => ({
  match_id: "mock-match-001",
  match_status: "active",
  completed_rounds: 2,
  players: [publicPlayer(P1, "tank", p1), publicPlayer(P2, "mage", p2)],
  active_round: {
    round_number: 3,
    started_at: T_START,
    active_deadline: T_DEADLINE,
    duration_seconds: 20,
    pressure_applied: false,
    ready_to_resolve: false,
  },
  next_round_duration_seconds: 20,
  match_over: false,
  winner_id: null,
  completion_reason: null,
  ...rest,
});

const publicEnvelope = (
  key: string,
  label: string,
  payload: BackendPublicRoundProjection,
  roundNumber = 3,
): { key: string; label: string; envelope: PublicRoundEnvelope } => ({
  key,
  label,
  envelope: {
    schema_version: PUBLIC_SCHEMA_VERSION,
    projection_type: "public_round",
    match_id: payload.match_id,
    round_number: roundNumber,
    payload,
  },
});

export const PUBLIC_ENVELOPE_SCENARIOS = [
  publicEnvelope("public-active-question", "Active question round", publicPayload({}, {})),
  publicEnvelope(
    "public-first-submitted",
    "First player submitted, opponent thinking",
    publicPayload({ has_submitted: true, has_ability_selected: true }, {}),
  ),
  publicEnvelope(
    "public-both-submitted",
    "Both submitted, awaiting settlement",
    publicPayload(
      { has_submitted: true, ability_selection_phase: "locked", has_ability_selected: true },
      { has_submitted: true, ability_selection_phase: "locked", has_ability_selected: false },
      {
        active_round: {
          round_number: 3,
          started_at: T_START,
          active_deadline: T_DEADLINE,
          duration_seconds: 20,
          pressure_applied: false,
          ready_to_resolve: true,
        },
      },
    ),
  ),
  publicEnvelope(
    "public-progression-pending",
    "Progression pending (levels visible, choices hidden)",
    publicPayload({ total_xp: 40, level: 2 }, { total_xp: 40, level: 2 }),
  ),
  publicEnvelope(
    "public-match-over",
    "Match over (public view)",
    publicPayload(
      { has_submitted: true, ability_selection_phase: null, has_ability_selected: null },
      { hp: 0, has_submitted: true, ability_selection_phase: null, has_ability_selected: null },
      {
        match_status: "complete",
        completed_rounds: 5,
        active_round: null,
        match_over: true,
        winner_id: P1,
        completion_reason: "knockout",
      },
    ),
    5,
  ),
  publicEnvelope(
    "public-pressure-shortened",
    "Shared duration after pressure shortening",
    publicPayload(
      { has_submitted: true },
      {},
      {
        active_round: {
          round_number: 3,
          started_at: T_START,
          active_deadline: T_DEADLINE_PRESSURED,
          duration_seconds: 20,
          pressure_applied: true,
          ready_to_resolve: false,
        },
        next_round_duration_seconds: 25,
      },
    ),
  ),
  publicEnvelope(
    "public-no-hidden-info",
    "Neutral statuses only — no hidden answers or abilities",
    publicPayload({ has_submitted: true, has_ability_selected: true }, { has_ability_selected: false }),
  ),
];

export const getPublicEnvelopeScenario = (key: string) =>
  PUBLIC_ENVELOPE_SCENARIOS.find((s) => s.key === key);

// --- Private envelopes ------------------------------------------------------

const OWN_ABILITIES_L1 = {
  unlocked_ability_ids: ["tank.fortify"],
  locked_ability_ids: ["tank.brace", "tank.barrier"],
  level2_choice_made: false,
  level2_choice: null,
  level2_options: ["tank.brace", "tank.barrier"],
  level3_final_unlock_id: null,
  level3_unlocked: false,
  remaining_charges: { "tank.fortify": 2 },
};

const OWN_CARRYOVER_NONE = {
  pending_fortify: false,
  pending_arcane_charge: false,
  pending_focus: false,
  pending_insight: false,
  pending_tempo: false,
  consecutive_correct: 0,
};

const privatePayload = (
  overrides: Partial<BackendPrivatePlayerProjection>,
): BackendPrivatePlayerProjection => ({
  ...publicPayload({}, {}),
  owner_player_id: P1,
  own_selection: { phase: "open", selected_ability_id: null },
  own_abilities: { ...OWN_ABILITIES_L1, remaining_charges: { ...OWN_ABILITIES_L1.remaining_charges } },
  own_carryover: { ...OWN_CARRYOVER_NONE },
  own_combat_lab_unlock_delta_seconds: 0,
  ...overrides,
});

const privateEnvelope = (
  key: string,
  label: string,
  payload: BackendPrivatePlayerProjection,
): { key: string; label: string; envelope: PrivatePlayerEnvelope } => ({
  key,
  label,
  envelope: {
    schema_version: PRIVATE_SCHEMA_VERSION,
    projection_type: "private_player",
    match_id: payload.match_id,
    round_number: 3,
    payload,
  },
});

export const PRIVATE_ENVELOPE_SCENARIOS = [
  privateEnvelope("private-idle", "No answer or ability selected", privatePayload({})),
  privateEnvelope(
    "private-ability-selected",
    "Active ability selected (window still open)",
    privatePayload({
      own_selection: { phase: "open", selected_ability_id: "tank.fortify" },
    }),
  ),
  privateEnvelope(
    "private-answer-submitted",
    "Answer submitted (accepted), window still open",
    privatePayload({
      players: [
        publicPlayer(P1, "tank", { has_submitted: true, has_ability_selected: true }),
        publicPlayer(P2, "mage", {}),
      ],
      own_selection: { phase: "open", selected_ability_id: "tank.fortify" },
    }),
  ),
  privateEnvelope(
    "private-locked-no-ability",
    "Window locked with NO ability selected",
    privatePayload({
      players: [
        publicPlayer(P1, "tank", { has_submitted: true, ability_selection_phase: "locked", has_ability_selected: false }),
        publicPlayer(P2, "mage", { has_submitted: true, ability_selection_phase: "locked", has_ability_selected: false }),
      ],
      own_selection: { phase: "locked", selected_ability_id: null },
    }),
  ),
  privateEnvelope(
    "private-locked-with-ability",
    "Window locked with an ability choice frozen",
    privatePayload({
      own_selection: { phase: "locked", selected_ability_id: "tank.fortify" },
    }),
  ),
  privateEnvelope(
    "private-level2-pending",
    "Pending Level 2 choice",
    privatePayload({
      players: [
        publicPlayer(P1, "tank", { total_xp: 40, level: 2 }),
        publicPlayer(P2, "mage", {}),
      ],
    }),
  ),
  privateEnvelope(
    "private-level2-chosen",
    "Confirmed Level 2 choice",
    privatePayload({
      own_abilities: {
        unlocked_ability_ids: ["tank.fortify", "tank.brace"],
        locked_ability_ids: ["tank.barrier"],
        level2_choice_made: true,
        level2_choice: "tank.brace",
        level2_options: ["tank.brace", "tank.barrier"],
        level3_final_unlock_id: null,
        level3_unlocked: false,
        remaining_charges: { "tank.fortify": 2, "tank.brace": 3 },
      },
    }),
  ),
  privateEnvelope(
    "private-max-level",
    "Current max level: all three actives unlocked, live charges",
    privatePayload({
      players: [
        publicPlayer(P1, "tank", { total_xp: 100, level: 3 }),
        publicPlayer(P2, "mage", { total_xp: 100, level: 3 }),
      ],
      own_abilities: {
        unlocked_ability_ids: ["tank.fortify", "tank.brace", "tank.barrier"],
        locked_ability_ids: [],
        level2_choice_made: true,
        level2_choice: "tank.brace",
        level2_options: ["tank.brace", "tank.barrier"],
        level3_final_unlock_id: "tank.barrier",
        level3_unlocked: true,
        remaining_charges: { "tank.fortify": 2, "tank.brace": 2, "tank.barrier": 1 },
      },
      own_carryover: { ...OWN_CARRYOVER_NONE, consecutive_correct: 2 },
    }),
  ),
];

export const getPrivateEnvelopeScenario = (key: string) =>
  PRIVATE_ENVELOPE_SCENARIOS.find((s) => s.key === key);

export const FIXTURE_OWNER_ID = P1;
