/**
 * COM1-2B — every social view converges on one server read.
 *
 * THE DEFECT THIS PINS DOWN. `useFriends` is a per-instance hook: the Community
 * drawer, HomeFriendsSection, InvitePlayView and MultiplayerLobby each hold
 * their own copy of the friends array, and `useBlocks` is instantiated again
 * inside every FriendActionMenu. Before this phase a mutation refreshed only
 * the instance that issued it, so blocking someone from `/user/:profileId` left
 * them sitting in the drawer's Friends list until a full page reload.
 *
 * These tests therefore mount TWO instances and assert on the one that did not
 * perform the mutation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  friendshipRows: [] as Record<string, unknown>[],
  blockRows: [] as Record<string, unknown>[],
  leagueProfiles: [] as Record<string, unknown>[],
  reads: 0,
  deleted: [] as string[],
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
        return { select: () => ({ eq: async () => ({ data: mocks.blockRows, error: null }) }) };
      }
      return {
        select: () => ({
          or: async () => {
            mocks.reads += 1;
            return { data: mocks.friendshipRows, error: null };
          },
        }),
        delete: () => ({
          eq: async (_col: string, id: string) => {
            mocks.deleted.push(id);
            mocks.friendshipRows = mocks.friendshipRows.filter((r) => r.id !== id);
            return { data: null, error: null };
          },
        }),
      };
    },
  },
}));

vi.mock("@/lib/league-profiles", () => ({
  fetchLeagueProfiles: async () => mocks.leagueProfiles,
}));

import { useFriends } from "./useFriends";
import { notifyFriendsChanged } from "@/lib/community/friends-refresh";

const ROW = {
  id: "f-1",
  requester_id: "me",
  addressee_id: "them",
  status: "accepted",
  created_at: "2026-08-01T00:00:00Z",
};

beforeEach(() => {
  mocks.friendshipRows = [ROW];
  mocks.blockRows = [];
  mocks.leagueProfiles = [
    { id: "them", display_name: "Them", avatar_url: null, is_pro: false, is_bot: false, is_disabled: false },
  ];
  mocks.reads = 0;
  mocks.deleted = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("two mounted views converge on one signal", () => {
  it("a friendship removed by ONE instance leaves the other instance's list", async () => {
    const drawer = renderHook(() => useFriends());
    const home = renderHook(() => useFriends());
    await waitFor(() => expect(drawer.result.current.friends).toHaveLength(1));
    await waitFor(() => expect(home.result.current.friends).toHaveLength(1));

    await act(async () => {
      await drawer.result.current.removeFriend("f-1");
    });

    expect(mocks.deleted).toEqual(["f-1"]);
    // The instance that did NOT issue the mutation is the whole point.
    expect(home.result.current.friends).toHaveLength(0);
    expect(drawer.result.current.friends).toHaveLength(0);
  });

  it("a block recorded elsewhere drops the friend from a list that never saw the write", async () => {
    const drawer = renderHook(() => useFriends());
    await waitFor(() => expect(drawer.result.current.friends).toHaveLength(1));

    // What `block_profile` does server-side: record the block AND delete the
    // friendship, in one transaction. The client is told only "something
    // changed".
    mocks.blockRows = [{ blocked_profile_id: "them" }];
    mocks.friendshipRows = [];
    await act(async () => {
      await notifyFriendsChanged();
    });

    expect(drawer.result.current.friends).toHaveLength(0);
  });

  it("never renders an accepted friendship across a known block, even if the row survives", async () => {
    // Defensive: if a friendship row is somehow still present while a block
    // exists, the renderer must not show it. The block is the authority.
    mocks.blockRows = [{ blocked_profile_id: "them" }];
    const drawer = renderHook(() => useFriends());
    await waitFor(() => expect(drawer.result.current.loading).toBe(false));
    expect(drawer.result.current.friends).toHaveLength(0);
  });

  it("an incoming request arriving on the signal appears without a remount", async () => {
    const drawer = renderHook(() => useFriends());
    await waitFor(() => expect(drawer.result.current.pendingRequests).toHaveLength(0));

    mocks.friendshipRows = [
      ROW,
      {
        id: "f-2",
        requester_id: "other",
        addressee_id: "me",
        status: "pending",
        created_at: "2026-08-02T00:00:00Z",
      },
    ];
    mocks.leagueProfiles = [
      ...mocks.leagueProfiles,
      { id: "other", display_name: "Other", avatar_url: null, is_pro: false, is_bot: false, is_disabled: false },
    ];
    await act(async () => {
      await notifyFriendsChanged();
    });

    expect(drawer.result.current.pendingRequests).toHaveLength(1);
  });
});

describe("background re-reads are silent", () => {
  it("keeps `loading` false after the first read, so a live update cannot blank the list", async () => {
    const drawer = renderHook(() => useFriends());
    await waitFor(() => expect(drawer.result.current.loading).toBe(false));
    const readsAfterFirstLoad = mocks.reads;

    await act(async () => {
      await notifyFriendsChanged();
    });

    // It really did re-read...
    expect(mocks.reads).toBeGreaterThan(readsAfterFirstLoad);
    // ...and never flashed the "Loading..." state over a list on screen.
    expect(drawer.result.current.loading).toBe(false);
  });
});

describe("the signal is awaited, not raced", () => {
  it("resolves the mutation only after the server re-read has actually run", async () => {
    const drawer = renderHook(() => useFriends());
    const home = renderHook(() => useFriends());
    await waitFor(() => expect(home.result.current.friends).toHaveLength(1));
    const readsBefore = mocks.reads;

    await act(async () => {
      await drawer.result.current.removeFriend("f-1");
      // Both instances re-read BEFORE the mutation's promise resolved. If
      // `removeFriend` refreshed only itself — the pre-COM1-2B behaviour — this
      // is 1, not 2. (React commits the new render at the end of `act`; the
      // read count is what proves the fetch already happened.)
      expect(mocks.reads).toBe(readsBefore + 2);
    });

    expect(home.result.current.friends).toHaveLength(0);
  });
});
