// PT1.7 — the private first-customer annual Premium gift: $50.00 USD TOTAL,
// paid once by the buyer, redeemed by the recipient for 365 days of Premium.
// Never part of the public Price-ID catalog (gift-catalog.ts), never a
// subscription, never renewed.
//
// AUTHORITY
//   * Terms are server constants here and in SQL (`public.private_gift_terms()`);
//     a test pins them together.
//   * The browser sends a recipient email and an optional message. It never
//     sends a price, amount, currency, quantity, coupon or duration.
//   * Payment is accepted only from Stripe's own objects, re-read server-side
//     (gift-payment.ts), and recorded by SQL that re-checks the amount.
//
// FAIL CLOSED — checkout exists only when ALL of these are set:
//   PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED=true
//   STRIPE_PRIVATE_ANNUAL_GIFT_PRICE_ID=price_…   ($50.00, usd, one_time, active)
//   PRIVATE_ANNUAL_GIFT_TAX_MODE=stripe_tax_inclusive | approved_not_taxable
//   PRIVATE_ANNUAL_GIFT_BUYER_USER_IDS=<uuid>[,<uuid>…]   (who may buy it)
//   and, against a LIVE Stripe key, PRIVATE_ANNUAL_GIFT_LIVE_APPROVED=true.
//
// Pure TypeScript (no Deno/URL imports) so vitest can run it.

export const PRIVATE_ANNUAL_GIFT = "first_customer_annual_gift" as const;
export const PRIVATE_GIFT_AMOUNT = 5000;
export const PRIVATE_GIFT_DAYS = 365;

/** Must equal `public.private_gift_terms()` — asserted by the PT1.7 tests. */
export const PRIVATE_GIFT_TERMS = {
  offer_id: PRIVATE_ANNUAL_GIFT,
  gift_type: "pro_annual",
  amount_cents: PRIVATE_GIFT_AMOUNT,
  currency: "usd",
  premium_days: PRIVATE_GIFT_DAYS,
  auto_renews: false,
} as const;

/** Stripe requires 30 min – 24 h. */
export const GIFT_SESSION_TTL_SECONDS = 31 * 60;
export const GIFT_SESSION_REUSE_MARGIN_MS = 2 * 60 * 1000;
export const GIFT_PAGE_PATH = "/lol/premium/gift";
export const GIFT_MESSAGE_MAX = 500;

/**
 * How the $50 total relates to sales tax. Both keep the TOTAL at $50.00:
 *   stripe_tax_inclusive  Stripe Tax computes any tax INSIDE a tax-inclusive
 *                         price (the price's tax_behavior must be "inclusive").
 *   approved_not_taxable  The owner has confirmed no tax is due for this sale;
 *                         Stripe Tax is not enabled on the session.
 * Unset or anything else = not approved = checkout off.
 */
export type GiftTaxMode = "stripe_tax_inclusive" | "approved_not_taxable";

export type EnvReader = (name: string) => string | undefined;

function denoEnv(name: string): string | undefined {
  const v = (globalThis as { Deno?: { env?: { get?: (n: string) => unknown } } }).Deno?.env?.get?.(name);
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PrivateGiftDisabledReason =
  | "not_enabled"
  | "stripe_not_configured"
  | "price_not_configured"
  | "tax_not_approved"
  | "buyers_not_configured"
  | "live_not_approved";

export interface PrivateGiftConfig {
  enabled: boolean;
  reason: PrivateGiftDisabledReason | null;
  priceId: string;
  taxMode: GiftTaxMode | null;
  liveMode: boolean;
  buyerIds: readonly string[];
}

export function privateGiftConfig(env: EnvReader = denoEnv): PrivateGiftConfig {
  const key = env("STRIPE_SECRET_KEY") ?? "";
  const priceId = env("STRIPE_PRIVATE_ANNUAL_GIFT_PRICE_ID") ?? "";
  const rawTax = env("PRIVATE_ANNUAL_GIFT_TAX_MODE");
  const taxMode: GiftTaxMode | null =
    rawTax === "stripe_tax_inclusive" || rawTax === "approved_not_taxable" ? rawTax : null;
  const buyerIds = (env("PRIVATE_ANNUAL_GIFT_BUYER_USER_IDS") ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter((s) => UUID_RE.test(s));
  const liveMode = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  const base = { priceId, taxMode, liveMode, buyerIds };
  const off = (reason: PrivateGiftDisabledReason): PrivateGiftConfig => ({ ...base, enabled: false, reason });
  if (env("PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED") !== "true") return off("not_enabled");
  if (!key) return off("stripe_not_configured");
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) return off("price_not_configured");
  if (!taxMode) return off("tax_not_approved");
  if (buyerIds.length === 0) return off("buyers_not_configured");
  if (liveMode && env("PRIVATE_ANNUAL_GIFT_LIVE_APPROVED") !== "true") return off("live_not_approved");
  return { ...base, enabled: true, reason: null };
}

/** The private offer is sold only to allowlisted buyer accounts. */
export function buyerAllowed(config: PrivateGiftConfig, userId: string | null | undefined): boolean {
  return config.enabled && !!userId && config.buyerIds.includes(userId.toLowerCase());
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validRecipientEmail(value: unknown): boolean {
  const e = normalizeEmail(value);
  return e.length > 0 && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** The subset of a Stripe Price this offer depends on. */
export interface PriceLike {
  id?: string;
  active?: boolean;
  type?: string;
  unit_amount?: number | null;
  currency?: string;
  recurring?: unknown;
  tax_behavior?: string | null;
}

/** Null when the Price is exactly $50.00 USD, one-time and active; otherwise why not. */
export function validPrivatePrice(price: PriceLike | null | undefined, taxMode: GiftTaxMode | null): string | null {
  if (!price) return "price_missing";
  if (price.active !== true) return "price_inactive";
  if (price.type !== "one_time" || price.recurring) return "price_not_one_time";
  if (price.unit_amount !== PRIVATE_GIFT_AMOUNT) return "price_amount_mismatch";
  if ((price.currency ?? "").toLowerCase() !== "usd") return "price_currency_mismatch";
  if (!taxMode) return "tax_not_approved";
  if (taxMode === "stripe_tax_inclusive" && price.tax_behavior !== "inclusive") return "price_not_tax_inclusive";
  return null;
}

const ALLOWED_ORIGINS = [
  "https://mogzy.lol",
  "https://www.mogzy.lol",
  "https://mogsy.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

export function returnOrigin(requestOrigin: string | null | undefined): string {
  return requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "https://mogzy.lol";
}

export interface GiftSessionInput {
  priceId: string;
  giftId: string;
  buyerId: string;
  buyerEmail: string;
  customerId: string | null;
  recipientEmail: string;
  taxMode: GiftTaxMode;
  origin: string;
  nowMs: number;
}

/**
 * The complete Checkout Session request, entirely server-derived: one unit of
 * the configured price, no promotion codes or discounts, card only, and
 * server-written metadata on BOTH the session and the PaymentIntent (so refund
 * and dispute events, which only carry the PaymentIntent, map back to the gift).
 * The redeem code is NOT sent to Stripe.
 */
export function buildPrivateGiftSessionParams(i: GiftSessionInput): Record<string, unknown> {
  const metadata = {
    supabase_user_id: i.buyerId,
    gift_id: i.giftId,
    gift_type: "pro_annual",
    private_offer: PRIVATE_ANNUAL_GIFT,
    recipient_email: normalizeEmail(i.recipientEmail),
    tax_mode: i.taxMode,
  };
  return {
    mode: "payment",
    line_items: [{ price: i.priceId, quantity: 1 }],
    payment_method_types: ["card"],
    allow_promotion_codes: false,
    submit_type: "pay",
    ...(i.customerId
      ? { customer: i.customerId }
      : { customer_email: i.buyerEmail, customer_creation: "always" }),
    client_reference_id: i.buyerId,
    metadata,
    payment_intent_data: {
      metadata,
      description: "Mogzy Premium gift — 12 months (365 days), one-time payment, does not renew",
    },
    ...(i.taxMode === "stripe_tax_inclusive"
      ? { automatic_tax: { enabled: true }, billing_address_collection: "required" }
      : {}),
    expires_at: Math.floor(i.nowMs / 1000) + GIFT_SESSION_TTL_SECONDS,
    success_url: `${i.origin}${GIFT_PAGE_PATH}?gift=${i.giftId}&checkout=success`,
    cancel_url: `${i.origin}${GIFT_PAGE_PATH}?gift=${i.giftId}&checkout=canceled`,
  };
}

export function isPrivateGift(gift: { offer_id?: string | null } | null | undefined): boolean {
  return gift?.offer_id === PRIVATE_ANNUAL_GIFT;
}

/**
 * UX pre-check only — the database (`gift_redeem`) is the authority and repeats
 * every one of these checks under a row lock.
 */
export function recipientMatches(
  user: { id?: string; email?: string | null; email_confirmed_at?: string | null; is_anonymous?: boolean } | null,
  gift: { recipient_email?: string | null; recipient_user_id?: string | null } | null,
): boolean {
  return !!user?.id && !user.is_anonymous && !!user.email_confirmed_at
    && typeof gift?.recipient_email === "string"
    && normalizeEmail(user.email) === normalizeEmail(gift.recipient_email)
    && (!gift.recipient_user_id || gift.recipient_user_id === user.id);
}
