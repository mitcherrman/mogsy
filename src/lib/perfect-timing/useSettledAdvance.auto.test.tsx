/**
 * PT5.3 — a settled screen moving on by itself: the dwell starts only once the
 * screen has settled, never runs while held or while the page is hidden
 * (hidden stops it; visible starts it over), and the dwell, a key and a click
 * together advance exactly once.
 */
import { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSettledAdvance, type AdvanceSource } from "./useSettledAdvance";

const onAdvance = vi.fn<(source?: AdvanceSource) => void>();
let autoPass = 0;

function Screen({ autoAdvanceMs = 2_500, paused = false }: { autoAdvanceMs?: number | null; paused?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const s = useSettledAdvance({ buttonRef: ref, settleMs: 1_700, onAdvance, autoAdvanceMs, paused });
  autoPass = s.autoPass;
  return <button ref={ref} type="button" data-testid="next" onClick={(e) => s.advanceFromClick(e.detail)}>Next</button>;
}
const setVisibility = (v: DocumentVisibilityState) => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  onAdvance.mockReset();
  setVisibility("visible");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("PT5.3 useSettledAdvance — automatic progression", () => {
  it("waits for the screen to settle, then for the whole dwell, then advances once with source 'auto'", () => {
    render(<Screen />);
    advance(1_699);
    expect(autoPass).toBe(0);
    advance(1);
    expect(autoPass).toBeGreaterThan(0);
    advance(2_499);
    expect(onAdvance).not.toHaveBeenCalled();
    advance(1);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance).toHaveBeenCalledWith("auto");
    expect(autoPass).toBe(0);
    advance(10_000);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("without a dwell nothing moves on by itself (the PT5.1 behaviour)", () => {
    render(<Screen autoAdvanceMs={null} />);
    advance(30_000);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(autoPass).toBe(0);
  });

  it("held: no dwell runs; released: the dwell starts over in full", () => {
    const { rerender } = render(<Screen paused />);
    advance(10_000);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(autoPass).toBe(0);
    rerender(<Screen paused={false} />);
    advance(2_499);
    expect(onAdvance).not.toHaveBeenCalled();
    advance(1);
    expect(onAdvance).toHaveBeenCalledWith("auto");
  });

  it("a hold in the middle of the dwell stops it before it fires", () => {
    const { rerender } = render(<Screen />);
    advance(1_700);
    advance(2_400);
    rerender(<Screen paused />);
    advance(5_000);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("a hidden page stops the dwell; visible again starts a fresh, full dwell", () => {
    render(<Screen />);
    advance(1_700);
    advance(2_000);
    const first = autoPass;
    setVisibility("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(autoPass).toBe(0);
    advance(10_000);
    expect(onAdvance).not.toHaveBeenCalled();
    setVisibility("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(autoPass).toBeGreaterThan(first);
    advance(2_499);
    expect(onAdvance).not.toHaveBeenCalled();
    advance(1);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("a click, a key and the dwell racing advance exactly once", () => {
    render(<Screen />);
    advance(1_700);
    advance(2_499);
    fireEvent.click(screen.getByTestId("next"), { detail: 1 });
    fireEvent.keyDown(document, { key: " " });
    advance(10);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance).toHaveBeenCalledWith(undefined);
  });

  it("a key after the dwell fired does nothing more", () => {
    render(<Screen />);
    advance(1_700);
    advance(2_500);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance).toHaveBeenCalledWith("auto");
  });

  it("unmount cancels the dwell", () => {
    const { unmount } = render(<Screen />);
    advance(1_700);
    advance(1_000);
    unmount();
    advance(5_000);
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
