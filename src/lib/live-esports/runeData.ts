/**
 * Riot rune ids -> names, for the rune page the LIVE1 details feed publishes
 * (`perkMetadata`: style id, sub-style id, perk ids).
 *
 * GENERATED from Data Dragon `16.19.1/data/en_US/runesReforged.json`
 * (identical to 16.17.1, the LCS final's patch) plus the stat shards, which
 * Data Dragon does not list. Icons are the asset host's `assets/runes/*.png`
 * where one exists; trees and shards have none and render as text.
 *
 * An id this table does not know is shown as nothing rather than guessed:
 * a rune added after 16.19 is dropped from the line, never renamed.
 */

export type RuneTree = { id: number; name: string };
export type RunePerk = { id: number; name: string; tree: number; keystone: boolean; icon: string | null };

export const RUNE_TREES: Record<number, RuneTree> = {
  8100: { id: 8100, name: "Domination" },
  8300: { id: 8300, name: "Inspiration" },
  8000: { id: 8000, name: "Precision" },
  8400: { id: 8400, name: "Resolve" },
  8200: { id: 8200, name: "Sorcery" },
};

export const RUNE_PERKS: Record<number, RunePerk> = {
  8112: { id: 8112, name: "Electrocute", tree: 8100, keystone: true, icon: "assets/runes/Electrocute.png" },
  8128: { id: 8128, name: "Dark Harvest", tree: 8100, keystone: true, icon: "assets/runes/Dark_Harvest.png" },
  9923: { id: 9923, name: "Hail of Blades", tree: 8100, keystone: true, icon: "assets/runes/Hail_of_Blades.png" },
  8126: { id: 8126, name: "Cheap Shot", tree: 8100, keystone: false, icon: "assets/runes/Cheap_Shot.png" },
  8139: { id: 8139, name: "Taste of Blood", tree: 8100, keystone: false, icon: "assets/runes/Taste_of_Blood.png" },
  8143: { id: 8143, name: "Sudden Impact", tree: 8100, keystone: false, icon: "assets/runes/Sudden_Impact.png" },
  8137: { id: 8137, name: "Sixth Sense", tree: 8100, keystone: false, icon: "assets/runes/Sixth_Sense.png" },
  8140: { id: 8140, name: "Grisly Mementos", tree: 8100, keystone: false, icon: "assets/runes/Grisly_Mementos.png" },
  8141: { id: 8141, name: "Deep Ward", tree: 8100, keystone: false, icon: "assets/runes/Deep_Ward.png" },
  8135: { id: 8135, name: "Treasure Hunter", tree: 8100, keystone: false, icon: "assets/runes/Treasure_Hunter.png" },
  8105: { id: 8105, name: "Relentless Hunter", tree: 8100, keystone: false, icon: "assets/runes/Relentless_Hunter.png" },
  8106: { id: 8106, name: "Ultimate Hunter", tree: 8100, keystone: false, icon: "assets/runes/Ultimate_Hunter.png" },
  8351: { id: 8351, name: "Glacial Augment", tree: 8300, keystone: true, icon: "assets/runes/Glacial_Augment.png" },
  8360: { id: 8360, name: "Unsealed Spellbook", tree: 8300, keystone: true, icon: "assets/runes/Unsealed_Spellbook.png" },
  8369: { id: 8369, name: "First Strike", tree: 8300, keystone: true, icon: "assets/runes/First_Strike.png" },
  8306: { id: 8306, name: "Hextech Flashtraption", tree: 8300, keystone: false, icon: "assets/runes/Hextech_Flashtraption.png" },
  8304: { id: 8304, name: "Magical Footwear", tree: 8300, keystone: false, icon: "assets/runes/Magical_Footwear.png" },
  8321: { id: 8321, name: "Cash Back", tree: 8300, keystone: false, icon: "assets/runes/Cash_Back.png" },
  8313: { id: 8313, name: "Triple Tonic", tree: 8300, keystone: false, icon: "assets/runes/Triple_Tonic.png" },
  8352: { id: 8352, name: "Time Warp Tonic", tree: 8300, keystone: false, icon: "assets/runes/Time_Warp_Tonic.png" },
  8345: { id: 8345, name: "Biscuit Delivery", tree: 8300, keystone: false, icon: "assets/runes/Biscuit_Delivery.png" },
  8347: { id: 8347, name: "Cosmic Insight", tree: 8300, keystone: false, icon: "assets/runes/Cosmic_Insight.png" },
  8410: { id: 8410, name: "Approach Velocity", tree: 8300, keystone: false, icon: "assets/runes/Approach_Velocity.png" },
  8316: { id: 8316, name: "Jack Of All Trades", tree: 8300, keystone: false, icon: "assets/runes/Jack_Of_All_Trades.png" },
  8005: { id: 8005, name: "Press the Attack", tree: 8000, keystone: true, icon: "assets/runes/Press_the_Attack.png" },
  8008: { id: 8008, name: "Lethal Tempo", tree: 8000, keystone: true, icon: "assets/runes/Lethal_Tempo.png" },
  8021: { id: 8021, name: "Fleet Footwork", tree: 8000, keystone: true, icon: "assets/runes/Fleet_Footwork.png" },
  8010: { id: 8010, name: "Conqueror", tree: 8000, keystone: true, icon: "assets/runes/Conqueror.png" },
  9101: { id: 9101, name: "Absorb Life", tree: 8000, keystone: false, icon: "assets/runes/Absorb_Life.png" },
  9111: { id: 9111, name: "Triumph", tree: 8000, keystone: false, icon: "assets/runes/Triumph.png" },
  8009: { id: 8009, name: "Presence of Mind", tree: 8000, keystone: false, icon: "assets/runes/Presence_of_Mind.png" },
  9104: { id: 9104, name: "Legend: Alacrity", tree: 8000, keystone: false, icon: "assets/runes/Legend_Alacrity.png" },
  9105: { id: 9105, name: "Legend: Haste", tree: 8000, keystone: false, icon: "assets/runes/Legend_Haste.png" },
  9103: { id: 9103, name: "Legend: Bloodline", tree: 8000, keystone: false, icon: "assets/runes/Legend_Bloodline.png" },
  8014: { id: 8014, name: "Coup de Grace", tree: 8000, keystone: false, icon: "assets/runes/Coup_de_Grace.png" },
  8017: { id: 8017, name: "Cut Down", tree: 8000, keystone: false, icon: "assets/runes/Cut_Down.png" },
  8299: { id: 8299, name: "Last Stand", tree: 8000, keystone: false, icon: "assets/runes/Last_Stand.png" },
  8437: { id: 8437, name: "Grasp of the Undying", tree: 8400, keystone: true, icon: "assets/runes/Grasp_of_the_Undying.png" },
  8439: { id: 8439, name: "Aftershock", tree: 8400, keystone: true, icon: "assets/runes/Aftershock.png" },
  8465: { id: 8465, name: "Guardian", tree: 8400, keystone: true, icon: "assets/runes/Guardian.png" },
  8446: { id: 8446, name: "Demolish", tree: 8400, keystone: false, icon: "assets/runes/Demolish.png" },
  8463: { id: 8463, name: "Font of Life", tree: 8400, keystone: false, icon: "assets/runes/Font_of_Life.png" },
  8401: { id: 8401, name: "Shield Bash", tree: 8400, keystone: false, icon: "assets/runes/Shield_Bash.png" },
  8429: { id: 8429, name: "Conditioning", tree: 8400, keystone: false, icon: "assets/runes/Conditioning.png" },
  8444: { id: 8444, name: "Second Wind", tree: 8400, keystone: false, icon: "assets/runes/Second_Wind.png" },
  8473: { id: 8473, name: "Bone Plating", tree: 8400, keystone: false, icon: "assets/runes/Bone_Plating.png" },
  8451: { id: 8451, name: "Overgrowth", tree: 8400, keystone: false, icon: "assets/runes/Overgrowth.png" },
  8453: { id: 8453, name: "Revitalize", tree: 8400, keystone: false, icon: "assets/runes/Revitalize.png" },
  8242: { id: 8242, name: "Unflinching", tree: 8400, keystone: false, icon: "assets/runes/Unflinching.png" },
  8214: { id: 8214, name: "Summon Aery", tree: 8200, keystone: true, icon: "assets/runes/Summon_Aery.png" },
  8229: { id: 8229, name: "Arcane Comet", tree: 8200, keystone: true, icon: "assets/runes/Arcane_Comet.png" },
  8230: { id: 8230, name: "Stormraider's Surge", tree: 8200, keystone: true, icon: "assets/runes/Stormraiders_Surge.png" },
  8992: { id: 8992, name: "Deathfire Touch", tree: 8200, keystone: true, icon: "assets/runes/Deathfire_Touch.png" },
  8224: { id: 8224, name: "Axiom Arcanist", tree: 8200, keystone: false, icon: "assets/runes/Axiom_Arcanist.png" },
  8226: { id: 8226, name: "Manaflow Band", tree: 8200, keystone: false, icon: "assets/runes/Manaflow_Band.png" },
  8275: { id: 8275, name: "Nimbus Cloak", tree: 8200, keystone: false, icon: "assets/runes/Nimbus_Cloak.png" },
  8210: { id: 8210, name: "Transcendence", tree: 8200, keystone: false, icon: "assets/runes/Transcendence.png" },
  8234: { id: 8234, name: "Celerity", tree: 8200, keystone: false, icon: "assets/runes/Celerity.png" },
  8233: { id: 8233, name: "Absolute Focus", tree: 8200, keystone: false, icon: "assets/runes/Absolute_Focus.png" },
  8237: { id: 8237, name: "Scorch", tree: 8200, keystone: false, icon: "assets/runes/Scorch.png" },
  8232: { id: 8232, name: "Waterwalking", tree: 8200, keystone: false, icon: "assets/runes/Waterwalking.png" },
  8236: { id: 8236, name: "Gathering Storm", tree: 8200, keystone: false, icon: "assets/runes/Gathering_Storm.png" },
};

/** Stat shards (the rune page's last three slots). */
export const RUNE_SHARDS: Record<number, string> = {
  5001: "Health scaling",
  5005: "Attack speed",
  5007: "Ability haste",
  5008: "Adaptive force",
  5010: "Move speed",
  5011: "Health",
  5013: "Tenacity and slow resist",
};
