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

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    // The Stripe customer is derived from the AUTHENTICATED user's own email,
    // server side. No customer id is ever accepted from the client, so a caller
    // cannot open someone else's billing portal by asking for their id.
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      // A comped / playtest-granted Premium account has entitlement but no
      // Stripe customer, and that is not an error — there is genuinely nothing
      // to manage. 200 with a code so the caller can say so plainly instead of
      // showing a failure. supabase-js collapses every non-2xx into a generic
      // error, which would read as "something broke".
      return new Response(JSON.stringify({
        error: "This account has no Stripe billing to manage.",
        code: "NO_STRIPE_CUSTOMER",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Canonical production origin: https://mogzy.lol. Historical domains stay
    // allowlisted only as legacy redirect origins; localhost/lovable are dev/preview.
    const allowedOrigins = [
      "https://mogzy.lol",
      "https://www.mogzy.lol",
      // legacy (redirect-only) origins
      "https://mogsy.net",
      "https://www.mogsy.net",
      "https://mogsy.app",
      "https://www.mogsy.app",
      // dev / preview
      "https://mogsy.lovable.app",
      "http://localhost:3000",
      "http://localhost:5173",
    ];
    const requestOrigin = req.headers.get("origin") || "";
    const origin = allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : "https://mogzy.lol";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      // /shop is unreachable under LEAGUE_ONLY_MODE, so returning there
      // bounced the buyer to /lol. /lol/premium is where they started.
      return_url: `${origin}/lol/premium`,
    });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error('customer-portal error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
