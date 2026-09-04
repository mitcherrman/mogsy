// League-side Mogzy Premium checkout — reuses the existing create-checkout edge
// function (and its webhook → profiles.is_pro sync) without pulling in the
// dormant Shop UI.
//
// Pricing: League Premium launches at $4.99/mo on its OWN Stripe price. The
// old Shop envs (VITE_STRIPE_PRO_MONTHLY_PRICE_ID etc., $9.99/$83.99 live
// prices) are deliberately NOT used here — no fallback — so /lol/premium can
// never sell the old pricing by accident. Until
// VITE_STRIPE_LOL_PRO_MONTHLY_PRICE_ID is set, checkout is disabled and
// callers should show a coming-soon message.
//
// The exported `*_PRO_*` names and the `VITE_STRIPE_LOL_PRO_*` env var keep
// the old spelling on purpose: the env var is deployment configuration and
// the identifiers mirror `profiles.is_pro`, which is not being migrated.
// Only the user-facing wording and the route VALUES became Premium.
import { supabase } from "@/integrations/supabase/client";

export const STRIPE_LOL_PRO_MONTHLY_PRICE_ID: string =
  (import.meta.env.VITE_STRIPE_LOL_PRO_MONTHLY_PRICE_ID as string | undefined) || "";

export const LOL_PRO_MONTHLY_PRICE = 4.99;

export const LOL_PRO_SUCCESS_PATH = "/lol/premium?success=true";
export const LOL_PRO_CANCEL_PATH = "/lol/premium?canceled=true";

/** True when a League Premium Stripe price is configured and checkout can run. */
export function isLolProCheckoutAvailable(): boolean {
  return STRIPE_LOL_PRO_MONTHLY_PRICE_ID.startsWith("price_");
}

/**
 * Start a Stripe subscription checkout for League Mogzy Premium ($4.99/mo).
 * Returns the user to /lol/premium (success or canceled), not the old Shop.
 * Opens Stripe in a new tab with an in-tab fallback if popups are blocked;
 * throws on failure (including unconfigured price) so callers can toast.
 */
export async function startLolProCheckout(): Promise<void> {
  if (!isLolProCheckoutAvailable()) {
    throw new Error("Mogzy Premium checkout is coming soon.");
  }
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      priceId: STRIPE_LOL_PRO_MONTHLY_PRICE_ID,
      mode: "subscription",
      successPath: LOL_PRO_SUCCESS_PATH,
      cancelPath: LOL_PRO_CANCEL_PATH,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Checkout could not be started.");
  const win = window.open(data.url, "_blank", "noopener,noreferrer");
  if (!win || win.closed || typeof win.closed === "undefined") {
    // Popup blocked — fall back to in-tab navigation.
    window.location.href = data.url;
  }
}
