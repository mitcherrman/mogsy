/** HUB6 — History's visual marks and their reveal: they draw only what the
 *  server sent, and they never withhold a final value. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import {
  AccuracyRing,
  DormantTrajectory,
  Pips,
  RatioBar,
  TrajectoryChart,
} from "@/components/quiz/workspace/historyVisuals";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import { easeInOutCubic } from "@/lib/motion/easing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("reduce-motion");
});

describe("useReveal", () => {
  it("is the final state at once where nothing can animate (no IntersectionObserver)", () => {
    const { result } = renderHook(() => useReveal());
    expect(result.current.progress).toBe(1);
  });

  it("is the final state at once under the app's own Reduce Motion", () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    document.documentElement.classList.add("reduce-motion");
    const { result } = renderHook(() => useReveal());
    expect(result.current.progress).toBe(1);
  });

  it("starts from nothing and waits to be seen when motion is allowed", () => {
    let fire: (() => void) | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
          fire = () => cb([{ isIntersecting: true }]);
        }
        observe() {}
        disconnect() {}
      },
    );
    const Probe = () => {
      const r = useReveal<HTMLDivElement>();
      return <div ref={r.ref} data-testid="p" data-progress={r.progress} />;
    };
    render(<Probe />);
    expect(screen.getByTestId("p").dataset.progress).toBe("0");
    expect(fire).not.toBeNull();
    act(() => fire!());
  });

  it("staggers pieces of one reveal and lands them all at 1", () => {
    expect(staggered(0, 2, 3)).toBe(0);
    expect(staggered(1, 0, 3)).toBe(1);
    expect(staggered(1, 2, 3)).toBe(1);
    expect(staggered(0.5, 0, 3)).toBeGreaterThan(staggered(0.5, 2, 3));
  });

  it("keeps GRAPH1's easing curve intact after the extraction", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

describe("marks", () => {
  it("an accuracy ring draws its share and nothing for an unanswered run", () => {
    const { container, rerender } = render(<AccuracyRing accuracy={0.5} size={40} stroke={4} />);
    const arcs = container.querySelectorAll("circle");
    expect(arcs).toHaveLength(2);
    const c = 2 * Math.PI * 18;
    expect(Number(arcs[1].getAttribute("stroke-dashoffset"))).toBeCloseTo(c / 2, 3);
    rerender(<AccuracyRing accuracy={null} size={40} stroke={4} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("a bar is the server's accuracy on a common zero baseline", () => {
    render(<ul><RatioBar label="Items" correct={3} answered={4} accuracy={0.75} /></ul>);
    const bar = screen.getByTestId("history-bar");
    expect(bar).toHaveTextContent("3/4");
    expect(bar).toHaveTextContent("75%");
    expect((bar.querySelector("span[aria-hidden] > span") as HTMLElement).style.width).toBe("75%");
  });

  it("pips mark strikes used against the frozen limit", () => {
    render(<Pips used={2} max={3} />);
    const pips = screen.getByTestId("history-pips").children;
    expect(pips).toHaveLength(3);
  });

  it("a trajectory plots every server value, newest last and labelled", () => {
    const { container } = render(<TrajectoryChart values={[0.8, 0.8, 0.54, 0.84, 0.88]} average={0.69} />);
    expect(container.querySelector("polyline")!.getAttribute("points")!.split(" ")).toHaveLength(5);
    expect(screen.getByTestId("history-trajectory-average")).toBeTruthy();
    expect(container.textContent).toContain("88%");
  });

  it("a dormant trajectory draws slots and no values", () => {
    const { container } = render(<DormantTrajectory observed={3} required={5} />);
    const slots = screen.getAllByTestId("history-trajectory-slot");
    expect(slots).toHaveLength(5);
    expect(slots.filter((s) => s.dataset.filled === "true")).toHaveLength(3);
    expect(container.querySelector("polyline")).toBeNull();
    expect(container.textContent).not.toMatch(/%/);
  });
});
