/**
 * RE1 Phase 3B — the Ranked progression controller.
 *
 * One read, no local derivation, and every failure degrades to "nothing to
 * show" rather than blocking the Ranked queue.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  class FakeApiError extends Error {
    kind: string; status: number; code: string | null;
    constructor(kind: string, status: number, message: string, code: string | null = null) {
      super(message);
      this.kind = kind; this.status = status; this.code = code;
    }
  }
  return { FakeApiError, getRankedProgression: vi.fn() };
});

vi.mock("@/lib/ranked-public/client", () => ({
  getRankedProgression: h.getRankedProgression,
  isAborted: () => false,
  RankedApiError: h.FakeApiError,
}));

import { useRankedProgression } from "./useRankedProgression";

const VIEW = {
  rating: 1200, tier: "gold" as const, nextTier: "diamond" as const,
  nextTierRating: 1300, ratingToNext: 100, progressPercent: 20,
  rated: true, matchesRated: 8,
};

// Each test sets the implementation outright rather than clearing the mock
// between tests: vitest attributes a cleared mock's already-rejected result
// to the test as a failure, even though the hook caught it.

it("adopts the server's numbers verbatim", async () => {
  h.getRankedProgression.mockResolvedValue(VIEW);
  const { result } = renderHook(() => useRankedProgression());
  await waitFor(() => expect(result.current.loadState).toBe("ready"));
  expect(result.current.progression).toEqual(VIEW);
});

describe("degradation", () => {
  it.each([404, 405, 401, 403, 429, 500])(
    "reports unavailable and no standing on %i", async (status) => {
      h.getRankedProgression.mockRejectedValue(
        new h.FakeApiError("backend", status, "nope"));
      const { result } = renderHook(() => useRankedProgression());
      await waitFor(() => expect(result.current.loadState).toBe("unavailable"));
      expect(result.current.progression).toBeNull();
    });

  it("reports unavailable on a malformed response", async () => {
    h.getRankedProgression.mockRejectedValue(new Error("contract violation"));
    const { result } = renderHook(() => useRankedProgression());
    await waitFor(() => expect(result.current.loadState).toBe("unavailable"));
    expect(result.current.progression).toBeNull();
  });
});
