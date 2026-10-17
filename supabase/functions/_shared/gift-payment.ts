import { inspectGiftPayment, isPrivateGift } from "./private-annual-gift.ts";
import { resolveGiftByPriceId } from "./gift-catalog.ts";

export async function reconcileGiftPayment(admin: any, stripe: any, gift: any) {
  if (!gift.stripe_session_id) throw new Error("Gift has no attached Checkout Session");
  const session = await stripe.checkout.sessions.retrieve(gift.stripe_session_id, { expand: ["line_items"] });
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const intent = pi ? await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] }) : null;
  const state = inspectGiftPayment(gift, session, intent);
  if (!isPrivateGift(gift)) {
    const entry = resolveGiftByPriceId(gift.stripe_price_id);
    if (!entry || entry.giftType !== gift.gift_type || entry.diamondAmount !== gift.diamond_amount) {
      throw new Error("Gift catalog mismatch");
    }
  }
  const { data, error } = await admin.rpc("gift_record_payment", {
    _gift_id: gift.id, _session_id: session.id, _payment_intent: pi ?? null,
    _state: state, _amount: session.amount_total ?? 0, _currency: session.currency ?? "",
  });
  if (error) throw error;
  return { state, sessionId: session.id, result: data };
}

// Invoked only AFTER Stripe signature verification. Current payment facts are
// re-read instead of trusting out-of-order webhook event payloads.
export async function handleGiftEvent(event: any, admin: any, stripe: any): Promise<boolean> {
  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object;
    if (!session.metadata?.gift_id) return false;
    const { data: gift, error } = await admin.from("gifts").select("*")
      .eq("id", session.metadata.gift_id).maybeSingle();
    if (error) throw error;
    if (!gift || gift.stripe_session_id !== session.id) throw new Error("Gift session not attached");
    await reconcileGiftPayment(admin, stripe, gift);
    return true;
  }
  if (["charge.refunded", "charge.dispute.created", "charge.dispute.closed"].includes(event.type)) {
    const object = event.data.object;
    const pi = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id;
    if (!pi) return false;
    // Private gifts also carry gift_id on PaymentIntent metadata. Lookup by
    // persisted PI catches refunds after payment verification and redemption.
    const { data: gifts, error } = await admin.from("gifts").select("*")
      .contains("metadata", { payment_intent: pi });
    if (error) throw error;
    for (const gift of gifts ?? []) await reconcileGiftPayment(admin, stripe, gift);
    return (gifts?.length ?? 0) > 0;
  }
  return false;
}