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
 * Two chrome sizes, chosen by viewport shape rather than by breakpoint.
 *
 * `compact` is the landscape phone — wide, and about 360px tall, where every
 * pixel the controls take is a pixel of book. Everything else reads `regular`.
 */
export const TOME_CHROME: Record<"regular" | "compact", TomeChromeSpec> = {
  regular: { controls: 56, rail: 48, budget: 208 },
  compact: { controls: 40, rail: 36, budget: 132 },
};

/** The scene's own vertical padding (top and bottom together), per chrome. */
export const SCENE_PADDING: Record<"regular" | "compact", number> = {
  regular: 56,
  compact: 24,
};
