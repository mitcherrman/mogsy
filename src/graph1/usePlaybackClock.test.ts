/**
 * Playback-clock tests with a controlled rAF: time advances by callback
 * timestamp deltas (refresh-rate independent), clamps resume steps (hidden
 * tab policy: suspended wall time is not counted), and stops at the end.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlaybackClock } from "./usePlaybackClock";

type RafCb = (ts: number) => void;

describe("usePlaybackClock", () => {
  let queue: Map<number, RafCb>;
  let nextId: number;

  const fire = (ts: number) => {
    const cbs = Array.from(queue.values());
    queue.clear();
    cbs.forEach((cb) => act(() => cb(ts)));
  };

  beforeEach(() => {
    queue = new Map();
    nextId = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: RafCb) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("advances by timestamp delta, not per-callback count", () => {
    const { result } = renderHook(() => usePlaybackClock(10_000));
    act(() => result.current.play());
    fire(1000); // first tick only records the timestamp
    fire(1016.7); // 60 Hz frame
    expect(result.current.timeMs).toBeCloseTo(16.7, 1);
    fire(1024.7); // 120 Hz spacing: HALF the step, not "one more tick"
    expect(result.current.timeMs).toBeCloseTo(24.7, 1);
  });

  it("clamps a long suspension gap instead of catching up", () => {
    const { result } = renderHook(() => usePlaybackClock(10_000));
    act(() => result.current.play());
    fire(1000);
    fire(6000); // 5s hidden-tab gap -> counts as at most 100ms
    expect(result.current.timeMs).toBe(100);
  });

  it("speed scales the delta without touching stored time", () => {
    const { result } = renderHook(() => usePlaybackClock(10_000));
    act(() => result.current.setSpeed(4));
    act(() => result.current.play());
    fire(1000);
    fire(1010);
    expect(result.current.timeMs).toBeCloseTo(40, 5);
  });

  it("stops exactly at the end and restart returns to zero", () => {
    const { result } = renderHook(() => usePlaybackClock(50));
    act(() => result.current.play());
    fire(1000);
    fire(1090); // 90ms > 50ms total
    expect(result.current.timeMs).toBe(50);
    expect(result.current.playing).toBe(false);
    act(() => result.current.restart());
    expect(result.current.timeMs).toBe(0);
    expect(result.current.playing).toBe(true);
  });

  it("seek clamps into range and does not resume playback", () => {
    const { result } = renderHook(() => usePlaybackClock(1000));
    act(() => result.current.seekTimeMs(5000));
    expect(result.current.timeMs).toBe(1000);
    expect(result.current.playing).toBe(false);
    act(() => result.current.seekTimeMs(-50));
    expect(result.current.timeMs).toBe(0);
  });
});
