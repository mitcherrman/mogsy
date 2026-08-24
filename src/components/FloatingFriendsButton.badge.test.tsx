/**
 * COM1-2B — the Community badge.
 *
 * The badge counts ACTIONABLE social state: incoming friend requests, which are
 * resolved by a decision. It deliberately does not count friends, outgoing
 * requests, blocked users or read/unread notifications — the HUD bell owns
 * "there is something to read", this owns "there is something to decide", and
 * merging them is what makes a badge that can never reach zero.
 *
 * It must also not move the trigger. The Community button is a fixed 36px
 * circle in the bottom-left corner; a count that resized or shifted it would
 * move a permanent piece of chrome under the user's cursor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const friendsState = vi.hoisted(() => ({
  pendingRequests: [] as unknown[],
  sentRequests: [] as unknown[],
  friends: [] as unknown[],
}));
const server = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "auth-1" }, loading: false }),
}));

vi.mock("@/hooks/useFriends", () => ({
  useFriends: () => ({
    myProfileId: "me",
    friends: friendsState.friends,
    pendingRequests: friendsState.pendingRequests,
    sentRequests: friendsState.sentRequests,
    loading: false,
    sendRequest: vi.fn(),
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    cancelRequest: vi.fn(),
    removeFriend: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/useBlocks", () => ({
  useBlocks: () => ({
    blockedIds: new Set<string>(),
    loading: false,
    blockUser: vi.fn(),
    unblockUser: vi.fn(),
    isBlocked: () => false,
    myProfileId: "me",
    refresh: vi.fn(),
  }),
  useReportUser: () => ({ reportUser: vi.fn(), myProfileId: "me" }),
}));

vi.mock("@/hooks/useAdminRoles", () => ({
  useAdminRoles: () => ({
    loading: false,
    roles: [],
    isAdmin: false,
    isMasterAdmin: false,
    isModerator: false,
  }),
}));

vi.mock("@/lib/community/discovery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/community/discovery")>(
    "@/lib/community/discovery",
  );
  return {
    ...actual,
    fetchBlockedProfiles: vi.fn().mockResolvedValue([]),
    searchPlayers: vi.fn().mockResolvedValue({ results: [], searched: true }),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: server.rpc, from: server.from },
}));

import FloatingFriendsButton from "./FloatingFriendsButton";
import { communityBadge } from "@/lib/community/community-badge";

/** Minimal FriendRow shape — enough for the drawer's list renderers. */
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r-${i}`,
    requester_id: `p-${i}`,
    addressee_id: "me",
    status: "pending",
    created_at: "2026-08-01T00:00:00Z",
    profile: { id: `p-${i}`, display_name: `P${i}`, avatar_url: null, is_pro: false },
  }));

function mount() {
  return render(
    <MemoryRouter>
      <FloatingFriendsButton />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  server.rpc.mockReset();
  server.from.mockReset();
  server.rpc.mockResolvedValue({ data: [], error: null });
  server.from.mockImplementation(() => ({ select: async () => ({ data: [], error: null }) }));
  friendsState.pendingRequests = [];
  friendsState.sentRequests = [];
  friendsState.friends = [];
});
afterEach(cleanup);

describe("communityBadge — what the number means", () => {
  it("is absent at zero", () => {
    expect(communityBadge(0)).toBeNull();
  });

  it("shows an ordinary count from 1 to 99", () => {
    expect(communityBadge(1)).toMatchObject({ display: "1", label: "1 pending friend request" });
    expect(communityBadge(7)).toMatchObject({ display: "7", label: "7 pending friend requests" });
    expect(communityBadge(99)).toMatchObject({ display: "99" });
  });

  it("caps at 99+ so a wide number cannot outgrow the circle", () => {
    expect(communityBadge(100)?.display).toBe("99+");
    expect(communityBadge(4321)?.display).toBe("99+");
    // The accessible label keeps the true number — the cap is a visual one.
    expect(communityBadge(100)?.label).toBe("100 pending friend requests");
  });

  it("treats a nonsensical negative count as nothing to do", () => {
    expect(communityBadge(-3)).toBeNull();
  });
});

describe("the rendered badge", () => {
  it("renders nothing and leaves the plain label when there is nothing to decide", () => {
    mount();
    expect(screen.queryByTestId("community-badge")).toBeNull();
    expect(screen.getByTestId("friends-drawer-trigger").getAttribute("aria-label")).toBe(
      "Community",
    );
  });

  it("puts the count in the button's accessible NAME, not in a second readable node", () => {
    friendsState.pendingRequests = rows(3);
    mount();
    const trigger = screen.getByTestId("friends-drawer-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("Community, 3 pending friend requests");
    // The visible badge is decorative: a screen reader must hear the number
    // once, from the control itself.
    expect(screen.getByTestId("community-badge").getAttribute("aria-hidden")).toBe("true");
  });

  it("does not count outgoing requests or accepted friends", () => {
    friendsState.sentRequests = rows(4);
    friendsState.friends = rows(12);
    mount();
    expect(screen.queryByTestId("community-badge")).toBeNull();
  });

  it("cannot shift or resize the trigger — the badge is out of flow and inert", () => {
    friendsState.pendingRequests = rows(150);
    mount();
    const badge = screen.getByTestId("community-badge");
    expect(badge.textContent).toBe("99+");
    expect(badge.className).toMatch(/\babsolute\b/);
    expect(badge.className).toMatch(/pointer-events-none/);
    // The trigger keeps its fixed corner geometry whatever the count is.
    const trigger = screen.getByTestId("friends-drawer-trigger");
    expect(trigger.className).toMatch(/fixed bottom-6 left-6/);
    expect(trigger.className).toMatch(/\bh-9 w-9\b/);
  });

  it("is present at mobile widths too — the trigger carries no width gate", () => {
    friendsState.pendingRequests = rows(2);
    mount();
    const trigger = screen.getByTestId("friends-drawer-trigger");
    expect(trigger.className).not.toMatch(/\bhidden\b/);
    expect(screen.getByTestId("community-badge").textContent).toBe("2");
  });
});
