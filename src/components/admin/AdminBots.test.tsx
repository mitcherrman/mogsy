/**
 * Admin · Bots — League bot-persona management.
 *
 * Asserts the modernized form (no dating fields), the opt-in auto-friend
 * checkbox, editing, soft-disable / re-enable, the absence of any delete
 * control, and that admin surfaces always show true bot state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  rows: [] as Record<string, unknown>[],
  friendsNotified: 0,
  toasts: [] as { kind: string; message: string }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: mocks.rows, error: null }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/community/friends-refresh", () => ({
  notifyFriendsChanged: () => {
    mocks.friendsNotified += 1;
  },
  subscribeFriendsChanged: () => () => {},
}));
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => mocks.toasts.push({ kind: "success", message: m }),
    error: (m: string) => mocks.toasts.push({ kind: "error", message: m }),
    warning: (m: string) => mocks.toasts.push({ kind: "warning", message: m }),
  },
}));

import AdminBots from "./AdminBots";

const BOTS = [
  {
    id: "bot-on",
    display_name: "Nova",
    avatar_url: null,
    profile_frame: "gold",
    is_disabled: false,
    created_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "bot-off",
    display_name: "Retired",
    avatar_url: null,
    profile_frame: null,
    is_disabled: true,
    created_at: "2026-07-01T00:00:00Z",
  },
];

beforeEach(() => {
  mocks.rows = [...BOTS];
  mocks.friendsNotified = 0;
  mocks.toasts = [];
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_create_bot_profile") {
      return { data: { ok: true, code: "created", profile_id: "new-bot", friendship: null }, error: null };
    }
    return { data: { ok: true, code: "updated", profile_id: "x" }, error: null };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the create form", () => {
  it("offers only League persona fields", async () => {
    render(<AdminBots />);
    await screen.findByLabelText("Display name");
    expect(screen.getByLabelText("Avatar URL")).toBeTruthy();
    expect(screen.getByLabelText("Profile frame")).toBeTruthy();
  });

  it.each(["Age", "Location", "Status Message", "Status message", "Socials"])(
    "no longer offers the legacy dating field %s",
    async (label) => {
      render(<AdminBots />);
      await screen.findByLabelText("Display name");
      expect(screen.queryByLabelText(label)).toBeNull();
    },
  );

  it("defaults the auto-friend checkbox to off", async () => {
    render(<AdminBots />);
    const box = await screen.findByTestId("bot-add-to-friends");
    expect((box as HTMLInputElement).checked).toBe(false);
  });

  it("creates without a friendship when the box is unticked", async () => {
    render(<AdminBots />);
    fireEvent.change(await screen.findByLabelText("Display name"), {
      target: { value: "Nova Two" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => {
      const call = mocks.rpc.mock.calls.find((c) => c[0] === "admin_create_bot_profile");
      expect(call![1]).toMatchObject({ _display_name: "Nova Two", _add_to_my_friends: false });
    });
    expect(mocks.friendsNotified).toBe(0);
  });

  it("creates with a friendship and refreshes the drawer when the box is ticked", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_create_bot_profile") {
        return {
          data: {
            ok: true,
            code: "created",
            profile_id: "new-bot",
            friendship: { ok: true, code: "created", friendship_id: "f1" },
          },
          error: null,
        };
      }
      return { data: { ok: true, code: "updated" }, error: null };
    });
    render(<AdminBots />);
    fireEvent.change(await screen.findByLabelText("Display name"), { target: { value: "Nova Two" } });
    fireEvent.click(screen.getByTestId("bot-add-to-friends"));
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(mocks.friendsNotified).toBe(1));
    expect(mocks.toasts.some((t) => t.kind === "success")).toBe(true);
  });

  it("warns rather than claiming success when the friendship step fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_create_bot_profile") {
        return {
          data: {
            ok: true,
            code: "created",
            profile_id: "new-bot",
            friendship: { ok: false, code: "blocked", friendship_id: null },
          },
          error: null,
        };
      }
      return { data: { ok: true, code: "updated" }, error: null };
    });
    render(<AdminBots />);
    fireEvent.change(await screen.findByLabelText("Display name"), { target: { value: "N" } });
    fireEvent.click(screen.getByTestId("bot-add-to-friends"));
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(mocks.toasts.some((t) => t.kind === "warning")).toBe(true));
    expect(mocks.friendsNotified).toBe(0);
  });

  it("resets the auto-friend checkbox after a successful create", async () => {
    render(<AdminBots />);
    fireEvent.change(await screen.findByLabelText("Display name"), { target: { value: "N" } });
    fireEvent.click(screen.getByTestId("bot-add-to-friends"));
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() =>
      expect((screen.getByTestId("bot-add-to-friends") as HTMLInputElement).checked).toBe(false),
    );
  });

  it("does not call the server for an empty display name", async () => {
    render(<AdminBots />);
    await screen.findByLabelText("Display name");
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() =>
      expect(mocks.rpc.mock.calls.filter((c) => c[0] === "admin_create_bot_profile")).toHaveLength(0),
    );
  });
});

describe("the bot list", () => {
  it("always shows bot state, regardless of any platform policy", async () => {
    render(<AdminBots />);
    expect((await screen.findByTestId("bot-state-bot-on")).textContent).toBe("Enabled");
    expect(screen.getByTestId("bot-state-bot-off").textContent).toBe("Disabled");
  });

  it("has no delete control anywhere", async () => {
    const { container } = render(<AdminBots />);
    await screen.findByTestId("bot-row-bot-on");
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(container.textContent ?? "").not.toMatch(/delete/i);
  });

  it("disables an enabled bot", async () => {
    render(<AdminBots />);
    fireEvent.click(await screen.findByTestId("bot-toggle-bot-on"));
    await waitFor(() => {
      const call = mocks.rpc.mock.calls.find((c) => c[0] === "admin_update_bot_profile");
      expect(call![1]).toMatchObject({ _profile_id: "bot-on", _is_disabled: true });
    });
  });

  it("re-enables a disabled bot", async () => {
    render(<AdminBots />);
    fireEvent.click(await screen.findByTestId("bot-toggle-bot-off"));
    await waitFor(() => {
      const call = mocks.rpc.mock.calls.find((c) => c[0] === "admin_update_bot_profile");
      expect(call![1]).toMatchObject({ _profile_id: "bot-off", _is_disabled: false });
    });
  });
});

describe("editing", () => {
  it("saves the persona fields and never sends is_bot", async () => {
    render(<AdminBots />);
    fireEvent.click(await screen.findByTestId("bot-edit-open-bot-on"));
    const editor = await screen.findByTestId("bot-edit-bot-on");
    fireEvent.change(within(editor).getByLabelText("Display name"), {
      target: { value: "Nova Prime" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      const call = mocks.rpc.mock.calls.find((c) => c[0] === "admin_update_bot_profile");
      expect(call![1]).toMatchObject({ _profile_id: "bot-on", _display_name: "Nova Prime" });
      expect(Object.keys(call![1] as object)).not.toContain("_is_bot");
    });
  });

  it("reports a server refusal instead of showing a success", async () => {
    mocks.rpc.mockImplementation(async () => ({
      data: { ok: false, code: "not_a_bot" },
      error: null,
    }));
    render(<AdminBots />);
    fireEvent.click(await screen.findByTestId("bot-edit-open-bot-on"));
    const editor = await screen.findByTestId("bot-edit-bot-on");
    fireEvent.click(within(editor).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mocks.toasts.some((t) => t.kind === "error")).toBe(true));
    expect(mocks.toasts.some((t) => t.kind === "success")).toBe(false);
  });

  it("cancelling leaves the row untouched", async () => {
    render(<AdminBots />);
    fireEvent.click(await screen.findByTestId("bot-edit-open-bot-on"));
    const editor = await screen.findByTestId("bot-edit-bot-on");
    fireEvent.click(within(editor).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.getByTestId("bot-row-bot-on")).toBeTruthy());
    expect(mocks.rpc.mock.calls.filter((c) => c[0] === "admin_update_bot_profile")).toHaveLength(0);
  });
});
