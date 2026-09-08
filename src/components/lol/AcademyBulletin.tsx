/**
 * THE ACADEMY BULLETIN — the Commons' large parchment noticeboard, right.
 *
 * Revision 24 of `docs/MOGZY_HUB_REDESIGN_HANDOFF.md`. Second in the room's
 * hierarchy, under the Academy Record: what is worth knowing about League
 * right now, pinned to the board the community section used to hold.
 *
 * ### V1 is ONE notice, on purpose
 * Revision 23 specifies a slow-rotating board of several card families. None of
 * that state exists yet and none of it is invented here: this pass establishes
 * the board's ROLE — an eyebrow, a headline, a short body and one deep link —
 * with a single notice whose destination already exists. Rotation, prev/next,
 * pause and the per-family data reads are Step 4.
 *
 * `NOTICE` is deliberately a plain object rather than an array with an index:
 * a one-item carousel is not a carousel, and a framework with one occupant is
 * the abstraction Revision 23 said not to build. When the families land, this
 * shape becomes the element type of the rotation's list.
 *
 * ### What it must not be
 * Not Screen 1. The Hall's Academy Updates are owner-authored Mogzy PRODUCT
 * news and the Broadcast tome already carries the Patch Brief; a patch notice
 * here would be the same transmission twice on one page. The Bulletin is
 * League content, and V1 claims no live statistic it cannot prove — the notice
 * below is an invitation into a route that exists, not a scoreboard.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * The pinned notice. One eyebrow, one headline, one or two sentences, one
 * action — the shape every future bulletin family must fit into.
 *
 * The destination is `/lol/mechanics` — the Mechanics Explorer, which is live,
 * public and needs no data this client does not already have. It is
 * deliberately NOT `/quiz`: the Academy Record's own primary action already
 * goes there, and a board that repeats the panel beside it is not a bulletin.
 * Nothing here asserts a live statistic.
 */
const NOTICE = {
  id: "mechanics-invitation",
  eyebrow: "Notice Board",
  title: "The numbers behind the game",
  body:
    "Wave gold, jungle timers, plate values, the XP a level actually costs — the Mechanics Explorer holds the measured tables most players argue about from memory.",
  ctaLabel: "Open the Explorer",
  ctaTo: "/lol/mechanics",
} as const;

export default function AcademyBulletin() {
  return (
    <section
      data-testid="academy-bulletin"
      data-bulletin-notice={NOTICE.id}
      aria-labelledby="academy-bulletin-heading"
      className="academy-commons-board academy-commons-bulletin relative flex min-w-0 flex-col justify-center rounded-[3px] border-4 border-solid p-4 sm:p-5"
    >
      {/* The pinned sheet. Auto-height and centred so real planking still shows
          all round in flow mode; under half a degree of rotation, so no line of
          type is measurably off the horizontal. Stage mode drops both — the
          painting supplies the paper and the pins. */}
      <div className="academy-commons-notice academy-commons-bill academy-commons-bulletin-bill relative flex flex-col rounded-[2px] px-5 py-5 [transform:rotate(-0.45deg)] sm:px-6">
        <span
          aria-hidden
          className="academy-commons-pin absolute left-4 top-2.5 h-2.5 w-2.5 rounded-full"
        />
        <span
          aria-hidden
          className="academy-commons-pin absolute right-4 top-2.5 h-2.5 w-2.5 rounded-full"
        />

        <span className="academy-commons-notice-soft academy-commons-bill-eyebrow text-[10px] font-bold uppercase tracking-[0.28em]">
          {NOTICE.eyebrow}
        </span>
        <h2
          id="academy-bulletin-heading"
          className="academy-commons-notice-ink academy-commons-bill-title mt-1 text-[1.35rem] font-medium leading-tight sm:text-2xl"
          style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
        >
          {NOTICE.title}
        </h2>
        <p className="academy-commons-notice-soft academy-commons-bill-blurb mt-2 max-w-sm text-[13px] leading-relaxed">
          {NOTICE.body}
        </p>

        <div className="academy-commons-bill-actions pt-5">
          <Link
            to={NOTICE.ctaTo}
            data-testid="academy-bulletin-cta"
            className="academy-commons-bill-cta inline-flex min-h-[52px] items-center gap-3 rounded-[3px] bg-gradient-to-b from-[#e0c273] to-[#b08c30] px-5 py-3 text-[15px] font-bold text-[#160f02] shadow-[0_1px_0_hsl(42_90%_78%)_inset] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {NOTICE.ctaLabel}
            <ArrowRight className="h-4 w-4 opacity-70" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
