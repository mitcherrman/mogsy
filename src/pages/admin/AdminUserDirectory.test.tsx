/**
 * Admin · Users directory.
 *
 * Covers the route gate (master-admin only, no unauthorized flash), the
 * newest-first ordering, every filter, the confirmation gate on Add to My
 * Friends, the structured result messages, and — most importantly — that no
 * auth user id and no legacy dating field ever reaches the DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

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
// The gate has its own dedicated suite; here it is transparent so the page's
// own behaviour is what is under test.
vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

import AdminUserDirectory from "./AdminUserDirectory";

function row(over: Record<string, unknown> & { id?: string } = {}) {
  return {
    id: "p-generic",
    // Distinct per profile, so the role join targets exactly one row. Only
    // p-new carries AUTH_UID; the privacy assertions key off that.
    user_id: over.id === "p-new" ? AUTH_UID : `auth-${over.id ?? "generic"}`,
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
  row({ id: "p-old", display_name: "Aria", created_at: "2026-01-01T00:00:00Z" }),
  row({ id: "p-new", display_name: "Zed", created_at: "2026-08-01T00:00:00Z" }),
  row({ id: "p-anon", display_name: "Guest", is_anonymous: true, created_at: "2026-05-01T00:00:00Z" }),
  row({ id: "p-bot", display_name: "Nova Bot", is_bot: true, created_at: "2026-06-01T00:00:00Z" }),
  row({
    id: "p-offbot",
    display_name: "Retired Bot",
    is_bot: true,
    is_disabled: true,
    created_at: "2026-07-01T00:00:00Z",
  }),
  row({ id: "p-pro", display_name: "Pro Person", is_pro: true, created_at: "2026-03-01T00:00:00Z" }),
];

function renderPage(pageSize?: number) {
  return render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <Routes>
        <Route path="/admin/users" element={<AdminUserDirectory pageSize={pageSize} />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Resolves once the directory has loaded. */
const ready = () => screen.findByTestId("admin-users-count");

/** The default view is "Real users", so most suites opt into a wider filter. */
function selectFilter(name: string) {
  fireEvent.click(screen.getByTestId(`admin-users-filter-${name}`));
}

const renderedIds = () =>
  screen
    .queryAllByTestId(/^admin-user-p-/)
    .map((c) => c.getAttribute("data-testid")!.replace("admin-user-", ""));

beforeEach(() => {
  mocks.friendsNotified = 0;
  mocks.from.mockReturnValue({
    select: async () => ({ data: [{ user_id: AUTH_UID, role: "master_admin" }], error: null }),
  });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_list_profiles") return { data: ROWS, error: null };
    return { data: { ok: true, code: "created", friendship_id: "f1" }, error: null };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("default view", () => {
  it("opens on Real users, not All", async () => {
    renderPage();
    await ready();
    expect(screen.getByTestId("admin-users-filter-real").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("admin-users-filter-all").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows no anonymous profiles and no bots on first render", async () => {
    renderPage();
    await ready();
    expect(renderedIds()).toEqual(["p-new", "p-pro", "p-old"]);
    expect(screen.queryByTestId("admin-user-p-anon")).toBeNull();
    expect(screen.queryByTestId("admin-user-p-bot")).toBeNull();
    expect(screen.queryByTestId("admin-user-p-offbot")).toBeNull();
  });

  it("orders the matching users newest first", async () => {
    renderPage();
    await ready();
    // p-new 2026-08-01, p-pro 2026-03-01, p-old 2026-01-01
    expect(renderedIds()).toEqual(["p-new", "p-pro", "p-old"]);
  });

  it("says the view is filtered, with the true total", async () => {
    renderPage();
    await ready();
    expect(screen.getByTestId("admin-users-count").textContent).toBe(
      "Showing 3 of 3 profiles (filtered from 6)",
    );
  });

  it("still reaches every profile through All, newest first", async () => {
    renderPage();
    await ready();
    selectFilter("all");
    await waitFor(() =>
      expect(renderedIds()).toEqual([
        "p-new",
        "p-offbot",
        "p-bot",
        "p-anon",
        "p-pro",
        "p-old",
      ]),
    );
    expect(screen.getByTestId("admin-users-count").textContent).toBe("Showing 6 of 6 profiles");
  });

  it("surfaces a load failure instead of showing an empty directory", async () => {
    mocks.rpc.mockImplementation(async () => ({ data: null, error: { message: "denied" } }));
    renderPage();
    expect(await screen.findByTestId("admin-users-error")).toBeTruthy();
    expect(screen.queryByTestId("admin-users-count")).toBeNull();
  });
});

describe("privacy of the rendered output", () => {
  // Asserted with EVERY profile on screen, so the guarantee is not an artifact
  // of the default filter hiding most rows.
  it("never renders an auth user id", async () => {
    const { container } = renderPage();
    await ready();
    selectFilter("all");
    await waitFor(() => expect(renderedIds()).toHaveLength(6));
    expect(container.innerHTML).not.toContain(AUTH_UID);
  });

  it.each(["SECRET-NOTE", "SECRET-CITY", "SECRET-STATUS", "999"])(
    "never renders the private/legacy value %s",
    async (secret) => {
      const { container } = renderPage();
      await ready();
      selectFilter("all");
      await waitFor(() => expect(renderedIds()).toHaveLength(6));
      expect(container.textContent ?? "").not.toContain(secret);
    },
  );

  it("links to /user/:profileId and not to /profile/:id", async () => {
    renderPage();
    await ready();
    const link = screen.getByTestId("admin-user-link-p-new");
    expect(link.getAttribute("href")).toBe("/user/p-new");
  });
});

describe("filters and search", () => {
  const cases: [string, string[]][] = [
    ["real", ["p-new", "p-pro", "p-old"]],
    ["anonymous", ["p-anon"]],
    ["bots", ["p-offbot", "p-bot"]],
    ["disabled-bots", ["p-offbot"]],
    ["pro", ["p-pro"]],
    // Only p-new's auth id carries a role row, so exactly one profile matches.
    ["admins", ["p-new"]],
  ];

  it.each(cases)("filter '%s' shows the expected profiles", async (filter, expected) => {
    renderPage();
    await ready();
    selectFilter(filter);
    await waitFor(() => expect(renderedIds()).toEqual(expected));
  });

  it("searches by display name within the active filter", async () => {
    renderPage();
    await ready();
    selectFilter("all");
    fireEvent.change(screen.getByTestId("admin-users-search"), { target: { value: "nova" } });
    await waitFor(() => {
      expect(renderedIds()).toEqual(["p-bot"]);
    });
  });

  it("search runs over the whole fetched set, not just the rendered page", async () => {
    // p-old is the OLDEST real user, so with a cap of 1 it is not on screen —
    // searching for it must still find it.
    renderPage(1);
    await ready();
    expect(renderedIds()).toEqual(["p-new"]);
    fireEvent.change(screen.getByTestId("admin-users-search"), { target: { value: "aria" } });
    await waitFor(() => expect(renderedIds()).toEqual(["p-old"]));
  });

  it("shows an empty state rather than a blank list", async () => {
    renderPage();
    await ready();
    fireEvent.change(screen.getByTestId("admin-users-search"), { target: { value: "zzzz" } });
    expect(await screen.findByTestId("admin-users-empty")).toBeTruthy();
  });
});

describe("render cap", () => {
  it("caps the initial render and reports it accurately", async () => {
    renderPage(2);
    await ready();
    expect(renderedIds()).toEqual(["p-new", "p-pro"]);
    expect(screen.getByTestId("admin-users-count").textContent).toBe(
      "Showing 2 of 3 profiles (filtered from 6)",
    );
  });

  it("keeps the NEWEST matches when capping", async () => {
    renderPage(1);
    await ready();
    expect(renderedIds()).toEqual(["p-new"]);
  });

  it("offers Show more only while matches remain", async () => {
    renderPage(2);
    await ready();
    expect(screen.getByTestId("admin-users-show-more").textContent).toContain("Show 1 more");
  });

  it("hides Show more when everything already fits", async () => {
    renderPage(50);
    await ready();
    expect(screen.queryByTestId("admin-users-show-more")).toBeNull();
  });

  it("Show more increases the visible count by the increment", async () => {
    renderPage(1);
    await ready();
    expect(renderedIds()).toHaveLength(1);
    fireEvent.click(screen.getByTestId("admin-users-show-more"));
    await waitFor(() => expect(renderedIds()).toEqual(["p-new", "p-pro"]));
    expect(screen.getByTestId("admin-users-count").textContent).toBe(
      "Showing 2 of 3 profiles (filtered from 6)",
    );
    fireEvent.click(screen.getByTestId("admin-users-show-more"));
    await waitFor(() => expect(renderedIds()).toEqual(["p-new", "p-pro", "p-old"]));
    expect(screen.queryByTestId("admin-users-show-more")).toBeNull();
  });

  it("resets the cap when the filter changes", async () => {
    renderPage(1);
    await ready();
    fireEvent.click(screen.getByTestId("admin-users-show-more"));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));

    selectFilter("all");
    await waitFor(() => expect(renderedIds()).toEqual(["p-new"]));
    expect(screen.getByTestId("admin-users-count").textContent).toBe("Showing 1 of 6 profiles");
  });

  it("resets the cap when the search changes", async () => {
    renderPage(1);
    await ready();
    selectFilter("all");
    fireEvent.click(screen.getByTestId("admin-users-show-more"));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));

    fireEvent.change(screen.getByTestId("admin-users-search"), { target: { value: "o" } });
    await waitFor(() => expect(renderedIds()).toHaveLength(1));
  });

  it("counts matches, not rendered cards, in the total", async () => {
    renderPage(1);
    await ready();
    selectFilter("bots");
    await waitFor(() =>
      expect(screen.getByTestId("admin-users-count").textContent).toBe(
        "Showing 1 of 2 profiles (filtered from 6)",
      ),
    );
  });
});

describe("bot state is always visible to an admin", () => {
  it("labels bots and their enabled/disabled state regardless of any policy", async () => {
    renderPage();
    await ready();
    selectFilter("bots");
    await waitFor(() => expect(screen.getByTestId("tag-bot-p-bot").textContent).toBe("Bot"));
    expect(screen.getByTestId("tag-botstate-p-bot").textContent).toBe("Enabled");
    expect(screen.getByTestId("tag-botstate-p-offbot").textContent).toBe("Disabled");
  });

  it("does not label a human profile as a bot", async () => {
    renderPage();
    await ready();
    expect(screen.getByTestId("admin-user-p-new")).toBeTruthy();
    expect(screen.queryByTestId("tag-bot-p-new")).toBeNull();
  });
});

describe("Add to My Friends", () => {
  it("requires explicit confirmation before calling the server", async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByTestId("add-friend-p-new"));
    expect(await screen.findByTestId("add-friend-confirm")).toBeTruthy();
    expect(mocks.rpc.mock.calls.filter((c) => c[0] === "admin_link_friendship")).toHaveLength(0);
  });

  it("calls the RPC with only the target profile id once confirmed", async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByTestId("add-friend-p-new"));
    fireEvent.click(await screen.findByTestId("add-friend-confirm-accept"));
    await waitFor(() => {
      const call = mocks.rpc.mock.calls.find((c) => c[0] === "admin_link_friendship");
      expect(call).toBeTruthy();
      expect(call![1]).toEqual({ _target_profile_id: "p-new" });
    });
  });

  it("refreshes the Community friends state after a created friendship", async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByTestId("add-friend-p-new"));
    fireEvent.click(await screen.findByTestId("add-friend-confirm-accept"));
    await waitFor(() => expect(mocks.friendsNotified).toBe(1));
  });

  it.each([
    ["already_friends", "Already in your friends"],
    ["pending_exists", "pending friend request"],
    ["blocked", "Blocked"],
    ["self", "your own profile"],
    ["target_disabled", "bot is disabled"],
  ])("renders a distinct message for %s", async (code, fragment) => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_list_profiles") return { data: ROWS, error: null };
      return { data: { ok: false, code, friendship_id: null }, error: null };
    });
    renderPage();
    await ready();
    fireEvent.click(screen.getByTestId("add-friend-p-new"));
    fireEvent.click(await screen.findByTestId("add-friend-confirm-accept"));
    const result = await screen.findByTestId("add-friend-result-p-new");
    expect(result.textContent).toContain(fragment);
    expect(mocks.friendsNotified).toBe(0);
  });

  it("does not refresh friends when the RPC fails outright", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_list_profiles") return { data: ROWS, error: null };
      return { data: null, error: { message: "boom" } };
    });
    renderPage();
    await ready();
    fireEvent.click(screen.getByTestId("add-friend-p-new"));
    fireEvent.click(await screen.findByTestId("add-friend-confirm-accept"));
    const result = await screen.findByTestId("add-friend-result-p-new");
    expect(result.textContent).toContain("Couldn't complete");
    expect(mocks.friendsNotified).toBe(0);
  });

  it("disables the action for a soft-disabled bot", async () => {
    renderPage();
    await ready();
    selectFilter("bots");
    await waitFor(() =>
      expect(screen.getByTestId("add-friend-p-offbot")).toHaveProperty("disabled", true),
    );
    expect(screen.getByTestId("add-friend-p-bot")).toHaveProperty("disabled", false);
  });
});

describe("inline bot state toggle", () => {
  it("offers a toggle for bots only", async () => {
    renderPage();
    await ready();
    selectFilter("all");
    await waitFor(() => expect(screen.getByTestId("bot-toggle-p-bot")).toBeTruthy());
    expect(screen.queryByTestId("bot-toggle-p-new")).toBeNull();
  });

  it("disables a bot and reloads the directory", async () => {
    renderPage();
    await ready();
    selectFilter("bots");
    await waitFor(() => expect(screen.getByTestId("bot-toggle-p-bot")).toBeTruthy());
    const before = mocks.rpc.mock.calls.filter((c) => c[0] === "admin_list_profiles").length;
    fireEvent.click(screen.getByTestId("bot-toggle-p-bot"));
    await waitFor(() => {
      const call = mocks.rpc.mock.calls.find((c) => c[0] === "admin_update_bot_profile");
      expect(call![1]).toMatchObject({ _profile_id: "p-bot", _is_disabled: true });
    });
    await waitFor(() =>
      expect(
        mocks.rpc.mock.calls.filter((c) => c[0] === "admin_list_profiles").length,
      ).toBeGreaterThan(before),
    );
  });

  it("re-enables a disabled bot", async () => {
    renderPage();
    await ready();
    selectFilter("disabled-bots");
    await waitFor(() => expect(screen.getByTestId("admin-user-p-offbot")).toBeTruthy());
    const card = screen.getByTestId("admin-user-p-offbot");
    fireEvent.click(within(card).getByTestId("bot-toggle-p-offbot"));
    await waitFor(() => {
      const call = mocks.rpc.mock.calls.find((c) => c[0] === "admin_update_bot_profile");
      expect(call![1]).toMatchObject({ _profile_id: "p-offbot", _is_disabled: false });
    });
  });
});
