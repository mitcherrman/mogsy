import type { StatFamily } from "./statCheckEngine";

/**
 * Stat Check item definitions and pure effect contracts.
 *
 * Items grant one flat stat bonus per compatible stat family. Compatibility is
 * decided by stat family only, never by Highest/Lowest direction: a positive
 * bonus is legal (and intentionally harmful) in a Lowest category. Families
 * absent from `bonuses` are incompatible; adding future bonuses (e.g. a
 * Mogzy Snack move-speed value) is a data change only.
 */
export type ItemId = "long-sword" | "cloth-armor" | "ruby-crystal" | "mogzy-snack";

export type ItemDefinition = {
  id: ItemId;
  label: string;
  /** Flat bonus per compatible stat family. Missing family = incompatible. */
  bonuses: Partial<Record<StatFamily, number>>;
  /** Short human-readable effect line for choice/tooltip surfaces. */
  effectText: string;
};

export const ITEMS: Record<ItemId, ItemDefinition> = {
  "long-sword": {
    id: "long-sword",
    label: "Long Sword",
    bonuses: { "attack-damage": 10 },
    effectText: "+10 Attack Damage",
  },
  "cloth-armor": {
    id: "cloth-armor",
    label: "Cloth Armor",
    bonuses: { armor: 15 },
    effectText: "+15 Armor",
  },
  "ruby-crystal": {
    id: "ruby-crystal",
    label: "Ruby Crystal",
    bonuses: { health: 150 },
    effectText: "+150 Health",
  },
  "mogzy-snack": {
    id: "mogzy-snack",
    label: "Mogzy Snack",
    // Not yet legal in move-speed or attack-range lanes; extend here later.
    bonuses: { health: 75, "attack-damage": 5, armor: 8 },
    effectText: "+75 Health / +5 AD / +8 Armor",
  },
};

/** Stable fixed ordering: acquisition menus and deterministic tie-breaks. */
export const ITEM_IDS: ItemId[] = ["long-sword", "cloth-armor", "ruby-crystal", "mogzy-snack"];

/** Count-based inventory; duplicate copies are exact counts. */
export type ItemInventory = Record<ItemId, number>;

export const emptyItemInventory = (): ItemInventory => ({
  "long-sword": 0,
  "cloth-armor": 0,
  "ruby-crystal": 0,
  "mogzy-snack": 0,
});

export function addInventoryItem(inventory: ItemInventory, itemId: ItemId): ItemInventory {
  return { ...inventory, [itemId]: (inventory[itemId] ?? 0) + 1 };
}

export function removeInventoryItem(inventory: ItemInventory, itemId: ItemId): ItemInventory {
  return { ...inventory, [itemId]: Math.max(0, (inventory[itemId] ?? 0) - 1) };
}

export function inventoryCount(inventory: ItemInventory, itemId: ItemId): number {
  return inventory[itemId] ?? 0;
}

export function totalInventoryCount(inventory: ItemInventory): number {
  return ITEM_IDS.reduce((sum, id) => sum + (inventory[id] ?? 0), 0);
}

/** Flat bonus this item grants in the given stat family; 0 when incompatible or unequipped. */
export function itemBonusFor(itemId: ItemId | null | undefined, family: StatFamily): number {
  if (!itemId) return 0;
  return ITEMS[itemId].bonuses[family] ?? 0;
}

export function isItemCompatible(itemId: ItemId, family: StatFamily): boolean {
  return (ITEMS[itemId].bonuses[family] ?? 0) !== 0;
}

/**
 * Item-choice cadence: one acquisition before Round 1 (0 completed rounds) and
 * one after every third completed round (3, 6, 9, ...).
 */
export function isItemChoicePoint(completedRounds: number): boolean {
  return completedRounds >= 0 && completedRounds % 3 === 0;
}

/** Total acquisitions each side should have completed by this point of the match. */
export function expectedItemChoices(completedRounds: number): number {
  return Math.floor(completedRounds / 3) + 1;
}
