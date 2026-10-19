/** Browser-safe copy of PANTHEON_E_WORKING_RECALLED from
 * src/lib/journey/__fixtures__/j5/finalWindow.ts at baseline 19ef674e.
 * The upstream fixture module imports node:fs at top level and MUST NOT be
 * imported into a Vite browser harness. No arithmetic is performed here. */
export const PANTHEON_E_WORKING_RECALLED = {
  contract: "combat_working.v1", calculation: "physical_ability_damage", damage_type: "physical",
  attacker: { side: "player", champion: "Pantheon" }, target: { side: "opponent", champion: "Leona" },
  ability: { slot: "E", name: "Aegis Assault", rank: 1 },
  formula: { flat: 55, ratios: [
    { stat: "attack_damage", label: "attack damage", ratio: 1, value: 68.8675 },
    { stat: "bonus_attack_damage", label: "bonus attack damage", ratio: 1.5, value: 0 }] },
  attacker_stats: { attack_damage: 68.8675, bonus_attack_damage: 0 },
  raw_damage: 123.8675,
  target_armor: { value: 50.08, source: "recalled", established_in_child: 0 },
  penetration: { lethality: 0, armor_pen_percent: 0, armor_pen_flat: 0 },
  effective_armor: 50.08, mitigation_multiplier: 0.6663, final_damage: 82.5343, answer: "83",
} as const;
