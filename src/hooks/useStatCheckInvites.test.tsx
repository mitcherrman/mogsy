import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatCheckApiError } from "@/lib/stat-check-online/client";
import { useStatCheckInvites } from "./useStatCheckInvites";

const authUser = vi.hoisted(() => ({ current: { id: "auth-uid" } as { id: string } | null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authUser.current }) }));

const profiles = vi.hoisted(() => ({ fetchLeagueProfiles: vi.fn() }));
vi.mock("@/lib/league-profiles", () => profiles);

const P_SENDER = "11111111-1111-4111-8111-111111111111";

const invite = (token = "tok_a") => ({
  inviteToken: token,
  senderProfileId: P_SENDER,
  createdAt: "2026-08-02T12:00:00+00:00",
  expiresAt: "2026-08-02T12:15:00+00:00",
});

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listInvites: vi.fn().mockResolvedValue({ invites: [invite()], serverTime: "t" }),
    acceptInvite: vi.fn().mockResolvedValue({
      roomId: "scr_1",
      inviteCode: "ABCD2345",
      seat: "p2",
      joinPath: "/quiz/stat-check/room/ABCD2345",
    }),
    declineInvite: vi.fn().mockResolvedValue({ inviteToken: "tok_a", status: "declined" }),
    ...overrides,
  } as never;
}

beforeEach(() => {
  authUser.current = { id: "auth-uid" };
  profiles.fetchLeagueProfiles.mockResolvedValue([
    { id: P_SENDER, display_name: "Rivals", avatar_url: "https://img/a.png" },
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useStatCheckInvites", () => {
  it("loads invites and resolves sender names through get_league_profiles", async () => {
    const api = makeApi();
    const { result } = renderHook(() => useStatCheckInvites(api));
    await waitFor(() => expect(result.current.invites).toHaveLength(1));
    expect(result.current.invites[0].displayName).toBe("Rivals");
    expect(result.current.invites[0].avatarUrl).toBe("https://img/a.png");
    expect(profiles.fetchLeagueProfiles).toHaveBeenCalledWith([P_SENDER]);
  });

  it("falls back to 'Someone' when the profile is not visible", async () => {
    profiles.fetchLeagueProfiles.mockResolvedValue([]);
    const { result } = renderHook(() => useStatCheckInvites(makeApi()));
    await waitFor(() => expect(result.current.invites).toHaveLength(1));
    expect(result.current.invites[0].displayName).toBe("Someone");
  });

  it("does not poll when signed out", async () => {
    authUser.current = null;
    const api = makeApi();
    renderHook(() => useStatCheckInvites(api));
    await new Promise((r) => setTimeout(r, 10));
    expect((api as never as { listInvites: { mock: { calls: unknown[] } } }).listInvites.mock.calls)
      .toHaveLength(0);
  });

  it("latches disabled on a 404 (feature flag off) and stops polling", async () => {
    const api = makeApi({
      listInvites: vi.fn().mockRejectedValue(new StatCheckApiError("backend", 404, "nope")),
    });
    const { result } = renderHook(() => useStatCheckInvites(api));
    await waitFor(() => expect(result.current.disabled).toBe(true));
    expect(result.current.invites).toEqual([]);

    await act(async () => {
      await result.current.refresh();
    });
    // One initial attempt only — the refresh after latching is a no-op.
    expect((api as never as { listInvites: { mock: { calls: unknown[] } } }).listInvites.mock.calls)
      .toHaveLength(1);
  });

  it("keeps the last good list on a transient failure", async () => {
    const listInvites = vi
      .fn()
      .mockResolvedValueOnce({ invites: [invite()], serverTime: "t" })
      .mockRejectedValue(new StatCheckApiError("network", 0, "down"));
    const api = makeApi({ listInvites });
    const { result } = renderHook(() => useStatCheckInvites(api));
    await waitFor(() => expect(result.current.invites).toHaveLength(1));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.invites).toHaveLength(1);
    expect(result.current.disabled).toBe(false);
  });

  it("accept returns the existing room join path and drops the invite", async () => {
    const api = makeApi();
    const { result } = renderHook(() => useStatCheckInvites(api));
    await waitFor(() => expect(result.current.invites).toHaveLength(1));

    let joinPath: string | null = null;
    await act(async () => {
      joinPath = await result.current.accept("tok_a");
    });
    expect(joinPath).toBe("/quiz/stat-check/room/ABCD2345");
    expect(result.current.invites).toHaveLength(0);
  });

  it("accept returns null and refetches when the invite is gone", async () => {
    const listInvites = vi
      .fn()
      .mockResolvedValueOnce({ invites: [invite()], serverTime: "t" })
      .mockResolvedValue({ invites: [], serverTime: "t" });
    const api = makeApi({
      listInvites,
      acceptInvite: vi.fn().mockRejectedValue(
        new StatCheckApiError("backend", 409, "gone", "SC_INVITE_ALREADY_RESOLVED"),
      ),
    });
    const { result } = renderHook(() => useStatCheckInvites(api));
    await waitFor(() => expect(result.current.invites).toHaveLength(1));

    let joinPath: string | null = "unset";
    await act(async () => {
      joinPath = await result.current.accept("tok_a");
    });
    expect(joinPath).toBeNull();
    await waitFor(() => expect(result.current.invites).toHaveLength(0));
  });

  it("decline removes the invite optimistically", async () => {
    const api = makeApi();
    const { result } = renderHook(() => useStatCheckInvites(api));
    await waitFor(() => expect(result.current.invites).toHaveLength(1));
    await act(async () => {
      await result.current.decline("tok_a");
    });
    expect(result.current.invites).toHaveLength(0);
    expect(
      (api as never as { declineInvite: { mock: { calls: unknown[][] } } }).declineInvite.mock.calls[0][0],
    ).toBe("tok_a");
  });

  it("never exposes a room code before acceptance", async () => {
    const api = makeApi();
    const { result } = renderHook(() => useStatCheckInvites(api));
    await waitFor(() => expect(result.current.invites).toHaveLength(1));
    expect(JSON.stringify(result.current.invites)).not.toContain("ABCD2345");
  });
});
