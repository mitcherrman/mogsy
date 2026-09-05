// Mogzy Premium checkout — the network half of the offer contract.
//
// PT1.5: no price lives here. The browser asks to buy an OFFER ID and the
// server (supabase/functions/_shared/offer-catalog.ts) resolves it to a Stripe
// Price, so no subscription Price ID, coupon or founder claim ships in the
// bundle. The offer *data* is in `@/lib/pro/offers`, which stays free of any
// Supabase import.
//
// /lol/premium and /shop sell the SAME Mogzy Premium through the SAME offers,
// so there is one product at one set of prices whichever surface a buyer
// arrives on. The pre-PT1.5 $4.99/mo "League Pro" price is retired: it was
// never in the approved commercial structure and its Stripe price was never
// configured, so that path has never taken a payment.
//
// Naming: the exported `*_PRO_*` identifiers keep the old spelling on purpose —
// they mirror persisted column and enum names that are not being migrated. Only
// user-facing wording and route VALUES are Premium. Full table:
// docs/naming-premium-vs-pro-play.md.
//
// This module deliberately mentions no entitlement column: entitlement is
// PT1.4's (`@/lib/pro/entitlement`), and checkout only starts a purchase.
import { supabase } from "@/integrations/supabase/client";
import {
  describeCheckoutError,
  formatOfferPrice,
  offerForInterval,
  type BillingInterval,
  type MogzyOfferId,
  type OfferPresentation,
  type PricingMode,
} from "@/lib/pro/offers";

export const LOL_PRO_SUCCESS_PATH = "/lol/premium?success=true";
export const LOL_PRO_CANCEL_PATH = "/lol/premium?canceled=true";

export { formatOfferPrice, offerForInterval };
export type { BillingInterval, OfferPresentation, PricingMode };

/**
 * Read the site's current pricing mode from `app_settings.pro_pricing`.
 *
 * The same row is authority for `create-checkout`, so display and checkout can
 * never disagree about whether launch pricing is live. Anything unreadable or
 * unrecognised falls back to `standard` — full price, never an accidental
 * discount.
 */
export async function fetchPricingMode(): Promise<PricingMode> {
  try {
    const { data } = await supabase
      .from("app_settings").select("value").eq("key", "pro_pricing").maybeSingle();
    const mode = (data?.value as { mode?: unknown } | null)?.mode;
    return mode === "launch" ? "launch" : "standard";
  } catch {
    return "standard";
  }
}

/**
 * What the site can actually sell right now, answered by the server.
 *
 * `available` is null when the answer is UNKNOWN — the function is not
 * deployed, the network failed, the shape was unexpected. Callers must treat
 * unknown as "let the buyer try": the server is still the authority and
 * refuses honestly, whereas a disabled button on an unknown answer would hide
 * a working checkout. `mode` falls back to `standard` (full price) the same way
 * `fetchPricingMode` does — never an accidental discount.
 */
export interface OfferAvailability {
  mode: PricingMode;
  available: MogzyOfferId[] | null;
}

/**
 * Ask create-checkout which public offers are purchasable right now.
 *
 * Returns pricing mode too, so a page needs one round trip rather than two.
 * The response carries no Stripe Price ID and never mentions private offers —
 * see the probe's comment in supabase/functions/create-checkout/index.ts.
 */
export async function fetchOfferAvailability(): Promise<OfferAvailability> {
  try {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { action: "offer_availability" },
    });
    if (error || !data) return { mode: await fetchPricingMode(), available: null };
    const mode: PricingMode = data.mode === "launch" ? "launch" : "standard";
    return {
      mode,
      available: Array.isArray(data.available) ? (data.available as MogzyOfferId[]) : null,
    };
  } catch {
    return { mode: "standard", available: null };
  }
}

/**
 * Is this offer purchasable, as far as the site currently knows?
 * Unknown (`available === null`) reads as purchasable — see OfferAvailability.
 */
export function isOfferPurchasable(
  offerId: MogzyOfferId,
  availability: OfferAvailability
): boolean {
  return availability.available === null || availability.available.includes(offerId);
}

export interface StartCheckoutOptions {
  /** Where Stripe returns the buyer. Internal paths only; the server re-checks. */
  successPath?: string;
  cancelPath?: string;
  /** Access code for a private offer. Verified server-side against a secret. */
  offerAccessCode?: string;
}

/**
 * Start a Stripe Checkout session for a Mogzy Premium offer.
 *
 * Sends the OFFER ID only. No Stripe Price ID, no coupon and no founder claim
 * leaves the browser: the server resolves the price, decides any discount, and
 * verifies eligibility. Throws with a readable message so callers can toast.
 */
export async function startProCheckout(
  offerId: MogzyOfferId,
  options: StartCheckoutOptions = {}
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      offer: offerId,
      ...(options.offerAccessCode ? { offerAccessCode: options.offerAccessCode } : {}),
      ...(options.successPath ? { successPath: options.successPath } : {}),
      ...(options.cancelPath ? { cancelPath: options.cancelPath } : {}),
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(describeCheckoutError(data));
  if (!data?.url) throw new Error("Checkout could not be started.");
  const win = window.open(data.url, "_blank", "noopener,noreferrer");
  if (!win || win.closed || typeof win.closed === "undefined") {
    // Popup blocked — fall back to in-tab navigation.
    window.location.href = data.url;
  }
}

/**
 * Start a checkout from /lol/premium, returning the buyer to that page rather
 * than the old Shop. Throws on failure so callers can toast.
 */
export async function startLolProCheckout(
  interval: BillingInterval,
  mode: PricingMode
): Promise<void> {
  await startProCheckout(offerForInterval(interval, mode).id, {
    successPath: LOL_PRO_SUCCESS_PATH,
    cancelPath: LOL_PRO_CANCEL_PATH,
  });
}
