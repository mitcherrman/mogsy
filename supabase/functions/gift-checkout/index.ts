import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { privateGiftConfig, returnOrigin } from "../_shared/private-annual-gift.ts";
import { reconcileGiftPayment, type GiftRow } from "../_shared/gift-payment.ts";
import { handleGiftCheckoutRequest, type BuyerGiftRow } from "../_shared/gift-checkout.ts";
import { giftPaymentDeps, type AdminClientLike, type StripeLike } from "../_shared/gift-wiring.ts";

// PT1.7 — the private annual Premium gift ($50 total, 365 days, never renews).
//
// POST { action: "availability" }
// POST { action: "checkout", recipient_email, message? }
// POST { action: "status", gift_id }
//
// No price, amount, currency, quantity or coupon is read from the browser.
// Premium is NOT granted here, or anywhere at purchase: the recipient redeems
// it (redeem-gift) after Stripe has confirmed the payment.
//
// Fails closed: see ../_shared/private-annual-gift.ts. Unconfigured, the
// function answers { available: false } / OFFER_NOT_AVAILABLE and creates no
// Stripe session.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: userData } = authHeader.startsWith("Bearer ")
      ? await admin.auth.getUser(authHeader.slice("Bearer ".length))
      : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ available: false, error: "Sign in to buy a gift", code: "ACCOUNT_REQUIRED" }, 200);

    const body = await req.json().catch(() => ({}));
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-08-27.basil" });
    const paymentDeps = giftPaymentDeps(admin as unknown as AdminClientLike, stripe as unknown as StripeLike);

    const result = await handleGiftCheckoutRequest(
      {
        action: body?.action,
        recipientEmail: body?.recipient_email,
        message: body?.message,
        giftId: body?.gift_id,
        user: {
          id: user.id,
          email: user.email ?? null,
          emailConfirmed: !!user.email_confirmed_at,
          isAnonymous: user.is_anonymous === true,
        },
        origin: returnOrigin(req.headers.get("origin")),
      },
      {
        config: privateGiftConfig(),
        rpc: async (fn, args) => await admin.rpc(fn, args),
        getGift: async (id) => (await paymentDeps.getGiftById(id)) as BuyerGiftRow | null,
        reconcile: (gift) => reconcileGiftPayment(paymentDeps, gift as GiftRow),
        now: () => Date.now(),
        log: (message, detail) => console.warn(message, detail ?? {}),
        stripe: {
          retrievePrice: (id) => stripe.prices.retrieve(id),
          findCustomerIdByEmail: async (email) => {
            const found = await stripe.customers.list({ email, limit: 1 });
            return found.data[0]?.id ?? null;
          },
          createSession: (params) => stripe.checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams),
          retrieveSession: (id) => stripe.checkout.sessions.retrieve(id),
          expireSession: async (id) => { await stripe.checkout.sessions.expire(id); },
        },
      },
    );
    return json(result, 200);
  } catch (error) {
    console.error("gift-checkout error:", error);
    return json({ error: "An internal error occurred" }, 500);
  }
});
