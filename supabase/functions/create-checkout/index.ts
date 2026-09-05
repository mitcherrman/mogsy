import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveGiftByPriceId } from "../_shared/gift-catalog.ts";
import {
  MOGZY_OFFER_IDS,
  foundingAccessCodeMatches,
  getOffer,
  isOfferConfigured,
  offerAllowedInMode,
  readPricingMode,
  winbackCouponId,
} from "../_shared/offer-catalog.ts";

// PT1.5 — checkout authority.
//
// SUBSCRIPTIONS are bought by OFFER ID, never by Price ID. The client asks for
// an approved Mogzy offer ("launch_annual"); this function maps it to a Stripe
// Price through the server-owned catalog. A browser therefore cannot
// manufacture a cheaper or privileged subscription by sending an arbitrary
// `price_...`, cannot buy a launch price outside the launch window, and cannot
// assert Founding Playtester identity for itself.
//
// ONE-TIME PAYMENTS (diamond packs, gifts) still take a Price ID, but it is now
// checked against the server-owned gift catalog, so no arbitrary Stripe Price
// reaches Stripe from any path in this function.
//
// COUPONS are server-selected. The win-back discount is applied because THIS
// function established the caller is a lapsed customer, not because the client
// asked for it.
//
// Commercial identity travels with the purchase: the chosen offer id is written
// into both the Checkout Session metadata and the Subscription metadata, so
// Stripe itself carries the acquisition offer for the life of the subscription.
// stripe-webhook persists it via public.record_pro_commercial_state.
//
// Entitlement is NOT this function's business. Pro access is PT1.4's:
// profiles.is_pro (Stripe-derived) OR a valid profiles.pro_grant_*.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

/**
 * A well-formed request for something there is nothing to sell: the offer is
 * not configured, not sellable in the current pricing mode, or private and
 * unlocked by no valid access code.
 *
 * Returned as HTTP 200 with a code — the house pattern customer-portal already
 * uses — because supabase-js's `functions.invoke` collapses every non-2xx into
 * a generic error and the buyer would otherwise see "something went wrong"
 * instead of "this plan isn't available yet". It is still a refusal: no
 * Checkout Session is created. All three refusals return the SAME code, so
 * probing cannot distinguish an unconfigured offer from a rejected access code.
 */
const notAvailable = () =>
  json({ error: "This offer is not available", code: "OFFER_NOT_AVAILABLE" }, 200);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const body = await req.json().catch(() => ({}));

    // ---- Availability probe (no auth, no Stripe call, no session) ----------
    // PT1.5B. The browser cannot see edge-function secrets, so without this it
    // could only discover that an offer is unsellable by pressing Buy. That is
    // truthful but late: the page would render a live-looking $99.99 button for
    // an annual price that does not exist yet.
    //
    // The answer is deliberately "what can be bought RIGHT NOW", derived from
    // the same three rules checkout itself applies: public visibility, allowed
    // in the current pricing mode, and a configured Stripe Price. It therefore
    // leaks nothing a buyer would not see on the page anyway:
    //   * `founding_playtester` is private and NEVER appears, configured or not;
    //   * launch offers report unavailable outside launch mode even when their
    //     prices exist, so the probe cannot reveal a pre-staged launch;
    //   * no Stripe Price ID, coupon or secret is ever returned.
    if (body?.action === "offer_availability") {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );
      const { data: modeRow } = await adminClient
        .from("app_settings").select("value").eq("key", "pro_pricing").maybeSingle();
      const pricingMode = readPricingMode(modeRow?.value);
      const available = MOGZY_OFFER_IDS.filter((id) => {
        const def = getOffer(id);
        return !!def
          && def.visibility === "public"
          && offerAllowedInMode(def, pricingMode)
          && isOfferConfigured(def);
      });
      return json({ mode: pricingMode, available }, 200);
    }

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { offer, offerAccessCode, priceId, mode, quantity, gift, successPath, cancelPath } = body;

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

    if (mode && !["payment", "subscription"].includes(mode)) {
      return json({ error: "Invalid mode" }, 400);
    }
    // A subscription is identified by an offer, a one-time purchase by a
    // catalog Price ID. `offer` implies subscription mode.
    const isSubscription = offer !== undefined || mode === "subscription";

    if (isSubscription && !offer) {
      // The pre-PT1.5 shape (a raw subscription Price ID) is refused outright
      // rather than honoured, so no deployed client can keep bypassing the
      // offer catalog.
      return json({ error: "A Mogzy offer is required to start a subscription", code: "OFFER_REQUIRED" }, 400);
    }
    if (!isSubscription && (!priceId || typeof priceId !== "string" || !priceId.startsWith("price_"))) {
      return json({ error: "Invalid priceId" }, 400);
    }

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
      success_url: `${origin}${safeSuccessPath}`,
      cancel_url: `${origin}${safeCancelPath}`,
      // Lets the stripe-webhook function map events back to the Supabase user
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
    };

    if (isSubscription) {
      // ---- Server-authoritative offer resolution ---------------------------
      const definition = getOffer(offer);
      if (!definition) {
        return json({ error: "Unknown offer", code: "UNKNOWN_OFFER" }, 400);
      }

      // The private Founding Playtester offer needs a server-verified access
      // code. The secret lives in an edge-function env var, so a client can
      // present a code but can never assert founder identity itself. With no
      // secret configured the offer is unreachable.
      if (definition.visibility === "private" && !foundingAccessCodeMatches(offerAccessCode)) {
        return notAvailable();
      }

      // Launch prices are sellable only while the site is in launch mode, so
      // replaying "launch_annual" after the window closes buys nothing.
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );
      const { data: pricingRow } = await adminClient
        .from("app_settings").select("value").eq("key", "pro_pricing").maybeSingle();
      const pricingMode = readPricingMode(pricingRow?.value);
      if (!offerAllowedInMode(definition, pricingMode)) {
        return notAvailable();
      }

      // Fail closed: an offer with no Stripe Price configured is not sellable.
      if (!isOfferConfigured(definition)) {
        return notAvailable();
      }

      sessionConfig.mode = "subscription";
      sessionConfig.line_items = [{ price: definition.priceId, quantity: 1 }];
      // Commercial identity travels with the purchase, in Stripe itself.
      sessionConfig.metadata.mogzy_offer = definition.id;
      sessionConfig.subscription_data = {
        metadata: { supabase_user_id: user.id, mogzy_offer: definition.id },
      };
      if (definition.trialDays > 0) {
        sessionConfig.subscription_data.trial_period_days = definition.trialDays;
      }

      // ---- Server-selected discounts --------------------------------------
      // An offer-level coupon (the Founding Playtester first-year discount)
      // wins; otherwise a lapsed customer gets the win-back coupon. Neither is
      // client-controllable: the client sends no coupon field at all.
      let coupon = definition.couponId;
      if (!coupon && customerId && definition.interval === "month") {
        const past = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
        const hasActive = past.data.some((s) => ["active", "trialing"].includes(s.status));
        if (past.data.length > 0 && !hasActive) coupon = winbackCouponId();
      }
      if (coupon) {
        sessionConfig.discounts = [{ coupon }];
      } else {
        sessionConfig.allow_promotion_codes = true;
      }
    } else {
      // ---- One-time payment: allowlisted Price IDs only --------------------
      // Every legitimate one-time price (five diamond packs, two gift-Pro
      // prices) is in the server-owned gift catalog, so this closes the last
      // path by which an arbitrary Price ID could reach Stripe.
      if (!resolveGiftByPriceId(priceId)) {
        return json({ error: "Unknown priceId", code: "UNKNOWN_PRICE" }, 400);
      }
      const safeQuantity = Math.min(Math.max(Math.floor(Number(quantity) || 1), 1), 99);
      sessionConfig.mode = "payment";
      sessionConfig.line_items = [{ price: priceId, quantity: safeQuantity }];
      sessionConfig.allow_promotion_codes = true;
    }

    // Gift flow: create a gift row and embed gift id in metadata
    if (gift && typeof gift === "object" && !isSubscription) {
      const recipientEmail = String(gift.recipient_email || "").trim().toLowerCase();
      if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return json({ error: "Invalid recipient email" }, 400);
      }
      // Resolve gift type and diamond amount from the server-owned Price ID
      // catalog. The client-supplied `gift.gift_type` and `gift.diamond_amount`
      // are DISCARDED here — the priceId is the only trusted identifier.
      const catalogEntry = resolveGiftByPriceId(priceId);
      if (!catalogEntry) {
        return json({ error: "Unknown gift priceId" }, 400);
      }
      const giftType = catalogEntry.giftType;
      const canonicalDiamondAmount = catalogEntry.diamondAmount;
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
        diamond_amount: canonicalDiamondAmount,
        stripe_price_id: priceId,
        message: typeof gift.message === "string" ? gift.message.slice(0, 500) : null,
      }).select("id, redeem_code").single();
      if (giftErr || !giftRow) {
        console.error("gift insert error", giftErr);
        return json({ error: "Could not create gift" }, 500);
      }
      sessionConfig.mode = "payment";
      // Gift Pro subscriptions are sold as a one-time payment for the period;
      // the recipient gets a pro_grant_* entitlement of 30/365 days when they
      // redeem (PT1.4). A gift is not an acquisition offer: the recipient never
      // chose a commercial offer, so no pro_offer is recorded for them.
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

    return json({ url: session.url }, 200);
  } catch (error) {
    console.error('create-checkout error:', error);
    return json({ error: 'An internal error occurred' }, 500);
  }
});
