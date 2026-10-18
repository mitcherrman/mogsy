// PT1.7 — buyer-side request handling for the private annual gift, every side
// effect injected so the decision path is unit tested. The gift-checkout Edge
// Function only wires real clients and the HTTP envelope.
//
//   availability  May THIS signed-in account buy the private gift right now?
//   checkout      Start (or resume) the one Stripe Checkout for it.
//   status        The buyer's gift after returning from Stripe — re-read from
//                 Stripe, never inferred from the redirect.
import {
  GIFT_MESSAGE_MAX,
  GIFT_SESSION_REUSE_MARGIN_MS,
  GIFT_SESSION_TTL_SECONDS,
  PRIVATE_GIFT_AMOUNT,
  PRIVATE_GIFT_DAYS,
  buildPrivateGiftSessionParams,
  buyerAllowed,
  giftStripeMode,
  normalizeEmail,
  validPrivatePrice,
  validRecipientEmail,
  type PriceLike,
  type PrivateGiftConfig,
} from "./private-annual-gift.ts";
import type { GiftRow, Rpc } from "./gift-payment.ts";

export interface CheckoutSessionLike {
  id: string;
  status?: string | null;
  url?: string | null;
  expires_at?: number | null;
}

export interface GiftCheckoutStripe {
  retrievePrice(id: string): Promise<PriceLike>;
  findCustomerIdByEmail(email: string): Promise<string | null>;
  createSession(params: Record<string, unknown>): Promise<CheckoutSessionLike>;
  retrieveSession(id: string): Promise<CheckoutSessionLike>;
  expireSession(id: string): Promise<void>;
}

export interface BuyerGiftRow extends GiftRow {
  redeem_code: string;
  message: string | null;
  paid_at: string | null;
  redeemed_at: string | null;
  amount_cents: number | null;
  created_at?: string;
}

export interface GiftCheckoutDeps {
  config: PrivateGiftConfig;
  rpc: Rpc;
  stripe: GiftCheckoutStripe;
  getGift(id: string): Promise<BuyerGiftRow | null>;
  /** Re-read Stripe and record (gift-payment.ts reconcileGiftPayment). */
  reconcile(gift: BuyerGiftRow): Promise<unknown>;
  now: () => number;
  log: (message: string, detail?: Record<string, unknown>) => void;
}

export interface GiftBuyer {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  isAnonymous: boolean;
}

export interface GiftCheckoutRequest {
  action: unknown;
  recipientEmail?: unknown;
  message?: unknown;
  giftId?: unknown;
  user: GiftBuyer;
  origin: string;
}

const MESSAGES: Record<string, string> = {
  OFFER_NOT_AVAILABLE: "This gift isn't available right now.",
  ACCOUNT_REQUIRED: "Sign in with a full Mogzy account to buy a gift.",
  EMAIL_UNVERIFIED: "Verify your email address before buying a gift.",
  INVALID_RECIPIENT: "Enter the recipient's email address.",
  SELF_GIFT: "A gift has to go to someone else's email address.",
  MESSAGE_TOO_LONG: `Keep the gift message under ${GIFT_MESSAGE_MAX} characters.`,
  PAYMENT_PROCESSING: "A payment for your previous gift checkout is being confirmed. Check its status before starting another.",
  CHECKOUT_BUSY: "A checkout is already being prepared. Try again in a moment.",
  NOT_FOUND: "Gift not found.",
  BAD_REQUEST: "Unknown request.",
};

export type GiftCheckoutResponse = Record<string, unknown>;
const refuse = (code: string, extra: Record<string, unknown> = {}): GiftCheckoutResponse =>
  ({ error: MESSAGES[code] ?? MESSAGES.OFFER_NOT_AVAILABLE, code, ...extra });

const PREPARE_REASONS: Record<string, string> = {
  account_required: "ACCOUNT_REQUIRED",
  email_unverified: "EMAIL_UNVERIFIED",
  invalid_recipient: "INVALID_RECIPIENT",
  self_gift: "SELF_GIFT",
  busy: "CHECKOUT_BUSY",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function call(deps: GiftCheckoutDeps, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await deps.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message ?? "unknown"}`);
  return data;
}

const reusable = (s: CheckoutSessionLike, nowMs: number) =>
  s.status === "open" && !!s.url && (s.expires_at ?? 0) * 1000 > nowMs + GIFT_SESSION_REUSE_MARGIN_MS;

async function quietlyExpire(deps: GiftCheckoutDeps, id: string) {
  try { await deps.stripe.expireSession(id); } catch (e) {
    deps.log("gift: expire session failed", { session: id, error: String(e) });
  }
}

/** What the buyer may see about their own gift. The code only once paid. */
function buyerView(g: BuyerGiftRow): GiftCheckoutResponse {
  const usable = g.status === "paid" || g.status === "redeemed";
  return {
    gift_id: g.id,
    test_mode: giftStripeMode(g.stripe_session_id) === "test",
    status: g.status,
    recipient_email: g.recipient_email,
    message: g.message,
    gift_type: g.gift_type,
    amount_cents: g.amount_cents,
    paid_at: g.paid_at,
    redeemed_at: g.redeemed_at,
    redeem_code: usable ? g.redeem_code : null,
  };
}

export async function handleGiftCheckoutRequest(
  req: GiftCheckoutRequest,
  deps: GiftCheckoutDeps,
): Promise<GiftCheckoutResponse> {
  const u = req.user;
  const signedIn = !u.isAnonymous && !!u.email;

  if (req.action === "availability") {
    if (!signedIn || !buyerAllowed(deps.config, u.id)) return { available: false };
    return {
      available: true,
      test_mode: deps.config.stripeMode === "test",
      email_verified: u.emailConfirmed,
      amount_cents: PRIVATE_GIFT_AMOUNT,
      currency: "usd",
      premium_days: PRIVATE_GIFT_DAYS,
      auto_renews: false,
    };
  }

  if (req.action === "status") {
    if (typeof req.giftId !== "string" || !UUID_RE.test(req.giftId) || !signedIn) return refuse("NOT_FOUND");
    let gift = await deps.getGift(req.giftId);
    if (!gift || gift.sender_user_id !== u.id) return refuse("NOT_FOUND");
    if (gift.stripe_session_id && (gift.status === "pending" || gift.status === "disputed")) {
      await deps.reconcile(gift);
      gift = (await deps.getGift(gift.id)) ?? gift;
    }
    return buyerView(gift);
  }

  if (req.action !== "checkout") return refuse("BAD_REQUEST");

  // ---- checkout ------------------------------------------------------------
  if (!deps.config.enabled || !deps.config.taxMode) {
    deps.log("gift checkout refused: offer disabled", { reason: deps.config.reason });
    return refuse("OFFER_NOT_AVAILABLE");
  }
  if (!signedIn) return refuse("ACCOUNT_REQUIRED");
  if (!buyerAllowed(deps.config, u.id)) return refuse("OFFER_NOT_AVAILABLE");
  if (!u.emailConfirmed) return refuse("EMAIL_UNVERIFIED");
  if (!validRecipientEmail(req.recipientEmail)) return refuse("INVALID_RECIPIENT");
  if (normalizeEmail(req.recipientEmail) === normalizeEmail(u.email)) return refuse("SELF_GIFT");
  const message = typeof req.message === "string" ? req.message.trim() : "";
  if (req.message != null && typeof req.message !== "string") return refuse("BAD_REQUEST");
  if (message.length > GIFT_MESSAGE_MAX) return refuse("MESSAGE_TOO_LONG");
  const recipient = normalizeEmail(req.recipientEmail);

  type Prep = { ok: boolean; reason?: string; gift_id?: string; existing_session_id?: string | null; same_details?: boolean };
  const prepare = async () => (await call(deps, "gift_private_prepare", {
    _sender: u.id, _recipient_email: recipient, _message: message || null,
  })) as Prep;

  let prep = await prepare();
  if (!prep.ok || !prep.gift_id) return refuse(PREPARE_REASONS[prep.reason ?? ""] ?? "OFFER_NOT_AVAILABLE");

  const nowMs = deps.now();
  // PT1.7-T: an open checkout from the OTHER Stripe mode cannot be read or
  // expired with this mode's key; it expires on its own (≤31 min) through its
  // own webhook lane. Never start a second payable checkout beside it.
  if (prep.existing_session_id && giftStripeMode(prep.existing_session_id) !== deps.config.stripeMode) {
    const row = await deps.getGift(prep.gift_id);
    const ageMs = row?.created_at ? nowMs - Date.parse(row.created_at) : 0;
    // Sessions live at most GIFT_SESSION_TTL_SECONDS (31 min): past 32 min the
    // other-mode session can no longer be paid. Retire the row (a payment that
    // did complete is still recorded later: expired → paid is allowed in SQL).
    if (!(ageMs > (GIFT_SESSION_TTL_SECONDS + 60) * 1000)) {
      return refuse("CHECKOUT_BUSY", { gift_id: prep.gift_id });
    }
    await call(deps, "gift_private_abandon", { _gift_id: prep.gift_id, _sender: u.id, _session_id: prep.existing_session_id });
    prep = await prepare();
    if (!prep.ok || !prep.gift_id || prep.existing_session_id) return refuse("CHECKOUT_BUSY");
  }
  if (prep.existing_session_id) {
    const existing = await deps.stripe.retrieveSession(prep.existing_session_id);
    if (existing.status === "complete") return refuse("PAYMENT_PROCESSING", { gift_id: prep.gift_id });
    if (prep.same_details && reusable(existing, nowMs)) {
      return { url: existing.url, gift_id: prep.gift_id, reused: true };
    }
    if (existing.status === "open") await quietlyExpire(deps, existing.id);
    // Re-read: if it completed in the meantime, it is paid, not replaceable.
    const after = await deps.stripe.retrieveSession(existing.id);
    if (after.status === "complete") return refuse("PAYMENT_PROCESSING", { gift_id: prep.gift_id });
    await call(deps, "gift_private_abandon", { _gift_id: prep.gift_id, _sender: u.id, _session_id: existing.id });
    prep = await prepare();
    if (!prep.ok || !prep.gift_id || prep.existing_session_id) return refuse("CHECKOUT_BUSY");
  }

  const price = await deps.stripe.retrievePrice(deps.config.priceId);
  const problem = validPrivatePrice(price, deps.config.taxMode);
  if (problem) {
    deps.log("gift checkout refused: configured price rejected", { problem });
    return refuse("OFFER_NOT_AVAILABLE");
  }

  const customerId = await deps.stripe.findCustomerIdByEmail(u.email!);
  const session = await deps.stripe.createSession(buildPrivateGiftSessionParams({
    priceId: deps.config.priceId,
    giftId: prep.gift_id,
    buyerId: u.id,
    buyerEmail: u.email!,
    customerId,
    recipientEmail: recipient,
    taxMode: deps.config.taxMode,
    origin: req.origin,
    nowMs,
    stripeMode: deps.config.stripeMode,
  }));

  const attached = (await call(deps, "gift_attach_session", {
    _gift_id: prep.gift_id, _sender: u.id, _session_id: session.id, _price_id: deps.config.priceId,
  })) as { result: string; current_session_id?: string };
  if (attached.result === "attached" && session.url) return { url: session.url, gift_id: prep.gift_id };

  // Lost a race: never leave a second payable session behind.
  await quietlyExpire(deps, session.id);
  if (attached.result === "conflict" && attached.current_session_id) {
    const winner = await deps.stripe.retrieveSession(attached.current_session_id);
    if (reusable(winner, deps.now())) return { url: winner.url, gift_id: prep.gift_id, reused: true };
  }
  return refuse("CHECKOUT_BUSY");
}

