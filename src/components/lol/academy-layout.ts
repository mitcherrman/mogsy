/**
 * Academy hub responsive layout system (MALT responsive pass).
 *
 * The desktop hub is a single-screen composition. Every major surface used to
 * be sized by viewport WIDTH alone (plus one shallow height slope on the
 * books that deliberately let the third row run past the fold below 1080 —
 * a trade struck before the floating HUD and the current title existed). On
 * wide-but-short laptop viewports that combination made the section taller
 * than the viewport: the vertically-centred book columns spilled their
 * overflow upward into the title band, the fixed −50px column lift (tuned at
 * 1080) pushed them further, and the width-driven central stack crowded
 * Mogzy against the radio dock.
 *
 * The fix is one coordinated rule, not per-element nudges: every surface is
 * sized by  min(width-driven term, height-fit term)  where the height-fit
 * terms are calibrated so both terms are EQUAL at a viewport height of
 * ~REGIME_BOUNDARY_VH (1000px). That makes the regimes:
 *
 *   TALL  (height ≥ ~1000px) — the width term binds: the approved
 *          composition, bit-identical at 1920×1080 and 2560×1440.
 *   SHORT (height < ~1000px) — the height-fit term binds: title, books,
 *          centerpiece and column lift all compress together, fast enough
 *          that heading + three book rows + bottom padding fit inside 100dvh.
 *
 * Because the switch is a min() crossover, there is no breakpoint snap: at
 * 999px the short values are within a pixel of the tall ones. Width-only
 * media queries stay untouched (mobile < md is a different layout entirely).
 *
 * Each exported *_CSS string is consumed by LolHub.tsx; the matching *Px()
 * function is the same formula in JS, used by tests to assert the geometry
 * contract (fit, continuity, baseline preservation) without brittle
 * browser-pixel assertions.
 */

/** Viewport height (px) where the width-driven and height-fit terms meet. */
export const REGIME_BOUNDARY_VH = 1000;

/* ---------------------------------------------------------------- books -- */

/**
 * Book card width. The card's height is width × 0.542 (BookModeCard reclaims
 * the frame PNG's transparent padding, so the layout box IS the drawn book).
 *
 * Tall term — the original shallow slope: 0.308 × 100dvh + 176px
 *   (1080 → 509px wide / 276px tall: the approved 1920×1080 composition).
 * Short term — the fit slope: (100dvh − 212px) × 0.615
 *   Derived from requiring three rows to fit the fold:
 *     3 × (w × 0.542) + 2 gaps ≤ 100dvh − (top pad + heading + bottom pad)
 *   with the compact heading ≈ 100–110px, pb 3.5rem, gaps ≤ 12px. The terms
 *   cross at h ≈ 998, so min() hands over exactly at the regime boundary.
 */
export const BOOK_TALL_SLOPE = 0.308;
export const BOOK_TALL_INTERCEPT_PX = 176;
export const BOOK_FIT_OFFSET_PX = 212;
export const BOOK_FIT_SLOPE = 0.615;

export const BOOK_MAX_WIDTH_CSS = `min(100%, calc(100dvh * ${BOOK_TALL_SLOPE} + ${BOOK_TALL_INTERCEPT_PX}px), calc((100dvh - ${BOOK_FIT_OFFSET_PX}px) * ${BOOK_FIT_SLOPE}))`;

/** JS twin of BOOK_MAX_WIDTH_CSS (columnWidth stands in for the 100% cap). */
export function bookMaxWidthPx(vh: number, columnWidth = Infinity): number {
  return Math.min(
    columnWidth,
    vh * BOOK_TALL_SLOPE + BOOK_TALL_INTERCEPT_PX,
    (vh - BOOK_FIT_OFFSET_PX) * BOOK_FIT_SLOPE,
  );
}

/** Card height per width — BookModeCard's drawn-book aspect. */
export const BOOK_HEIGHT_RATIO = 0.542;

/* ----------------------------------------------------------- column lift -- */

/**
 * Vertical lift on both book columns. −50px is the approved tall-desktop
 * composition bias (books sit high, opening the pedestal below). On short
 * viewports the centred columns have no slack above them, so the same lift
 * shoved row one into the title; the lift eases to 0 across 1000 → ~929px
 * of height (0.7 px of ease per px of height) and stays 0 below that.
 */
export const BOOK_LIFT_TALL_PX = -50;
export const BOOK_LIFT_EASE = 0.7;

export const BOOK_STACK_LIFT_CSS = `clamp(${BOOK_LIFT_TALL_PX}px, calc((${REGIME_BOUNDARY_VH}px - 100dvh) * ${BOOK_LIFT_EASE} + ${BOOK_LIFT_TALL_PX}px), 0px)`;

export function bookStackLiftPx(vh: number): number {
  const eased = (REGIME_BOUNDARY_VH - vh) * BOOK_LIFT_EASE + BOOK_LIFT_TALL_PX;
  return Math.min(0, Math.max(BOOK_LIFT_TALL_PX, eased));
}

/* ------------------------------------------------------------------ title -- */

/**
 * Academy title font size — the smallest of three constraints:
 *   width-fluid  clamp(1.35rem, 2.2vw + 0.6rem, 2.4rem)  (the original)
 *   height-fit   4.8vh − 0.6rem   (= 2.4rem exactly at h = 1000, so the cap
 *                simply keeps sliding down as the viewport gets shorter)
 *   HUD-safe     6vw − 34px       (the centred two-line title is ~16.7× its
 *                font size wide; this keeps its right edge clear of the
 *                ~271px right HUD cluster with ~8px to spare — it only binds
 *                below ~1180px width, e.g. 1024×768)
 * The width-fluid clamp's 1.35rem floor is applied LAST so no constraint can
 * drive the title unreadably small; below ~860px width the HUD term would
 * want less than the floor and the title may brush the cluster — accepted,
 * those are tablet-class widths outside the desktop matrix.
 */
export const TITLE_FONT_SIZE_CSS =
  "max(1.35rem, min(clamp(1.35rem, 2.2vw + 0.6rem, 2.4rem), calc(4.8vh - 0.6rem), calc(6vw - 34px)))";

export function titleFontSizePx(vw: number, vh: number): number {
  const rem = 16;
  const widthFluid = Math.min(2.4 * rem, Math.max(1.35 * rem, 0.022 * vw + 0.6 * rem));
  const heightFit = 0.048 * vh - 0.6 * rem;
  const hudSafe = 0.06 * vw - 34;
  return Math.max(1.35 * rem, Math.min(widthFluid, heightFit, hudSafe));
}

/* ------------------------------------------------------------ centerpiece -- */

/**
 * Broadcast centerpiece (tome + radio dock) width. The width term tracks the
 * free central zone the book grid leaves (original behaviour); the height
 * term (100dvh − 321px) × 0.56 reaches the 380px cap at h ≈ 1000 and
 * compresses the tome on short viewports so the dock stops crowding Mogzy
 * (the assembly's height ≈ 0.723 × width + 96px of dock+gap). The height
 * term never asks for less than 250px — below that the Patch Brief content
 * spills past the painted frame — while the outer 200px floor remains what
 * it always was: the last-resort minimum for the genuinely narrow ~1024px
 * lane, where the WIDTH term is the one that bottoms out.
 */
export const CENTERPIECE_WIDTH_CSS =
  "clamp(200px, min(100vw - 1030px, max(250px, (100dvh - 321px) * 0.56)), 380px)";

export function centerpieceWidthPx(vw: number, vh: number): number {
  const heightTerm = Math.max(250, (vh - 321) * 0.56);
  return Math.min(380, Math.max(200, Math.min(vw - 1030, heightTerm)));
}

/** Assembly height per width (measured: surface 0.723 × w, dock+gap 96px). */
export function centerpieceHeightPx(width: number): number {
  return 0.723 * width + 96;
}
