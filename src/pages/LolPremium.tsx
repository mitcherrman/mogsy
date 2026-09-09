import { useEffect, useState } from "react";
import { authHref } from "@/lib/auth/auth-destination";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  Check,
  History,
  BookX,
  LineChart,
  SlidersHorizontal,
  Save,
  Sparkles,
  Target,
  Library,
  Palette,
  Swords,
  Layers,
  GraduationCap,
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
import {
  benefitById,
  benefitsInGroup,
  comingSoonBenefits,
  freeBenefits,
  populatedGroups,
  premiumBenefits,
  type PremiumBenefit,
} from "@/lib/premium/matrix";

const GOLD = "#c9a84c";

/**
 * PT1.13 — every benefit claim on this page now comes from the canonical
 * matrix (`@/lib/premium/matrix`), which describes what the SHIPPED product
 * actually does. Nothing on this page may state a benefit that is not a row
 * there, and `presentableBenefits()` withholds anything `partial` or
 * `planned` — so a feature cannot be advertised as available before it is.
 *
 * WHAT THIS REMOVED, AND WHY. The hand-maintained list carried four "Coming
 * soon" cards. Two of them ("Unlimited Combat Lab", "Unlimited Saves &
 * Exports") described capabilities Free ALREADY HAS, unlimited, today — the
 * page was promising to withdraw something. Those two are gone for good: a
 * status can never make them true, because they are already true for
 * everyone.
 *
 * PT1.13B — THE OTHER TWO CAME BACK, AND THE PAGE BECAME A CHECKLIST.
 * "Learning Journeys" and "Matchup Cards" describe features that do not
 * exist, which is a reason to label them honestly rather than to hide them:
 * a buyer deciding today is entitled to know what is being built. So the
 * comparison now renders `presentableBenefits()` — available AND upcoming —
 * and marks the difference with a Coming soon pill instead of a checkmark.
 *
 * The safety property is that "Coming soon" is not a decoration this page
 * chooses. It is `status !== "shipped"` read off the canonical row, so the
 * only way to present something as available is to change the matrix, and
 * changing the matrix updates every surface at once. There is no roadmap
 * list here to fall out of date with the product.
 *
 * WHAT UPCOMING ROWS MAY NEVER DO: appear in the hero, appear in the lead
 * cards, or appear in the page metadata. Those three read from
 * `premiumBenefits()`, which is shipped-only, and the tests assert it.
 *
 * The matrix carries no icons on purpose — it is product data, imported by
 * tests and by an admin reference, and none of those want React. The mapping
 * from a benefit id to its glyph is presentation, so it lives here.
 */
const BENEFIT_ICONS: Record<string, React.ElementType> = {
  "practice-builder": SlidersHorizontal,
  "practice-pools": Library,
  "saved-practice-sets": Save,
  "performance-trends": LineChart,
  "recurring-weaknesses": Target,
  "study-history": History,
  "missed-question-bank": BookX,
  "profile-themes": Palette,
  "profile-frames": Palette,
  "team-combat": Swords,
  "matchup-cards": Layers,
  "curated-learning-journeys": GraduationCap,
};

/**
 * The four benefits the page leads with, in this order.
 *
 * A curated subset, not a computed one: "most valuable" is an editorial
 * judgement and pretending to derive it would just hide the decision. Each id
 * is asserted to be a real, shipped, differentiating row at render time by
 * `leadBenefits()`, so this list cannot outlive the matrix it points into.
 */
const LEAD_BENEFIT_IDS = [
  "performance-trends",
  "missed-question-bank",
  "practice-builder",
  "study-history",
] as const;

function leadBenefits(): PremiumBenefit[] {
  const sellable = new Set(premiumBenefits().map((b) => b.id));
  return LEAD_BENEFIT_IDS.map(benefitById).filter(
    (b): b is PremiumBenefit => !!b && sellable.has(b.id)
  );
}

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
        description="Mogzy Premium: your full quiz history, every question you have missed, performance trends over 7/30/90 days, and a practice builder that turns your weak spots into a set."
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
        {/* PT1.13 — every clause here is a shipped row in the canonical
            matrix. The previous copy ended on "unlock Matchup Cards by
            completing curated quiz sets", which describes a feature that
            exists in neither repository. */}
        <p className="mx-auto mt-3 max-w-xl text-sm text-[#c8d4e6]">
          Playing is free — Ranked, Time Trial, the practice sets, the Combat Lab and
          your own recent results. Premium is for reading your record over time: full
          history, every question you have missed, and a builder that turns your weak
          spots into the set you play next.
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

      {/* ── Lead benefits ──────────────────────────────────────────────
          Four cards, not nine. The full list is directly below in the
          comparison; leading with all of it makes none of it land. */}
      <h3 className="mb-4 text-lg font-semibold">What Premium adds</h3>
      <div className="mb-10 grid gap-3 sm:grid-cols-2">
        {leadBenefits().map((b) => {
          const Icon = BENEFIT_ICONS[b.id] ?? Sparkles;
          return (
            <Card key={b.id} data-testid={`premium-lead-${b.id}`} className="border-primary/20">
              <CardContent className="flex items-start gap-3 py-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: GOLD }} />
                <div>
                  <p className="font-medium">{b.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{b.userFacingSummary}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Free vs Premium, group by group ────────────────────────────
          The definitive comparison, and the living checklist.

          Rows come from the matrix and include the ones where the two
          columns are IDENTICAL — those are the point: a reader deciding
          whether to pay is owed the parts they already have, and a list of
          only the differences reads as a list of things being withheld.

          They also include what is still being built, marked Coming soon.
          The three states are visually distinct and each is a direct read of
          the row: no mark = both tiers have it, a gold check = Premium has it
          now, a Coming soon pill = `status !== "shipped"`. */}
      <h3 className="mb-1 text-lg font-semibold">Free vs Premium</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {premiumBenefits().length} things Premium unlocks today, and{" "}
        {comingSoonBenefits().length} more on the way — marked{" "}
        <span className="font-medium">Coming soon</span>, never counted as
        included.
      </p>
      <div className="mb-10 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm" data-testid="premium-comparison">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="w-[30%] py-2 pr-3 font-semibold">Feature</th>
              <th scope="col" className="w-[35%] py-2 pr-3 font-semibold">Free</th>
              <th scope="col" className="w-[35%] py-2 font-semibold" style={{ color: GOLD }}>Premium</th>
            </tr>
          </thead>
          {populatedGroups().map((group) => (
            <tbody key={group.id} data-testid={`premium-group-${group.id}`}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={3}
                  className="pt-5 pb-1 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {group.label}
                </th>
              </tr>
              {benefitsInGroup(group.id).map((b) => (
                <tr key={b.id} data-testid={`premium-row-${b.id}`} className="border-b align-top last:border-b-0">
                  <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                    {b.label}
                    {b.caveat && (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {b.caveat}
                      </span>
                    )}
                  </th>
                  <td className="py-2.5 pr-3 text-muted-foreground">{b.free}</td>
                  <td className="py-2.5 text-muted-foreground">
                    {b.status !== "shipped" ? (
                      // Not a checkmark, and not the muted "same on both"
                      // treatment either — an upcoming Premium feature is
                      // neither included nor shared. The pill carries the
                      // word, so the row reads correctly even to someone
                      // scanning only the right-hand column.
                      // Stacked rather than wrapped: the pill lands in the
                      // same place on every upcoming row, so the column can
                      // be scanned for "what is not included yet" without
                      // reading any of the descriptions.
                      <span data-testid={`premium-soon-${b.id}`} className="flex flex-col items-start gap-1">
                        <Badge
                          variant="outline"
                          className="shrink-0 border-dashed text-[10px] uppercase tracking-wide"
                        >
                          Coming soon
                        </Badge>
                        <span className="opacity-70">{b.premium}</span>
                      </span>
                    ) : b.differentiator ? (
                      <span className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} aria-hidden />
                        <span>{b.premium}</span>
                      </span>
                    ) : (
                      <span data-testid={`premium-same-${b.id}`}>{b.premium}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* ── What stays free ────────────────────────────────────────────
          Same rows as the identical-column entries above, restated as a
          list, because "what do I keep if I never pay" is a question people
          scan for rather than read a table for. */}
      <h3 className="mb-4 text-lg font-semibold">Free, forever</h3>
      <Card>
        <CardContent className="py-5">
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {freeBenefits().map((b) => (
              <li key={b.id} data-testid={`premium-free-${b.id}`} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{b.userFacingSummary}</span>
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
