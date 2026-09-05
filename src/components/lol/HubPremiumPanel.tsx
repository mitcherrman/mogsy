/**
 * The hub's Mogzy Premium promotion — one wide feature panel that opens the
 * below-the-fold commons, directly under the hero's fade and above
 * `HubCommunitySection`.
 *
 * Naming: **Premium is the subscription, Pro is Pro Play**
 * (`docs/naming-premium-vs-pro-play.md`). No `Pro` wording appears in anything
 * a human reads here, and the CTA goes to the canonical `PREMIUM_ROUTE`.
 *
 * It is deliberately not a fifth Academy volume and not a pricing table. The
 * four painted books above own the primary navigation and the hero owns the
 * page's theatrical motion; this panel is the loudest thing *below* the seam
 * and is stronger than Community, which is the intended hierarchy
 * (Premium → Community → Feedback/About → legal).
 *
 * ### Copy is bounded by what `/lol/premium` actually claims
 * An audit of `LolPremium.tsx` on 2026-09-04 found exactly two Premium
 * features live — full quiz history and the missed-question bank; the other
 * six carry a "Coming soon" badge. The two live ones are named here; the rest
 * are summarised as tools that "land", never as a definitive feature list.
 *
 * ### No price
 * PT1.5 moved pricing off the client entirely: the price list lives in the
 * server offer catalog and what is purchasable right now is a server answer
 * (`fetchOfferAvailability`). This panel could not print a trustworthy price
 * without making that round trip, and a number with no checkout behind it is
 * worse than no number. `/lol/premium` owns pricing AND states availability in
 * the same view; this panel routes there instead.
 *
 * ### Subscription state costs nothing extra
 * `useSitewideTheme().proStatus` is already resolved for this page by the
 * app-wide provider (`AdSlot` on this very section reads it), so the member
 * variant needs no new fetch, hook or entitlement plumbing. "unknown" renders
 * the promotional variant: this is a promo module, not a gate, so an
 * unresolved read costs a member a moment of the wrong eyebrow rather than
 * costing a free user access to something.
 */
import { Link } from "react-router-dom";
import { Crown, History, BookX, Sparkles, ArrowRight, Check } from "lucide-react";
import { PREMIUM_ROUTE } from "@/lib/premium-routes";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";

type Pillar = { Icon: typeof History; label: string };

/**
 * Two shipped Premium features by name, then an honest forward-looking third.
 * Keep this in step with `PREMIUM_FEATURES` in `LolPremium.tsx`: anything
 * carrying `comingSoon` there must not be named here as though it exists.
 */
const PILLARS: Pillar[] = [
  { Icon: History, label: "Your full quiz history" },
  { Icon: BookX, label: "Every question you’ve missed" },
  { Icon: Sparkles, label: "Advanced tools as they land" },
];

export default function HubPremiumPanel() {
  const { proStatus } = useSitewideTheme();
  const isMember = proStatus === "pro";

  return (
    <section
      data-testid="hub-premium-panel"
      data-premium-state={isMember ? "member" : "promo"}
      aria-labelledby="hub-premium-heading"
      className="hub-premium-panel relative overflow-hidden rounded-xl border border-[#c9a84c]/30 px-5 py-7 transition-colors duration-300 hover:border-[#c9a84c]/55 sm:px-8 sm:py-9"
      style={{
        // A warm light from the seal's corner over a near-black navy base.
        // Two stops only — the brief asks for restraint, not a gradient stack.
        backgroundImage:
          "radial-gradient(120% 150% at 6% 0%, rgba(201,168,76,0.14), rgba(201,168,76,0) 58%), linear-gradient(158deg, #0a1120 0%, #060a12 56%, #090b13 100%)",
      }}
    >
      {/* Gold hairline along the top edge — the panel's only ornament. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e6cd93]/45 to-transparent"
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
        {/* Crest — the same Crown that marks Premium on /lol/premium. */}
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#c9a84c]/45 bg-[#0b1220] shadow-[0_0_24px_-6px_rgba(201,168,76,0.45)] sm:h-16 sm:w-16"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#c9a84c]/25 sm:h-12 sm:w-12">
            <Crown className="h-5 w-5 text-[#e8cd98] sm:h-6 sm:w-6" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[#c9a84c]">
            {isMember && <Check className="h-3.5 w-3.5" aria-hidden />}
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {isMember ? "Premium Active" : "Unlock the Full Academy"}
            </span>
          </div>

          <h2
            id="hub-premium-heading"
            className="mt-1.5 text-2xl font-bold text-[#f5e9c8] sm:text-[1.75rem]"
          >
            Mogzy Premium
          </h2>

          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-[#c3cfe2]/85">
            {isMember
              ? "Your membership is active — your full quiz history and missed-question bank are unlocked, and new Premium tools arrive here as they land."
              : "Go deeper with the Academy: keep every result you’ve ever posted, review every question you’ve missed, and unlock the advanced tools as they land."}
          </p>

          <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
            {PILLARS.map(({ Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2 text-[13px] text-[#c3cfe2]/70"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#c9a84c]" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* The plate is gold on near-black, where the UA's default focus ring is
            hard to see; an explicit offset ring keeps the CTA legible to
            keyboard users. Focus also fires the panel's `:focus-within` sweep. */}
        <Link
          to={PREMIUM_ROUTE}
          data-testid="hub-premium-cta"
          className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2 self-start rounded-md bg-gradient-to-b from-[#e0c273] to-[#b08c30] px-7 py-3.5 text-base font-bold text-[#160f02] shadow-[0_1px_0_hsl(42_90%_78%)_inset] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b14] motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:self-center"
        >
          {isMember ? "View Premium" : "Explore Premium"}
          <ArrowRight className="h-4 w-4 opacity-75" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
