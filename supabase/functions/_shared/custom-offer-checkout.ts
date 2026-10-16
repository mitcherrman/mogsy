// PT1.6b — request handling for the custom one-time offer, with every side
// effect injected (Stripe, the service-role RPC client, the clock) so the whole
// decision path is unit tested. `custom-offer-checkout/index.ts` only wires the
// real clients and the HTTP envelope.
import {
  CLAIM_STATE_CODES,
  SESSION_REUSE_MARGIN_MS,
  buildCheckoutSessionParams,
  hashClaimToken,
  isValidClaimToken,
  validateCustomOfferPrice,
  type ClaimState,
  type CustomOfferConfig,
  type PriceLike,
  type SessionLike,
} from "./custom-offer.ts";

export interface RpcResult {
  data: unknown;
  error: { message?: string } | null;
}
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

export interface CheckoutStripe {
  retrievePrice(id: string): Promise<PriceLike>;
  findCustomerIdByEmail(email: string): Promise<string | null>;
  createSession(params: Record<string, unknown>): Promise<SessionLike>;
  retrieveSession(id: string): Promise<SessionLike>;
  expireSession(id: string): Promise<void>;
}

export interface CheckoutDeps {
  config: CustomOfferConfig;
  rpc: Rpc;
  stripe: CheckoutStripe;
  now: () => number;
  log: (message: string, detail?: Record<string, unknown>) => void;
}

export interface CustomOfferUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface CustomOfferRequest {
  action: unknown;
  token: unknown;
  user: CustomOfferUser;
  origin: string;
}

/** Always HTTP 200 with a code: supabase-js collapses non-2xx into one generic error. */
export type CustomOfferResponse =
  | { state: ClaimState; claim_expires_at?: string | null; purchase_status?: string | null; entitlement_ends_at?: string | null }
  | { url: string; reused?: boolean }
  | { error: string; code: string };

const refuse = (code: string, error: string): CustomOfferResponse => ({ error, code });

const MESSAGES: Record<string, string> = {
  CLAIM_ALREADY_PAID: "This offer has already been purchased on your account.",
  CLAIM_OTHER_ACCOUNT: "This offer belongs to a different Mogzy account.",
  ACCOUNT_REQUIRED: "Sign in with a Mogzy account (not a guest session) to use this offer.",
  ACTIVE_SUBSCRIPTION: "You already have an active Premium subscription. Cancel it before using this offer.",
  PERMANENT_PREMIUM: "Your account already has Premium that does not expire.",
  CLAIM_UNAVAILABLE: "This offer link is no longer available.",
  OFFER_NOT_AVAILABLE: "This offer is not available right now.",
  PAYMENT_PROCESSING: "Your payment is already being confirmed. Refresh in a moment.",
  CHECKOUT_BUSY: "A checkout is already being prepared. Try again in a moment.",
};

function stateRefusal(state: string): CustomOfferResponse {
  const code = (CLAIM_STATE_CODES as Record<string, string>)[state] ?? "CLAIM_UNAVAILABLE";
  return refuse(code, MESSAGES[code] ?? MESSAGES.CLAIM_UNAVAILABLE);
}

async function call(deps: CheckoutDeps, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await deps.rpc(fn, args);
  // A database failure is not a refusal: let the caller answer 500.
  if (error) throw new Error(`${fn} failed: ${error.message ?? "unknown"}`);
  return data;
}

/** An open session still worth sending the buyer to. */
function reusable(s: SessionLike, nowMs: number): boolean {
  return s.status === "open" && !!s.url && (s.expires_at ?? 0) * 1000 > nowMs + SESSION_REUSE_MARGIN_MS;
}

async function quietlyExpire(deps: CheckoutDeps, id: string): Promise<void> {
  try {
    await deps.stripe.expireSession(id);
  } catch (e) {
    // Already expired or completed — both fine; completion is the webhook's.
    deps.log("custom-offer: expire session failed", { session: id, error: String(e) });
  }
}

export async function handleCustomOfferRequest(
  req: CustomOfferRequest,
  deps: CheckoutDeps,
): Promise<CustomOfferResponse> {
  if (req.action !== "status" && req.action !== "checkout") {
    return refuse("BAD_REQUEST", "Unknown action");
  }
  if (!isValidClaimToken(req.token)) return stateRefusal("unavailable");
  if (req.user.isAnonymous || !req.user.email) return stateRefusal("account_required");

  const tokenHash = await hashClaimToken(req.token);

  if (req.action === "status") {
    const s = (await call(deps, "custom_offer_claim_status", {
      _token_hash: tokenHash,
      _user_id: req.user.id,
    })) as { state: ClaimState; claim_expires_at?: string | null; purchase_status?: string | null; entitlement_ends_at?: string | null };
    // A buyable claim on a disabled offer reads as "not available yet"; every
    // other state (already paid, other account…) is still reported truthfully.
    if (!deps.config.enabled && (s.state === "available" || s.state === "checkout_open")) {
      return { state: "offer_disabled" };
    }
    return s;
  }

  // ---- checkout ------------------------------------------------------------
  if (!deps.config.enabled) {
    deps.log("custom-offer: checkout refused, offer disabled", { reason: deps.config.reason });
    return stateRefusal("offer_disabled");
  }

  const prep = (await call(deps, "custom_offer_prepare_checkout", {
    _token_hash: tokenHash,
    _user_id: req.user.id,
  })) as { ok: boolean; state: string; claim_id?: string; current_session_id?: string | null };
  if (!prep.ok || !prep.claim_id) return stateRefusal(prep.state);

  const nowMs = deps.now();
  const previous = prep.current_session_id ?? null;
  if (previous) {
    const existing = await deps.stripe.retrieveSession(previous);
    if (reusable(existing, nowMs)) return { url: existing.url!, reused: true };
    if (existing.status === "complete") return refuse("PAYMENT_PROCESSING", MESSAGES.PAYMENT_PROCESSING);
    if (existing.status === "open") await quietlyExpire(deps, previous); // too close to expiry
  }

  const price = await deps.stripe.retrievePrice(deps.config.priceId);
  const priceProblem = validateCustomOfferPrice(price, deps.config.automaticTax);
  if (priceProblem) {
    deps.log("custom-offer: configured price rejected", { problem: priceProblem });
    return stateRefusal("offer_disabled");
  }

  const customerId = await deps.stripe.findCustomerIdByEmail(req.user.email);
  const session = await deps.stripe.createSession(buildCheckoutSessionParams({
    priceId: deps.config.priceId,
    userId: req.user.id,
    email: req.user.email,
    customerId,
    claimId: prep.claim_id,
    origin: req.origin,
    automaticTax: deps.config.automaticTax,
    nowMs,
  }));

  const attached = (await call(deps, "custom_offer_attach_checkout", {
    _claim_id: prep.claim_id,
    _user_id: req.user.id,
    _previous_session_id: previous,
    _session_id: session.id,
    _session_expires_at: new Date((session.expires_at ?? 0) * 1000).toISOString(),
  })) as { result: string; current_session_id?: string | null };

  if (attached.result === "attached" && session.url) return { url: session.url };

  // Lost the race (or the claim changed under us): never leave a second
  // payable session behind.
  await quietlyExpire(deps, session.id);
  if (attached.result === "conflict" && attached.current_session_id) {
    const winner = await deps.stripe.retrieveSession(attached.current_session_id);
    if (reusable(winner, deps.now())) return { url: winner.url!, reused: true };
    return refuse("CHECKOUT_BUSY", MESSAGES.CHECKOUT_BUSY);
  }
  return stateRefusal("unavailable");
}
