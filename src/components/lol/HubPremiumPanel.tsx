/**
 * Mogzy Premium, as one of the Commons' two **supporting slips**.
 *
 * Naming: **Premium is the subscription, Pro is Pro Play**
 * (`docs/naming-premium-vs-pro-play.md`). No `Pro` wording appears in anything
 * a human reads here, and the CTA goes to the canonical `PREMIUM_ROUTE`.
 *
 * ### Revision 24 — it moved, and it got quieter
 * Premium used to be the loudest object in the room: the large gilt-framed
 * navy plaque, left. The Academy Record holds that frame now, and Premium
 * moved to the left of the two small painted parchments below the bulletin
 * board. That is the whole point of the change — a members' room shows a
 * member their standing first and their subscription second — so the surface
 * became ink on paper rather than gilt on navy, and the three-pillar register
 * became a single sentence.
 *
 * **The logic is untouched.** The entitlement read, the two states, the copy
 * bounds and the route are exactly as they shipped on 2026-09-04. Both live
 * features are still named, still in prose bounded by what `/lol/premium`
 * actually claims, and there is still no price.
 *
 * ### Copy is bounded by what the canonical matrix says is SHIPPED
 * The 2026-09-04 audit found exactly two live Premium features — full quiz
 * history and the missed-question bank — and this slip has named those two
 * ever since. PT1.13 re-audited and there are now **seven**: those two plus
 * the Practice Builder, its own-record pools, saved sets, performance trends
 * and recurring-weakness diagnosis (`@/lib/premium/matrix`,
 * `premiumBenefits()`).
 *
 * The slip still names only the original two, deliberately. It is one
 * sentence on a small painted parchment, and its job is to say what
 * membership is FOR and send the reader to the page that lists it — not to
 * become a second, competing benefit list that then drifts again. The one
 * change made here is the promotional line's tail: "unlock the advanced
 * tools as they land" promised future capability, and the tools have landed,
 * so it now points at what is there.
 *
 * ### No price
 * PT1.5 moved pricing off the client entirely: the price list lives in the
 * server offer catalog and what is purchasable right now is a server answer.
 * `/lol/premium` owns pricing AND states availability in the same view.
 *
 * ### Subscription state costs nothing extra
 * `usePremiumSession().proStatus` is already resolved for this page by the
 * app-wide provider. "unknown" renders the promotional variant: this is a
 * promo module, not a gate, so an unresolved read costs a member a moment of
 * the wrong eyebrow rather than costing a free user access to something.
 */
import { Link } from "react-router-dom";
import { Crown, ArrowRight, Check } from "lucide-react";
import { PREMIUM_ROUTE } from "@/lib/premium-routes";
import { usePremiumSession } from "@/hooks/usePremiumSession";

export default function HubPremiumPanel() {
  const { proStatus } = usePremiumSession();
  const isMember = proStatus === "pro";

  return (
    <section
      data-testid="hub-premium-panel"
      data-premium-state={isMember ? "member" : "promo"}
      aria-labelledby="hub-premium-heading"
      className="academy-commons-notice academy-commons-support academy-commons-support-premium relative flex min-w-0 flex-col justify-center rounded-[2px] px-5 py-4 [transform:rotate(0.3deg)]"
    >
      <span
        aria-hidden
        className="academy-commons-pin absolute left-1/2 top-2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
      />

      <div className="academy-commons-support-head flex items-center gap-2.5">
        <span
          aria-hidden
          className="academy-commons-support-seal flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#7a6230]/45 bg-[#e6d9b6]/45"
        >
          {isMember ? (
            <Check className="h-3.5 w-3.5 text-[#7a6230]" />
          ) : (
            <Crown className="h-3.5 w-3.5 text-[#7a6230]" />
          )}
        </span>
        <div className="min-w-0">
          <span className="academy-commons-notice-soft academy-commons-support-eyebrow block text-[10px] font-bold uppercase tracking-[0.28em]">
            {isMember ? "Member in good standing" : "Academy Membership"}
          </span>
          <h2
            id="hub-premium-heading"
            className="academy-commons-notice-ink academy-commons-support-title text-[1.05rem] font-semibold leading-tight"
            style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
          >
            Mogzy Premium
          </h2>
        </div>
      </div>

      {/* One sentence, naming exactly the two features that actually ship. */}
      <p className="academy-commons-notice-soft academy-commons-support-blurb mt-2 text-[12.5px] leading-snug">
        {isMember
          ? "Your membership is active. Your full quiz history and every question you’ve missed are unlocked."
          : "Keep your full quiz history, review every question you’ve missed, and read how your results are moving over time."}
      </p>

      {/* Ink on paper, not a gold plate: the Record and the Bulletin own the
          room's two bright objects now, and a third would flatten the
          hierarchy this pass exists to create. The tap target and the focus
          ring are unchanged. */}
      <Link
        to={PREMIUM_ROUTE}
        data-testid="hub-premium-cta"
        className="academy-commons-support-cta mt-3 inline-flex min-h-[52px] items-center justify-center gap-2 self-start rounded-[2px] border border-[#7a6230]/45 bg-[#e6d9b6]/45 px-4 py-2 text-[13px] font-semibold text-[#2c2417] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#f0e5c8]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {isMember ? "View Premium" : "Explore Premium"}
        <ArrowRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </Link>
    </section>
  );
}
