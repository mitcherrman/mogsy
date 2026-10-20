/**
 * Phone composition fitted to the screen's height.
 *
 * The composed (stacked) Orrery was authored for one 360 x 640 stage, scaled
 * only by width, so on shorter phones (360 x 640, 320 x 568) its lower tier
 * fell below the fold. The stage is now given the height the viewport can
 * actually spare (CSS, academy-core-phone-fit.css) and the composition is
 * rebalanced for that height, not merely shrunk:
 *
 *   fit 0  TALL     360 x 640  the approved arrangement, unchanged
 *   fit 1  COMPACT  360 x 520  tiers drawn in toward a slightly smaller Core,
 *                              books a little smaller, Mogzy tucked closer
 *
 * In between, every placement is interpolated, so any phone gets a
 * composition shaped to its own aspect. `fit` comes from the stage box alone
 * (pure), so the page (scene size, CSS geometry) and the engine (book poses,
 * tethers, needle) always agree.
 */
import {
  BOOK_ORDER,
  COMPOSED_POSES,
  CORE_CENTER_COMPOSED,
  STAGE_COMPOSED,
  type BookId,
  type BookPose,
} from "./orrery-motion";

export const COMPOSED_TALL_H = STAGE_COMPOSED.height; // 640
export const COMPOSED_COMPACT_H = 520;

/** The compact end: the same four places, drawn in around a Core at y 262. */
export const COMPOSED_POSES_COMPACT: Record<BookId, BookPose> = {
  leaguecraft: { x: 96, y: 99, scale: 0.86, yaw: 5, depth: 0.4 },
  "pro-play": { x: 264, y: 117, scale: 0.86, yaw: -5, depth: 0.4 },
  "combat-lab": { x: 96, y: 423, scale: 0.84, yaw: 5, depth: 0.4 },
  archives: { x: 264, y: 407, scale: 0.84, yaw: -5, depth: 0.4 },
};
export const CORE_CENTER_COMPOSED_COMPACT = { x: 180, y: 262 } as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 0 (tall) .. 1 (compact) from the stage box in pixels. The box's own aspect
 * says how many stage units of height a 360-unit-wide stage gets; rounded to
 * 1/100 so a resize does not re-render for sub-pixel changes.
 */
export function composedFit(boxWidth: number, boxHeight: number): number {
  if (!(boxWidth > 0) || !(boxHeight > 0)) return 0;
  const units = (STAGE_COMPOSED.width * boxHeight) / boxWidth;
  const t = (COMPOSED_TALL_H - units) / (COMPOSED_TALL_H - COMPOSED_COMPACT_H);
  return Math.round(Math.min(1, Math.max(0, t)) * 100) / 100;
}

export function composedStage(fit: number): { width: number; height: number } {
  return { width: STAGE_COMPOSED.width, height: lerp(COMPOSED_TALL_H, COMPOSED_COMPACT_H, fit) };
}

export function composedPose(id: BookId, fit: number): BookPose {
  if (fit <= 0) return COMPOSED_POSES[id];
  const a = COMPOSED_POSES[id];
  const b = COMPOSED_POSES_COMPACT[id];
  return {
    x: lerp(a.x, b.x, fit),
    y: lerp(a.y, b.y, fit),
    scale: lerp(a.scale, b.scale, fit),
    yaw: lerp(a.yaw, b.yaw, fit),
    depth: lerp(a.depth, b.depth, fit),
  };
}

export function composedCore(fit: number): { x: number; y: number } {
  return {
    x: lerp(CORE_CENTER_COMPOSED.x, CORE_CENTER_COMPOSED_COMPACT.x, fit),
    y: lerp(CORE_CENTER_COMPOSED.y, CORE_CENTER_COMPOSED_COMPACT.y, fit),
  };
}

/** Every book's pose at this fit (for tests and inspection). */
export function composedPoses(fit: number): Record<BookId, BookPose> {
  return Object.fromEntries(BOOK_ORDER.map((id) => [id, composedPose(id, fit)])) as Record<BookId, BookPose>;
}
