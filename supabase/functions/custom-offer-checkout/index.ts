import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { readCustomOfferConfig, returnOrigin } from "../_shared/custom-offer.ts";
import { handleCustomOfferRequest } from "../_shared/custom-offer-checkout.ts";

// PT1.6b — the private, customer-specific one-time Premium offer.
//
// POST { action: "status" | "checkout", token }
//
// The body carries a claim token and nothing else that is read: no price,
// amount, currency, quantity, coupon or return URL is accepted from the
// browser. All decisions live in ../_shared/custom-offer-checkout.ts (unit
// tested) and in the PT1.6b SQL; this file only wires real clients.
//
// Entitlement is NOT granted here. A completed checkout is only a request to
// pay; Premium is activated by stripe-webhook once Stripe confirms payment.
//
// Fails closed: unless CUSTOM_OFFER_CHECKOUT_ENABLED=true and
// STRIPE_PRICE_CUSTOM_ONE_TIME_50 names a $50.00 one-time USD price (and, for a
// live key, CUSTOM_OFFER_LIVE_APPROVED=true), checkout answers
// OFFER_NOT_AVAILABLE and no Stripe session is created.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Sign in to use this offer", code: "ACCOUNT_REQUIRED" }, 200);
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: userData } = await admin.auth.getUser(authHeader.slice("Bearer ".length));
    const user = userData?.user;
    if (!user) return json({ error: "Sign in to use this offer", code: "ACCOUNT_REQUIRED" }, 200);

    const body = await req.json().catch(() => ({}));
    const config = readCustomOfferConfig();
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-08-27.basil" });

    const result = await handleCustomOfferRequest(
      {
        action: body?.action,
        token: body?.token,
        user: { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous === true },
        origin: returnOrigin(req.headers.get("origin")),
      },
      {
        config,
        rpc: (fn, args) => admin.rpc(fn, args),
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
    console.error("custom-offer-checkout error:", error);
    return json({ error: "An internal error occurred" }, 500);
  }
});
