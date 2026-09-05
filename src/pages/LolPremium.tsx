import { useEffect, useState } from "react";
import { authHref } from "@/lib/auth/auth-destination";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  Check,
  History,
  BookX,
  BarChart3,
  LineChart,
  SlidersHorizontal,
  Swords,
  Save,
  GraduationCap,
  Layers,
  Sparkles,
  CreditCard,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetchProEntitlement, formatGrantExpiry, type ProEntitlement } from "@/lib/pro/entitlement";
import { quizApi } from "@/lib/quiz/api";
import { useAuth } from "@/hooks/useAuth";
import {
  startLolProCheckout,
  openBillingPortal,
  fetchOfferAvailability,
  isOfferPurchasable,
  formatOfferPrice,
  offerForInterval,
  type BillingInterval,
  type OfferAvailability,
  type PricingMode,
} from "@/lib/pro/checkout";
import { annualSavingsPct, STANDARD_OFFERS } from "@/lib/pro/offers";

const GOLD = "#c9a84c";

const FREE_FEATURES = [
  "Play quizzes as a guest — no account needed",
  "Daily challenge and free quiz sets",
  "Basic results after every quiz",
  "Your last 10 quiz results saved",
  "Missed-answer review on each results screen",
  "Watch and play live quiz content",
  "Share your quiz results",
];

type PremiumFeature = {
  title: string;
  description: string;
  Icon: React.ElementType;
  comingSoon?: boolean;
};

const PREMIUM_FEATURES: PremiumFeature[] = [
  {
    title: "Full Quiz History",
    description: "Every result you've ever posted, not just the last 10.",
    Icon: History,
  },
  {
    // PT1.8. Named for the QUESTION it answers, and scoped honestly: the
    // windows are the three the server offers, and the record it reads is
    // Practice + Time Trial. Nothing here promises a figure the product
    // cannot derive from the attempt log it already keeps.
    title: "Performance Trends",
    description: "See how your Practice & Time Trial accuracy and study volume have moved over 7, 30 or 90 days, and which weak spots keep coming back.",
    Icon: LineChart,
  },
  {
    title: "Missed Question Bank",
    description: "Review every question you missed across all your quizzes.",
    Icon: BookX,
  },
  {
    // PT1.7B. This entry used to read "Advanced Category Stats — see your
    // accuracy by champions, items, abilities, and more". PT1.7A made
    // per-category accuracy FREE (Knowledge Breakdown on /quiz), so the old
    // bullet promised to withdraw a capability players already have. What
    // Premium actually adds is acting on those numbers.
    title: "Weakness Targeting",
    description: "Turn your weakest categories into a practice set, on demand.",
    Icon: BarChart3,
  },
  {
    title: "Custom Practice Filters",
    // Champion and item are NOT claimed: the bank does not record which
    // champion a question is about in a way the Builder can safely read, so
    // the copy names the filters that exist.
    description: "Build practice sets by category, subject, difficulty and length — and save them.",
    Icon: SlidersHorizontal,
  },
  {
    title: "Unlimited Combat Lab",
    description: "Run as many simulations as you want, no caps.",
    Icon: Swords,
    comingSoon: true,
  },
  {
    title: "Unlimited Saves & Exports",
    description: "Save and export every Combat Lab simulation you run.",
    Icon: Save,
    comingSoon: true,
  },
  {
    title: "Curated Learning Journeys",
    description: "Guided quiz paths that build real game knowledge.",
    Icon: GraduationCap,
    comingSoon: true,
  },
  {
    title: "Earned Matchup Cards",
    description: "Beat the set. Unlock the card.",
    Icon: Layers,
    comingSoon: true,
  },
];

/** This page's route — where auth must return a user it interrupted here. */
const LOL_PREMIUM_ROUTE = "/lol/premium";

export default function LolPremium() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAnonymous = !user || user.is_anonymous === true;
  const [isPremium, setIsPremium] = useState(false);
  // ADMIN1A/PT1.4 provenance for the SIGNED-IN caller, used only to decide what
  // a member is offered: a paid subscriber gets the Stripe billing portal, a
  // comped account is told plainly that there is no billing to manage. Null
  // while unresolved, which renders neither action.
  const [provenance, setProvenance] = useState<ProEntitlement | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  // PT1.5: /lol/premium sells the same approved offers as the Shop. The price
  // list and what is actually purchasable both come from the server, which is
  // the same authority create-checkout applies — so the page cannot advertise a
  // plan the checkout would refuse. `available: null` means "not known yet or
  // not answerable": the buyer is allowed to try and the server refuses
  // honestly, which is better than disabling a checkout that in fact works.
  const [availability, setAvailability] = useState<OfferAvailability>({
    mode: "standard",
    available: null,
  });
  const pricingMode: PricingMode = availability.mode;
  const offer = offerForInterval(billingInterval, pricingMode);
  const offerPurchasable = isOfferPurchasable(offer.id, availability);
  const standardOffer = STANDARD_OFFERS[billingInterval];
  const showSuccess = searchParams.get("success") === "true";
  const showCanceled = searchParams.get("canceled") === "true";

  useEffect(() => {
    let cancelled = false;
    fetchOfferAvailability().then((a) => { if (!cancelled) setAvailability(a); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authLoading || !user || user.is_anonymous) return;
    let cancelled = false;
    // The backend entitlement is what actually gates history and the missed
    // bank, so the banner uses the same interpretation. The direct profile
    // read remains only as a display fallback when the lookup is unavailable.
    quizApi
      .getEntitlement()
      .then((res) => {
        if (!cancelled) setIsPremium(!!res.is_pro);
      })
      .catch(() => {
        // PT1.4 fallback: the canonical entitlement resolver, never a raw
        // profiles.is_pro read (that is the Stripe half only).
        fetchProEntitlement().then((entitlement) => {
          if (!cancelled && entitlement) setIsPremium(entitlement.effectivePro);
        });
      });
    return () => { cancelled = true; };
  }, [authLoading, user]);

  // Only members need provenance, so this costs a Free user nothing. The RPC is
  // self-scoped (`my_pro_entitlement` resolves auth.uid() itself), so it can
  // only ever answer for the caller.
  useEffect(() => {
    if (!isPremium) { setProvenance(null); return; }
    let cancelled = false;
    fetchProEntitlement().then((e) => { if (!cancelled) setProvenance(e); });
    return () => { cancelled = true; };
  }, [isPremium]);

  const handleManageBilling = async () => {
    setOpeningPortal(true);
    try {
      await openBillingPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Billing portal could not be opened.");
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleUpgrade = async () => {
    if (!offerPurchasable) {
      // Reached only if the state changed between render and click; the button
      // is disabled for this case. Same wording the server refusal produces.
      toast.info("This plan isn’t available yet — check back shortly.");
      return;
    }
    if (isAnonymous) {
      toast.info("Create a free account first — your guest progress comes with you.");
      // Return to Premium after signup: this interruption exists only because
      // the user pressed Checkout HERE.
      navigate(authHref(LOL_PREMIUM_ROUTE, { mode: "signup" }));
      return;
    }
    setCheckingOut(true);
    try {
      await startLolProCheckout(billingInterval, pricingMode);
    } catch (err) {
      // startProCheckout has already turned a server refusal into a readable
      // message; anything else is a transport failure.
      toast.error(err instanceof Error ? err.message : "Checkout could not be started.");
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <SEOHead
        title="Mogzy Premium — Practice Smarter at League"
        description="Track your full quiz history, review missed questions, train weak spots, and unlock Matchup Cards with Mogzy Premium."
      />

      <div className="mb-8 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to LoL hub">
          <Link to="/lol"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <Crown className="h-6 w-6" style={{ color: GOLD }} />
        <h1 className="text-2xl font-bold">Mogzy Premium</h1>
      </div>

      {showSuccess && !isPremium && (
        <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          Thanks for upgrading — your Premium status may take a moment to activate.
        </div>
      )}
      {showCanceled && !isPremium && (
        <div className="mb-6 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          Checkout canceled. You can keep playing free.
        </div>
      )}

      {/* Hero */}
      <div
        className="mb-10 rounded-2xl border p-8 text-center"
        style={{ borderColor: `${GOLD}4d`, background: "linear-gradient(160deg, #0a1428, #091428 60%, #12233f)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
          Practice smarter
        </p>
        <h2 className="mx-auto mt-3 max-w-xl text-3xl font-bold text-[#f5e9c8]">
          Track your progress. Review your mistakes. Practice smarter.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[#c8d4e6]">
          Mogzy Premium helps serious League players practice smarter. Track your full quiz
          history, review missed questions, train weak spots, and unlock Matchup Cards
          by completing curated quiz sets.
        </p>

        {isPremium ? (
          <div data-testid="premium-membership" className="mt-6 flex flex-col items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-semibold"
                 style={{ borderColor: `${GOLD}80`, color: "#f0d78c" }}>
              <Sparkles className="h-4 w-4" />
              You’re Premium — everything below is unlocked.
            </div>

            {/* Your membership. Which action a member gets is decided by WHERE
                the entitlement came from, never by the fact that they have it:
                a comped account has no Stripe customer, and sending it to the
                billing portal would be a dead end dressed as a feature. */}
            {provenance?.stripePro && (
              <>
                <p className="text-xs text-[#c8d4e6]/80" data-testid="premium-source-line">
                  Billed through Stripe.
                  {provenance.grantKind && (
                    <> You also hold a {provenance.grantKind} grant on this account.</>
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="premium-manage-billing"
                  onClick={handleManageBilling}
                  disabled={openingPortal}
                  className="border-[#c9a84c80] bg-transparent text-[#f0d78c] hover:bg-[#c9a84c1a] hover:text-[#f5e9c8]"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {openingPortal ? "Opening billing…" : "Manage billing"}
                </Button>
              </>
            )}

            {provenance && !provenance.stripePro && provenance.grantKind && (
              <p className="text-xs text-[#c8d4e6]/80" data-testid="premium-grant-line">
                Complimentary Premium ({provenance.grantKind}
                {formatGrantExpiry(provenance.grantExpiresAt)
                  ? `, ${formatGrantExpiry(provenance.grantExpiresAt)}`
                  : ", no expiry"}
                ). There is no subscription or payment method on this account, so
                there is nothing to manage — and nothing to cancel.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* PT1.5: interval choice over the SAME Mogzy Premium. A launch price is
                a discount off the standard price, never a different product. */}
            <div
              className="mt-6 inline-flex items-center rounded-full border p-0.5"
              style={{ borderColor: `${GOLD}4d` }}
              role="tablist"
              aria-label="Billing period"
            >
              {(["month", "year"] as const).map((iv) => (
                <button
                  key={iv}
                  role="tab"
                  aria-selected={billingInterval === iv}
                  onClick={() => setBillingInterval(iv)}
                  className="rounded-full px-4 py-1.5 text-xs font-bold transition-colors sm:text-sm"
                  style={billingInterval === iv
                    ? { background: GOLD, color: "#0a1428" }
                    : { color: "#c8d4e6" }}
                >
                  {iv === "month" ? "Monthly" : `Yearly · save ${annualSavingsPct(pricingMode)}%`}
                </button>
              ))}
            </div>

            <p className="mt-4 text-3xl font-bold text-[#f5e9c8]">
              {formatOfferPrice(offer.priceCents)}
              <span className="text-base font-normal text-[#c8d4e6]">
                {billingInterval === "year" ? "/year" : "/month"}
              </span>
            </p>
            {pricingMode === "launch" && (
              <p className="mt-1 text-xs text-[#c8d4e6]/70">
                Launch offer — normally{" "}
                <span className="line-through">{formatOfferPrice(standardOffer.priceCents)}</span>
                {billingInterval === "year" ? "/year" : "/month"}. Same Mogzy Premium.
              </p>
            )}

            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={handleUpgrade}
                disabled={checkingOut || authLoading || !offerPurchasable}
                className="border-0 font-semibold text-[#0a1428] hover:opacity-90"
                style={{ background: `linear-gradient(90deg, ${GOLD}, #a8862f)` }}
              >
                <Crown className="mr-2 h-4 w-4" />
                {checkingOut ? "Opening checkout…" : "Upgrade to Mogzy Premium"}
              </Button>
              <Button asChild size="lg" variant="ghost" className="text-[#c8d4e6] hover:text-white">
                <Link to="/quiz">Keep playing free</Link>
              </Button>
            </div>
            {!offerPurchasable && (
              // Truthful, and specific about WHICH plan: when only one interval
              // has a configured Stripe Price, saying "checkout is coming soon"
              // would be wrong about the other one.
              <p className="mt-3 text-xs" style={{ color: GOLD }} role="status">
                {isOfferPurchasable(offerForInterval(billingInterval === "year" ? "month" : "year", pricingMode).id, availability)
                  ? `${billingInterval === "year" ? "Yearly" : "Monthly"} billing isn’t available yet — ${billingInterval === "year" ? "monthly" : "yearly"} is.`
                  : "Mogzy Premium checkout isn’t open yet."}
              </p>
            )}
          </>
        )}
      </div>

      {/* Premium features */}
      <h3 className="mb-4 text-lg font-semibold">What Premium unlocks</h3>
      <div className="mb-10 grid gap-3 sm:grid-cols-2">
        {PREMIUM_FEATURES.map((f) => (
          <Card key={f.title} className="border-primary/20">
            <CardContent className="flex items-start gap-3 py-4">
              <f.Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: GOLD }} />
              <div>
                <p className="font-medium">
                  {f.title}
                  {f.comingSoon && (
                    <Badge variant="outline" className="ml-2 align-middle text-[10px] uppercase">
                      Coming soon
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Free tier — honest baseline */}
      <h3 className="mb-4 text-lg font-semibold">Free, forever</h3>
      <Card>
        <CardContent className="py-5">
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {!isPremium && (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Subscriptions are handled securely by Stripe. Cancel anytime.
        </p>
      )}
    </div>
  );
}
