/**
 * Shared HUD chrome vocabulary.
 *
 * The HUD has exactly two species of control and the difference is deliberate:
 *
 *  - BRANDED marks (the home hat, the Mogzy portrait) are the product's face.
 *    They pop — a real scale-up on hover and on keyboard focus — because they
 *    are the two places the HUD is allowed to have personality.
 *  - UTILITY controls (music, the notifications chevron, footer rows) stay
 *    put. A ground tint, a colour shift, at most a ~6% nudge on the glyph.
 *
 * Both live here so the two branded controls cannot drift apart, and so the
 * restraint on everything else is a stated rule rather than an accident.
 */

/** Dark Academy glass with a brass edge — the visible chip, minus any hit
 *  behaviour. `pointer-events-auto` belongs on the interactive wrapper, not on
 *  the decorative surface, so it is deliberately absent here. */
export const hudChipSurface =
  "rounded-full border border-[#c9a84c]/25 bg-[#0a1020]/70 shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-md";

/**
 * The branded pop, applied to a control's VISUAL group — never to the element
 * the flex row measures.
 *
 * Layout stability is structural, not a promise: the wrapper is a fixed-size
 * box that is never transformed, and everything here is `transform` on a child
 * inside it. A transform paints outside its box without reserving any, so the
 * mark can grow 35% while the row's geometry, the cluster's width, the panel's
 * anchor and the document's scroll width are all byte-identical.
 *
 * Scale is smaller below `sm`: the header band is 48px there rather than 56px,
 * and 1.35 on a 36px mark would push past the top of the viewport.
 *
 * Hover and focus-visible carry identical emphasis — a keyboard user gets the
 * same pop, plus the ring. `motion-reduce` drops the transition and keeps the
 * end state, so the affordance survives with no movement at all.
 */
export const hudPopVisual =
  "rounded-full transition-transform duration-200 ease-out will-change-transform " +
  "motion-reduce:transition-none " +
  "group-hover:scale-[1.25] group-focus-visible:scale-[1.25] group-active:scale-[1.1] " +
  "sm:group-hover:-translate-y-0.5 sm:group-hover:scale-[1.35] " +
  "sm:group-focus-visible:-translate-y-0.5 sm:group-focus-visible:scale-[1.35] " +
  "sm:group-active:translate-y-0 sm:group-active:scale-[1.18] " +
  "group-focus-visible:ring-2 group-focus-visible:ring-[#c9a84c]/80";

/** The 44px hit target every primary HUD control gets. Square by default; the
 *  chevron narrows it to 40 because a chevron in a 44-wide box reads as a gap. */
export const hudHitTarget =
  "group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none";
