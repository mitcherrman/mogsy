/**
 * Academy shelf — decorative wooden support behind a pair of hub volumes.
 *
 * PROTOTYPE (2026-09-03): LEFT COLUMN ONLY, on purpose. The right column
 * keeps its floating books so the owner can A/B the structural idea in the
 * real hub rather than against a mockup.
 *
 * The books read as four objects hanging in the painted library; this gives
 * the left pair something to stand on. It is coded geometry, not an art
 * asset: CSS gradients and shadows only — no wood texture file proved
 * necessary. Each board is a solid with a lit top plane, a front face and a
 * dark underside; grain runs along the length of every piece; and the contact
 * shadow lives on the board's top plane so it stays on the shelf when a
 * volume lifts on hover.
 *
 * There is no back panel. The first pass had one and it read as a flat dark
 * rectangle over the painted library rather than as a recess; the owner
 * preferred the open case, so the library shows between and behind the
 * volumes and the uprights and boards carry the structure alone.
 *
 * Layering (see the z-order in LolHub): the shelf paints BEHIND the books and
 * is `aria-hidden` + `pointer-events-none`, so it can never take a click, a
 * focus stop or an announcement away from a destination link.
 *
 * GEOMETRY. The shelf is an absolutely-positioned overlay on the SAME box as
 * the two books, so it needs no coordinates of its own: it mirrors the book
 * stack with two `flex-1` rows under the same gap, and each row hangs its
 * slab at its own bottom edge. Row heights therefore track the books exactly
 * at every viewport, with nothing to keep in sync by hand.
 *
 * All thicknesses are in `cqw` against that box — i.e. percentages of the
 * BOOK WIDTH — so the whole structure scales with the volumes through the
 * fold-driven sizing formula and never needs its own breakpoints.
 */
export default function AcademyHubShelf() {
  return (
    <div
      aria-hidden
      className="academy-hub-shelf pointer-events-none absolute inset-0 z-0 flex flex-col gap-y-[clamp(2px,0.8vh,12px)] [container-type:inline-size]"
    >
      {/* The two uprights. They flank the books and overhang the stack top
          and bottom, which is what makes the pair read as ONE piece of
          furniture instead of two separate ledges. */}
      <div className="academy-hub-shelf-post academy-hub-shelf-post--left" />
      <div className="academy-hub-shelf-post academy-hub-shelf-post--right" />

      {/* One row per book. `flex-1` under the same gap as the book column
          reproduces the book rows exactly; the slab hangs at each row's
          bottom edge, so every volume stands on a ledge. */}
      <div className="relative flex-1">
        <div className="academy-hub-shelf-slab" />
      </div>
      <div className="relative flex-1">
        <div className="academy-hub-shelf-slab academy-hub-shelf-slab--base" />
      </div>
    </div>
  );
}
