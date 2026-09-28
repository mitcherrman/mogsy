/**
 * JP2 — THE BOARD'S INVENTORY, DRAWN THE WAY LEAGUE DRAWS IT.
 *
 * The Journey wire lists an inventory ONE UNIT PER ENTRY (a side holding two
 * Health Potions carries "Health Potion" twice). That is the canonical state
 * and it is never changed here. What changes is only how it is DRAWN: in the
 * game, identical stackable consumables share one slot with a count on the
 * icon, and every other item takes a slot of its own — two Doran's Blades are
 * two slots.
 *
 * WHICH ITEMS STACK. Nothing the client receives says so: the Journey wire has
 * no quantity, and the canonical item data has no inventory stack size. So the
 * set is named here, by canonical item id, as the smallest presentation fact
 * that lets the board match the game. It is keyed on ids, never on a scenario
 * or a champion, and an id it does not name draws exactly as before (one slot
 * per unit). When the backend publishes a stack size, this table is the one
 * thing to delete.
 */

/** Canonical item id → the most the game stacks in one slot. */
export const STACKABLE_ITEM_MAX: ReadonlyMap<number, number> = new Map([
  [2003, 5], // Health Potion
  [2055, 2], // Control Ward
]);

export interface InventoryUnit {
  /** The canonical item id as the wire spells it (a numeric string). */
  itemId: string;
  name: string;
}

export interface InventoryStack {
  itemId: string;
  name: string;
  /** How many wire units this slot draws (1 for anything that does not stack). */
  quantity: number;
}

const idOf = (itemId: string) => {
  const n = Number(itemId);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * The wire's units → the slots the board draws, in first-seen order. A
 * stackable unit joins the earliest slot of the same item that still has room;
 * everything else opens its own slot. Pure, and total over the input: the
 * quantities always sum to the number of units.
 */
export function stackInventory(units: readonly InventoryUnit[]): InventoryStack[] {
  const out: InventoryStack[] = [];
  for (const u of units) {
    const id = idOf(u.itemId);
    const max = id === null ? undefined : STACKABLE_ITEM_MAX.get(id);
    const open = max === undefined ? undefined
      : out.find((s) => s.itemId === u.itemId && s.quantity < max);
    if (open) open.quantity += 1;
    else out.push({ itemId: u.itemId, name: u.name, quantity: 1 });
  }
  return out;
}

/**
 * The slot the LAST unit of `itemId` is drawn in, or -1. A purchase event names
 * an item, not a slot; this is where the board shows it arriving.
 */
export function slotOfLatest(stacks: readonly InventoryStack[], itemId: string): number {
  for (let i = stacks.length - 1; i >= 0; i -= 1) if (stacks[i].itemId === itemId) return i;
  return -1;
}
