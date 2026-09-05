import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// Stripe webhook — keeps profiles.is_pro in sync without relying on the
// user revisiting the Shop page (check-subscription remains as a backstop).
//
// PT1.4: is_pro is the STRIPE-DERIVED half of entitlement only. This function
// may say "no paid Stripe entitlement"; it may NOT conclude "therefore not Pro".
// Manual/playtester/promo/gift grants live in profiles.pro_grant_* and are never
// written here. Effective Pro = public.pro_entitlement_is_effective(...).
// PT1.5: this function is ALSO the recorder of commercial state — which offer
// produced the subscription, and what Stripe currently bills. Both go through
// public.record_pro_commercial_state, where the acquisition offer is WRITE-ONCE:
// reconciliation updates the billing half and can never rewrite the cohort a
// customer was acquired in. That function writes neither is_pro nor
// pro_grant_*, so recording commercial identity cannot alter entitlement.
//
// Events handled: checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted.

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}

// Subscriptions created before metadata was added carry no supabase_user_id;
// fall back to matching the Stripe customer's email against auth users.
async function findUserIdByEmail(supabase: ReturnType<typeof adminClient>, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("listUsers failed", error);
      return null;
    }
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function resolveUserId(
  stripe: Stripe,
  supabase: ReturnType<typeof adminClient>,
  subscription: Stripe.Subscription
): Promise<string | null> {
  const metaUserId = subscription.metadata?.supabase_user_id;
  if (metaUserId) return metaUserId;

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) return null;

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !customer.email) return null;
  return await findUserIdByEmail(supabase, customer.email);
}

async function syncProStatus(supabase: ReturnType<typeof adminClient>, userId: string, isPro: boolean) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, is_pro")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("profile lookup failed", { userId, error });
    throw error;
  }
  if (!profile) {
    console.warn("no profile for user", userId);
    return;
  }
  if (profile.is_pro !== isPro) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_pro: isPro })
      .eq("id", profile.id);
    if (updateError) {
      console.error("is_pro update failed", { userId, isPro, updateError });
      throw updateError;
    }
    console.log("is_pro synced", { userId, isPro });
  }
}

/**
 * Persist the commercial facts of a Stripe subscription.
 *
 * The offer id is read from Stripe's own metadata (written at checkout by
 * create-checkout), so Stripe carries the acquisition identity for the life of
 * the subscription. Subscriptions created before PT1.5 carry no offer metadata:
 * their acquisition offer stays NULL — honestly unknown, never guessed.
 *
 * Idempotent by construction: the SQL writer converges billing state and
 * refuses to overwrite an acquisition offer that is already set, so Stripe
 * retries and out-of-order events are safe.
 */
async function recordCommercialState(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  subscription: Stripe.Subscription
) {
  const item = subscription.items?.data?.[0];
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;
  const { error } = await supabase.rpc("record_pro_commercial_state", {
    _user_id: userId,
    _offer_id: subscription.metadata?.mogzy_offer ?? null,
    _stripe_customer_id: customerId,
    _stripe_subscription_id: subscription.id,
    _stripe_price_id: item?.price?.id ?? null,
    _billing_interval: item?.price?.recurring?.interval ?? null,
    _subscription_status: subscription.status ?? null,
    _current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
  });
  if (error) {
    // Commercial bookkeeping must never wedge the entitlement sync that runs
    // alongside it: a failure here is logged, not thrown, so Stripe is not made
    // to retry an event whose is_pro half already succeeded. The next
    // subscription event or a check-subscription reconciliation repairs it.
    console.error("record_pro_commercial_state failed", { userId, subscriptionId: subscription.id, error });
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = adminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Gift purchases grant Pro at redemption (redeem-gift), not at purchase.
        if (session.metadata?.gift_id) break;
        if (session.mode !== "subscription") break;
        const userId = session.metadata?.supabase_user_id || session.client_reference_id;
        if (!userId) {
          console.warn("checkout.session.completed without user reference", session.id);
          break;
        }
        await syncProStatus(supabase, userId, true);
        // PT1.5: the session carries the offer, but the Subscription object is
        // where the price, interval and period live — and where the offer
        // metadata was also written, so it stays available on later events.
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await recordCommercialState(supabase, userId, subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(stripe, supabase, subscription);
        if (!userId) {
          console.warn("could not resolve user for subscription", subscription.id);
          break;
        }
        const isPro = event.type !== "customer.subscription.deleted" &&
          ["active", "trialing"].includes(subscription.status);
        await syncProStatus(supabase, userId, isPro);
        // PT1.5: reconcile the billing half on every lifecycle event —
        // renewal, upgrade, downgrade, cancellation. The acquisition offer is
        // write-once in SQL, so none of these can rewrite commercial history.
        await recordCommercialState(supabase, userId, subscription);
        break;
      }
      default:
        // Unexpected event type (dashboard configured to send more than we handle)
        console.log("Unhandled event type", event.type);
    }
  } catch (err) {
    console.error("Webhook handler error", { type: event.type, err });
    // Non-2xx makes Stripe retry with backoff — desired for transient DB errors.
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
