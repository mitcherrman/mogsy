/**
 * CSP1 — which picture draws a roster-wide STAT comparison premise.
 *
 * The backend names the stat by its public METRIC (`base_armor`,
 * `movement_speed`, …) and nothing else: no champion, no value. This table
 * maps that name onto the Journey's owner-locked stat mnemonics
 * (`lib/journey/statIcons.ts` — Armor is Cloth Armor, Health is Ruby
 * Crystal), so the premise reuses art the player already reads as the stat.
 *
 * A metric with no owner-mapped mnemonic uses the existing neutral stat art
 * (`assets/champion-card-duel/stats`): Attack Range is `range.png`. A failed
 * image load falls back to that set's neutral `scale.png`. No new art.
 */
import { itemIconUrl } from "@/components/pro-play/media/ItemIcon";
import rangeArt from "@/assets/champion-card-duel/stats/range.png";
import scaleArt from "@/assets/champion-card-duel/stats/scale.png";
import { STAT_MNEMONICS, type MnemonicStat, type StatMnemonic } from "@/lib/journey/statIcons";

const METRIC_MNEMONIC: Readonly<Record<string, MnemonicStat>> = {
  base_health: "health",
  base_attack_damage: "attack_damage",
  base_armor: "armor",
  base_magic_resist: "magic_resist",
  base_mana: "mana",
  base_move_speed: "move_speed",
  movement_speed: "move_speed",
  base_attack_speed: "attack_speed",
};

export function statMnemonicForMetric(metric: string | null | undefined): StatMnemonic | null {
  const key = metric ? METRIC_MNEMONIC[metric] : undefined;
  return key ? STAT_MNEMONICS[key] : null;
}

/** Existing neutral stat art for metrics with no owner-mapped mnemonic. */
const METRIC_STAT_ART: Readonly<Record<string, string>> = {
  attack_range: rangeArt,
  base_attack_range: rangeArt,
};

/** Existing neutral comparison art, drawn only if the stat's image fails. */
export const STAT_COMPARISON_FALLBACK_ART = scaleArt;

/** The stat's art URL: owner mnemonic, else existing neutral stat art, else null. */
export function statComparisonIconUrl(metric: string | null | undefined): string | null {
  const mnemonic = statMnemonicForMetric(metric);
  if (mnemonic) return itemIconUrl(mnemonic.itemId);
  return (metric && METRIC_STAT_ART[metric]) || null;
}
