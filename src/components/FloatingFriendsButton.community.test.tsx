/**
 * COM1-2 — Community panel reachability and the admin gate.
 *
 * Two separate guarantees, tested separately because they fail separately.
 *
 * REACHABILITY (audit P1-2). The drawer had exactly one trigger in production
 * and it was `hidden sm:flex`; the HUD's Friends entry sits inside
 * `{!LEAGUE_ONLY_MODE && …}`, which is false. A phone therefore could not open
 * the Community panel at all unless a friend-request notification happened to
 * be waiting. Two independent paths now exist and both are asserted here — the
 * always-visible floating trigger, and the `open-friends-panel` event the HUD's
 * Community entry dispatches.
 *
 * THE ADMIN GATE. The Users tab must be absent for an ordinary user, AND the
 * privileged read must never be ISSUED by their client. The second is the one
 * that matters: hiding a tab whose data was already fetched would put the whole
 * directory — every account on the platform — in a non-admin's memory. The real
 * boundary is still `admin_list_profiles()`, which raises unless
 * has_role(admin); this is defence in depth, not the defence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const friendsState = vi.hoisted(() => ({ pendingRequests: [] as unknown[] }));
const roleState = vi.hoisted(() => ({ isMasterAdmin: false, loading: false }));
const server = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "auth-1" }, loading: false }),
}));

vi.mock("@/hooks/useFriends", () => ({
  useFriends: () => ({
    myProfileId: "me",
    friends: [],
    pendingRequests: friendsState.pendingRequests,
    sentRequests: [],
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
    loading: roleState.loading,
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
  roleState.isMasterAdmin = false;
  roleState.loading = false;
  friendsState.pendingRequests = [];
});
afterEach(cleanup);

describe("mobile reachability", () => {
  it("the Community trigger is visible at EVERY width", () => {
    mount();
    const trigger = screen.getByTestId("friends-drawer-trigger");
    // `hidden sm:flex` is what made the panel unreachable on a phone. The class
    // is asserted directly because there is no viewport in jsdom and its
    // absence is the entire fix.
    expect(trigger.className).not.toMatch(/\bhidden\b/);
    expect(trigger.className).toMatch(/\bflex\b/);
  });

  it("is labelled Community, not Friends", () => {
    mount();
    expect(screen.getByLabelText("Community")).toBeTruthy();
  });

  it("opens on tap", async () => {
    mount();
    fireEvent.click(screen.getByTestId("friends-drawer-trigger"));
    await waitFor(() => expect(screen.getByRole("tab", { name: /find players/i })).toBeTruthy());
  });

  it("opens from the HUD's `open-friends-panel` event — the non-floating path", async () => {
    mount();
    expect(screen.queryByRole("tab", { name: /friends/i })).toBeNull();
    fireEvent(window, new Event("open-friends-panel"));
    await waitFor(() => expect(screen.getByRole("tab", { name: /friends/i })).toBeTruthy());
  });

  it("renders nothing at all when signed out", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
    const { default: SignedOut } = await import("./FloatingFriendsButton");
    const { container } = render(
      <MemoryRouter>
        <SignedOut />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe("");
    vi.doUnmock("@/hooks/useAuth");
    vi.resetModules();
  });
});

describe("the admin Users tab", () => {
  async function openDrawer() {
    mount();
    fireEvent.click(screen.getByTestId("friends-drawer-trigger"));
    await waitFor(() => expect(screen.getByRole("tab", { name: /friends/i })).toBeTruthy());
  }

  it("is ABSENT for an ordinary user", async () => {
    await openDrawer();
    expect(screen.queryByTestId("community-tab-users")).toBeNull();
    expect(screen.queryByRole("tab", { name: /users/i })).toBeNull();
  });

  it("issues NO privileged read for an ordinary user", async () => {
    await openDrawer();
    // Not "the tab is hidden" — the request is never made, so the directory
    // never exists in this client's memory.
    await new Promise((r) => setTimeout(r, 20));
    const privileged = server.rpc.mock.calls.filter(([fn]) =>
      String(fn).startsWith("admin_"),
    );
    expect(privileged).toEqual([]);
  });

  it("is ABSENT while the role is still resolving", async () => {
    // Fail closed: an unresolved role must not flash a privileged tab.
    roleState.loading = true;
    roleState.isMasterAdmin = false;
    await openDrawer();
    expect(screen.queryByTestId("community-tab-users")).toBeNull();
  });

  it("is PRESENT for a master admin", async () => {
    roleState.isMasterAdmin = true;
    await openDrawer();
    expect(screen.getByTestId("community-tab-users")).toBeTruthy();
  });

  it("does not fetch the directory until the admin opens the tab", async () => {
    roleState.isMasterAdmin = true;
    await openDrawer();
    await new Promise((r) => setTimeout(r, 20));
    // Radix unmounts inactive TabsContent, so mounting the drawer is not
    // enough to trigger the read.
    expect(server.rpc.mock.calls.some(([fn]) => fn === "admin_list_profiles")).toBe(false);

    const usersTab = screen.getByTestId("community-tab-users");
    fireEvent.mouseDown(usersTab);
    fireEvent.click(usersTab);
    await waitFor(() =>
      expect(server.rpc.mock.calls.some(([fn]) => fn === "admin_list_profiles")).toBe(true),
    );
  });
});

describe("Find Players is reachable from the panel", () => {
  it("shows the search input once the tab is opened", async () => {
    mount();
    fireEvent.click(screen.getByTestId("friends-drawer-trigger"));
    const findTab = await screen.findByRole("tab", { name: /find players/i });
    fireEvent.mouseDown(findTab);
    fireEvent.click(findTab);
    await waitFor(() => expect(screen.getByTestId("find-players-input")).toBeTruthy());
  });
});
