import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { StrictMode } from "react";
import type { KeyboardEventHandler, PointerEventHandler } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_ELAPSED_MS } from "./timingEngine";
import {
  PRESS_DEDUPE_MS,
  PRESS_LABEL,
  useTimingEngine,
  type TimingDiagnostic,
  type TimingPressSurfaceProps,
  type UseTimingEngine,
  type UseTimingEngineOptions,
} from "./useTimingEngine";

// ── PT1's frozen press-surface contract (handoff §4.2), copied verbatim so a
// drift in this hook's props fails to compile here rather than in PT4. ──────
interface PtPressSurfacePropsFrozen {
  onPointerDown: PointerEventHandler;
  onKeyDown: KeyboardEventHandler;
  tabIndex: 0;
  role: "button";
  "aria-label": string;
  "aria-disabled": boolean;
}
const _assignable = (p: TimingPressSurfaceProps): PtPressSurfacePropsFrozen => p;
void _assignable;

// ── jsdom 20 has no PointerEvent, and `Event.timeStamp` is read-only. ──────
class TestPointerEvent extends MouseEvent {
  readonly isPrimary: boolean;
  readonly pointerId: number;
  constructor(type: string, init: MouseEventInit & { isPrimary?: boolean; pointerId?: number } = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.isPrimary = init.isPrimary ?? true;
    this.pointerId = init.pointerId ?? 1;
  }
}

function stamp<E extends Event>(event: E, timeStamp: number): E {
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function pointerDown(
  el: Element,
  t: number,
  init: MouseEventInit & { isPrimary?: boolean } = {},
): TestPointerEvent {
  const event = stamp(new TestPointerEvent("pointerdown", { button: 0, ...init }), t);
  fireEvent(el, event);
  return event;
}

function keyDown(el: Element, t: number, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = stamp(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }), t);
  fireEvent(el, event);
  return event;
}

/**
 * Spies on a global and reports only the calls whose stack passes through the
 * PT2 modules. React's dev build and jsdom call `Date.now`/timers themselves
 * (jsdom stamps every Event it constructs with Date.now()), so a bare
 * "was it called" assertion would be measuring the test harness.
 */
function watchCallsFromEngine<T extends object>(target: T, name: keyof T & string) {
  const stacks: string[] = [];
  const original = target[name] as unknown as (...args: unknown[]) => unknown;
  vi.spyOn(target, name as never).mockImplementation(function (this: unknown, ...args: unknown[]) {
    stacks.push(new Error().stack ?? "");
    return original.apply(target, args);
  } as never);
  return () => stacks.filter((stack) => /perfect-timing[\\/](useTimingEngine|timingEngine)\.ts\b/.test(stack));
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
}

let api: UseTimingEngine;

function Harness({ options }: { options?: UseTimingEngineOptions }) {
  api = useTimingEngine(options);
  return <div data-testid="surface" {...api.press} />;
}

const surface = () => screen.getByTestId("surface");
const arm = (id = "pt_a") => act(() => api.arm(id));

beforeEach(() => {
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setVisibility("visible");
});

describe("press surface props", () => {
  it("exposes the frozen button semantics and follows the phase", () => {
    render(<Harness />);
    const el = surface();
    expect(el).toHaveAttribute("role", "button");
    expect(el).toHaveAttribute("tabindex", "0");
    expect(el).toHaveAttribute("aria-disabled", "true");
    expect(el).toHaveAttribute("aria-label", PRESS_LABEL.idle);

    arm();
    expect(el).toHaveAttribute("aria-disabled", "false");
    expect(el).toHaveAttribute("aria-label", PRESS_LABEL.armed);

    pointerDown(el, 1000);
    expect(el).toHaveAttribute("aria-disabled", "false");
    expect(el).toHaveAttribute("aria-label", PRESS_LABEL.running);

    pointerDown(el, 8000);
    expect(el).toHaveAttribute("aria-disabled", "true");
    expect(el).toHaveAttribute("aria-label", PRESS_LABEL.stopped);
  });

  it("keeps handler identity stable across renders", () => {
    const { rerender } = render(<Harness />);
    const first = api.press;
    rerender(<Harness options={{ onStopped: () => {} }} />);
    expect(api.press.onPointerDown).toBe(first.onPointerDown);
    expect(api.press.onKeyDown).toBe(first.onKeyDown);
    expect(api.arm).toBeTypeOf("function");
  });

  it("never changes its label while running", () => {
    render(<Harness />);
    arm();
    pointerDown(surface(), 1000);
    const label = surface().getAttribute("aria-label");
    pointerDown(surface(), 1100); // ignored double tap
    expect(surface().getAttribute("aria-label")).toBe(label);
  });
});

describe("pointer input", () => {
  it("a full pointer run reports the rounded interval once", () => {
    const onStopped = vi.fn();
    render(<Harness options={{ onStopped }} />);
    arm("pt_round1");
    pointerDown(surface(), 1000);
    expect(api.state).toMatchObject({ phase: "running", roundId: "pt_round1", t0: 1000 });
    expect(onStopped).not.toHaveBeenCalled();

    pointerDown(surface(), 7999.5);
    expect(api.state).toMatchObject({ phase: "stopped", elapsedMs: 7000 });
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onStopped).toHaveBeenCalledWith(7000, "pt_round1");
  });

  it("ignores non-primary buttons and non-primary pointers without touching them", () => {
    render(<Harness />);
    arm();
    const right = pointerDown(surface(), 1000, { button: 2 });
    expect(right.defaultPrevented).toBe(false);
    const secondFinger = pointerDown(surface(), 1000, { isPrimary: false });
    expect(secondFinger.defaultPrevented).toBe(false);
    expect(api.state.phase).toBe("armed");
  });

  it("prevents the default action of a primary press", () => {
    render(<Harness />);
    arm();
    expect(pointerDown(surface(), 1000).defaultPrevented).toBe(true);
  });

  it("ignores a stop inside MIN_RUN_MS and accepts it at the boundary", () => {
    const onStopped = vi.fn();
    render(<Harness options={{ onStopped }} />);
    arm();
    pointerDown(surface(), 1000);
    pointerDown(surface(), 1249);
    expect(api.state.phase).toBe("running");
    pointerDown(surface(), 1250);
    expect(api.state).toMatchObject({ phase: "stopped", elapsedMs: 250 });
    expect(onStopped).toHaveBeenCalledTimes(1);
  });

  it("ignores input while idle, stopped and interrupted", () => {
    const onStopped = vi.fn();
    render(<Harness options={{ onStopped }} />);
    pointerDown(surface(), 1000);
    expect(api.state.phase).toBe("idle");

    arm();
    pointerDown(surface(), 1000);
    pointerDown(surface(), 5000);
    pointerDown(surface(), 9000);
    expect(api.state).toMatchObject({ phase: "stopped", elapsedMs: 4000 });
    expect(onStopped).toHaveBeenCalledTimes(1);
  });

  it("uses performance.now() when the native timeStamp is 0, never Date.now()", () => {
    let now = 2000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<Harness />);
    arm();
    const start = stamp(new TestPointerEvent("pointerdown", { button: 0 }), 0);
    const stop = stamp(new TestPointerEvent("pointerdown", { button: 0 }), 0);
    // jsdom stamps events with Date.now() at construction, so spy afterwards.
    const wallCalls = watchCallsFromEngine(Date, "now");
    fireEvent(surface(), start);
    now = 6500;
    fireEvent(surface(), stop);
    expect(api.state).toMatchObject({ phase: "stopped", t0: 2000, elapsedMs: 4500 });
    expect(wallCalls()).toEqual([]);
  });
});

describe("keyboard input", () => {
  it.each([
    ["Space", { key: " ", code: "Space" }],
    ["legacy Spacebar", { key: "Spacebar" }],
    ["Enter", { key: "Enter", code: "Enter" }],
  ])("%s starts and stops", (_name, init) => {
    const onStopped = vi.fn();
    render(<Harness options={{ onStopped }} />);
    arm();
    const down = keyDown(surface(), 1000, init);
    expect(down.defaultPrevented).toBe(true);
    expect(api.state.phase).toBe("running");
    keyDown(surface(), 3500, init);
    expect(onStopped).toHaveBeenCalledWith(2500, "pt_a");
  });

  it("ignores key repeats but still stops page scrolling", () => {
    render(<Harness />);
    arm();
    keyDown(surface(), 1000, { key: " " });
    const repeat = keyDown(surface(), 1500, { key: " ", repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(api.state).toMatchObject({ phase: "running", t0: 1000 });

    // The repeat did not count as a stop even though it is past MIN_RUN_MS.
    keyDown(surface(), 4000, { key: " " });
    expect(api.state).toMatchObject({ phase: "stopped", elapsedMs: 3000 });
  });

  it("ignores other keys and modifier chords", () => {
    render(<Harness />);
    arm();
    expect(keyDown(surface(), 1000, { key: "a" }).defaultPrevented).toBe(false);
    expect(keyDown(surface(), 1000, { key: "Tab" }).defaultPrevented).toBe(false);
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      const e = keyDown(surface(), 1000, { key: " ", ...mod });
      expect(e.defaultPrevented).toBe(false);
    }
    expect(api.state.phase).toBe("armed");
  });
});

describe("same-press dedupe", () => {
  it("counts a pointer and a key for one stop once", () => {
    const onStopped = vi.fn();
    const diagnostics: TimingDiagnostic[] = [];
    render(<Harness options={{ onStopped, onDiagnostic: (d) => diagnostics.push(d) }} />);
    arm();
    pointerDown(surface(), 1000);
    pointerDown(surface(), 8000);
    keyDown(surface(), 8000 + PRESS_DEDUPE_MS, { key: " " });
    expect(api.state).toMatchObject({ phase: "stopped", elapsedMs: 7000 });
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(diagnostics.filter((d) => d.kind === "dedupe")).toHaveLength(1);
  });

  it("a duplicate of the stopping press cannot start the next round", () => {
    render(<Harness />);
    arm("pt_1");
    pointerDown(surface(), 1000);
    pointerDown(surface(), 5000);
    arm("pt_2");

    keyDown(surface(), 5020, { key: " " });
    expect(api.state).toMatchObject({ phase: "armed", roundId: "pt_2" });

    keyDown(surface(), 5000 + PRESS_DEDUPE_MS + 1, { key: " " });
    expect(api.state).toMatchObject({ phase: "running", roundId: "pt_2" });
  });

  it("a duplicate of the starting press does not stop the run", () => {
    render(<Harness />);
    arm();
    pointerDown(surface(), 1000);
    keyDown(surface(), 1010, { key: "Enter" });
    expect(api.state).toMatchObject({ phase: "running", t0: 1000 });
  });
});

describe("page lifecycle", () => {
  it("visibilitychange to hidden voids a running attempt and never reports it", () => {
    const onStopped = vi.fn();
    render(<Harness options={{ onStopped }} />);
    arm();
    pointerDown(surface(), 1000);

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.state).toMatchObject({ phase: "interrupted", interruptReason: "hidden" });

    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    pointerDown(surface(), 9000);
    expect(api.state.phase).toBe("interrupted");
    expect(onStopped).not.toHaveBeenCalled();
  });

  it("visibilitychange to visible is not an interruption", () => {
    render(<Harness />);
    arm();
    pointerDown(surface(), 1000);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.state.phase).toBe("running");
  });

  it("pagehide voids a running attempt", () => {
    render(<Harness />);
    arm();
    pointerDown(surface(), 1000);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(api.state).toMatchObject({ phase: "interrupted", interruptReason: "pagehide" });
  });

  it("hiding the page before the start or after the stop changes nothing", () => {
    render(<Harness />);
    arm();
    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.state.phase).toBe("armed");

    setVisibility("visible");
    pointerDown(surface(), 1000);
    pointerDown(surface(), 4000);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(api.state).toMatchObject({ phase: "stopped", elapsedMs: 3000 });
  });

  it("blur is reported as a diagnostic and does not void the attempt", () => {
    const diagnostics: TimingDiagnostic[] = [];
    render(<Harness options={{ onDiagnostic: (d) => diagnostics.push(d) }} />);
    arm();
    pointerDown(surface(), 1000);
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(api.state.phase).toBe("running");
    expect(diagnostics).toContainEqual({ kind: "blur", phase: "running" });
  });

  it("re-arms after an interruption", () => {
    render(<Harness />);
    arm("pt_1");
    pointerDown(surface(), 1000);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    arm("pt_2");
    expect(api.state).toMatchObject({ phase: "armed", roundId: "pt_2", interruptReason: null });
    pointerDown(surface(), 20_000);
    pointerDown(surface(), 22_000);
    expect(api.state).toMatchObject({ phase: "stopped", elapsedMs: 2000 });
  });

  it("a clock reversal and an over-long run void the attempt through the hook", () => {
    const onStopped = vi.fn();
    render(<Harness options={{ onStopped }} />);
    arm();
    pointerDown(surface(), 10_000);
    pointerDown(surface(), 5000);
    expect(api.state).toMatchObject({ phase: "interrupted", interruptReason: "clock" });

    arm();
    pointerDown(surface(), 20_000);
    pointerDown(surface(), 20_000 + MAX_ELAPSED_MS + 1000);
    expect(api.state).toMatchObject({ phase: "interrupted", interruptReason: "timeout" });
    expect(onStopped).not.toHaveBeenCalled();
  });
});

describe("arm and reset", () => {
  it("reset returns to idle and discards the run", () => {
    render(<Harness />);
    arm();
    pointerDown(surface(), 1000);
    act(() => api.reset());
    expect(api.state.phase).toBe("idle");
    pointerDown(surface(), 5000);
    expect(api.state.phase).toBe("idle");
  });

  it("re-arming after stopped clears t0 and measures a fresh interval", () => {
    const onStopped = vi.fn();
    render(<Harness options={{ onStopped }} />);
    arm("pt_1");
    pointerDown(surface(), 1000);
    pointerDown(surface(), 8000);
    arm("pt_2");
    expect(api.state).toMatchObject({ phase: "armed", t0: null, elapsedMs: null });
    pointerDown(surface(), 30_000);
    pointerDown(surface(), 31_500);
    expect(onStopped).toHaveBeenNthCalledWith(1, 7000, "pt_1");
    expect(onStopped).toHaveBeenNthCalledWith(2, 1500, "pt_2");
  });

  it("always calls the latest onStopped without re-subscribing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness options={{ onStopped: first }} />);
    arm();
    pointerDown(surface(), 1000);
    rerender(<Harness options={{ onStopped: second }} />);
    pointerDown(surface(), 3000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(2000, "pt_a");
  });
});

describe("lifecycle cleanup", () => {
  it("removes exactly the listeners it added on unmount", () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const docRemove = vi.spyOn(document, "removeEventListener");
    const winRemove = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<Harness />);
    const added = [
      ...docAdd.mock.calls.filter(([t]) => t === "visibilitychange"),
      ...winAdd.mock.calls.filter(([t]) => t === "pagehide" || t === "blur"),
    ];
    expect(added.map(([t]) => t).sort()).toEqual(["blur", "pagehide", "visibilitychange"]);

    unmount();
    const removed = [
      ...docRemove.mock.calls.filter(([t]) => t === "visibilitychange"),
      ...winRemove.mock.calls.filter(([t]) => t === "pagehide" || t === "blur"),
    ];
    for (const [type, handler] of added) {
      expect(removed.some(([t, h]) => t === type && h === handler)).toBe(true);
    }
  });

  it("is inert after unmount: no state, callbacks or diagnostics", () => {
    const onStopped = vi.fn();
    const onDiagnostic = vi.fn();
    const { unmount } = render(<Harness options={{ onStopped, onDiagnostic }} />);
    arm();
    pointerDown(surface(), 1000);
    const held = api;
    unmount();

    act(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("pagehide"));
      held.arm("late");
    });
    held.press.onPointerDown({
      button: 0,
      isPrimary: true,
      preventDefault() {},
      nativeEvent: { timeStamp: 9000 },
    } as never);
    expect(onStopped).not.toHaveBeenCalled();
    expect(onDiagnostic).not.toHaveBeenCalledWith({ kind: "blur", phase: "running" });
  });

  it("survives StrictMode's mount/unmount/mount cycle", () => {
    const onStopped = vi.fn();
    render(
      <StrictMode>
        <Harness options={{ onStopped }} />
      </StrictMode>,
    );
    arm();
    pointerDown(surface(), 1000);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(api.state).toMatchObject({ phase: "interrupted", interruptReason: "pagehide" });
    arm();
    pointerDown(surface(), 5000);
    pointerDown(surface(), 6000);
    expect(onStopped).toHaveBeenCalledWith(1000, "pt_a");
  });
});

describe("no timer-based measurement", () => {
  it("never touches setInterval, setTimeout, rAF or Date.now while measuring", () => {
    render(<Harness />);
    arm();
    const events = [
      stamp(new TestPointerEvent("pointerdown", { button: 0 }), 1000),
      stamp(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }), 1010),
      stamp(new TestPointerEvent("pointerdown", { button: 0 }), 6000),
    ];
    const watched = [
      watchCallsFromEngine(globalThis, "setInterval"),
      watchCallsFromEngine(globalThis, "setTimeout"),
      watchCallsFromEngine(globalThis, "requestAnimationFrame"),
      watchCallsFromEngine(Date, "now"),
    ];
    for (const event of events) fireEvent(surface(), event);
    expect(api.state).toMatchObject({ phase: "stopped", elapsedMs: 5000 });
    for (const calls of watched) expect(calls()).toEqual([]);
  });

  it("the source files contain no timer, wall clock or ranked-core import", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ["timingEngine.ts", "useTimingEngine.ts"]) {
      const source = readFileSync(join(here, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(source, file).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|Date\.now/);
      expect(source, file).not.toMatch(/ranked-core/);
    }
  });
});
