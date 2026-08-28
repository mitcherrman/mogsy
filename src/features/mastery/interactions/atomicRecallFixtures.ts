/**
 * Dev-only fixtures for the atomic-recall interaction (Phase 4C1).
 *
 * Backend-shaped envelopes proving the one-champion / non-combat path end to
 * end: `state = null`, `matchup_identity = null`, `interaction_kind =
 * "atomic_recall"`, `prompt_semantics` structured (never prose). Covers the
 * four recall shapes this slice supports: ability cooldown, resource cost,
 * base stat, level stat. Not used by any production/served path — only by
 * the dev prototype page and this package's own tests.
 */

const SESSION_ID = "msess_fixture_atomic_recall_001";
const SET_ID = "mset_fixture_atomic_recall_0000000000000000000000000000000000000000000000000000000000";
const ARTIFACT_DIGEST =
  "martifact_fixture_atomic_recall_00000000000000000000000000000000000000000000000000000000000";
const DISPLAY_REVISION = "disprev_atomic-recall-fixture.v1";
const PATCH_DISPLAY = "Certified snapshot — League 26.14 context";
const TOTAL_STEPS = 4;

function questionEnvelope(payload: Record<string, unknown>) {
  return {
    projection_type: "mastery_player_question",
    schema_version: "mastery-player-question.v1",
    data: payload,
  };
}

function revealEnvelope(payload: Record<string, unknown>) {
  return {
    projection_type: "mastery_player_reveal",
    schema_version: "mastery-player-reveal.v1",
    data: payload,
  };
}

function baseQuestion(seq: number) {
  return {
    session_id: SESSION_ID,
    mastery_set_id: SET_ID,
    artifact_digest: ARTIFACT_DIGEST,
    display_revision: DISPLAY_REVISION,
    sequence_index: seq,
    total_steps: TOTAL_STEPS,
    patch_display: PATCH_DISPLAY,
    // The whole point of this fixture set: no matchup, no combat state.
    state: null,
    matchup_identity: null,
    interaction_kind: "atomic_recall",
    hint_available: false,
    is_read_only: true,
    answer_type: "numeric",
    answer_options: [],
  };
}

function numericConstraints(unit: string, decimalPlaces: number | null = null) {
  return {
    unit,
    min: 0,
    max: null,
    step: null,
    integer_only: decimalPlaces === 0,
    decimal_places: decimalPlaces,
    rounding_mode: decimalPlaces !== null ? "nearest" : null,
    precision_instruction:
      decimalPlaces !== null ? `Round to ${decimalPlaces} decimal place${decimalPlaces === 1 ? "" : "s"}.` : null,
    precision_contract_version: "mastery-precision.v1",
  };
}

function baseReveal(seq: number) {
  return {
    session_id: SESSION_ID,
    mastery_set_id: SET_ID,
    artifact_digest: ARTIFACT_DIGEST,
    display_revision: DISPLAY_REVISION,
    sequence_index: seq,
    source_summary: { label: "Riot DataDragon 16.14.1 + certified spreadsheet revisions", source_count: 2 },
    next_step_ready: true,
    // No combat state exists for an atomic-recall step.
    before_state: null,
    after_state: null,
    applied_transition: null,
    proposed_transition: null,
  };
}

/**
 * Four safe pre-submission player-question envelopes, one per supported
 * atomic-recall category: ability cooldown, resource cost, base stat, level
 * stat.
 */
export function atomicRecallQuestionEnvelopes(): Record<string, unknown>[] {
  return [
    // 0: ability cooldown recall
    questionEnvelope({
      ...baseQuestion(0),
      question_family: "ability_cooldown_recall",
      prompt: "(unused — atomic recall renders from prompt_semantics, never this field)",
      input_constraints: numericConstraints("seconds", 1),
      prompt_semantics: {
        template: "ability_cooldown_at_rank",
        champion_display: "Ahri",
        metric: "ability_cooldown",
        subject_ref: "E",
        ability_name: "Charm",
        context: { ability_rank: 3, champion_level: null, form: null },
      },
    }),
    // 1: resource-cost recall
    questionEnvelope({
      ...baseQuestion(1),
      question_family: "ability_cost_recall",
      prompt: "(unused — atomic recall renders from prompt_semantics, never this field)",
      input_constraints: numericConstraints("mana", 0),
      prompt_semantics: {
        template: "ability_cost_flat",
        champion_display: "Ahri",
        metric: "ability_cost",
        subject_ref: "Q",
        ability_name: "Orb of Deception",
        context: { ability_rank: null, champion_level: null, form: null },
      },
    }),
    // 2: base-stat recall
    questionEnvelope({
      ...baseQuestion(2),
      question_family: "champion_base_stat_recall",
      prompt: "(unused — atomic recall renders from prompt_semantics, never this field)",
      input_constraints: numericConstraints("armor", 1),
      prompt_semantics: {
        template: "champion_base_stat",
        champion_display: "Ahri",
        metric: "armor",
        subject_ref: "",
        ability_name: "",
        context: { ability_rank: null, champion_level: null, form: null },
      },
    }),
    // 3: level-stat recall
    questionEnvelope({
      ...baseQuestion(3),
      question_family: "champion_level_stat_recall",
      prompt: "(unused — atomic recall renders from prompt_semantics, never this field)",
      input_constraints: numericConstraints("health", 1),
      prompt_semantics: {
        template: "champion_stat_at_level",
        champion_display: "Ahri",
        metric: "health",
        subject_ref: "",
        ability_name: "",
        context: { ability_rank: null, champion_level: 11, form: null },
      },
    }),
  ];
}

/** Four reveal envelopes pairing the questions above. */
export function atomicRecallRevealEnvelopes(): Record<string, unknown>[] {
  return [
    revealEnvelope({
      ...baseReveal(0),
      question_family: "ability_cooldown_recall",
      player_answer: 8.4,
      authoritative_correctness: true,
      correct_answer: 8.4,
      correct_answer_display: "8.4",
      explanation: "Ahri E (Charm) certified base cooldown at rank 3 is 8.4 seconds.",
      calculation_steps: [],
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(1),
      question_family: "ability_cost_recall",
      player_answer: 65,
      authoritative_correctness: false,
      correct_answer: 60,
      correct_answer_display: "60",
      explanation: "Ahri Q (Orb of Deception) certified flat mana cost is 60.",
      calculation_steps: [],
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(2),
      question_family: "champion_base_stat_recall",
      player_answer: 20.9,
      authoritative_correctness: true,
      correct_answer: 20.9,
      correct_answer_display: "20.9",
      explanation: "Ahri's certified base armor is 20.9.",
      calculation_steps: [],
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(3),
      question_family: "champion_level_stat_recall",
      player_answer: 1652.5,
      authoritative_correctness: true,
      correct_answer: 1652.5,
      correct_answer_display: "1652.5",
      explanation: "Ahri's certified health at level 11 is 1652.5.",
      calculation_steps: [],
      completion_state: { is_final_step: true, set_completed: true },
    }),
  ];
}
