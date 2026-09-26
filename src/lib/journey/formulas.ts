/**
 * JX2 — THE FORMULA REFERENCE: a general Mogzy mechanics notecard, shown on
 * the Journey board. A whitelist, not a mechanics engine.
 *
 * REFERENCE AVAILABILITY is not QUESTION SUPPORT. A formula listed here is
 * one a player may reasonably need; it does not mean a Journey asks about it.
 * Journey question generation today (League_Combat_Simulator) covers ability
 * cooldowns and PHYSICAL ability damage only (`combat_working.v1`) — magic
 * resistance is listed as reference, not because Journey asks it.
 *
 * Formula text comes from `lol-glossary/registry.ts` where the glossary is
 * exact (ability haste, armor, magic resistance). The glossary has no
 * physical-penetration entry, so that one is stated here from the backend's
 * `penetration.py` (% pen, then flat pen; lethality 1:1, no level scaling
 * since V14.1; positive armor only). Movement speed is NOT listed: the
 * glossary has no canonical entry for it yet.
 *
 * Not listed: negative-resistance mitigation, shields, bonus-armor pen,
 * magic penetration. The frontend computes nothing with these strings.
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
  {
    id: "magic-mitigation",
    title: "Magic resistance → magic damage",
    lines: [
      glossaryFormula("magic-resistance"),
      "post_mitigation_damage = raw_damage × magic_multiplier",
    ],
    example: "Raw damage 200, effective magic resistance 50: 200 × 100 / 150 ≈ 133.33.",
  },
];

/** The glossary terms this reference reads, for the drift test. */
export const JOURNEY_FORMULA_GLOSSARY_IDS = ["actual-cooldown", "armor", "magic-resistance"] as const;
