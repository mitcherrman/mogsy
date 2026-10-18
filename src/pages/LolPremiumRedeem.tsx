// PT1.7 — /lol/premium/redeem[#CODE]: a recipient redeems a Premium gift.
//
// The page only asks. The server re-reads the payment from Stripe and the
// database redeems in one transaction, and only for a signed-in account whose
// VERIFIED email is the gift's recipient.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Gift, Loader2 } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { authHref } from "@/lib/auth/auth-destination";
import { formatGrantExpiry } from "@/lib/pro/entitlement";
import {
  GIFT_REDEEM_PATH,
  fetchReceivedGifts,
  isValidGiftCode,
  redeemGift,
  type ReceivedGift,
  type RedeemResult,
} from "@/lib/pro/gift";

const GOLD = "#c9a84c";
const KEEP = "mogzy:gift-code";

function initialCode(): string {
  const fromHash = window.location.hash.replace(/^#/, "");
  if (isValidGiftCode(fromHash)) {
    try { sessionStorage.setItem(KEEP, fromHash); } catch { /* storage unavailable */ }
    return fromHash.toUpperCase();
  }
  try {
    const kept = sessionStorage.getItem(KEEP);
    return isValidGiftCode(kept) ? kept.toUpperCase() : "";
  } catch {
    return "";
  }
}

export default function LolPremiumRedeem() {
  const { user, loading } = useAuth();
  const [code, setCode] = useState(initialCode);
  const [gifts, setGifts] = useState<ReceivedGift[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const signedIn = !!user && user.is_anonymous !== true;
  const verified = signedIn && !!user?.email_confirmed_at;

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    if (!verified) return;
    let cancelled = false;
    fetchReceivedGifts().then((g) => { if (!cancelled) setGifts(g ?? []); });
    return () => { cancelled = true; };
  }, [verified]);

  const redeem = useCallback(async (value: string) => {
    setBusy(true);
    const r = await redeemGift(value);
    setResult(r);
    setBusy(false);
    if (r.success) {
      try { sessionStorage.removeItem(KEEP); } catch { /* storage unavailable */ }
      setGifts((g) => (g ? g.filter((x) => x.redeemCode !== value.trim().toUpperCase()) : g));
    }
  }, []);

  let body: React.ReactNode;
  if (loading) body = <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Loading" />;
  else if (!signedIn) {
    body = (
      <div className="space-y-4" data-testid="redeem-sign-in">
        <p>Sign in — or create a free account — with the email address the gift was sent to.</p>
        <Button asChild style={{ background: GOLD, color: "#091428" }}>
          <Link to={authHref(GIFT_REDEEM_PATH, { mode: "signup" })}>Sign in or sign up</Link>
        </Button>
      </div>
    );
  } else if (!verified) {
    body = (
      <p data-testid="redeem-verify-email">
        Verify your email address first — open the confirmation link we sent to {user?.email}, then come back to redeem.
      </p>
    );
  } else if (result?.success) {
    body = (
      <div className="space-y-2" data-testid="redeem-success">
        <p className="text-lg font-semibold text-[#f5e9c8]">
          {result.giftType === "diamonds" ? "Diamonds added to your account." : "Premium is active."}
        </p>
        {result.grantEndsAt && (
          <p>{result.premiumDays} days of Premium — until {formatGrantExpiry(result.grantEndsAt)}. It does not renew.</p>
        )}
        <Button asChild variant="outline"><Link to="/lol/premium">Go to Premium</Link></Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        {gifts && gifts.length > 0 && (
          <ul className="space-y-3" data-testid="redeem-inbox">
            {gifts.map((g) => (
              <li key={g.giftId} className="rounded-lg border border-white/10 bg-black/20 p-3 text-left text-sm">
                <p className="font-semibold text-[#f5e9c8]">
                  {g.from} sent you {g.giftType === "diamonds" ? "diamonds" : "Mogzy Premium"}
                </p>
                {g.message && <p className="mt-1 italic">“{g.message}”</p>}
                <Button size="sm" className="mt-2" disabled={busy} onClick={() => void redeem(g.redeemCode)}
                  style={{ background: GOLD, color: "#091428" }}>Redeem</Button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <label className="block text-sm" htmlFor="gift-code">Gift code</label>
          <div className="flex gap-2">
            <Input id="gift-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF1234" autoComplete="off" data-testid="redeem-code" />
            <Button disabled={busy || !isValidGiftCode(code)} onClick={() => void redeem(code)} data-testid="redeem-submit">
              {busy ? "Redeeming…" : "Redeem"}
            </Button>
          </div>
        </div>
        {result && !result.success && (
          <p role="alert" className="text-sm text-red-400" data-testid="redeem-error">{result.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-xl px-4 py-8">
      <SEOHead title="Redeem a Mogzy gift" description="Redeem a Mogzy Premium gift." noindex />
      <div className="mb-8 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to Premium">
          <Link to="/lol/premium"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <Gift className="h-6 w-6" style={{ color: GOLD }} />
        <h1 className="text-2xl font-bold">Redeem a gift</h1>
      </div>
      <div className="rounded-2xl border p-6 text-center text-[#c8d4e6] sm:p-8"
        style={{ borderColor: `${GOLD}4d`, background: "linear-gradient(160deg, #0a1428, #091428 60%, #12233f)" }}>
        {body}
      </div>
    </div>
  );
}
