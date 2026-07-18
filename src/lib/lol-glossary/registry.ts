/**
 * League Glossary — canonical dictionary of precise terms used across
 * Mogzy questions, explanations, League Docs, Combat Lab, Ranked, and
 * future Mastery Sets. Single source of truth; do not duplicate
 * definitions elsewhere.
 *
 * Definitions are mechanical and measurable. No coaching opinions
 * ("safer", "punish window", "threat"). State exactly what is and is
 * not included in a calculation, and mark patchSensitive terms whose
 * numbers can change patch-to-patch.
 */

export type GlossaryCategory =
  | "damage"
  | "health"
  | "defense"
  | "penetration"
  | "cooldowns"
  | "items";

export interface GlossaryTerm {
  /** Stable slug used as the URL fragment. Lowercase-kebab. Must match a
   *  human-readable, memorable form of the term. */
  id: string;
  term: string;
  shortDefinition: string;
  fullDefinition: string;
  category: GlossaryCategory;
  aliases: string[];
  formula?: string;
  example?: string;
  relatedTermIds: string[];
  /** True if the concept's numeric behavior can change between patches
   *  (formulas, coefficients, item stats). Definitions are still
   *  written to be patch-agnostic where possible. */
  patchSensitive: boolean;
  sourceNote?: string;
  /** Display order within its category. Lower comes first. */
  order: number;
}

export const GLOSSARY_CATEGORIES: { id: GlossaryCategory; label: string }[] = [
  { id: "damage", label: "Damage" },
  { id: "health", label: "Health" },
  { id: "defense", label: "Defense" },
  { id: "penetration", label: "Penetration" },
  { id: "cooldowns", label: "Cooldowns" },
  { id: "items", label: "Items" },
];

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "raw-damage",
    term: "Raw damage",
    category: "damage",
    order: 10,
    shortDefinition:
      "The damage value produced by an ability or attack before any resistance, penetration, reduction, or shield is applied.",
    fullDefinition:
      "Raw damage is the pre-mitigation damage number computed from the source's stats and the ability's coefficients. It does not include the effect of the target's armor, magic resistance, damage reduction, shields, or any other defensive interaction.",
    aliases: ["pre-mitigation damage", "unmitigated damage", "output damage"],
    relatedTermIds: ["post-mitigation-damage", "physical-damage", "magic-damage", "true-damage"],
    patchSensitive: false,
  },
  {
    id: "post-mitigation-damage",
    term: "Post-mitigation damage",
    category: "damage",
    order: 20,
    shortDefinition:
      "The damage remaining after every armor, magic resistance, penetration, reduction, shield, and other included effect is applied.",
    fullDefinition:
      "The damage remaining after the stated armor, magic resistance, penetration, reductions, shields, and other included effects are applied. Only effects explicitly present in the scenario are included; any interaction not stated is not part of the number.",
    aliases: ["mitigated damage", "final damage", "effective damage"],
    relatedTermIds: ["raw-damage", "armor", "magic-resistance", "lethal-damage"],
    patchSensitive: false,
  },
  {
    id: "physical-damage",
    term: "Physical damage",
    category: "damage",
    order: 30,
    shortDefinition:
      "A damage type that is reduced by the target's armor and can be increased against the target by physical (armor) penetration.",
    fullDefinition:
      "Physical damage is one of the game's three damage types. Its post-mitigation value is reduced by the target's effective armor after any armor penetration or armor reduction from the source has been applied. It is not reduced by magic resistance.",
    aliases: ["AD damage"],
    relatedTermIds: ["armor", "post-mitigation-damage", "magic-damage", "true-damage"],
    patchSensitive: false,
  },
  {
    id: "magic-damage",
    term: "Magic damage",
    category: "damage",
    order: 40,
    shortDefinition:
      "A damage type that is reduced by the target's magic resistance and can be increased against the target by magic penetration.",
    fullDefinition:
      "Magic damage is one of the game's three damage types. Its post-mitigation value is reduced by the target's effective magic resistance after any magic penetration or magic-resist reduction from the source has been applied. It is not reduced by armor.",
    aliases: ["AP damage"],
    relatedTermIds: [
      "magic-resistance",
      "flat-magic-penetration",
      "percentage-magic-penetration",
      "post-mitigation-damage",
    ],
    patchSensitive: false,
  },
  {
    id: "true-damage",
    term: "True damage",
    category: "damage",
    order: 50,
    shortDefinition:
      "A damage type that ignores armor and magic resistance. It is still affected by shields and by damage reductions that explicitly apply to all damage types.",
    fullDefinition:
      "True damage bypasses armor and magic resistance entirely, so its post-mitigation value is equal to its raw value with respect to those two resistances. It is still reduced by shields and by any effect that reduces incoming damage of all types.",
    aliases: [],
    relatedTermIds: ["raw-damage", "post-mitigation-damage", "physical-damage", "magic-damage"],
    patchSensitive: false,
  },
  {
    id: "current-health",
    term: "Current health",
    category: "health",
    order: 10,
    shortDefinition: "The target's health value at the moment of the calculation.",
    fullDefinition:
      "The target's health at the exact moment referenced by the scenario, after all previously applied damage and healing. It does not include shields, which are tracked separately.",
    aliases: ["current HP", "HP"],
    relatedTermIds: ["maximum-health", "health-remaining", "lethal-damage"],
    patchSensitive: false,
  },
  {
    id: "maximum-health",
    term: "Maximum health",
    category: "health",
    order: 20,
    shortDefinition:
      "The target's full health pool from base stats, per-level growth, and health-granting items and effects.",
    fullDefinition:
      "The upper bound of the target's health at that moment. It is the sum of base health, per-level growth applied at the target's current level, and any health granted by items, runes, or active effects. Current health cannot exceed maximum health.",
    aliases: ["max HP", "max health"],
    relatedTermIds: ["current-health", "health-remaining"],
    patchSensitive: true,
    sourceNote:
      "Base and per-level values come from the champion base-stats dataset; item and effect contributions are patch-dependent.",
  },
  {
    id: "health-remaining",
    term: "Health remaining",
    category: "health",
    order: 30,
    shortDefinition:
      "The target's current health minus the post-mitigation damage of the stated instance.",
    fullDefinition:
      "Current health minus the post-mitigation damage of the specified damage instance. If the result is greater than zero, the target survives that instance with exactly that health value. If the result is zero or less, see Lethal damage.",
    aliases: ["remaining HP", "HP after"],
    formula: "health_remaining = current_health − post_mitigation_damage",
    example:
      "Current health 420, post-mitigation damage 380: health_remaining = 420 − 380 = 40.",
    relatedTermIds: ["current-health", "post-mitigation-damage", "lethal-damage"],
    patchSensitive: false,
  },
  {
    id: "lethal-damage",
    term: "Lethal damage",
    category: "health",
    order: 40,
    shortDefinition:
      "Damage equal to or greater than the target's current health after every included defensive effect is applied.",
    fullDefinition:
      "Damage equal to or greater than the target's current health after every shield, resistance, reduction, and other effect explicitly included in the scenario is applied. Only effects present in the scenario are counted; any interaction not stated is not part of the check.",
    aliases: ["lethal", "kills the target"],
    formula: "lethal ⇔ post_mitigation_damage ≥ current_health",
    example:
      "Current health 300, post-mitigation damage 300 → lethal. Current health 300, post-mitigation damage 299 → not lethal.",
    relatedTermIds: ["current-health", "post-mitigation-damage", "health-remaining"],
    patchSensitive: false,
  },
  {
    id: "armor",
    term: "Armor",
    category: "defense",
    order: 10,
    shortDefinition:
      "The stat that reduces incoming physical damage. Effective armor is used after physical penetration is applied.",
    fullDefinition:
      "Armor reduces incoming physical damage. In a damage calculation, physical (armor) penetration and armor reduction from the source are applied first to produce effective armor, and effective armor is what reduces the raw damage into post-mitigation damage. Armor does not affect magic or true damage.",
    aliases: ["AR"],
    formula:
      "physical_multiplier = 100 / (100 + effective_armor) when effective_armor ≥ 0",
    relatedTermIds: ["physical-damage", "post-mitigation-damage"],
    patchSensitive: false,
  },
  {
    id: "magic-resistance",
    term: "Magic resistance",
    category: "defense",
    order: 20,
    shortDefinition:
      "The stat that reduces incoming magic damage. Effective magic resistance is used after magic penetration is applied.",
    fullDefinition:
      "Magic resistance reduces incoming magic damage. In a damage calculation, magic penetration and magic-resist reduction from the source are applied first to produce effective magic resistance, and that value is what reduces the raw damage into post-mitigation damage. Magic resistance does not affect physical or true damage.",
    aliases: ["MR", "magic resist"],
    formula:
      "magic_multiplier = 100 / (100 + effective_magic_resistance) when effective_magic_resistance ≥ 0",
    relatedTermIds: [
      "magic-damage",
      "flat-magic-penetration",
      "percentage-magic-penetration",
      "post-mitigation-damage",
    ],
    patchSensitive: false,
  },
  {
    id: "flat-magic-penetration",
    term: "Flat magic penetration",
    category: "penetration",
    order: 10,
    shortDefinition:
      "A fixed value subtracted from the target's magic resistance after percentage magic penetration is applied.",
    fullDefinition:
      "Flat magic penetration subtracts a fixed value from the target's magic resistance during a magic damage calculation. It is applied after percentage magic penetration in the standard order. Effective magic resistance cannot be reduced below zero by penetration alone.",
    aliases: ["flat MPen", "flat magic pen"],
    formula:
      "effective_MR = max(0, MR_after_percent_pen − flat_magic_penetration)",
    example:
      "Target MR 50, percentage magic penetration 0%, flat magic penetration 10: effective_MR = max(0, 50 − 10) = 40.",
    relatedTermIds: [
      "magic-resistance",
      "percentage-magic-penetration",
      "magic-damage",
    ],
    patchSensitive: true,
  },
  {
    id: "percentage-magic-penetration",
    term: "Percentage magic penetration",
    category: "penetration",
    order: 20,
    shortDefinition:
      "A percentage removed from the target's magic resistance before flat magic penetration is applied.",
    fullDefinition:
      "Percentage magic penetration multiplies the target's magic resistance by (1 − percent) before flat magic penetration is subtracted. Multiple sources of percentage magic penetration combine multiplicatively unless a specific effect states otherwise.",
    aliases: ["percent MPen", "%MPen", "percent magic pen"],
    formula:
      "MR_after_percent_pen = MR × (1 − percentage_magic_penetration)",
    example:
      "Target MR 50, percentage magic penetration 40%, flat magic penetration 0: MR_after_percent_pen = 50 × (1 − 0.40) = 30.",
    relatedTermIds: [
      "magic-resistance",
      "flat-magic-penetration",
      "magic-damage",
    ],
    patchSensitive: true,
  },
  {
    id: "base-cooldown",
    term: "Base cooldown",
    category: "cooldowns",
    order: 10,
    shortDefinition:
      "The cooldown value of an ability at a given rank before ability haste and other cooldown-modifying effects are applied.",
    fullDefinition:
      "The cooldown listed for an ability at a specific rank, before ability haste, cooldown reduction, or any other cooldown-modifying effect is applied. Base cooldown is what appears in champion data before modifiers.",
    aliases: ["base CD", "listed cooldown"],
    relatedTermIds: ["actual-cooldown", "ability-haste"],
    patchSensitive: true,
    sourceNote: "Values come from champion ability data and can change between patches.",
  },
  {
    id: "actual-cooldown",
    term: "Actual cooldown",
    category: "cooldowns",
    order: 20,
    shortDefinition:
      "The cooldown produced after applying ability haste and any other cooldown-modifying effects to the base cooldown.",
    fullDefinition:
      "The cooldown that the ability actually uses after ability haste and any other cooldown-modifying effects are applied to the base cooldown. It is the value the in-game cooldown timer counts down from.",
    aliases: ["effective cooldown", "in-game cooldown"],
    formula: "actual_cooldown = base_cooldown × 100 / (100 + ability_haste)",
    example:
      "Base cooldown 10 seconds, ability haste 25: actual_cooldown = 10 × 100 / 125 = 8 seconds.",
    relatedTermIds: ["base-cooldown", "ability-haste"],
    patchSensitive: false,
  },
  {
    id: "ability-haste",
    term: "Ability haste",
    category: "cooldowns",
    order: 30,
    shortDefinition:
      "A stat that scales linearly with cooldown reductions. Each point reduces an ability's actual cooldown relative to its base cooldown by a diminishing percentage.",
    fullDefinition:
      "Ability haste is a stat that reduces the actual cooldown of abilities. It sums additively from all sources on the same unit, and the resulting actual cooldown is base_cooldown × 100 / (100 + ability_haste). Because the relationship is linear in the denominator, each successive point of ability haste reduces cooldown by less than the previous point.",
    aliases: ["AH", "haste"],
    formula: "cooldown_multiplier = 100 / (100 + ability_haste)",
    example:
      "Base cooldown 12 s, ability haste 50: actual_cooldown = 12 × 100 / 150 = 8 s.",
    relatedTermIds: ["base-cooldown", "actual-cooldown"],
    patchSensitive: false,
  },
  {
    id: "item-component",
    term: "Item component",
    category: "items",
    order: 10,
    shortDefinition:
      "An item that is part of the build path of one or more completed items and provides stats on its own.",
    fullDefinition:
      "An item that appears in the build path of at least one completed item. Components provide their listed stats while owned and contribute their gold cost toward the combine cost of the completed item.",
    aliases: ["component item"],
    relatedTermIds: ["completed-item"],
    patchSensitive: true,
    sourceNote:
      "Which items are components and what stats they provide are patch-dependent.",
  },
  {
    id: "completed-item",
    term: "Completed item",
    category: "items",
    order: 20,
    shortDefinition:
      "An item that has no further upgrade in its build path and provides the full stat line and any listed passives or actives.",
    fullDefinition:
      "An item at the top of its build path. A completed item provides its full listed stat line and any passives or actives shown on it. Whether an item is considered completed is defined by the item data for that patch.",
    aliases: ["finished item", "final item"],
    relatedTermIds: ["item-component"],
    patchSensitive: true,
    sourceNote:
      "Item tiers and stat lines are patch-dependent.",
  },
];

/** Lookup helper — returns undefined if the id is unknown. */
export function getGlossaryTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.id === id);
}

/** Search across term, aliases, short/full definition. Case-insensitive. */
export function searchGlossary(query: string, terms: GlossaryTerm[] = GLOSSARY_TERMS): GlossaryTerm[] {
  const q = query.trim().toLowerCase();
  if (!q) return terms;
  return terms.filter((t) => {
    if (t.term.toLowerCase().includes(q)) return true;
    if (t.aliases.some((a) => a.toLowerCase().includes(q))) return true;
    if (t.shortDefinition.toLowerCase().includes(q)) return true;
    if (t.fullDefinition.toLowerCase().includes(q)) return true;
    return false;
  });
}

/** Sort by category order (as declared in GLOSSARY_CATEGORIES), then by
 *  the per-term `order` field, then alphabetically. */
export function sortGlossary(terms: GlossaryTerm[]): GlossaryTerm[] {
  const catIndex = new Map(GLOSSARY_CATEGORIES.map((c, i) => [c.id, i] as const));
  return terms.slice().sort((a, b) => {
    const ca = catIndex.get(a.category) ?? 999;
    const cb = catIndex.get(b.category) ?? 999;
    if (ca !== cb) return ca - cb;
    if (a.order !== b.order) return a.order - b.order;
    return a.term.localeCompare(b.term);
  });
}