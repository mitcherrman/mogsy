import { describe, expect, it } from "vitest";

import {
  COMPOSED_COMPACT_H,
  COMPOSED_TALL_H,
  composedCore,
  composedFit,
  composedPose,
  composedPoses,
  composedStage,
} from "./composed-fit";
import { BOOK_BASE_W_COMPOSED, BOOK_ORDER, BOOK_RATIO, COMPOSED_POSES, CORE_CENTER_COMPOSED } from "./orrery-motion";

const box = (fit: number) => {
  const stage = composedStage(fit);
  return Object.fromEntries(BOOK_ORDER.map((id) => {
    const p = composedPose(id, fit);
    const w = BOOK_BASE_W_COMPOSED * p.scale;
    const h = w * BOOK_RATIO;
    return [id, { top: p.y - h / 2, bottom: p.y + h / 2, left: p.x - w / 2, right: p.x + w / 2, stage }];
  }));
};

describe("composedFit: the stage box's aspect decides how far the composition is drawn in", () => {
  it("is 0 for the approved 360 x 640 aspect or taller, 1 at 360 x 520 or shorter", () => {
    expect(composedFit(360, 640)).toBe(0);
    expect(composedFit(358, 700)).toBe(0);
    expect(composedFit(360, 520)).toBe(1);
    expect(composedFit(328, 400)).toBe(1);
  });

  it("is continuous in between (rounded to 1/100) and safe for an unmeasured box", () => {
    expect(composedFit(360, 580)).toBe(0.5);
    expect(composedFit(288, 446)).toBe(0.69);
    expect(composedFit(0, 0)).toBe(0);
    expect(composedFit(Number.NaN, 400)).toBe(0);
  });

  it("the tall end is exactly the approved arrangement", () => {
    expect(composedStage(0)).toEqual({ width: 360, height: COMPOSED_TALL_H });
    expect(composedPoses(0)).toEqual(COMPOSED_POSES);
    expect(composedCore(0)).toEqual(CORE_CENTER_COMPOSED);
  });
});

describe("every fit is a whole, readable composition", () => {
  for (const fit of [0, 0.25, 0.5, 0.75, 1]) {
    it(`fit ${fit}: books inside the stage, upper tier clear of the lower, Core between them`, () => {
      const b = box(fit);
      const stage = composedStage(fit);
      expect(stage.height).toBeGreaterThanOrEqual(COMPOSED_COMPACT_H);
      for (const id of BOOK_ORDER) {
        expect(b[id].top, `${id} top`).toBeGreaterThanOrEqual(0);
        expect(b[id].bottom, `${id} bottom`).toBeLessThanOrEqual(stage.height);
        expect(b[id].left, `${id} left`).toBeGreaterThanOrEqual(0);
        expect(b[id].right, `${id} right`).toBeLessThanOrEqual(stage.width);
      }
      const upperBottom = Math.max(b.leaguecraft.bottom, b["pro-play"].bottom);
      const lowerTop = Math.min(b["combat-lab"].top, b.archives.top);
      expect(upperBottom).toBeLessThan(lowerTop);
      const core = composedCore(fit);
      expect(core.y).toBeGreaterThan(upperBottom - 120);
      expect(core.y).toBeLessThan(lowerTop + 120);
      // books stay large: never below 82 % of their base width
      for (const id of BOOK_ORDER) expect(composedPose(id, fit).scale).toBeGreaterThanOrEqual(0.82);
    });
  }
});
