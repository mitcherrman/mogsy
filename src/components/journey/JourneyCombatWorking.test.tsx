/**
 * JOURNEY5 — the structured Combat working, rendered: a compact progression of
 * the SERVER's numbers, printed verbatim, with no arithmetic of its own.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readCombatWorking, type CombatWorking } from "@/lib/journey/combatWorking";
import {
  PANTHEON_E_WORKING_RECALLED, ZED_E_WORKING_LETHALITY,
} from "@/lib/journey/__fixtures__/j5/finalWindow";
import { JourneyCombatWorking } from "./JourneyCombatWorking";
import { combatQuestionSentence, type CombatPremise } from "./JourneyCombatQuestion";

const read = (raw: unknown): CombatWorking => readCombatWorking(structuredClone(raw))!;

/**
 * Every number the server served in the block, as the strings it would print,
 * plus the two presentational conversions the component is allowed: a ratio
 * coefficient as a percentage, and a 0-based teaching child as "step N".
 */
function allowedNumbers(w: CombatWorking): Set<string> {
  const n = new Set<string>();
  const add = (x: number | string) => n.add(String(x));
  add(w.ability.rank); add(w.formula.flat); add(w.rawDamage); add(w.targetArmor.value);
  add(w.penetration.lethality); add(w.penetration.armorPenPercent); add(w.penetration.armorPenFlat);
  add(w.effectiveArmor); add(w.mitigationMultiplier); add(w.finalDamage); add(w.answer);
  for (const r of w.formula.ratios) { add(r.value); add(r.ratio * 100); }
  if (w.targetArmor.establishedInChild !== null) add(w.targetArmor.establishedInChild + 1);
  return n;
}
const numbersIn = (text: string) => text.match(/\d+(?:\.\d+)?/g) ?? [];

describe("JourneyCombatWorking", () => {
  it("renders the progression with the exact served digits (recalled armor)", () => {
    render(<JourneyCombatWorking working={read(PANTHEON_E_WORKING_RECALLED)} />);
    const w = screen.getByTestId("journey-combat-working");
    expect(w.textContent).toBe(
      "Formula (E rank 1): 55 + 100% attack damage (68.8675) + 150% bonus attack damage (0)"
      + "→ Raw 123.8675→ Leona armor 50.08 (recalled from step 1)→ No penetration"
      + "→ Effective armor 50.08→ × 0.6663→ 82.5343→ Answer 83");
    expect(within(w).getByTestId("journey-combat-working-armor-source")).toHaveTextContent("recalled from step 1");
  });

  it("penetration: only the non-zero rows (Zed E, lethality 10)", () => {
    render(<JourneyCombatWorking working={read(ZED_E_WORKING_LETHALITY)} />);
    const w = screen.getByTestId("journey-combat-working");
    expect(w.querySelector("[data-step='penetration']")).toHaveTextContent(/^→ Lethality 10$/);
    expect(w).toHaveTextContent("Formula (E rank 1): 70 + 70% bonus attack damage (20)");
    expect(w).toHaveTextContent("Ahri armor 27.195");
    expect(within(w).queryByTestId("journey-combat-working-armor-source")).toBeNull();
    expect(within(w).getByTestId("journey-combat-working-effective")).toHaveTextContent("17.195");
    expect(within(w).getByTestId("journey-combat-working-final")).toHaveTextContent("71.6754");
    expect(within(w).getByTestId("journey-combat-working-answer")).toHaveTextContent("72");
  });

  it("performs no arithmetic: every number on screen is one the server served", () => {
    for (const raw of [PANTHEON_E_WORKING_RECALLED, ZED_E_WORKING_LETHALITY]) {
      const working = read(raw);
      const { unmount } = render(<JourneyCombatWorking working={working} />);
      const shown = numbersIn(screen.getByTestId("journey-combat-working").textContent ?? "");
      const allowed = allowedNumbers(working);
      expect(shown.filter((x) => !allowed.has(x))).toEqual([]);
      // e.g. never 55 + 68.8675 or 50.08 − 10 computed locally.
      unmount();
    }
  });
});

describe("combatQuestionSentence — ability_component", () => {
  const premise = (pairs: CombatPremise["pairs"]): CombatPremise => ({
    champion: "Pantheon", ability: "Aegis Assault", slot: "E", rank: 1,
    metric: "ability_physical_damage_after_armor", pairs,
  });
  it("states the served component verbatim beside the slot and rank", () => {
    expect(combatQuestionSentence(premise([["target", "Leona"], ["ability_component", "unempowered cast (no Mortal Will)"]])))
      .toBe("How much physical damage, after armor, does Pantheon's Aegis Assault (E, rank 1, unempowered cast (no Mortal Will)) deal to Leona?");
  });
  it("without one, the sentence is unchanged", () => {
    expect(combatQuestionSentence(premise([["target", "Leona"]])))
      .toBe("How much physical damage, after armor, does Pantheon's Aegis Assault (E, rank 1) deal to Leona?");
  });
});
