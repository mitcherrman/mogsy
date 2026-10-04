/**
 * V1 property registry and the controlled Base Stats label table.
 *
 * Two different jobs, kept apart on purpose:
 *
 * 1. `V1_PROPERTIES` is the *calculation* gate. Only `mogzy_property` values in
 *    this table can ever produce an Impact fact. Wording never adds to it.
 * 2. `classifyBaseStatLine` is the *continuity* classifier. It answers one
 *    question about a Base Stats line elsewhere in the entity's history — "which
 *    stat family could this have touched?" — so Impact can tell an unrelated
 *    change (Brand's mana regeneration) from one that could have moved the
 *    companion it is about to hold constant. It can only ever REMOVE a block, and
 *    only through an exact, closed lookup mirroring the backend's own
 *    `_BASE_STAT_LABELS`; a label it does not know is "unclassified" and blocks.
 *    It never feeds a number into a calculation.
 */
import type { ImpactFamily, ImpactHalf } from "./types";

/* -------------------------------------------------------------------------- */
/* V1 calculation gate                                                        */
/* -------------------------------------------------------------------------- */

export type V1PropertySpec = {
  family: ImpactFamily;
  half: ImpactHalf;
  /** `champion_stats` column, exactly (mirrors backend `_CHAMPION_BASE_STATS`). */
  column: string;
  unit: "flat" | "percent_points";
};

export const V1_PROPERTIES = {
  base_health: { family: "health", half: "base", column: "hp", unit: "flat" },
  health_growth: { family: "health", half: "growth", column: "hp_per_level", unit: "flat" },
  base_ad: { family: "ad", half: "base", column: "ad", unit: "flat" },
  ad_growth: { family: "ad", half: "growth", column: "ad_per_level", unit: "flat" },
  base_armor: { family: "armor", half: "base", column: "armor", unit: "flat" },
  armor_growth: { family: "armor", half: "growth", column: "armor_per_level", unit: "flat" },
  base_mr: { family: "mr", half: "base", column: "magic_resist", unit: "flat" },
  mr_growth: { family: "mr", half: "growth", column: "magic_resist_per_level", unit: "flat" },
  // Mana is supported only as the champion's mana pool (`mp`) and its per-level
  // growth. Regeneration is a different family (see CONTINUITY_PROPERTY_FAMILY).
  base_mana: { family: "mana", half: "base", column: "mp", unit: "flat" },
  mana_growth: { family: "mana", half: "growth", column: "mp_per_level", unit: "flat" },
  // Parameter facts only: the attack-speed ratio is not in the public canonical
  // payload, so no projected AS is computed in V1.
  base_attack_speed: { family: "attack_speed", half: "base", column: "attack_speed", unit: "flat" },
  attack_speed_growth: {
    family: "attack_speed",
    half: "growth",
    column: "attack_speed_per_level",
    unit: "percent_points",
  },
} as const satisfies Record<string, V1PropertySpec>;

export type V1Property = keyof typeof V1_PROPERTIES;

export function isV1Property(property: string | null | undefined): property is V1Property {
  return typeof property === "string" && Object.prototype.hasOwnProperty.call(V1_PROPERTIES, property);
}

/** Families whose level math is flat `base + growth × g(level)`. */
export const PROJECTABLE_FAMILIES = ["health", "ad", "armor", "mr", "mana"] as const;
export type ProjectableFamily = (typeof PROJECTABLE_FAMILIES)[number];

export function isProjectableFamily(family: ImpactFamily): family is ProjectableFamily {
  return (PROJECTABLE_FAMILIES as readonly string[]).includes(family);
}

/** The property holding the other half of a projectable family. */
export function companionOf(property: V1Property): V1Property | null {
  const spec = V1_PROPERTIES[property];
  if (!isProjectableFamily(spec.family)) return null;
  const otherHalf: ImpactHalf = spec.half === "base" ? "growth" : "base";
  return propertyOf(spec.family, otherHalf);
}

export function propertyOf(family: ImpactFamily, half: ImpactHalf): V1Property | null {
  for (const key of Object.keys(V1_PROPERTIES) as V1Property[]) {
    const spec = V1_PROPERTIES[key];
    if (spec.family === family && spec.half === half) return key;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Continuity classifier                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every family a champion base-stat property can belong to — the backend's
 * `_CHAMPION_BASE_STAT_FAMILIES`, which is wider than V1. A line in a family
 * outside V1 still has a *known* family, which is what lets it be ruled out as
 * the cause of a change in a different one.
 */
export type ContinuityFamily =
  | "health"
  | "mana"
  | "ad"
  | "armor"
  | "mr"
  | "health_regen"
  | "mana_regen"
  | "attack_speed"
  | "attack_speed_ratio"
  | "move_speed"
  | "attack_range";

/** All 19 registered numeric `champion_stats` properties → their family. */
export const CONTINUITY_PROPERTY_FAMILY: Readonly<Record<string, ContinuityFamily>> = {
  base_health: "health",
  health_growth: "health",
  base_ad: "ad",
  ad_growth: "ad",
  base_armor: "armor",
  armor_growth: "armor",
  base_mr: "mr",
  mr_growth: "mr",
  base_mana: "mana",
  mana_growth: "mana",
  base_health_regen: "health_regen",
  health_regen_growth: "health_regen",
  base_mana_regen: "mana_regen",
  mana_regen_growth: "mana_regen",
  base_attack_speed: "attack_speed",
  attack_speed_growth: "attack_speed",
  attack_speed_ratio: "attack_speed_ratio",
  base_move_speed: "move_speed",
  base_attack_range: "attack_range",
};

/**
 * Riot's Base Stats labels → family. A mirror of the backend's
 * `_BASE_STAT_LABELS` (master `1b62f1a3`), collapsed to the family each label
 * belongs to. Exact keys only, after the backend's own normalisation
 * (`strip().rstrip(":").lower()`): no stemming, no containment, no fuzzy match.
 */
const BASE_STAT_LABEL_FAMILY: Readonly<Record<string, ContinuityFamily>> = {
  "base health": "health",
  health: "health",
  "health growth": "health",
  "health per level": "health",
  "base attack damage": "ad",
  "base ad": "ad",
  "attack damage": "ad",
  "attack damage growth": "ad",
  "attack damage per level": "ad",
  "ad growth": "ad",
  "ad per level": "ad",
  "base armor": "armor",
  armor: "armor",
  "armor growth": "armor",
  "armor per level": "armor",
  "base magic resist": "mr",
  "base magic resistance": "mr",
  "magic resist": "mr",
  "magic resistance": "mr",
  "magic resist growth": "mr",
  "magic resistance growth": "mr",
  "magic resist per level": "mr",
  "mr growth": "mr",
  "base move speed": "move_speed",
  "move speed": "move_speed",
  "movement speed": "move_speed",
  "base mana": "mana",
  mana: "mana",
  "mana growth": "mana",
  "mana per level": "mana",
  "base attack speed": "attack_speed",
  "attack speed": "attack_speed",
  "attack speed ratio": "attack_speed_ratio",
  "base attack speed ratio": "attack_speed_ratio",
  "attack speed growth": "attack_speed",
  "attack speed per level": "attack_speed",
  "attack range": "attack_range",
  "base attack range": "attack_range",
  "health regen": "health_regen",
  "health regeneration": "health_regen",
  "base health regen": "health_regen",
  "base health regeneration": "health_regen",
  "health regen growth": "health_regen",
  "health regeneration growth": "health_regen",
  "health regen per level": "health_regen",
  "health regeneration per level": "health_regen",
  "mana regen": "mana_regen",
  "mana regeneration": "mana_regen",
  "base mana regen": "mana_regen",
  "base mana regeneration": "mana_regen",
  "mana regen growth": "mana_regen",
  "mana regeneration growth": "mana_regen",
  "mana regen per level": "mana_regen",
  "mana regeneration per level": "mana_regen",
};

/**
 * Labels the backend documents as having NO `champion_stats` column
 * (`resolver.py`: "Monster Damage", "Basic Attack Damage Modifier",
 * "Attack Cast Time", "Model Size"). A change to one cannot move any canonical
 * stat, so it cannot disturb a companion held from canonical.
 */
const NO_CANONICAL_COLUMN_LABELS: ReadonlySet<string> = new Set([
  "monster damage",
  "basic attack damage modifier",
  "attack cast time",
  "model size",
]);

export type BaseStatLineClass =
  /** A stat in `family` may have changed: that family's continuity is uncertain. */
  | { kind: "family"; family: ContinuityFamily }
  /** Provably touches no `champion_stats` column. */
  | { kind: "no_canonical_column" }
  /** The grammar cannot say what this touched: blocks every canonical companion. */
  | { kind: "unclassified" };

function normalizeLabel(label: string): string {
  return label.trim().replace(/:+\s*$/, "").toLowerCase();
}

/**
 * Classify one Base Stats line by its authoritative `mogzy_property` when there
 * is one, otherwise by an exact label lookup. Anything else is unclassified.
 */
export function classifyBaseStatLine(
  mogzyProperty: string | null | undefined,
  propertyName: string | null | undefined,
): BaseStatLineClass {
  if (typeof mogzyProperty === "string" && mogzyProperty !== "") {
    const family = Object.prototype.hasOwnProperty.call(CONTINUITY_PROPERTY_FAMILY, mogzyProperty)
      ? CONTINUITY_PROPERTY_FAMILY[mogzyProperty]
      : undefined;
    // A property this table does not know cannot be assumed unrelated.
    return family ? { kind: "family", family } : { kind: "unclassified" };
  }
  const key = normalizeLabel(propertyName ?? "");
  if (key === "") return { kind: "unclassified" };
  if (Object.prototype.hasOwnProperty.call(BASE_STAT_LABEL_FAMILY, key)) {
    return { kind: "family", family: BASE_STAT_LABEL_FAMILY[key] };
  }
  if (NO_CANONICAL_COLUMN_LABELS.has(key)) return { kind: "no_canonical_column" };
  return { kind: "unclassified" };
}
