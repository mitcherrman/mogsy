// PT1.5 — Server-owned catalog of purchasable Mogzy Premium commercial offers.
//
// AUTHORITY
// ---------
// This module is the ONLY place that maps a Mogzy offer to a Stripe Price.
// `create-checkout` accepts an OFFER ID from the client and resolves it here;
// it never accepts a client-supplied subscription Price ID. A browser can
// therefore ask to buy "launch_annual" but cannot ask to buy an arbitrary,
// cheaper or privileged Stripe price.
//
// ONE PRODUCT, MANY OFFERS
// ------------------------
// Every offer below grants the SAME Mogzy Premium entitlement. Offers differ only
// in what a customer pays and how they were acquired. There is no
// "Standard Pro" / "Launch Pro" / "Founder Pro" feature tier, and nothing in
// the product may branch on the offer id to decide access. Entitlement is
// PT1.4's business: `profiles.is_pro` (Stripe-derived) OR a valid
// `profiles.pro_grant_*`, composed by `public.pro_entitlement_is_effective`.
//
// STABLE IDENTITY
// ---------------
// The offer id is the durable business meaning; the Stripe Price ID is an
// implementation identifier that may be replaced (a new price, a new currency,
// a re-created product) without changing what the offer *is*. Never use a
// display string like "$7.99" as an identity, and never persist a Price ID as
// though it were the offer.
//
// CONFIGURATION
// -------------
// Price and coupon IDs come from edge-function secrets so each environment
// (live / test) points at its own Stripe objects. EVERY offer is env-only and
// FAILS CLOSED — an unconfigured offer is not purchasable. That is what keeps
// the private Founding Playtester offer off the public site until its terms are
// approved, and it is also what stops a sandbox object from ever being sold
// against the live account (see the note above `buildOfferCatalog`).

export type MogzyOfferId =
  | "standard_monthly"
  | "standard_annual"
  | "launch_monthly"
  | "launch_annual"
  | "founding_playtester";

/** Which pricing set an offer belongs to. Not a feature tier — a price list. */
export type OfferFamily = "standard" | "launch" | "founding";

export type BillingInterval = "month" | "year";

export interface OfferDefinition {
  id: MogzyOfferId;
  family: OfferFamily;
  interval: BillingInterval;
  /** Stripe Price ID, or "" when this offer is not configured (= not sellable). */
  priceId: string;
  /**
   * Stripe Coupon applied at checkout, or "" for none. Used by the Founding
   * Playtester offer to discount the FIRST period only; the subscription still
   * carries the underlying annual Price, so renewal is that Price's amount.
   */
  couponId: string;
  /** Free-trial days on the created subscription. */
  trialDays: number;
  /**
   * `public` offers may be listed and bought from the open site.
   * `private` offers require a server-verified access code (see
   * `foundingAccessCodeMatches`) and are never rendered publicly.
   */
  visibility: "public" | "private";
  /** Display amount in cents. Presentation only — Stripe is the charging authority. */
  listPriceCents: number;
  /** Human label for logs and admin tooling. Never trusted as identity. */
  label: string;
}

/** All offer ids, in presentation order. */
export const MOGZY_OFFER_IDS: readonly MogzyOfferId[] = [
  "standard_monthly",
  "standard_annual",
  "launch_monthly",
  "launch_annual",
  "founding_playtester",
] as const;

function env(name: string, fallback = ""): string {
  // deno-lint-ignore no-explicit-any
  const v = (globalThis as any).Deno?.env?.get?.(name);
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

// NO PRICE ID IS HARDCODED IN THIS FILE, AND NONE MAY BE ADDED.
//
// PT1.5 originally carried one: `price_1T3Ua6D9NqEQUIGhfXFmV6V6` as a fallback
// for `standard_monthly`, on the belief that it was the live $9.99/month price
// and that keeping it meant a PT1.5 deploy could not break the one offer that
// already worked. Stripe discovery on 2026-09-05 showed that belief was wrong:
// that id, the $83.99/year id, the win-back coupon `sCkrnnuL` and the whole
// legacy subscription catalog live in a Stripe SANDBOX. The connected LIVE
// account (Bearsummarizer, acct_1RvibQReFlQCqkjO) has an EMPTY catalog.
//
// A sandbox id sent to the live account does not degrade gracefully — it is
// simply not a price that account owns. Worse, the fallback made the offer
// report as CONFIGURED, so `isOfferConfigured()` said true and the availability
// probe listed `standard_monthly` as sellable. The page would have offered a
// live Buy button for a price that cannot be charged.
//
// Every offer is now env-only and fails closed. An offer is sellable only when
// a trusted production secret names a real Price in the LIVE account.

export function buildOfferCatalog(): Map<MogzyOfferId, OfferDefinition> {
  const defs: OfferDefinition[] = [
    {
      id: "standard_monthly",
      family: "standard",
      interval: "month",
      priceId: env("STRIPE_PRICE_STANDARD_MONTHLY"),
      couponId: "",
      trialDays: 7,
      visibility: "public",
      listPriceCents: 999,
      label: "Mogzy Premium — Monthly",
    },
    {
      id: "standard_annual",
      family: "standard",
      interval: "year",
      priceId: env("STRIPE_PRICE_STANDARD_ANNUAL"),
      couponId: "",
      trialDays: 7,
      visibility: "public",
      listPriceCents: 9999,
      label: "Mogzy Premium — Annual",
    },
    {
      id: "launch_monthly",
      family: "launch",
      interval: "month",
      priceId: env("STRIPE_PRICE_LAUNCH_MONTHLY"),
      couponId: "",
      trialDays: 7,
      visibility: "public",
      listPriceCents: 799,
      label: "Mogzy Premium — Monthly (launch offer)",
    },
    {
      id: "launch_annual",
      family: "launch",
      interval: "year",
      priceId: env("STRIPE_PRICE_LAUNCH_ANNUAL"),
      couponId: "",
      trialDays: 7,
      visibility: "public",
      listPriceCents: 7999,
      label: "Mogzy Premium — Annual (launch offer)",
    },
    {
      // ------------------------------------------------------------------
      // OWNER DECISION OUTSTANDING — DO NOT CONFIGURE UNTIL RESOLVED.
      //
      // Approved: "$39.99 first year". What it renews at afterwards has NOT
      // been approved, and this code deliberately does not assume one.
      //
      // The mechanism implemented here is: an ANNUAL Stripe Price plus a
      // `duration: once` Stripe Coupon that discounts the first invoice to
      // $39.99. The subscription then carries that annual Price, so the
      // renewal amount is simply that Price's amount, locked to the Price
      // object the customer was sold on — no schedule, no migration job, and
      // no lifetime promise. Which annual Price it sits on IS the open
      // decision (see docs/PT1_MONETIZATION_HANDOFF.md §PT1.5).
      //
      // Both env vars are unset, so this offer is UNPURCHASABLE today.
      // ------------------------------------------------------------------
      id: "founding_playtester",
      family: "founding",
      interval: "year",
      priceId: env("STRIPE_PRICE_FOUNDING_PLAYTESTER"),
      couponId: env("STRIPE_COUPON_FOUNDING_PLAYTESTER"),
      trialDays: 0,
      visibility: "private",
      listPriceCents: 3999,
      label: "Mogzy Premium — Founding Playtester (first year)",
    },
  ];
  return new Map(defs.map((d) => [d.id, d]));
}

let cached: Map<MogzyOfferId, OfferDefinition> | null = null;
function catalog(): Map<MogzyOfferId, OfferDefinition> {
  if (!cached) cached = buildOfferCatalog();
  return cached;
}

/** True for a string that is one of the five approved offer ids. */
export function isMogzyOfferId(value: unknown): value is MogzyOfferId {
  return typeof value === "string" && (MOGZY_OFFER_IDS as readonly string[]).includes(value);
}

/**
 * Look an offer up by id. Returns null for anything that is not one of the
 * five approved ids — callers MUST treat null as a hard rejection and never
 * fall back to a client-supplied Price ID.
 */
export function getOffer(id: unknown): OfferDefinition | null {
  if (!isMogzyOfferId(id)) return null;
  return catalog().get(id) ?? null;
}

/** An offer is sellable only once a real Stripe Price is configured for it. */
export function isOfferConfigured(offer: OfferDefinition | null): boolean {
  return !!offer && offer.priceId.startsWith("price_");
}

/** Pricing mode decides which price family the site may sell right now. */
export type PricingMode = "standard" | "launch";

/** Coerce an app_settings value into a pricing mode, defaulting to full price. */
export function readPricingMode(value: unknown): PricingMode {
  const mode = (value as { mode?: unknown } | null)?.mode;
  return mode === "launch" ? "launch" : "standard";
}

/**
 * Whether an offer may be sold under the current pricing mode.
 *
 * Launch prices are only sellable while the site is in launch mode, so a
 * client cannot keep buying the discount by replaying `launch_annual` after
 * the launch window closes. `founding_playtester` is never sellable on this
 * path — it needs an access code as well (see `foundingAccessCodeMatches`).
 */
export function offerAllowedInMode(offer: OfferDefinition, mode: PricingMode): boolean {
  if (offer.family === "founding") return true; // gated by access code instead
  return offer.family === "launch" ? mode === "launch" : true;
}

/**
 * Constant-time-ish comparison of a caller-supplied Founding Playtester access
 * code against the server secret `MOGZY_FOUNDING_ACCESS_CODE`.
 *
 * The secret lives in an edge-function env var and NOT in `app_settings`,
 * which is world-readable (`FOR SELECT USING (true)`). With no secret set,
 * this always returns false, so the private offer cannot be reached at all.
 * A client can present a code; it can never assert founder identity itself.
 */
export function foundingAccessCodeMatches(supplied: unknown): boolean {
  const secret = env("MOGZY_FOUNDING_ACCESS_CODE");
  if (!secret) return false;
  if (typeof supplied !== "string" || supplied.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ supplied.charCodeAt(i);
  return diff === 0;
}

/**
 * The win-back coupon. Server-selected only — never accepted from a client.
 *
 * No fallback, for the same reason as the prices: the historical `sCkrnnuL`
 * coupon is a SANDBOX object and does not exist in the live account. Unset
 * means no win-back discount is applied, which is a correct and safe outcome —
 * the lapsed customer simply pays list price. `create-checkout` only applies a
 * coupon when this returns a non-empty string.
 */
export function winbackCouponId(): string {
  return env("STRIPE_COUPON_WINBACK");
}

/** Test hook: swap or reset the cached catalog. */
export function __setOfferCatalogForTests(defs: OfferDefinition[] | null): void {
  if (defs === null) { cached = null; return; }
  cached = new Map(defs.map((d) => [d.id, d]));
}
