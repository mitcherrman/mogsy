/**
 * THE ACADEMY COMMONS — Screen 2 of `/lol`.
 *
 * The hub is two deliberate full-viewport rooms. Screen 1 is the painted
 * Academy Hall (the hero, approved and untouched). This is the quieter room on
 * the other side of the threshold: the membership plaque, the noticeboard, two
 * pinned slips and the legal plinth, composed as ONE room rather than a stack
 * of cards over a website footer.
 *
 * ### It is an interior, not a section
 * The read is carried by three structural pieces, all CSS (see the
 * `.academy-commons-*` block in index.css — no background artwork was created
 * for this):
 *
 *   1. a **ceiling beam** across the top, which is what makes the space read as
 *      a room you have entered rather than as more page;
 *   2. a **navy library wall** lit from two high sconces, with the faintest
 *      vertical panelling and a floor that darkens toward the skirting;
 *   3. a **plinth** along the bottom carrying the legal inscription.
 *
 * Every wooden surface takes the `--shelf-*` walnut ramp declared for the
 * hall's shelving, so the two rooms are unmistakably the same building.
 *
 * ### Hierarchy
 * Premium (plaque) → Community (noticeboard) → Feedback/About (slips) → legal
 * (plinth). DOM order IS reading order; the desktop grid places the plaque and
 * the board side by side without changing it.
 *
 * ### The legal band lives HERE, not in the sitewide footer
 * `Footer` self-hides on `/lol` (see the note there). Privacy, Terms, Security,
 * the copyright line and the Riot disclaimer are inscribed into the plinth
 * instead, at the same wording, so nothing floats below the scene and nothing
 * became unreachable.
 *
 * ### Height
 * The room is sized with `min-height`, never `height`, and is composed to fit
 * one viewport at the desktop targets (1440x900, 1920x1080). Where it cannot —
 * phones, short laptops, deep page zoom, the large-text setting — it simply
 * grows and the page scrolls normally; scroll snapping is gated off in exactly
 * those cases (see the media query in index.css). Nothing is ever clipped.
 */
import { Link } from "react-router-dom";
import { ChevronUp } from "lucide-react";
import AdSlot from "@/components/ads/AdSlot";
import HubPremiumPanel from "@/components/lol/HubPremiumPanel";
import HubCommunitySection from "@/components/lol/HubCommunitySection";
import HubUtilitySection from "@/components/lol/HubUtilitySection";
import { SITE_NAME } from "@/lib/site-config";

/**
 * The trust/compliance set. These three are the destinations no other surface
 * on `/lol` carries, which is why the plinth exists; About, Contact and
 * Feedback are already on the slips above and are not repeated here.
 */
const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/security", label: "Security" },
];

export default function AcademyCommons({
  onBackToHall,
}: {
  /** Returns the reader to Screen 1. Owned by LolHub, which owns the scroll. */
  onBackToHall: () => void;
}) {
  const year = new Date().getFullYear();

  return (
    <section
      id="academy-commons"
      data-hub-screen="commons"
      data-testid="academy-commons"
      aria-label="Academy Commons"
      className="academy-commons relative flex w-full flex-col overflow-hidden"
    >
      {/* The wall. One painted layer behind everything, pointer-inert. */}
      <div className="academy-commons-wall pointer-events-none" aria-hidden />

      {/* ---- ceiling beam ------------------------------------------------
          The "Back to the Hall" control lives dead centre of the beam on
          purpose: the global HUD floats in the top-RIGHT corner and the Mogzy
          home control in the top-LEFT, so the centre is the only part of this
          band that is never under a fixed control at any width. */}
      <div className="academy-commons-lintel relative z-10 flex h-12 shrink-0 items-center justify-center sm:h-14">
        <button
          type="button"
          onClick={onBackToHall}
          data-testid="commons-back-to-hall"
          className="academy-commons-inscription-link inline-flex min-h-[44px] items-center gap-1.5 rounded-[2px] px-3 text-[10px] font-bold uppercase tracking-[0.3em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd93]/70 sm:text-[11px]"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          Back to the Hall
        </button>
      </div>

      {/* ---- the room ----------------------------------------------------
          `flex-1` + `justify-center` is what composes the room INSIDE the
          viewport rather than stacking from the top: at 1080 the extra height
          becomes air around the furniture instead of a gap under it. */}
      {/* A CHAMBER, not a content column. The first pass ran the furniture to
          the full 92rem and the room read as three wide objects floating in a
          navy field: at 1440 the plaque was far wider than its own text needed,
          so its lines were short, its box was shallow, and the surplus height
          became a void. Capping the room at 76rem leaves ~110px of panelled
          wall down each side at 1440 and much more at 1920 — which is what
          makes it read as a room you are standing in rather than a section you
          are scrolling past — and the narrower furniture is correspondingly
          taller for the same content. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[76rem] flex-1 flex-col justify-center gap-4 px-4 py-6 sm:px-6 lg:gap-5 lg:px-8 lg:py-10">
        {/* Renders null (and reserves no space) wherever the placement is
            suppressed, which is every environment today — see AdSlot. If a
            provider ever fills it, the room grows past one viewport and the
            snap gate in index.css has to be revisited with it. */}
        <AdSlot placement="lol_hub_mid" />

        {/* The room announces itself. This is the one piece of pure ornament in
            the Commons and it earns its place twice: it names where the reader
            has arrived immediately after they left a room called the Academy
            Hall, and it occupies the upper band of wall that otherwise read as
            a void above the furniture. Set in the hall's own Cinzel small-caps,
            at a fraction of the hero title's weight — this must not read as a
            second page heading, so it is not an <h*> and is not in the document
            outline; the section's own aria-label already names the room for
            assistive technology. */}
        <div aria-hidden className="hidden shrink-0 flex-col items-center gap-2 lg:flex">
          <span
            className="academy-commons-inscription text-[11px] font-bold uppercase tracking-[0.42em]"
            style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
          >
            The Academy Commons
          </span>
          <span className="flex items-center gap-2">
            <span className="academy-hall-descend-rule h-px w-20" />
            <span className="h-1 w-1 rotate-45 bg-[#c9a84c]/55" />
            <span className="academy-hall-descend-rule h-px w-20" />
          </span>
        </div>

        {/* Plaque and board share a row on desktop; DOM order is unchanged, so
            reading order stays Premium → Community at every width.

            `lg:flex-1` is what makes this a ROOM rather than a band of cards
            floating in one. Left to auto-height the two objects came out around
            290px tall and the first pass had ~200px of empty navy above and
            below them; growing them into the space they are in reads as
            furniture standing in a room. The 34rem cap stops that turning into
            a pair of towers on a 1080-tall display — past it the surplus goes
            back to the room as air around the furniture, which is what a taller
            room actually looks like.

            The cap is 21rem and was arrived at by looking: at 34rem the two
            objects grew a ~250px void down their middles, which reads worse
            than the floating cards it replaced. 21rem is a little taller than
            the content needs, which is what gives the plaque and the board
            presence, and every pixel past it goes to the room. */}
        <div className="grid gap-4 lg:min-h-0 lg:max-h-[21rem] lg:flex-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-6">
          <HubPremiumPanel />
          <HubCommunitySection />
        </div>

        <div className="shrink-0">
          <HubUtilitySection />
        </div>
      </div>

      {/* ---- the plinth --------------------------------------------------
          The room's skirting, carrying the inscription. `scroll-snap-align:
          end` is set on this element in index.css: it is the belt-and-braces
          that keeps the bottom of the room reachable if the Commons ever
          outgrows the viewport inside the snap gate. */}
      {/* The wide side returns are load-bearing, not styling: the shell floats a
          friends control in the bottom-LEFT corner of the viewport on every
          page, and at a narrower return it lands on top of the first legal
          link. 5rem clears it at every width from 1024 up, and a deep return is
          what a plinth has anyway. */}
      {/* The extra bottom padding on phones is the same clearance problem as the
          side returns, in the other axis: on a narrow viewport the plinth's
          side padding cannot grow enough to dodge the shell's floating corner
          control, so the inscription is lifted above it instead. The plinth is
          the end of the document, so the padding simply lands under the text. */}
      <div className="academy-commons-plinth relative z-10 shrink-0 px-4 pb-16 pt-3.5 sm:px-8 sm:pb-4 lg:px-20">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <nav
              aria-label="Legal"
              data-testid="commons-legal-nav"
              className="flex flex-wrap items-center gap-x-5 gap-y-1"
            >
              {LEGAL_LINKS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="academy-commons-inscription-link text-[11px] font-bold uppercase tracking-[0.22em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd93]/70"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <span className="academy-commons-inscription text-[11px] tracking-[0.06em]">
              © {year} {SITE_NAME}. All rights reserved.
            </span>
          </div>

          {/* Riot's required disclaimer, at the wording the sitewide footer
              used verbatim. Kept at a readable size — the plinth is subdued,
              not small print. */}
          <p className="academy-commons-inscription max-w-5xl text-[11px] leading-snug opacity-80">
            {SITE_NAME} is an unofficial fan project. {SITE_NAME} isn't endorsed by Riot
            Games and doesn't reflect the views or opinions of Riot Games or anyone
            officially involved in producing or managing Riot Games properties. Riot Games
            and League of Legends are trademarks or registered trademarks of Riot Games,
            Inc.
          </p>
        </div>
      </div>
    </section>
  );
}
