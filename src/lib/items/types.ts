export type ItemStat = { key: string; label: string; value: number; unit: string; display: string };
export type ItemComponent = { name: string; slug: string; item_id: number | null; quantity: number; icon_path: string | null };
export type ItemLink = { name: string; slug: string; item_id: number | null; icon_path: string | null };
export type ItemEffect = { slot: string; kind: string | null; name: string | null; description: string | null; description2: string | null; is_unique: boolean | null; cooldown: string | null; range: string | null; charges: string | null; recharge: string | null };
export type ItemProvenance = { source: string; source_url: string | null; source_revision: number | null; fetched_at: string | null; parser_version: string | null; validation_status: string | null };
export type CanonicalItem = {
  id: number | null; slug: string; name: string; icon_path: string | null;
  is_current_sr: boolean | null; tier: string | null; types: string[]; modes: string[];
  acquisition: string | null; acquisition_requirement: string | null; purchasable: boolean | null;
  shop_price: number | null; total_cost: number | null; base_cost: number | null;
  combine_cost: number | null; price_source: string | null; sell_gold: number | null;
  stats: ItemStat[]; components: ItemComponent[]; builds_into: ItemLink[];
  effects: ItemEffect[]; provenance: ItemProvenance;
};

export function itemIconUrl(apiBase: string, path: string | null): string | null {
  return path ? `${apiBase.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}` : null;
}
export function shopPrice(item: CanonicalItem): number | null {
  return item.purchasable && item.shop_price !== null ? item.shop_price : null;
}
export function statusLine(item: CanonicalItem): string {
  const tier = item.types.find((type) => type.toLowerCase() !== "unknown");
  return item.is_current_sr
    ? `Current Summoner's Rift${tier ? ` ${tier.toLowerCase()}` : ""} item`
    : `${tier ?? "League of Legends"} item`;
}
export const formatGold = (value: number) => value.toLocaleString("en-US");
