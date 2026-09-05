/**
 * THE ACADEMY COMMONS — Screen 2 of `/lol`.
 *
 * The hub is two deliberate full-viewport rooms. Screen 1 is the painted
 * Academy Hall (the hero, approved and untouched). This is the room on the
 * other side of the threshold, and as of 2026-09-05 it is a PAINTED room too:
 * the approved Commons artwork (`academy-commons-desktop.png`) is the stage,
 * and every live panel is mounted into a surface the painting already
 * contains.
 *
 * ### Two modes, one DOM
 *
 * **Stage mode** — `@media (min-width:1024px) and (min-height:780px)` on a
 * viewport that is not in the app's large-text setting; the same gate that
 * arms the two-screen scroll snap. The section is exactly one viewport tall,
 * the artwork is laid into it with an explicit cover computation, and each
 * live panel is absolutely positioned onto its own painted mount:
 *
 *   | Panel                | Painted mount                             |
 *   |----------------------|-------------------------------------------|
 *   | Mogzy Premium        | the large gilt-framed navy panel, left     |
 *   | Join the Academy     | the large parchment noticeboard, right     |
 *   | Feedback + About     | the two small pinned parchments below it   |
 *   | Legal inscription    | a walnut rail on the panelling, bottom     |
 *
 *   Coordinates are fractions of the ARTWORK, not of the viewport, and the
 *   artwork's own placement is computed from the same custom properties — so
 *   a panel cannot drift off its frame as the window changes shape. See the
 *   `--commons-img-*` block in index.css.
 *
 * **Flow mode** — everything else (phones, short laptops, deep page zoom,
 * large text). The composition is not forced: the artwork drops back to a
 * plain scrimmed `cover` backdrop, the panels keep their own coded chrome
 * (walnut plaque, planked board, parchment slips) and the room becomes an
 * ordinary scrolling document. Readability wins over framing, by design.
 *
 * ### The panels lose their frames where the painting already has one
 * In stage mode the plaque's walnut mount, the noticeboard's planking and the
 * slips' parchment are all switched OFF: the artwork supplies them. Keeping
 * both would put a coded frame inside a painted frame, which is the exact
 * "cards floating on a background" read this pass exists to remove. Nothing is
 * removed from the DOM — every rule is a CSS override inside the stage gate.
 *
 * ### The legal band lives HERE, not in the sitewide footer
 * `Footer` self-hides on `/lol` (see the note there). Privacy, Terms,
 * Security, the copyright line and the Riot disclaimer are inscribed into the
 * plinth instead, at the same wording, so nothing floats below the scene and
 * nothing became unreachable. The plinth is the one mount that keeps coded
 * joinery in stage mode — the painting has no board there to inherit — so it
 * is drawn as a walnut rail fixed to the panelling. Deliberately the quietest
 * object in the room.
 */
import { Link } from "react-router-dom";
import { ChevronUp } from "lucide-react";
import AdSlot from "@/components/ads/AdSlot";
import HubPremiumPanel from "@/components/lol/HubPremiumPanel";
import HubCommunitySection from "@/components/lol/HubCommunitySection";
import HubUtilitySection from "@/components/lol/HubUtilitySection";
import { SITE_NAME } from "@/lib/site-config";
import { MOGZY_MASCOT_ASSETS } from "@/components/mascot/mascot-assets";
import commonsArt from "@/academy/hub/academy-commons-desktop.png";

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
  navHintRevealed = false,
}: {
  /** Returns the reader to Screen 1. Owned by LolHub, which owns the scroll. */
  onBackToHall: () => void;
  /**
   * True once the Commons has been SETTLED on a snapped viewport for the hint
   * delay. Drives nothing but a class: the control is always in the DOM and
   * always reachable from the keyboard, and outside the snap gate the CSS
   * never hides it in the first place. See LolHub's settle observer.
   */
  navHintRevealed?: boolean;
}) {
  const year = new Date().getFullYear();

  return (
    <section
      id="academy-commons"
      data-hub-screen="commons"
      data-testid="academy-commons"
      aria-label="Academy Commons"
      className="academy-commons relative flex w-full flex-col overflow-hidden"
      /* The approved Commons painting, handed to CSS as a custom property so
         the bundler owns the URL (content-hashed, and a missing file fails the
         build) while every rule that consumes it stays in index.css. */
      style={
        {
          "--commons-art": `url(${commonsArt})`,
          /* Mogzy is a BACKGROUND on an aria-hidden div, not an <img>. Two
             reasons, both load-bearing: a 2.2MB decorative <img> is fetched
             even when it is `display:none`, so every phone would pay for a
             character it never sees; and a background can never contribute
             layout height, which is what keeps him out of flow mode entirely.
             The URL comes from the canonical pose registry, not a string. */
          "--commons-mogzy": `url(${MOGZY_MASCOT_ASSETS.base})`,
        } as React.CSSProperties
      }
    >
      {/* Backdrop. In flow mode this is the room's navy ground; in stage mode
          it also carries the blurred, over-scaled copy of the artwork that
          fills the pillarbox on viewports wider than the painting. */}
      <div className="academy-commons-wall pointer-events-none" aria-hidden />
      {/* The painting itself, plus its readability scrim. One element, two
          background layers, pointer-inert — never an <img>, so it can never
          contribute layout height. */}
      <div className="academy-commons-art pointer-events-none" aria-hidden />

      {/* ---- Mogzy, and the desk that stands in front of him --------------
          An environmental character, not a guide: no state, no interaction,
          no motion, nothing in the tab order or the accessibility tree. He
          exists only inside stage mode, and only on viewports wide enough
          that the side crop does not reach him — see the aspect gate on
          `.academy-commons-mogzy` in index.css.

          He is a ghost with a wispy tail and no feet, so he cannot stand on
          anything. What grounds him instead is a real occlusion: `-desk` is a
          SECOND copy of the painting, laid at exactly the same size and
          position and clipped to everything below the reading table's front
          arris. It therefore paints pixels identical to the layer underneath
          it — a seam is impossible by construction — and the painted desk
          edge cuts his tail the way the candles and books would if he were
          part of the artwork. No new asset, and nothing is baked into the
          image.

          DOM order is the paint order: art → Mogzy → desk → live panels. */}
      <div className="academy-commons-mogzy pointer-events-none" aria-hidden />
      <div className="academy-commons-desk pointer-events-none" aria-hidden />

      {/* ---- the room ----------------------------------------------------
          Flow mode: a centred content column that grows with its contents.
          Stage mode: `inset: 0` over the section, and the children below stop
          flowing and take their painted mounts instead.

          The top padding is the HUD's clearance. Every ordinary page gets it
          from the shell, but the Commons is a full-bleed screen and opts out —
          so without it the "Back to the Hall" control, which is the first
          thing in this column, lands underneath the floating HUD on a phone.
          Stage mode drops this container entirely and places the control in
          the painted arch, well clear of both corner controls. */}
      <div className="academy-commons-room relative z-10 mx-auto flex w-full max-w-[76rem] flex-1 flex-col justify-center gap-4 px-4 pb-6 pt-[calc(var(--app-header-h)+1rem)] sm:px-6 lg:gap-5 lg:px-8 lg:pb-10">
        {/* Renders null (and reserves no space) wherever the placement is
            suppressed, which is every environment today — see AdSlot. A
            provider filling it would land over the top of the painted room and
            the composition would have to be revisited with it. */}
        <AdSlot placement="lol_hub_mid" />

        {/* The room announces itself, and — once the reader has been still for
            a moment — offers the way back. Both are set in the hall's Cinzel
            small-caps and hung in the painted arch above the membership frame,
            which is the one wide stretch of bare wall in the composition.

            The title must not read as a second page heading, so it is not an
            <h*> and is not in the document outline; the section's own
            aria-label already names the room for assistive technology. */}
        <div className="academy-commons-crest flex shrink-0 flex-col items-center gap-2">
          <span
            aria-hidden
            className="academy-commons-inscription academy-commons-room-title hidden text-[11px] font-bold uppercase tracking-[0.42em] lg:block"
            style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
          >
            The Academy Commons
          </span>
          <span aria-hidden className="academy-commons-crest-rule hidden items-center gap-2 lg:flex">
            <span className="academy-hall-descend-rule h-px w-20" />
            <span className="h-1 w-1 rotate-45 bg-[#c9a84c]/55" />
            <span className="academy-hall-descend-rule h-px w-20" />
          </span>

          {/* The way back. Centred on purpose: the global HUD floats in the
              top-RIGHT corner and the Mogzy home control in the top-LEFT, so
              the middle of this band is the only part never under a fixed
              control at any width. */}
          <button
            type="button"
            onClick={onBackToHall}
            data-testid="commons-back-to-hall"
            data-hub-hint="commons"
            className={`academy-hub-hint academy-commons-inscription-link mt-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-[2px] px-3 text-[10px] font-bold uppercase tracking-[0.3em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd93]/70 sm:text-[11px] ${
              navHintRevealed ? "is-revealed" : ""
            }`}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            Back to the Hall
          </button>
        </div>

        {/* Plaque and board share a row in flow mode; in stage mode each takes
            its own painted mount and this grid stops applying. DOM order is
            unchanged either way, so reading order stays Premium → Community →
            Feedback/About at every width. */}
        <div className="academy-commons-mounts grid gap-4 lg:min-h-0 lg:max-h-[21rem] lg:flex-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-6">
          <HubPremiumPanel />
          <HubCommunitySection />
        </div>

        <div className="academy-commons-mount-utility shrink-0">
          <HubUtilitySection />
        </div>
      </div>

      {/* ---- the plinth --------------------------------------------------
          In stage mode this lands on the painted panelling that runs along the
          foot of the room, between the reading table on the left and the side
          table on the right — the one stretch of it no furniture stands in
          front of, so the inscription is never set over a candle.

          This is the ONE mount that keeps its coded joinery in stage mode.
          Every other panel drops its frame because the painting already has
          one; the painting gives this band no board, so without it the legal
          set read as a web footer laid over the cabinetry. `-plinth` is the
          mount box, `-plinth-inner` is the walnut rail drawn into it — sized
          by its content and centred, so it never fills the whole band. See
          "the legal inscription → the walnut rail" in index.css.

          `scroll-snap-align: end` is set on this element in index.css: it is
          the belt-and-braces that keeps the bottom of the room reachable if
          the Commons ever outgrows the viewport inside the snap gate. */}
      {/* Flow mode keeps the wide side returns and the deep bottom padding:
          the shell floats a friends control in the bottom-LEFT corner of the
          viewport on every page, and at a narrower return it lands on top of
          the first legal link. */}
      <div className="academy-commons-plinth relative z-10 shrink-0 px-4 pb-16 pt-3.5 sm:px-8 sm:pb-4 lg:px-20">
        <div className="academy-commons-plinth-inner mx-auto flex w-full max-w-[86rem] flex-col gap-1.5">
          <div className="academy-commons-plinth-row flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
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
          <p className="academy-commons-inscription academy-commons-disclaimer max-w-5xl text-[11px] leading-snug opacity-80">
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
