/**
 * PT5.3 — the engine hook's automatic start: a counted-in round refuses every
 * press (pointer, seal key, document key) without remembering it, starts only
 * through `autoStart(roundId, t)`, and then stops on the player's ONE press with
 * the exact interval from `t`.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MIN_RUN_MS } from "./timingEngine";
import { PRESS_LABEL, useTimingEngine, type TimingDiagnostic, type UseTimingEngine, type UseTimingEngineOptions } from "./useTimingEngine";

class TestPointerEvent extends MouseEvent {
  readonly isPrimary = true;
  readonly pointerId = 1;
  constructor(type: string, init: MouseEventInit = {}) { super(type, { bubbles: true, cancelable: true, ...init }); }
}
const stamp = <E extends Event>(e: E, t: number): E => { Object.defineProperty(e, "timeStamp", { value: t }); return e; };
const pointerDown = (el: Element, t: number) => fireEvent(el, stamp(new TestPointerEvent("pointerdown", { button: 0 }), t));
const keyDown = (el: Element | Document, t: number, init: KeyboardEventInit = {}) => {
  const e = stamp(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true, ...init }), t);
  fireEvent(el, e);
  return e;
};

let api: UseTimingEngine;
function Harness({ options }: { options?: UseTimingEngineOptions }) {
  api = useTimingEngine(options);
  return <div data-testid="surface" {...api.press} />;
}
const surface = () => screen.getByTestId("surface");
const ROUND = "pt_auto";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PT5.3 useTimingEngine — automatic start", () => {
  it("counts in with the surface disabled and a label that says the game starts it", () => {
    render(<Harness />);
    act(() => api.arm(ROUND, "auto"));
    expect(api.state.phase).toBe("countdown");
    expect(surface()).toHaveAttribute("aria-disabled", "true");
    expect(surface()).toHaveAttribute("aria-label", PRESS_LABEL.countdown);
  });

  it("refuses presses while counting in, reports them as early, and does not let them swallow the real stop", () => {
    const onStopped = vi.fn();
    const seen: TimingDiagnostic[] = [];
    render(<Harness options={{ onStopped, onDiagnostic: (d) => seen.push(d), documentKeys: true }} />);
    act(() => api.arm(ROUND, "auto"));
    pointerDown(surface(), 3_990);
    keyDown(surface(), 3_995);
    const doc = keyDown(document, 3_998);
    expect(doc.defaultPrevented).toBe(true); // heard (Space never scrolls), refused
    expect(api.state.phase).toBe("countdown");
    expect(seen.filter((d) => d.kind === "early").map((d) => d.kind === "early" && d.source)).toEqual(["pointer", "key", "key"]);
    let started = false;
    act(() => { started = api.autoStart(ROUND, 4_000); });
    expect(started).toBe(true);
    expect(api.state).toMatchObject({ phase: "running", t0: 4_000 });
    expect(surface()).toHaveAttribute("aria-disabled", "false");
    // A stop 30 ms after the last early press is NOT a duplicate of it: the early presses were never accepted.
    // (It is inside MIN_RUN_MS of the start, so the engine swallows it as bleed; the next one stops.)
    pointerDown(surface(), 4_028);
    expect(api.state.phase).toBe("running");
    pointerDown(surface(), 4_000 + 5_437.4);
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onStopped).toHaveBeenCalledWith(5_437, ROUND);
  });

  it("the first press past MIN_RUN_MS after the start stops it; nothing before does", () => {
    const onStopped = vi.fn();
    render(<Harness options={{ onStopped }} />);
    act(() => api.arm(ROUND, "auto"));
    act(() => { api.autoStart(ROUND, 10_000); });
    keyDown(surface(), 10_000 + MIN_RUN_MS - 1);
    expect(onStopped).not.toHaveBeenCalled();
    keyDown(surface(), 10_000 + MIN_RUN_MS + 400);
    expect(onStopped).toHaveBeenCalledWith(MIN_RUN_MS + 400, ROUND);
  });

  it("refuses a start for another round, a second start, and a start after a re-arm of a different round", () => {
    render(<Harness />);
    act(() => api.arm(ROUND, "auto"));
    let ok = true;
    act(() => { ok = api.autoStart("pt_other", 1_000); });
    expect(ok).toBe(false);
    act(() => { ok = api.autoStart(ROUND, 1_000); });
    expect(ok).toBe(true);
    act(() => { ok = api.autoStart(ROUND, 2_000); });
    expect(ok).toBe(false);
    expect(api.state.t0).toBe(1_000);
    act(() => api.arm("pt_next", "auto"));
    act(() => { ok = api.autoStart(ROUND, 3_000); });
    expect(ok).toBe(false);
    expect(api.state).toMatchObject({ phase: "countdown", roundId: "pt_next" });
  });

  it("a hidden page during the count-in voids nothing; during the run it voids", () => {
    render(<Harness />);
    act(() => api.arm(ROUND, "auto"));
    const setVisibility = (v: DocumentVisibilityState) => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
    try {
      setVisibility("hidden");
      act(() => { document.dispatchEvent(new Event("visibilitychange")); });
      expect(api.state.phase).toBe("countdown");
      setVisibility("visible");
      act(() => { api.autoStart(ROUND, 5_000); });
      setVisibility("hidden");
      act(() => { document.dispatchEvent(new Event("visibilitychange")); });
      expect(api.state).toMatchObject({ phase: "interrupted", interruptReason: "hidden" });
    } finally {
      setVisibility("visible");
    }
  });

  it("a press-armed round still starts on the press (PT2 unchanged)", () => {
    render(<Harness />);
    act(() => api.arm(ROUND));
    pointerDown(surface(), 1_000);
    expect(api.state).toMatchObject({ phase: "running", t0: 1_000 });
  });
});
