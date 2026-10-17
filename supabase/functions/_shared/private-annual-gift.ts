// Private first-customer offer: never part of the public Price-ID catalog.
export const PRIVATE_ANNUAL_GIFT = "first_customer_annual_gift";
export const PRIVATE_GIFT_AMOUNT = 5000;
export const PRIVATE_GIFT_DAYS = 365;
export type EnvReader = (name: string) => string | undefined;

export function privateGiftConfig(env: EnvReader) {
  const priceId = env("STRIPE_PRIVATE_ANNUAL_GIFT_PRICE_ID") ?? "";
  const recipientEmail = (env("PRIVATE_ANNUAL_GIFT_RECIPIENT_EMAIL") ?? "").trim().toLowerCase();
  if (env("PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED") !== "true"
    || env("PRIVATE_ANNUAL_GIFT_LIVE_APPROVED") !== "true"
    || env("PRIVATE_ANNUAL_GIFT_CA_TAX_APPROVED") !== "true"
    || !/^price_[A-Za-z0-9]+$/.test(priceId)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return null;
  return { priceId, recipientEmail };
}

export function validPrivatePrice(price: any): boolean {
  return price?.active === true && price.type === "one_time" && !price.recurring
    && price.unit_amount === PRIVATE_GIFT_AMOUNT && price.currency === "usd"
    && price.tax_behavior === "inclusive";
}

export function validPrivateRequest(body: Record<string, any>, recipientEmail: string): boolean {
  const permitted = new Set(["giftOffer", "gift", "successPath", "cancelPath"]);
  return Object.keys(body).every((key) => permitted.has(key))
    && body.giftOffer === PRIVATE_ANNUAL_GIFT
    && (body.gift === undefined || (body.gift && typeof body.gift === "object"
      && !Array.isArray(body.gift)
      && Object.keys(body.gift).every((key) => ["recipient_email", "message"].includes(key))
      && (body.gift.recipient_email === undefined
        || String(body.gift.recipient_email).trim().toLowerCase() === recipientEmail)));
}

export function isPrivateGift(gift: any): boolean {
  return gift?.metadata?.private_offer === PRIVATE_ANNUAL_GIFT;
}

// Stripe is read again at REDEMPTION, including the current charge, never just
// a remembered paid flag or browser-supplied Checkout payload.
export function inspectGiftPayment(gift: any, session: any, intent: any): "paid" | "pending" | "invalid" {
  const line = session?.line_items?.data?.[0];
  const pi = typeof session?.payment_intent === "string" ? session.payment_intent : session?.payment_intent?.id;
  if (!gift?.stripe_session_id || session?.id !== gift.stripe_session_id
    || session.mode !== "payment" || session.metadata?.gift_id !== gift.id
    || session.metadata?.supabase_user_id !== gift.sender_user_id
    || session.metadata?.recipient_email !== gift.recipient_email
    || session.line_items?.has_more || session.line_items?.data?.length !== 1
    || line?.price?.id !== gift.stripe_price_id || line.quantity !== 1) return "invalid";
  if (session.status === "expired") return "invalid";
  if (session.status !== "complete" || session.payment_status !== "paid") return "pending";
  const charge = intent?.latest_charge;
  if (!pi || intent?.id !== pi || intent.status !== "succeeded"
    || !charge || typeof charge === "string" || charge.paid !== true
    || charge.refunded || charge.amount_refunded > 0 || charge.disputed) return "invalid";
  if (isPrivateGift(gift)) {
    if (session.metadata?.private_offer !== PRIVATE_ANNUAL_GIFT
      || session.currency !== "usd" || session.amount_total !== PRIVATE_GIFT_AMOUNT
      || session.total_details?.amount_discount !== 0
      || !session.automatic_tax?.enabled || session.automatic_tax?.status !== "complete"
      || !validPrivatePrice(line.price)
      || intent.currency !== "usd" || intent.amount_received !== PRIVATE_GIFT_AMOUNT
      || charge.currency !== "usd" || charge.amount !== PRIVATE_GIFT_AMOUNT) return "invalid";
  }
  return "paid";
}

export function recipientMatches(user: any, gift: any): boolean {
  return !!user?.id && !user.is_anonymous && !!user.email_confirmed_at
    && typeof gift?.recipient_email === "string"
    && user.email?.trim().toLowerCase() === gift.recipient_email.trim().toLowerCase()
    && (!gift.recipient_user_id || gift.recipient_user_id === user.id);
}