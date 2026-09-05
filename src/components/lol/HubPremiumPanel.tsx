/**
 * Mogzy Premium, as the Academy Commons' **membership plaque** — the primary
 * element of Screen 2 and the loudest thing below the hall.
 *
 * Naming: **Premium is the subscription, Pro is Pro Play**
 * (`docs/naming-premium-vs-pro-play.md`). No `Pro` wording appears in anything
 * a human reads here, and the CTA goes to the canonical `PREMIUM_ROUTE`.
 *
 * ### Why a plaque and not a card (or a book)
 * The four painted volumes above own primary navigation, and a fifth book here
 * would read as a fifth destination. What a members' room actually hangs by its
 * door is a plaque: a walnut mount, a brass title band, a navy field, an
 * engraved register. That navy-and-gilt field is the SAME pairing the volumes
 * use, which is what makes the Commons read as another room in the same
 * building rather than as a pricing section. The surface is entirely CSS —
 * `.academy-commons-plaque` / `-band` / `-engraved` in index.css.
 *
 * ### Everything under the paint is unchanged
 * The entitlement read, the two states, the copy bounds and the route are
 * exactly as they shipped on 2026-09-04. This pass moved the panel into the
 * room and reinterpreted its surface; it touched no logic.
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
 * (`fetchOfferAvailability`). This plaque could not print a trustworthy price
 * without making that round trip, and a number with no checkout behind it is
 * worse than no number. `/lol/premium` owns pricing AND states availability in
 * the same view; this plaque routes there instead.
 *
 * ### Subscription state costs nothing extra
 * `useSitewideTheme().proStatus` is already resolved for this page by the
 * app-wide provider, so the member variant needs no new fetch, hook or
 * entitlement plumbing. "unknown" renders the promotional variant: this is a
 * promo module, not a gate, so an unresolved read costs a member a moment of
 * the wrong eyebrow rather than costing a free user access to something.
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
      /* The `border-4` IS the walnut mount board: the navy field sits inset
         inside it, which is what gives the plaque depth without a drop shadow
         doing the work. */
      className="academy-commons-plaque relative flex min-w-0 flex-col overflow-hidden rounded-[3px] border-4 border-solid"
    >
      {/* Brass title band, engraved in the room's small-caps. */}
      <div className="academy-commons-plaque-band relative flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
        <span className="academy-commons-engraved text-[10px] font-bold uppercase tracking-[0.3em] sm:text-[11px]">
          {isMember ? "Member in good standing" : "Academy Membership"}
        </span>
        {isMember && (
          <Check className="academy-commons-engraved h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
      </div>

      {/* `justify-between` matters once the plaque grows into the room: the
          seal and title sit at the head, the engraved register in the body and
          the CTA at the foot, which is how a real plaque is laid out. Left as a
          plain gap stack it clumped everything against the title band. */}
      <div className="academy-commons-plaque-body relative flex flex-1 flex-col justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6 lg:gap-5">
        <div className="academy-commons-plaque-head flex items-start gap-4">
          {/* Seal — the same Crown that marks Premium on /lol/premium, struck
              into a gilt ring rather than floated in a glow. */}
          <span
            aria-hidden
            className="academy-commons-plaque-seal mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#c9a84c]/50 bg-[#0a121f] shadow-[inset_0_1px_0_rgba(232,205,152,0.25)] sm:h-12 sm:w-12"
          >
            <span className="academy-commons-plaque-seal-ring flex h-8 w-8 items-center justify-center rounded-full border border-[#c9a84c]/25 sm:h-9 sm:w-9">
              <Crown className="h-4 w-4 text-[#e8cd98] sm:h-5 sm:w-5" />
            </span>
          </span>

          <div className="academy-commons-plaque-headings min-w-0">
            <h2
              id="hub-premium-heading"
              className="academy-commons-plaque-title text-[1.6rem] font-medium leading-tight text-[#f0e2bd] sm:text-[1.9rem]"
              style={{
                fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif',
              }}
            >
              Mogzy Premium
            </h2>
            <p className="academy-commons-plaque-blurb mt-2 max-w-xl text-[13.5px] leading-relaxed text-[#c3cfe2]/80 sm:text-sm">
              {isMember
                ? "Your membership is active — your full quiz history and missed-question bank are unlocked, and new Premium tools arrive here as they land."
                : "Go deeper with the Academy: keep every result you’ve ever posted, review every question you’ve missed, and unlock the advanced tools as they land."}
            </p>
          </div>
        </div>

        {/* The inscribed register. The gilt rule above it stands in for the
            engraved line a real plaque carries under its title. */}
        <div className="academy-commons-plaque-register">
          <span
            aria-hidden
            className="academy-commons-plaque-rule block h-px w-full bg-gradient-to-r from-[#c9a84c]/40 via-[#c9a84c]/20 to-transparent"
          />
          <ul className="academy-commons-plaque-pillars mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-7 sm:gap-y-2">
            {PILLARS.map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-[13px] text-[#cbd6e6]/75">
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#c9a84c]" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* The CTA is the one bright object in the room — the intended
            hierarchy. Gold on near-black hides the UA's default focus ring, so
            an explicit offset ring keeps it legible to keyboard users; focus
            also fires the plaque's `:focus-within` sweep. */}
        <Link
          to={PREMIUM_ROUTE}
          data-testid="hub-premium-cta"
          className="academy-commons-plaque-cta mt-auto inline-flex min-h-[52px] w-full items-center justify-center gap-2 self-start rounded-[3px] bg-gradient-to-b from-[#e0c273] to-[#b08c30] px-7 py-3 text-[15px] font-bold text-[#160f02] shadow-[0_1px_0_hsl(42_90%_78%)_inset] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b14] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-auto sm:px-9"
        >
          {isMember ? "View Premium" : "Explore Premium"}
          <ArrowRight className="h-4 w-4 opacity-75" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
