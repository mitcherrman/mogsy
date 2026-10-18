import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { reconcileGiftPayment } from "../_shared/gift-payment.ts";
import { giftByCode, giftPaymentDeps, type AdminClientLike, type StripeLike } from "../_shared/gift-wiring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * verify-gift: the SENDER checks a gift by redeem code after checkout.
 *
 * Contract unchanged: { code } → { status, redeem_code, recipient_email, gift_type }.
 *
 * PT1.7: this no longer flips a gift to 'paid' on `payment_status` alone. It
 * re-reads the Checkout Session, PaymentIntent, charge and any dispute from
 * Stripe and records the result through public.gift_record_payment — the same
 * path stripe-webhook uses — which checks the catalog price, quantity,
 * refunds, disputes and (for the private gift) the exact $50.00 USD total.
 * It never grants anything: a gift becomes Premium only when redeemed.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

  try {
    // Require authentication so we never leak gift PII to anonymous callers.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const callerUserId = userData?.user?.id;
    if (!callerUserId) return reply({ error: "Unauthorized" }, 401);

    const { code } = await req.json().catch(() => ({}));
    if (!code || typeof code !== "string") return reply({ error: "Missing code" }, 400);

    const lookup = admin as unknown as AdminClientLike;
    let gift = await giftByCode(lookup, code.trim().toUpperCase());
    // Only the sender of this gift may inspect it.
    if (!gift || gift.sender_user_id !== callerUserId) return reply({ error: "Gift not found" }, 404);

    if (gift.stripe_session_id && (gift.status === "pending" || gift.status === "disputed")) {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
      await reconcileGiftPayment(giftPaymentDeps(lookup, stripe as unknown as StripeLike), gift);
      gift = (await giftByCode(lookup, code.trim().toUpperCase())) ?? gift;
    }

    const usable = gift.status === "paid" || gift.status === "redeemed";
    return reply({
      status: gift.status,
      gift_type: gift.gift_type,
      ...(usable
        ? { redeem_code: (gift as { redeem_code?: string }).redeem_code, recipient_email: gift.recipient_email }
        : {}),
    });
  } catch (e) {
    console.error("verify-gift", e);
    return reply({ error: "Internal error" }, 500);
  }
});
