import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRankedAvailability } from "./useRankedAvailability";

afterEach(() => vi.unstubAllGlobals());

describe("useRankedAvailability", () => {
  it("is closed while loading, then adopts the server decision", async () => {
    let release!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const { result } = renderHook(() => useRankedAvailability());
    expect(result.current.open).toBe(false);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => release(new Response(JSON.stringify({
        schema_version: "ranked_duel.availability.v1",
        projection_type: "ranked_availability",
        server_time: "2026-09-21T12:00:00+00:00",
        payload: { open: true, state: "open", reason: "launch", next_open_at: null, closes_at: null },
      }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await waitFor(() => expect(result.current.open).toBe(true));
  });

  it("fails closed on network or contract failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { result } = renderHook(() => useRankedAvailability());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.open).toBe(false);
    expect(result.current.reason).toBe("unavailable");
  });
});
