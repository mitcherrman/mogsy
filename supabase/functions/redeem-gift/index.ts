import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { handleGiftRedeemRequest } from "../_shared/gift-redeem.ts";
import { testStripeKey } from "../_shared/private-annual-gift.ts";
import { giftByCode, giftLanes, type AdminClientLike, type StripeLike } from "../_shared/gift-wiring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * redeem-gift — a signed-in recipient claims a gift (PT1.7).
 *
 *   POST { code }                    redeem (also { action: "redeem", code })
 *   POST { action: "list" }          paid gifts addressed to my verified email
 *
 * PT1.7 replaced the old two-step flow (redeem_gift_code consumed the gift in
 * SQL, then this function granted Premium from a stale JS read — a failure in
 * between lost a paid gift, and any account holding the code could redeem).
 * Now: the payment is re-read from Stripe, then public.gift_redeem does
 * everything in ONE transaction — payment state, the verified recipient email,
 * single use, and the Premium grant (pro_grant_kind 'gift', a real expiry of
 * 365 / 30 days, stacked after any still-valid grant) or the diamonds credit.
 * This function writes no profile column itself, and never is_pro, which is
 * Stripe-derived (PT1.4).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return reply({ error: "Not authenticated" }, 401);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: userData } = await admin.auth.getUser(authHeader.slice("Bearer ".length));
    const user = userData?.user;
    if (!user) return reply({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-08-27.basil" });
    const testKey = testStripeKey();
    // PT1.7-T: each gift is re-read with the key of its own Stripe mode; a test
    // gift with no test key configured fails closed (payment_check_unavailable).
    const lanes = giftLanes(
      admin as unknown as AdminClientLike,
      stripe as unknown as StripeLike,
      (testKey ? new Stripe(testKey, { apiVersion: "2025-08-27.basil" }) : null) as unknown as StripeLike | null,
    );

    const result = await handleGiftRedeemRequest(
      { action: body?.action, code: body?.code, user: { id: user.id, isAnonymous: user.is_anonymous === true } },
      {
        rpc: async (fn, args) => await admin.rpc(fn, args),
        getGiftByCode: (code) => giftByCode(admin as unknown as AdminClientLike, code),
        reconcile: (gift) => lanes.reconcile(gift),
        log: (message, detail) => console.warn(message, detail ?? {}),
        // Kept from the pre-PT1.7 flow: a purchases row lets admins see the
        // gifted period. Bookkeeping only — the grant is already committed.
        afterRedeem: async (r) => {
          if (r.gift_type !== "pro_annual" && r.gift_type !== "pro_monthly") return;
          await admin.from("purchases").insert({
            profile_id: r.profile_id,
            item_type: `gift_${r.gift_type}_${r.premium_days}d`,
            amount_cents: 0,
          });
        },
      },
    );
    return reply(result);
  } catch (e) {
    console.error("redeem-gift", e);
    return reply({ error: "Internal error" }, 500);
  }
});
