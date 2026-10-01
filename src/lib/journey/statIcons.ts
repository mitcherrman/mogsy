/**
 * JP4 — THE JOURNEY'S ICON VOCABULARY FOR STATS AND SHARDS.
 *
 * STAT MNEMONICS (owner lock). A stat is drawn with the basic League item that
 * players already read as that stat — Armor is Cloth Armor, AD is a Long
 * Sword. These are MNEMONICS, not inventory: the board draws them as a round
 * badge (`StatMnemonicIcon`), never in an item slot, so a mnemonic cannot be
 * read as an item the champion owns. The art is the canonical item art
 * (`MasteryAssets.itemIconUrl`, by id); nothing here is copied or hardcoded
 * as a URL.
 *
 * STAT SHARDS. The art is the owner's (`public/assets/journey/mogzy-stat-shards`);
 * the ids and names are the backend stat-mod authority's (`stat_mods` on the
 * public state). This file only says which picture draws which served id.
 */
import type { JourneyStatKey } from "./stats";

/** Every stat the owner's mnemonic map names. */
export type MnemonicStat =
  | "armor" | "health" | "attack_damage" | "ability_power" | "magic_resist" | "move_speed"
  | "attack_speed" | "crit_chance" | "mana" | "mana_regen" | "health_regen" | "ability_haste"
  | "lethality" | "magic_penetration";

export interface StatMnemonic {
  /** Canonical item id of the mnemonic's art. */
  itemId: number;
  /** The item, for a title ("Cloth Armor"), never as the stat's name. */
  itemName: string;
  /** The stat, as the player reads it. */
  stat: string;
}

/** OWNER-LOCKED: stat → the basic item that stands for it. */
export const STAT_MNEMONICS: Readonly<Record<MnemonicStat, StatMnemonic>> = {
  armor: { itemId: 1029, itemName: "Cloth Armor", stat: "Armor" },
  health: { itemId: 1028, itemName: "Ruby Crystal", stat: "Health" },
  attack_damage: { itemId: 1036, itemName: "Long Sword", stat: "Attack Damage" },
  ability_power: { itemId: 1052, itemName: "Amplifying Tome", stat: "Ability Power" },
  magic_resist: { itemId: 1033, itemName: "Null-Magic Mantle", stat: "Magic Resist" },
  move_speed: { itemId: 1001, itemName: "Boots", stat: "Move Speed" },
  attack_speed: { itemId: 1042, itemName: "Dagger", stat: "Attack Speed" },
  crit_chance: { itemId: 1018, itemName: "Cloak of Agility", stat: "Critical Strike Chance" },
  mana: { itemId: 1027, itemName: "Sapphire Crystal", stat: "Mana" },
  mana_regen: { itemId: 1004, itemName: "Faerie Charm", stat: "Mana Regen" },
  health_regen: { itemId: 1006, itemName: "Rejuvenation Bead", stat: "Health Regen" },
  ability_haste: { itemId: 2022, itemName: "Glowing Mote", stat: "Ability Haste" },
  lethality: { itemId: 2020, itemName: "The Brutalizer", stat: "Lethality" },
  magic_penetration: { itemId: 3020, itemName: "Sorcerer's Shoes", stat: "Magic Penetration" },
};

/**
 * A board stat's mnemonic. Bonus AD is AD; both magic-pen spellings are magic
 * pen. Percent armor penetration has no owner-mapped item, so it has none
 * (it is drawn by its words alone).
 */
const BOARD_STAT_MNEMONIC: Readonly<Record<JourneyStatKey, MnemonicStat | null>> = {
  health: "health",
  attack_damage: "attack_damage",
  bonus_attack_damage: "attack_damage",
  ability_power: "ability_power",
  ability_haste: "ability_haste",
  armor: "armor",
  magic_resist: "magic_resist",
  lethality: "lethality",
  armor_penetration_percent: null,
  magic_penetration: "magic_penetration",
  magic_penetration_percent: "magic_penetration",
};

export function mnemonicForStat(key: JourneyStatKey): StatMnemonic | null {
  const m = BOARD_STAT_MNEMONIC[key];
  return m ? STAT_MNEMONICS[m] : null;
}

/** A stat's mnemonic by a K1 / prompt-semantics metric name (`base_armor`, `armor`). */
export function mnemonicForMetric(metric: string | null | undefined): StatMnemonic | null {
  if (!metric) return null;
  const key = metric.replace(/^base_/, "");
  return key in BOARD_STAT_MNEMONIC ? mnemonicForStat(key as JourneyStatKey) : null;
}

/** Served stat-mod id → the owner's shard art. An id without art draws its name only. */
const SHARD_ART: Readonly<Record<string, string>> = {
  "5008": "adaptive_force",
  "5005": "attack_speed",
  "5007": "ability_haste",
  "5010": "move_speed",
  "5001": "scaling_health",
  "5011": "flat_health",
  "5013": "tenacity",
};

export const SHARD_ART_BASE = "/assets/journey/mogzy-stat-shards";

export function shardArtUrl(shardId: string): string | null {
  const file = SHARD_ART[shardId];
  return file ? `${SHARD_ART_BASE}/${file}.png` : null;
}

/** Every shard art file the vocabulary draws (tests assert each is on disk). */
export const SHARD_ART_FILES: readonly string[] = Object.values(SHARD_ART);
