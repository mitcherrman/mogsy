import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Controllable fake client (hoisted so the vi.mock factory can see it).
const h = vi.hoisted(() => {
  class FakeApiError extends Error {
    kind: string; status: number; code: string | null;
    constructor(code: string, status = 403) {
      super(code); this.kind = "backend"; this.status = status; this.code = code;
    }
  }
  const state = {
    status: "not_queued", matchId: null as string | null,
    joinError: null as unknown, statusError: null as unknown,
    cancelError: null as unknown,
    /** What `/api/ranked/active-match` answers. */
    activeMatch: null as { matchId: string; isBotMatch: boolean } | null,
  };
  const snap = () => ({
    schemaVersion: "ranked_duel.queue_status.v1", serverTime: "t",
    status: state.status, matchId: state.matchId, queueVersion: 1, classId: "tank",
    role: null, enqueuedAt: "t",
  });
  return { FakeApiError, state, snap };
});
const state = h.state;
const FakeApiError = h.FakeApiError;

const getActiveMatch = vi.fn(async () => h.state.activeMatch);
const cancelQueue = vi.fn(async () => {
  if (h.state.cancelError) throw h.state.cancelError;
  h.state.status = "cancelled";
  return h.snap();
});
const joinQueue = vi.fn(async () => {
  if (h.state.joinError) throw h.state.joinError;
  return h.snap();
});

vi.mock("@/lib/ranked-public/client", () => ({
  RankedApiError: h.FakeApiError,
  isAborted: (e: unknown) => (e as { name?: string })?.name === "AbortError",
  isFatal: () => false,
  isRateLimited: () => false,
  getQueueStatus: vi.fn(async () => { if (h.state.statusError) throw h.state.statusError; return h.snap(); }),
  joinQueue: (...a: unknown[]) => joinQueue(...(a as [])),
  cancelQueue: (...a: unknown[]) => cancelQueue(...(a as [])),
  getActiveMatch: (...a: unknown[]) => getActiveMatch(...(a as [])),
}));

import { useRankedQueue } from "./useRankedQueue";

beforeEach(() => {
  vi.useFakeTimers();
  state.status = "not_queued"; state.matchId = null;
  state.joinError = null; state.statusError = null; state.cancelError = null;
  state.activeMatch = null;
  getActiveMatch.mockClear(); cancelQueue.mockClear(); joinQueue.mockClear();
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

  it("an ineligible account becomes unavailable with player-facing copy", async () => {
    state.statusError = new FakeApiError("RANKED_QUEUE_NOT_ELIGIBLE");
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("unavailable");
    // Friendly copy, not the raw backend/code text.
    expect(result.current.unavailableReason).toContain("full (non-guest) account");
    expect(result.current.unavailableReason).not.toContain("RANKED_QUEUE_NOT_ELIGIBLE");
  });

  it("question-pool unavailability explains what happened and what to do", async () => {
    state.statusError = new FakeApiError("RANKED_QUESTION_POOL_UNAVAILABLE");
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("unavailable");
    expect(result.current.unavailableReason).toContain("question pool");
    expect(result.current.unavailableReason).toContain("Try again later");
  });
});

/**
 * PLAY1 — THE CANCEL-VS-PAIRING RACE.
 *
 * The backend claims both entries before it writes the match rows, and
 * refuses to cancel a claimed entry with `RANKED_CANNOT_CANCEL` (409). The
 * old controller treated that as an ordinary action failure: it dropped to
 * `selecting_class` and stopped polling, stranding a player who had in fact
 * just been given a match. These pin the recovery.
 */
describe("useRankedQueue — cancel racing the pairing pass", () => {
  async function queued() {
    state.status = "waiting";
    const hook = renderHook(() => useRankedQueue());
    await flush();
    expect(hook.result.current.state).toBe("waiting");
    return hook;
  }

  it("a refused cancel enters the match the server had already made", async () => {
    const { result } = await queued();
    state.cancelError = new FakeApiError("RANKED_CANNOT_CANCEL", 409);
    // The pairing pass finished between the poll and the cancel.
    state.activeMatch = { matchId: "rkm_raced", isBotMatch: false };

    act(() => result.current.cancel());
    await flush();

    expect(getActiveMatch).toHaveBeenCalled();
    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("rkm_raced");
    // Emphatically NOT the old behaviour.
    expect(result.current.state).not.toBe("selecting_class");
  });

  it("a refused cancel keeps polling when the match rows are not written yet", async () => {
    const { result } = await queued();
    state.cancelError = new FakeApiError("RANKED_CANNOT_CANCEL", 409);
    state.activeMatch = null;          // claimed, but the match does not exist yet
    state.status = "claimed";

    act(() => result.current.cancel());
    await flush();

    // Held in the pairing window rather than returned to the lobby.
    expect(result.current.state).toBe("pairing");
    expect(result.current.error).toContain("Pairing has already started");

    // The pairing pass lands; the next poll picks the match up.
    state.status = "matched"; state.matchId = "rkm_late";
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("rkm_late");
  });

  it("the pairing window is not cancellable, and is not asked to be", async () => {
    const { result } = await queued();
    state.cancelError = new FakeApiError("RANKED_CANNOT_CANCEL", 409);
    state.status = "claimed";

    act(() => result.current.cancel());
    await flush();
    expect(result.current.state).toBe("pairing");
    expect(result.current.canCancel).toBe(false);

    cancelQueue.mockClear();
    act(() => result.current.cancel());
    await flush();
    // A second cancel during pairing is not even sent: it could only be
    // refused, and the UI hides the control for the same reason.
    expect(cancelQueue).not.toHaveBeenCalled();
  });

  /**
   * The same window, reached by an ordinary poll rather than by a cancel.
   * `claimed` used to fall into the not_queued/cancelled/expired bucket, so a
   * poll that happened to land mid-pairing threw the player out of the queue
   * view and stopped the loop.
   */
  it("a `claimed` status is the pairing window, not an exit from the queue", async () => {
    state.status = "claimed";
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("pairing");

    state.status = "matched"; state.matchId = "rkm_polled";
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("rkm_polled");
  });

  it("during pairing it also asks the account-bound endpoint for the match", async () => {
    state.status = "claimed";
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("pairing");

    // The queue row is still `claimed` but the match rows exist. Whichever
    // settles last must not hold up the handoff.
    state.activeMatch = { matchId: "rkm_from_active", isBotMatch: false };
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("rkm_from_active");
  });

  it("a join refused because a match already exists recovers that match", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.joinError = new FakeApiError("RANKED_ACTIVE_MATCH_EXISTS", 409);
    state.activeMatch = { matchId: "rkm_existing", isBotMatch: true };

    act(() => result.current.joinWithoutClass());
    await flush();

    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("rkm_existing");
  });
});

describe("useRankedQueue — duplicate join protection", () => {
  it("two joins in the same frame send exactly one request", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.status = "waiting";
    act(() => {
      result.current.joinWithoutClass();
      result.current.joinWithoutClass();
    });
    await flush();
    expect(joinQueue).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("waiting");
  });

  it("joining again while already queued is not sent", async () => {
    state.status = "waiting";
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    joinQueue.mockClear();
    act(() => result.current.joinWithoutClass());
    await flush();
    expect(joinQueue).not.toHaveBeenCalled();
  });

  it("cancel is only offered — and only sent — while actually waiting", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    expect(result.current.state).toBe("selecting_class");
    expect(result.current.canCancel).toBe(false);
    act(() => result.current.cancel());
    await flush();
    expect(cancelQueue).not.toHaveBeenCalled();
  });
});
