/**
 * RECONSTRUCT-R3C — unit pins for the shared-arena layout repairs. The browser
 * measurements live in `e2e/ranked-arena-r3c.spec.ts`; these pin the seams.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CENTRAL_STAGE_BOX } from "@/lib/ranked-core/centralStage";
import { CentralStage } from "./CentralStage";
import { useBeatLayerViewportBox } from "./useBeatLayerViewportBox";

const src = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("R3C A — every centre face draws the same reserved box", () => {
  it("the display draws CENTRAL_STAGE_BOX", () => {
    render(<CentralStage timer={null} result={null} moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("timer-display").className).toBe(CENTRAL_STAGE_BOX);
  });

  it("the box reserves the clock's tallest face at both header sizes", () => {
    expect(CENTRAL_STAGE_BOX).toContain("h-[4.25rem]");
    expect(CENTRAL_STAGE_BOX).toContain("min-[1500px]:h-[5rem]");
  });

  it("the arena's transition note sits inside the same box (it used to be a bare line)", () => {
    const arena = src("./CanonicalArena.tsx");
    expect(arena).toMatch(/data-testid="ranked-round-transition-box" className=\{CENTRAL_STAGE_BOX\}/);
  });
});

describe("R3C B/C/D — the stylesheet carries the three repairs", () => {
  const css = src("../../index.css");
  it("B: the navy surfaces take the dark token set in the light theme only", () => {
    const rule = /:root:not\(\.dark\) \.ranked-academy \.ranked-banner,\s*:root:not\(\.dark\) \.ranked-academy \.ranked-header-plate,\s*:root:not\(\.dark\) \.ranked-academy \.ranked-matchbar \{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("--foreground: 210 40% 98%;");
    expect(rule![1]).toContain("--muted-foreground: 210 40% 98%;");
    expect(rule![1]).toContain("color: hsl(var(--foreground));");
  });
  it("C: the short-desktop tier shrinks the mascot slot and keeps every row", () => {
    const tier = /@media \(min-width: 1024px\) and \(max-height: 719px\) \{\s*\.ranked-academy \.ranked-banner \{ row-gap[^@]*?\n\}/.exec(css);
    expect(tier).not.toBeNull();
    expect(tier![0]).toContain('[data-testid="role-crest-mascot"]');
    expect(tier![0]).not.toMatch(/display:\s*none/);
  });
  it("D: the phone beat layer is pinned to the published visible box", () => {
    expect(css).toMatch(/\.ranked-shell\[data-phone-arena="true"\] > \.ranked-beat-layer \{\s*position: fixed;/);
    expect(css).toContain("top: var(--beat-top,");
    expect(css).toContain("bottom: var(--beat-bottom,");
  });
});

function Harness({ active }: { active: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  useBeatLayerViewportBox(layer, active);
  return <div data-testid="shell"><div ref={layer} data-testid="layer" /></div>;
}

describe("R3C D — useBeatLayerViewportBox", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const shellAt = (top: number, bottom: number, left = 8, right = 352) =>
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("data-testid") === "shell"
        ? ({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect)
        : ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    });
  const vars = () => {
    const s = screen.getByTestId("layer").style;
    return ["--beat-top", "--beat-right", "--beat-bottom", "--beat-left"].map((k) => s.getPropertyValue(k));
  };

  it("a shell that fits: the published box IS the shell's box", () => {
    vi.stubGlobal("innerWidth", 390); vi.stubGlobal("innerHeight", 844);
    shellAt(46, 830, 8, 382);
    render(<Harness active />);
    expect(vars()).toEqual(["46px", "8px", "14px", "8px"]);
    vi.unstubAllGlobals();
  });

  it("a shell taller than the screen: clipped to the screen, and it follows a scroll", () => {
    vi.stubGlobal("innerWidth", 360); vi.stubGlobal("innerHeight", 640);
    const rect = shellAt(46, 722);
    render(<Harness active />);
    expect(vars()).toEqual(["46px", "8px", "0px", "8px"]);
    rect.mockRestore();
    shellAt(-42, 634);
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(vars()).toEqual(["0px", "8px", "6px", "8px"]);
    vi.unstubAllGlobals();
  });

  it("publishes nothing while no beat is up", () => {
    shellAt(46, 722);
    render(<Harness active={false} />);
    expect(vars()).toEqual(["", "", "", ""]);
  });
});
