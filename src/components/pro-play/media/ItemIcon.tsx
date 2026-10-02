// ---------------------------------------------------------------------------
// Item icons for the Pro Play surfaces (PPH3) — the hub's lane rows and the
// full match centre's player rows.
//
// THE BUG THIS REPLACES. LIVE1 serves a player's `items` as Riot item IDs
// (`[3078, 3111, 3363, …]`). The match centre read `.name` off each entry, so
// every inventory drew as six blank grey squares with an empty tooltip.
//
// NO NEW RESOLVER. The art is the Combat API asset store's own
// `assets/items/{id}.png` — the convention the quiz surfaces and the Mastery
// live player already use — turned into a URL by `resolveAssetUrl`, the same
// helper champion art and the esports media authority go through. Names for
// the tooltip come from the public `/api/items` index (id → name), loaded once
// per session; an item the index does not list (trinkets, consumables) is
// still drawn, titled by its ID.
//
// WHAT THE STRIP CLAIMS. LIVE1's list is the inventory at the latest stored
// frame, not a purchase order, and it can hold more than six non-trinket
// entries (stacked Control Wards are listed twice). So every served entry is
// drawn, in order, with the trinket set apart at the end — nothing is
// silently dropped to fit a six-slot picture.
//
// A missing image degrades to an empty slot frame, never a broken glyph, and
// the frame size is fixed so a slow image cannot move the row.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";
import { cn } from "@/lib/utils";

/** Riot's trinket item IDs: Stealth Ward, Farsight Alteration, Oracle Lens. */
export const TRINKET_ITEM_IDS: ReadonlySet<number> = new Set([3340, 3363, 3364]);

export function itemIconUrl(itemId: number | null | undefined): string | null {
  if (itemId == null || !Number.isFinite(itemId) || itemId <= 0) return null;
  return resolveAssetUrl(`assets/items/${itemId}.png`);
}

/** The served inventory, normalised: numeric IDs only, trinkets last. */
export function inventory(items: unknown): { items: number[]; trinket: number | null } {
  const ids = (Array.isArray(items) ? items : [])
    .map((v) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN))
    .filter((v) => Number.isFinite(v) && v > 0);
  const trinkets = ids.filter((id) => TRINKET_ITEM_IDS.has(id));
  return { items: ids.filter((id) => !TRINKET_ITEM_IDS.has(id)), trinket: trinkets[0] ?? null };
}

type ItemIndex = { items?: { id?: number | null; name?: string }[] };

/** id → item name from the public item index. Never throws into a render. */
export function useItemNames(): Map<number, string> {
  const { data } = useQuery({
    queryKey: ["items", "index"],
    queryFn: async () => {
      const res = await fetch(`${COMBAT_API_BASE_URL}/api/items`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`items index ${res.status}`);
      return (await res.json()) as ItemIndex;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  const map = new Map<number, string>();
  for (const it of Array.isArray(data?.items) ? data!.items : []) {
    if (typeof it?.id === "number" && it.name) map.set(it.id, it.name);
  }
  return map;
}

const SIZE = {
  "2xs": "h-3.5 w-3.5",
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-6 w-6",
} as const;
export type ItemSize = keyof typeof SIZE;

export function ItemIcon({
  itemId,
  name,
  size = "sm",
  trinket = false,
  decorative = false,
}: {
  itemId: number;
  name?: string;
  size?: ItemSize;
  trinket?: boolean;
  /** Inside an `ItemStrip`, which names the whole inventory once. */
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = itemIconUrl(itemId);
  const label = name || `Item ${itemId}`;
  return (
    <span
      data-testid="item-icon"
      data-item-id={itemId}
      data-media-state={src && !failed ? "art" : "placeholder"}
      title={label}
      className={cn(
        "inline-flex shrink-0 overflow-hidden border border-border/60 bg-muted/40",
        trinket ? "rounded-full" : "rounded-[3px]",
        SIZE[size],
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={decorative ? "" : label}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

/**
 * One player's inventory as a strip. `mirrored` reverses it for the red side
 * so the trinket sits on the outer edge on both sides of a lane row.
 */
export function ItemStrip({
  items,
  size = "sm",
  names,
  mirrored = false,
  className,
}: {
  items: unknown;
  size?: ItemSize;
  names?: Map<number, string>;
  mirrored?: boolean;
  className?: string;
}) {
  const inv = inventory(items);
  if (!inv.items.length && inv.trinket == null) return null;
  return (
    <span
      data-testid="item-strip"
      role="img"
      aria-label={`Items: ${[...inv.items, ...(inv.trinket != null ? [inv.trinket] : [])]
        .map((id) => names?.get(id) || `item ${id}`)
        .join(", ")}`}
      className={cn(
        "inline-flex flex-wrap items-center",
        size === "2xs" ? "gap-px" : "gap-0.5",
        mirrored && "flex-row-reverse",
        className,
      )}
    >
      {inv.items.map((id, i) => (
        <ItemIcon key={`${id}-${i}`} itemId={id} name={names?.get(id)} size={size} decorative />
      ))}
      {inv.trinket != null && (
        <span className={cn("inline-flex", mirrored ? "mr-1" : "ml-1")}>
          <ItemIcon itemId={inv.trinket} name={names?.get(inv.trinket)} size={size} trinket decorative />
        </span>
      )}
    </span>
  );
}
