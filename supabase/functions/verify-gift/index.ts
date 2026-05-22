import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * verify-gift: called from the success page after a gift checkout.
 * - Looks up the gift by redeem code.
 * - Confirms the Stripe Checkout Session was paid.
 * - Marks the gift as 'paid'.
 * - Returns the redeem code (and recipient email only to the authenticated sender).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require authentication so we never leak gift PII to anonymous callers.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }
    const callerUserId = claimsData.claims.sub as string;

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: gift, error } = await admin
      .from("gifts").select("*").eq("redeem_code", code.toUpperCase()).maybeSingle();
    if (error || !gift) {
      return new Response(JSON.stringify({ error: "Gift not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    // Only the sender of this gift may inspect it.
    if (gift.sender_user_id && gift.sender_user_id !== callerUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403,
      });
    }

    if (gift.status === "paid" || gift.status === "redeemed") {
      return new Response(JSON.stringify({
        status: gift.status, redeem_code: gift.redeem_code,
        recipient_email: gift.recipient_email, gift_type: gift.gift_type,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    if (!gift.stripe_session_id) {
      return new Response(JSON.stringify({ status: gift.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(gift.stripe_session_id);
    if (session.payment_status === "paid") {
      await admin.from("gifts").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", gift.id);
      return new Response(JSON.stringify({
        status: "paid", redeem_code: gift.redeem_code,
        recipient_email: gift.recipient_email, gift_type: gift.gift_type,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    return new Response(JSON.stringify({ status: gift.status, payment_status: session.payment_status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e) {
    console.error("verify-gift", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});