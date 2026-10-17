/**
 * MISC-W2C (F04) — the discoveries loader is keyed on the match it was asked
 * about. A Daily result screen is reused from one stage to the next, so the
 * loader sees the matchId change under a live component: it must never hand a
 * previous match's answer to the new one, not even for one render.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import backend from "@/lib/ranked-public/__fixtures__/dailyMatchDiscoveries.backend.json";
import { useMatchDiscoveries } from "./useMatchDiscoveries";

const body = (matchId: string) => ({
  ...backend.earned, match_id: matchId,
  payload: { ...backend.earned.payload, match_id: matchId },
});

let release: Record<string, (r: Response) => void>;
afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch() {
  release = {};
  vi.stubGlobal("fetch", vi.fn((url: string) => new Promise<Response>((resolve) => {
    const id = /matches\/([^/]+)\/discoveries/.exec(String(url))![1];
    release[id] = resolve;
  })));
}
const ok = (matchId: string) => new Response(JSON.stringify(body(matchId)), {
  status: 200, headers: { "Content-Type": "application/json" },
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("useMatchDiscoveries", () => {
  it("never shows match A's answer under match B", async () => {
    stubFetch();
    const { result, rerender } = renderHook(
      ({ id }) => useMatchDiscoveries(id, true), { initialProps: { id: "rkb_a" } });
    await flush();
    await act(async () => { release.rkb_a(ok("rkb_a")); });
    await flush();
    expect(result.current.view?.matchId).toBe("rkb_a");

    rerender({ id: "rkb_b" });
    // The very render after the change: nothing, not the previous match's cards.
    expect(result.current.view).toBeNull();
    await flush();
    expect(result.current.view).toBeNull(); // B's read is still in flight
    await act(async () => { release.rkb_b(ok("rkb_b")); });
    await flush();
    expect(result.current.view?.matchId).toBe("rkb_b");
  });

  it("drops an answer that arrives for a match it is no longer asking about", async () => {
    stubFetch();
    const { result, rerender } = renderHook(
      ({ id }) => useMatchDiscoveries(id, true), { initialProps: { id: "rkb_a" } });
    await flush();
    rerender({ id: "rkb_b" });
    await flush();
    await act(async () => { release.rkb_a(ok("rkb_a")); }); // late, for the old match
    await flush();
    expect(result.current.view).toBeNull();
  });

  it("stays silent and idle while disabled", async () => {
    stubFetch();
    const { result } = renderHook(() => useMatchDiscoveries("rkb_a", false));
    await flush();
    expect(result.current).toEqual({ view: null, loading: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
