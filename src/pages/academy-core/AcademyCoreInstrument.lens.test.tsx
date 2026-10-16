/**
 * The shared instrument's `lensScale` option: V3 (production `/lol`) must keep
 * its 0.78 crystal; only a caller that asks (the V3.5 preview) gets a larger one.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/hooks/useReducedMotionPreference", () => ({ useReducedMotionPreference: () => true }));

import AcademyCoreInstrument from "./AcademyCoreInstrument";

/** The crystal assembly's group: the one that contains `.acore-crystal`. */
function lensTransform(container: HTMLElement): string {
  const crystal = container.querySelector(".acore-crystal")!;
  return crystal.parentElement!.getAttribute("transform") ?? "";
}

describe("AcademyCoreInstrument lensScale", () => {
  it("defaults to the V3 crystal scale (0.78) in both the full and compact forms", () => {
    for (const compact of [false, true]) {
      const { container, unmount } = render(<AcademyCoreInstrument focus="idle" compact={compact} />);
      expect(lensTransform(container)).toMatch(/scale\(0\.78\)$/);
      unmount();
    }
  });

  it("scales the whole crystal assembly (lens, projections and iris) when a caller asks", () => {
    const { container } = render(<AcademyCoreInstrument focus="leaguecraft" compact lensScale={0.96} />);
    const g = container.querySelector(".acore-crystal")!.parentElement!;
    expect(g.getAttribute("transform")).toMatch(/scale\(0\.96\)$/);
    // projections, clips and the iris live inside the same scaled group
    for (const sel of [".acore-mode-leaguecraft", ".acore-mode-combat", ".acore-mode-archives", ".acore-mode-pro-play", ".acore-iris", ".acore-iris-rim"]) {
      expect(g.querySelector(sel), sel).not.toBeNull();
    }
    // the dial (bezel, ticks) is outside it and unchanged
    expect(g.querySelector(".acore-bezel-outer")).toBeNull();
    expect(container.querySelector(".acore-bezel-outer")!.getAttribute("r")).toBe("150");
  });
});
