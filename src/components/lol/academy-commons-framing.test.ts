/**
 * The Commons' side architecture — one contract, asserted at the source.
 *
 * The pilasters are pure decorative CSS with no DOM and no JavaScript, so
 * there is nothing here worth a render test and certainly nothing worth a
 * pixel-coordinate test. What IS worth protecting is the single invariant that
 * makes them correct at every width:
 *
 *   **their width is the gutter itself, derived from the same custom property
 *   the painting is placed from.**
 *
 * `max(0px, var(--commons-img-x))` is what makes the framing appear only where
 * a raw edge actually exists — past roughly 2.03:1, where the cover
 * computation stops the painting growing — and collapse to nothing everywhere
 * else, with no media query to keep in step with the fit policy. Replace it
 * with a hard-coded width or a breakpoint and the architecture immediately
 * disagrees with the paint about where the room ends: wood columns would steal
 * width from a painting that is already bleeding off both edges at 1440.
 *
 * Reading the stylesheet is deliberate. The alternative is asserting computed
 * geometry in jsdom, which does not implement `clamp()` over viewport units
 * and would answer confidently and wrongly.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** The block that declares both pilasters, from the selector to its closing brace. */
function pilasterBlock(): string {
  const start = css.indexOf(".academy-commons::before,");
  expect(start, "the pilaster rule must exist").toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("Academy Commons side architecture", () => {
  it("sizes the pilasters from the painting's own placement, never a fixed width", () => {
    const block = pilasterBlock();
    expect(block).toContain("max(0px, var(--commons-img-x))");
    // A literal px width here is the regression this file exists to catch.
    expect(block).not.toMatch(/width:\s*\d+px/);
  });

  it("declares both sides, so the room cannot be closed on one edge only", () => {
    expect(css).toContain(".academy-commons::before,");
    expect(css).toContain(".academy-commons::after");
    expect(css).toContain(".academy-commons::before {");
    expect(css).toContain(".academy-commons::after {");
  });

  it("lives inside the stage gate, so flow mode and large text never see it", () => {
    // Both selectors carry the gate's own prefix rather than sitting loose.
    const occurrences = css.match(
      /html\.hub-two-screen:not\(\.large-text\) \.academy-commons::(before|after)/g,
    );
    expect(occurrences?.length).toBeGreaterThanOrEqual(4);
  });

  it("sits above the painting's grade but below every live mount", () => {
    // The raw strip was the art layer's grain and vignette rendering over
    // nothing, so the framing has to be ABOVE that — and below the mounts,
    // which own z-index 10.
    const block = pilasterBlock();
    const z = Number(block.match(/z-index:\s*(\d+)/)?.[1]);
    expect(z).toBeGreaterThan(0);
    expect(z).toBeLessThan(10);
  });

  it("never takes pointer events from the room", () => {
    expect(pilasterBlock()).toContain("pointer-events: none");
  });
});
