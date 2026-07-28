/**
 * Community drawer scope: the League drawer exposes Friends, incoming
 * Requests, outgoing Sent and Blocked -- and must NOT resurrect the legacy
 * dating-oriented "Saved" (bookmarked strangers) or "Find" (search every
 * profile by name) tabs.
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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }) },
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
  it("exposes exactly the four League tabs", async () => {
    await openDrawer();
    const tabNames = screen.getAllByRole("tab").map((t) => (t.textContent || "").trim());
    expect(tabNames).toHaveLength(4);
    expect(tabNames.join("|")).toMatch(/Friends/);
    expect(tabNames.join("|")).toMatch(/Requests/);
    expect(tabNames.join("|")).toMatch(/Sent/);
    expect(tabNames.join("|")).toMatch(/Blocked/);
  });

  it("does not resurrect the legacy Saved or Find tabs", async () => {
    await openDrawer();
    expect(screen.queryByRole("tab", { name: /saved/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /find/i })).toBeNull();
    // The stranger-search input is gone with the Find tab.
    expect(screen.queryByPlaceholderText(/search by name/i)).toBeNull();
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
