export type MobileRankedPanelDirection = "previous" | "next" | "none";

const SWIPE_THRESHOLD_PX = 48;
const SWIPE_AXIS_RATIO = 1.25;

/** Classifies an outer parchment gesture without claiming vertical scrolling. */
export function mobileRankedSwipeDirection(
  dx: number,
  dy: number,
): Exclude<MobileRankedPanelDirection, "none"> | null {
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return null;
  if (Math.abs(dx) <= Math.abs(dy) * SWIPE_AXIS_RATIO) return null;
  return dx > 0 ? "previous" : "next";
}
