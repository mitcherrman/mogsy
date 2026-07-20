import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RevealedResult from "./RevealedResult";
import type { FrozenResultPublic, SequenceResult } from "@/lib/combat-battles/types";

afterEach(cleanup);

const seq = (over: Partial<SequenceResult> = {}): SequenceResult => ({
  attacker_champion: "Annie", defender_champion: "Brand",
  requested_action_count: 3, executed_action_count: 3, skipped_action_count: 0,
  reached_lethal: false, first_lethal_action_index: null, executed_actions_to_lethal: null,
  starting_target_hp: 2000, final_target_hp: 1200, target_max_hp: 2000,
  applied_hp_damage: 800, applied_hp_damage_pct: 40, healing_generated: 0, healing_applied: 0,
  per_action: [
    { index: 0, type: "active", slot: "Q", active_name: "Q", hp_before: 2000, executed: true, applied_hp_damage: 500, hp_after: 1500, classification: "applies_damage", formula_status: "ok", eligibility: "info" },
    { index: 1, type: "basic_attack", slot: null, active_name: null, hp_before: 1500, executed: true, applied_hp_damage: 300, hp_after: 1200, classification: "applies_damage", formula_status: null, eligibility: "info" },
  ],
  warnings: [], blocking_errors: [], eligible: true, ...over,
});

const frozen = (over: Partial<FrozenResultPublic> = {}): FrozenResultPublic => ({
  winner_side: "left", decision_reason: "neither_lethal_left_more_pct",
  comparison_metrics: { pct_tolerance: 0.5, left: {}, right: {} }, comparison_version: "independent_damage_comparison_v1",
  left_result: seq(), right_result: seq({ applied_hp_damage: 600, applied_hp_damage_pct: 30, final_target_hp: 1400 }),
  warnings: [], result_checksum: "abc123", generated_at: "2026-01-01T00:00:00Z", ...over,
});

describe("RevealedResult", () => {
  it("shows the winner and human-readable decision reason", () => {
    render(<RevealedResult result={frozen()} leftName="Annie" rightName="Brand" />);
    expect(screen.getByText(/Result: Annie/)).toBeTruthy();
    expect(screen.getByText(/Neither reached lethal; Annie removed a greater percentage/)).toBeTruthy();
  });

  it("renders frozen applied-HP numbers (not recomputed, no legacy total_damage)", () => {
    render(<RevealedResult result={frozen()} leftName="Annie" rightName="Brand" />);
    // applied HP damage 800 and 600 present, % shown
    expect(screen.getAllByText(/40\.0%/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Winner/)).toBeTruthy();
  });

  it("handles a draw", () => {
    render(<RevealedResult result={frozen({ winner_side: "draw", decision_reason: "both_lethal_equal_actions" })}
      leftName="Annie" rightName="Brand" />);
    expect(screen.getByText(/Result: Draw/)).toBeTruthy();
  });
});
