import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const user = userData.user;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    // Also check trialing subscriptions
    const trialingSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
      limit: 1,
    });

    const allSubs = [...subscriptions.data, ...trialingSubs.data];
    const hasActiveSub = allSubs.length > 0;
    let subscriptionEnd = null;
    let isTrial = false;
    let interval: string | null = null;

    // Win-back signal: had subs in the past but none active right now
    let wasCustomer = false;
    if (!hasActiveSub) {
      const past = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
      wasCustomer = past.data.length > 0;
    }

    if (hasActiveSub) {
      const sub = allSubs[0];
      subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
      isTrial = sub.status === "trialing";
      interval = sub.items.data[0]?.price?.recurring?.interval ?? null;
    }

    // PT1.5: reconcile the COMMERCIAL half. This is the backstop for a webhook
    // that was missed or that predates PT1.5. The acquisition offer is
    // write-once in SQL, so a reconciliation run updates what Stripe currently
    // bills and can never rewrite the offer a customer was acquired on. The
    // offer id is read from Stripe's own subscription metadata; a legacy
    // subscription carries none and its acquisition offer stays NULL.
    if (hasActiveSub) {
      const sub = allSubs[0];
      const { error: commercialError } = await supabaseClient.rpc("record_pro_commercial_state", {
        _user_id: user.id,
        _offer_id: sub.metadata?.mogzy_offer ?? null,
        _stripe_customer_id: customerId,
        _stripe_subscription_id: sub.id,
        _stripe_price_id: sub.items.data[0]?.price?.id ?? null,
        _billing_interval: interval,
        _subscription_status: sub.status ?? null,
        _current_period_end: subscriptionEnd,
      });
      // Never let commercial bookkeeping break a Pro status check.
      if (commercialError) console.error("record_pro_commercial_state failed", commercialError);
    } else if (customerId) {
      const { error: commercialError } = await supabaseClient.rpc("record_pro_commercial_state", {
        _user_id: user.id,
        _stripe_customer_id: customerId,
        _subscription_status: wasCustomer ? "canceled" : null,
      });
      if (commercialError) console.error("record_pro_commercial_state failed", commercialError);
    }

    // PT1.4: is_pro is the STRIPE-DERIVED half of entitlement and nothing else.
    // Force-syncing it to Stripe state (including revoking it) is correct and
    // deliberate. It is NOT the effective Pro answer: a manual/playtester/promo
    // grant lives in profiles.pro_grant_* and is untouched here, so this sync
    // can no longer revoke a comped entitlement. Effective Pro is composed by
    // public.pro_entitlement_is_effective / public.my_pro_entitlement().
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("id, is_pro")
      .eq("user_id", user.id)
      .single();

    if (profile && profile.is_pro !== hasActiveSub) {
      await supabaseClient
        .from("profiles")
        .update({ is_pro: hasActiveSub })
        .eq("id", profile.id);
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      subscription_end: subscriptionEnd,
      is_trial: isTrial,
      interval,
      was_customer: wasCustomer,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error('check-subscription error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
