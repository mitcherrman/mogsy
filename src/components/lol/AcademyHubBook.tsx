import { useState } from "react";
import { Link } from "react-router-dom";
import closedBookFrame from "@/assets/academy-book-frame.png";
import { CLOSED_BOOK_HEIGHT_RATIO } from "@/components/lol/academy-layout";

/**
 * Closed Academy volume — the /lol hub destination object.
 *
 * All four primary destinations render through this one component; the
 * open-book `BookModeCard` no longer appears on the hub. Only the champion
 * splash and the cover title differ per destination — the shell is shared,
 * always drawn in its native orientation, and every volume is presented
 * HEAD-ON. The inward rotation the books used to carry was there to explain
 * their placement around Mogzy; the shelves do that now, so it is gone and
 * all four are square to the viewer.
 *
 * Nothing is baked into the artwork. The book is assembled as layers so the
 * splash, the title and the shell can each be tuned independently and the
 * whole assembly is transformed as ONE object:
 *
 *   1. champion splash        (fills the frame's transparent art window)
 *   2. transparent book shell (`academy-book-frame.png`, 1024×1536 RGBA)
 *   3. HTML title             (real text on the lower leather panel)
 *   4. interaction / focus layer
 *
 * Measured frame geometry — flood-filled from the PNG's own alpha channel,
 * as fractions of the 1024×1536 canvas:
 *   drawn book (alpha ≥ 200)  x 1.07–98.54%   y 1.04–97.27%
 *   art window (interior α=0) x 16.60–90.04%  y  7.88–63.48%
 *
 * The drawn book therefore covers 97.5% × 96.2% of the canvas — about 1% of
 * transparent margin per side, which is soft glow rather than dead space. So
 * unlike `BookModeCard` (which reclaims a large transparent border with
 * negative margins) the LAYOUT BOX IS THE CANVAS here: card height =
 * width × CLOSED_BOOK_HEIGHT_RATIO exactly, with no margin arithmetic.
 *
 * Vertical split of the drawn book: the art window is ~58% of its height and
 * the leather/title section below it ~35%. Counting the gold framing that
 * surrounds the window as part of the art region, the cover reads at roughly
 * 65/35 art-to-leather, which is the approved proportion.
 */

/**
 * Transparent art window, as % of the PNG canvas (alpha-measured).
 *
 * EVERY book uses the shell in its NATIVE orientation, spine on the left.
 * A right-column shell drawn with `scaleX(-1)` — to put both columns' spines
 * on the outer edge — was tried and rejected on 2026-09-03: reflected
 * physical artwork reads as wrong artwork, which costs more than bilateral
 * symmetry buys. The books still face inward, but through the CSS perspective
 * alone. So there is exactly one set of coordinates here.
 */
const ART_WINDOW = {
  left: "16.60%",
  top: "7.88%",
  width: "73.44%", // 90.04 − 16.60
  height: "55.60%", // 63.48 −  7.88
} as const;

/**
 * Lower leather panel that carries the destination title, inset INSIDE the
 * gold trim rather than merely inside the cover. Measured from the frame's
 * warm-pixel rails: the panel's side rails run x 14.8–16.8% and 89.7–91.8%,
 * the ornamented rail under the art window ends at y ≈ 64.3% and the bottom
 * rail sits at y ≈ 90.9%. Centring on the COVER (x ≈ 53%, right of the
 * canvas centre because the spine eats the left 13%) is what keeps the title
 * optically centred on the leather rather than on the PNG.
 */
const TITLE_PANEL = {
  left: "17.5%",
  top: "67%",
  width: "71%",
  height: "22%",
} as const;

type Props = {
  to: string;
  /** Accessible name. Must stay the registry/guide title (asserted by tests). */
  title: string;
  /**
   * Text rendered as real HTML on the leather panel — never baked into the
   * art. Lines are split on "\n" and never on spaces, so the registry
   * controls the setting exactly: "Leaguecraft\nStudies" stacks as
   * LEAGUECRAFT / STUDIES while "Pro Play" stays on one line. Defaults to
   * `title`.
   */
  coverTitle?: string;
  /** Resolved champion splash URL; falls back to bare leather if absent. */
  splashUrl?: string | null;
  /**
   * `object-position` for the splash inside the art window. The window is
   * portrait (0.88:1) and splash art is landscape (~1.7:1), so `object-cover`
   * fills the window's height and crops horizontally — X frames the
   * champion's face, Y is close to inert.
   */
  splashPosition?: string;
  /** Id of the sr-only description this destination is described by. */
  describedBy?: string;
  onClick?: () => void;
};

export default function AcademyHubBook({
  to,
  title,
  coverTitle,
  splashUrl,
  splashPosition = "60% center",
  describedBy,
  onClick,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = !!splashUrl && !imgFailed;
  const lines = (coverTitle ?? title)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <Link
      to={to}
      aria-label={title}
      aria-describedby={describedBy}
      onClick={onClick}
      className="academy-hub-book group relative block w-full select-none focus-visible:outline-none [container-type:inline-size]"
    >
      {/*
        The assembled volume. Everything inside — splash, shell, title —
        rides this one element, so the hover lift moves the book as one
        object rather than as a stack of independently-moving layers.
      */}
      <div
        className="academy-hub-book-body relative"
        style={{ aspectRatio: `1 / ${CLOSED_BOOK_HEIGHT_RATIO}` }}
      >
        {/* 1 — champion splash, filling the frame's transparent art window.
               Sits UNDER the shell so the gold trim overlaps its edges and
               the art reads as inlaid into the cover. */}
        <div className="absolute overflow-hidden" style={ART_WINDOW}>
          {hasImage && (
            <img
              src={splashUrl ?? undefined}
              alt=""
              aria-hidden
              draggable={false}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
              style={{ objectPosition: splashPosition }}
            />
          )}
          {/* Seats the art into the cover: a dark vignette at the edges and a
              bottom gradient so the gold lower rail reads over the splash. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              boxShadow: "inset 0 0 26px rgba(3,7,16,0.62), inset 0 0 3px rgba(0,0,0,0.9)",
              background:
                "linear-gradient(to top, rgba(6,11,24,0.42) 0%, transparent 26%)",
            }}
            aria-hidden
          />
        </div>

        {/* 2 — the transparent book shell. Base layer of the physical volume:
               navy leather covers, antique-gold framing, spine and thickness. */}
        <img
          src={closedBookFrame}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full"
        />

        {/* 3 — destination title, real HTML on the leather panel. */}
        <div
          className="absolute flex flex-col items-center justify-center text-center"
          style={TITLE_PANEL}
        >
          <h3
            className="academy-hub-book-title book-title-glimmer bg-clip-text font-medium uppercase leading-[1.14] tracking-[0.1em] text-transparent"
            style={{
              // Sized so the longest word ("LEAGUECRAFT" — 11 Cinzel caps at
              // 0.1em tracking, ≈ 8.6 em of advance) clears the panel's inner
              // rails at every book width instead of crowding the gold.
              fontSize: "clamp(0.68rem, 8cqw, 2rem)",
              fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif',
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            {lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h3>
        </div>

        {/* 4 — interaction layer. Gold rim response on hover/focus, scoped to
               the art window so it reads as light catching the inlay rather
               than a glow around the whole card. */}
        <div
          className="pointer-events-none absolute opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{
            ...ART_WINDOW,
            boxShadow:
              "inset 0 0 0 1px rgba(226,196,120,0.55), inset 0 0 22px rgba(226,196,120,0.22)",
          }}
          aria-hidden
        />
        {/* Keyboard focus ring on the drawn book body (alpha bbox). */}
        <div
          className="pointer-events-none absolute rounded-[4px] group-focus-visible:ring-2 group-focus-visible:ring-[#e2c478]"
          style={{ left: "1.07%", top: "1.04%", width: "97.47%", height: "96.23%" }}
          aria-hidden
        />
      </div>
    </Link>
  );
}
