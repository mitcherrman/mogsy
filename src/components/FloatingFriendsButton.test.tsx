/**
 * Community drawer scope.
 *
 * The League drawer exposes Friends, incoming Requests, outgoing Sent, Find
 * Players and Blocked — and must NOT resurrect the legacy dating-oriented
 * "Saved" tab (bookmarked strangers).
 *
 * COM1-2 CHANGED ONE OF THESE RULES DELIBERATELY. This suite used to assert
 * that a "Find" tab did not exist, because the legacy one searched
 * `public_profiles` — a `security_invoker` view over owner-only RLS — and
 * returned an empty list for every query. That was a correct assertion about a
 * broken surface. Discovery now goes through `public.search_league_profiles`,
 * a SECURITY DEFINER RPC, and `public.profiles` RLS is unchanged. "Saved"
 * stays gone, and that assertion is unchanged.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import FloatingFriendsButton from "./FloatingFriendsButton";

import type { FriendRow } from "@/hooks/useFriends";

const friendsState = vi.hoisted(() => ({
  friends: [] as FriendRow[],
  pendingRequests: [] as FriendRow[],
  sentRequests: [] as FriendRow[],
}));

const roleState = vi.hoisted(() => ({ isMasterAdmin: false }));

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
    roles: roleState.isMasterAdmin ? ["master_admin"] : [],
    isAdmin: roleState.isMasterAdmin,
    isMasterAdmin: roleState.isMasterAdmin,
    isModerator: false,
  }),
}));

vi.mock("@/lib/community/discovery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/community/discovery")>(
    "@/lib/community/discovery",
  );
  return { ...actual, fetchBlockedProfiles: vi.fn().mockResolvedValue([]) };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  },
}));

function row(id: string, name: string): FriendRow {
  return {
    id,
    requester_id: "me",
    addressee_id: "them",
    status: "pending",
    created_at: "2026-07-01T00:00:00Z",
    profile: { id: `p-${id}`, display_name: name, avatar_url: null, is_pro: false },
  };
}

afterEach(() => {
  cleanup();
  friendsState.friends = [];
  friendsState.pendingRequests = [];
  friendsState.sentRequests = [];
  roleState.isMasterAdmin = false;
});

async function openDrawer() {
  render(
    <MemoryRouter>
      <FloatingFriendsButton />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId("friends-drawer-trigger"));
  await waitFor(() => expect(screen.getByRole("tab", { name: /friends/i })).toBeTruthy());
}

describe("community drawer scope", () => {
  it("exposes exactly the five League tabs for an ordinary user", async () => {
    await openDrawer();
    const tabNames = screen.getAllByRole("tab").map((t) => (t.textContent || "").trim());
    expect(tabNames).toHaveLength(5);
    expect(tabNames.join("|")).toMatch(/Friends/);
    expect(tabNames.join("|")).toMatch(/Requests/);
    expect(tabNames.join("|")).toMatch(/Sent/);
    expect(tabNames.join("|")).toMatch(/Find Players/);
    expect(tabNames.join("|")).toMatch(/Blocked/);
  });

  it("does not resurrect the legacy Saved tab", async () => {
    await openDrawer();
    expect(screen.queryByRole("tab", { name: /saved/i })).toBeNull();
  });

  it("lists outgoing requests under Sent with a cancel action", async () => {
    friendsState.sentRequests = [row("f1", "Ashe")];
    await openDrawer();
    // Radix TabsTrigger activates on mousedown, not on a synthetic click.
    const sentTab = screen.getByRole("tab", { name: /sent/i });
    fireEvent.mouseDown(sentTab);
    fireEvent.click(sentTab);
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());
    expect(screen.getByLabelText("Cancel request")).toBeTruthy();
  });
});
