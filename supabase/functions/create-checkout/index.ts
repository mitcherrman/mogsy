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
    const { priceId, mode, quantity, couponId, gift, successPath, cancelPath } = body;

    // Optional caller-provided return paths. Internal paths only: must start
    // with a single "/" (no protocol-relative "//host" or backslash tricks),
    // so Stripe can never redirect to an external site. Defaults keep the
    // legacy Shop behavior for existing callers.
    const sanitizePath = (p: unknown): string | null => {
      if (typeof p !== "string" || p.length === 0 || p.length > 200) return null;
      if (!p.startsWith("/") || p.startsWith("//")) return null;
      if (p.includes("\\") || /[\r\n\t]/.test(p)) return null;
      return p;
    };
    const safeSuccessPath = sanitizePath(successPath) || "/shop?success=true";
    const safeCancelPath = sanitizePath(cancelPath) || "/shop?canceled=true";

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

    // Validate origin against allowlist to prevent open-redirect via Stripe success/cancel URLs.
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

    const sessionConfig: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: safeQuantity }],
      mode: mode || "payment",
      success_url: `${origin}${safeSuccessPath}`,
      cancel_url: `${origin}${safeCancelPath}`,
      // Lets the stripe-webhook function map events back to the Supabase user
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
    };

    // Add 7-day free trial for subscriptions
    if (mode === "subscription" && !gift) {
      sessionConfig.subscription_data = {
        trial_period_days: 7,
        metadata: { supabase_user_id: user.id },
      };
    }

    // Apply optional discount (win-back / promo offers)
    if (couponId && typeof couponId === "string" && /^[a-zA-Z0-9_-]{3,40}$/.test(couponId)) {
      sessionConfig.discounts = [{ coupon: couponId }];
    } else {
      sessionConfig.allow_promotion_codes = true;
    }

    // Gift flow: create a gift row and embed gift id in metadata
    if (gift && typeof gift === "object") {
      const recipientEmail = String(gift.recipient_email || "").trim().toLowerCase();
      if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return new Response(JSON.stringify({ error: "Invalid recipient email" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }
      const giftType = String(gift.gift_type || "");
      if (!["pro_monthly", "pro_annual", "diamonds"].includes(giftType)) {
        return new Response(JSON.stringify({ error: "Invalid gift type" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );
      const { data: giftRow, error: giftErr } = await adminClient.from("gifts").insert({
        sender_user_id: user.id,
        sender_email: user.email,
        recipient_email: recipientEmail,
        gift_type: giftType,
        diamond_amount: Number(gift.diamond_amount) || 0,
        stripe_price_id: priceId,
        message: typeof gift.message === "string" ? gift.message.slice(0, 500) : null,
      }).select("id, redeem_code").single();
      if (giftErr || !giftRow) {
        console.error("gift insert error", giftErr);
        return new Response(JSON.stringify({ error: "Could not create gift" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
      }
      sessionConfig.mode = giftType === "diamonds" ? "payment" : "payment";
      // Gift Pro subscriptions are sold as a one-time payment for the period;
      // recipient gets is_pro extended by 30/365 days when they redeem.
      sessionConfig.line_items = [{ price: priceId, quantity: 1 }];
      sessionConfig.metadata = {
        supabase_user_id: user.id,
        gift_id: giftRow.id,
        gift_type: giftType,
        recipient_email: recipientEmail,
        redeem_code: giftRow.redeem_code,
      };
      sessionConfig.success_url = `${origin}/shop?gift_success=1&code=${giftRow.redeem_code}`;
      sessionConfig.cancel_url = `${origin}/shop?canceled=true`;
      delete sessionConfig.subscription_data;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // If this was a gift checkout, persist the session id to our gifts row for verification later
    if (sessionConfig.metadata?.gift_id) {
      try {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          { auth: { persistSession: false } }
        );
        await adminClient.from("gifts").update({
          stripe_session_id: session.id,
          amount_cents: session.amount_total ?? null,
        }).eq("id", sessionConfig.metadata.gift_id);
      } catch (e) { console.error("gift session_id update failed", e); }
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error('create-checkout error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
