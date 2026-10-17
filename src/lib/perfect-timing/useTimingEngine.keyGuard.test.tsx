/**
 * PT4.4 — `keyGuard`: while the host says so, Space/Enter presses are dropped,
 * whether they land on the document or on the focused seal, so the key that
 * advanced the reveal cannot also start the round it armed. Pointer presses are
 * never guarded.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTimingEngine, type UseTimingEngine } from "./useTimingEngine";

function key(target: EventTarget, t: number, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, "timeStamp", { value: t });
  fireEvent(target as Element, e);
  return e;
}

function mount(guarded: { current: boolean }) {
  const onStopped = vi.fn();
  const api: { current: UseTimingEngine | null } = { current: null };
  function Harness() {
    const engine = useTimingEngine({ onStopped, documentKeys: true, keyGuard: () => guarded.current });
    api.current = engine;
    return <div data-testid="seal" {...engine.press} />;
  }
  const view = render(<Harness />);
  return { view, api, onStopped, arm: (id = "pt_r1") => act(() => api.current!.arm(id)) };
}

afterEach(cleanup);

describe("PT4.4 keyGuard", () => {
  it("drops a document key and a seal key while guarded, and plays on once the guard lifts", () => {
    const guarded = { current: true };
    const h = mount(guarded);
    h.arm();
    key(document.body, 1000);
    key(h.view.getByTestId("seal"), 1100, { key: "Enter" });
    expect(h.api.current!.state.phase).toBe("armed");
    guarded.current = false;
    key(document.body, 2000);
    expect(h.api.current!.state.phase).toBe("running");
    key(document.body, 5000);
    expect(h.onStopped).toHaveBeenCalledWith(3000, "pt_r1");
  });

  it("never guards a pointer press", () => {
    const guarded = { current: true };
    const h = mount(guarded);
    h.arm();
    // jsdom has no PointerEvent: a primary mouse-button event stands in for it.
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(down, "isPrimary", { value: true });
    Object.defineProperty(down, "timeStamp", { value: 1000 });
    fireEvent(h.view.getByTestId("seal"), down);
    expect(h.api.current!.state.phase).toBe("running");
  });

  it("is off by default: no guard, no change", () => {
    const guarded = { current: false };
    const h = mount(guarded);
    h.arm();
    key(document.body, 1000);
    expect(h.api.current!.state.phase).toBe("running");
  });
});

describe("PT5.1 pointerGuard", () => {
  function mountPointerGuarded(guarded: { current: boolean }) {
    const api: { current: UseTimingEngine | null } = { current: null };
    function Harness() {
      const engine = useTimingEngine({ documentKeys: true, pointerGuard: () => guarded.current });
      api.current = engine;
      return <div data-testid="seal" {...engine.press} />;
    }
    const view = render(<Harness />);
    return { view, api, arm: () => act(() => api.current!.arm("pt_r1")) };
  }
  const pointer = (target: Element, t: number) => {
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(down, "isPrimary", { value: true });
    Object.defineProperty(down, "timeStamp", { value: t });
    fireEvent(target, down);
  };

  it("drops a pointer press while guarded and plays on once the guard lifts; keys are not affected", () => {
    const guarded = { current: true };
    const h = mountPointerGuarded(guarded);
    h.arm();
    pointer(h.view.getByTestId("seal"), 1000);
    expect(h.api.current!.state.phase).toBe("armed");
    // A key is not what this guard is about.
    guarded.current = false;
    pointer(h.view.getByTestId("seal"), 2000);
    expect(h.api.current!.state.phase).toBe("running");
  });

  it("does not stop a key press (that is keyGuard's job)", () => {
    const guarded = { current: true };
    const h = mountPointerGuarded(guarded);
    h.arm();
    key(document.body, 1000);
    expect(h.api.current!.state.phase).toBe("running");
  });
});
