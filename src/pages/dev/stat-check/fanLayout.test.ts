import { describe, expect, it } from "vitest";
import {
  centeredNormalizedPosition,
  fanCardLayout,
  horizontalFanPosition,
  normalizedCardIndex,
  responsiveFanParameters,
  rotationCurve,
  stableFanZIndex,
  verticalFanCurve,
} from "./fanLayout";

describe("Stat Check fan layout helpers", () => {
  it("normalizes zero and one-card hands to the center", () => {
    expect(normalizedCardIndex(0, 0)).toBe(0.5);
    expect(normalizedCardIndex(0, 1)).toBe(0.5);
    expect(centeredNormalizedPosition(0, 1)).toBe(0);
  });

  it("normalizes two through six cards across a centered range", () => {
    expect(centeredNormalizedPosition(0, 2)).toBe(-1);
    expect(centeredNormalizedPosition(1, 2)).toBe(1);
    expect(centeredNormalizedPosition(0, 6)).toBe(-1);
    expect(centeredNormalizedPosition(5, 6)).toBe(1);
    expect(centeredNormalizedPosition(2, 5)).toBe(0);
  });

  it("mirrors equivalent left and right cards", () => {
    const parameters = responsiveFanParameters(6, 1440);
    const left = fanCardLayout(1, 6, parameters);
    const right = fanCardLayout(4, 6, parameters);

    expect(left.x).toBeCloseTo(-right.x);
    expect(left.rotation).toBeCloseTo(-right.rotation);
    expect(left.y).toBeCloseTo(right.y);
  });

  it("keeps the center card or center pair highest", () => {
    const oddParameters = responsiveFanParameters(5, 1440);
    const oddCenter = fanCardLayout(2, 5, oddParameters);
    const oddOuter = fanCardLayout(0, 5, oddParameters);
    expect(oddCenter.y).toBeLessThan(oddOuter.y);
    expect(oddCenter.zIndex).toBeGreaterThan(oddOuter.zIndex);

    const evenParameters = responsiveFanParameters(6, 1440);
    const leftCenter = fanCardLayout(2, 6, evenParameters);
    const rightCenter = fanCardLayout(3, 6, evenParameters);
    const evenOuter = fanCardLayout(0, 6, evenParameters);
    expect(leftCenter.y).toBeCloseTo(rightCenter.y);
    expect(leftCenter.y).toBeLessThan(evenOuter.y);
    expect(leftCenter.zIndex).toBeGreaterThan(evenOuter.zIndex);
  });

  it("centers and unrotates a one-card layout", () => {
    const parameters = responsiveFanParameters(1, 1440);
    const card = fanCardLayout(0, 1, parameters);
    expect(card.x).toBe(0);
    expect(card.rotation).toBe(0);
    expect(card.centeredPosition).toBe(0);
  });

  it("reduces fan width and rotation on mobile", () => {
    const desktop = responsiveFanParameters(6, 1440);
    const mobile = responsiveFanParameters(6, 390);
    expect(mobile.mode).toBe("mobile");
    expect(desktop.mode).toBe("desktop");
    expect(mobile.fanWidth).toBeLessThan(desktop.fanWidth);
    expect(mobile.maxRotation).toBeLessThan(desktop.maxRotation);
  });

  it("uses pure curves for position, rotation, and stable selected z-order", () => {
    const parameters = responsiveFanParameters(3, 1366);
    expect(horizontalFanPosition(-1, parameters)).toBeCloseTo(-horizontalFanPosition(1, parameters));
    expect(verticalFanCurve(-1, parameters)).toBeCloseTo(verticalFanCurve(1, parameters));
    expect(rotationCurve(-1, parameters)).toBeCloseTo(-rotationCurve(1, parameters));
    expect(stableFanZIndex(0, true)).toBeGreaterThan(stableFanZIndex(0, false));
  });

  it("preserves selected-card lift for center and outer cards", () => {
    const parameters = responsiveFanParameters(5, 1440);
    const center = fanCardLayout(2, 5, parameters);
    const selectedCenter = fanCardLayout(2, 5, parameters, true);
    const outer = fanCardLayout(0, 5, parameters);
    const selectedOuter = fanCardLayout(0, 5, parameters, true);

    expect(selectedCenter.y).toBeLessThan(center.y);
    expect(selectedOuter.y).toBeLessThan(outer.y);
    expect(selectedOuter.rotation).toBe(0);
    expect(selectedOuter.zIndex).toBeGreaterThan(outer.zIndex);
  });
});
