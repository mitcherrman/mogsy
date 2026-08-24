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
    activeMatch: null as {
      matchId: string; isBotMatch: boolean; withinReconnectWindow?: boolean;
    } | null,
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

  it("a join refused because a match already exists OFFERS that match", async () => {
    // SUPERSEDED BEHAVIOUR, kept as the record of what changed. This used to
    // assert `matched` — the silent recovery. RG1 replaced it: Ranked no
    // longer walks a player into a duel they did not just create, because
    // nothing distinguished "your match is still running" from "here is a new
    // one", and a match frozen under a role the account had since changed then
    // read as a bug in the role. The match is still FOUND; entering it is now
    // the player's press.
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.joinError = new FakeApiError("RANKED_ACTIVE_MATCH_EXISTS", 409);
    state.activeMatch = { matchId: "rkm_existing", isBotMatch: true,
                          withinReconnectWindow: true };

    act(() => result.current.joinWithoutClass());
    await flush();

    expect(result.current.state).toBe("reconnect_required");
    expect(result.current.reconnectMatch?.matchId).toBe("rkm_existing");
    act(() => result.current.reconnect());
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

/**
 * The admin bot request adds NO state to this controller. The backend answers
 * the join as an entry that is already matched, which is a beat the machine
 * already had, so the handoff is the ordinary one.
 */
describe("the admin bot request", () => {
  it("passes the option straight through to the join, and nothing else", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();                       // mounts idle, as a real open does
    // The bot join's answer: an entry that is ALREADY matched.
    state.status = "matched"; state.matchId = "rkb_abc";
    act(() => result.current.joinWithoutClass({ matchWithBot: true }));
    await flush();
    expect(joinQueue).toHaveBeenCalledTimes(1);
    // (classId, signal, options) — the class is still null on the role path.
    const args = joinQueue.mock.calls[0] as unknown[];
    expect(args[0]).toBeNull();
    expect(args[2]).toEqual({ matchWithBot: true });
    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("rkb_abc");
  });

  it("sends no bot option on an ordinary join", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    act(() => result.current.joinWithoutClass());
    await flush();
    expect((joinQueue.mock.calls[0] as unknown[])[2]).toBeUndefined();
  });

  it("surfaces a refusal as an ordinary join error and stays out of the queue", async () => {
    state.joinError = new FakeApiError("RANKED_BOT_NOT_AUTHORIZED", 403);
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    act(() => result.current.joinWithoutClass({ matchWithBot: true }));
    await flush();
    expect(result.current.state).toBe("selecting_class");
    expect(result.current.matchId).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});

/**
 * RG1 — A RESUMED MATCH IS NOT A NEW ONE, and the controller has to say so.
 *
 * This is the reported "selected Top, arena said ADC" defect, at the layer
 * where the false belief is formed. There is no race: `PUT /api/ranked/role`
 * commits before the join is even sent, and the backend twin
 * (`test_rg1_role_end_to_end.py`) proves all five roles survive a back-to-back
 * write-then-create. What happens instead is that the join is REFUSED —
 * `RANKED_ACTIVE_MATCH_EXISTS`, because the account already had a live match —
 * and the client recovers into that older match without a word.
 *
 * Recovering is correct and stays. A participant's role freezes at creation
 * and is deliberately immutable, so the recovered match can carry a role the
 * account no longer prefers. Saying nothing about it is what is fixed here.
 */
/**
 * RG1 — A LIVE MATCH IS OFFERED, NOT ENTERED.
 *
 * The old behaviour was silent: a join answered `RANKED_ACTIVE_MATCH_EXISTS`
 * was recovered into whatever `getActiveMatch` returned, with nothing telling
 * the player they had been handed an existing duel rather than a new one.
 * That is right after a crash-reload and wrong for everything else — it is how
 * a match frozen under a role the account had since changed came to look like
 * a bug in the role.
 *
 * Ranked no longer resumes stale matches at all: an unexplained absence gets a
 * 45-second reconnect window and is forfeited past it, and the backend settles
 * an expired match before it can be discovered. So anything found here is
 * genuinely still live, and rejoining it is a press.
 */
describe("RG1 — a live match is surfaced for an explicit reconnect", () => {
  it("does NOT hand the player into an existing match on its own", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.joinError = new FakeApiError("RANKED_ACTIVE_MATCH_EXISTS", 409);
    state.activeMatch = { matchId: "rkm_live", isBotMatch: false,
                          withinReconnectWindow: true };

    act(() => result.current.joinWithoutClass({ matchWithBot: true }));
    await flush();

    // The decisive assertion: NOT `matched`. Nothing has entered the arena.
    expect(result.current.state).toBe("reconnect_required");
    expect(result.current.reconnectMatch).toEqual(
      { matchId: "rkm_live", isBotMatch: false });
  });

  it("enters only when the player presses Reconnect", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.joinError = new FakeApiError("RANKED_ACTIVE_MATCH_EXISTS", 409);
    state.activeMatch = { matchId: "rkm_live", isBotMatch: false,
                          withinReconnectWindow: true };
    act(() => result.current.joinWithoutClass());
    await flush();

    act(() => result.current.reconnect());
    await flush();
    // `matched` is the SAME handoff beat an ordinary pairing lands on, so
    // there is one way into the arena rather than a reconnect-specific second.
    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("rkm_live");
  });

  it("refuses to join again while a live match is being offered", async () => {
    // The window protects a player coming back. It must not become a way to
    // walk away from a duel by pressing Play a second time.
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.joinError = new FakeApiError("RANKED_ACTIVE_MATCH_EXISTS", 409);
    state.activeMatch = { matchId: "rkm_live", isBotMatch: false,
                          withinReconnectWindow: true };
    act(() => result.current.joinWithoutClass());
    await flush();
    joinQueue.mockClear();

    act(() => result.current.joinWithoutClass());
    await flush();
    expect(joinQueue).not.toHaveBeenCalled();
    expect(result.current.state).toBe("reconnect_required");
  });

  it("offers nothing when the match is past its reconnect window", async () => {
    // The backend settles an expired match before it can be discovered, so
    // this is belt and braces — but a client that offered a dead match would
    // be the old silent-resume bug wearing a button.
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.joinError = new FakeApiError("RANKED_ACTIVE_MATCH_EXISTS", 409);
    state.activeMatch = { matchId: "rkm_stale", isBotMatch: false,
                          withinReconnectWindow: false };
    act(() => result.current.joinWithoutClass());
    await flush();

    expect(result.current.state).not.toBe("reconnect_required");
    expect(result.current.reconnectMatch).toBeNull();
  });

  it("offers nothing when the match ended between the refusal and the look", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.joinError = new FakeApiError("RANKED_ACTIVE_MATCH_EXISTS", 409);
    state.activeMatch = null;
    act(() => result.current.joinWithoutClass());
    await flush();
    expect(result.current.reconnectMatch).toBeNull();
    expect(result.current.state).not.toBe("reconnect_required");
  });

  it("does NOT surface the cancel-vs-pairing race as a reconnect", async () => {
    // That recovery lands on the match the player just queued for, so it is a
    // new match by every meaning of the word and keeps its silent handoff.
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.status = "waiting";
    act(() => result.current.joinWithoutClass());
    await flush();

    state.cancelError = new FakeApiError("RANKED_CANNOT_CANCEL", 409);
    state.activeMatch = { matchId: "rkm_paired", isBotMatch: false,
                          withinReconnectWindow: true };
    act(() => result.current.cancel());
    await flush();

    expect(result.current.state).toBe("matched");
    expect(result.current.matchId).toBe("rkm_paired");
    expect(result.current.reconnectMatch).toBeNull();
  });

  it("does not mark an ordinary new match as a reconnect", async () => {
    const { result } = renderHook(() => useRankedQueue());
    await flush();
    state.status = "matched";
    state.matchId = "rkb_new";
    act(() => result.current.joinWithoutClass({ matchWithBot: true }));
    await flush();
    expect(result.current.state).toBe("matched");
    expect(result.current.reconnectMatch).toBeNull();
  });
});
