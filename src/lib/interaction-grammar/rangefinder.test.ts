import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertRangefinderContent, calibrationRings, clampBearing, fieldGeometry, formatUnits, lastVisibleStopIndex,
  lensShowing, maxBearingAt, nearestStopIndex, placementFromPointer, placementPoint, planRangefinderReveal,
  projectionProgress, pxToUnits, stageAt, stepStopForKey, unitsToPx, FAR_MARGIN_PX, ORIGIN_INSET_PX,
} from "./rangefinder";
import type { RangefinderField, RangefinderLens, RangefinderPublic } from "./types";

const near: RangefinderLens = { id: "field", label: "Field", maxUnits: 1500, ringEveryUnits: 100, labelEveryUnits: 500 };
const far: RangefinderLens = { id: "horizon", label: "Horizon", maxUnits: 6000, ringEveryUnits: 500, labelEveryUnits: 1000 };

function field(step = 25, min = 100, max = 6000): RangefinderField {
  const stops = [];
  for (let u = min; u <= max; u += step) stops.push({ token: `t${u}`, units: u });
  return { unitLabel: "units", stops, lenses: [near, far] };
}
const content = (f = field()): RangefinderPublic => ({
  prompt: "p", measureLabel: "m", subject: { label: "s" }, field: f,
});

describe("content assertions", () => {
  it("accepts the lab field", () => { expect(() => assertRangefinderContent(content())).not.toThrow(); });
  it("rejects duplicate tokens, descending stops and a lens that reaches nowhere", () => {
    const f = field();
    expect(() => assertRangefinderContent(content({ ...f, stops: [{ token: "a", units: 100 }, { token: "a", units: 125 }] })))
      .toThrow(/distinct/);
    expect(() => assertRangefinderContent(content({ ...f, stops: [{ token: "a", units: 200 }, { token: "b", units: 100 }] })))
      .toThrow(/ascend/);
    expect(() => assertRangefinderContent(content({ ...f, lenses: [{ ...near, maxUnits: 0 }] }))).toThrow(/reaches nowhere/);
    expect(() => assertRangefinderContent(content({ ...f, lenses: [near] }))).toThrow(/farthest stop/);
  });
});

describe("projection — the one linear map", () => {
  const landscape = fieldGeometry({ width: 668, height: 420, orientation: "landscape" });
  const portrait = fieldGeometry({ width: 320, height: 500, orientation: "portrait" });

  it("puts the origin inset from its edge and spends the rest as reach", () => {
    expect(landscape.origin).toEqual({ x: ORIGIN_INSET_PX, y: 210 });
    expect(landscape.reachPx).toBe(668 - ORIGIN_INSET_PX - FAR_MARGIN_PX);
    expect(portrait.origin).toEqual({ x: 160, y: 500 - ORIGIN_INSET_PX });
    expect(portrait.reachPx).toBe(500 - ORIGIN_INSET_PX - FAR_MARGIN_PX);
  });
  it("is zero at the origin, the full reach at the lens' max, and linear between", () => {
    for (const geom of [landscape, portrait]) for (const lens of [near, far]) {
      expect(unitsToPx(0, lens, geom)).toBe(0);
      expect(unitsToPx(lens.maxUnits, lens, geom)).toBeCloseTo(geom.reachPx, 9);
      expect(unitsToPx(750, lens, geom) / unitsToPx(250, lens, geom)).toBeCloseTo(3, 9);
      expect(unitsToPx(lens.maxUnits / 2, lens, geom)).toBeCloseTo(geom.reachPx / 2, 9);
    }
  });
  it("round-trips px ↔ units", () => {
    for (const u of [100, 550, 1200, 1500]) expect(pxToUnits(unitsToPx(u, near, landscape), near, landscape)).toBeCloseTo(u, 9);
  });
  it("keeps relative geometry across lenses: 1000 is always twice 500", () => {
    expect(unitsToPx(1000, far, landscape) / unitsToPx(500, far, landscape)).toBeCloseTo(2, 9);
    expect(unitsToPx(1000, near, landscape) / unitsToPx(500, near, landscape)).toBeCloseTo(2, 9);
  });
});

describe("placement from a pointer", () => {
  const geom = fieldGeometry({ width: 668, height: 420, orientation: "landscape" });
  const f = field();
  it("reads the distance from the origin, whatever the bearing", () => {
    const r = unitsToPx(600, near, geom);
    const onAxis = placementFromPointer(geom.origin.x + r, geom.origin.y, near, geom, f);
    const above = placementFromPointer(geom.origin.x + r * Math.cos(0.3), geom.origin.y - r * Math.sin(0.3), near, geom, f);
    expect(onAxis.units).toBeCloseTo(600, 6);
    expect(above.units).toBeCloseTo(600, 6);
    expect(above.bearing).toBeCloseTo(-0.3, 6);
  });
  it("clamps to the stops' span and the lens' reach", () => {
    expect(placementFromPointer(geom.origin.x + 1, geom.origin.y, near, geom, f).units).toBe(100);
    expect(placementFromPointer(geom.origin.x + 5000, geom.origin.y, near, geom, f).units).toBe(1500);
    expect(placementFromPointer(geom.origin.x - 50, geom.origin.y, near, geom, f).units).toBe(100);
  });
  it("keeps the target inside the field's breadth at every radius", () => {
    const r = unitsToPx(1400, near, geom);
    const p = placementFromPointer(geom.origin.x + 10, geom.origin.y - 400, near, geom, f);
    const pt = placementPoint(p, near, geom);
    expect(pt.y).toBeGreaterThanOrEqual(0);
    expect(Math.abs(p.bearing)).toBeLessThanOrEqual(maxBearingAt(unitsToPx(p.units, near, geom), geom) + 1e-9);
    expect(clampBearing(2, r, geom)).toBeLessThan(Math.PI / 2);
  });
  it("draws a portrait placement upward from a bottom origin", () => {
    const pg = fieldGeometry({ width: 320, height: 500, orientation: "portrait" });
    const pt = placementPoint({ units: 750, bearing: 0 }, near, pg);
    expect(pt.x).toBeCloseTo(pg.origin.x, 9);
    expect(pt.y).toBeCloseTo(pg.origin.y - pg.reachPx / 2, 9);
  });
});

describe("stops", () => {
  const f = field();
  it("snaps to the nearest stop, lower on a tie", () => {
    expect(f.stops[nearestStopIndex(1003, f.stops)].units).toBe(1000);
    expect(f.stops[nearestStopIndex(1013, f.stops)].units).toBe(1025);
    expect(f.stops[nearestStopIndex(1012.5, f.stops)].units).toBe(1000);
    expect(f.stops[nearestStopIndex(0, f.stops)].units).toBe(100);
    expect(f.stops[nearestStopIndex(99999, f.stops)].units).toBe(6000);
  });
  it("knows the last stop a lens shows, and which lens shows a distance", () => {
    expect(f.stops[lastVisibleStopIndex(near, f.stops)].units).toBe(1500);
    expect(f.stops[lastVisibleStopIndex(far, f.stops)].units).toBe(6000);
    expect(lensShowing(550, [near, far]).id).toBe("field");
    expect(lensShowing(3500, [near, far]).id).toBe("horizon");
    expect(lensShowing(99999, [near, far]).id).toBe("horizon");
  });
});

describe("keyboard", () => {
  const last = 56; // 100..1500 on the near lens
  it("steps one stop with arrows, coarse with Shift and Page keys, and jumps with Home / End", () => {
    expect(stepStopForKey("ArrowRight", false, 10, last, 4)).toBe(11);
    expect(stepStopForKey("ArrowUp", false, 10, last, 4)).toBe(11);
    expect(stepStopForKey("ArrowLeft", false, 10, last, 4)).toBe(9);
    expect(stepStopForKey("ArrowDown", false, 10, last, 4)).toBe(9);
    expect(stepStopForKey("ArrowRight", true, 10, last, 4)).toBe(14);
    expect(stepStopForKey("PageUp", false, 10, last, 4)).toBe(14);
    expect(stepStopForKey("PageDown", false, 10, last, 4)).toBe(6);
    expect(stepStopForKey("Home", false, 10, last, 4)).toBe(0);
    expect(stepStopForKey("End", false, 10, last, 4)).toBe(last);
  });
  it("clamps at the ends, starts from an unplaced target at the first stop, and ignores other keys", () => {
    expect(stepStopForKey("ArrowLeft", false, 0, last, 4)).toBe(0);
    expect(stepStopForKey("ArrowRight", true, last - 1, last, 4)).toBe(last);
    expect(stepStopForKey("ArrowRight", false, -1, last, 4)).toBe(0);
    expect(stepStopForKey("a", false, 3, last, 4)).toBeNull();
    expect(stepStopForKey("Enter", false, 3, last, 4)).toBeNull();
  });
});

describe("calibration", () => {
  it("engraves a ring every ringEveryUnits and a figure on every labelEveryUnits", () => {
    const rings = calibrationRings(near);
    expect(rings).toHaveLength(15);
    expect(rings.filter((r) => r.labelled).map((r) => r.units)).toEqual([500, 1000, 1500]);
    expect(calibrationRings(far).filter((r) => r.labelled).map((r) => r.units)).toEqual([1000, 2000, 3000, 4000, 5000, 6000]);
  });
  it("is identical for every round: nothing in it depends on an answer", () => {
    expect(calibrationRings(near)).toEqual(calibrationRings({ ...near }));
  });
});

describe("reveal clock", () => {
  it("is a bounded choreography that sums to the budget", () => {
    const plan = planRangefinderReveal({ reduced: false });
    expect(plan.instant).toBe(false);
    expect(plan.stages.map((s) => s.stage)).toEqual(["charge", "project", "settle", "proof"]);
    expect(plan.totalMs).toBe(1500);
    expect(stageAt(plan, 0)).toBe("charge");
    expect(stageAt(plan, 400)).toBe("project");
    expect(stageAt(plan, 1499)).toBe("proof");
    expect(stageAt(plan, 1500)).toBe("done");
  });
  it("scales to a Ranked hold and never below 300ms", () => {
    expect(planRangefinderReveal({ reduced: false, budgetMs: 900 }).totalMs).toBe(900);
    expect(planRangefinderReveal({ reduced: false, budgetMs: 10 }).totalMs).toBe(300);
  });
  it("has no clock under reduced motion: the first frame is the settled one", () => {
    const plan = planRangefinderReveal({ reduced: true });
    expect(plan.instant).toBe(true);
    expect(stageAt(plan, 0)).toBe("done");
    expect(projectionProgress(plan, 0)).toBe(1);
  });
  it("grows the canonical ring monotonically from nothing to its full reach during project", () => {
    const plan = planRangefinderReveal({ reduced: false });
    const w = plan.stages.find((s) => s.stage === "project")!;
    expect(projectionProgress(plan, w.start - 1)).toBe(0);
    let last = 0;
    for (let t = w.start; t <= w.end; t += 25) {
      const p = projectionProgress(plan, t);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(projectionProgress(plan, w.end)).toBe(1);
    expect(projectionProgress(plan, plan.totalMs)).toBe(1);
  });
});

describe("reading", () => {
  it("groups thousands with a narrow no-break space", () => {
    expect(formatUnits(550)).toBe("550");
    expect(formatUnits(1000)).toBe("1 000");
    expect(formatUnits(1025)).toBe("1 025");
  });
});

describe("source contract", () => {
  it("never grades: the pure module reads no reveal and names no domain", () => {
    const src = readFileSync(resolve(__dirname, "rangefinder.ts"), "utf8");
    const imports = (src.match(/^import[\s\S]*?;\s*$/gm) ?? []).join(" ");
    expect(imports).not.toMatch(/RangefinderReveal/);
    expect(src).not.toMatch(/canonicalToken|lockedToken|verdict/);
    expect(src).not.toMatch(/league|champion|ability|wiki|cast range/i);
  });
});
