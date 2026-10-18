// PT1.7 — the Gift Premium option on /lol/premium.
//
// "Buy a gift" appears only when the server says THIS account may buy the
// private annual gift (gift-checkout availability, fail closed). "Redeem a
// gift" is always offered: anyone can receive one.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GIFT_DISPLAY, GIFT_PAGE_PATH, GIFT_REDEEM_PATH, fetchGiftAvailability } from "@/lib/pro/gift";

export default function PremiumGiftEntry({ signedIn }: { signedIn: boolean }) {
  const [canGift, setCanGift] = useState(false);

  useEffect(() => {
    if (!signedIn) { setCanGift(false); return; }
    let cancelled = false;
    fetchGiftAvailability().then((a) => { if (!cancelled) setCanGift(a.available); });
    return () => { cancelled = true; };
  }, [signedIn]);

  return (
    <div className="mb-10 rounded-xl border border-primary/20 bg-card/40 p-4" data-testid="premium-gift-entry">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="font-semibold">Gift Premium</p>
            <p className="text-sm text-muted-foreground">
              {canGift
                ? `${GIFT_DISPLAY.priceLabel} total, once — ${GIFT_DISPLAY.days} days of Premium for someone else. Never renews.`
                : "Received a Premium gift? Redeem it with the email address it was sent to."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canGift && (
            <Button asChild size="sm" data-testid="premium-gift-buy"><Link to={GIFT_PAGE_PATH}>Gift Premium</Link></Button>
          )}
          <Button asChild size="sm" variant="outline" data-testid="premium-gift-redeem">
            <Link to={GIFT_REDEEM_PATH}>Redeem a gift</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
