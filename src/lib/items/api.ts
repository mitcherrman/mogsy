import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";
import type { CanonicalItem } from "@/lib/items/types";

export class ItemApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const ITEMS_API_BASE_URL = COMBAT_API_BASE_URL;
export const isItemNotFound = (error: unknown) => error instanceof ItemApiError && error.status === 404;
export async function getItem(slug: string): Promise<CanonicalItem> {
  const response = await fetch(`${COMBAT_API_BASE_URL}/api/items/${encodeURIComponent(slug)}`);
  if (!response.ok) throw new ItemApiError(response.status, `Item request failed (${response.status})`);
  const body = await response.json() as { item?: CanonicalItem };
  if (!body.item) throw new ItemApiError(response.status, "Item response had no item");
  return body.item;
}
