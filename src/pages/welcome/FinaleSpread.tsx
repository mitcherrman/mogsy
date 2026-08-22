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
 *   LEFT  — the LIBRARY, and nothing else. The title, the one sentence that
 *           says what Mogzy holds, and the four things it names, drawn large.
 *   RIGHT — PRO DATA, then DISCOVERY, then the two doors. In that order, top
 *           to bottom, with the graph as the page's visual anchor.
 *
 * SO THE COPY CROSSES THE GUTTER, and that is the whole structural change. The
 * chapter's three authored blocks are not all on one page: block one is written
 * on the left under the heading, and blocks two and three open the right page —
 * "Explore pro data…" above the graph it introduces, and "Discover insights.
 * Share what you find." below it, with the Teemo emote as its accent. The
 * heading stays with block one.
 *
 * THE SLOT NUMBERS ARE UNCHANGED, WHICH IS WHY THIS COSTS THE CONTROLLER
 * NOTHING. useRevealSequence still counts 1 heading + 3 blocks + 1 terminal =
 * five slots for this chapter; all that changed is WHERE on the spread each
 * slot lands. Any renumbering here would have to be mirrored in
 * `slotCount()` — see the note there.
 *
 *   slot 0  the chapter label and the heading          left
 *   slot 1  "Mogzy brings together…" and the four icons left
 *   slot 2  "Explore pro data…"                        right
 *   slot 3  "Discover insights…" and the Teemo accent  right
 *   slot 4  the two exits                              right
 *
 * The graph is not a slot. It rides the illustration channel (`artRevealed`)
 * exactly as every chapter's plate does, so it begins drawing itself while the
 * copy is still arriving — the two-channel choreography the whole book is built
 * on, on the one page that has a real drawing to make.
 *
 * NO MASCOT AND NO CHAMPION IN THE PAPER. Every other spread may print a faint
 * champion behind its page; this one prints none, on either page, and Mogzy
 * himself is not on it. The left page's four icons and the right page's graph
 * are what the eye is meant to land on, and a fifth and sixth figure competing
 * with them is the dashboard this page was rewritten to stop being.
 */

/* -------------------------------------------------------------------------- */
/* Left page — the library                                                     */
/* -------------------------------------------------------------------------- */

export function FinaleLibraryPage({
  chapter,
  step,
  headingId,
  ghost = false,
}: {
  chapter: AcademyChapter;
  step: number;
  headingId?: string;
  ghost?: boolean;
}) {
  const blocks = chapterBlocks(chapter.lines);
  return (
    <div
      className={["tome-writing tome-library", ghost ? "tome-ghost" : ""].join(" ")}
      data-finale="left"
      data-testid="academy-finale-library"
      // One sentence and four pictures, announced as one page. The facing page
      // has its own live region — see below.
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
          four of them, drawn large, directly under the sentence that names
          them. Nothing else is written on this page. */}
      <InkBlock text={blocks[0] ?? ""} revealed={step > 1} />
      <RevealSlot revealed={step > 1} className="tome-symbols-slot w-full">
        <LibrarySymbols />
      </RevealSlot>
    </div>
  );
}

/**
 * The four things the library holds — champion, item, rune, system.
 *
 * REAL LEAGUE ART, NOT DRAWN GLYPHS. The first pass at this row was four
 * hand-drawn ink marks at ~19px: legible, consistent, and saying nothing that
 * the sentence above them had not already said in words. These are the actual
 * icons the game uses, at four times the size, so the row is recognisably
 * League rather than decoratively medieval.
 *
 *   champion  Ahri's champion icon — the same champion who stands in the paper
 *             on the opening spread, so the book's first page and its last
 *             agree about who it is about
 *   item      Infinity Edge (3031) — the item this product's own quiz strip
 *             already uses to mean "itemization"
 *   rune      Electrocute — a keystone, and the most legible silhouette of the
 *             sixty-odd runes in the store
 *   system    the Elder Dragon, which is the icon the brief names outright and
 *             the one the quiz strip already uses to mean "objectives"
 *
 * ALL FOUR ARE LOCAL FILES. Three are copied into `public/images/library/`
 * rather than resolved through `resolveQuizAssetUrl`, which points at the
 * Ranked service's asset host: this is the first screen a new visitor ever
 * sees, and nothing on it may render empty because a backend is cold. That is
 * the same rule ChapterPlate states for the chapter illustrations.
 *
 * ONE PLATE, FOUR SIZES OF SOURCE. Ahri's icon is 128px RGB, the item is 64px
 * RGB, Electrocute is 256px RGBA and the dragon is 48px RGB — three of them
 * opaque squares with their own art behind them, one a glyph on nothing. Left
 * alone that row is three photographs and a sticker. Mounted in the same dark
 * roundel it is four seals: the opaque squares fill their disc (`cover`), and
 * the transparent keystone sits inside it (`contain`) exactly as a rune sits in
 * its socket in the game.
 *
 * NOT CONTROLS, and not a legend. There is no label under any of them, nothing
 * is focusable, nothing has a hover state and there is no row of names to read.
 * The row is `aria-hidden` because the sentence directly above it already names
 * all four — a screen reader that heard "champion, item, rune, system" and then
 * heard four images announced would be read the page twice.
 */
const LIBRARY_SYMBOLS = [
  { id: "champion", src: "/images/library/champion-ahri.png", fit: "cover" },
  { id: "item", src: "/images/library/item-infinity-edge.png", fit: "cover" },
  { id: "rune", src: "/images/library/rune-electrocute.png", fit: "contain" },
  { id: "system", src: "/assets/ranked/elder-dragon.webp", fit: "cover" },
] as const;

function LibrarySymbols() {
  return (
    <div className="tome-symbols" data-testid="academy-library-symbols" aria-hidden="true">
      {LIBRARY_SYMBOLS.map((symbol) => (
        <span key={symbol.id} className="tome-symbol" data-symbol={symbol.id}>
          <img
            src={symbol.src}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading="lazy"
            decoding="async"
            className="tome-symbol-art"
            data-fit={symbol.fit}
          />
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Right page — pro data, then discovery, then the doors                       */
/* -------------------------------------------------------------------------- */

export function FinaleDiscoveryPage({
  chapter,
  step,
  terminalSlot,
  /** The illustration channel — the graph rides it, as every plate does. */
  artRevealed,
  terminal = null,
  ghost = false,
}: {
  chapter: AcademyChapter;
  step: number;
  terminalSlot: number;
  artRevealed: boolean;
  /** The two exits. Never rendered on a ghost; the finale never turns anyway. */
  terminal?: React.ReactNode;
  ghost?: boolean;
}) {
  const blocks = chapterBlocks(chapter.lines);
  return (
    <div
      className={["tome-writing tome-discovery", ghost ? "tome-ghost" : ""].join(" ")}
      data-finale="right"
      data-testid="academy-finale-discovery"
      aria-live={ghost ? undefined : "polite"}
      aria-atomic={ghost ? undefined : "true"}
    >
      {/* 1. What the graph is about, above the graph. */}
      <InkBlock text={blocks[1] ?? ""} revealed={step > 2} />

      {/* 2. The approved Pro Data graph, restored at 75d60da9 and unchanged
             since — the same paths, the same dash-offset drawing, the same
             component. It is this page's anchor and the only thing on the
             spread allowed to grow: `flex: 1` in the CSS, so the parchment
             between the copy and the buttons is FILLED by the drawing rather
             than left as a gap under it. */}
      <RevealSlot revealed={artRevealed} className="tome-finale-graph">
        <div className="tome-art tome-finale-chart">
          <ChartArt />
        </div>
      </RevealSlot>

      {/* 3 & 4. The closing line, and Teemo under it. The emote is an ACCENT —
             a fraction of the graph's size, sitting with the sentence it is
             reacting to rather than standing on its own as a picture. */}
      <InkBlock text={blocks[2] ?? ""} revealed={step > 3} />
      <RevealSlot revealed={step > 3} className="tome-discovery-accent">
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
      </RevealSlot>

      {/* 5 & 6. */}
      {!ghost && step > terminalSlot && terminal}
    </div>
  );
}
