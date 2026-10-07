/**
 * CSP1 — which picture draws a roster-wide STAT comparison premise.
 *
 * The backend names the stat by its public METRIC (`base_armor`,
 * `movement_speed`, …) and nothing else: no champion, no value. This table
 * maps that name onto the Journey's owner-locked stat mnemonics
 * (`lib/journey/statIcons.ts` — Armor is Cloth Armor, Health is Ruby
 * Crystal), so the premise reuses art the player already reads as the stat.
 *
 * A metric with no owner-mapped mnemonic (Attack Range today) gets `null`,
 * and the card draws its intentional neutral comparison glyph instead of
 * inventing an icon for it.
 */
import { itemIconUrl } from "@/components/pro-play/media/ItemIcon";
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

/** The mnemonic's art URL, or null when the stat draws the neutral glyph. */
export function statComparisonIconUrl(metric: string | null | undefined): string | null {
  const mnemonic = statMnemonicForMetric(metric);
  return mnemonic ? itemIconUrl(mnemonic.itemId) : null;
}
