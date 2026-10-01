import type {
  GuideLayout,
  GuidePlacement,
  GuidePlacements,
  GuideTarget,
} from "./types";

/** Capped px travel per distance word. Wide viewports get the full number. */
export const GUIDE_LEAN_PX = { near: 32, far: 96 } as const;

/** Travel never exceeds this share of the viewport, so narrow phones don't overshoot. */
const LEAN_VW_CAP = 18;

export const GUIDE_BUBBLE_VIEWPORT_MARGIN = 8;

/** Phone layout starts below this width (matches `use-mobile`). */
export const GUIDE_MOBILE_BREAKPOINT = 768;

export function resolvePlacement(
  placements: GuidePlacements,
  layout: GuideLayout,
): GuidePlacement {
  return layout === "mobile" ? (placements.mobile ?? placements.desktop) : placements.desktop;
}

/** CSS length expressions for the lean layer's `--guide-lean-x/y`. */
export function leanOffsetExpr(target: GuideTarget | undefined): { x: string; y: string } {
  if (!target) return { x: "0px", y: "0px" };
  const px = GUIDE_LEAN_PX[target.distance ?? "near"];
  switch (target.direction) {
    case "left":
      return { x: `max(${-px}px, -${LEAN_VW_CAP}vw)`, y: "0px" };
    case "right":
      return { x: `min(${px}px, ${LEAN_VW_CAP}vw)`, y: "0px" };
    case "up":
      return { x: "0px", y: `${-px}px` };
    case "down":
      return { x: "0px", y: `${px}px` };
  }
}

/** Which way Mogzy faces for a target. Vertical targets keep the rest facing. */
export function facingForTarget(
  target: GuideTarget | undefined,
  rest: "left" | "right" = "left",
): "left" | "right" {
  if (target?.direction === "left") return "left";
  if (target?.direction === "right") return "right";
  return rest;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Minimal translation that brings `rect` inside the viewport (minus margin).
 * A box larger than the available room is aligned to the leading edge.
 */
export function computeViewportShift(
  rect: Box,
  viewport: { width: number; height: number },
  margin: number = GUIDE_BUBBLE_VIEWPORT_MARGIN,
): { x: number; y: number } {
  const axis = (start: number, end: number, size: number) => {
    if (start < margin) return margin - start;
    if (end > size - margin) return Math.max(size - margin - end, margin - start);
    return 0;
  };
  return {
    x: axis(rect.left, rect.right, viewport.width),
    y: axis(rect.top, rect.bottom, viewport.height),
  };
}
