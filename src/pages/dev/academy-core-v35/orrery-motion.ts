/**
 * Academy Core V3.5 — the orbital mathematics of the Living Hextech Orrery.
 *
 * PURE. No DOM, no React, no time source: everything here maps an angle (and a
 * few easing weights) to a pose in the stage's DESIGN UNITS, so the motion can
 * be unit-tested and the same functions drive the rAF engine, the reduced-
 * motion still, and the phone composition.
 *
 * DESIGN SPACE. The desktop stage is 960 × 700 units; the host measures its
 * pixel size and derives one scale `u` (px per unit = min(w/960, h/700)), so
 * the whole scene scales as a unit without any ancestor `transform: scale()`
 * (which would soften the books' text).
 *
 * THE ORBIT. Each book rides one circle in a horizontal plane viewed from
 * slightly above: x follows cos(angle), vertical screen position follows
 * sin(angle) (the near side is lower), and `depth` = sin(angle) drives scale
 * (near = larger), stacking (near books pass in front of the Core, far books
 * pass behind it) and a gentle yaw that turns each cover a few degrees toward
 * the Core. Books are never rotated about the view axis: they stay upright.
 */

export const STAGE = { width: 960, height: 700 } as const;
/** Phone composition stage (the books do not orbit there). */
export const STAGE_COMPOSED = { width: 360, height: 640 } as const;

/** The Core's centre in the desktop stage. */
export const CORE_CENTER = { x: 480, y: 296 } as const;
export const CORE_CENTER_COMPOSED = { x: 180, y: 322 } as const;

/** Books are 1 : 1.5 (CLOSED_BOOK_HEIGHT_RATIO). Base size = the largest a book is ever drawn. */
export const BOOK_RATIO = 1.5;
export const BOOK_BASE_W = 190;
export const BOOK_BASE_H = BOOK_BASE_W * BOOK_RATIO;
export const BOOK_BASE_W_COMPOSED = 150;

export const BOOK_ORDER = ["leaguecraft", "pro-play", "combat-lab", "archives"] as const;
export type BookId = (typeof BOOK_ORDER)[number];

export interface OrbitGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  scaleBack: number;
  scaleFront: number;
  /** Degrees of yaw at the left/right extremes (toward the Core). */
  yawDeg: number;
}

export const DESKTOP_ORBIT: OrbitGeometry = {
  cx: 480,
  cy: 362,
  rx: 372,
  ry: 162,
  scaleBack: 0.68,
  scaleFront: 0.92,
  yawDeg: 15,
};

/** Seconds for one full revolution at full speed. Slow enough to read, fast enough to see. */
export const ORBIT_PERIOD_S = 50;
export const ORBIT_OMEGA = (Math.PI * 2) / ORBIT_PERIOD_S;
/** The still / first-frame phase: the two prominent books (upper pair) in front. */
export const REST_THETA = Math.PI / 4;

/** How hard each interaction state calms the orbit (1 = full speed). */
export const CALM = { free: 1, pinned: 0.14, keyboard: 0.1, pointer: 0.035 } as const;

/** Emphasis growth for a focused book, and the supporting books' shrink. */
export const EMPHASIS_SCALE = 0.14;
export const SUPPORT_SCALE = 0.94;

export interface BookPose {
  /** Centre, in stage units. */
  x: number;
  y: number;
  scale: number;
  /** Degrees of yaw (rotateY). */
  yaw: number;
  /** -1 (far side) … +1 (near side). */
  depth: number;
}

const DEG = 180 / Math.PI;
const TAU = Math.PI * 2;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smoothstep = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** Book `index`'s angle on the orbit for a global phase `theta`. */
export function bookAngle(index: number, theta: number, count = BOOK_ORDER.length): number {
  return theta + (index * TAU) / count;
}

export function orbitPose(angle: number, g: OrbitGeometry = DESKTOP_ORBIT): BookPose {
  const depth = Math.sin(angle);
  const near = smoothstep((depth + 1) / 2);
  return {
    x: g.cx + g.rx * Math.cos(angle),
    y: g.cy + g.ry * depth,
    scale: lerp(g.scaleBack, g.scaleFront, near),
    yaw: -g.yawDeg * Math.cos(angle),
    depth,
  };
}

/**
 * Where a book comes to rest when it is brought toward the viewer (keyboard
 * focus, the crystal's pinned preview): in front of the Core, to the left or
 * right of the crystal so the projection stays in view.
 */
export function frontPose(side: -1 | 1, g: OrbitGeometry = DESKTOP_ORBIT): BookPose {
  return { x: g.cx + side * 262, y: g.cy + g.ry + 30, scale: 0.98, yaw: -side * 7, depth: 1 };
}

export function blendPose(a: BookPose, b: BookPose, t: number): BookPose {
  const w = smoothstep(t);
  return {
    x: lerp(a.x, b.x, w),
    y: lerp(a.y, b.y, w),
    scale: lerp(a.scale, b.scale, w),
    yaw: lerp(a.yaw, b.yaw, w),
    depth: lerp(a.depth, b.depth, w),
  };
}

/** Stacking order: far books behind the Core (z 20), near books in front of it. */
export const Z_CORE = 20;
export const Z_FOCUS = 60;
export function stackingFor(depth: number, emphasis: number): number {
  if (emphasis > 0.5) return Z_FOCUS;
  return depth < 0 ? 10 + Math.round((depth + 1) * 8) : 30 + Math.round(depth * 8);
}

/** Axis-aligned screen rectangle (stage units) of a book at a pose. */
export function poseRect(p: BookPose, baseW = BOOK_BASE_W) {
  const w = baseW * p.scale;
  const h = w * BOOK_RATIO;
  return { left: p.x - w / 2, top: p.y - h / 2, right: p.x + w / 2, bottom: p.y + h / 2, w, h };
}

/* ------------------------------------------------------------------ */
/* Phone composition: a deliberate floating arrangement, not an orbit.  */
/* ------------------------------------------------------------------ */

/** Upper pair high and staggered, lower pair low and staggered the other way. */
export const COMPOSED_POSES: Record<BookId, BookPose> = {
  leaguecraft: { x: 98, y: 106, scale: 0.92, yaw: 5, depth: 0.4 },
  "pro-play": { x: 262, y: 132, scale: 0.92, yaw: -5, depth: 0.4 },
  "combat-lab": { x: 98, y: 524, scale: 0.9, yaw: 5, depth: 0.4 },
  archives: { x: 262, y: 508, scale: 0.9, yaw: -5, depth: 0.4 },
};
/** Phone book width in stage units. */
export const COMPOSED_BOOK_W = 150;

/* ------------------------------------------------------------------ */
/* Easing helpers shared with the engine.                              */
/* ------------------------------------------------------------------ */

/** Frame-rate independent exponential approach: the share of the gap closed in `dt` with time constant `tau`. */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/** Shortest signed difference between two angles in radians. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function approachAngle(current: number, target: number, dt: number, tau: number): number {
  return current + angleDelta(current, target) * (1 - Math.exp(-dt / tau));
}

/** Degrees for the bearing needle toward a point from the Core. */
export function bearingDeg(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * DEG;
}

/**
 * A tether from the Core's outer ring to a book: a quadratic curve with a
 * gentle sway. Returns an SVG path `d`.
 */
export function tetherPath(
  core: { x: number; y: number },
  book: { x: number; y: number },
  startRadius: number,
  sway: number,
): string {
  const dx = book.x - core.x;
  const dy = book.y - core.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = core.x + ux * startRadius;
  const sy = core.y + uy * startRadius;
  const mx = (sx + book.x) / 2;
  const my = (sy + book.y) / 2;
  const bend = len * 0.1 + sway;
  const cx = mx - uy * bend;
  const cy = my + ux * bend;
  return `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${book.x.toFixed(1)} ${book.y.toFixed(1)}`;
}
