/**
 * JPX — an item's REFERENCE stats for the board's item popup.
 *
 * The authority is the public canonical item API the item pages already use:
 * `/api/items` (id → slug) and `/api/items/{slug}` (`CanonicalItem.stats`, each
 * stat's own label and display). Nothing here computes or converts a value; a
 * stat is printed exactly as served. This is the item's own catalogue entry —
 * what it provides — never a Journey fact (no champion, no total, no answer).
 *
 * Loaded on first open and cached for the page: the board draws before any
 * popup is asked for, and a failed read is retried on the next open.
 */
import { getItem, ITEMS_API_BASE_URL } from "@/lib/items/api";
import type { ItemStat } from "@/lib/items/types";

export interface ItemReferenceStat { key: string; label: string; display: string }

let slugs: Promise<Map<number, string>> | null = null;
const details = new Map<number, Promise<ItemReferenceStat[]>>();

function loadSlugs(): Promise<Map<number, string>> {
  if (!slugs) {
    slugs = fetch(`${ITEMS_API_BASE_URL}/api/items`, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`items index ${res.status}`);
        const body = await res.json() as { items?: { id?: number | null; slug?: string }[] };
        const map = new Map<number, string>();
        for (const it of Array.isArray(body.items) ? body.items : []) {
          if (typeof it?.id === "number" && it.slug) map.set(it.id, it.slug);
        }
        return map;
      })
      .catch((e) => { slugs = null; throw e; });
  }
  return slugs;
}

/** The item's canonical stats, as served (empty for an item with no stat bonus). */
export function loadItemReference(itemId: number): Promise<ItemReferenceStat[]> {
  let p = details.get(itemId);
  if (!p) {
    p = loadSlugs()
      .then((map) => {
        const slug = map.get(itemId);
        if (!slug) throw new Error(`item ${itemId} not in the canonical index`);
        return getItem(slug);
      })
      .then((item) => item.stats.map((s: ItemStat) => ({ key: s.key, label: s.label, display: s.display })))
      .catch((e) => { details.delete(itemId); throw e; });
    details.set(itemId, p);
  }
  return p;
}

/** "+10 Attack Damage": the served display with its sign and label. */
export const itemStatLine = (s: ItemReferenceStat) => `+${s.display} ${s.label}`;
