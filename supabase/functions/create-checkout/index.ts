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
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const body = await req.json();
    const { priceId, mode, quantity } = body;

    // Input validation
    if (!priceId || typeof priceId !== 'string' || !priceId.startsWith('price_')) {
      return new Response(JSON.stringify({ error: "Invalid priceId" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }
    if (mode && !['payment', 'subscription'].includes(mode)) {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }
    const safeQuantity = Math.min(Math.max(Math.floor(Number(quantity) || 1), 1), 99);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";

    const sessionConfig: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: safeQuantity }],
      mode: mode || "payment",
      success_url: `${origin}/shop?success=true`,
      cancel_url: `${origin}/shop?canceled=true`,
    };

    // Add 7-day free trial for subscriptions
    if (mode === "subscription") {
      sessionConfig.subscription_data = {
        trial_period_days: 7,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
