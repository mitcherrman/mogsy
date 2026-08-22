import { useCallback, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import bookSpread from "@/academy/welcome/academy-book-spread.png";

import type { ChampionBackdrop, ChapterChampions } from "./academyChapters";

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
 * THE TURNING LEAF (HI1-C2, re-cut in the polish pass). When `turning` is set,
 * a physical sheet is staged over the right page: its FRONT face carries the
 * outgoing chapter's writing — the words stay on the page that turns, they are
 * never wiped first — and its BACK face is blank parchment, because the next
 * page has not been written yet. The leaf rotates across the spine under a
 * moving fold-light, throwing a shadow ahead of itself, and lands on the left
 * page; since its back matches the blank paper beneath, its unmount is
 * invisible and the new chapter then writes itself onto the uncovered spread.
 * The whole thing is presentational — `aria-hidden`, driven by one CSS
 * animation, removed on a timer by the page.
 *
 * AND THE SHEET IS CUT OUT OF THE PAINTING. The leaf used to be a hand-written
 * beige gradient sized to a box that ran past the paper on all four sides, so
 * at rest it was a slab lying ON the book rather than a page OF it, and its
 * colour was simply a different cream from the painted paper's. Both faces are
 * now the spread's own pixels: the box is the drawn paper — spine to cover, x
 * 50–92%, y 13–88% of the tome, measured off the file — and `--tome-paper` is
 * positioned into it so the front face shows the right page and the back face
 * shows the left. At 0deg the leaf is invisible against the page under it, and
 * at rest on the left page it is invisible against that one. There is no new
 * colour anywhere in the turn; the fold light and the cast shadow are the only
 * things added, and they darken and lighten the real paper rather than
 * replacing it.
 *
 * ONE CHAMPION PER PAGE, PRINTED INTO THE PAPER. A chapter may name a champion
 * drawing for either page (see academyChapters). It is rendered here rather
 * than inside ChapterPlate because it is a property of the PAGE, not of the
 * illustration: it sits behind everything on that page, it is clipped by the
 * page box so the paper does the cropping, and on the writing page it has to
 * pass under running text. The rule that at most one may appear on a page is
 * structural — each page slot takes a single descriptor, and the phone's single
 * sheet is one page and therefore takes one drawing, whichever the chapter
 * defines first.
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
  champions,
  championsVisible = false,
  turning = null,
  variant,
  chrome,
  className = "",
}: {
  /** The chapter's illustration. Left page on a spread, top on a single page. */
  art: ReactNode;
  /** The chapter's writing. Right page on a spread, below on a single page. */
  body: ReactNode;
  /** The chapter's champion drawings, at most one per page. */
  champions?: ChapterChampions;
  /**
   * Whether the drawings are on the paper yet. They ride the illustration
   * channel — one layer, fading in as a whole under copy already on the page —
   * so the page hands the same `artRevealed` it hands the illustration.
   */
  championsVisible?: boolean;
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
  /**
   * Whether the painted book has actually arrived.
   *
   * The champion drawings are printed ON the paper, so they may not appear
   * before the paper does — and the readiness gate cannot promise that it has:
   * useSceneReady caps its wait at SCENE_READY_CAP_MS and opens the tome
   * regardless, which is correct (an introduction may not hang on a decode) but
   * leaves a window in which the page boxes are live over the bare room. A
   * drawing at 16% opacity is nearly invisible on parchment and conspicuous on
   * a near-black backdrop, so it waits for its own ground rather than for the
   * scene's.
   *
   * The ref callback covers the warm-cache case, where the image is already
   * complete before React attaches a listener and `load` never fires at all.
   * Only the painted spread needs this: a phone's sheet is CSS, and CSS is
   * always there.
   */
  const [bookLoaded, setBookLoaded] = useState(false);
  const bookRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setBookLoaded(true);
  }, []);

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
          {/* One sheet is one page, so it takes ONE drawing — the illustration
              page's if the chapter has one, otherwise the writing page's. */}
          <PageChampion
            champion={champions?.verso ?? champions?.recto}
            visible={championsVisible}
          />
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
      /* `--tome-paper` is the PAINTING ITSELF, handed to the CSS so the turning
         leaf can be cut out of it rather than approximated by a gradient — see
         the note on the leaf below, and the geometry in index.css. Passed from
         here rather than written into the stylesheet so the sheet and the
         painted spread resolve to the same hashed URL and the same cache
         entry. */
      style={
        {
          ["--tome-chrome" as string]: `${chrome}px`,
          ["--tome-paper" as string]: `url(${bookSpread})`,
        } as CSSProperties
      }
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
        ref={bookRef}
        onLoad={() => setBookLoaded(true)}
        onError={() => setBookLoaded(true)}
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
        <div className="tome-page tome-page-verso">
          <PageChampion champion={champions?.verso} visible={championsVisible && bookLoaded} />
          {art}
        </div>
        <div className="tome-page tome-page-recto">
          <PageChampion champion={champions?.recto} visible={championsVisible && bookLoaded} />
          {body}
        </div>
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

/* -------------------------------------------------------------------------- */

/**
 * One champion drawing, faded into a single page of the tome.
 *
 * ENTIRELY DECORATIVE, and clipped by its own box — the wrapper is `inset: 0`
 * over the page region with `overflow: hidden`, so the drawing can never reach
 * the gutter, the painted frame or the sheet's edge whatever its aspect ratio
 * and whatever the viewport is doing. `object-fit: contain` keeps it whole and
 * lets the page crop it rather than the file being cropped in advance.
 *
 * THE STEADY STATE IS VISIBLE, and it is reached by a TRANSITION rather than an
 * animation. A layer whose only visible state lives inside a keyframe is
 * invisible whenever the clock is not running — a backgrounded tab really does
 * freeze it — so the worst case here is a drawing that is simply already there.
 *
 * `loading="lazy"` and no place in the readiness gate, deliberately: these are
 * the largest files on the route, they sit at roughly a tenth of an opacity
 * behind everything else, and nothing about the introduction's first frame may
 * wait on one. See the same rule for the room plate in AcademyWelcomePage.
 */
function PageChampion({
  champion,
  visible,
}: {
  champion?: ChampionBackdrop;
  visible: boolean;
}) {
  if (!champion) return null;
  return (
    <div
      className="tome-champion"
      data-testid="tome-champion"
      data-visible={visible ? "true" : "false"}
      aria-hidden="true"
      style={{ ["--tome-champion-strength" as string]: String(champion.strength) } as CSSProperties}
    >
      <img
        src={champion.src}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        decoding="async"
        className="tome-champion-art"
        style={{ objectPosition: champion.focus ?? "center" }}
      />
    </div>
  );
}
