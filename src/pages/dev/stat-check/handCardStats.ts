import { itemBonusFor, type ItemId } from "./items";
import type { StatCategory, StatCheckCard, StatFamily } from "./statCheckEngine";

/**
 * Hand-card stat presentation.
 *
 * A card in hand answers the board it is being played into: it shows exactly
 * the three current lane categories, in lane order, and nothing else. The
 * numbers come from the same authoritative path the lane comparison uses
 * (`category.getValue` + `itemBonusFor`, formatted by `category.formatValue`),
 * so a hand value can never disagree with the value the lane later contests.
 */

/** Compact card-language code per stat family; matches the card's existing HP/AD/AR/RNG shorthand. */
const FAMILY_CODES: Record<StatFamily, string> = {
  health: "HP",
  "attack-damage": "AD",
  armor: "AR",
  "magic-resist": "MR",
  "move-speed": "MS",
  "attack-range": "RNG",
  "attack-speed": "AS",
};

export type CardCategoryValue = {
  /** 0 = left lane, 1 = middle, 2 = right. Rows are never deduplicated by family. */
  laneIndex: number;
  category: StatCategory;
  /** Compact row label, e.g. `HP1`, `HP18`, `MS`. */
  label: string;
  /** Formatted through the category's own formatter. */
  value: string;
  family: StatFamily;
};

/**
 * Compact label carrying stat family plus level context. Level-scaled
 * categories keep an explicit level suffix so Level 1 and Level 18 rows of the
 * same family stay distinguishable; level-independent stats carry no suffix.
 */
export function compactCategoryLabel(category: StatCategory): string {
  const code = FAMILY_CODES[category.family];
  return category.level === null ? code : `${code}${category.level}`;
}

/**
 * One displayed row. `itemId` is the item actually applying to this contest
 * (lanes only — hand cards carry no item, since equipping requires a placed
 * champion), and is added exactly as `compareCategory` adds it.
 */
export function cardCategoryValue(
  card: StatCheckCard,
  category: StatCategory,
  laneIndex: number,
  itemId: ItemId | null = null,
): CardCategoryValue {
  const value = category.getValue(card) + itemBonusFor(itemId, category.family);
  return {
    laneIndex,
    category,
    label: compactCategoryLabel(category),
    value: category.formatValue(value),
    family: category.family,
  };
}

/**
 * The three rows a hand card shows for the current round, in left → middle →
 * right lane order. Duplicate stat families stay as separate lane rows.
 */
export function handCardCategoryValues(
  card: StatCheckCard,
  categories: StatCategory[],
  itemId: ItemId | null = null,
): CardCategoryValue[] {
  return categories.map((category, index) => cardCategoryValue(card, category, index, itemId));
}

/** Full-sentence context for assistive tech, where the compact label is not enough. */
export function categoryValueAccessibleText(row: CardCategoryValue): string {
  const label = row.category.label;
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${row.value}`;
}
