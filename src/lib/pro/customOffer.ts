// PT1.6b — the customer-specific one-time Premium offer, client half.
//
// The browser holds a claim TOKEN and nothing else. It never names a price, an
// amount, a currency or a duration: `custom-offer-checkout` resolves all of
// that server side, and Premium is activated only by stripe-webhook after
// Stripe confirms payment. These helpers only start things and read status.
//
// The token travels in the URL FRAGMENT (`/lol/premium/claim#mgy1_…`), which
// browsers never send to a server or put in a Referer, and is kept in
// sessionStorage so the buyer can return from Stripe (whose return URLs carry
// no token) to the same claim.
import { supabase } from "@/integrations/supabase/client";

export const CUSTOM_OFFER_CLAIM_PATH = "/lol/premium/claim";

/** Presentation copy of the server terms. Stripe and SQL are the authority. */
export const CUSTOM_OFFER_DISPLAY = {
  priceLabel: "$50",
  months: 12,
} as const;

const TOKEN_RE = /^mgy1_[0-9a-f]{48}$/;
const STORAGE_KEY = "mogzy:custom-offer-claim";

export function isClaimToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/** The link the owner hands to one customer. */
export function claimLink(origin: string, token: string): string {
  return `${origin}${CUSTOM_OFFER_CLAIM_PATH}#${token}`;
}

/** Token from the fragment (remembered for the Stripe round trip), else the remembered one. */
export function readClaimToken(hash: string): string | null {
  const fromHash = hash.replace(/^#/, "");
  if (isClaimToken(fromHash)) {
    try { sessionStorage.setItem(STORAGE_KEY, fromHash); } catch { /* storage unavailable */ }
    return fromHash;
  }
  try {
    const kept = sessionStorage.getItem(STORAGE_KEY);
    return isClaimToken(kept) ? kept : null;
  } catch {
    return null;
  }
}

export function forgetClaimToken(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

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

export interface ClaimStatus {
  state: ClaimState;
  claimExpiresAt: string | null;
  purchaseStatus: string | null;
  entitlementEndsAt: string | null;
}

const CODE_TO_STATE: Record<string, ClaimState> = {
  CLAIM_ALREADY_PAID: "already_paid",
  CLAIM_OTHER_ACCOUNT: "other_account",
  ACCOUNT_REQUIRED: "account_required",
  ACTIVE_SUBSCRIPTION: "active_subscription",
  PERMANENT_PREMIUM: "permanent_premium",
  CLAIM_UNAVAILABLE: "unavailable",
  OFFER_NOT_AVAILABLE: "offer_disabled",
};

/** Read-only: what this signed-in account can do with the claim. Null = unknown. */
export async function fetchClaimStatus(token: string): Promise<ClaimStatus | null> {
  const { data, error } = await supabase.functions.invoke("custom-offer-checkout", {
    body: { action: "status", token },
  });
  if (error || !data) return null;
  const state = (data.state as ClaimState | undefined) ?? CODE_TO_STATE[data.code as string];
  if (!state) return null;
  return {
    state,
    claimExpiresAt: data.claim_expires_at ?? null,
    purchaseStatus: data.purchase_status ?? null,
    entitlementEndsAt: data.entitlement_ends_at ?? null,
  };
}

/** Navigation seam (tests replace it; jsdom cannot stub window.location). */
export const browserNav = {
  assign: (url: string) => window.location.assign(url),
};

export class CustomOfferCheckoutError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

/** Start (or resume) the one Stripe Checkout for this claim, then go there. */
export async function startCustomOfferCheckout(token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("custom-offer-checkout", {
    body: { action: "checkout", token },
  });
  if (error) throw new CustomOfferCheckoutError("Checkout could not be started.", null);
  if (data?.error) throw new CustomOfferCheckoutError(String(data.error), data.code ?? null);
  if (typeof data?.url !== "string" || !data.url.startsWith("https://")) {
    throw new CustomOfferCheckoutError("Checkout could not be started.", null);
  }
  // Same tab: the claim page is the only place this flow returns to.
  browserNav.assign(data.url);
}

export interface OneTimePurchase {
  purchaseId: string;
  status: "paid" | "refunded" | "review";
  entitlementStartsAt: string | null;
  entitlementEndsAt: string | null;
  purchasedAt: string;
}

/** The signed-in account's own one-time purchases (self-scoped RPC). */
export async function fetchMyOneTimePurchases(): Promise<OneTimePurchase[] | null> {
  const { data, error } = await supabase.rpc("my_custom_offer_purchases");
  if (error || !Array.isArray(data)) return null;
  return data.map((r: Record<string, unknown>) => ({
    purchaseId: String(r.purchase_id),
    status: r.status as OneTimePurchase["status"],
    entitlementStartsAt: (r.entitlement_starts_at as string | null) ?? null,
    entitlementEndsAt: (r.entitlement_ends_at as string | null) ?? null,
    purchasedAt: String(r.purchased_at),
  }));
}

// ---- owner tooling ---------------------------------------------------------

export interface CustomOfferClaimRow {
  claim_id: string;
  note: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  for_user_id: string | null;
  customer_user_id: string | null;
  customer_display_name: string | null;
  claimed_at: string | null;
  checkout_attempts: number;
  purchase_status: string | null;
  review_reason: string | null;
  amount_cents: number | null;
  amount_refunded_cents: number | null;
  entitlement_starts_at: string | null;
  entitlement_ends_at: string | null;
}

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  unclaimed: "Not opened",
  claimed: "Claimed — not paid",
  checkout_open: "Checkout open",
  paid: "Paid — Premium active",
  review: "Needs review",
  refunded: "Refunded",
  revoked: "Revoked",
  expired: "Link expired",
};
