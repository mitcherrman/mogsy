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
/* Direct manipulation: drag-to-spin with inertia and a soft snap.      */
/* ------------------------------------------------------------------ */

/** Fastest a fling may leave the orbit (rad/s) — about a quarter turn a second. */
export const MAX_FLING = 1.7;
/** A release slower than this is just a nudge: no inertia, no snap. */
export const FLING_MIN = 0.12;
/** Inertia decay time constant (s), and the speed below which the orbit snaps. */
export const TAU_INERTIA = 0.85;
export const SNAP_ENTER = 0.32;
/** Time constant of the snap spring (s) and the pause on the snapped composition (s). */
export const TAU_SNAP = 0.3;
export const DWELL_S = 1.8;
/** The books' composition is symmetric (none behind the dial) every quarter turn from REST_THETA. */
export const SNAP_STEP = Math.PI / 2;

/**
 * The nearest resting phase ahead of `theta` in the direction of travel
 * (`dir` = +1 / -1); when one is already within a hair, that one.
 */
export function snapTarget(theta: number, dir: number): number {
  const k = (theta - REST_THETA) / SNAP_STEP;
  const nearest = Math.round(k);
  if (Math.abs(k - nearest) * SNAP_STEP < 0.1) return REST_THETA + nearest * SNAP_STEP;
  return REST_THETA + (dir >= 0 ? Math.ceil(k) : Math.floor(k)) * SNAP_STEP;
}

/* ------------------------------------------------------------------ */
/* The arrow selector: rotate the whole orbit one book at a time.       */
/* ------------------------------------------------------------------ */

/** The foreground position on the orbit: front and centre, below the crystal. */
export const FRONT_ANGLE = Math.PI / 2;
/** A book closer to the front than this is already "there": the arrow takes the next one. */
export const MIN_STEER = 0.35;
/** Emphasis growth for a book the selector holds at the front (smaller than hover: it sits under the crystal). */
export const SELECTED_EMPHASIS_SCALE = 0.04;

const posMod = (v: number, m: number) => ((v % m) + m) % m;

/**
 * The next book to arrive at the front if the orbit turns in direction `dir`
 * (+1: theta increases — the near side of the orbit moves left, so the book on
 * the RIGHT comes forward; -1: the reverse), and the phase that puts it there.
 * A book already within MIN_STEER of the front is skipped, so an arrow press
 * always produces a visible turn.
 */
export function nextArrival(theta: number, dir: 1 | -1, count = BOOK_ORDER.length): { index: number; target: number } {
  let best = { index: 0, d: Infinity };
  for (let i = 0; i < count; i++) {
    const a = bookAngle(i, theta, count);
    let d = dir > 0 ? posMod(FRONT_ANGLE - a, TAU) : posMod(a - FRONT_ANGLE, TAU);
    if (d < MIN_STEER) d += TAU;
    if (d < best.d) best = { index: i, d };
  }
  return { index: best.index, target: theta + dir * best.d };
}

/** Seconds for a selector turn of `delta` radians: ~1.2 s a quarter turn, longer for more. */
export function steerDuration(delta: number): number {
  const quarters = Math.abs(delta) / (Math.PI / 2);
  return Math.min(2.2, Math.max(0.7, 0.75 + 0.45 * quarters));
}

/**
 * Cubic Hermite from (p0, slope m0) to (p1, slope 0) at s in [0, 1]: value and
 * d/ds. Starting from the orbit's current velocity keeps the hand-over smooth
 * (no jump in position or speed); ending at zero slope is the deceleration.
 */
export function hermite(p0: number, p1: number, m0: number, s: number): { v: number; d: number } {
  const s2 = s * s;
  const s3 = s2 * s;
  const v = (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1;
  const d = (6 * s2 - 6 * s) * p0 + (3 * s2 - 4 * s + 1) * m0 + (-6 * s2 + 6 * s) * p1;
  return { v, d };
}

export type SpinPhase = "free" | "grabbed" | "inertia" | "snapping" | "dwell" | "steering" | "held";

/**
 * The orbit's phase and angular velocity, as a small state machine (no DOM, no
 * clock): `free` idles at ORBIT_OMEGA × calm; `grabbed` follows the pointer;
 * a fast release becomes `inertia` (exponential decay), which `snapping`
 * settles onto the nearest symmetric composition, where it `dwell`s briefly
 * before the slow orbit resumes. A slow release, or any focused book (calm < 1),
 * skips inertia and snap: the orbit just eases back to its calm speed.
 *
 * The arrow selector adds `steering` (one planned turn that brings a chosen book
 * to the front, taking over from whatever the orbit was doing) and `held` (the
 * orbit stays still with that book in front until something intentional
 * releases it: a grab, or `releaseHold`). There is exactly one controller: a
 * new arrow press re-plans the same turn from the current position and speed.
 */
export class SpinModel {
  theta = REST_THETA;
  omega: number;
  phase: SpinPhase = "free";
  /** Smoothed pointer angular velocity while grabbed (rad/s). */
  velocity = 0;
  /** Index (BOOK_ORDER) of the book the selector is bringing / holding at the front; -1 when none. */
  selected = -1;
  private dwell = 0;
  private snapTo = 0;
  private steerFrom = 0;
  private steerTo = 0;
  private steerM0 = 0;
  private steerT = 1;
  private steerT0 = 0;

  constructor(omega = ORBIT_OMEGA) {
    this.omega = omega;
  }

  grab(): void {
    this.phase = "grabbed";
    this.omega = 0;
    this.velocity = 0;
    this.selected = -1;
  }

  /**
   * One arrow press: advance the selection one book in direction `dir` and plan
   * the turn that brings it to the front. Repeated presses accumulate exactly
   * one quarter turn each on top of the current target. Without animation the
   * orbit is placed at once. Returns the selected book's index.
   */
  steer(dir: 1 | -1, animate = true, count = BOOK_ORDER.length): number {
    if (this.phase === "grabbed") return this.selected;
    let target: number;
    if ((this.phase === "steering" || this.phase === "held") && this.selected >= 0) {
      target = this.steerTo + (dir * TAU) / count;
      this.selected = posMod(this.selected - dir, count);
    } else {
      const next = nextArrival(this.theta, dir, count);
      target = next.target;
      this.selected = next.index;
    }
    this.steerTo = target;
    if (!animate) {
      this.theta = target;
      this.omega = 0;
      this.phase = "held";
      return this.selected;
    }
    const delta = target - this.theta;
    const T = steerDuration(delta);
    // Start from the current angular velocity, bounded so the turn can never
    // overshoot its target (m0/delta <= 3) nor swing far the wrong way first.
    const sign = delta >= 0 ? 1 : -1;
    const a = Math.abs(delta);
    const m0 = sign * Math.max(-a, Math.min(3 * a, sign * this.omega * T));
    this.steerFrom = this.theta;
    this.steerM0 = m0;
    this.steerT = T;
    this.steerT0 = 0;
    this.phase = "steering";
    return this.selected;
  }

  /** Let go of a selector hold (or an unfinished turn): the slow orbit resumes from here. */
  releaseHold(): void {
    if (this.phase !== "steering" && this.phase !== "held") return;
    this.phase = "free";
    this.omega = 0;
    this.selected = -1;
  }

  /** Move the orbit by `dTheta` over `dt` seconds of pointer travel. */
  drag(dTheta: number, dt: number): void {
    if (this.phase !== "grabbed") return;
    this.theta += dTheta;
    const v = dt > 0 ? dTheta / dt : 0;
    this.velocity = lerp(this.velocity, v, 0.4);
  }

  release(): void {
    if (this.phase !== "grabbed") return;
    const v = Math.max(-MAX_FLING, Math.min(MAX_FLING, this.velocity));
    if (Math.abs(v) < FLING_MIN) {
      this.phase = "free";
      this.omega = v;
    } else {
      this.phase = "inertia";
      this.omega = v;
    }
  }

  step(dt: number, calm: number, animate = true): void {
    if (dt <= 0) return;
    const free = animate ? ORBIT_OMEGA * calm : 0;
    switch (this.phase) {
      case "grabbed":
      case "held":
        return;
      case "steering": {
        this.steerT0 += dt;
        const s = Math.min(1, this.steerT0 / this.steerT);
        const h = hermite(this.steerFrom, this.steerTo, this.steerM0, s);
        this.theta = h.v;
        this.omega = h.d / this.steerT;
        if (s >= 1) {
          this.theta = this.steerTo;
          this.omega = 0;
          this.phase = "held";
        }
        return;
      }
      case "inertia": {
        // a hovered book wants the orbit to settle quickly under the cursor
        this.omega *= Math.exp(-dt / (calm < 1 ? TAU_INERTIA * 0.3 : TAU_INERTIA));
        this.theta += this.omega * dt;
        if (Math.abs(this.omega) < SNAP_ENTER) {
          if (calm >= 1) {
            this.phase = "snapping";
            this.snapTo = snapTarget(this.theta, this.omega);
          } else {
            this.phase = "free";
          }
        }
        return;
      }
      case "snapping": {
        const before = this.theta;
        this.theta = approach(this.theta, this.snapTo, dt, TAU_SNAP);
        this.omega = (this.theta - before) / dt;
        if (Math.abs(this.snapTo - this.theta) < 0.004) {
          this.theta = this.snapTo;
          this.omega = 0;
          this.phase = "dwell";
          this.dwell = DWELL_S;
        }
        return;
      }
      case "dwell":
        this.dwell -= dt;
        if (this.dwell <= 0 || calm < 1) this.phase = "free";
        return;
      default:
        this.omega = approach(this.omega, free, dt, 0.6);
        this.theta += this.omega * dt;
    }
  }
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
