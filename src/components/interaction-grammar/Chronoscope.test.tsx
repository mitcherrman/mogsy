/**
 * SCRUB-S1 — the Chronoscope primitive: discrete selection, snapping, every
 * input path, the lock payload, no leak, the reveal's chosen → correct
 * traverse and its reduced-motion equivalent.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chronoscope, RAIL_INSET_PX, type ChronoscopeFrame } from "./Chronoscope";
import type { ChronoscopePublic, ChronoscopeReveal } from "@/lib/interaction-grammar/types";
import { CHRONOSCOPE_BUDGET_MS, planChronoscopeReveal, traverseWindow } from "@/lib/interaction-grammar/chronoscope";

const N = 15;
/** Synthetic, content-neutral checkpoints: fifteen numbered steps. */
const content: ChronoscopePublic<{ n: number }> = {
  eyebrow: "Probe eyebrow",
  prompt: "Probe objective: find the first step where the probe state holds.",
  unitLabel: "Step",
  checkpoints: Array.from({ length: N }, (_, i) => ({
    token: `s${i + 1}`, label: `Step ${i + 1}`, clock: `${i}:00`, emphasised: (i + 1) % 3 === 0,
    reading: [{ label: "Value", value: `v${i + 1}` }], scene: { n: i + 1 },
  })),
  railMarks: [{ index: 0, text: "0:00" }, { index: 14, text: "14:00" }],
  footnote: "Probe footnote",
};

const RAIL = { left: 100, width: 400 };
const xOf = (index: number) => RAIL.left + RAIL_INSET_PX + (RAIL.width - 2 * RAIL_INSET_PX) * (index / (N - 1));

function stubRailRect() {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const wide = el.getAttribute?.("data-testid") === "chronoscope-rail";
    return { left: RAIL.left, top: 0, right: RAIL.left + (wide ? RAIL.width : 10), bottom: 40,
      width: wide ? RAIL.width : 10, height: 40, x: RAIL.left, y: 0, toJSON() { return this; } } as DOMRect;
  });
}

const renderScene = (frame: ChronoscopeFrame<{ n: number }>) => (
  <div data-testid="probe-scene" data-from={frame.from.scene.n} data-to={frame.to.scene.n}
    data-t={frame.t.toFixed(2)} data-nearest={frame.nearest.scene.n} />
);

function mount(over: Partial<React.ComponentProps<typeof Chronoscope<{ n: number }>>> = {}) {
  const onChange = vi.fn();
  const onLock = vi.fn();
  const utils = render(
    <Chronoscope content={content} phase="open" value={null} onChange={onChange} onLock={onLock}
      renderScene={renderScene} {...over} />,
  );
  return { ...utils, onChange, onLock };
}

const rail = () => screen.getByTestId("chronoscope-rail");
const ptr = (type: string, x: number, extra: Record<string, unknown> = {}) =>
  fireEvent(rail(), new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0, ...extra }) as unknown as Event);

beforeEach(() => {
  stubRailRect();
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); document.documentElement.classList.remove("reduce-motion"); });

/** A pointer event with the fields the primitive reads (jsdom has no PointerEvent). */
function pointer(type: string, x: number, pointerId = 1, pointerType = "mouse") {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
  Object.defineProperty(e, "pointerId", { value: pointerId });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  return e;
}

describe("discrete selection", () => {
  it("starts with no checkpoint, the reticle parked at the first detent and Lock disabled", () => {
    mount();
    expect(screen.getByTestId("chronoscope-lock")).toBeDisabled();
    expect(rail()).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByTestId("chronoscope-reading-label")).toHaveTextContent("1");
    expect(screen.getByTestId("chronoscope-status")).toHaveTextContent(/Scrub the rail/);
  });

  it("a tap on a detent commits that checkpoint's token", () => {
    const { onChange } = mount();
    fireEvent(rail(), pointer("pointerdown", xOf(3)));
    fireEvent(rail(), pointer("pointerup", xOf(3)));
    expect(onChange).toHaveBeenCalledWith("s4");
  });

  it("snaps a release between detents to the nearest one", () => {
    const { onChange } = mount();
    fireEvent(rail(), pointer("pointerdown", xOf(5) + (xOf(6) - xOf(5)) * 0.4));
    fireEvent(rail(), pointer("pointerup", xOf(5) + (xOf(6) - xOf(5)) * 0.4));
    expect(onChange).toHaveBeenLastCalledWith("s6");
    fireEvent(rail(), pointer("pointerdown", xOf(5) + (xOf(6) - xOf(5)) * 0.6));
    fireEvent(rail(), pointer("pointerup", xOf(5) + (xOf(6) - xOf(5)) * 0.6));
    expect(onChange).toHaveBeenLastCalledWith("s7");
  });

  it("past either end clamps to the end detent", () => {
    const { onChange } = mount();
    fireEvent(rail(), pointer("pointerdown", 0));
    fireEvent(rail(), pointer("pointerup", 0));
    expect(onChange).toHaveBeenLastCalledWith("s1");
    fireEvent(rail(), pointer("pointerdown", 9999));
    fireEvent(rail(), pointer("pointerup", 9999));
    expect(onChange).toHaveBeenLastCalledWith("s15");
  });
});

describe("pointer drag (mouse, touch, pen)", () => {
  it("scrubs continuously while held, hands the scene a fractional frame, then snaps on release", () => {
    const { onChange } = mount();
    fireEvent(rail(), pointer("pointerdown", xOf(2), 7, "touch"));
    expect(screen.getByTestId("mig-chronoscope")).toHaveAttribute("data-dragging", "true");
    fireEvent(rail(), pointer("pointermove", xOf(2) + (xOf(3) - xOf(2)) * 0.5, 7, "touch"));
    const scene = screen.getByTestId("probe-scene");
    expect(scene).toHaveAttribute("data-from", "3");
    expect(scene).toHaveAttribute("data-to", "4");
    // jsdom rounds clientX to a whole pixel, so the fraction is near, not exactly, one half.
    const t = Number(scene.getAttribute("data-t"));
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.6);
    // The reading reads the nearest detent while the hand is between two.
    fireEvent(rail(), pointer("pointermove", xOf(2) + (xOf(3) - xOf(2)) * 0.8, 7, "touch"));
    expect(screen.getByTestId("chronoscope-reading-label")).toHaveTextContent("4");
    expect(onChange).not.toHaveBeenCalled(); // nothing commits mid-drag
    fireEvent(rail(), pointer("pointerup", xOf(2) + (xOf(3) - xOf(2)) * 0.8, 7, "touch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("s4");
    expect(screen.getByTestId("mig-chronoscope")).not.toHaveAttribute("data-dragging");
  });

  it("ignores a second pointer and a cancelled drag commits nothing", () => {
    const { onChange } = mount();
    fireEvent(rail(), pointer("pointerdown", xOf(2), 1, "pen"));
    fireEvent(rail(), pointer("pointermove", xOf(9), 2, "touch"));
    expect(screen.getByTestId("chronoscope-reading-label")).toHaveTextContent("3");
    fireEvent(rail(), pointer("pointercancel", xOf(9), 1, "pen"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does nothing once the rail is closed", () => {
    const { onChange } = mount({ phase: "locked", value: "s5" });
    fireEvent(rail(), pointer("pointerdown", xOf(2)));
    fireEvent(rail(), pointer("pointerup", xOf(2)));
    expect(onChange).not.toHaveBeenCalled();
    expect(rail()).toHaveAttribute("aria-disabled", "true");
  });
});

describe("keyboard", () => {
  it("is a slider: arrows step, Page keys step three, Home/End jump, and it announces", () => {
    const { onChange, rerender } = mount({ value: "s5" });
    const r = rail();
    expect(r).toHaveAttribute("role", "slider");
    expect(r).toHaveAttribute("aria-valuemax", "14");
    expect(r).toHaveAttribute("aria-valuetext", "Step 5, 4:00. Value v5");
    fireEvent.keyDown(r, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("s6");
    fireEvent.keyDown(r, { key: "PageUp" });
    expect(onChange).toHaveBeenLastCalledWith("s8");
    fireEvent.keyDown(r, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("s15");
    fireEvent.keyDown(r, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("s1");
    fireEvent.keyDown(r, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("s4");
    expect(screen.getByTestId("chronoscope-live")).toHaveTextContent("Step 4, 3:00.");
    // A key the rail does not own is left alone.
    onChange.mockClear();
    fireEvent.keyDown(r, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    rerender(<Chronoscope content={content} phase="open" value="s15" onChange={onChange} onLock={vi.fn()} renderScene={renderScene} />);
    fireEvent.keyDown(rail(), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled(); // already at the end: no no-op commit
  });
});

describe("lock", () => {
  it("submits exactly the chosen token and nothing else", () => {
    const { onLock } = mount({ value: "s9" });
    const lock = screen.getByTestId("chronoscope-lock");
    expect(lock).toBeEnabled();
    expect(lock).toHaveTextContent(/Lock step 9/i);
    fireEvent.click(lock);
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock).toHaveBeenCalledWith({ checkpoint: "s9" });
    expect(Object.keys(onLock.mock.calls[0][0])).toEqual(["checkpoint"]);
  });

  it("holds the lock marker and the suspense line while locked", () => {
    mount({ phase: "locked", value: "s9" });
    expect(screen.queryByTestId("chronoscope-lock")).toBeNull();
    expect(screen.getByTestId("chronoscope-suspense")).toHaveTextContent(/Locked on Step 9/);
    expect(screen.getByTestId("chronoscope-lock-mark")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("chronoscope-canon-mark")).toHaveAttribute("data-shown", "false");
    expect(screen.getByTestId("chronoscope-status")).toHaveTextContent("Probe footnote");
  });
});

describe("no leak", () => {
  it("before the reveal nothing on screen names a canonical checkpoint or a proof", () => {
    const { container } = mount({ value: "s9" });
    expect(screen.queryByTestId("chronoscope-proof")).toBeNull();
    expect(screen.getByTestId("chronoscope-canon-mark")).toHaveAttribute("data-shown", "false");
    expect(screen.queryByTestId("chronoscope-trace")).toBeNull();
    expect(container.innerHTML).not.toMatch(/canonical|correct|proof-after/i);
    // Every detent is drawn alike apart from the uniform emphasis and the one under the reticle.
    const detents = container.querySelectorAll('[data-part="detent"]');
    expect(detents).toHaveLength(N);
    const attrs = new Set([...detents].map((d) => [...d.attributes].map((a) => a.name).filter((n) => n !== "data-emphasised" && n !== "data-near" && n !== "style").sort().join(",")));
    expect(attrs.size).toBe(1);
  });

  it("the primitive's source never grades: it reads the canonical token only to display it", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(path.resolve("src/components/interaction-grammar/Chronoscope.tsx"), "utf8");
    expect(src).not.toMatch(/scene\s*[=!]==|\.satisfied\s*[=!]==/);
    expect(src).not.toMatch(/import .*waveXp/);
  });
});

const reveal = (locked: string, canonical: string): ChronoscopeReveal => ({
  lockedToken: locked, canonicalToken: canonical, isCorrect: locked === canonical,
  proof: {
    before: { token: "s3", title: "Step 3", lines: [{ label: "Value", value: "v3" }], satisfied: false, caption: "below" },
    after: { token: canonical, title: "Step 4", lines: [{ label: "Value", value: "v4" }], satisfied: true, caption: "holds" },
    thresholdLine: "Probe threshold",
  },
  note: locked === canonical ? null : "Probe note.",
});

describe("reveal: chosen → correct", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] }); });

  it("traverses from the locked detent to the canonical one, then settles and proves, once", () => {
    const onRevealComplete = vi.fn();
    mount({ phase: "revealed", value: "s9", reveal: reveal("s9", "s4"), onRevealComplete });
    const root = screen.getByTestId("mig-chronoscope");
    const reticle = screen.getByTestId("chronoscope-reticle");
    const f = () => Number(reticle.style.getPropertyValue("--f"));
    expect(root).toHaveAttribute("data-reveal-stage", "clamp");
    expect(f()).toBeCloseTo(8 / 14, 5);
    expect(screen.getByTestId("chronoscope-lock-mark")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("chronoscope-canon-mark")).toHaveAttribute("data-shown", "false");
    const plan = planChronoscopeReveal({ reduced: false, distance: 5 });
    const w = traverseWindow(plan)!;
    act(() => { vi.advanceTimersByTime((w.start + w.end) / 2); });
    expect(root).toHaveAttribute("data-reveal-stage", "traverse");
    expect(f()).toBeGreaterThan(3 / 14);
    expect(f()).toBeLessThan(8 / 14);
    expect(screen.getByTestId("chronoscope-trace")).toHaveAttribute("data-on", "true");
    expect(screen.getByTestId("chronoscope-proof")).toHaveAttribute("data-shown", "false");
    act(() => { vi.advanceTimersByTime(w.end - (w.start + w.end) / 2 + 20); });
    expect(root).toHaveAttribute("data-reveal-stage", "settle");
    expect(f()).toBeCloseTo(3 / 14, 5);
    expect(screen.getByTestId("chronoscope-canon-mark")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("probe-scene")).toHaveAttribute("data-nearest", "4");
    act(() => { vi.advanceTimersByTime(CHRONOSCOPE_BUDGET_MS); });
    expect(root).toHaveAttribute("data-reveal-stage", "done");
    expect(screen.getByTestId("chronoscope-proof")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("chronoscope-proof-before")).toHaveTextContent("Step 3");
    expect(screen.getByTestId("chronoscope-proof-after")).toHaveTextContent("Step 4");
    expect(screen.getByTestId("chronoscope-proof-threshold")).toHaveTextContent("Probe threshold");
    expect(screen.getByTestId("chronoscope-verdict-text")).toHaveTextContent("Not the first checkpoint");
    expect(screen.getByTestId("chronoscope-verdict-note")).toHaveTextContent("Probe note.");
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(500); });
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });

  it("a correct lock confirms in place: no traverse, both markers on one detent", () => {
    mount({ phase: "revealed", value: "s4", reveal: reveal("s4", "s4") });
    const root = screen.getByTestId("mig-chronoscope");
    act(() => { vi.advanceTimersByTime(CHRONOSCOPE_BUDGET_MS + 50); });
    expect(root).toHaveAttribute("data-reveal-stage", "done");
    expect(Number(screen.getByTestId("chronoscope-reticle").style.getPropertyValue("--f"))).toBeCloseTo(3 / 14, 5);
    expect(screen.getByTestId("chronoscope-lock-mark").style.getPropertyValue("--f"))
      .toBe(screen.getByTestId("chronoscope-canon-mark").style.getPropertyValue("--f"));
    expect(screen.getByTestId("chronoscope-verdict-text")).toHaveTextContent("Exact checkpoint");
    expect(screen.getByTestId("chronoscope-footer")).toHaveAttribute("data-correct", "true");
  });

  it("plays cues at the stage boundaries", () => {
    const onCue = vi.fn();
    mount({ phase: "revealed", value: "s9", reveal: reveal("s9", "s4"), onCue });
    // Frame by frame: one act() per step, so every stage is rendered (as a browser would).
    for (let t = 0; t <= CHRONOSCOPE_BUDGET_MS + 50; t += 50) act(() => { vi.advanceTimersByTime(50); });
    expect(onCue.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["traverse", "settle", "resolve"]));
  });
});

describe("reduced motion", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] }); });

  it("the first reveal frame is the settled, proven frame with both markers", () => {
    document.documentElement.classList.add("reduce-motion");
    const onRevealComplete = vi.fn();
    mount({ phase: "revealed", value: "s9", reveal: reveal("s9", "s4"), onRevealComplete });
    const root = screen.getByTestId("mig-chronoscope");
    expect(root).toHaveAttribute("data-animate", "false");
    act(() => { vi.advanceTimersByTime(0); });
    expect(root).toHaveAttribute("data-reveal-stage", "done");
    expect(Number(screen.getByTestId("chronoscope-reticle").style.getPropertyValue("--f"))).toBeCloseTo(3 / 14, 5);
    expect(screen.getByTestId("chronoscope-lock-mark")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("chronoscope-canon-mark")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("chronoscope-proof")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("chronoscope-verdict-text")).toHaveTextContent("Not the first checkpoint");
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });
});

describe("fixed geometry", () => {
  it("draws the same regions in every phase", () => {
    const regions = ["chronoscope-objective", "chronoscope-instrument", "chronoscope-lens", "chronoscope-reading",
      "chronoscope-rail", "chronoscope-footer", "chronoscope-status"];
    for (const phase of ["open", "locked", "revealed"] as const) {
      cleanup();
      mount({ phase, value: "s9", reveal: phase === "revealed" ? reveal("s9", "s4") : null });
      for (const id of regions) expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });
});
