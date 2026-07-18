import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Controllable fake client (hoisted so the vi.mock factory can see it).
const h = vi.hoisted(() => {
  class FakeApiError extends Error {
    kind: string; status: number; code: string | null;
    constructor(code: string) { super(code); this.kind = "backend"; this.status = 403; this.code = code; }
  }
  const state = {
    status: "not_queued", matchId: null as string | null,
    joinError: null as unknown, statusError: null as unknown,
  };
  const snap = () => ({
    schemaVersion: "ranked_duel.queue_status.v1", serverTime: "t",
    status: state.status, matchId: state.matchId, queueVersion: 1, classId: "tank", enqueuedAt: "t",
  });
  return { FakeApiError, state, snap };
});
const state = h.state;
const FakeApiError = h.FakeApiError;

vi.mock("@/lib/ranked-public/client", () => ({
  RankedApiError: h.FakeApiError,
  isAborted: (e: unknown) => (e as { name?: string })?.name === "AbortError",
  isFatal: () => false,
  isRateLimited: () => false,
  getQueueStatus: vi.fn(async () => { if (h.state.statusError) throw h.state.statusError; return h.snap(); }),
  joinQueue: vi.fn(async () => { if (h.state.joinError) throw h.state.joinError; return h.snap(); }),
  cancelQueue: vi.fn(async () => { h.state.status = "cancelled"; return h.snap(); }),
}));

import { useRankedQueue } from "./useRankedQueue";

beforeEach(() => {
  vi.useFakeTimers();
  state.status = "not_queued"; state.matchId = null; state.joinError = null; state.statusError = null;
});
afterEach(() => vi.useRealTimers());

const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(10); }); };

describe("useRankedQueue", () => {
  it("recovers to class selection when not queued", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("selecting_class");
  });

  it("joins to waiting then transitions to matched when a match id appears", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    act(() => result.current.setSelectedClass("mage"));
    state.status = "waiting";  // backend accepts the join and reports waiting
    act(() => result.current.join());
    await flush();
    expect(result.current.state).toBe("waiting");
    // backend now reports matched; the next poll transitions.
    state.status = "matched"; state.matchId = "m1";
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("m1");
  });

  it("restores an assigned match on mount (refresh recovery)", async () => {
    state.status = "matched"; state.matchId = "m1";
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("m1");
  });

  it("cancel returns to class selection", async () => {
    state.status = "waiting";
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("waiting");
    act(() => result.current.cancel());
    await flush();
    expect(result.current.state).toBe("selecting_class");
  });

  it("an ineligible account becomes unavailable and stops polling", async () => {
    state.statusError = new FakeApiError("RANKED_QUEUE_NOT_ELIGIBLE");
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("unavailable");
    expect(result.current.unavailableReason).toContain("RANKED_QUEUE_NOT_ELIGIBLE");
  });
});
