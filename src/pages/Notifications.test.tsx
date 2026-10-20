import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Notifications from "./Notifications";
import { inbox } from "@/test/notifications/inboxServer";

/**
 * Notifications 2.0 (#92) — the player's notification page: inbox, saved,
 * history, and control over OPTIONAL categories only.
 */

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
const authState = vi.hoisted(() => ({
  user: { id: "player-a", is_anonymous: false, created_at: "2026-01-01T00:00:00Z" } as null | { id: string; is_anonymous?: boolean; created_at?: string },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastFn }));
vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("@/test/notifications/inboxServer")).inbox.client,
}));

beforeEach(() => {
  inbox.reset();
  authState.user = { id: "player-a", is_anonymous: false, created_at: "2026-01-01T00:00:00Z" };
  inbox.player = [
    { id: "a", type: "update", title: "Patch notes", created_at: "2026-10-19T10:00:00.000Z" },
    { id: "b", type: "friend_request", title: "Ana sent you a friend request", created_at: "2026-10-19T09:00:00.000Z" },
    { id: "c", type: "general", title: "Old event", done: true, created_at: "2026-10-01T00:00:00.000Z" },
    { id: "d", type: "friend_request", title: "Withdrawn request", state: "resolved", resolution: "withdrawn", created_at: "2026-10-02T00:00:00.000Z" },
  ];
});
afterEach(() => vi.clearAllMocks());

describe("views", () => {
  it("shows the inbox, then the full history with why each item left", async () => {
    render(<Notifications />);
    expect(await screen.findByText("Patch notes")).toBeTruthy();
    expect(screen.getByText("Needs your response")).toBeTruthy();
    expect(screen.queryByText("Old event")).toBeNull();
    fireEvent.click(screen.getByTestId("notifications-view-history"));
    const old = await screen.findByTestId("notifications-item-c");
    expect(old.textContent).toMatch(/Dismissed/);
    expect(screen.getByTestId("notifications-item-d").textContent).toMatch(/Withdrawn/);
    // A no-longer-actionable request does not claim it needs a response.
    expect(within(screen.getByTestId("notifications-item-d")).queryByText("Needs your response")).toBeNull();
  });

  it("dismissed items can be moved back; saved items have their own view", async () => {
    render(<Notifications />);
    await screen.findByText("Patch notes");
    fireEvent.click(screen.getByRole("button", { name: "Save: Patch notes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unsave: Patch notes" })).toBeTruthy());
    fireEvent.click(screen.getByTestId("notifications-view-saved"));
    expect(await screen.findByTestId("notifications-item-a")).toBeTruthy();
    fireEvent.click(screen.getByTestId("notifications-view-history"));
    fireEvent.click(await screen.findByRole("button", { name: "Move back to inbox: Old event" }));
    await waitFor(() => expect(screen.queryByTestId("notifications-item-c")).toBeNull());
    fireEvent.click(screen.getByTestId("notifications-view-inbox"));
    expect(await screen.findByText("Old event")).toBeTruthy();
  });

  it("asks a guest to sign in and fetches nothing", () => {
    authState.user = null;
    render(<Notifications />);
    expect(screen.getByText(/Sign in to see your notifications/)).toBeTruthy();
    expect(inbox.rpcCalls).toEqual([]);
  });
});

describe("preferences", () => {
  it("mutes an optional category through the own-row RPC, and the inbox follows", async () => {
    render(<Notifications />);
    await screen.findByText("Patch notes");
    const toggle = await screen.findByTestId("notification-pref-announcement");
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(toggle);
    await waitFor(() => expect(inbox.calls("set_my_notification_preferences")[0].args).toEqual({ _muted: ["announcement"] }));
    expect(inbox.muted).toEqual(["announcement"]);
  });

  it("lists account and security notices as always on, with no control", async () => {
    render(<Notifications />);
    const prefs = await screen.findByTestId("notification-preferences");
    expect(within(prefs).getByText("Account notices")).toBeTruthy();
    expect(within(prefs).getByText("Security notices")).toBeTruthy();
    expect(within(prefs).queryByTestId("notification-pref-account")).toBeNull();
    expect(within(prefs).queryByTestId("notification-pref-security")).toBeNull();
  });

  it("rolls the switch back and says so when saving fails", async () => {
    inbox.errors.set_my_notification_preferences = { message: "nope" };
    render(<Notifications />);
    const toggle = await screen.findByTestId("notification-pref-social");
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(toggle);
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});
