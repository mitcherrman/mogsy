import { describe, expect, it } from "vitest";

import {
  BOOK_HEIGHT_RATIO,
  BOOK_MAX_WIDTH_CSS,
  BOOK_STACK_LIFT_CSS,
  CENTERPIECE_WIDTH_CSS,
  REGIME_BOUNDARY_VH,
  TITLE_FONT_SIZE_CSS,
  bookMaxWidthPx,
  bookStackLiftPx,
  centerpieceHeightPx,
  centerpieceWidthPx,
  titleFontSizePx,
} from "./academy-layout";

/**
 * Geometry contract for the desktop hub's responsive system. These tests run
 * the same formulas the CSS uses (the *Px twins) against the desktop viewport
 * matrix — they assert the system's INVARIANTS (fit, continuity, baseline
 * preservation), not browser pixels; live-browser verification owns the rest.
 */

/** The desktop matrix from the MALT responsive pass. */
const MATRIX: Array<[number, number]> = [
  [2560, 1440],
  [1920, 1080],
  [1920, 930],
  [1536, 864],
  [1440, 900],
  [1366, 768],
  [1024, 768],
];

const SHORT = MATRIX.filter(([, vh]) => vh < REGIME_BOUNDARY_VH);

describe("academy-layout: baseline preservation (tall regime)", () => {
  it("1920×1080 keeps the approved composition values", () => {
    // Book width: the original shallow slope, 0.308 × 1080 + 176.
    expect(bookMaxWidthPx(1080)).toBeCloseTo(508.64, 1);
    // Title: the width-fluid cap.
    expect(titleFontSizePx(1920, 1080)).toBeCloseTo(38.4, 1);
    // Centerpiece: the 380px cap.
    expect(centerpieceWidthPx(1920, 1080)).toBe(380);
    // Column lift: the approved −50px bias.
    expect(bookStackLiftPx(1080)).toBe(-50);
  });

  it("2560×1440 keeps the approved composition values", () => {
    expect(bookMaxWidthPx(1440)).toBeCloseTo(619.52, 1);
    expect(titleFontSizePx(2560, 1440)).toBeCloseTo(38.4, 1);
    expect(centerpieceWidthPx(2560, 1440)).toBe(380);
    expect(bookStackLiftPx(1440)).toBe(-50);
  });
});

describe("academy-layout: short-regime fit", () => {
  it.each(SHORT)("%i×%i — heading + three book rows + padding fit the fold", (vw, vh) => {
    const titlePx = titleFontSizePx(vw, vh);
    // Header model: pt (8) + two title lines at 1.12 line-height + personal
    // line (mt 4 + 20px) — matches the DOM the hub renders on desktop.
    const headerBottom = 8 + 2 * 1.12 * titlePx + 4 + 20;
    const bookH = bookMaxWidthPx(vh) * BOOK_HEIGHT_RATIO;
    const grid = 3 * bookH + 2 * 12; // gap clamp ceiling
    const bottomPad = 56; // pb-14
    expect(headerBottom + grid + bottomPad).toBeLessThanOrEqual(vh);
  });

  it.each(SHORT)("%i×%i — the column lift cannot push books into the title", (_vw, vh) => {
    // Ease budget: the lift must be spent before the fit slack is (the fit
    // model above leaves ≥ 25px of slack at every matrix height).
    expect(bookStackLiftPx(vh)).toBeGreaterThanOrEqual(-25);
  });

  it("lift is clamped to [−50, 0] and eases monotonically", () => {
    expect(bookStackLiftPx(1200)).toBe(-50);
    expect(bookStackLiftPx(REGIME_BOUNDARY_VH)).toBe(-50);
    expect(bookStackLiftPx(700)).toBe(0);
    let prev = bookStackLiftPx(1100);
    for (let vh = 1099; vh >= 700; vh--) {
      const cur = bookStackLiftPx(vh);
      expect(cur).toBeGreaterThanOrEqual(prev);
      expect(cur).toBeGreaterThanOrEqual(-50);
      expect(cur).toBeLessThanOrEqual(0);
      prev = cur;
    }
  });

  it("centerpiece is substantial at every medium/short desktop size", () => {
    // The hybrid-adaptive contract: the tome is never allowed to collapse to
    // the old 250px medium-desktop size. Every desktop matrix entry gets at
    // least 320px of painted book, which is what keeps the Patch Brief's icon
    // grids readable and the pages unpacked without shrinking icons.
    for (const [vw, vh] of MATRIX) {
      const w = centerpieceWidthPx(vw, vh);
      expect(w).toBeGreaterThanOrEqual(320);
      expect(w).toBeLessThanOrEqual(380);
    }
  });

  it("the tome never eats the free central zone plus its overlap allowance", () => {
    // It may sit at most CENTERPIECE_OVERLAP_PX over each drawn book edge —
    // the same relationship the approved wide composition already has — so
    // widening it can never newly bury the side navigation books.
    for (const [vw, vh] of MATRIX) {
      const inner = vw - 64; // container padding + both grid gaps
      const freeZone = inner - 2 * bookMaxWidthPx(vh) - 2 * bookStackInsetPx(vw);
      expect(centerpieceWidthPx(vw, vh)).toBeLessThanOrEqual(
        freeZone + 2 * CENTERPIECE_OVERLAP_PX,
      );
    }
  });

  it("short viewports keep the dock clear of Mogzy's band", () => {
    // The assembly (tome + dock) must still end in the upper two thirds of a
    // short viewport; the budget is looser than the old 0.55 on purpose — the
    // medium-desktop tome is deliberately larger now — but still bounded.
    for (const [vw, vh] of SHORT) {
      const assemblyBottom = 130 + centerpieceHeightPx(centerpieceWidthPx(vw, vh));
      expect(assemblyBottom).toBeLessThanOrEqual(vh * 0.67);
    }
  });

});

describe("academy-layout: regime continuity (no breakpoint snap)", () => {
  it("book width, lift, title and centerpiece are continuous across the boundary", () => {
    const lo = REGIME_BOUNDARY_VH - 2;
    const hi = REGIME_BOUNDARY_VH + 2;
    expect(Math.abs(bookMaxWidthPx(hi) - bookMaxWidthPx(lo))).toBeLessThan(4);
    expect(Math.abs(bookStackLiftPx(hi) - bookStackLiftPx(lo))).toBeLessThan(4);
    expect(Math.abs(titleFontSizePx(1920, hi) - titleFontSizePx(1920, lo))).toBeLessThan(1);
    expect(Math.abs(centerpieceWidthPx(1920, hi) - centerpieceWidthPx(1920, lo))).toBeLessThan(4);
  });

  it("the fit and tall book terms cross at the regime boundary (±10px)", () => {
    // min() hands over where the slopes intersect — solve for equality.
    // 0.308·h + 176 = (h − 212) · 0.615  →  h ≈ 998.
    const crossing = (176 + 212 * 0.615) / (0.615 - 0.308);
    expect(Math.abs(crossing - REGIME_BOUNDARY_VH)).toBeLessThanOrEqual(10);
  });
});

describe("academy-layout: title constraints", () => {
  it("never renders below the 1.35rem readability floor", () => {
    expect(titleFontSizePx(800, 600)).toBeCloseTo(21.6, 1);
    expect(titleFontSizePx(1024, 500)).toBeCloseTo(21.6, 1);
  });

  it("clears the right HUD cluster at 1024×768 (the narrow-desktop case)", () => {
    const font = titleFontSizePx(1024, 768);
    // Centred two-line title is ~16.7× its font size wide; the anonymous
    // right HUD cluster occupies the right ~271px of the viewport.
    const titleRightEdge = 1024 / 2 + (16.7 * font) / 2;
    expect(titleRightEdge).toBeLessThanOrEqual(1024 - 271);
  });

  it("shrinks with height on short laptops (1920 wide)", () => {
    const at1080 = titleFontSizePx(1920, 1080);
    const at930 = titleFontSizePx(1920, 930);
    const at768 = titleFontSizePx(1920, 768);
    expect(at930).toBeLessThan(at1080);
    expect(at768).toBeLessThan(at930);
    expect(at768).toBeGreaterThanOrEqual(21.6);
  });
});

describe("academy-layout: CSS strings mirror the JS formulas", () => {
  it("book width embeds both regime terms", () => {
    expect(BOOK_MAX_WIDTH_CSS).toContain("100dvh * 0.308 + 176px");
    expect(BOOK_MAX_WIDTH_CSS).toContain("(100dvh - 212px) * 0.615");
    expect(BOOK_MAX_WIDTH_CSS).toMatch(/^min\(100%,/);
  });

  it("lift eases from −50px and is clamped to [−50px, 0px]", () => {
    expect(BOOK_STACK_LIFT_CSS).toMatch(/^clamp\(-50px,/);
    expect(BOOK_STACK_LIFT_CSS).toContain("1000px - 100dvh");
    expect(BOOK_STACK_LIFT_CSS).toMatch(/0px\)$/);
  });

  it("title carries the three named constraints and the outer floor", () => {
    expect(TITLE_FONT_SIZE_CSS).toMatch(/^max\(1\.35rem,/);
    expect(TITLE_FONT_SIZE_CSS).toContain("clamp(1.35rem, 2.2vw + 0.6rem, 2.4rem)");
    expect(TITLE_FONT_SIZE_CSS).toContain("4.8vh - 0.6rem");
    expect(TITLE_FONT_SIZE_CSS).toContain("6vw - 34px");
  });

  it("centerpiece keeps the floor/cap around the free-zone and fit terms", () => {
    expect(CENTERPIECE_WIDTH_CSS).toMatch(/^clamp\(200px,/);
    // Free central zone: viewport minus both book columns and both insets.
    expect(CENTERPIECE_WIDTH_CSS).toContain("100vw + 8px");
    expect(CENTERPIECE_WIDTH_CSS).toContain("100dvh * 0.308 + 176px");
    expect(CENTERPIECE_WIDTH_CSS).toContain("(100vw - 1200px) * 0.5");
    expect(CENTERPIECE_WIDTH_CSS).toContain("max(250px, (100dvh - 260px) * 0.72)");
    expect(CENTERPIECE_WIDTH_CSS).toMatch(/380px\)$/);
  });

});
