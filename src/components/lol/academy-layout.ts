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
 * Broadcast centerpiece (tome + radio dock) width — HYBRID ADAPTIVE.
 *
 * The old width term was a hand-fitted line (100vw − 1030px) that had nothing
 * to do with the space the layout actually leaves: at 1280×720 it asked for
 * 250px while ~490px of central air was free, which is why the medium-desktop
 * tome looked under-scaled, packed its pages and crowded the ornament.
 *
 * The width term now MODELS the free central zone directly. The desktop grid
 * is [1fr | lane | 1fr] inside a padded container, each book column pushes its
 * card outward and is then translated back inward by DESKTOP_BOOK_STACK_INSET,
 * so the air between the two drawn book edges is:
 *
 *   inner − 2·bookWidth − 2·inset        (inner = 100vw − container padding
 *                                         − column gaps; the lane term cancels)
 *
 * with a 12px breathing gap per side subtracted, and a bounded overlap
 * allowance added back: the painted tome is allowed to sit up to
 * CENTERPIECE_OVERLAP_PX over each book's inner edge, which is exactly the
 * relationship the approved 1440–1920 composition already has. That single
 * expression keeps the wide composition (it saturates the 380px cap at every
 * viewport ≥ ~1280 wide) and lifts the awkward medium range toward it instead
 * of shrinking icons.
 *
 * The height term still guards short laptops — the assembly's height is
 * ≈ 0.723 × width + 96px of dock + gap — but it now reaches the cap at
 * ~800px of viewport height rather than ~1000px, so 1280×800 and 1366×768 get
 * a substantial tome while 720p still compresses. The 250px inner floor keeps
 * the Patch Brief inside the painted frame; the outer 200px floor remains the
 * last-resort minimum for genuinely narrow ~1024px lanes.
 */
export const CENTERPIECE_OVERLAP_PX = 48;
export const CENTERPIECE_BREATHING_PX = 12;
/** container padding (xl:px-6) + two md grid gaps. */
export const CENTERPIECE_CHROME_PX = 64;
export const CENTERPIECE_MIN_PX = 200;
export const CENTERPIECE_MAX_PX = 380;
export const CENTERPIECE_INNER_FLOOR_PX = 250;
export const CENTERPIECE_FIT_OFFSET_PX = 260;
export const CENTERPIECE_FIT_SLOPE = 0.72;

/** Net constant on the width term: overlap allowance − breathing − chrome. */
const CENTERPIECE_WIDTH_BIAS_PX =
  2 * CENTERPIECE_OVERLAP_PX - 2 * CENTERPIECE_BREATHING_PX - CENTERPIECE_CHROME_PX; // = 8

/** Same easing as LolHub's DESKTOP_BOOK_STACK_INSET (kept in sync by name). */
export const BOOK_STACK_INSET_CSS = "clamp(0px, (100vw - 1200px) * 0.5, 120px)";

export function bookStackInsetPx(vw: number): number {
  return Math.min(120, Math.max(0, (vw - 1200) * 0.5));
}

const BOOK_WIDTH_TERM_CSS = `min(100dvh * ${BOOK_TALL_SLOPE} + ${BOOK_TALL_INTERCEPT_PX}px, (100dvh - ${BOOK_FIT_OFFSET_PX}px) * ${BOOK_FIT_SLOPE})`;

export const CENTERPIECE_WIDTH_CSS = `clamp(${CENTERPIECE_MIN_PX}px, min(calc(100vw + ${CENTERPIECE_WIDTH_BIAS_PX}px - 2 * (${BOOK_WIDTH_TERM_CSS}) - 2 * (${BOOK_STACK_INSET_CSS})), max(${CENTERPIECE_INNER_FLOOR_PX}px, (100dvh - ${CENTERPIECE_FIT_OFFSET_PX}px) * ${CENTERPIECE_FIT_SLOPE})), ${CENTERPIECE_MAX_PX}px)`;

export function centerpieceWidthPx(vw: number, vh: number): number {
  const widthTerm =
    vw + CENTERPIECE_WIDTH_BIAS_PX - 2 * bookMaxWidthPx(vh) - 2 * bookStackInsetPx(vw);
  const heightTerm = Math.max(
    CENTERPIECE_INNER_FLOOR_PX,
    (vh - CENTERPIECE_FIT_OFFSET_PX) * CENTERPIECE_FIT_SLOPE,
  );
  return Math.min(
    CENTERPIECE_MAX_PX,
    Math.max(CENTERPIECE_MIN_PX, Math.min(widthTerm, heightTerm)),
  );
}

/** Assembly height per width — measured: surface 0.723 × w, dock + gap 96px. */
export function centerpieceHeightPx(width: number): number {
  return 0.723 * width + 96;
}

