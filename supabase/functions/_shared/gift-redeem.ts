// PT1.7 — recipient-side gift handling, every side effect injected.
//
//   redeem  Re-read the payment from Stripe, then `gift_redeem` — ONE SQL
//           transaction that checks payment, the verified recipient email and
//           single use, and grants Premium together with consuming the gift.
//   list    Paid gifts addressed to the caller's VERIFIED email address.
//
// The Edge Function passes the caller's id from a verified session; whether the
// email is verified, and whether it matches, is decided by SQL from auth.users.
import type { GiftRow, Rpc } from "./gift-payment.ts";

export interface GiftRedeemDeps {
  rpc: Rpc;
  getGiftByCode(code: string): Promise<GiftRow | null>;
  /** Re-read Stripe and record (gift-payment.ts reconcileGiftPayment). */
  reconcile(gift: GiftRow): Promise<unknown>;
  /** Best-effort bookkeeping after a successful redemption (admin visibility). */
  afterRedeem?(result: Record<string, unknown>): Promise<void>;
  log: (message: string, detail?: Record<string, unknown>) => void;
}

export interface GiftRecipient {
  id: string;
  isAnonymous: boolean;
}

export interface GiftRedeemRequest {
  action: unknown;
  code?: unknown;
  user: GiftRecipient;
}

const CODE_RE = /^[A-Z0-9]{6,32}$/;

export const REDEEM_MESSAGES: Record<string, string> = {
  invalid_code: "That gift code isn't valid.",
  account_required: "Sign in with a full Mogzy account to redeem a gift.",
  email_unverified: "Verify your email address, then redeem the gift.",
  recipient_mismatch: "This gift was sent to a different email address. Sign in with the account for that address.",
  already_redeemed: "This gift has already been redeemed.",
  not_paid: "This gift's payment hasn't been confirmed yet. Try again shortly.",
  payment_on_hold: "This gift's payment is under review, so it can't be redeemed right now.",
  unavailable: "This gift is no longer available.",
  already_permanent: "Your account already has Premium that never expires, so the gift was kept for later.",
  no_profile: "Finish setting up your Mogzy profile, then redeem the gift.",
  payment_check_unavailable: "We couldn't confirm the gift's payment right now. Please try again in a minute.",
};

export async function handleGiftRedeemRequest(
  req: GiftRedeemRequest,
  deps: GiftRedeemDeps,
): Promise<Record<string, unknown>> {
  if (req.user.isAnonymous) {
    return { success: false, reason: "account_required", error: REDEEM_MESSAGES.account_required };
  }

  if (req.action === "list") {
    const { data, error } = await deps.rpc("gift_list_for_recipient", { _user_id: req.user.id });
    if (error) throw new Error(`gift_list_for_recipient failed: ${error.message ?? "unknown"}`);
    return { gifts: Array.isArray(data) ? data : [] };
  }

  if (req.action !== "redeem" && req.action !== undefined) {
    return { success: false, reason: "invalid_code", error: REDEEM_MESSAGES.invalid_code };
  }
  const code = typeof req.code === "string" ? req.code.trim().toUpperCase() : "";
  if (!CODE_RE.test(code)) return { success: false, reason: "invalid_code", error: REDEEM_MESSAGES.invalid_code };

  // Payment is re-read from Stripe at redemption: a refund or dispute that the
  // webhook has not delivered yet still stops the grant. Fail closed.
  const gift = await deps.getGiftByCode(code);
  if (gift?.stripe_session_id && ["pending", "paid", "disputed"].includes(gift.status)) {
    try {
      await deps.reconcile(gift);
    } catch (e) {
      deps.log("gift redeem: payment re-check failed", { gift: gift.id, error: String(e) });
      return { success: false, reason: "payment_check_unavailable", error: REDEEM_MESSAGES.payment_check_unavailable };
    }
  }

  const { data, error } = await deps.rpc("gift_redeem", { _code: code, _user_id: req.user.id });
  if (error) throw new Error(`gift_redeem failed: ${error.message ?? "unknown"}`);
  const r = data as Record<string, unknown> & { success: boolean; reason?: string };
  if (!r.success) {
    const reason = r.reason ?? "unavailable";
    return { success: false, reason, error: REDEEM_MESSAGES[reason] ?? REDEEM_MESSAGES.unavailable };
  }
  if (deps.afterRedeem) {
    try { await deps.afterRedeem(r); } catch (e) { deps.log("gift redeem: bookkeeping failed", { error: String(e) }); }
  }
  return {
    success: true,
    gift_type: r.gift_type,
    diamond_amount: r.diamond_amount,
    premium_days: r.premium_days ?? null,
    grant_ends_at: r.grant_ends_at ?? null,
  };
}
