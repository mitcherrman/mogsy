/**
 * Academy Core V3.5 — the orbit mathematics. These are the guarantees the
 * brief makes about the motion, stated as properties of the pure functions:
 * the books really travel, stay upright, change depth, never cover the
 * crystal, never leave the stage, and the phone composition has no collisions.
 */
import { describe, expect, it } from "vitest";
import {
  BOOK_BASE_W,
  BOOK_BASE_W_COMPOSED,
  BOOK_ORDER,
  COMPOSED_POSES,
  CORE_CENTER,
  CORE_CENTER_COMPOSED,
  DESKTOP_ORBIT,
  ORBIT_PERIOD_S,
  STAGE,
  STAGE_COMPOSED,
  Z_CORE,
  Z_FOCUS,
  angleDelta,
  approach,
  approachAngle,
  blendPose,
  bookAngle,
  frontPose,
  orbitPose,
  poseRect,
  smoothstep,
  stackingFor,
  tetherPath,
} from "./orrery-motion";

const TAU = Math.PI * 2;
/** Crystal lens radius at the desktop instrument width (92 / 460 of 470 units). */
const LENS_R = (92 / 460) * 470;
/** Outermost visible radius of the Core's rings (scale ring ticks and hexes). */
const CORE_VISUAL_R = 290;
/** The dial (bezel) radius in stage units. */
const BEZEL_R = (150 / 460) * 470;

const steps = Array.from({ length: 720 }, (_, i) => (i / 720) * TAU);

function overlapArea(a: ReturnType<typeof poseRect>, b: ReturnType<typeof poseRect>) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function circleHitsRect(c: { x: number; y: number }, r: number, rect: ReturnType<typeof poseRect>) {
  const nx = Math.max(rect.left, Math.min(c.x, rect.right));
  const ny = Math.max(rect.top, Math.min(c.y, rect.bottom));
  return Math.hypot(c.x - nx, c.y - ny) < r;
}

describe("orbit: the books genuinely travel", () => {
  it("one revolution takes ORBIT_PERIOD_S and covers the full width of the orbit", () => {
    expect(ORBIT_PERIOD_S).toBeGreaterThan(20);
    expect(ORBIT_PERIOD_S).toBeLessThan(90);
    const xs = steps.map((a) => orbitPose(a).x);
    expect(Math.min(...xs)).toBeCloseTo(DESKTOP_ORBIT.cx - DESKTOP_ORBIT.rx, 0);
    expect(Math.max(...xs)).toBeCloseTo(DESKTOP_ORBIT.cx + DESKTOP_ORBIT.rx, 0);
  });

  it("a book moves by hundreds of stage units within a quarter turn, in both axes and in depth", () => {
    const a = orbitPose(-0.3);
    const b = orbitPose(-0.3 + Math.PI / 2);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(150);
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(40);
    expect(Math.abs(a.scale - b.scale)).toBeGreaterThan(0.05);
    expect(Math.sign(a.depth)).not.toBe(Math.sign(b.depth));
  });

  it("is not a bob: x and depth both sweep their whole range", () => {
    const depths = steps.map((a) => orbitPose(a).depth);
    expect(Math.min(...depths)).toBeCloseTo(-1, 2);
    expect(Math.max(...depths)).toBeCloseTo(1, 2);
    const ys = steps.map((a) => orbitPose(a).y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2 * DESKTOP_ORBIT.ry, 0);
  });

  it("four books sit a quarter-turn apart", () => {
    const angles = BOOK_ORDER.map((_, i) => bookAngle(i, 0.7));
    for (let i = 0; i < 4; i++) expect(angleDelta(angles[i], angles[(i + 1) % 4])).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe("orbit: depth, stacking and orientation", () => {
  it("near books are larger than far books and pass in front of the Core", () => {
    const near = orbitPose(Math.PI / 2);
    const far = orbitPose(-Math.PI / 2);
    expect(near.scale).toBeCloseTo(DESKTOP_ORBIT.scaleFront, 3);
    expect(far.scale).toBeCloseTo(DESKTOP_ORBIT.scaleBack, 3);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(near.y).toBeGreaterThan(far.y);
    expect(stackingFor(near.depth, 0)).toBeGreaterThan(Z_CORE);
    expect(stackingFor(far.depth, 0)).toBeLessThan(Z_CORE);
    expect(stackingFor(far.depth, 1)).toBe(Z_FOCUS);
  });

  it("books never change stacking side while they overlap the Core's footprint", () => {
    // the switch happens at depth 0 (the left / right extremes), which must be clear of the Core
    const left = orbitPose(Math.PI);
    const right = orbitPose(0);
    for (const p of [left, right]) {
      const rect = poseRect(p);
      expect(circleHitsRect(CORE_CENTER, CORE_VISUAL_R, rect)).toBe(false);
    }
  });

  it("yaw is a few degrees toward the Core, never a roll: books stay upright", () => {
    for (const a of steps) {
      const p = orbitPose(a);
      expect(Math.abs(p.yaw)).toBeLessThanOrEqual(DESKTOP_ORBIT.yawDeg + 1e-9);
      // right-hand books turn left (negative yaw), left-hand books turn right
      if (p.x > DESKTOP_ORBIT.cx + 20) expect(p.yaw).toBeLessThan(0);
      if (p.x < DESKTOP_ORBIT.cx - 20) expect(p.yaw).toBeGreaterThan(0);
    }
    // the pose has no rotation-about-the-view-axis field at all
    expect(Object.keys(orbitPose(0)).sort()).toEqual(["depth", "scale", "x", "y", "yaw"]);
  });
});

describe("orbit: clickability", () => {
  const theta = (i: number) => (i / 720) * TAU;

  it("no two books ever overlap by more than a sliver of the smaller one", () => {
    let worst = 0;
    for (let s = 0; s < 720; s++) {
      const rects = BOOK_ORDER.map((_, i) => poseRect(orbitPose(bookAngle(i, theta(s)))));
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const o = overlapArea(rects[i], rects[j]);
          worst = Math.max(worst, o / Math.min(rects[i].w * rects[i].h, rects[j].w * rects[j].h));
        }
      }
    }
    expect(worst).toBeLessThan(0.1);
  });

  it("a near-side book never covers the crystal lens (the control stays reachable)", () => {
    for (let s = 0; s < 720; s++) {
      BOOK_ORDER.forEach((_, i) => {
        const p = orbitPose(bookAngle(i, theta(s)));
        if (p.depth <= 0) return; // far books pass BEHIND the Core
        expect(circleHitsRect(CORE_CENTER, LENS_R - 6, poseRect(p)), `step ${s} book ${i}`).toBe(false);
      });
    }
  });

  it("every book stays inside the stage with room for its levitation", () => {
    for (const a of steps) {
      const r = poseRect(orbitPose(a));
      expect(r.left).toBeGreaterThan(6);
      expect(r.right).toBeLessThan(STAGE.width - 6);
      expect(r.top).toBeGreaterThan(6);
      expect(r.bottom).toBeLessThan(STAGE.height - 6);
    }
  });

  it("the whole orbit clears the Mogzy corner and the front book never reaches the bubble", () => {
    // Mogzy's box in the desktop stage: x 836..954, y 488..678
    const mogzy = { left: 836, top: 488, right: 954, bottom: 678, w: 118, h: 190 };
    for (const a of steps) {
      const r = poseRect(orbitPose(a));
      expect(overlapArea(r, mogzy)).toBeLessThan(0.2 * r.w * r.h);
    }
  });
});

describe("focus composition", () => {
  it("a book brought forward rests beside the crystal, clear of the lens, inside the stage", () => {
    for (const side of [-1, 1] as const) {
      const p = frontPose(side);
      const r = poseRect({ ...p, scale: p.scale * 1.14 }); // emphasis growth on top
      expect(circleHitsRect(CORE_CENTER, LENS_R, r)).toBe(false);
      expect(r.left).toBeGreaterThan(0);
      expect(r.right).toBeLessThan(STAGE.width);
      expect(r.bottom).toBeLessThanOrEqual(STAGE.height + 24);
    }
  });

  it("blendPose is a smooth, monotone approach with exact endpoints", () => {
    const a = orbitPose(0.4);
    const b = frontPose(1);
    expect(blendPose(a, b, 0)).toEqual(a);
    expect(blendPose(a, b, 1)).toEqual(b);
    let prev = a.x;
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const x = blendPose(a, b, t).x;
      expect(Math.sign(x - prev)).toBe(Math.sign(b.x - a.x));
      prev = x;
    }
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
  });
});

describe("easing helpers", () => {
  it("approach is frame-rate independent", () => {
    // 60 steps of 1/60 s and 30 steps of 1/30 s land on the same value
    let a = 0;
    let b = 0;
    for (let i = 0; i < 60; i++) a = approach(a, 1, 1 / 60, 0.3);
    for (let i = 0; i < 30; i++) b = approach(b, 1, 1 / 30, 0.3);
    expect(a).toBeCloseTo(b, 6);
    expect(approach(0, 1, 0.5, 0)).toBe(1);
  });

  it("calm decay: an orbit eased toward 3.5% drifts less than a book-width while a book is hovered", () => {
    // omega eased from full speed to 3.5% with a 0.6 s time constant, for 3 s
    const w0 = TAU / ORBIT_PERIOD_S;
    let w = w0;
    let drift = 0;
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) {
      w = approach(w, w0 * 0.035, dt, 0.6);
      drift += w * dt * DESKTOP_ORBIT.rx; // worst case: at the orbit's widest point
    }
    expect(drift).toBeLessThan(70); // the decay itself (<= ~half a book width), then it holds still
    // once settled the per-second drift is negligible
    expect(w * DESKTOP_ORBIT.rx).toBeLessThan(2);
  });

  it("angleDelta and approachAngle take the short way round", () => {
    expect(angleDelta(0.1, TAU - 0.1)).toBeCloseTo(-0.2, 6);
    expect(angleDelta(TAU - 0.1, 0.1)).toBeCloseTo(0.2, 6);
    const next = approachAngle(3.0, -3.0, 0.1, 0.2);
    expect(Math.abs(angleDelta(next, -3.0))).toBeLessThan(Math.abs(angleDelta(3.0, -3.0)));
  });
});

describe("tethers", () => {
  it("starts on the Core's outer ring and ends on the book", () => {
    const d = tetherPath(CORE_CENTER, { x: 800, y: 300 }, 168, 0);
    const m = /^M([\d.-]+) ([\d.-]+) Q([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)$/.exec(d);
    expect(m).not.toBeNull();
    const [sx, sy, , , ex, ey] = m!.slice(1).map(Number);
    expect(Math.hypot(sx - CORE_CENTER.x, sy - CORE_CENTER.y)).toBeCloseTo(168, 0);
    expect(ex).toBe(800);
    expect(ey).toBe(300);
  });
});

describe("phone composition (no orbit)", () => {
  const rects = BOOK_ORDER.map((id) => poseRect(COMPOSED_POSES[id], BOOK_BASE_W_COMPOSED));
  const bezel = (75.7 + 4);

  it("places four distinct, non-overlapping books inside the stage", () => {
    for (let i = 0; i < 4; i++) {
      expect(rects[i].left).toBeGreaterThanOrEqual(0);
      expect(rects[i].right).toBeLessThanOrEqual(STAGE_COMPOSED.width);
      expect(rects[i].top).toBeGreaterThanOrEqual(0);
      expect(rects[i].bottom).toBeLessThanOrEqual(STAGE_COMPOSED.height);
      for (let j = i + 1; j < 4; j++) expect(overlapArea(rects[i], rects[j])).toBe(0);
    }
  });

  it("keeps the dial clear of every book, with a staggered (not gridded) arrangement", () => {
    for (const r of rects) expect(circleHitsRect(CORE_CENTER_COMPOSED, bezel, r)).toBe(false);
    expect(COMPOSED_POSES.leaguecraft.y).not.toBe(COMPOSED_POSES["pro-play"].y);
    expect(COMPOSED_POSES["combat-lab"].y).not.toBe(COMPOSED_POSES.archives.y);
  });

  it("every phone book is a comfortable touch target (>= 44 css px) down to 320 px wide", () => {
    const minScale = 320 / STAGE_COMPOSED.width;
    for (const r of rects) {
      expect(r.w * minScale).toBeGreaterThan(44);
      expect(r.h * minScale).toBeGreaterThan(44);
    }
  });

  it("desktop base size is the largest a book is ever drawn (crisp text)", () => {
    const biggest = Math.max(...steps.map((a) => orbitPose(a).scale)) * 1.14;
    expect(biggest * BOOK_BASE_W).toBeLessThanOrEqual(BOOK_BASE_W * 1.1);
    expect(frontPose(1).scale * 1.14).toBeLessThanOrEqual(1.15);
  });

  it("BEZEL_R is consistent with the lens", () => {
    expect(BEZEL_R).toBeGreaterThan(LENS_R);
  });
});
