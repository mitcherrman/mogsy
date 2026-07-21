// Server-owned catalog mapping Stripe Price IDs to canonical gift definitions.
// This is the ONLY authoritative source for gift diamond amounts and gift
// types on the backend. The client's request body is never trusted: whatever
// `gift.diamond_amount` or `gift.gift_type` the browser sends is discarded
// and replaced with the value derived here from the Stripe Price ID.
//
// Env-var overrides let each environment (test/live) point at its own Stripe
// Price IDs without editing code; the hardcoded fallbacks match the live
// values already shipped in the browser bundle (src/pages/Shop.tsx), so the
// catalog is populated even before env vars are configured.

export type GiftType = "diamonds" | "pro_monthly" | "pro_annual";

export interface GiftCatalogEntry {
  priceId: string;
  giftType: GiftType;
  /** Diamonds granted at redemption. Zero for Pro gifts. */
  diamondAmount: number;
  /** Human label; used for admin/log context only, never trusted. */
  label: string;
}

function env(name: string, fallback: string): string {
  // deno-lint-ignore no-explicit-any
  const v = (globalThis as any).Deno?.env?.get?.(name);
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/** Build a fresh catalog from env with historical live IDs as fallbacks. */
export function buildGiftCatalog(): Map<string, GiftCatalogEntry> {
  const entries: GiftCatalogEntry[] = [
    { priceId: env("STRIPE_PACK_50_PRICE_ID",   "price_1T3UbgD9NqEQUIGhYrBcRg9p"), giftType: "diamonds",    diamondAmount: 50,   label: "50 Diamonds" },
    { priceId: env("STRIPE_PACK_200_PRICE_ID",  "price_1T3UbyD9NqEQUIGhjzroRY0y"), giftType: "diamonds",    diamondAmount: 200,  label: "200 Diamonds" },
    { priceId: env("STRIPE_PACK_500_PRICE_ID",  "price_1T3UcSD9NqEQUIGhHHKuZRgT"), giftType: "diamonds",    diamondAmount: 500,  label: "500 Diamonds" },
    { priceId: env("STRIPE_PACK_1500_PRICE_ID", "price_1T3UcdD9NqEQUIGhSzHaDXi1"), giftType: "diamonds",    diamondAmount: 1500, label: "1500 Diamonds" },
    { priceId: env("STRIPE_PACK_5000_PRICE_ID", "price_1T3UcpD9NqEQUIGhjNr7NtLu"), giftType: "diamonds",    diamondAmount: 5000, label: "5000 Diamonds" },
    { priceId: env("STRIPE_GIFT_PRO_MONTHLY_PRICE_ID", "price_1TZS2yD9NqEQUIGhP9HWjgy1"), giftType: "pro_monthly", diamondAmount: 0, label: "Gift Pro (monthly)" },
    { priceId: env("STRIPE_GIFT_PRO_ANNUAL_PRICE_ID",  "price_1TZS92D9NqEQUIGhCx5fczRp"), giftType: "pro_annual",  diamondAmount: 0, label: "Gift Pro (annual)" },
  ];
  const map = new Map<string, GiftCatalogEntry>();
  for (const e of entries) {
    if (e.priceId.startsWith("price_")) map.set(e.priceId, e);
  }
  return map;
}

let cached: Map<string, GiftCatalogEntry> | null = null;
function catalog(): Map<string, GiftCatalogEntry> {
  if (!cached) cached = buildGiftCatalog();
  return cached;
}

/**
 * Resolve a Price ID against the server catalog. Returns null when the
 * Price ID is not on the allow-list. Callers MUST treat null as a hard
 * rejection — never fall back to client-supplied values.
 */
export function resolveGiftByPriceId(priceId: unknown): GiftCatalogEntry | null {
  if (typeof priceId !== "string" || !priceId.startsWith("price_")) return null;
  return catalog().get(priceId) ?? null;
}

/** Test hook: swap or reset the cached catalog. */
export function __setCatalogForTests(entries: GiftCatalogEntry[] | null): void {
  if (entries === null) { cached = null; return; }
  cached = new Map(entries.map((e) => [e.priceId, e]));
}
