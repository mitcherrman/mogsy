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
  DWELL_S,
  FLING_MIN,
  MAX_FLING,
  ORBIT_OMEGA,
  REST_THETA,
  SNAP_STEP,
  SpinModel,
  snapTarget,
  FRONT_ANGLE,
  MIN_STEER,
  SELECTED_EMPHASIS_SCALE,
  hermite,
  nextArrival,
  steerDuration,
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
/**
 * Crystal lens radius at the desktop instrument width, stage units: local r 118 x
 * V35_LENS_SCALE 0.96 on a 460-wide viewBox drawn 470 units wide (V3's 0.78 gave ~94).
 */
const LENS_R = ((118 * 0.96) / 460) * 470;
/** The projection art inside the lens (local clip r 46), stage units. */
const ART_R = ((46 * 0.96) / 460) * 470;
/** How far a near-side book may reach into the bottom of the (larger) lens: its lower rim only. */
const LENS_RIM_ALLOWANCE = 26;
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

  it("a near-side book reaches at most the lower rim of the (larger) lens, never its centre or projection art", () => {
    // the V3.5 lens is larger than the V3 one; a book passing front-centre (and the
    // selector's held book) overlaps only the bottom rim — the crystal stays clickable
    // above it and the projection art is never covered
    for (let s = 0; s < 720; s++) {
      BOOK_ORDER.forEach((_, i) => {
        const p = orbitPose(bookAngle(i, theta(s)));
        if (p.depth <= 0) return; // far books pass BEHIND the Core
        expect(circleHitsRect(CORE_CENTER, LENS_R - LENS_RIM_ALLOWANCE, poseRect(p)), `step ${s} book ${i}`).toBe(false);
        expect(circleHitsRect(CORE_CENTER, ART_R, poseRect(p)), `art: step ${s} book ${i}`).toBe(false);
      });
    }
    // the selector's held book: front-centre with its (small) selected emphasis
    const held = orbitPose(FRONT_ANGLE);
    const r = poseRect({ ...held, scale: held.scale * (1 + SELECTED_EMPHASIS_SCALE) });
    expect(circleHitsRect(CORE_CENTER, LENS_R - LENS_RIM_ALLOWANCE, r)).toBe(false);
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

describe("drag-to-spin: grab, inertia, snap, dwell", () => {
  const run = (m: SpinModel, seconds: number, calm = 1) => {
    for (let t = 0; t < seconds; t += 1 / 60) m.step(1 / 60, calm);
  };
  const offGrid = (theta: number) => {
    const k = (theta - REST_THETA) / SNAP_STEP;
    return Math.abs(k - Math.round(k)) * SNAP_STEP;
  };

  it("snap targets are the symmetric compositions, ahead of the direction of travel", () => {
    expect(snapTarget(REST_THETA, 1)).toBeCloseTo(REST_THETA, 9);
    expect(snapTarget(REST_THETA + 0.5, 1)).toBeCloseTo(REST_THETA + SNAP_STEP, 9);
    expect(snapTarget(REST_THETA + 0.5, -1)).toBeCloseTo(REST_THETA, 9);
    expect(snapTarget(REST_THETA + SNAP_STEP - 0.05, -1)).toBeCloseTo(REST_THETA + SNAP_STEP, 9); // already within a hair
  });

  it("while grabbed the pointer owns the orbit: nothing advances on its own", () => {
    const m = new SpinModel();
    m.grab();
    const t0 = m.theta;
    run(m, 1);
    expect(m.theta).toBe(t0);
    m.drag(0.4, 0.05);
    expect(m.theta).toBeCloseTo(t0 + 0.4, 9);
    expect(m.phase).toBe("grabbed");
  });

  it("a fast fling coasts, settles onto a resting composition, pauses, then resumes the slow orbit", () => {
    const m = new SpinModel();
    m.grab();
    for (let i = 0; i < 10; i++) m.drag(0.05, 1 / 60); // 3 rad/s of pointer travel
    m.release();
    expect(m.phase).toBe("inertia");
    expect(m.omega).toBeLessThanOrEqual(MAX_FLING + 1e-9);
    const t0 = m.theta;
    run(m, 0.5);
    expect(m.theta).toBeGreaterThan(t0 + 0.3); // it keeps moving after release
    const seen = new Set<string>([m.phase]);
    for (let t = 0; t < 8; t += 1 / 60) {
      m.step(1 / 60, 1);
      seen.add(m.phase);
      if (m.phase === "dwell") break;
    }
    expect(seen.has("snapping")).toBe(true);
    expect(m.phase).toBe("dwell");
    expect(offGrid(m.theta)).toBeLessThan(0.005);
    expect(m.omega).toBe(0);
    const held = m.theta;
    run(m, DWELL_S - 0.3);
    expect(m.theta).toBe(held); // still on the composition
    run(m, 0.6);
    expect(m.phase).toBe("free");
    run(m, 4);
    expect(m.omega).toBeCloseTo(ORBIT_OMEGA, 2); // the slow orbit is back
  });

  it("a fling the other way reverses, then the orbit returns to its own direction", () => {
    const m = new SpinModel();
    m.grab();
    for (let i = 0; i < 10; i++) m.drag(-0.05, 1 / 60);
    m.release();
    expect(m.omega).toBeLessThan(0);
    run(m, 12);
    expect(m.omega).toBeGreaterThan(0);
  });

  it("a slow release is a nudge: no inertia, no snap", () => {
    const m = new SpinModel();
    m.grab();
    for (let i = 0; i < 10; i++) m.drag((FLING_MIN / 60) * 0.5, 1 / 60);
    m.release();
    expect(m.phase).toBe("free");
    run(m, 3);
    expect(m.phase).toBe("free");
  });

  it("a focused book (calm < 1) cancels the snap", () => {
    const m = new SpinModel();
    m.grab();
    for (let i = 0; i < 10; i++) m.drag(0.05, 1 / 60);
    m.release();
    run(m, 4, 0.035);
    expect(m.phase).toBe("free");
    expect(m.omega).toBeLessThan(ORBIT_OMEGA * 0.3);
  });
});

describe("arrow selector: the orbit turns one book at a time and holds it at the front", () => {
  const step = (m: SpinModel, seconds: number, calm = 1) => {
    for (let t = 0; t < seconds; t += 1 / 60) m.step(1 / 60, calm);
  };
  /** Angle of book i, normalised to [0, 2pi). */
  const angleOf = (m: SpinModel, i: number) => (((bookAngle(i, m.theta) % TAU) + TAU) % TAU);
  const atFront = (m: SpinModel, i: number) => Math.abs(angleDelta(angleOf(m, i), FRONT_ANGLE)) < 1e-6;
  const settle = (m: SpinModel) => step(m, 3);

  it("the right arrow brings the book arriving from the right; the left arrow the one from the left", () => {
    // at rest the books sit at 45 / 135 / 225 / 315 degrees: Leaguecraft front-right, Pro Play front-left
    const r = nextArrival(REST_THETA, 1);
    expect(BOOK_ORDER[r.index]).toBe("leaguecraft");
    expect(r.target - REST_THETA).toBeCloseTo(Math.PI / 4, 9);
    const l = nextArrival(REST_THETA, -1);
    expect(BOOK_ORDER[l.index]).toBe("pro-play");
    expect(REST_THETA - l.target).toBeCloseTo(Math.PI / 4, 9);
  });

  it("from idle the first press is always a visible turn (a book already at the front is skipped)", () => {
    for (let k = 0; k < 360; k++) {
      const theta = (k / 360) * TAU;
      for (const dir of [1, -1] as const) {
        const d = Math.abs(nextArrival(theta, dir).target - theta);
        expect(d).toBeGreaterThanOrEqual(MIN_STEER - 1e-9);
        expect(d).toBeLessThanOrEqual(Math.PI / 2 + MIN_STEER + 1e-9);
      }
    }
  });

  it("one press turns the whole orbit (all four books together) and holds the chosen book exactly at the front", () => {
    const m = new SpinModel();
    const before = BOOK_ORDER.map((_, i) => angleOf(m, i));
    const i = m.steer(1);
    expect(m.phase).toBe("steering");
    step(m, 0.3);
    const mid = BOOK_ORDER.map((_, j) => angleOf(m, j));
    // every book moved by the same angle: the orbit turned as one
    const moved = mid.map((a, j) => angleDelta(before[j], a));
    for (const d of moved) expect(d).toBeCloseTo(moved[0], 9);
    expect(moved[0]).toBeGreaterThan(0);
    settle(m);
    expect(m.phase).toBe("held");
    expect(atFront(m, i)).toBe(true);
    const held = m.theta;
    step(m, 10); // the idle orbit does not carry it away
    expect(m.theta).toBe(held);
  });

  it("each press advances exactly one book, wraps after four, and the left arrow reverses", () => {
    const m = new SpinModel();
    const seen: string[] = [];
    for (let k = 0; k < 5; k++) { seen.push(BOOK_ORDER[m.steer(1)]); settle(m); }
    // right arrow from rest: Leaguecraft, then the book behind it on the right, ... and round again
    expect(seen).toEqual(["leaguecraft", "archives", "combat-lab", "pro-play", "leaguecraft"]);
    const back: string[] = [];
    for (let k = 0; k < 4; k++) { back.push(BOOK_ORDER[m.steer(-1)]); settle(m); }
    expect(back).toEqual(["pro-play", "combat-lab", "archives", "leaguecraft"]);
    expect(atFront(m, 0)).toBe(true);
  });

  it("all four books can be brought to the front", () => {
    const m = new SpinModel();
    const fronted = new Set<number>();
    for (let k = 0; k < 4; k++) { const i = m.steer(-1); settle(m); expect(atFront(m, i)).toBe(true); fronted.add(i); }
    expect(fronted.size).toBe(4);
  });

  it("rapid presses: N presses before the turn finishes = exactly N books, one smooth turn, no overshoot", () => {
    const m = new SpinModel();
    const start = m.theta;
    let i = -1;
    for (let k = 0; k < 3; k++) { i = m.steer(1); step(m, 0.08); }
    expect(BOOK_ORDER[i]).toBe("combat-lab"); // leaguecraft -> archives -> combat-lab
    let last = m.theta;
    let monotone = true;
    for (let t = 0; t < 4; t += 1 / 60) {
      m.step(1 / 60, 1);
      if (m.theta < last - 1e-9) monotone = false;
      last = m.theta;
    }
    expect(monotone).toBe(true);
    expect(m.phase).toBe("held");
    expect(atFront(m, i)).toBe(true);
    expect(m.theta - start).toBeCloseTo(Math.PI / 4 + Math.PI, 6); // 45 deg to the first book, then two quarters... plus one
    // right then left quickly cancel out: back to the same book
    const m2 = new SpinModel();
    const a = m2.steer(1);
    step(m2, 0.1);
    m2.steer(1);
    step(m2, 0.1);
    const b = m2.steer(-1);
    settle(m2);
    expect(b).toBe(a);
    expect(atFront(m2, a)).toBe(true);
  });

  it("takes over a fling smoothly (no jump in position or speed, no overshoot past the target)", () => {
    const m = new SpinModel();
    m.grab();
    for (let k = 0; k < 10; k++) m.drag(0.04, 1 / 60);
    m.release();
    step(m, 0.2);
    expect(m.phase).toBe("inertia");
    const theta0 = m.theta;
    const omega0 = m.omega;
    const i = m.steer(1);
    m.step(1 / 60, 1);
    // continuity: the first frame of the turn moves as the fling was moving
    expect(m.theta - theta0).toBeCloseTo(omega0 / 60, 2);
    let last = m.theta;
    for (let t = 0; t < 4; t += 1 / 60) {
      m.step(1 / 60, 1);
      expect(m.theta).toBeGreaterThanOrEqual(last - 1e-9); // never runs backwards past the target
      last = m.theta;
    }
    expect(atFront(m, i)).toBe(true);
  });

  it("interrupts a snap without a jump, and a fling the other way is turned round smoothly", () => {
    const m = new SpinModel();
    m.grab();
    for (let k = 0; k < 10; k++) m.drag(0.05, 1 / 60);
    m.release();
    while (m.phase !== "snapping") m.step(1 / 60, 1);
    const t0 = m.theta;
    const i = m.steer(-1);
    m.step(1 / 60, 1);
    expect(Math.abs(m.theta - t0)).toBeLessThan(0.05); // no jump
    settle(m);
    expect(atFront(m, i)).toBe(true);
  });

  it("is a single controller: grab releases it; releaseHold resumes the idle orbit", () => {
    const m = new SpinModel();
    m.steer(1);
    settle(m);
    m.grab();
    expect(m.phase).toBe("grabbed");
    expect(m.selected).toBe(-1);
    m.release();
    const n = new SpinModel();
    n.steer(1);
    settle(n);
    n.releaseHold();
    expect(n.phase).toBe("free");
    expect(n.selected).toBe(-1);
    const t = n.theta;
    step(n, 3);
    expect(n.theta).toBeGreaterThan(t); // the slow orbit is back
    // a press while grabbed changes nothing
    const g = new SpinModel();
    g.grab();
    const th = g.theta;
    g.steer(1);
    expect(g.phase).toBe("grabbed");
    expect(g.theta).toBe(th);
  });

  it("without animation (reduced motion) the selection is placed at once", () => {
    const m = new SpinModel(0);
    const i = m.steer(1, false);
    expect(m.phase).toBe("held");
    expect(atFront(m, i)).toBe(true);
  });

  it("timing and easing: a quarter turn takes ~1.2 s, accelerates and decelerates", () => {
    expect(steerDuration(Math.PI / 2)).toBeCloseTo(1.2, 2);
    expect(steerDuration(Math.PI)).toBeGreaterThan(steerDuration(Math.PI / 2));
    expect(steerDuration(10)).toBeLessThanOrEqual(2.2);
    const start = hermite(0, 1, 0, 0);
    const end = hermite(0, 1, 0, 1);
    const mid = hermite(0, 1, 0, 0.5);
    expect(start.v).toBe(0);
    expect(end.v).toBe(1);
    expect(start.d).toBe(0);
    expect(end.d).toBe(0);
    expect(mid.d).toBeGreaterThan(1);
  });
});

describe("hover-to-front: steerToBook brings that very book forward", () => {
  const TAU = Math.PI * 2;
  /** How far book i is from the front (radians, signed, shortest). */
  const offFront = (m: SpinModel, i: number) => angleDelta(bookAngle(i, m.theta), FRONT_ANGLE);
  const run = (m: SpinModel, seconds: number, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) m.step(dt, 1); };

  it("every book, from arbitrary orbit positions and speeds, ends exactly front-centre by the shorter way", () => {
    for (let k = 0; k < 40; k++) {
      for (let i = 0; i < BOOK_ORDER.length; i++) {
        const m = new SpinModel();
        m.theta = REST_THETA + k * 0.611; // 40 phases spread around the circle (not multiples of the book spacing)
        m.omega = [0, ORBIT_OMEGA, -0.4, 1.2][k % 4];
        const start = m.theta;
        const need = Math.abs(offFront(m, i));
        expect(m.steerToBook(i)).toBe(true);
        expect(m.phase).toBe("steering");
        expect(m.selected).toBe(i);
        run(m, 2.5);
        expect(m.phase, `book ${i} from ${start.toFixed(2)}`).toBe("held");
        expect(Math.abs(offFront(m, i))).toBeLessThan(1e-9);
        // the shorter way round (half a turn at most)
        expect(Math.abs(m.theta - start)).toBeLessThanOrEqual(Math.min(need, Math.PI) + 1e-9);
        // the whole orbit turned together: the books keep their spacing
        expect(angleDelta(bookAngle(i, m.theta), bookAngle((i + 1) % 4, m.theta))).toBeCloseTo(TAU / 4, 9);
      }
    }
  });

  it("from rest the turn is monotone with no overshoot, and then it holds still", () => {
    for (let i = 0; i < 4; i++) {
      const m = new SpinModel(0);
      m.omega = 0;
      const target = m.theta + angleDelta(bookAngle(i, m.theta), FRONT_ANGLE);
      m.steerToBook(i);
      const dir = Math.sign(target - m.theta) || 1;
      let prev = m.theta;
      for (let t = 0; t < 2.5; t += 1 / 60) {
        m.step(1 / 60, 1);
        expect((m.theta - prev) * dir).toBeGreaterThanOrEqual(-1e-12);
        expect((m.theta - target) * dir).toBeLessThanOrEqual(1e-9);
        prev = m.theta;
      }
      const held = m.theta;
      run(m, 10);
      expect(m.theta).toBe(held);
      expect(m.phase).toBe("held");
    }
  });

  it("the book directly behind turns the way the orbit is going", () => {
    const m = new SpinModel();
    m.theta = FRONT_ANGLE + Math.PI; // book 0 exactly at the back
    m.omega = ORBIT_OMEGA;
    m.steerToBook(0);
    run(m, 0.2);
    expect(m.theta).toBeGreaterThan(FRONT_ANGLE + Math.PI);
    const r = new SpinModel();
    r.theta = FRONT_ANGLE + Math.PI;
    r.omega = -0.2;
    r.steerToBook(0);
    run(r, 0.2);
    expect(r.theta).toBeLessThan(FRONT_ANGLE + Math.PI);
  });

  it("choosing the book already coming forward (or held) never re-plans: the same smooth turn", () => {
    const a = new SpinModel();
    const b = new SpinModel();
    a.steerToBook(2);
    b.steerToBook(2);
    for (let f = 0; f < 120; f++) {
      a.step(1 / 60, 1);
      b.step(1 / 60, 1);
      if (f % 7 === 0) expect(b.steerToBook(2)).toBe(true); // repeated hovers of the same book
      expect(b.theta).toBe(a.theta);
    }
  });

  it("switching books mid-turn is continuous (no jump in position) and lands on the new book", () => {
    const m = new SpinModel();
    m.steerToBook(1);
    run(m, 0.4);
    const at = m.theta;
    m.steerToBook(3);
    expect(m.theta).toBe(at);
    let prev = m.theta;
    for (let t = 0; t < 2.5; t += 1 / 60) {
      m.step(1 / 60, 1);
      expect(Math.abs(m.theta - prev)).toBeLessThan(0.08); // ≤ ~4.8 rad/s per frame step: no teleport
      prev = m.theta;
    }
    expect(m.selected).toBe(3);
    expect(Math.abs(offFront(m, 3))).toBeLessThan(1e-9);
  });

  it("is refused while the pointer holds the orbit; a grab drops it; reduced motion places it at once", () => {
    const g = new SpinModel();
    g.grab();
    expect(g.steerToBook(1)).toBe(false);
    expect(g.phase).toBe("grabbed");
    const m = new SpinModel();
    m.steerToBook(1);
    run(m, 0.3);
    m.grab();
    expect(m.selected).toBe(-1);
    const r = new SpinModel(0);
    r.steerToBook(3, false);
    expect(r.phase).toBe("held");
    expect(Math.abs(offFront(r, 3))).toBeLessThan(1e-9);
  });

  it("the arrows continue from a hover selection, one book per press", () => {
    const m = new SpinModel();
    m.steerToBook(2);
    run(m, 2.5);
    expect(m.steer(1)).toBe(1); // as from an arrow-held book: the next one round
    run(m, 2.5);
    expect(Math.abs(offFront(m, 1))).toBeLessThan(1e-9);
    expect(m.steer(-1)).toBe(2);
    m.releaseHold();
    expect(m.phase).toBe("free");
    expect(m.selected).toBe(-1);
  });
});
