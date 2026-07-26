import armorIcon from "@/assets/stat-check/stats/armor.png";
import attackDamageIcon from "@/assets/stat-check/stats/attack-damage.png";
import healthIcon from "@/assets/stat-check/stats/health.png";
import healthRegenIcon from "@/assets/stat-check/stats/health-regen.png";
import moveSpeedIcon from "@/assets/stat-check/stats/movespeed.png";
import rangeIcon from "@/assets/stat-check/stats/range.png";
import scaleIcon from "@/assets/stat-check/stats/scale.png";

import { STAT_FAMILY_LABELS, type StatCategory, type StatFamily } from "./statCheckEngine";

/**
 * Single source of truth for how a stat family is *shown* on the board.
 *
 * The board is icon-only: no category wording is ever rendered visibly, so the
 * written label here exists purely for tooltips, aria labels, and text detail
 * surfaces. Labels are read from the engine's STAT_FAMILY_LABELS rather than
 * restated, so a family rename cannot drift between engine and presentation.
 *
 * Keys are the engine's own `StatFamily` union (kebab-case) — presentation
 * never invents its own category vocabulary.
 */
export type StatFamilyPresentation = {
  /** Board art for the family, or null when the family has no art (see below). */
  icon: string | null;
  label: string;
};

/**
 * Art for the families the generator can actually place on a board.
 *
 * `magic-resist` and `attack-speed` are deliberately absent: both are retired
 * in statCheckEngine (`active: false`, never generated), so no board can ever
 * request their art. They stay in `StatFamily` for save/replay compatibility,
 * and resolve to a null icon rather than borrowing a misleading stat symbol.
 */
const STAT_FAMILY_ICONS: Partial<Record<StatFamily, string>> = {
  health: healthIcon,
  "attack-damage": attackDamageIcon,
  armor: armorIcon,
  "move-speed": moveSpeedIcon,
  "attack-range": rangeIcon,
};

/**
 * Art held for stat families that do not exist in the engine yet.
 *
 * Health Regeneration is not a `StatFamily` and is NOT in the active category
 * pool; keeping the mapping here means adding the family later is a one-line
 * move into STAT_FAMILY_ICONS rather than a hunt for the asset.
 */
export const RESERVED_STAT_PRESENTATION = {
  "health-regen": { icon: healthRegenIcon, label: "Health Regeneration" },
} as const;

export function statFamilyPresentation(family: StatFamily): StatFamilyPresentation {
  return { icon: STAT_FAMILY_ICONS[family] ?? null, label: STAT_FAMILY_LABELS[family] };
}

/** Board art for a category's family, or null for a retired family. */
export function categoryIcon(category: Pick<StatCategory, "family">): string | null {
  return STAT_FAMILY_ICONS[category.family] ?? null;
}

/**
 * The level a plaque shows as a bare number, or null when the contest is
 * unscaled (move speed, attack range) and the plaque shows no level at all.
 * Reads `category.level` directly — never parses the category id.
 */
export function categoryLevelBadge(category: Pick<StatCategory, "level">): string | null {
  return category.level === null ? null : String(category.level);
}

/**
 * Complete written category for tooltips and aria text, e.g.
 * "Lowest Level 18 Armor", "Highest Level 1 Health", "Highest Attack Range".
 * This wording is never rendered visibly on the board.
 */
export function categoryTooltipLabel(category: Pick<StatCategory, "direction" | "level" | "family">): string {
  const direction = category.direction === "higher" ? "Highest" : "Lowest";
  const level = category.level === null ? "" : `Level ${category.level} `;
  return `${direction} ${level}${STAT_FAMILY_LABELS[category.family]}`;
}

/** Engine thresholds are fractions (0.075); the board shows them as "7.5%". */
export function formatThreshold(threshold: number): string {
  const percent = threshold * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

/** Spoken form for aria text, where "%" reads poorly. */
export function spokenThreshold(threshold: number): string {
  const percent = threshold * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)} percent`;
}

/**
 * The decisive (extra-damage) margin is shown as a scale icon plus a bare
 * percentage — the word "Decisive" never appears on the board.
 */
export const DECISIVE_MARGIN_PRESENTATION = {
  icon: scaleIcon,
  label: "Extra-damage threshold",
  getTooltip: (threshold: number): string =>
    `If there is a ${formatThreshold(threshold)} gap in stats, deal 1 extra damage.`,
} as const;

/** Next-round hint: reveals the upcoming family only — never direction or level. */
export function nextRoundHintTooltip(family: StatFamily): string {
  return `Next-round hint: ${STAT_FAMILY_LABELS[family]}`;
}
