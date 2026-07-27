import type { ViewportTier } from "./useViewportTier";

/**
 * Every per-viewport dial for the Academy entrance, in one place.
 *
 * The screen is one close-up façade: the visitor is standing in front of the
 * Academy's main door, close enough that the building runs off all four edges.
 * Only the central entrance bay is on screen — roofline near the top, the title
 * carved into the wall beneath it, the door cut into the wall beneath that.
 *
 * That means the masonry cannot be an independent background: the parapet has
 * to land above the title and the door has to land around the mascot, and both
 * of those are positions flexbox decides at runtime. MogzyEntryV2 measures the
 * title and the mascot and hands the façade the two anchors; everything else
 * about the building is derived from the numbers below. Retune the composition
 * here, not in the render.
 */

/* -------------------------------------------------------------------------- */
/* How much building is visible at all                                         */
/* -------------------------------------------------------------------------- */

/**
 * The single dial on how present the Academy is, 0–1.
 *
 * The screen is mostly darkness with Mogzy lit in a doorway; the building is a
 * suggestion behind that, and it must never compete. Phones get the least of
 * it — at 390px wide a visible wall-and-door composition fills the frame and
 * turns the mascot into a detail of a picture of a building.
 *
 * If the structure ever reads as a drawn façade again, this is the number to
 * pull down, not the individual gradients.
 */
export const STRUCTURE_PRESENCE: Record<ViewportTier, number> = {
  desktop: 1,
  tablet: 0.8,
  phone: 0.45,
  "phone-landscape": 0.5,
};

/* -------------------------------------------------------------------------- */
/* Sky and roofline                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Clear sky between the parapet coping and the top of the title block.
 *
 * This is the whole reason the roofline reads as part of the same wall the
 * title is carved into: too much and the building splits into "castle" and
 * "sign", too little and the merlons crowd the ornament.
 */
export const PARAPET_ABOVE_TITLE: Record<ViewportTier, number> = {
  desktop: 40,
  tablet: 34,
  phone: 30,
  "phone-landscape": 24,
};

/**
 * Merlon height and module, in px. Real px, so they never scale to mush.
 *
 * Height is also what is left over for sky: the band above the plaque has to
 * hold sky, merlons, coping and a course of plain wall, and the merlons are the
 * only one of the four that can give any of it back.
 */
export const MERLON: Record<ViewportTier, { h: number; solid: number; gap: number }> = {
  desktop: { h: 20, solid: 96, gap: 46 },
  tablet: { h: 17, solid: 76, gap: 38 },
  phone: { h: 12, solid: 46, gap: 24 },
  "phone-landscape": { h: 11, solid: 60, gap: 30 },
};

/* -------------------------------------------------------------------------- */
/* Towers                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The corner towers run off the top of the frame — that crop is what sells
 * "you are standing at the foot of a much bigger building". The inner turrets
 * are the opposite: their crenellated tops stop just above the parapet so
 * there is some roof structure visible above the title.
 */
export interface TowerLayout {
  /**
   * Where the side wall's edge falls, in px from the frame edge. It is drawn
   * as a single fading hairline, not a tower body — the body version read as
   * two lit columns flanking the mascot and stole him.
   */
  cornerWidth: number;
}

export const TOWERS: Record<ViewportTier, TowerLayout> = {
  desktop: { cornerWidth: 210 },
  tablet: { cornerWidth: 130 },
  phone: { cornerWidth: 48 },
  "phone-landscape": { cornerWidth: 120 },
};

/* -------------------------------------------------------------------------- */
/* Doorway                                                                     */
/* -------------------------------------------------------------------------- */

/** The doorway board's proportions — see AcademyDoorway's viewBox. */
export const DOOR_BOARD = { width: 300, height: 460, threshold: 452 };
export const DOOR_ASPECT = DOOR_BOARD.height / DOOR_BOARD.width;

/**
 * Door width per tier, as a CSS-clamp-shaped triple.
 *
 * Numeric rather than a `clamp()` string because the parent has to know the
 * door's real height: the wall's base — where the building meets the ground the
 * visitor is standing on — is the door's own threshold, and if those two are
 * computed separately they drift apart and the door stops looking like it is
 * standing in the wall.
 *
 * Bounded above because the door's height follows its width while the
 * title/mascot/CTA column does not grow with the viewport — an unbounded door
 * pushes its arch through the title on a wide screen. Bounded below so it stays
 * a door and not a slot. It also has to stay clear of the inner turrets (see
 * TOWERS.turretInset), which is what keeps the wall between them reading as
 * wall.
 */
export interface DoorWidthSpec {
  min: number;
  vw: number;
  max: number;
}

export const DOOR_WIDTH: Record<ViewportTier, DoorWidthSpec> = {
  desktop: { min: 296, vw: 22, max: 360 },
  tablet: { min: 240, vw: 32, max: 300 },
  phone: { min: 176, vw: 56, max: 232 },
  "phone-landscape": { min: 148, vw: 18, max: 176 },
};

export function doorWidthFor(spec: DoorWidthSpec, viewportWidth: number): number {
  return Math.min(spec.max, Math.max(spec.min, (viewportWidth * spec.vw) / 100));
}

/**
 * Clear wall between the title plaque and the entry control, in px.
 *
 * This is the room the door's arch stands in. Too little and the arch
 * disappears behind the plaque, which reads as the sign being bolted onto the
 * doorway rather than mounted on the wall above it.
 *
 * The keystone is the door's topmost ink and sits ~23px down its board, so
 * keeping stone between the plaque and the arch means roughly
 * `PLAQUE_GAP > DOOR_RISE - 39 + (however much stone you want to see)`.
 * Raising DOOR_RISE without raising this pushes the arch behind the plaque.
 */
export const PLAQUE_GAP: Record<ViewportTier, number> = {
  desktop: 108,
  tablet: 92,
  phone: 62,
  "phone-landscape": 24,
};

/**
 * How far the door board's top edge sits above the mascot's top edge, in px.
 *
 * Anchored to the mascot's top by a fixed px distance rather than a share of
 * the door's own height: the door's height follows its (fluid) width, so a
 * percentage anchor drifts the arch up into the title as the viewport widens.
 *
 * The arch apex is ~9% down the board, so the crown lands roughly
 * `rise - 0.09 * doorHeight` above Mogzy's hat.
 */
export const DOOR_RISE: Record<ViewportTier, number> = {
  desktop: 118,
  tablet: 100,
  phone: 74,
  "phone-landscape": 58,
};

/* -------------------------------------------------------------------------- */
/* Atmosphere                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Pointer travel in px at depth 1. Deliberately tiny now that the façade is an
 * arm's length away — a wall this close should barely move.
 */
export const PARALLAX_RANGE: Record<ViewportTier, number> = {
  desktop: 7,
  tablet: 5,
  phone: 0,
  "phone-landscape": 0,
};

/** Only the sky drifts; the wall the visitor is standing at does not. */
export const SKY_PARALLAX_DEPTH = 1.4;
