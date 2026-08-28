/**
 * Phase 4C1 nullable-contract widening tests.
 *
 * Proves `state`, `matchupIdentity`, and `championB` are now nullable WITHOUT
 * breaking any existing legacy-populated payload — every legacy fixture in
 * `contracts.test.ts` / `contractCompat.test.ts` still parses unchanged, and
 * these tests cover the new null cases those didn't.
 */
import { describe, expect, it } from "vitest";

import { MasteryContractParseError } from "./common";
import { readPlayerQuestion } from "./playerQuestion";
import { readPlayerReveal } from "./playerReveal";
import { readStateView } from "./stateView";

function baseQuestionPayload(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "msess_x",
    mastery_set_id: "mset_x",
    artifact_digest: "martifact_x",
    display_revision: "disprev_x",
    sequence_index: 0,
    total_steps: 1,
    question_family: "ability_cooldown_recall",
    prompt: "placeholder",
    patch_display: "Patch 26.14",
    is_read_only: true,
    hint_available: false,
    answer_type: "numeric",
    answer_options: [],
    input_constraints: { unit: "seconds", min: 0, max: null, step: null, integer_only: false },
    ...overrides,
  };
}

describe("MasteryStateView.championB nullable", () => {
  it("parses a state with an explicit null champion_b", () => {
    const view = readStateView({
      snapshot_id: "snap_x",
      patch_key_digest: null,
      validation_status: null,
      label: null,
      champion_a: { champion_id: "ahri", display_name: "Ahri", current_health: 590, max_health: null,
        resource_type: "mana", current_resource: 400, max_resource: null, active_effects: [], inventory_summary: [] },
      champion_b: null,
    });
    expect(view.championB).toBeNull();
    expect(view.championA.championId).toBe("ahri");
  });

  it("parses a state with champion_b entirely absent", () => {
    const view = readStateView({
      snapshot_id: "snap_x",
      champion_a: { champion_id: "ahri", display_name: "Ahri", current_health: 590, max_health: null,
        resource_type: "mana", current_resource: 400, max_resource: null, active_effects: [], inventory_summary: [] },
    });
    expect(view.championB).toBeNull();
  });

  it("still requires champion_a", () => {
    expect(() => readStateView({ champion_b: null })).toThrow(MasteryContractParseError);
  });
});

describe("MasteryPlayerQuestion state/matchupIdentity nullable", () => {
  it("parses state=null and matchup_identity=null on an atomic_recall question", () => {
    const q = readPlayerQuestion(
      baseQuestionPayload({
        state: null,
        matchup_identity: null,
        interaction_kind: "atomic_recall",
        prompt_semantics: {
          template: "champion_base_stat",
          champion_display: "Ahri",
          metric: "armor",
        },
      }),
    );
    expect(q.state).toBeNull();
    expect(q.matchupIdentity).toBeNull();
    expect(q.interactionKind).toBe("atomic_recall");
    expect(q.promptSemantics).not.toBeNull();
  });

  it("defaults interactionKind to legacy_combat when absent from the wire", () => {
    const q = readPlayerQuestion(
      baseQuestionPayload({
        state: {
          snapshot_id: "snap_x",
          champion_a: { champion_id: "ahri", display_name: "Ahri", current_health: 590, max_health: null,
            resource_type: "mana", current_resource: 400, max_resource: null, active_effects: [], inventory_summary: [] },
          champion_b: { champion_id: "syndra", display_name: "Syndra", current_health: 480, max_health: null,
            resource_type: "mana", current_resource: 400, max_resource: null, active_effects: [], inventory_summary: [] },
        },
        matchup_identity: { champion_a: "ahri", champion_b: "syndra", focus: "E_vs_E" },
      }),
    );
    expect(q.interactionKind).toBe("legacy_combat");
    expect(q.promptSemantics).toBeNull();
    expect(q.state).not.toBeNull();
    expect(q.matchupIdentity).not.toBeNull();
  });

  it("rejects atomic_recall without prompt_semantics (fail closed)", () => {
    expect(() =>
      readPlayerQuestion(
        baseQuestionPayload({ state: null, matchup_identity: null, interaction_kind: "atomic_recall" }),
      ),
    ).toThrow(MasteryContractParseError);
  });

  it("rejects legacy_combat that carries prompt_semantics (fail closed)", () => {
    expect(() =>
      readPlayerQuestion(
        baseQuestionPayload({
          state: null,
          matchup_identity: null,
          interaction_kind: "legacy_combat",
          prompt_semantics: { template: "champion_base_stat", champion_display: "Ahri", metric: "armor" },
        }),
      ),
    ).toThrow(MasteryContractParseError);
  });

  it("rejects an unrecognised interaction_kind", () => {
    expect(() =>
      readPlayerQuestion(baseQuestionPayload({ interaction_kind: "scenario_derived" })),
    ).toThrow(MasteryContractParseError);
  });

  it("parses state=null and matchup_identity=null on a comparison_left_right question (Phase 4C2)", () => {
    const q = readPlayerQuestion(
      baseQuestionPayload({
        state: null,
        matchup_identity: null,
        interaction_kind: "comparison_left_right",
        answer_type: "single_choice",
        answer_options: ["ahri", "syndra", "tie"],
        input_constraints: null,
        comparison_semantics: {
          template: "compare_ability_cooldown",
          champion_a_display: "Ahri",
          champion_b_display: "Syndra",
          metric: "ability_cooldown",
          subject_ref: "E",
          context: { ability_rank: 3, champion_level: null, form: null },
          unit: "seconds",
        },
      }),
    );
    expect(q.state).toBeNull();
    expect(q.matchupIdentity).toBeNull();
    expect(q.interactionKind).toBe("comparison_left_right");
    expect(q.comparisonSemantics).not.toBeNull();
    expect(q.promptSemantics).toBeNull();
  });

  it("rejects comparison_left_right without comparison_semantics (fail closed)", () => {
    expect(() =>
      readPlayerQuestion(
        baseQuestionPayload({
          state: null,
          matchup_identity: null,
          interaction_kind: "comparison_left_right",
          answer_type: "single_choice",
          answer_options: ["ahri", "syndra", "tie"],
          input_constraints: null,
        }),
      ),
    ).toThrow(MasteryContractParseError);
  });

  it("rejects legacy_combat that carries comparison_semantics (fail closed)", () => {
    expect(() =>
      readPlayerQuestion(
        baseQuestionPayload({
          state: null,
          matchup_identity: null,
          interaction_kind: "legacy_combat",
          comparison_semantics: {
            template: "compare_ability_cooldown",
            champion_a_display: "Ahri",
            champion_b_display: "Syndra",
            metric: "ability_cooldown",
          },
        }),
      ),
    ).toThrow(MasteryContractParseError);
  });

  it("rejects atomic_recall that carries comparison_semantics (fail closed)", () => {
    expect(() =>
      readPlayerQuestion(
        baseQuestionPayload({
          state: null,
          matchup_identity: null,
          interaction_kind: "atomic_recall",
          prompt_semantics: { template: "champion_base_stat", champion_display: "Ahri", metric: "armor" },
          comparison_semantics: {
            template: "compare_ability_cooldown",
            champion_a_display: "Ahri",
            champion_b_display: "Syndra",
            metric: "ability_cooldown",
          },
        }),
      ),
    ).toThrow(MasteryContractParseError);
  });
});

describe("MasteryPlayerReveal beforeState/afterState nullable", () => {
  function baseRevealPayload(overrides: Record<string, unknown> = {}) {
    return {
      session_id: "msess_x",
      mastery_set_id: "mset_x",
      artifact_digest: "martifact_x",
      display_revision: "disprev_x",
      sequence_index: 0,
      question_family: "ability_cooldown_recall",
      player_answer: 8.4,
      authoritative_correctness: true,
      correct_answer: 8.4,
      explanation: "Ahri E rank 3 cooldown is 8.4 seconds.",
      calculation_steps: [],
      before_state: null,
      after_state: null,
      applied_transition: null,
      proposed_transition: null,
      source_summary: { label: "DDragon", source_count: 1 },
      next_step_ready: true,
      completion_state: { is_final_step: true, set_completed: true },
      ...overrides,
    };
  }

  it("parses beforeState/afterState = null without crashing", () => {
    const reveal = readPlayerReveal(baseRevealPayload());
    expect(reveal.beforeState).toBeNull();
    expect(reveal.afterState).toBeNull();
    expect(reveal.authoritativeCorrectness).toBe(true);
  });
});
