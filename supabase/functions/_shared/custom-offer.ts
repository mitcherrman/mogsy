// PT1.6b — the customer-specific one-time Premium offer: $50 TOTAL for 12
// calendar months of Premium, paid once, never auto-renewed.
//
// AUTHORITY
// ---------
// * What the offer costs and grants is a SERVER constant, here and in SQL
//   (`public.custom_offer_terms()`); a test pins the two together. The client
//   sends only a claim token. No price, amount, currency, coupon, quantity or
//   duration is ever read from a request.
// * Who may buy is the claim: a private, single-customer link minted by the
//   owner (`owner_create_custom_offer_claim`, fresh MFA). Only its SHA-256 is
//   stored. The first account to start a checkout is bound to it for good.
// * Whether Premium is granted is decided ONLY by stripe-webhook, from a
//   signature-verified event whose PaymentIntent has succeeded, and only when
//   the captured amount is exactly the terms' amount
//   (`custom_offer_activate_purchase`).
//
// FAIL CLOSED
// -----------
// Checkout is unreachable unless CUSTOM_OFFER_CHECKOUT_ENABLED=true AND a real
// one-time Stripe Price is configured. Against a LIVE Stripe key it also needs
// CUSTOM_OFFER_LIVE_APPROVED=true, which must not be set until tax compliance
// and end-to-end verification are signed off (CUSTOM_OFFER_ONE_TIME_HANDOFF.md).
//
// This module is pure TypeScript (no Deno or URL imports) so vitest can run it.

export const CUSTOM_OFFER_ID = "custom_one_time_50" as const;

/** Must equal `public.custom_offer_terms()` — asserted by the PT1.6b tests. */
export const CUSTOM_OFFER_TERMS = {
  offer_id: CUSTOM_OFFER_ID,
  amount_cents: 5000,
  currency: "usd",
  months: 12,
  auto_renews: false,
} as const;

/** Stripe requires 30 min – 24 h; 31 min leaves room for clock skew. */
export const CHECKOUT_SESSION_TTL_SECONDS = 31 * 60;
/** An open session closer than this to expiry is replaced, not reused. */
export const SESSION_REUSE_MARGIN_MS = 2 * 60 * 1000;

export const CLAIM_PATH = "/lol/premium/claim";

const TOKEN_RE = /^mgy1_[0-9a-f]{48}$/;

type EnvReader = (name: string) => string | undefined;

function denoEnv(name: string): string | undefined {
  const v = (globalThis as { Deno?: { env?: { get?: (n: string) => unknown } } }).Deno?.env?.get?.(name);
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export type CustomOfferDisabledReason =
  | "not_enabled"
  | "price_not_configured"
  | "stripe_not_configured"
  | "live_not_approved";

export interface CustomOfferConfig {
  enabled: boolean;
  /** Why checkout is off; null when enabled. Logged, never shown to buyers. */
  reason: CustomOfferDisabledReason | null;
  priceId: string;
  liveMode: boolean;
  automaticTax: boolean;
}

export function readCustomOfferConfig(env: EnvReader = denoEnv): CustomOfferConfig {
  const key = env("STRIPE_SECRET_KEY") ?? "";
  const priceId = env("STRIPE_PRICE_CUSTOM_ONE_TIME_50") ?? "";
  const liveMode = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  const automaticTax = env("CUSTOM_OFFER_AUTOMATIC_TAX") === "true";
  const base = { priceId, liveMode, automaticTax };
  if (env("CUSTOM_OFFER_CHECKOUT_ENABLED") !== "true") return { ...base, enabled: false, reason: "not_enabled" };
  if (!key) return { ...base, enabled: false, reason: "stripe_not_configured" };
  if (!priceId.startsWith("price_")) return { ...base, enabled: false, reason: "price_not_configured" };
  if (liveMode && env("CUSTOM_OFFER_LIVE_APPROVED") !== "true") {
    return { ...base, enabled: false, reason: "live_not_approved" };
  }
  return { ...base, enabled: true, reason: null };
}

export function isValidClaimToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/** SHA-256 hex of the token — the only form the database ever sees. */
export async function hashClaimToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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

/**
 * Null when the configured Stripe Price really is $50.00 USD, one-time and
 * active; otherwise why not. With automatic tax on, the price must be
 * tax-INCLUSIVE, or Stripe would add tax on top and the total would exceed $50.
 */
export function validateCustomOfferPrice(price: PriceLike | null | undefined, automaticTax: boolean): string | null {
  if (!price) return "price_missing";
  if (price.active !== true) return "price_inactive";
  if (price.type !== "one_time" || price.recurring) return "price_not_one_time";
  if (price.unit_amount !== CUSTOM_OFFER_TERMS.amount_cents) return "price_amount_mismatch";
  if ((price.currency ?? "").toLowerCase() !== CUSTOM_OFFER_TERMS.currency) return "price_currency_mismatch";
  if (automaticTax && price.tax_behavior !== "inclusive") return "price_not_tax_inclusive";
  return null;
}

/** The subset of a Checkout Session the webhook reads. */
export interface SessionLike {
  id: string;
  mode?: string | null;
  status?: string | null;
  url?: string | null;
  expires_at?: number | null;
  payment_status?: string | null;
  payment_intent?: string | { id: string } | null;
  customer?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
}

/** True for a Checkout Session this offer created (metadata is server-written). */
export function isCustomOfferSession(session: SessionLike | null | undefined): boolean {
  return !!session && session.mode === "payment" && session.metadata?.mogzy_offer === CUSTOM_OFFER_ID;
}

const ALLOWED_ORIGINS = [
  "https://mogzy.lol",
  "https://www.mogzy.lol",
  // dev / preview (same list as create-checkout, minus redirect-only legacy hosts)
  "https://mogsy.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

/** Stripe return URLs only ever point back at an allowlisted Mogzy origin. */
export function returnOrigin(requestOrigin: string | null | undefined): string {
  return requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "https://mogzy.lol";
}

export interface CheckoutParamsInput {
  priceId: string;
  userId: string;
  email: string;
  customerId: string | null;
  claimId: string;
  origin: string;
  automaticTax: boolean;
  nowMs: number;
}

/**
 * The complete Checkout Session request. Everything is server-derived: one
 * unit of the configured price, no promotion codes, no discounts, card only
 * (so "completed" means "paid" and no async-settlement window opens), and
 * metadata that only this server writes.
 */
export function buildCheckoutSessionParams(i: CheckoutParamsInput): Record<string, unknown> {
  const metadata = {
    supabase_user_id: i.userId,
    mogzy_offer: CUSTOM_OFFER_ID,
    custom_offer_claim_id: i.claimId,
  };
  return {
    mode: "payment",
    line_items: [{ price: i.priceId, quantity: 1 }],
    payment_method_types: ["card"],
    allow_promotion_codes: false,
    ...(i.customerId
      ? { customer: i.customerId }
      : { customer_email: i.email, customer_creation: "always" }),
    client_reference_id: i.userId,
    metadata,
    payment_intent_data: {
      metadata,
      description: "Mogzy Premium — 12 months, one-time payment (does not renew)",
    },
    ...(i.automaticTax ? { automatic_tax: { enabled: true } } : {}),
    expires_at: Math.floor(i.nowMs / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
    success_url: `${i.origin}${CLAIM_PATH}?checkout=success`,
    cancel_url: `${i.origin}${CLAIM_PATH}?checkout=canceled`,
  };
}

/** Claim states from SQL (`custom_offer_classify_claim`) plus this layer's own. */
export type ClaimState =
  | "available"
  | "checkout_open"
  | "already_paid"
  | "other_account"
  | "account_required"
  | "active_subscription"
  | "permanent_premium"
  | "unavailable"
  | "offer_disabled";

export const CLAIM_STATE_CODES: Record<Exclude<ClaimState, "available" | "checkout_open">, string> = {
  already_paid: "CLAIM_ALREADY_PAID",
  other_account: "CLAIM_OTHER_ACCOUNT",
  account_required: "ACCOUNT_REQUIRED",
  active_subscription: "ACTIVE_SUBSCRIPTION",
  permanent_premium: "PERMANENT_PREMIUM",
  unavailable: "CLAIM_UNAVAILABLE",
  offer_disabled: "OFFER_NOT_AVAILABLE",
};
