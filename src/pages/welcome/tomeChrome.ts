import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// The room the controls around the tome take, as a reservation.
//
// WHY THIS MODULE EXISTS — the tome used to MOVE.
//
// The scene is a centred flex column: the tome, then the forward control, then
// the rail. Both control blocks participated in that column's flow while being
// CONDITIONALLY MOUNTED — the forward control is dropped on the two pages that
// own their own forward action (the register's submit, the finale's two exits),
// and the rail's Back and Skip come and go as well. A centred column whose
// height changes re-centres, so the tome slid down the screen by ~29px the
// instant the register's form appeared, and slid back up when the next chapter
// turned. Same size, different place, twice a visit: exactly the "the book
// keeps moving" the polish pass was opened for.
//
// The fix is not a transform and not an overlay. The control rows now RESERVE
// their height whether or not anything is inside them, so the column's height
// is a constant of the viewport rather than a function of which page is open.
// Every number the reservation needs lives here, and `budget` — what the tome
// subtracts from the viewport before sizing itself — lives here beside them so
// the two can be held in agreement by a test rather than by a comment.
//
// THE NUMBERS ARE MEASURED, and deliberately generous. At 1440x900 the forward
// control renders 34px tall over a 20px gap, and the rail 33px over a 16px gap;
// the reservations below are those, rounded up. `budget` is UNCHANGED from what
// the tome was already sizing against (HI1-C), because the point of this pass
// is that the book stops moving — not that it changes size.
// ---------------------------------------------------------------------------

export interface TomeChromeSpec {
  /** Reserved height of the forward-control row, its gap included. px. */
  controls: number;
  /** Reserved height of the rail — Back, the ribbon, the exit. px. */
  rail: number;
  /**
   * What the tome takes off the viewport height before sizing itself.
   *
   * Must be at least `controls + rail + the scene's own vertical padding`, or
   * the book sizes itself into room the controls are already standing in. It is
   * larger than that sum on purpose: the surplus is the breathing space between
   * the book and the controls under it.
   */
  budget: number;
}

/**
 * Three chrome sizes, chosen by viewport shape rather than by breakpoint.
 *
 * `compact` is the landscape phone — wide, and about 360px tall, where every
 * pixel the controls take is a pixel of book.
 *
 * `snug` is EVERY SHORT VIEWPORT (WE1), portrait phone and short laptop alike.
 * `regular`'s 208px is a generous reservation, and generous is the right call
 * on a 900px screen: it is 23% of the height. On a 568px phone the same number
 * is 37%, and it left the book 360px to write a register into — which it could
 * not, so the sheet grew past its budget, the rail went under the fold and the
 * page scrolled. The same arithmetic runs the other way on a 1024x580 laptop
 * window: 208px of chrome sized the painted spread down to 514px wide, which is
 * under the ~590px at which the register's page box stops being able to hold
 * the register (measured — see the WE1 notes in index.css).
 *
 * The reservations here are still MEASURED and still honest: the forward
 * control renders 34px tall and the rail 33px, so 44 and 40 keep a real gap
 * around both. What is given up is only the surplus, and only where there was
 * never room for it.
 */
export const TOME_CHROME: Record<"regular" | "snug" | "compact", TomeChromeSpec> = {
  regular: { controls: 56, rail: 48, budget: 208 },
  snug: { controls: 44, rail: 40, budget: 128 },
  compact: { controls: 40, rail: 36, budget: 132 },
};

/** The scene's own vertical padding (top and bottom together), per chrome. */
export const SCENE_PADDING: Record<"regular" | "snug" | "compact", number> = {
  regular: 56,
  snug: 28,
  compact: 24,
};

export type TomeChromeKey = keyof typeof TOME_CHROME;

/**
 * The viewport height at or below which the chrome goes `snug`.
 *
 * 700 and not 768: a 1366x768 laptop is the reference short DESKTOP and must
 * keep the composition it ships with today, and every viewport in the
 * acceptance set that already fits — 768x1024, 1024x768, 1366x768, 1440x900,
 * 1920x1080 — is above this line. Everything below it is a viewport that was
 * measured failing.
 */
export const SNUG_MAX_HEIGHT = 700;

/**
 * Which chrome a viewport reads, as a pure function of its shape.
 *
 * Exported and pure so the invariant test can walk real viewport sizes rather
 * than trust a comment. The landscape phone keeps its own `compact` spec: it is
 * shorter still than `snug` and has a different composition behind it.
 */
export function chromeKeyFor(
  tier: "phone" | "phone-landscape" | "tablet" | "desktop",
  viewportHeight: number,
): TomeChromeKey {
  if (tier === "phone-landscape") return "compact";
  return viewportHeight <= SNUG_MAX_HEIGHT ? "snug" : "regular";
}

/* -------------------------------------------------------------------------- */

/**
 * The chrome this viewport reads, kept current as the window changes shape.
 *
 * A media query rather than a resize listener on purpose: `snug` is one
 * threshold, so the browser can tell us when we cross it instead of us
 * re-measuring on every resize frame. `useViewportTier` already owns the WIDTH
 * side of the question and is shared with the entrance, so it is left alone;
 * this is only the height half, and it lives beside the numbers it chooses
 * between.
 */
export function useTomeChrome(tier: "phone" | "phone-landscape" | "tablet" | "desktop"): {
  key: TomeChromeKey;
  spec: TomeChromeSpec;
  scenePadding: number;
} {
  const query = `(max-height: ${SNUG_MAX_HEIGHT}px)`;
  const [short, setShort] = useState(() =>
    typeof window === "undefined" || !window.matchMedia
      ? false
      : window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setShort(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  const key = chromeKeyFor(tier, short ? SNUG_MAX_HEIGHT : SNUG_MAX_HEIGHT + 1);
  return { key, spec: TOME_CHROME[key], scenePadding: SCENE_PADDING[key] };
}
