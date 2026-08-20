import type { CSSProperties, ReactNode } from "react";

import bookSpread from "@/academy/welcome/academy-book-spread.png";

/**
 * The tome — the whole stage of the Academy introduction.
 *
 * ONE PAINTING, TWO LAYOUTS. The book is the owner-approved Academy Broadcast
 * frame (`academy-broadcast-book.png`), the same painting the hub already uses
 * for its broadcast surface, so the introduction and the room behind it are
 * furnished from the same world. It is served here from a downscaled derivative
 * in `src/academy/welcome/` — the public original is 2.6 MB, which is not a
 * reasonable first-visit cost for a decorative frame, and this page renders it
 * at ~1000px at most. Originals untouched; the same treatment HI1-2 gave the
 * Stat Check art.
 *
 * GEOMETRY. Measured from the PNG's alpha, and identical in the derivative
 * because it is a pure downscale (see AcademyBroadcastSurface for the full
 * derivation):
 *   drawn book bbox   x 11.6–88.4%, y 6.1–89.5% of the canvas
 *   spine             x ≈ 48.5–51.5%
 * The negative margins below reclaim every transparent pixel so this
 * component's LAYOUT BOX EQUALS THE DRAWN BOOK. That is what lets the page
 * overlays be expressed as plain fractions and lets the height budget below
 * buy visible book rather than empty canvas. In container coordinates the
 * spine's centre sits at x ≈ 50%, and the right page's paper runs from just
 * right of it to a little inside the cover — which is where the turning leaf
 * below gets its box.
 *
 * SIZING. The book is sized by whichever runs out first — width or height —
 * rather than by width alone, because a spread that overflows vertically puts
 * the controls under the fold, which is precisely how the popup this replaces
 * failed. `--tome-chrome` is the vertical room the surrounding controls need;
 * 1.381 is the drawn book's own aspect ratio (0.768W / 0.556W).
 *
 * THE TURNING LEAF (HI1-C2). When `turning` is set, a physical sheet is staged
 * over the right page: its FRONT face carries the outgoing chapter's writing —
 * the words stay on the page that turns, they are never wiped first — and its
 * BACK face is blank parchment, because the next page has not been written
 * yet. The leaf rotates across the spine under a moving fold-light, throwing a
 * shadow ahead of itself, and lands on the left page; since its back matches
 * the blank paper beneath, its unmount is invisible and the new chapter then
 * writes itself onto the uncovered spread. The whole thing is presentational —
 * `aria-hidden`, driven by one CSS animation, removed on a timer by the page.
 *
 * MOBILE IS NOT A SMALLER SPREAD. A 3:2 two-page spread at 360px wide is 260px
 * tall, and half of that is frame — there is no honest way to write a chapter
 * into it. A landscape phone fails the same test from the other direction: the
 * height budget above would size the book down to ~315px to fit 360px of
 * viewport. Phones therefore get a single parchment sheet instead — the same
 * vellum, the same gold rule, the same ink, one page rather than two, stacked
 * in portrait and side by side in landscape. The concept is preserved; only the
 * furniture changes — including the page turn, which flips the whole sheet
 * like a notepad page. Tablets and up have room for the real book.
 */
export interface TomeTurning {
  /** The outgoing chapter's illustration — rides the single-sheet leaf. */
  art: ReactNode;
  /** The outgoing chapter's writing — the front face of the turning leaf. */
  body: ReactNode;
}

export default function AcademyTome({
  art,
  body,
  turning = null,
  variant,
  chrome,
  className = "",
}: {
  /** The chapter's illustration. Left page on a spread, top on a single page. */
  art: ReactNode;
  /** The chapter's writing. Right page on a spread, below on a single page. */
  body: ReactNode;
  /** The outgoing chapter, while its page is physically turning. */
  turning?: TomeTurning | null;
  /**
   * `spread`  — the painted two-page book. Tablets and up.
   * `page`    — one parchment sheet, art above the writing. Portrait phones.
   * `panel`   — one parchment sheet, art beside the writing. Landscape phones,
   *             where there is width to spare and almost no height: the spread
   *             would size itself down to ~300px to fit 360px of viewport, and
   *             a 120px-wide page cannot hold a chapter.
   */
  variant: "spread" | "page" | "panel";
  /** Vertical room, in px, reserved for the controls around the tome. */
  chrome: number;
  className?: string;
}) {
  if (variant !== "spread") {
    const beside = variant === "panel";
    return (
      <div
        className={`academy-tome tome-single relative mx-auto ${beside ? "tome-single-wide" : ""} ${className}`}
        style={{ ["--tome-chrome" as string]: `${chrome}px` } as CSSProperties}
      >
        <div className="tome-halo" aria-hidden="true" />
        <div
          className={`tome-sheet relative overflow-hidden ${
            beside ? "flex items-center gap-4" : "flex flex-col items-center"
          }`}
        >
          <div className="tome-single-art">{art}</div>
          <div className={beside ? "tome-rule-v" : "tome-rule"} aria-hidden="true" />
          <div className="tome-single-body">{body}</div>
        </div>
        {turning && (
          <div className="tome-leaf-stage" aria-hidden="true">
            {/* The whole sheet turns — front face is the outgoing chapter, back
                face is the same blank vellum the incoming sheet shows beneath. */}
            <div className="tome-leaf tome-leaf-whole">
              <div
                className={`tome-leaf-front tome-sheet tome-ghost ${
                  beside ? "flex items-center gap-4" : "flex flex-col items-center"
                }`}
              >
                <div className="tome-single-art">{turning.art}</div>
                <div className={beside ? "tome-rule-v" : "tome-rule"} />
                <div className="tome-single-body">{turning.body}</div>
              </div>
              <div className="tome-leaf-back tome-sheet" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`academy-tome tome-spread relative mx-auto ${className}`}
      style={{ ["--tome-chrome" as string]: `${chrome}px` } as CSSProperties}
    >
      <div className="tome-halo" aria-hidden="true" />
      {/* Decorative only — every word on the pages is live HTML above it, so a
          screen reader never depends on pixels. */}
      <img
        src={bookSpread}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        fetchPriority="high"
        /* The painting's own pixel dimensions, and the reason the opening frame
           is now stable (HI1-C4). This element has `height: auto`, so until the
           file decoded the browser had nothing to derive a height from: the img
           measured 0, the flex column above it measured 0, and both page boxes
           — positioned against that column's inset-0 overlay — collapsed into a
           zero-height strip with the chapter's writing spilling out of it. The
           book landing then snapped the whole spread to its real size, which is
           most of what read as the page assembling itself. Stating the
           intrinsic ratio reserves the final geometry from the first frame;
           nothing moves when the pixels arrive. */
        width={1000}
        height={666}
        data-testid="academy-tome-book"
        className="tome-book pointer-events-none relative block w-[130.2%] max-w-none select-none ml-[-15.1%] mt-[-5.3%] mb-[-9.11%]"
      />
      <div className="absolute inset-0">
        {/* Both regions stop short of the x 48–52% spine band and of the ornate
            frame, so nothing is ever written into the gutter or over the gold.
            Their insets — including the inward offset HI1-C4 added — live in
            index.css beside the rest of the tome's geometry, as one tunable. */}
        <div className="tome-page tome-page-verso">{art}</div>
        <div className="tome-page tome-page-recto">{body}</div>
      </div>
      {turning && (
        <div className="tome-leaf-stage" aria-hidden="true">
          {/* The shadow the lifting sheet casts ahead of itself, sweeping the
              left page as the leaf crosses the gutter. */}
          <div className="tome-leaf-shade" />
          <div className="tome-leaf tome-leaf-right">
            <div className="tome-leaf-front">
              {/* The outgoing writing, exactly where the live right page had
                  it — the reader must see the words ride the turning paper. */}
              <div className="tome-leaf-content tome-ghost">{turning.body}</div>
            </div>
            <div className="tome-leaf-back" />
          </div>
        </div>
      )}
    </div>
  );
}
