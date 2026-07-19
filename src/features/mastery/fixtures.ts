/**
 * Backend-shaped fixtures for the audited first Mastery artifact (G5.2A).
 *
 * These reproduce the SHAPE of future backend Mastery projections so the readers
 * are exercised against real contract structure. IDs and values are copied from
 * the independently audited artifact.
 *
 *   backend commit : ea527ee
 *   mastery_set_id : mset_aaf6c0553e4d9339ea3295317275e116f2ef0a8f867a34302675f2dea5abc83c
 *   artifact_digest: martifact_a91f1584089d0c1d2ef4a14c35ad071bcccf5e473f6d50ebb76206870465fe90
 *
 * Player-question fixtures carry ONLY safe pre-submission fields (no answer, no
 * calculation, no post-transition state). Not used in production code.
 */

// ------------------------------------------------------- audited identities
export const SET_ID = "mset_aaf6c0553e4d9339ea3295317275e116f2ef0a8f867a34302675f2dea5abc83c";
export const ARTIFACT_DIGEST =
  "martifact_a91f1584089d0c1d2ef4a14c35ad071bcccf5e473f6d50ebb76206870465fe90";
export const PATCH_KEY_DIGEST =
  "patchkey_0784955b687f1dd1cff931f7f7cb819ec6ecd71e4902347cfdfbf5fc7440b471";
export const VCTX_DIGEST =
  "vctx_c37cae554ae880d43657230fa0c119796a5b6fc59439d82187fa189d08585980";

export const SNAP0 = "snap_257350f8b649e44f6c90609da32c36da39c051d0fb493f9391190f40ea334e0a";
export const SNAP1 = "snap_35494d698025bab89ac03ee1dbd862924bb07ae190efbf69510db6acb14ab49e";
export const SNAP2 = "snap_09d53f93703b788e02a33e5e7a01522ad8dfbf6a2145e6d26170e2f2665e4d20";

export const TXN1 = "txn_2419e8cc94d889e15031d24ac02c51f533a675c17a73dc69cd781abd79da4e5a";
export const TXN2 = "txn_07527993aaa9365bbcba861d5182b715e0c52a965471fbc3e533213547a16465";

export const STEP_IDS = [
  "mqstep_873758512f3eb1ae090dfcbfdbc1c1e60075737c092c53652cce7ed0aa3a085e",
  "mqstep_4ab308058717ad0ed256a152e2e3ae5480dc00fb3d2529a426462896f42a26f4",
  "mqstep_ad74edf52ea65f9f6b86ce82355bf0dcb7f8030b79b384ad0787323cedd99d24",
  "mqstep_51ff339b3dfb3f9c3551523df6d64aebe4c5ed203be92631bd8b207ba39604fb",
  "mqstep_7ccf5942ba7eb149c21c92f321b5d01a3cfd4acee8049edbc6aca4c151c561f7",
  "mqstep_4d1adaaa91fd8eb3bada2ce77585c642edf6cdd8e574e40ac8f8adb356db21ab",
] as const;

// Publication/runtime-layer fixture identifiers (not canonical artifact hashes).
export const SESSION_ID = "msess_fixture_ahri_syndra_001";
export const DISPLAY_REVISION = "disprev_ahri-syndra-e.v1";
export const TOTAL_STEPS = 6;
export const PATCH_DISPLAY = "Mixed verified snapshot — League 26.13 context";

const MATCHUP = { champion_a: "ahri", champion_b: "syndra", focus: "E_vs_E" };

// ----------------------------------------------------------- state builders
function ahri(effects: boolean) {
  return {
    champion_id: "ahri",
    display_name: "Ahri",
    current_health: 590.0,
    max_health: null,
    resource_type: "mana",
    current_resource: 400.0,
    max_resource: null,
    active_effects: effects
      ? [
          {
            effect_id: "mastery.authored.ability_haste.scenario.v1",
            label: "Ability Haste +20 (authored)",
            magnitude: 20.0,
            unit: "ability_haste",
          },
        ]
      : [],
    inventory_summary: [],
  };
}

function syndra(hp: number) {
  return {
    champion_id: "syndra",
    display_name: "Syndra",
    current_health: hp,
    max_health: null,
    resource_type: "mana",
    current_resource: 400.0,
    max_resource: null,
    active_effects: [],
    inventory_summary: [],
  };
}

function stateView(snapshotId: string, hasted: boolean, syndraHp: number, label: string) {
  return {
    snapshot_id: snapshotId,
    patch_key_digest: PATCH_KEY_DIGEST,
    validation_status: "certified",
    label,
    champion_a: ahri(hasted),
    champion_b: syndra(syndraHp),
  };
}

export function stateS0() {
  return stateView(SNAP0, false, 480.0, "Initial state");
}
export function stateS1() {
  return stateView(SNAP1, true, 480.0, "After authored +20 ability haste on Ahri");
}
export function stateS2() {
  return stateView(SNAP2, true, 230.0, "After the first Ahri E hit");
}

// ------------------------------------------------- player-question envelopes
function questionEnvelope(payload: Record<string, unknown>) {
  return {
    projection_type: "mastery_player_question",
    schema_version: "mastery-player-question.v1",
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
    matchup_identity: { ...MATCHUP },
    hint_available: false,
  };
}

function numeric(unit: string, min: number | null = null, max: number | null = null) {
  return { unit, min, max, step: null, integer_only: false };
}

/** Six safe pre-submission player-question envelopes (Q1–Q6). */
export function playerQuestionEnvelopes(): Record<string, unknown>[] {
  return [
    questionEnvelope({
      ...baseQuestion(0),
      question_family: "cooldown_comparison",
      answer_type: "numeric",
      answer_options: [],
      input_constraints: numeric("seconds", 0),
      prompt:
        "Ahri E base cooldown is 12 seconds and Syndra E base cooldown is 15 seconds, both at 0 ability haste. By how many seconds is Ahri E's base cooldown lower than Syndra E's?",
      state: stateS0(),
      is_read_only: true,
    }),
    questionEnvelope({
      ...baseQuestion(1),
      question_family: "cooldown_with_haste",
      answer_type: "numeric",
      answer_options: [],
      input_constraints: numeric("seconds", 0),
      prompt:
        "With an authored +20 ability haste applied to Ahri, what is Ahri E's cooldown in seconds (base 12 seconds)?",
      state: stateS1(),
      is_read_only: true,
    }),
    questionEnvelope({
      ...baseQuestion(2),
      question_family: "cooldown_comparison",
      answer_type: "numeric",
      answer_options: [],
      input_constraints: numeric("seconds", 0),
      prompt:
        "With Ahri E at 20 ability haste (10 seconds) and Syndra E at 0 ability haste (15 seconds), by how many seconds is Ahri E's cooldown lower than Syndra E's?",
      state: stateS1(),
      is_read_only: true,
    }),
    questionEnvelope({
      ...baseQuestion(3),
      question_family: "raw_single_type_damage",
      answer_type: "numeric",
      answer_options: [],
      input_constraints: numeric("damage", 0),
      prompt: "At Ahri E rank 5 with 100 ability power, what is Ahri E's raw magic damage?",
      state: stateS1(),
      is_read_only: true,
    }),
    questionEnvelope({
      ...baseQuestion(4),
      question_family: "health_remaining",
      answer_type: "numeric",
      answer_options: [],
      input_constraints: numeric("health", 0),
      prompt:
        "Ahri's rank-5 E deals 250 magic damage after mitigation. If the target begins at 480 health, how much health remains after the hit?",
      state: stateS1(),
      is_read_only: false,
    }),
    questionEnvelope({
      ...baseQuestion(5),
      question_family: "health_remaining",
      answer_type: "boolean",
      answer_options: ["No", "Yes"],
      prompt:
        "The target is at 230 health after the first Ahri E hit. Does a second identical Ahri E hit (250 post-mitigation magic damage) reduce the target's health to 0?",
      state: stateS2(),
      is_read_only: true,
    }),
  ];
}

// -------------------------------------------------------- reveal envelopes
function revealEnvelope(payload: Record<string, unknown>) {
  return {
    projection_type: "mastery_player_reveal",
    schema_version: "mastery-player-reveal.v1",
    data: payload,
  };
}

function calcStep(order: number, description: string, expression: string, result: number) {
  return { order, description, expression, result };
}

function stateUnchanged(label: string) {
  return { classification: "state_unchanged", label };
}

function baseReveal(seq: number) {
  return {
    session_id: SESSION_ID,
    mastery_set_id: SET_ID,
    artifact_digest: ARTIFACT_DIGEST,
    display_revision: DISPLAY_REVISION,
    sequence_index: seq,
    source_summary: { label: "Riot DataDragon 16.12.1 + certified spreadsheet revisions", source_count: 3 },
    next_step_ready: true,
  };
}

/** Six reveal envelopes carrying the audited results. */
export function playerRevealEnvelopes(): Record<string, unknown>[] {
  return [
    revealEnvelope({
      ...baseReveal(0),
      question_family: "cooldown_comparison",
      player_answer: 3.0,
      authoritative_correctness: true,
      correct_answer: 3.0,
      explanation: "Ahri E 12 s vs Syndra E 15 s; difference is 3 seconds.",
      calculation_steps: [
        calcStep(1, "Ahri E final cooldown (certified base 12.0, haste 0.0)", "final_cooldown(12.0, 0.0)", 12.0),
        calcStep(2, "Syndra E final cooldown (certified base 15.0, haste 0.0)", "final_cooldown(15.0, 0.0)", 15.0),
        calcStep(3, "Absolute cooldown difference", "abs(12.0 - 15.0)", 3.0),
      ],
      // Q1 is answered from S0; its calculation neither proposes nor computes T1.
      // After the reveal, the independently authored +20 ability-haste effect (T1)
      // is applied as an inter-step transition, advancing display state S0 -> S1.
      before_state: stateS0(),
      after_state: stateS1(),
      applied_transition: {
        classification: "authored_effect",
        origin: "authored_inter_step",
        transition_id: TXN1,
        target: "A",
        label: "Authored +20 ability haste applied to Ahri (independent scenario transition, not proposed by this question)",
        effect: "ability_haste",
        magnitude: 20.0,
        unit: "ability_haste",
        applied: true,
      },
      proposed_transition: null,
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(1),
      question_family: "cooldown_with_haste",
      player_answer: 10.0,
      authoritative_correctness: true,
      correct_answer: 10.0,
      explanation: "12 * 100 / (100 + 20) = 10 seconds.",
      calculation_steps: [
        calcStep(1, "Cooldown reduction multiplier from ability haste", "100 / (100 + 20.0)", 0.8333333333333334),
        calcStep(2, "Final cooldown after haste", "12.0 * 0.8333333333333334", 10.0),
      ],
      // Q2 is served from S1: it READS the already-applied authored +20 haste
      // effect (visible in its state view) but does not cause or re-apply T1.
      before_state: stateS1(),
      after_state: stateS1(),
      applied_transition: stateUnchanged("State unchanged — reads the existing authored effect, applies nothing"),
      proposed_transition: null,
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(2),
      question_family: "cooldown_comparison",
      player_answer: 5.0,
      authoritative_correctness: true,
      correct_answer: 5.0,
      explanation: "Ahri E 10 s vs Syndra E 15 s; difference is 5 seconds.",
      calculation_steps: [
        calcStep(1, "Ahri E final cooldown (certified base 12.0, haste 20.0)", "final_cooldown(12.0, 20.0)", 10.0),
        calcStep(2, "Syndra E final cooldown (certified base 15.0, haste 0.0)", "final_cooldown(15.0, 0.0)", 15.0),
        calcStep(3, "Absolute cooldown difference", "abs(10.0 - 15.0)", 5.0),
      ],
      before_state: stateS1(),
      after_state: stateS1(),
      applied_transition: stateUnchanged("State unchanged — read-only question"),
      proposed_transition: null,
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(3),
      question_family: "raw_single_type_damage",
      player_answer: 325.0,
      authoritative_correctness: true,
      correct_answer: 325.0,
      explanation: "240 base + 0.85 * 100 AP = 325 magic damage.",
      calculation_steps: [
        calcStep(1, "Certified Ahri E base magic damage at rank 5", "240.0", 240.0),
        calcStep(2, "Add certified AP scaling", "240.0 + 0.85 * 100", 325.0),
      ],
      before_state: stateS1(),
      after_state: stateS1(),
      applied_transition: stateUnchanged("State unchanged — read-only question"),
      proposed_transition: null,
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(4),
      question_family: "health_remaining",
      player_answer: 230.0,
      authoritative_correctness: true,
      correct_answer: 230.0,
      explanation: "The hit deals 250 post-mitigation magic damage; 480 - 250 = 230 health remaining.",
      calculation_steps: [
        calcStep(7, "Post-mitigation damage", "325.0 * 0.7692307692307693", 250.0),
        calcStep(8, "Health remaining (floored at zero)", "max(0, 480.0 - 250.0)", 230.0),
      ],
      before_state: stateS1(),
      after_state: stateS2(),
      applied_transition: {
        classification: "health_change",
        origin: "question_proposed",
        transition_id: TXN2,
        target: "B",
        label: "Ahri E first hit applied to Syndra",
        before_value: 480.0,
        after_value: 230.0,
        delta: -250.0,
        unit: "health",
        applied: true,
      },
      proposed_transition: null,
      completion_state: { is_final_step: false, set_completed: false },
    }),
    revealEnvelope({
      ...baseReveal(5),
      question_family: "health_remaining",
      player_answer: true,
      authoritative_correctness: true,
      correct_answer: true,
      explanation: "230 - 250 = -20; health floors at 0, so the target reaches 0 (overkill 20).",
      calculation_steps: [
        calcStep(7, "Post-mitigation damage", "325.0 * 0.7692307692307693", 250.0),
        calcStep(8, "Raw remaining health", "230.0 - 250.0", -20.0),
        calcStep(9, "Health remaining (floored at zero)", "max(0, -20.0)", 0.0),
        calcStep(10, "Overkill", "abs(min(0, -20.0))", 20.0),
      ],
      before_state: stateS2(),
      after_state: stateS2(),
      applied_transition: stateUnchanged("State unchanged — read-only question"),
      // Q6 proposes a health change but the chain ends; it is not applied.
      proposed_transition: {
        classification: "health_change",
        origin: "question_proposed",
        transition_id: TXN2,
        target: "B",
        label: "Proposed second Ahri E hit (not applied — chain ends)",
        before_value: 230.0,
        after_value: 0.0,
        delta: -250.0,
        unit: "health",
        applied: false,
      },
      completion_state: { is_final_step: true, set_completed: true },
    }),
  ];
}

// -------------------------------------------------------- reviewer envelope
function reviewStep(index: number, opts: {
  family: string;
  answerType: string;
  correct: number | boolean;
  before: string;
  after: string;
  transitionId: string | null;
  isReadOnly: boolean;
  proposes: boolean;
  capsuleEligible: boolean;
  capsuleReason: string | null;
  requiresRewording: boolean;
  standaloneComplete: boolean;
  prompt: string;
  explanation: string;
  adapterId: string;
  operationType: string;
  calcValue: number;
  calcUnit: string;
}) {
  return {
    step_id: STEP_IDS[index],
    sequence_index: index,
    question_family: opts.family,
    answer_type: opts.answerType,
    correct_answer: opts.correct,
    before_snapshot_id: opts.before,
    after_snapshot_id: opts.after,
    transition_id: opts.transitionId,
    adapter_id: opts.adapterId,
    operation_type: opts.operationType,
    prompt: opts.prompt,
    explanation: opts.explanation,
    hint: null,
    is_read_only: opts.isReadOnly,
    proposes_deferred_transition: opts.proposes,
    ranked_capsule_eligibility: {
      eligible: opts.capsuleEligible,
      reason_code: opts.capsuleReason,
      requires_rewording: opts.requiresRewording,
      standalone_state_complete: opts.standaloneComplete,
    },
    suppression_state: { suppressed: false, reason_code: null },
    calculation_result: {
      value: opts.calcValue,
      unit: opts.calcUnit,
      recomputation: { matches: true, recomputed_value: opts.calcValue, recomputed_unit: opts.calcUnit },
    },
    eligibility_evidence: {
      eligible: true,
      operation_type: opts.operationType,
      patch_key_digest: PATCH_KEY_DIGEST,
      adapter_id: opts.adapterId,
    },
  };
}

const ADAPTER_CMP = "adapter_261e24c28f455372b3f6beb6f1d378559bb7db8bd737d15c828c1afce329085e";
const ADAPTER_CD = "adapter_416e22ddfbdd0e11515b8b36d9221d47b099ecc32bcae5217c57aff5dd60d11b";
const ADAPTER_RAW = "adapter_raw_ahri_e_v1";
const ADAPTER_HP = "adapter_health_ahri_e_v1";

/** One complete reviewer envelope: full immutable artifact + mutable review record. */
export function reviewArtifactEnvelope(): Record<string, unknown> {
  return {
    projection_type: "mastery_review_artifact",
    schema_version: "mastery-review-artifact.v1",
    data: {
      artifact: {
        mastery_set_id: SET_ID,
        artifact_digest: ARTIFACT_DIGEST,
        patch_key_digest: PATCH_KEY_DIGEST,
        validation_context_digest: VCTX_DIGEST,
        initial_snapshot_id: SNAP0,
        champion_matchup_identity: { ...MATCHUP },
        ordered_steps: [
          reviewStep(0, {
            family: "cooldown_comparison", answerType: "numeric", correct: 3.0, before: SNAP0, after: SNAP0,
            transitionId: null, isReadOnly: true, proposes: false, capsuleEligible: true, capsuleReason: null,
            requiresRewording: false, standaloneComplete: true,
            prompt: "Ahri E base cooldown is 12 seconds and Syndra E base cooldown is 15 seconds, both at 0 ability haste. By how many seconds is Ahri E's base cooldown lower than Syndra E's?",
            explanation: "Ahri E 12 s vs Syndra E 15 s; difference is 3 seconds.",
            adapterId: ADAPTER_CMP, operationType: "cooldown_comparison", calcValue: 3.0, calcUnit: "seconds",
          }),
          reviewStep(1, {
            family: "cooldown_with_haste", answerType: "numeric", correct: 10.0, before: SNAP1, after: SNAP1,
            transitionId: null, isReadOnly: true, proposes: false, capsuleEligible: true, capsuleReason: null,
            requiresRewording: false, standaloneComplete: true,
            prompt: "With an authored +20 ability haste applied to Ahri, what is Ahri E's cooldown in seconds (base 12 seconds)?",
            explanation: "12 * 100 / (100 + 20) = 10 seconds.",
            adapterId: ADAPTER_CD, operationType: "cooldown", calcValue: 10.0, calcUnit: "seconds",
          }),
          reviewStep(2, {
            family: "cooldown_comparison", answerType: "numeric", correct: 5.0, before: SNAP1, after: SNAP1,
            transitionId: null, isReadOnly: true, proposes: false, capsuleEligible: false,
            capsuleReason: "prompt_references_chain_context", requiresRewording: true, standaloneComplete: false,
            prompt: "With Ahri E at 20 ability haste (10 seconds) and Syndra E at 0 ability haste (15 seconds), by how many seconds is Ahri E's cooldown lower than Syndra E's?",
            explanation: "Ahri E 10 s vs Syndra E 15 s; difference is 5 seconds.",
            adapterId: ADAPTER_CMP, operationType: "cooldown_comparison", calcValue: 5.0, calcUnit: "seconds",
          }),
          reviewStep(3, {
            family: "raw_single_type_damage", answerType: "numeric", correct: 325.0, before: SNAP1, after: SNAP1,
            transitionId: null, isReadOnly: true, proposes: false, capsuleEligible: true, capsuleReason: null,
            requiresRewording: false, standaloneComplete: true,
            prompt: "At Ahri E rank 5 with 100 ability power, what is Ahri E's raw magic damage?",
            explanation: "240 base + 0.85 * 100 AP = 325 magic damage.",
            adapterId: ADAPTER_RAW, operationType: "raw_damage", calcValue: 325.0, calcUnit: "damage",
          }),
          reviewStep(4, {
            family: "health_remaining", answerType: "numeric", correct: 230.0, before: SNAP1, after: SNAP2,
            transitionId: TXN2, isReadOnly: false, proposes: true, capsuleEligible: true, capsuleReason: null,
            requiresRewording: false, standaloneComplete: true,
            prompt: "Ahri's rank-5 E deals 250 magic damage after mitigation. If the target begins at 480 health, how much health remains after the hit?",
            explanation: "The hit deals 250 post-mitigation magic damage; 480 - 250 = 230 health remaining.",
            adapterId: ADAPTER_HP, operationType: "health_remaining", calcValue: 230.0, calcUnit: "health",
          }),
          reviewStep(5, {
            family: "health_remaining", answerType: "boolean", correct: true, before: SNAP2, after: SNAP2,
            transitionId: null, isReadOnly: true, proposes: true, capsuleEligible: false,
            capsuleReason: "depends_on_prior_step", requiresRewording: true, standaloneComplete: false,
            prompt: "The target is at 230 health after the first Ahri E hit. Does a second identical Ahri E hit (250 post-mitigation magic damage) reduce the target's health to 0?",
            explanation: "230 - 250 = -20; health floors at 0, so the target reaches 0 (overkill 20).",
            adapterId: ADAPTER_HP, operationType: "health_remaining", calcValue: 0.0, calcUnit: "health",
          }),
        ],
        transition_chain: [
          {
            transition_id: TXN1,
            transition_type: "buff_application",
            target: "A",
            before_snapshot_id: SNAP0,
            after_snapshot_id: SNAP1,
            params: { effect_id: "mastery.authored.ability_haste.scenario.v1", magnitude: 20.0 },
          },
          {
            transition_id: TXN2,
            transition_type: "health_change",
            target: "B",
            before_snapshot_id: SNAP1,
            after_snapshot_id: SNAP2,
            params: { delta: -250.0 },
          },
        ],
        authored_transition_ids: [TXN1],
        supported_mechanic_declarations: [
          { champion_id: "ahri", ability_key: "E", operation: "cooldown", question_family: "cooldown_with_haste" },
          { champion_id: "ahri", ability_key: "E", operation: "raw_damage", question_family: "raw_single_type_damage" },
          { champion_id: "ahri", ability_key: "E", operation: "health_remaining", question_family: "health_remaining" },
          { champion_id: "syndra", ability_key: "E", operation: "cooldown", question_family: "cooldown_with_haste" },
        ],
        suppressed_mechanic_declarations: [
          {
            champion_id: "*", ability_key: "*", operation: "item_sale",
            reason_code: "uncertified_source", eligibility_evidence: {}, source_evidence: [{ item: "Malignance" }],
          },
        ],
        build_classification: {
          classification: "curated",
          confidence: "low",
          curation_statement: "Curated teaching state for Ahri E vs Syndra E; not a proven or popular build.",
          is_proven_meta: false,
          source_records: [],
        },
        patch_descriptor: {
          game_patch_display: PATCH_DISPLAY,
          ddragon_version: "16.12.1",
          engine_version: "mastery-g2-0.1.0",
          provenance_status: "mixed_verified",
        },
        validation_context: { patch_key_digest: PATCH_KEY_DIGEST, stat_calculation_version: "mastery-calc-1.0.0" },
        source_records: [{ source_kind: "data_dragon", source_name: "DataDragon 16.12.1", revision: "16.12.1" }],
        generator_id: "g4.2c-first-ahri-syndra",
        generation_engine_version: "mastery-g4-0.1.0",
      },
      review_record: {
        artifact_digest: ARTIFACT_DIGEST,
        reviewer_status: "unreviewed",
        publication_status: "draft",
        reviewer_notes: "",
        revision_history: [],
        source_hash: "reviewhash_fixture_0001",
      },
    },
  };
}
