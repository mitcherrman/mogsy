import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateBeam, type EstimateBeamProps } from "./EstimateBeam";
import type { EstimatePublic, EstimateResponse, EstimateReveal } from "@/lib/interaction-grammar/types";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";

const content = (over: Partial<EstimatePublic> = {}): EstimatePublic => ({
  prompt: "How much damage does the hit deal?",
  measureLabel: "Final damage",
  unitLabel: "damage",
  definition: "One hit, after armor.",
  scale: { max: 400, coarseStep: 50, figureEvery: 100 },
  certification: { kind: "certified", label: "Combat authority · 8829fc3c" },
  footnote: "By the combat authority.",
  ...over,
});

/** A reveal as a host would hand it down: the truth 144, the player 161. */
const reveal = (over: Partial<EstimateReveal> = {}): EstimateReveal => ({
  lockedValue: 161,
  truth: { value: 144, valueText: "144", exactText: "144.2259", label: "Final damage" },
  verdict: "over",
  error: { signed: 17, signedText: "+17", absolute: 17, absoluteText: "17", relative: 0.116, relativeText: "12% over" },
  closeness: { label: "Within 20%", development: true },
  note: null,
  source: { label: "Combat authority" },
  ...over,
});

const RAIL_WIDTH = 400;

// jsdom has no PointerEvent: without this, testing-library's pointer events carry no clientX, pointerId or pointerType.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

beforeEach(() => {
  if (typeof window.PointerEvent === "undefined") {
    (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
  }
  // Every rail is 400px wide at x=0; the beams read pointer positions off it.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { x: 0, y: 0, left: 0, top: 0, right: RAIL_WIDTH, bottom: 40, width: RAIL_WIDTH, height: 40, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
});

/** A host that owns the value, as the lab does. */
function Host(props: Partial<EstimateBeamProps> & { initial?: number | null; onChangeSpy?: (v: number) => void }) {
  const [value, setValue] = useState<number | null>(props.initial ?? null);
  return (
    <EstimateBeam content={content()} phase="open" value={value}
      onChange={(v) => { setValue(v); props.onChangeSpy?.(v); }} onLock={() => {}} {...props} />
  );
}

const board = () => screen.getByTestId("estimate-board");
const readingText = () => screen.getByTestId("estimate-reading-value").textContent;
const parts = () => Array.from(document.querySelectorAll("[data-part]")).map((e) => e.getAttribute("data-part"));

describe("EstimateBeam — before the reveal", () => {
  it("renders nothing that could hold the answer", () => {
    render(<Host />);
    expect(document.querySelectorAll("[data-verdict]")).toHaveLength(0);
    expect(screen.queryByTestId("estimate-truth")).toBeNull();
    expect(screen.queryByTestId("estimate-band")).toBeNull();
    expect(screen.getByTestId("estimate-truth-value").textContent).toBe("—");
    expect(document.body.innerHTML).not.toContain("144");
    expect(screen.getByTestId("estimate-certification").getAttribute("data-kind")).toBe("certified");
    expect(readingText()).toBe("—");
  });

  it("is one slider whose keys step a unit, ten, a notch and the ends", () => {
    const spy = vi.fn();
    render(<Host onChangeSpy={spy} />);
    const b = board();
    b.focus();
    fireEvent.keyDown(b, { key: "ArrowRight" });
    expect(spy).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(b, { key: "ArrowRight", shiftKey: true });
    expect(spy).toHaveBeenLastCalledWith(11);
    fireEvent.keyDown(b, { key: "PageUp" });
    expect(spy).toHaveBeenLastCalledWith(61);
    fireEvent.keyDown(b, { key: "ArrowLeft" });
    expect(spy).toHaveBeenLastCalledWith(60);
    fireEvent.keyDown(b, { key: "End" });
    expect(spy).toHaveBeenLastCalledWith(399);
    fireEvent.keyDown(b, { key: "ArrowRight" });
    expect(spy).toHaveBeenCalledTimes(5); // at the ceiling nothing changes, nothing is reported
    fireEvent.keyDown(b, { key: "Home" });
    expect(spy).toHaveBeenLastCalledWith(0);
    expect(b.getAttribute("aria-valuenow")).toBe("0");
    expect(b.getAttribute("aria-valuemax")).toBe("399");
    expect(b.getAttribute("data-focus-visible")).toBe("true");
    expect(readingText()).toBe("0");
  });

  it("quantises a press on the coarse beam to a notch and a press on the fine beam to a unit", () => {
    const spy = vi.fn();
    render(<Host onChangeSpy={spy} />);
    const coarse = screen.getByTestId("estimate-coarse-rail");
    fireEvent.pointerDown(coarse, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 104 });
    expect(readingText()).toBe("100"); // live reading while the poise is held (104/400 of 400 → notch 100)
    fireEvent.pointerUp(coarse, { pointerId: 1, pointerType: "mouse" });
    expect(spy).toHaveBeenLastCalledWith(100);
    const fine = screen.getByTestId("estimate-fine-rail");
    fireEvent.pointerDown(fine, { pointerId: 2, pointerType: "touch", clientX: 200 });
    fireEvent.pointerMove(fine, { pointerId: 2, pointerType: "touch", clientX: 300 });
    expect(readingText()).toBe("137"); // 100 + round(0.75 * 49)
    fireEvent.pointerUp(fine, { pointerId: 2, pointerType: "touch" });
    expect(spy).toHaveBeenLastCalledWith(137);
    expect(screen.getByTestId("estimate-poise").getAttribute("data-docked")).toBe("false");
    // the reading mark sits at the whole estimate, the poise at its notch
    expect(screen.getByTestId("estimate-mark").style.transform).toBe(`translateX(${(137 / 400) * RAIL_WIDTH}px)`);
    expect(screen.getByTestId("estimate-poise").style.transform).toBe(`translateX(${(100 / 400) * RAIL_WIDTH}px)`);
  });

  it("follows a pen drag along the coarse beam and settles on release", () => {
    const spy = vi.fn();
    render(<Host onChangeSpy={spy} />);
    const coarse = screen.getByTestId("estimate-coarse-rail");
    fireEvent.pointerDown(coarse, { pointerId: 3, pointerType: "pen", clientX: 10 });
    fireEvent.pointerMove(coarse, { pointerId: 3, pointerType: "pen", clientX: 260 });
    expect(screen.getByTestId("estimate-poise").getAttribute("data-dragging")).toBe("true");
    expect(readingText()).toBe("250");
    fireEvent.pointerUp(coarse, { pointerId: 3, pointerType: "pen" });
    expect(spy).toHaveBeenLastCalledWith(250);
    expect(screen.getByTestId("estimate-poise").getAttribute("data-dragging")).toBe("false");
  });

  it("commits nothing on a cancelled drag or a secondary button", () => {
    const spy = vi.fn();
    render(<Host onChangeSpy={spy} />);
    const coarse = screen.getByTestId("estimate-coarse-rail");
    fireEvent.pointerDown(coarse, { pointerId: 4, pointerType: "mouse", button: 2, clientX: 200 });
    fireEvent.pointerUp(coarse, { pointerId: 4, pointerType: "mouse" });
    fireEvent.pointerDown(coarse, { pointerId: 5, pointerType: "mouse", button: 0, clientX: 200 });
    fireEvent.pointerCancel(coarse, { pointerId: 5, pointerType: "mouse" });
    expect(spy).not.toHaveBeenCalled();
    expect(readingText()).toBe("—");
  });

  it("keeps the fine offset when the coarse poise moves, and the coarse notch when the fine one does", () => {
    const spy = vi.fn();
    render(<Host initial={137} onChangeSpy={spy} />);
    const coarse = screen.getByTestId("estimate-coarse-rail");
    fireEvent.pointerDown(coarse, { pointerId: 6, pointerType: "mouse", button: 0, clientX: 300 });
    fireEvent.pointerUp(coarse, { pointerId: 6, pointerType: "mouse" });
    expect(spy).toHaveBeenLastCalledWith(337);
    const fine = screen.getByTestId("estimate-fine-rail");
    fireEvent.pointerDown(fine, { pointerId: 7, pointerType: "mouse", button: 0, clientX: 0 });
    fireEvent.pointerUp(fine, { pointerId: 7, pointerType: "mouse" });
    expect(spy).toHaveBeenLastCalledWith(300);
  });

  it("nudges by one and ten from the vernier keys and disables them at the ends", () => {
    const spy = vi.fn();
    render(<Host initial={5} onChangeSpy={spy} />);
    fireEvent.click(screen.getByTestId("estimate-plus-10"));
    expect(spy).toHaveBeenLastCalledWith(15);
    fireEvent.click(screen.getByTestId("estimate-minus-1"));
    expect(spy).toHaveBeenLastCalledWith(14);
    fireEvent.click(screen.getByTestId("estimate-plus-1"));
    expect(spy).toHaveBeenLastCalledWith(15);
    fireEvent.click(screen.getByTestId("estimate-minus-10"));
    expect(spy).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getByTestId("estimate-minus-10"));
    expect(spy).toHaveBeenLastCalledWith(0);
    expect(screen.getByTestId("estimate-minus-1")).toBeDisabled();
    expect(screen.getByTestId("estimate-minus-10")).toBeDisabled();
  });

  it("locks the committed value, exactly, and nothing else", () => {
    const onLock = vi.fn<(r: EstimateResponse) => void>();
    render(<Host initial={161} onLock={onLock} />);
    fireEvent.click(screen.getByTestId("estimate-lock"));
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock.mock.calls[0][0]).toEqual({ estimate: 161 });
    expect(Object.keys(onLock.mock.calls[0][0])).toEqual(["estimate"]);
  });

  it("cannot lock before any setting", () => {
    const onLock = vi.fn();
    render(<Host onLock={onLock} />);
    expect(screen.getByTestId("estimate-lock")).toBeDisabled();
    fireEvent.click(screen.getByTestId("estimate-lock"));
    expect(onLock).not.toHaveBeenCalled();
  });
});

describe("EstimateBeam — locked", () => {
  it("is inert: no key, pointer or vernier changes the value, and Lock is gone", () => {
    const onChange = vi.fn();
    const onLock = vi.fn();
    render(<EstimateBeam content={content()} phase="locked" value={161} onChange={onChange} onLock={onLock} />);
    const b = board();
    fireEvent.keyDown(b, { key: "ArrowRight" });
    fireEvent.pointerDown(screen.getByTestId("estimate-coarse-rail"), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300 });
    fireEvent.pointerUp(screen.getByTestId("estimate-coarse-rail"), { pointerId: 1, pointerType: "mouse" });
    fireEvent.click(screen.getByTestId("estimate-plus-10"));
    fireEvent.click(screen.getByTestId("estimate-lock"));
    expect(onChange).not.toHaveBeenCalled();
    expect(onLock).not.toHaveBeenCalled();
    expect(screen.getByTestId("estimate-lock").getAttribute("data-shown")).toBe("false");
    expect(screen.getByTestId("estimate-lockstate").getAttribute("data-shown")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.getAttribute("tabindex")).toBe("-1");
    expect(readingText()).toBe("161");
    expect(screen.getByTestId("estimate-live").textContent).toMatch(/Locked at 161 damage/);
  });
});

describe("EstimateBeam — the reveal", () => {
  it("draws the truth, the band and the verdict it is handed, under reduced motion at once", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const done = vi.fn();
    const { rerender } = render(
      <EstimateBeam content={content()} phase="revealed" value={161} onChange={() => {}} onLock={() => {}}
        reveal={reveal()} onRevealComplete={done} breakdown={<p data-testid="host-breakdown">working</p>} />,
    );
    const root = screen.getByTestId("mig-estimate");
    expect(root.getAttribute("data-reveal-stage")).toBe("done");
    expect(root.getAttribute("data-verdict")).toBe("over");
    expect(screen.getByTestId("estimate-truth").getAttribute("data-on")).toBe("true");
    expect(screen.getByTestId("estimate-truth-value").textContent).toBe("144");
    expect(screen.getByTestId("estimate-verdict").textContent).toBe("Over by 17");
    expect(screen.getByTestId("estimate-lockstate").textContent).toContain("12% over");
    expect(screen.getByTestId("estimate-band")).toBeTruthy();
    expect(screen.getByTestId("estimate-needle").style.transform).toMatch(/rotate\(9\.7deg\)/);
    expect(screen.getByTestId("estimate-ledger").getAttribute("data-on")).toBe("true");
    expect(screen.getByTestId("host-breakdown")).toBeTruthy();
    expect(screen.getByTestId("estimate-prelude").getAttribute("data-shown")).toBe("false");
    expect(screen.getByTestId("estimate-live").textContent).toMatch(/Over by 17\. Final damage is 144 damage\. 12% over\./);
    expect(done).toHaveBeenCalledTimes(1);
    rerender(
      <EstimateBeam content={content()} phase="revealed" value={161} onChange={() => {}} onLock={() => {}}
        reveal={reveal()} onRevealComplete={done} breakdown={<p data-testid="host-breakdown">working</p>} />,
    );
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("the band and the pointer sit by the same map as the poise: distance on screen is distance in units", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    render(<EstimateBeam content={content()} phase="revealed" value={161} onChange={() => {}} onLock={() => {}} reveal={reveal()} />);
    const px = (id: string) => Number(/translateX\(([-\d.]+)px\)/.exec(screen.getByTestId(id).style.transform)?.[1]);
    const truth = px("estimate-truth");
    const band = screen.getByTestId("estimate-band");
    expect(truth).toBeCloseTo((144 / 400) * RAIL_WIDTH, 6);
    expect(px("estimate-band")).toBeCloseTo(truth, 6);
    expect(parseFloat(band.style.width)).toBeCloseTo(((161 - 144) / 400) * RAIL_WIDTH, 6);
    // the coarse poise stands on the notch (150), the fine poise carries the 11, and the reading mark is the whole 161
    expect(px("estimate-poise")).toBeCloseTo((150 / 400) * RAIL_WIDTH, 6);
    expect(px("estimate-fine-poise")).toBeCloseTo((11 / 49) * RAIL_WIDTH, 6);
    expect(px("estimate-mark")).toBeCloseTo((161 / 400) * RAIL_WIDTH, 6);
    expect(px("estimate-band") + parseFloat(band.style.width)).toBeCloseTo(px("estimate-mark"), 6);
  });

  it("shows no band for an exact lock, and an exact verdict word", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    render(<EstimateBeam content={content()} phase="revealed" value={144} onChange={() => {}} onLock={() => {}}
      reveal={reveal({ lockedValue: 144, verdict: "exact", error: { signed: 0, signedText: "0", absolute: 0, absoluteText: "0", relative: 0.0016, relativeText: "Exact" } })} />);
    expect(screen.queryByTestId("estimate-band")).toBeNull();
    // the pointer lands on the mark: same position, by the same map
    expect(screen.getByTestId("estimate-truth").style.transform).toBe(screen.getByTestId("estimate-mark").style.transform);
    expect(screen.getByTestId("estimate-verdict").textContent).toBe("Exact");
    expect(screen.getByTestId("estimate-needle").style.transform).toBe("rotate(0deg)");
    expect(screen.getByTestId("mig-estimate").getAttribute("data-verdict")).toBe("exact");
  });

  it("the verdict is displayed, not derived: a host's word wins over the numbers", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    render(<EstimateBeam content={content()} phase="revealed" value={161} onChange={() => {}} onLock={() => {}}
      reveal={reveal({ verdict: "under", error: { signed: -3, signedText: "−3", absolute: 3, absoluteText: "3", relative: 0.02, relativeText: "2% under" } })} />);
    expect(screen.getByTestId("estimate-verdict").textContent).toBe("Under by 3");
    expect(screen.getByTestId("mig-estimate").getAttribute("data-verdict")).toBe("under");
  });

  it("plays charge → descend → band → ledger → done on one clock and completes once", () => {
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      render(<EstimateBeam content={content()} phase="revealed" value={161} onChange={() => {}} onLock={() => {}}
        reveal={reveal()} onRevealComplete={done} revealBudgetMs={1000} />);
      const root = screen.getByTestId("mig-estimate");
      expect(root.getAttribute("data-reveal-stage")).toBe("charge");
      expect(root.hasAttribute("data-verdict")).toBe(false);
      expect(screen.getByTestId("estimate-truth").getAttribute("data-on")).toBe("false");
      act(() => { vi.advanceTimersByTime(130); });
      expect(root.getAttribute("data-reveal-stage")).toBe("descend");
      expect(screen.getByTestId("estimate-truth").getAttribute("data-on")).toBe("true");
      expect(screen.queryByTestId("estimate-band")).toBeNull();
      act(() => { vi.advanceTimersByTime(300); });
      expect(root.getAttribute("data-reveal-stage")).toBe("band");
      expect(root.getAttribute("data-verdict")).toBe("over");
      expect(screen.getByTestId("estimate-band")).toBeTruthy();
      expect(screen.getByTestId("estimate-ledger").getAttribute("data-on")).toBe("false");
      act(() => { vi.advanceTimersByTime(200); });
      expect(root.getAttribute("data-reveal-stage")).toBe("ledger");
      expect(screen.getByTestId("estimate-ledger").getAttribute("data-on")).toBe("true");
      expect(done).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(400); });
      expect(root.getAttribute("data-reveal-stage")).toBe("done");
      expect(done).toHaveBeenCalledTimes(1);
      act(() => { vi.advanceTimersByTime(5000); });
      expect(done).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("unmounting mid-reveal cancels the clock", () => {
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      const { unmount } = render(<EstimateBeam content={content()} phase="revealed" value={161} onChange={() => {}} onLock={() => {}}
        reveal={reveal()} onRevealComplete={done} revealBudgetMs={1000} />);
      act(() => { vi.advanceTimersByTime(200); });
      unmount();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(done).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a new round wipes the reveal: no verdict, no truth, no band", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const { rerender } = render(<EstimateBeam content={content()} phase="revealed" value={161} onChange={() => {}} onLock={() => {}} reveal={reveal()} />);
    expect(screen.getByTestId("mig-estimate").getAttribute("data-verdict")).toBe("over");
    rerender(<EstimateBeam content={content({ prompt: "Next?", scale: { max: 600, coarseStep: 50, figureEvery: 100 } })} phase="open" value={null} onChange={() => {}} onLock={() => {}} reveal={null} />);
    const root = screen.getByTestId("mig-estimate");
    expect(root.hasAttribute("data-verdict")).toBe(false);
    expect(root.hasAttribute("data-reveal-stage")).toBe(false);
    expect(screen.queryByTestId("estimate-truth")).toBeNull();
    expect(screen.queryByTestId("estimate-band")).toBeNull();
    expect(screen.queryByTestId("estimate-mark")).toBeNull();
    expect(readingText()).toBe("—");
    expect(board().getAttribute("aria-valuemax")).toBe("599");
  });

  it("keeps the same reserved regions in every phase", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const { rerender } = render(<EstimateBeam content={content()} phase="open" value={null} onChange={() => {}} onLock={() => {}} />);
    const open = parts();
    rerender(<EstimateBeam content={content()} phase="locked" value={161} onChange={() => {}} onLock={() => {}} />);
    const locked = parts();
    rerender(<EstimateBeam content={content()} phase="revealed" value={161} onChange={() => {}} onLock={() => {}} reveal={reveal()} />);
    const revealed = parts();
    const structural = (p: (string | null)[]) => p.filter((x) => !["truth", "band", "poise", "fine-poise", "mark"].includes(x ?? ""));
    expect(structural(open)).toEqual(structural(locked));
    expect(structural(locked)).toEqual(structural(revealed));
    expect(open).toEqual(expect.arrayContaining(["head", "board", "plaque", "coarse", "fine", "plate", "lock", "ledger", "status"]));
  });

  it("labels a synthetic round as such on the instrument itself", () => {
    render(<EstimateBeam content={content({ certification: { kind: "synthetic", label: "SYNTHETIC — not certified" } })} phase="open" value={null} onChange={() => {}} onLock={() => {}} />);
    expect(screen.getByTestId("mig-estimate").getAttribute("data-certification")).toBe("synthetic");
    expect(screen.getByTestId("estimate-certification").textContent).toBe("SYNTHETIC — not certified");
  });
});

describe("EstimateBeam — source contract", () => {
  it("imports no grader, fixture, host or domain, and never derives a verdict from the numbers", () => {
    const src = readFileSync(resolve(__dirname, "EstimateBeam.tsx"), "utf8");
    expect(src).not.toMatch(/labAuthority|__fixtures__|pages\/dev|combat-estimate|journey/);
    expect(src).not.toMatch(/champion|armor/i);
    // the only verdict in this file is the one it is handed
    const verdicts = src.match(/verdict/g) ?? [];
    expect(verdicts.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/lockedValue\s*[<>=]=?\s*(reveal\.)?truth/);
    expect(src).not.toMatch(/truth\.value\s*[<>=]=?\s*(reveal\.)?lockedValue/);
  });
});
