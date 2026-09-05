// PT1.5 — Mogzy Premium commercial offers, client side.
//
// ONE PRODUCT, MANY OFFERS. Every offer here grants the SAME Mogzy Premium
// entitlement. They differ only in what a customer pays and how they were
// acquired. There is no Standard/Launch/Founder feature tier, and nothing in
// the app may branch on an offer id to decide access — that is PT1.4's job
// (`@/lib/pro/entitlement`), enforced by the backend on every gate.
//
// THIS FILE HOLDS NO STRIPE PRICE IDs, deliberately. The client asks to buy an
// OFFER; `supabase/functions/_shared/offer-catalog.ts` is the only place that
// maps an offer to a Stripe Price, so a tampered client can ask for
// "launch_annual" but cannot manufacture a cheaper or privileged price. The
// amounts below are presentation only; Stripe is the charging authority, and
// `supabase/functions/_shared/offer-catalog.test.ts` asserts the two catalogs
// describe the same five offers with the same intervals and amounts.
//
// PURE DATA ONLY. Everything that talks to Supabase — starting a checkout,
// reading the pricing mode — lives in `@/lib/pro/checkout`, so importing the
// catalog never constructs a client.

export type MogzyOfferId =
  | "standard_monthly"
  | "standard_annual"
  | "launch_monthly"
  | "launch_annual"
  | "founding_playtester";

export type OfferFamily = "standard" | "launch" | "founding";
export type BillingInterval = "month" | "year";

/** Which price list the site may sell right now. */
export type PricingMode = "standard" | "launch";

export interface OfferPresentation {
  id: MogzyOfferId;
  family: OfferFamily;
  interval: BillingInterval;
  /** Display amount in cents. */
  priceCents: number;
  /** Short name for buttons and plan rows. */
  name: string;
  /**
   * `public` offers may be rendered on the open site. `private` offers are
   * never listed — they are reached by a private sales link and additionally
   * require a server-verified access code at checkout.
   */
  visibility: "public" | "private";
}

export const PRO_OFFERS: Record<MogzyOfferId, OfferPresentation> = {
  standard_monthly: {
    id: "standard_monthly", family: "standard", interval: "month",
    priceCents: 999, name: "Monthly", visibility: "public",
  },
  standard_annual: {
    id: "standard_annual", family: "standard", interval: "year",
    priceCents: 9999, name: "Yearly", visibility: "public",
  },
  launch_monthly: {
    id: "launch_monthly", family: "launch", interval: "month",
    priceCents: 799, name: "Monthly", visibility: "public",
  },
  launch_annual: {
    id: "launch_annual", family: "launch", interval: "year",
    priceCents: 7999, name: "Yearly", visibility: "public",
  },
  // Private. Never rendered on the open site; the server additionally requires
  // an access code, so listing it here cannot expose it.
  founding_playtester: {
    id: "founding_playtester", family: "founding", interval: "year",
    priceCents: 3999, name: "Founding Playtester", visibility: "private",
  },
};

/** The standard (undiscounted) price list — what an offer is a discount FROM. */
export const STANDARD_OFFERS: Record<BillingInterval, OfferPresentation> = {
  month: PRO_OFFERS.standard_monthly,
  year: PRO_OFFERS.standard_annual,
};

/**
 * What may be offered when the server cannot be asked whether an offer is
 * sellable — the probe failed, or `create-checkout` is mid-deploy.
 *
 * EMPTY, and that is the whole answer. It was `["standard_monthly"]` while the
 * server catalog carried a hardcoded price for that offer, so it really was
 * purchasable with no configuration. That fallback was a SANDBOX Stripe id and
 * was removed on 2026-09-05: every offer is now env-only, so with no server
 * answer there is nothing we can honestly claim is buyable.
 *
 * The cost is real and accepted: if the probe fails while prices ARE
 * configured, the page offers no purchase until it recovers. That is the right
 * side to be wrong on — a buyer who has to come back beats a buyer who presses
 * Buy on a plan we cannot charge.
 */
export const OFFERS_SELLABLE_WITHOUT_CONFIG: readonly MogzyOfferId[] = [] as const;

/** Format cents the way Mogzy prices read: $9.99, $99.99. */
export function formatOfferPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The offer to sell for a billing interval under the current pricing mode.
 * Launch mode swaps in the launch price for the SAME product — a discount off
 * the standard price, never a different Pro.
 */
export function offerForInterval(interval: BillingInterval, mode: PricingMode): OfferPresentation {
  if (mode === "launch") {
    return interval === "year" ? PRO_OFFERS.launch_annual : PRO_OFFERS.launch_monthly;
  }
  return STANDARD_OFFERS[interval];
}

/** Percentage saved by an annual offer against the same family's monthly price. */
export function annualSavingsPct(mode: PricingMode): number {
  const monthly = offerForInterval("month", mode).priceCents;
  const annual = offerForInterval("year", mode).priceCents;
  return Math.round((1 - annual / (monthly * 12)) * 100);
}

/** Turn a create-checkout refusal into something a buyer can act on. */
export function describeCheckoutError(payload: { code?: string; error?: string } | null): string {
  switch (payload?.code) {
    case "OFFER_NOT_AVAILABLE":
      // One message for every "nothing to sell" case — unconfigured price,
      // wrong pricing mode, or a private offer that stayed locked.
      return "This plan isn’t available yet — check back shortly.";
    case "UNKNOWN_OFFER":
    case "OFFER_REQUIRED":
      return "That plan could not be found.";
    default:
      return payload?.error || "Checkout could not be started.";
  }
}
