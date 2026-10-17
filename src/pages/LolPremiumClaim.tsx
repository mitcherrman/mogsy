// PT1.6b — /lol/premium/claim#<token>: the private, customer-specific one-time
// Premium offer ($50 total, 12 months, paid once, never renewed).
//
// The page only ever ASKS: what this account may do with the claim, and to
// start (or resume) its one Stripe Checkout. It never shows Premium as active
// because a checkout returned — Premium is activated by stripe-webhook after
// Stripe confirms the payment, and the page waits for the server to say so.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Crown, Loader2 } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { authHref } from "@/lib/auth/auth-destination";
import { formatGrantExpiry } from "@/lib/pro/entitlement";
import {
  CUSTOM_OFFER_CLAIM_PATH,
  CUSTOM_OFFER_DISPLAY,
  CustomOfferCheckoutError,
  fetchClaimStatus,
  readClaimToken,
  startCustomOfferCheckout,
  type ClaimStatus,
} from "@/lib/pro/customOffer";

const GOLD = "#c9a84c";
/** After Stripe returns, how long to wait for the webhook before saying so. */
const ACTIVATION_POLL_MS = 3000;
const ACTIVATION_POLL_LIMIT = 20;

const BLOCKED_COPY: Partial<Record<ClaimStatus["state"], string>> = {
  other_account: "This offer was reserved for a different Mogzy account. Sign in with that account to use it.",
  account_required: "Sign in with a full Mogzy account (not a guest session) to use this offer.",
  active_subscription:
    "You already have an active Premium subscription. This offer is a separate one-time year — cancel the subscription in Manage billing first, or keep it as it is.",
  permanent_premium: "Your account already has Premium that does not expire, so there is nothing to buy.",
  unavailable: "This offer link has expired or is no longer available. Ask for a new link if you still want it.",
  offer_disabled: "This offer isn't available just yet. Your link still works — check back soon.",
};

export default function LolPremiumClaim() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const returned = searchParams.get("checkout");
  const [token] = useState<string | null>(() => readClaimToken(window.location.hash));
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [waitedOut, setWaitedOut] = useState(false);
  const polls = useRef(0);
  const signedIn = !!user && user.is_anonymous !== true;

  // Keep the token out of the address bar once it is remembered.
  useEffect(() => {
    if (token && window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    const s = await fetchClaimStatus(token);
    setLoadFailed(!s);
    setStatus(s);
    return s;
  }, [token]);

  useEffect(() => {
    if (authLoading || !signedIn || !token) return;
    void load();
  }, [authLoading, signedIn, token, load]);

  // Returned from a successful Stripe payment: wait for the webhook.
  useEffect(() => {
    if (returned !== "success" || !status || status.state === "already_paid") return;
    if (polls.current >= ACTIVATION_POLL_LIMIT) { setWaitedOut(true); return; }
    const t = window.setTimeout(() => { polls.current += 1; void load(); }, ACTIVATION_POLL_MS);
    return () => window.clearTimeout(t);
  }, [returned, status, load]);

  const pay = async () => {
    if (!token) return;
    setPaying(true);
    setPayError(null);
    try {
      await startCustomOfferCheckout(token);
    } catch (e) {
      setPayError(e instanceof CustomOfferCheckoutError ? e.message : "Checkout could not be started.");
      if (e instanceof CustomOfferCheckoutError && e.code) void load();
      setPaying(false);
    }
  };

  const ends = formatGrantExpiry(status?.entitlementEndsAt ?? null);

  let body: React.ReactNode;
  if (!token) {
    body = <p data-testid="claim-no-token">This page opens from a private offer link. Use the link you were sent.</p>;
  } else if (authLoading) {
    body = <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Loading" />;
  } else if (!signedIn) {
    body = (
      <div className="space-y-4" data-testid="claim-sign-in">
        <p>Sign in to your Mogzy account to claim this offer. It will be reserved for the account you use.</p>
        <Button asChild style={{ background: GOLD, color: "#091428" }}>
          <Link to={authHref(CUSTOM_OFFER_CLAIM_PATH, { mode: "signin" })}>Sign in</Link>
        </Button>
      </div>
    );
  } else if (loadFailed) {
    body = (
      <div className="space-y-4">
        <p>We couldn't check this offer right now.</p>
        <Button variant="outline" onClick={() => void load()}>Try again</Button>
      </div>
    );
  } else if (!status) {
    body = <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Loading" />;
  } else if (status.state === "already_paid") {
    body = status.purchaseStatus === "paid" ? (
      <div className="space-y-2" data-testid="claim-paid">
        <p className="text-lg font-semibold text-[#f5e9c8]">Premium is active{ends ? ` until ${ends}` : ""}.</p>
        <p>You paid once. It does not renew and nothing will be charged again.</p>
        <Button asChild variant="outline"><Link to="/lol/premium">Go to Premium</Link></Button>
      </div>
    ) : (
      <p data-testid="claim-paid-other">
        This offer has already been used on your account
        {status.purchaseStatus === "refunded" ? " and was refunded" : ""}. Contact support if something looks wrong.
      </p>
    );
  } else if (returned === "success") {
    body = (
      <div className="space-y-2" data-testid="claim-activating">
        {!waitedOut && <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-hidden />}
        <p>
          {waitedOut
            ? "Your payment is still being confirmed. Premium turns on automatically once Stripe confirms it — you can close this page."
            : "Payment received — confirming with Stripe and turning on your Premium…"}
        </p>
      </div>
    );
  } else if (status.state === "available" || status.state === "checkout_open") {
    body = (
      <div className="space-y-5" data-testid="claim-offer">
        {returned === "canceled" && (
          <p className="text-sm text-muted-foreground">Checkout canceled. Nothing was charged and the offer is still reserved for you.</p>
        )}
        <div>
          <p className="text-4xl font-bold text-[#f5e9c8]">{CUSTOM_OFFER_DISPLAY.priceLabel} <span className="text-base font-normal text-[#c8d4e6]">total</span></p>
          <p className="mt-1 text-[#c8d4e6]">{CUSTOM_OFFER_DISPLAY.months} months of Mogzy Premium, paid once.</p>
        </div>
        <ul className="mx-auto max-w-sm space-y-1 text-left text-sm text-[#c8d4e6]">
          <li>• One payment. No subscription, and it never renews.</li>
          <li>• Premium starts when the payment is confirmed and lasts 12 calendar months.</li>
          <li>• This private offer is for one account: the one you are signed in with.</li>
        </ul>
        {status.claimExpiresAt && (
          <p className="text-xs text-muted-foreground">Offer link valid until {formatGrantExpiry(status.claimExpiresAt)}.</p>
        )}
        <Button onClick={pay} disabled={paying} data-testid="claim-pay" style={{ background: GOLD, color: "#091428" }}>
          {paying ? "Opening secure checkout…" : status.state === "checkout_open" ? "Continue to checkout" : `Pay ${CUSTOM_OFFER_DISPLAY.priceLabel}`}
        </Button>
        {payError && <p className="text-sm text-red-400" role="alert">{payError}</p>}
      </div>
    );
  } else {
    body = <p data-testid={`claim-${status.state}`}>{BLOCKED_COPY[status.state] ?? BLOCKED_COPY.unavailable}</p>;
  }

  return (
    <div className="container mx-auto max-w-xl px-4 py-8">
      <SEOHead title="Mogzy Premium — Private offer" description="A private Mogzy Premium offer." noindex />
      <div className="mb-8 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to Premium">
          <Link to="/lol/premium"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <Crown className="h-6 w-6" style={{ color: GOLD }} />
        <h1 className="text-2xl font-bold">Private Premium offer</h1>
      </div>
      <div
        className="rounded-2xl border p-8 text-center text-[#c8d4e6]"
        style={{ borderColor: `${GOLD}4d`, background: "linear-gradient(160deg, #0a1428, #091428 60%, #12233f)" }}
      >
        {body}
      </div>
    </div>
  );
}
