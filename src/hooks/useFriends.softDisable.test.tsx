/**
 * useFriends — soft-disabled bot handling and the admin refresh signal.
 *
 * A disabled bot must disappear from the drawer WITHOUT its friendship row
 * being touched, and it must come straight back on re-enable. A friendship
 * created by an admin elsewhere in the app must reach the drawer immediately
 * rather than waiting on the friendships realtime subscription.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  friendshipRows: [] as Record<string, unknown>[],
  leagueProfiles: [] as Record<string, unknown>[],
  fetchCalls: 0,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "auth-me" } }) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { id: "me" }, error: null }) }),
          }),
        };
      }
      if (table === "user_blocks") {
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }
      return {
        select: () => ({ or: async () => ({ data: mocks.friendshipRows, error: null }) }),
      };
    },
  },
}));

vi.mock("@/lib/league-profiles", () => ({
  fetchLeagueProfiles: async () => {
    mocks.fetchCalls += 1;
    return mocks.leagueProfiles;
  },
}));

import { useFriends } from "./useFriends";
import { notifyFriendsChanged } from "@/lib/community/friends-refresh";

const HUMAN_ROW = {
  id: "f-human",
  requester_id: "me",
  addressee_id: "human",
  status: "accepted",
  created_at: "2026-08-01T00:00:00Z",
};
const BOT_ROW = {
  id: "f-bot",
  requester_id: "me",
  addressee_id: "bot",
  status: "accepted",
  created_at: "2026-08-01T00:00:00Z",
};

beforeEach(() => {
  mocks.fetchCalls = 0;
  mocks.friendshipRows = [HUMAN_ROW, BOT_ROW];
  mocks.leagueProfiles = [
    { id: "human", display_name: "Human", avatar_url: null, is_pro: false, is_bot: false, is_disabled: false },
    { id: "bot", display_name: "Nova", avatar_url: null, is_pro: false, is_bot: true, is_disabled: false },
  ];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("soft-disabled bots", () => {
  it("shows an enabled bot friend", async () => {
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.friends.map((f) => f.profile.id).sort()).toEqual(["bot", "human"]);
  });

  it("hides a disabled bot friend", async () => {
    mocks.leagueProfiles = mocks.leagueProfiles.map((p) =>
      p.id === "bot" ? { ...p, is_disabled: true } : p,
    );
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.friends.map((f) => f.profile.id)).toEqual(["human"]);
  });

  it("keeps a disabled HUMAN visible — the rule is bot-scoped", async () => {
    mocks.leagueProfiles = mocks.leagueProfiles.map((p) =>
      p.id === "human" ? { ...p, is_disabled: true } : p,
    );
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.friends.map((f) => f.profile.id).sort()).toEqual(["bot", "human"]);
  });

  it("still renders the Unknown placeholder for a genuinely missing profile", async () => {
    // Absent from get_league_profiles entirely — must NOT be silently dropped,
    // otherwise a real deleted friend would vanish without explanation.
    mocks.leagueProfiles = mocks.leagueProfiles.filter((p) => p.id !== "human");
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const human = result.current.friends.find((f) => f.profile.id === "human");
    expect(human).toBeTruthy();
    expect(human!.profile.display_name).toBe("Unknown");
  });

  it("hides a pending request from a disabled bot too", async () => {
    mocks.friendshipRows = [
      { ...BOT_ROW, status: "pending", requester_id: "bot", addressee_id: "me" },
    ];
    mocks.leagueProfiles = [
      { id: "bot", display_name: "Nova", avatar_url: null, is_pro: false, is_bot: true, is_disabled: true },
    ];
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pendingRequests).toHaveLength(0);
  });

  it("re-enabling brings the bot straight back", async () => {
    mocks.leagueProfiles = mocks.leagueProfiles.map((p) =>
      p.id === "bot" ? { ...p, is_disabled: true } : p,
    );
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.friends.map((f) => f.profile.id)).toEqual(["human"]);

    mocks.leagueProfiles = mocks.leagueProfiles.map((p) =>
      p.id === "bot" ? { ...p, is_disabled: false } : p,
    );
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() =>
      expect(result.current.friends.map((f) => f.profile.id).sort()).toEqual(["bot", "human"]),
    );
  });
});

describe("admin refresh signal", () => {
  it("re-reads from the server when notifyFriendsChanged fires", async () => {
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = mocks.fetchCalls;
    await act(async () => {
      notifyFriendsChanged();
    });
    await waitFor(() => expect(mocks.fetchCalls).toBeGreaterThan(before));
  });

  it("unsubscribes on unmount so an unmounted drawer is not refreshed", async () => {
    const { result, unmount } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    const before = mocks.fetchCalls;
    await act(async () => {
      notifyFriendsChanged();
    });
    expect(mocks.fetchCalls).toBe(before);
  });
});
