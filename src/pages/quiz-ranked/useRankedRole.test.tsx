/**
 * R1 role controller: the backend stays the authority, and a backend without
 * role identity degrades to the legacy path instead of blocking the player.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  class FakeApiError extends Error {
    kind: string; status: number; code: string | null;
    constructor(kind: string, status: number, message: string,
                code: string | null = null) {
      super(message);
      this.kind = kind; this.status = status; this.code = code;
    }
  }
  return {
    FakeApiError,
    getRankedRole: vi.fn(),
    setRankedRole: vi.fn(),
  };
});
const FakeApiError = h.FakeApiError;

vi.mock("@/lib/ranked-public/client", () => ({
  getRankedRole: h.getRankedRole,
  setRankedRole: h.setRankedRole,
  isAborted: () => false,
  RankedApiError: h.FakeApiError,
}));

import { useRankedRole } from "./useRankedRole";

beforeEach(() => {
  h.getRankedRole.mockReset();
  h.setRankedRole.mockReset();
});
afterEach(() => vi.clearAllMocks());

const snapshot = (role: string | null) =>
  ({ role, selectedAt: null, updatedAt: null });

describe("reading the role", () => {
  it("reports the account's chosen role", async () => {
    h.getRankedRole.mockResolvedValue(snapshot("jungle"));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(result.current.role).toBe("jungle");
  });

  it("treats 'never chosen' as a normal ready state, not an error", async () => {
    h.getRankedRole.mockResolvedValue(snapshot(null));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(result.current.role).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("VERSION SKEW: a 404 means 'no role identity here', quietly", async () => {
    h.getRankedRole.mockRejectedValue(new FakeApiError("backend", 404, "not found"));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.loadState).toBe("unavailable"));
    // No player-facing error: the caller simply keeps the legacy path.
    expect(result.current.error).toBeNull();
  });

  it("a signed-out caller is unavailable, not broken", async () => {
    h.getRankedRole.mockRejectedValue(
      new FakeApiError("backend", 401, "sign in", "AUTH_REQUIRED"));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.loadState).toBe("unavailable"));
    expect(result.current.error).toBeNull();
  });

  it("a genuine failure still surfaces its message", async () => {
    h.getRankedRole.mockRejectedValue(
      new FakeApiError("network", 0, "could not reach the ranked service"));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.loadState).toBe("unavailable"));
    expect(result.current.error).toContain("could not reach");
  });
});

describe("writing the role", () => {
  beforeEach(() => h.getRankedRole.mockResolvedValue(snapshot(null)));

  it("adopts the SERVER's answer, never the optimistic value", async () => {
    h.setRankedRole.mockResolvedValue(snapshot("support"));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    await act(async () => {
      expect(await result.current.selectRole("mid")).toBe(true);
    });
    expect(h.setRankedRole).toHaveBeenCalledWith("mid");
    expect(result.current.role).toBe("support");
  });

  it("leaves the role UNCHANGED when the backend rejects the change", async () => {
    h.getRankedRole.mockResolvedValue(snapshot("top"));
    h.setRankedRole.mockRejectedValue(new FakeApiError(
      "backend", 409, "finish your active match", "RANKED_ACTIVE_MATCH_EXISTS"));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.role).toBe("top"));
    await act(async () => {
      expect(await result.current.selectRole("adc")).toBe(false);
    });
    expect(result.current.role).toBe("top");
    expect(result.current.error).toBe(
      "Finish your active match before changing your role.");
  });

  it("explains a queued conflict in the player's terms", async () => {
    h.setRankedRole.mockRejectedValue(new FakeApiError(
      "backend", 409, "leave the queue", "RANKED_ALREADY_QUEUED"));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    await act(async () => { await result.current.selectRole("top"); });
    expect(result.current.error).toBe("Leave the queue before changing your role.");
  });

  it("is double-activation safe", async () => {
    let release: (v: unknown) => void = () => {};
    h.setRankedRole.mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = renderHook(() => useRankedRole());
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    await act(async () => {
      const first = result.current.selectRole("top");
      const second = result.current.selectRole("mid");
      expect(await second).toBe(false);
      release(snapshot("top"));
      await first;
    });
    expect(h.setRankedRole).toHaveBeenCalledTimes(1);
  });
});
