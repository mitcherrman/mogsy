// PT1.7 — Premium gifts, client half.
//
// The browser sends a recipient email and an optional message to buy, and a
// code to redeem. Nothing else: no price, amount, quantity or duration ever
// leaves it. Whether a payment is real, whether the recipient is the right
// person, and what Premium they get are decided by `gift-checkout`,
// `redeem-gift`, stripe-webhook and SQL (`gift_record_payment`, `gift_redeem`).
import { supabase } from "@/integrations/supabase/client";

export const GIFT_PAGE_PATH = "/lol/premium/gift";
export const GIFT_REDEEM_PATH = "/lol/premium/redeem";
export const GIFT_MESSAGE_MAX = 500;

/** Presentation copy of the server terms (SQL `private_gift_terms()` is the authority). */
export const GIFT_DISPLAY = { priceLabel: "$50", days: 365 } as const;

/** Navigation seam (tests replace it; jsdom cannot stub window.location). */
export const giftNav = {
  assign: (url: string) => window.location.assign(url),
};

/** The link a buyer sends: the code rides in the fragment, never to a server log. */
export function redeemLink(origin: string, code: string): string {
  return `${origin}${GIFT_REDEEM_PATH}#${code}`;
}

export function isValidGiftCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{6,32}$/.test(value.trim());
}

export interface GiftAvailability {
  available: boolean;
  emailVerified: boolean;
  /** PT1.7-T: the server is running the gift on Stripe TEST keys. */
  testMode?: boolean;
}

/** May the signed-in account buy the private gift? Unknown → not available. */
export async function fetchGiftAvailability(): Promise<GiftAvailability> {
  try {
    const { data, error } = await supabase.functions.invoke("gift-checkout", { body: { action: "availability" } });
    if (error || !data?.available) return { available: false, emailVerified: false };
    return { available: true, emailVerified: data.email_verified === true, testMode: data.test_mode === true };
  } catch {
    return { available: false, emailVerified: false };
  }
}

export class GiftError extends Error {
  constructor(message: string, readonly code: string | null, readonly giftId: string | null = null) {
    super(message);
  }
}

/** Start (or resume) the one Stripe Checkout for this gift, then go there. */
export async function startGiftCheckout(recipientEmail: string, message: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("gift-checkout", {
    body: { action: "checkout", recipient_email: recipientEmail, message },
  });
  if (error) throw new GiftError("Checkout could not be started.", null);
  if (data?.error) throw new GiftError(String(data.error), data.code ?? null, data.gift_id ?? null);
  if (typeof data?.url !== "string" || !data.url.startsWith("https://")) {
    throw new GiftError("Checkout could not be started.", null);
  }
  giftNav.assign(data.url);
}

export type GiftStatus = "pending" | "paid" | "redeemed" | "refunded" | "disputed" | "expired" | "invalid";

export interface BuyerGift {
  giftId: string;
  status: GiftStatus;
  recipientEmail: string | null;
  message: string | null;
  redeemCode: string | null;
  paidAt: string | null;
  redeemedAt: string | null;
  /** PT1.7-T: bought on Stripe test keys — no real money moved. */
  testMode?: boolean;
}

/** The buyer's own gift, re-checked against Stripe by the server. Null = unknown. */
export async function fetchBuyerGift(giftId: string): Promise<BuyerGift | null> {
  try {
    const { data, error } = await supabase.functions.invoke("gift-checkout", { body: { action: "status", gift_id: giftId } });
    if (error || !data || data.error) return null;
    return {
      giftId: data.gift_id,
      status: data.status,
      recipientEmail: data.recipient_email ?? null,
      message: data.message ?? null,
      redeemCode: data.redeem_code ?? null,
      paidAt: data.paid_at ?? null,
      redeemedAt: data.redeemed_at ?? null,
      testMode: data.test_mode === true,
    };
  } catch {
    return null;
  }
}

export interface ReceivedGift {
  giftId: string;
  redeemCode: string;
  giftType: string;
  message: string | null;
  from: string;
}

/** Paid gifts addressed to my VERIFIED email (server-scoped to the caller). */
export async function fetchReceivedGifts(): Promise<ReceivedGift[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke("redeem-gift", { body: { action: "list" } });
    if (error || !Array.isArray(data?.gifts)) return null;
    return data.gifts.map((g: Record<string, unknown>) => ({
      giftId: String(g.gift_id),
      redeemCode: String(g.redeem_code),
      giftType: String(g.gift_type),
      message: (g.message as string | null) ?? null,
      from: String(g.from ?? "A friend"),
    }));
  } catch {
    return null;
  }
}

export interface RedeemResult {
  success: boolean;
  reason: string | null;
  message: string | null;
  giftType: string | null;
  premiumDays: number | null;
  grantEndsAt: string | null;
}

export async function redeemGift(code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.functions.invoke("redeem-gift", {
    body: { action: "redeem", code: code.trim() },
  });
  if (error || !data) {
    return { success: false, reason: "network", message: "The gift couldn't be redeemed right now. Try again.", giftType: null, premiumDays: null, grantEndsAt: null };
  }
  return {
    success: data.success === true,
    reason: data.reason ?? null,
    message: data.error ?? null,
    giftType: data.gift_type ?? null,
    premiumDays: data.premium_days ?? null,
    grantEndsAt: data.grant_ends_at ?? null,
  };
}
