/**
 * PT5.2 test helper: a hand-cranked animation-frame clock. `performance.now()`
 * and `Date.now()` read one controllable `now`; `requestAnimationFrame` queues
 * callbacks that run only when a test calls `frame(at)`. Lets a test say "the
 * browser painted at 1,005 ms" and nothing else.
 */
import { act } from "@testing-library/react";
import { vi } from "vitest";

export interface FakeFrames {
  /** The current reading of both clocks. */
  readonly now: number;
  /** Callbacks waiting for the next frame. */
  pending(): number;
  /** Move both clocks to `at` without painting a frame. */
  setNow(at: number): void;
  /** Move both clocks to `at` and run every queued frame callback once. */
  frame(at: number): void;
  /** Paint frames every `stepMs` from the current time up to `to` (inclusive of the last step). */
  run(to: number, stepMs?: number): void;
  restore(): void;
}

export function installFakeFrames(start = 1_000): FakeFrames {
  let now = start;
  let nextId = 1;
  const queue = new Map<number, FrameRequestCallback>();
  const perf = vi.spyOn(performance, "now").mockImplementation(() => now);
  const wallBase = Date.UTC(2026, 9, 19, 12, 0, 0);
  const date = vi.spyOn(Date, "now").mockImplementation(() => wallBase + now);
  const raf = vi.fn((cb: FrameRequestCallback) => { const id = nextId++; queue.set(id, cb); return id; });
  const caf = vi.fn((id: number) => { queue.delete(id); });
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);

  const api: FakeFrames = {
    get now() { return now; },
    pending: () => queue.size,
    setNow(at) { now = at; },
    frame(at) {
      now = at;
      const due = [...queue.values()];
      queue.clear();
      act(() => { for (const cb of due) cb(at); });
    },
    run(to, stepMs = 16.7) {
      for (let t = now + stepMs; t <= to + 1e-9; t += stepMs) api.frame(t);
    },
    restore() {
      perf.mockRestore();
      date.mockRestore();
      vi.unstubAllGlobals();
    },
  };
  return api;
}
