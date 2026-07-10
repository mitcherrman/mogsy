import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// Stripe webhook — keeps profiles.is_pro in sync without relying on the
// user revisiting the Shop page (check-subscription remains as a backstop).
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
