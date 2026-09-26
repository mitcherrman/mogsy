/**
 * JX2 — THE JOURNEY FORMULA REFERENCE: a whitelist, not a mechanics engine.
 *
 * Only the mechanics a Journey can currently ask about are listed, pinned to
 * the backend that produces them (League_Combat_Simulator):
 *
 *   ability cooldown   `ability_cooldown` / `ability_cooldown_compare`
 *                      children — `mastery/calculations/cooldown.py`
 *                      (base × 100 / (100 + ability_haste)).
 *   physical damage    `combat_ability_damage` children, contract
 *                      `combat_working.v1` — PHYSICAL only. Its working
 *                      states armor, lethality, % armor pen and flat armor
 *                      pen; `penetration.py` applies % pen, then flat pen
 *                      (lethality 1:1, not level-scaled since V14.1), to
 *                      positive armor only; `damage_mitigation.py` then
 *                      multiplies by 100 / (100 + armor).
 *
 * NOT listed, on purpose: magic resistance / magic penetration (no Journey
 * child deals magic damage), negative-armor mitigation (Journey target armor
 * is level armor, always positive), shields, bonus-armor pen.
 *
 * Formula text comes from `lol-glossary/registry.ts` where the glossary is
 * exact (armor, ability haste). The glossary has no physical-penetration
 * entry, so that one line is stated here. The frontend computes nothing
 * with these strings: they are display text.
 */
import { getGlossaryTerm } from "@/lib/lol-glossary/registry";

export interface JourneyFormula {
  id: string;
  title: string;
  /** Display lines, in the order they are applied. */
  lines: string[];
  example?: string;
  note?: string;
}

function glossaryFormula(id: string): string {
  const formula = getGlossaryTerm(id)?.formula;
  if (!formula) throw new Error(`glossary term ${id} has no formula`);
  return formula;
}

/** Display order: the order a Journey introduces them. */
export const JOURNEY_FORMULAS: readonly JourneyFormula[] = [
  {
    id: "ability-cooldown",
    title: "Ability haste → cooldown",
    lines: [glossaryFormula("actual-cooldown")],
    example: getGlossaryTerm("actual-cooldown")?.example,
  },
  {
    id: "armor-penetration",
    title: "Armor penetration & lethality",
    lines: [
      "armor_after_percent = armor × (1 − armor_pen_percent)",
      "effective_armor = max(0, armor_after_percent − (lethality + flat_armor_pen))",
    ],
    example: "Armor 80, 30% armor pen, 10 lethality: 80 × 0.70 = 56; 56 − 10 = 46 effective armor.",
    note: "Percent penetration first, then flat. Lethality is flat armor pen 1:1 at every level. Penetration never takes armor below 0.",
  },
  {
    id: "physical-mitigation",
    title: "Armor → physical damage",
    lines: [
      glossaryFormula("armor"),
      "post_mitigation_damage = raw_damage × physical_multiplier",
    ],
    example: "Raw damage 200, effective armor 46: 200 × 100 / 146 ≈ 136.99.",
  },
];

/** The glossary terms this reference reads, for the drift test. */
export const JOURNEY_FORMULA_GLOSSARY_IDS = ["actual-cooldown", "armor"] as const;
