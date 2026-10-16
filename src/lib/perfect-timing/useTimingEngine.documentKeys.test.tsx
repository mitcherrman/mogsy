/**
 * PT4.3 — Space/Enter drive the timer from the document while a round is in
 * play, without focus on the seal, and leave everything else alone.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { documentKeyIsForTimer, useTimingEngine, type UseTimingEngine } from "./useTimingEngine";

function stamp<E extends Event>(event: E, timeStamp: number): E {
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function key(target: EventTarget, t: number, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = stamp(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true, ...init }), t);
  fireEvent(target as Element, e);
  return e;
}

function mount(documentKeys = true) {
  const onStopped = vi.fn();
  const api: { current: UseTimingEngine | null } = { current: null };
  function Harness({ on }: { on: boolean }) {
    const engine = useTimingEngine({ onStopped, documentKeys: on });
    api.current = engine;
    return (
      <div>
        <div data-testid="seal" {...engine.press} />
        <p data-testid="text">prose</p>
        <input data-testid="input" />
        <textarea data-testid="textarea" />
        <div data-testid="editable" contentEditable suppressContentEditableWarning />
        <button data-testid="button">Next</button>
        <a data-testid="link" href="#x">link</a>
      </div>
    );
  }
  const view = render(<Harness on={documentKeys} />);
  const get = (id: string) => view.getByTestId(id);
  const arm = (id = "pt_r1") => act(() => api.current!.arm(id));
  return { view, get, arm, api, onStopped, rerender: (on: boolean) => view.rerender(<Harness on={on} />) };
}

afterEach(cleanup);

describe("PT4.3 document-level Space/Enter", () => {
  it.each([[" "], ["Enter"]])("%j starts and stops a round with focus on <body>", (k) => {
    const h = mount();
    h.arm();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    const start = key(document.body, 1000, { key: k });
    expect(start.defaultPrevented).toBe(true); // no page scroll
    expect(h.api.current!.state.phase).toBe("running");
    key(document.body, 8000, { key: k });
    expect(h.api.current!.state.phase).toBe("stopped");
    expect(h.onStopped).toHaveBeenCalledTimes(1);
    expect(h.onStopped).toHaveBeenCalledWith(7000, "pt_r1");
  });

  it("works from non-interactive page content", () => {
    const h = mount();
    h.arm();
    key(h.get("text"), 1000);
    key(h.get("text"), 3000, { key: "Enter" });
    expect(h.onStopped).toHaveBeenCalledWith(2000, "pt_r1");
  });

  it("a key on the focused seal counts once, not twice", () => {
    const h = mount();
    h.arm();
    key(h.get("seal"), 1000);
    expect(h.api.current!.state.phase).toBe("running");
    key(h.get("seal"), 2000);
    expect(h.api.current!.state.phase).toBe("stopped");
    expect(h.onStopped).toHaveBeenCalledTimes(1);
    expect(h.onStopped).toHaveBeenCalledWith(1000, "pt_r1");
  });

  it.each(["input", "textarea", "editable", "button", "link"])("ignores keys aimed at %s", (id) => {
    const h = mount();
    h.arm();
    const e = key(h.get(id), 1000);
    expect(e.defaultPrevented).toBe(false);
    key(h.get(id), 1000, { key: "Enter" });
    expect(h.api.current!.state.phase).toBe("armed");
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }])("leaves modifier chords alone: %o", (mods) => {
    const h = mount();
    h.arm();
    const e = key(document.body, 1000, mods);
    expect(e.defaultPrevented).toBe(false);
    expect(h.api.current!.state.phase).toBe("armed");
  });

  it("ignores key repeat but still stops the page scrolling", () => {
    const h = mount();
    h.arm();
    key(document.body, 1000);
    const held = key(document.body, 1600, { repeat: true });
    expect(held.defaultPrevented).toBe(true);
    expect(h.api.current!.state.phase).toBe("running");
  });

  it("mixed controls: pointer starts, key stops; a key within 50 ms of the pointer is the same press", () => {
    const h = mount();
    h.arm();
    // jsdom has no PointerEvent: a MouseEvent carrying isPrimary is what React reads.
    const down = stamp(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }), 1000);
    Object.defineProperty(down, "isPrimary", { value: true });
    fireEvent(h.get("seal"), down);
    expect(h.api.current!.state.phase).toBe("running");
    const t0 = 1000;
    key(document.body, t0 + 20); // same physical press
    expect(h.api.current!.state.phase).toBe("running");
    key(document.body, t0 + 5000, { key: "Enter" });
    expect(h.onStopped).toHaveBeenCalledTimes(1);
    expect(h.onStopped.mock.calls[0][0]).toBe(5000);
  });

  it("is not listening outside armed/running, after unmount, or when off", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const h = mount();
    const keyListeners = () => add.mock.calls.filter((c) => c[0] === "keydown").length - remove.mock.calls.filter((c) => c[0] === "keydown").length;
    expect(keyListeners()).toBe(0); // idle
    h.arm();
    expect(keyListeners()).toBe(1);
    key(document.body, 1000);
    key(document.body, 2000);
    expect(h.api.current!.state.phase).toBe("stopped");
    expect(keyListeners()).toBe(0); // revealed / submitting: nothing listens
    const e = key(document.body, 3000);
    expect(e.defaultPrevented).toBe(false); // Space scrolls normally again
    h.arm("pt_r2");
    expect(keyListeners()).toBe(1);
    h.view.unmount();
    expect(keyListeners()).toBe(0);
    add.mockRestore();
    remove.mockRestore();

    const off = mount(false);
    off.arm();
    key(document.body, 1000);
    expect(off.api.current!.state.phase).toBe("armed");
  });

  it("one stop per round: further keys after the stop do nothing", () => {
    const h = mount();
    h.arm();
    key(document.body, 1000);
    key(document.body, 2000);
    key(document.body, 3000);
    key(document.body, 4000, { key: "Enter" });
    expect(h.onStopped).toHaveBeenCalledTimes(1);
  });

  it("documentKeyIsForTimer refuses already-handled and composing keys", () => {
    const handled = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    handled.preventDefault();
    expect(documentKeyIsForTimer(handled)).toBe(false);
    expect(documentKeyIsForTimer(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }))).toBe(false);
    expect(documentKeyIsForTimer(new KeyboardEvent("keydown", { key: "a" }))).toBe(false);
    expect(documentKeyIsForTimer(new KeyboardEvent("keydown", { key: "Enter" }))).toBe(true);
  });
});
