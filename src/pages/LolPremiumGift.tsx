// PT1.7 — /lol/premium/gift: buy a year of Premium for someone ($50 total,
// one-time, never renews), and the return page after Stripe.
//
// The page never decides that a gift is paid. After Stripe redirects back
// (?gift=<id>&checkout=success) it asks the server, which re-reads Stripe; the
// redeem code is shown only once the server reports the gift as paid.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Copy, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { authHref } from "@/lib/auth/auth-destination";
import { formatGrantExpiry } from "@/lib/pro/entitlement";
import {
  GIFT_DISPLAY,
  GIFT_MESSAGE_MAX,
  GIFT_PAGE_PATH,
  GiftError,
  fetchBuyerGift,
  fetchGiftAvailability,
  redeemLink,
  startGiftCheckout,
  type BuyerGift,
  type GiftAvailability,
} from "@/lib/pro/gift";

const GOLD = "#c9a84c";
const POLL_MS = 3000;
const POLL_LIMIT = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_COPY: Record<string, string> = {
  refunded: "This gift was refunded, so it can no longer be redeemed.",
  disputed: "This gift's payment is under review, so it can't be redeemed right now.",
  expired: "This checkout ended without a payment. Nothing was charged.",
  invalid: "This payment didn't match the gift's terms, so the gift wasn't issued. Contact support for a refund.",
};

function Panel({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-2xl border p-6 text-[#c8d4e6] sm:p-8"
      style={{ borderColor: `${GOLD}4d`, background: "linear-gradient(160deg, #0a1428, #091428 60%, #12233f)" }}
    >
      {children}
    </div>
  );
}

function GiftReturn({ giftId, returned }: { giftId: string; returned: string | null }) {
  const [gift, setGift] = useState<BuyerGift | null>(null);
  const [failed, setFailed] = useState(false);
  const [waitedOut, setWaitedOut] = useState(false);
  const polls = useRef(0);

  const load = useCallback(async () => {
    const g = await fetchBuyerGift(giftId);
    setFailed(!g);
    setGift(g);
  }, [giftId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (returned !== "success" || !gift || gift.status !== "pending") return;
    if (polls.current >= POLL_LIMIT) { setWaitedOut(true); return; }
    const t = window.setTimeout(() => { polls.current += 1; void load(); }, POLL_MS);
    return () => window.clearTimeout(t);
  }, [returned, gift, load]);

  if (failed) return <Panel testId="gift-return-unknown"><p>We couldn't find that gift on your account.</p></Panel>;
  if (!gift) return <Panel><Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Loading" /></Panel>;

  if (gift.status === "paid" || gift.status === "redeemed") {
    const link = gift.redeemCode ? redeemLink(window.location.origin, gift.redeemCode) : null;
    return (
      <Panel testId="gift-confirmed">
        <p className="text-lg font-semibold text-[#f5e9c8]">
          {gift.status === "redeemed" ? "Your gift has been redeemed." : "Gift confirmed — payment received."}
        </p>
        {gift.status === "paid" && (
          <div className="mt-4 space-y-3 text-sm">
            <p>
              Send this to <strong className="text-[#f5e9c8]">{gift.recipientEmail}</strong>. They sign in to Mogzy with
              that email address, verify it, and redeem the gift for {GIFT_DISPLAY.days} days of Premium starting that day.
            </p>
            <p>
              Gift code: <code data-testid="gift-code" className="rounded bg-black/30 px-2 py-0.5 text-base text-[#f5e9c8]">{gift.redeemCode}</code>
            </p>
            {link && (
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-black/30 px-2 py-1 text-xs">{link}</code>
                <Button size="sm" variant="outline" className="gap-1"
                  onClick={() => { void navigator.clipboard?.writeText(link); toast.success("Link copied"); }}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy link
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Only an account with that verified email can redeem it.</p>
          </div>
        )}
        {gift.status === "redeemed" && gift.redeemedAt && (
          <p className="mt-2 text-sm">Redeemed on {formatGrantExpiry(gift.redeemedAt)}.</p>
        )}
      </Panel>
    );
  }

  if (gift.status === "pending") {
    return (
      <Panel testId="gift-pending">
        {returned === "canceled" ? (
          <p>Checkout canceled. Nothing was charged.</p>
        ) : (
          <div className="space-y-2 text-center">
            {!waitedOut && <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-hidden />}
            <p>
              {waitedOut
                ? "Stripe hasn't confirmed this payment yet. Your gift appears here as soon as it does — you can close this page and come back."
                : "Confirming your payment with Stripe…"}
            </p>
          </div>
        )}
      </Panel>
    );
  }

  return <Panel testId={`gift-${gift.status}`}><p>{STATUS_COPY[gift.status] ?? STATUS_COPY.invalid}</p></Panel>;
}

function GiftForm() {
  const { user } = useAuth();
  const [availability, setAvailability] = useState<GiftAvailability | null>(null);
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGiftAvailability().then((a) => { if (!cancelled) setAvailability(a); });
    return () => { cancelled = true; };
  }, []);

  if (!availability) return <Panel><Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Loading" /></Panel>;
  if (!availability.available) {
    return <Panel testId="gift-unavailable"><p>Gifting Premium isn't available on this account right now.</p></Panel>;
  }
  const verified = availability.emailVerified && !!user?.email_confirmed_at;
  if (!verified) {
    return (
      <Panel testId="gift-verify-email">
        <p>Verify your email address before buying a gift. Check your inbox for the confirmation link, then come back.</p>
      </Panel>
    );
  }

  const email = recipient.trim().toLowerCase();
  const emailOk = EMAIL_RE.test(email) && email !== (user?.email ?? "").toLowerCase();
  const canPay = emailOk && understood && message.length <= GIFT_MESSAGE_MAX && !paying;

  const pay = async () => {
    setPaying(true);
    setError(null);
    try {
      await startGiftCheckout(email, message.trim());
    } catch (e) {
      setError(e instanceof GiftError ? e.message : "Checkout could not be started.");
      setPaying(false);
    }
  };

  return (
    <Panel testId="gift-form">
      <div className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span>Recipient's email</span>
          <Input type="email" autoComplete="off" placeholder="friend@example.com" value={recipient}
            onChange={(e) => setRecipient(e.target.value)} data-testid="gift-recipient" />
          <span className="block text-xs text-muted-foreground">
            Only a Mogzy account with this verified email can redeem the gift.
          </span>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Message (optional)</span>
          <Textarea maxLength={GIFT_MESSAGE_MAX} rows={3} value={message}
            onChange={(e) => setMessage(e.target.value)} data-testid="gift-message" />
        </label>

        <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm" data-testid="gift-review">
          <div className="flex items-baseline justify-between">
            <span>Mogzy Premium gift — 12 months</span>
            <span className="text-2xl font-bold text-[#f5e9c8]">{GIFT_DISPLAY.priceLabel}.00</span>
          </div>
          <p className="mt-1 text-right text-xs">Total, USD</p>
          <ul className="mt-3 space-y-1 text-xs">
            <li>• One payment. No subscription — it never renews and nothing is charged again.</li>
            <li>• The recipient gets {GIFT_DISPLAY.days} days of Premium from the day they redeem it.</li>
            <li>• You'll get a gift code and link to send them after payment is confirmed.</li>
          </ul>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={understood} onChange={(e) => setUnderstood(e.target.checked)}
            data-testid="gift-understood" />
          <span>I understand this is a one-time {GIFT_DISPLAY.priceLabel} purchase that does not renew.</span>
        </label>

        <Button onClick={pay} disabled={!canPay} data-testid="gift-pay" style={{ background: GOLD, color: "#091428" }}>
          {paying ? "Opening secure checkout…" : `Pay ${GIFT_DISPLAY.priceLabel} with Stripe`}
        </Button>
        {recipient && !emailOk && <p className="text-xs text-red-400">Enter someone else's email address.</p>}
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      </div>
    </Panel>
  );
}

export default function LolPremiumGift() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const giftId = params.get("gift");
  const returned = params.get("checkout");
  const signedIn = !!user && user.is_anonymous !== true;

  let body: React.ReactNode;
  if (loading) body = <Panel><Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Loading" /></Panel>;
  else if (!signedIn) {
    body = (
      <Panel testId="gift-sign-in">
        <p className="mb-4">Sign in to your Mogzy account to buy a gift.</p>
        <Button asChild style={{ background: GOLD, color: "#091428" }}>
          <Link to={authHref(`${GIFT_PAGE_PATH}${giftId ? `?gift=${giftId}` : ""}`, { mode: "signin" })}>Sign in</Link>
        </Button>
      </Panel>
    );
  } else if (giftId && returned !== "canceled") body = <GiftReturn giftId={giftId} returned={returned} />;
  else {
    body = (
      <div className="space-y-4">
        {returned === "canceled" && (
          <p className="text-sm text-muted-foreground" data-testid="gift-canceled">Checkout canceled. Nothing was charged.</p>
        )}
        <GiftForm />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-xl px-4 py-8">
      <SEOHead title="Gift Mogzy Premium" description="Give a year of Mogzy Premium." noindex />
      <div className="mb-8 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to Premium">
          <Link to="/lol/premium"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <Gift className="h-6 w-6" style={{ color: GOLD }} />
        <h1 className="text-2xl font-bold">Gift Premium</h1>
      </div>
      {body}
    </div>
  );
}
