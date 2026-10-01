import { describe, expect, it } from "vitest";

import {
  GUIDE_LEAN_PX,
  computeViewportShift,
  facingForTarget,
  leanOffsetExpr,
  resolvePlacement,
} from "./placement";
import { isAnnouncedPriority, isCompactGuideCopy, selectGuideMessage } from "./priority";
import { createGuideStorage, guideStorageKey } from "./storage";
import type { GuideMessage, GuidePlacement } from "./types";

const msg = (id: string, priority: GuideMessage["priority"]): GuideMessage => ({
  id,
  priority,
  text: id,
});

describe("selectGuideMessage", () => {
  it("returns null for no candidates", () => {
    expect(selectGuideMessage([])).toBeNull();
  });

  it("ranks contextual > first-use > hover > ambient", () => {
    const all = [
      msg("amb", "ambient"),
      msg("hov", "hover"),
      msg("first", "first-use"),
      msg("ctx", "contextual"),
    ];
    expect(selectGuideMessage(all)?.id).toBe("ctx");
    expect(selectGuideMessage(all.slice(0, 3))?.id).toBe("first");
    expect(selectGuideMessage(all.slice(0, 2))?.id).toBe("hov");
    expect(selectGuideMessage(all.slice(0, 1))?.id).toBe("amb");
  });

  it("breaks ties by array order (earliest wins)", () => {
    expect(
      selectGuideMessage([msg("a", "contextual"), msg("b", "contextual")])?.id,
    ).toBe("a");
  });

  it("announces only contextual and first-use", () => {
    expect(isAnnouncedPriority("contextual")).toBe(true);
    expect(isAnnouncedPriority("first-use")).toBe(true);
    expect(isAnnouncedPriority("hover")).toBe(false);
    expect(isAnnouncedPriority("ambient")).toBe(false);
  });

  it("checks the compact copy budget", () => {
    expect(isCompactGuideCopy({ text: "Short." })).toBe(true);
    expect(isCompactGuideCopy({ text: "" })).toBe(false);
    expect(isCompactGuideCopy({ text: "x".repeat(101) })).toBe(false);
    expect(isCompactGuideCopy({ text: "ok", title: "t".repeat(33) })).toBe(false);
  });
});

describe("placement helpers", () => {
  const desktop: GuidePlacement = { size: "100px", bubbleSide: "top" };
  const mobile: GuidePlacement = { size: "80px", bubbleSide: "left" };

  it("resolves mobile placement and falls back to desktop", () => {
    expect(resolvePlacement({ desktop, mobile }, "mobile")).toBe(mobile);
    expect(resolvePlacement({ desktop, mobile }, "desktop")).toBe(desktop);
    expect(resolvePlacement({ desktop }, "mobile")).toBe(desktop);
  });

  it("maps targets to capped lean offsets", () => {
    expect(leanOffsetExpr(undefined)).toEqual({ x: "0px", y: "0px" });
    expect(leanOffsetExpr({ direction: "left" }).x).toBe(
      `max(-${GUIDE_LEAN_PX.near}px, -18vw)`,
    );
    expect(leanOffsetExpr({ direction: "right", distance: "far" }).x).toBe(
      `min(${GUIDE_LEAN_PX.far}px, 18vw)`,
    );
    expect(leanOffsetExpr({ direction: "up", distance: "far" })).toEqual({
      x: "0px",
      y: `-${GUIDE_LEAN_PX.far}px`,
    });
    expect(leanOffsetExpr({ direction: "down" }).y).toBe(`${GUIDE_LEAN_PX.near}px`);
  });

  it("derives facing; vertical targets keep the rest facing", () => {
    expect(facingForTarget({ direction: "right" })).toBe("right");
    expect(facingForTarget({ direction: "left" }, "right")).toBe("left");
    expect(facingForTarget({ direction: "up" }, "right")).toBe("right");
    expect(facingForTarget(undefined)).toBe("left");
  });
});

describe("computeViewportShift", () => {
  const vp = { width: 400, height: 800 };
  const box = (left: number, top: number, w = 100, h = 50) => ({
    left,
    top,
    right: left + w,
    bottom: top + h,
  });

  it("is zero when the box is inside the margin", () => {
    expect(computeViewportShift(box(50, 50), vp, 8)).toEqual({ x: 0, y: 0 });
  });

  it("pulls a box back from every edge", () => {
    expect(computeViewportShift(box(-30, 50), vp, 8)).toEqual({ x: 38, y: 0 });
    expect(computeViewportShift(box(340, 50), vp, 8)).toEqual({ x: -48, y: 0 });
    expect(computeViewportShift(box(50, -10), vp, 8)).toEqual({ x: 0, y: 18 });
    expect(computeViewportShift(box(50, 780), vp, 8)).toEqual({ x: 0, y: -38 });
  });

  it("aligns an oversize box to the leading edge", () => {
    expect(computeViewportShift(box(20, 0, 500), vp, 8).x).toBe(-12);
  });
});

describe("guide storage", () => {
  const fakeBacking = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it("namespaces keys by surface and id", () => {
    expect(guideStorageKey("hub", "intro")).toBe("mogzy-guide:v1:hub:intro");
  });

  it("round-trips has/set/clear", () => {
    const s = createGuideStorage(fakeBacking());
    expect(s.has("k")).toBe(false);
    s.set("k");
    expect(s.has("k")).toBe(true);
    s.clear("k");
    expect(s.has("k")).toBe(false);
  });

  it("falls back to memory when storage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const s = createGuideStorage(throwing);
    expect(s.has("k")).toBe(false);
    s.set("k");
    expect(s.has("k")).toBe(true);
    s.clear("k");
    expect(s.has("k")).toBe(false);
  });

  it("works with no storage at all", () => {
    const s = createGuideStorage(null);
    s.set("k");
    expect(s.has("k")).toBe(true);
  });
});
