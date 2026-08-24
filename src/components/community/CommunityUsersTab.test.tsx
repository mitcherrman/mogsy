/**
 * COM1-2 — Community · Users.
 *
 * The point of this tab is that it is NOT a second admin system. So the tests
 * are mostly about what it reuses and what it refuses to hold:
 *
 *   - the directory comes from `admin_list_profiles()` through the EXISTING
 *     hardened projection, so no auth uid and no legacy dating field can reach
 *     the DOM,
 *   - the friend link is the EXISTING `admin_link_friendship` RPC, confirmed,
 *     audited and master-admin-checked server-side,
 *   - bot state is the EXISTING `admin_update_bot_profile` RPC,
 *   - everything it does not implement is a link to `/admin/people`, carrying a
 *     `profiles.id` and never an auth uid.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const AUTH_UID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  friendsNotified: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock("@/lib/community/friends-refresh", () => ({
  notifyFriendsChanged: () => {
    mocks.friendsNotified += 1;
  },
  subscribeFriendsChanged: () => () => {},
}));

import CommunityUsersTab from "./CommunityUsersTab";

/** A raw `admin_list_profiles()` row — all 31 columns, decoys included. */
function row(over: Record<string, unknown> & { id?: string } = {}) {
  return {
    id: "p-generic",
    user_id: over.id === "p-admin" ? AUTH_UID : `auth-${over.id ?? "generic"}`,
    display_name: "Generic",
    avatar_url: null,
    profile_frame: null,
    created_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-01-02T00:00:00Z",
    is_pro: false,
    is_bot: false,
    is_disabled: false,
    is_anonymous: false,
    onboarding_completed: true,
    admin_notes: "SECRET-NOTE",
    is_flagged_underage: false,
    age: 31,
    location: "SECRET-CITY",
    status_message: "SECRET-STATUS",
    diamonds: 999,
    ...over,
  };
}

const ROWS = [
  row({ id: "p-human", display_name: "Ashe", created_at: "2026-08-01T00:00:00Z" }),
  row({ id: "p-guest", display_name: "Anonymous4821", is_anonymous: true, created_at: "2026-07-01T00:00:00Z" }),
  row({ id: "p-bot", display_name: "Nova", is_bot: true, created_at: "2026-06-01T00:00:00Z" }),
  row({ id: "p-offbot", display_name: "Retired", is_bot: true, is_disabled: true, created_at: "2026-05-01T00:00:00Z" }),
  row({ id: "p-admin", display_name: "Owner", created_at: "2026-04-01T00:00:00Z" }),
];

const ROLE_ROWS = [{ user_id: AUTH_UID, role: "master_admin" }];

function mockServer() {
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "admin_list_profiles") return { data: ROWS, error: null };
    if (fn === "admin_link_friendship") {
      return { data: { ok: true, code: "created", friendship_id: "f-1" }, error: null };
    }
    if (fn === "admin_update_bot_profile") return { data: { ok: true, code: "updated" }, error: null };
    return { data: null, error: null };
  });
  mocks.from.mockImplementation((table: string) => ({
    select: async () => (table === "user_roles" ? { data: ROLE_ROWS, error: null } : { data: [], error: null }),
  }));
}

function renderTab() {
  return render(
    <MemoryRouter>
      <CommunityUsersTab />
    </MemoryRouter>,
  );
}

const ready = () =>
  waitFor(() => expect(screen.queryByTestId("community-users-loading")).toBeNull());

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.friendsNotified = 0;
  mockServer();
});
afterEach(cleanup);

describe("the directory it lists", () => {
  it("reads it through the canonical admin RPC", async () => {
    renderTab();
    await ready();
    expect(mocks.rpc).toHaveBeenCalledWith("admin_list_profiles");
  });

  it("shows real users first and hides nothing behind the default filter", async () => {
    renderTab();
    await ready();
    // "Real users" is the opening view; guests and bots are one click away.
    expect(screen.getByTestId("community-user-p-human")).toBeTruthy();
    expect(screen.queryByTestId("community-user-p-guest")).toBeNull();
    fireEvent.click(screen.getByTestId("community-users-filter-all"));
    await waitFor(() => expect(screen.getByTestId("community-user-p-guest")).toBeTruthy());
  });

  it("preserves the bot / guest / registered distinction", async () => {
    renderTab();
    await ready();
    fireEvent.click(screen.getByTestId("community-users-filter-all"));
    await waitFor(() => expect(screen.getByTestId("community-user-p-bot")).toBeTruthy());
    expect(screen.getByTestId("community-user-p-human").textContent).toContain("Registered");
    expect(screen.getByTestId("community-user-p-guest").textContent).toContain("Guest");
    expect(screen.getByTestId("community-user-p-bot").textContent).toContain("Bot");
    // A retired bot is still visible to an admin, and says so.
    expect(screen.getByTestId("community-user-p-offbot").textContent).toContain("Bot · disabled");
  });

  it("shows roles as read-only tags", async () => {
    renderTab();
    await ready();
    expect(screen.getByTestId("community-user-p-admin").textContent).toContain("master admin");
  });

  it("searches by display name", async () => {
    renderTab();
    await ready();
    fireEvent.change(screen.getByTestId("community-users-search"), { target: { value: "ash" } });
    await waitFor(() => expect(screen.queryByTestId("community-user-p-admin")).toBeNull());
    expect(screen.getByTestId("community-user-p-human")).toBeTruthy();
  });

  it("NEVER renders an auth user id or a legacy dating field", async () => {
    const { container } = renderTab();
    await ready();
    fireEvent.click(screen.getByTestId("community-users-filter-all"));
    await waitFor(() => expect(screen.getByTestId("community-user-p-bot")).toBeTruthy());
    const html = container.innerHTML;
    for (const secret of [
      AUTH_UID,
      "auth-p-human",
      "SECRET-NOTE",
      "SECRET-CITY",
      "SECRET-STATUS",
    ]) {
      expect(html, `${secret} reached the DOM`).not.toContain(secret);
    }
  });

  it("reports a failed load instead of rendering an empty directory", async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === "admin_list_profiles"
        ? { data: null, error: { message: "insufficient_privilege" } }
        : { data: null, error: null },
    );
    renderTab();
    await waitFor(() => expect(screen.getByTestId("community-users-error")).toBeTruthy());
    // The raw Postgres word never reaches the screen.
    expect(screen.getByTestId("community-users-error").textContent).toBe("Couldn't load users.");
  });
});

describe("selecting a user", () => {
  it("opens the inspector for the chosen profile", async () => {
    renderTab();
    await ready();
    expect(screen.queryByTestId("community-users-selected")).toBeNull();
    fireEvent.click(screen.getByTestId("community-user-p-human"));
    const panel = await screen.findByTestId("community-users-selected");
    expect(within(panel).getByText("Ashe")).toBeTruthy();
  });

  it("hands off to the ONE full user-management surface, keyed by profile id", async () => {
    renderTab();
    await ready();
    fireEvent.click(screen.getByTestId("community-user-p-human"));
    const link = await screen.findByTestId("community-users-manage-link");
    // The deep link carries a `profiles.id` — the identifier already in every
    // /user/:profileId URL — and never an auth uid.
    expect(link.getAttribute("href")).toBe("/admin/people?section=users&user=p-human");
    expect(link.getAttribute("href")).not.toContain("auth-");
  });

  it("clears the selection", async () => {
    renderTab();
    await ready();
    fireEvent.click(screen.getByTestId("community-user-p-human"));
    await screen.findByTestId("community-users-selected");
    fireEvent.click(screen.getByTestId("community-users-clear-selection"));
    await waitFor(() => expect(screen.queryByTestId("community-users-selected")).toBeNull());
  });

  it("offers bot controls for a bot and none for a human", async () => {
    renderTab();
    await ready();
    fireEvent.click(screen.getByTestId("community-user-p-human"));
    await screen.findByTestId("community-users-selected");
    expect(screen.queryByTestId("bot-toggle-p-human")).toBeNull();

    fireEvent.click(screen.getByTestId("community-users-filter-bots"));
    await waitFor(() => expect(screen.getByTestId("community-user-p-bot")).toBeTruthy());
    fireEvent.click(screen.getByTestId("community-user-p-bot"));
    await waitFor(() => expect(screen.getByTestId("bot-toggle-p-bot")).toBeTruthy());
  });
});

describe("privileged actions keep their existing authorization path", () => {
  it("Add to My Friends calls admin_link_friendship, confirmed, with a profile id only", async () => {
    renderTab();
    await ready();
    fireEvent.click(screen.getByTestId("community-user-p-human"));
    await screen.findByTestId("community-users-selected");

    fireEvent.click(screen.getByTestId("add-friend-p-human"));
    // The confirmation gate is the existing component's, not a new one.
    const confirm = await screen.findByTestId("add-friend-confirm");
    expect(confirm).toBeTruthy();
    fireEvent.click(screen.getByTestId("add-friend-confirm-accept"));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_link_friendship", {
        _target_profile_id: "p-human",
      }),
    );
    // The RPC resolves the actor from auth.uid() server-side; nothing about the
    // caller is sent from here.
    const call = mocks.rpc.mock.calls.find((c) => c[0] === "admin_link_friendship");
    expect(Object.keys(call![1] as object)).toEqual(["_target_profile_id"]);
    await waitFor(() => expect(mocks.friendsNotified).toBe(1));
  });

  it("the bot toggle calls admin_update_bot_profile", async () => {
    renderTab();
    await ready();
    fireEvent.click(screen.getByTestId("community-users-filter-bots"));
    await waitFor(() => expect(screen.getByTestId("community-user-p-bot")).toBeTruthy());
    fireEvent.click(screen.getByTestId("community-user-p-bot"));
    const toggle = await screen.findByTestId("bot-toggle-p-bot");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        mocks.rpc.mock.calls.some((c) => c[0] === "admin_update_bot_profile"),
      ).toBe(true),
    );
  });

  it("implements no user deletion, no role editing and no ban control", async () => {
    const { container } = renderTab();
    await ready();
    fireEvent.click(screen.getByTestId("community-user-p-human"));
    await screen.findByTestId("community-users-selected");
    const text = container.textContent ?? "";
    for (const forbidden of [/delete/i, /\bban\b/i, /suspend/i, /grant .*role/i]) {
      expect(text, `${forbidden} appears on a tab that must not implement it`).not.toMatch(forbidden);
    }
  });
});
