/**
 * Dev-only fixtures for the comparison_left_right interaction (Phase 4C2).
 *
 * Backend-shaped envelopes proving the two-champion / non-combat comparative
 * path end to end: `state = null`, `matchup_identity = null`,
 * `interaction_kind = "comparison_left_right"`, `comparison_semantics`
 * structured (never prose, and — unlike `explanation`/`correct_answer` —
 * never carrying a value, a winner, or a tie state). Answer domain is always
 * `[champion_a, champion_b, "tie"]`, mirroring
 * `mastery.manifest_session.adapter._answer_and_options`. Covers: a decisive
 * ability-cooldown comparison (Ahri vs Syndra), a decisive champion-base-stat
 * comparison, and a true tie. Not used by any production/served path — only
 * by the dev prototype page and this package's own tests.
 */

const SESSION_ID = "msess_fixture_comparison_001";
const SET_ID = "mset_fixture_comparison_0000000000000000000000000000000000000000000000000000000000";
const ARTIFACT_DIGEST =
  "martifact_fixture_comparison_00000000000000000000000000000000000000000000000000000000000";
const DISPLAY_REVISION = "disprev_comparison-fixture.v1";
const PATCH_DISPLAY = "Certified snapshot — League 26.14 context";
const TOTAL_STEPS = 3;

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

function baseQuestion(seq: number, championA: string, championB: string) {
  return {
    session_id: SESSION_ID,
    mastery_set_id: SET_ID,
    artifact_digest: ARTIFACT_DIGEST,
    display_revision: DISPLAY_REVISION,
    sequence_index: seq,
    total_steps: TOTAL_STEPS,
    patch_display: PATCH_DISPLAY,
    // No combat state and no legacy matchup identity for a comparison step —
    // a matchup candidate is stateless (Phase 4B).
    state: null,
    matchup_identity: null,
    interaction_kind: "comparison_left_right",
    hint_available: false,
    is_read_only: true,
    answer_type: "single_choice",
    // Always the canonical three-way domain — champion A, champion B, tie —
    // regardless of whether THIS comparison happens to be decisive or a tie.
    answer_options: [championA, championB, "tie"],
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
    // No combat state exists for a comparison step.
    before_state: null,
    after_state: null,
    applied_transition: null,
    proposed_transition: null,
    calculation_steps: [],
  };
}

/**
 * Three safe pre-submission player-question envelopes: a decisive ability
 * comparison, a decisive champion-stat comparison, and a true tie.
 */
export function comparisonQuestionEnvelopes(): Record<string, unknown>[] {
  return [
    // 0: decisive ability-cooldown comparison — Ahri E vs Syndra E
    questionEnvelope({
      ...baseQuestion(0, "ahri", "syndra"),
      question_family: "ability_cooldown_compare",
      prompt: "(unused — comparison renders from comparison_semantics, never this field)",
      comparison_semantics: {
        template: "compare_ability_cooldown",
        champion_a_display: "Ahri",
        champion_b_display: "Syndra",
        metric: "ability_cooldown",
        dimension: "time",
        subject_ref: "E",
        context: { ability_rank: 3, champion_level: null, form: null },
        unit: "seconds",
      },
    }),
    // 1: decisive champion base-stat comparison
    questionEnvelope({
      ...baseQuestion(1, "ahri", "syndra"),
      question_family: "champion_stat_compare",
      prompt: "(unused — comparison renders from comparison_semantics, never this field)",
      comparison_semantics: {
        template: "compare_champion_base_stat",
        champion_a_display: "Ahri",
        champion_b_display: "Syndra",
        metric: "armor",
        dimension: "armor",
        subject_ref: "",
        context: { ability_rank: null, champion_level: null, form: null },
        unit: "armor",
      },
    }),
    // 2: a true tie — resource cost comparison
    questionEnvelope({
      ...baseQuestion(2, "ahri", "syndra"),
      question_family: "ability_cost_compare",
      prompt: "(unused — comparison renders from comparison_semantics, never this field)",
      comparison_semantics: {
        template: "compare_ability_cost",
        champion_a_display: "Ahri",
        champion_b_display: "Syndra",
        metric: "ability_cost",
        dimension: "resource",
        subject_ref: "W",
        context: { ability_rank: 1, champion_level: null, form: null },
        unit: "mana",
      },
    }),
  ];
}

/** Three reveal envelopes pairing the questions above. */
export function comparisonRevealEnvelopes(): Record<string, unknown>[] {
  return [
    revealEnvelope({
      ...baseReveal(0),
      question_family: "ability_cooldown_compare",
      player_answer: "ahri",
      authoritative_correctness: true,
      correct_answer: "ahri",
      correct_answer_display: "Ahri",
      explanation: "Ahri E (rank 3): 8.4s. Syndra E (rank 3): 15.0s. Ahri wins by 6.6s.",
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(1),
      question_family: "champion_stat_compare",
      player_answer: "ahri",
      authoritative_correctness: false,
      correct_answer: "syndra",
      correct_answer_display: "Syndra",
      explanation: "Ahri base armor: 20.9. Syndra base armor: 21.9. Syndra wins by 1.0.",
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(2),
      question_family: "ability_cost_compare",
      player_answer: "tie",
      authoritative_correctness: true,
      correct_answer: "tie",
      correct_answer_display: "Tie / Same",
      explanation: "Ahri W (rank 1) cost: 20 mana. Syndra W (rank 1) cost: 20 mana. Tied — no difference.",
      completion_state: { is_final_step: true, set_completed: true },
    }),
  ];
}
