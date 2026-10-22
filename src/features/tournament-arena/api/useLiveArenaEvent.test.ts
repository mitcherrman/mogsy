import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const reads: Array<() => Promise<unknown>> = [];
vi.mock("./arenaApi", async (orig) => {
  const real = await orig<typeof import("./arenaApi")>();
  return {
    ...real,
    getArenaEvent: vi.fn(() => (reads.shift() ?? (() => Promise.resolve({ unchanged: true, revision: 0 })))()),
    adminGetArenaEvent: vi.fn(() => Promise.resolve({ unchanged: true, revision: 0 })),
  };
});

import { ArenaApiError, getArenaEvent } from "./arenaApi";
import { serverEvent } from "./serverFixtures";
import { arenaPollDelayMs, useLiveArenaEvent } from "./useLiveArenaEvent";

const EID = serverEvent().event_id;

afterEach(() => { reads.length = 0; vi.clearAllMocks(); });

describe("arenaPollDelayMs (audit §5 cadence)", () => {
  it("polls fast while you wait on your opponent's ready press", () => {
    expect(arenaPollDelayMs(serverEvent({}, { ready_profile_ids: ["prof-a"] }))).toBe(2_000);
  });
  it("polls every 5 s with a node of yours ready or live", () => {
    expect(arenaPollDelayMs(serverEvent())).toBe(5_000);
    expect(arenaPollDelayMs(serverEvent({}, { status: "live", current_match_id: "arm_x" }))).toBe(5_000);
  });
  it("idles at 15 s as a spectator, slower once the event is over", () => {
    expect(arenaPollDelayMs(serverEvent({ viewer_profile_id: "prof-z" }))).toBe(15_000);
    expect(arenaPollDelayMs(serverEvent({ status: "complete" }))).toBe(30_000);
  });
  it("an organizer watching a live node polls at 5 s", () => {
    expect(arenaPollDelayMs(serverEvent({ viewer_profile_id: null }), { manage: true })).toBe(5_000);
  });
});

describe("useLiveArenaEvent", () => {
  it("never puts an older revision back on screen", async () => {
    const newer = serverEvent({ revision: 9 });
    reads.push(() => Promise.resolve({ unchanged: false, event: newer }));
    const { result } = renderHook(() => useLiveArenaEvent(EID));
    await waitFor(() => expect(result.current.event?.revision).toBe(9));
    act(() => result.current.apply(serverEvent({ revision: 7, title: "stale" })));
    expect(result.current.event?.title).toBe("Owner duel");
    act(() => result.current.apply(serverEvent({ revision: 10, title: "fresh" })));
    expect(result.current.event?.title).toBe("fresh");
  });

  it("drops an answer for a different event id", async () => {
    reads.push(() => Promise.resolve({ unchanged: false, event: serverEvent({ event_id: "aev_someone_else" }) }));
    const { result } = renderHook(() => useLiveArenaEvent(EID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.event).toBeNull();
  });

  it("stops polling on a terminal refusal and keeps the error", async () => {
    reads.push(() => Promise.reject(new ArenaApiError("backend", 404, "x", "ARENA_EVENT_NOT_FOUND")));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useLiveArenaEvent(EID));
      await waitFor(() => expect(result.current.error).toBeTruthy());
      const n = vi.mocked(getArenaEvent).mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(60_000); });
      expect(vi.mocked(getArenaEvent).mock.calls.length).toBe(n);
      expect(result.current.event).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
