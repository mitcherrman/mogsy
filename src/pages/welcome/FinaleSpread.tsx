import type { ReactNode } from "react";

import { MogzyMascot } from "@/components/mascot/MogzyMascot";

import { ChartArt } from "./ChapterPlate";
import { InkBlock, RevealSlot } from "./InkText";
import type { AcademyChapter } from "./academyChapters";
import { chapterBlocks } from "./cadence";

/**
 * The last spread — the one page in the book that is composed rather than
 * templated.
 *
 * EVERY OTHER CHAPTER IS THE SAME OBJECT: an illustration on the left page,
 * words on the right. That uniformity is load-bearing and is not being
 * abandoned — it is what keeps four chapters of uneven source art at equal
 * visual weight (see ChapterPlate). But the finale is not a chapter. It is the
 * close of the book, and its two pages have different jobs:
 *
 *   LEFT  — what Mogzy IS. The title, what the library holds (with the four
 *           things it holds drawn under the sentence that names them), what
 *           the pro data side of it is, and the graph that stands for it.
 *   RIGHT — what the visitor DOES. One line, one picture, two doors.
 *
 * SO THE COPY CROSSES THE GUTTER, and that is the whole structural change. The
 * chapter's three authored blocks are no longer all on one page: blocks one and
 * two are written on the left under the heading, and the third — "Discover
 * insights. Share what you find." — opens the right page above the picture.
 * The heading moves with them.
 *
 * THE SLOT NUMBERS ARE UNCHANGED, WHICH IS WHY THIS COSTS THE CONTROLLER
 * NOTHING. useRevealSequence still counts 1 heading + 3 blocks + 1 terminal =
 * five slots for this chapter; all that changed is WHERE on the spread each
 * slot lands. Any renumbering here would have to be mirrored in
 * `slotCount()` — see the note there.
 *
 * NO CHAMPION IN THE PAPER. Every other spread may print one; this one prints
 * none, on either page. The left page already carries a heading, two
 * paragraphs, four drawn symbols and an animated chart, and the right page's
 * whole job is to hold ONE picture — a faint figure behind either would be a
 * fifth thing competing on a page that has run out of room to compete on.
 */

/* -------------------------------------------------------------------------- */
/* Left page — the library                                                     */
/* -------------------------------------------------------------------------- */

export function FinaleLibraryPage({
  chapter,
  step,
  headingId,
  artRevealed,
  ghost = false,
}: {
  chapter: AcademyChapter;
  step: number;
  headingId?: string;
  /** The illustration channel — the graph rides it, as every plate does. */
  artRevealed: boolean;
  ghost?: boolean;
}) {
  const blocks = chapterBlocks(chapter.lines);
  return (
    <div
      className={["tome-writing tome-library", ghost ? "tome-ghost" : ""].join(" ")}
      data-finale="left"
      data-testid="academy-finale-library"
      // The half of the spread that is prose, announced as one page. The facing
      // page is a line, a picture and two buttons, and its buttons take focus
      // the moment they arrive — so it needs no live region of its own.
      aria-live={ghost ? undefined : "polite"}
      aria-atomic={ghost ? undefined : "true"}
    >
      <RevealSlot revealed={step > 0} className="w-full">
        <p className="tome-eyebrow">{chapter.eyebrow}</p>
        <h1 id={ghost ? undefined : headingId} className="tome-heading">
          {chapter.heading}
        </h1>
      </RevealSlot>

      {/* "…every champion, item, rune, system, and interaction…" — and then the
          four of them, drawn, directly under the sentence that names them. */}
      <InkBlock text={blocks[0] ?? ""} revealed={step > 1} />
      <RevealSlot revealed={step > 1} className="w-full">
        <LibrarySymbols />
      </RevealSlot>

      <InkBlock text={blocks[1] ?? ""} revealed={step > 2} />

      {/* The approved Pro Data graph, restored at 75d60da9 and unchanged since:
          the only major visual on this page, and the reason the page has a
          lower half at all. It rides the illustration channel rather than a
          copy slot, exactly as every other chapter's plate does. */}
      <RevealSlot revealed={artRevealed} className="tome-library-graph">
        <div className="tome-art tome-library-chart">
          <ChartArt />
        </div>
      </RevealSlot>
    </div>
  );
}

/**
 * The four things the library holds, drawn.
 *
 * NOT CONTROLS, and not a legend. There is no label under any of them, nothing
 * is focusable, nothing has a hover state and there is no row of names to read:
 * the sentence directly above already names all four, so these are the same
 * four words in the book's own hand. They are `aria-hidden` for exactly that
 * reason — a screen reader that heard "champion, item, rune, system" and then
 * heard four more images announced would be read the page twice.
 *
 * WHY THEY ARE MOUNTED ON A DARK GROUND. The system symbol is the Elder Dragon,
 * and that file is 48px RGB with no alpha — dropping it onto lit parchment
 * would print its black backing square onto the page (the rule ChapterPlate
 * states for the class characters, and the same solution: mount it INSIDE a
 * dark plate, where the backing reads as the inside of the plate). The other
 * three are then drawn to match rather than left to float, so the row reads as
 * four seals pressed into the paper rather than as three sketches and a
 * photograph.
 */
function LibrarySymbols() {
  return (
    <div className="tome-symbols" data-testid="academy-library-symbols" aria-hidden="true">
      <Symbol id="champion">
        {/* A helm, with the visor slit carrying it. These are drawn at ~19px
            and read at that size or not at all: a crest and two eye slits
            collapsed into one blob, a single strong horizontal does not. */}
        <path d="M6.4 12.6V9.7c0-3.1 2.5-5.5 5.6-5.5s5.6 2.4 5.6 5.5v2.9c0 3.4-2.5 5.9-5.6 7.4-3.1-1.5-5.6-4-5.6-7.4Z" />
        <path d="M6.9 11.3h10.2" />
      </Symbol>
      <Symbol id="item">
        {/* A cut gem. */}
        <path d="M7.6 4.9h8.8l3 4.4L12 19.1 4.6 9.3l3-4.4Z" />
        <path d="M4.6 9.3h14.8" />
        <path d="M9.7 4.9 12 19.1l2.3-14.2" />
      </Symbol>
      <Symbol id="rune">
        {/* A keystone. */}
        <path d="M12 2.9 19.6 7.4v9.2L12 21.1 4.4 16.6V7.4L12 2.9Z" />
        <path d="M12 7.7 15.8 10v4L12 16.3 8.2 14v-4L12 7.7Z" />
      </Symbol>
      {/* The system symbol, and the one the brief names outright. */}
      <span className="tome-symbol" data-symbol="system">
        <img
          src="/assets/ranked/elder-dragon.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          decoding="async"
          className="tome-symbol-art"
        />
      </span>
    </div>
  );
}

/** One drawn symbol, inside the plate the four of them share. */
function Symbol({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="tome-symbol" data-symbol={id}>
      <svg
        viewBox="0 0 24 24"
        className="tome-symbol-glyph"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="presentation"
        aria-hidden="true"
      >
        {children}
      </svg>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Right page — discovery                                                      */
/* -------------------------------------------------------------------------- */

export function FinaleDiscoveryPage({
  chapter,
  step,
  terminalSlot,
  terminal = null,
  ghost = false,
}: {
  chapter: AcademyChapter;
  step: number;
  /** The slot the two exits arrive on — resolved by the caller, as ever. */
  terminalSlot: number;
  /** The two exits. Never rendered on a ghost; the finale never turns anyway. */
  terminal?: ReactNode;
  ghost?: boolean;
}) {
  const blocks = chapterBlocks(chapter.lines);
  const line = blocks[2] ?? "";
  const lineSlot = 3;
  return (
    <div
      className={["tome-writing tome-discovery", ghost ? "tome-ghost" : ""].join(" ")}
      data-finale="right"
      data-testid="academy-finale-discovery"
    >
      <InkBlock text={line} revealed={step > lineSlot} />

      {/* One picture, arriving with the line it illustrates. */}
      <RevealSlot revealed={step > lineSlot} className="tome-discovery-stage">
        <MogzyTeemo />
      </RevealSlot>

      {!ghost && step > terminalSlot && terminal}
    </div>
  );
}

/**
 * Mogzy, and a Teemo emote.
 *
 * ONE COMPOSED PICTURE, not a scattering. Two assets and one glow: the emote is
 * the focal object — raised, lit, and the only round thing on the page — and
 * Mogzy stands under it looking up, which is what makes it read as something he
 * FOUND rather than as a sticker placed beside him. That is the whole of the
 * right page's argument: discovery, then share.
 *
 * BOTH FILES HAVE REAL ALPHA, which is why this one composition is allowed to
 * stand on the parchment unframed while the symbols above it are not: Mogzy's
 * base pose and the emote are cut out, so there is no backing square to hide.
 * (See MOGZY_MASCOT_ASSETS — `base` is the only pose with an alpha channel.)
 *
 * Entirely decorative. "Discover insights. Share what you find." is directly
 * above it and says what it is for.
 */
function MogzyTeemo() {
  return (
    <div className="tome-discovery-scene" data-testid="academy-finale-mogzy-teemo" aria-hidden="true">
      <div className="tome-discovery-glow" aria-hidden="true" />
      <MogzyMascot
        pose="base"
        decorative
        loading="lazy"
        className="tome-discovery-mogzy"
      />
      <img
        src="/images/teemo-emote.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        decoding="async"
        className="tome-discovery-emote"
        data-testid="academy-finale-teemo"
      />
    </div>
  );
}
