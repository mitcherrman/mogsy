import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MogzyIdentityMenu from "./MogzyIdentityMenu";
import { inbox } from "@/test/notifications/inboxServer";

/**
 * Notifications 2.0 (#92) — the HUD bell, player side.
 *
 * The server decides what is in the inbox (active, addressed to me, not done,
 * not expired, not resolved, not muted) and what the badge counts. The fake
 * server in inboxServer.ts implements those semantics; the SQL itself is run
 * for real in src/test/security/notificationsV2Lifecycle.test.ts.
 */

const invitesHook = vi.hoisted(() => ({
  invites: [] as unknown[],
  busyToken: null as string | null,
  accept: vi.fn(),
  acceptSwitch: vi.fn(),
  decline: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useChampionCardDuelInvites", () => ({
  useChampionCardDuelInvites: () => invitesHook,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/lol", search: "" }),
  Link: ({ to, children, onClick, ...rest }: Record<string, unknown> & { to: string; children?: unknown; onClick?: (e: unknown) => void }) => (
    <a href={to} {...rest} onClick={e => { e.preventDefault(); onClick?.(e); }}>
      {children as never}
    </a>
  ),
}));

const ownerCtx = vi.hoisted(() => ({ authorized: false, needsMfa: false }));
vi.mock("@/hooks/useOwnerAuth", () => ({
  useOwnerAuth: () => ({ isOwner: ownerCtx.authorized || ownerCtx.needsMfa, authorized: ownerCtx.authorized, loading: false }),
}));
vi.mock("@/hooks/useAppSettings", () => ({ useAppSettings: () => ({ settings: {} }) }));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: vi.fn() }) }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; is_anonymous?: boolean; created_at?: string },
  signOut: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastFn }));

vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("@/test/notifications/inboxServer")).inbox.client,
}));

const UID = "auth-uid";

beforeEach(() => {
  inbox.reset();
  authState.user = { id: UID, is_anonymous: false, created_at: "2026-01-01T00:00:00Z" };
  ownerCtx.authorized = false;
  ownerCtx.needsMfa = false;
  invitesHook.invites = [];
});
afterEach(() => vi.clearAllMocks());

const trigger = () => screen.getByTestId("hud-notifications-trigger");
const openPanel = async () => {
  fireEvent.click(trigger());
  return screen.findByTestId("notification-panel");
};
const ready = () => waitFor(() => expect(screen.queryByTestId("notification-loading")).toBeNull());

describe("visibility", () => {
  it("gives a signed-out visitor and an anonymous session no inbox, and asks the server nothing", async () => {
    authState.user = null;
    const { unmount } = render(<MogzyIdentityMenu />);
    fireEvent.click(trigger());
    expect(screen.queryByTestId("notification-panel")).toBeNull();
    unmount();
    authState.user = { id: UID, is_anonymous: true };
    render(<MogzyIdentityMenu />);
    fireEvent.click(trigger());
    expect(screen.queryByTestId("notification-panel")).toBeNull();
    expect(inbox.rpcCalls).toEqual([]);
  });

  it("asks only for its own inbox, never naming an account", async () => {
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(inbox.calls("get_my_notifications").length).toBeGreaterThan(0));
    for (const c of inbox.rpcCalls) {
      expect(Object.keys(c.args)).not.toEqual(expect.arrayContaining(["_user_id"]));
      expect(JSON.stringify(c.args)).not.toContain(UID);
    }
    expect(inbox.calls("get_my_notifications")[0].args).toMatchObject({ _view: "inbox" });
  });
});

describe("inbox and badge", () => {
  it("renders the server's inbox and badges only unread active items", async () => {
    inbox.player = [
      { id: "a", type: "friend_request", title: "Ana sent you a friend request", metadata: { requester_profile_id: "p-ana" } },
      { id: "b", type: "update", title: "Patch 26.20 is live", is_read: true },
      { id: "c", type: "general", title: "Old news", done: true },
      { id: "d", type: "general", title: "Expired", state: "expired" },
    ];
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("1"));
    expect(trigger().getAttribute("aria-label")).toBe("Open notifications: 1 unread");
    const panel = await openPanel();
    await ready();
    expect(within(panel).getByText("Ana sent you a friend request")).toBeTruthy();
    expect(within(panel).getByText("Needs your response")).toBeTruthy();
    expect(within(panel).getByText("Patch 26.20 is live")).toBeTruthy();
    expect(within(panel).queryByText("Old news")).toBeNull();
    expect(within(panel).queryByText("Expired")).toBeNull();
  });

  it("does not count a muted category in the inbox or the badge", async () => {
    inbox.player = [
      { id: "a", type: "update", title: "Muted news" },
      { id: "b", type: "warning", title: "Account notice" },
    ];
    inbox.muted = ["announcement"];
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("1"));
    const panel = await openPanel();
    expect(within(panel).queryByText("Muted news")).toBeNull();
    expect(within(panel).getByText("Account notice")).toBeTruthy();
  });

  it("shows an empty state and links to history and settings", async () => {
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    await ready();
    expect(within(panel).getByTestId("notification-empty").textContent).toMatch(/all caught up/i);
    expect(within(panel).getByTestId("hud-notification-history").getAttribute("href")).toBe("/notifications");
  });
});

describe("lifecycle actions", () => {
  it("Dismiss removes a row, and a refetch does not bring it back", async () => {
    inbox.player = [{ id: "a", type: "update", title: "Dismiss me" }, { id: "b", type: "update", title: "Keep me" }];
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    await within(panel).findByText("Dismiss me");
    fireEvent.click(within(panel).getByRole("button", { name: "Dismiss: Dismiss me" }));
    await waitFor(() => expect(within(panel).queryByText("Dismiss me")).toBeNull());
    expect(inbox.calls("set_my_notification_state")[0].args).toEqual({ _ids: ["a"], _action: "done" });
    act(() => inbox.emitStatus("SUBSCRIBED")); // reconnect → re-read from the server
    await waitFor(() => expect(inbox.calls("get_my_notifications").length).toBeGreaterThan(2));
    expect(within(panel).queryByText("Dismiss me")).toBeNull();
    expect(within(panel).getByText("Keep me")).toBeTruthy();
  });

  it("Mark all read clears unread but leaves a pending invitation actionable", async () => {
    inbox.player = [{ id: "a", type: "update", title: "One" }, { id: "b", type: "update", title: "Two" }];
    invitesHook.invites = [{ inviteToken: "t1", displayName: "Kai", avatarUrl: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() }];
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("3"));
    const panel = await openPanel();
    fireEvent.click(within(panel).getByText("Mark all read"));
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("1"));
    expect(inbox.calls("set_my_notification_state")[0].args).toMatchObject({ _action: "read_all" });
    expect(within(panel).getByTestId("ccd-invite-notification")).toBeTruthy();
    expect(trigger().getAttribute("aria-label")).toBe("Open notifications: 1 pending invitation");
  });

  it("Clear all empties the inbox for this player only", async () => {
    inbox.player = [{ id: "a", type: "update", title: "One" }];
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    await within(panel).findByText("One");
    fireEvent.click(within(panel).getByTestId("notification-clear-all"));
    await waitFor(() => expect(within(panel).getByTestId("notification-empty")).toBeTruthy());
    expect(inbox.calls("set_my_notification_state")[0].args).toMatchObject({ _action: "done_all" });
  });

  it("does not leave a row dismissed when the write failed", async () => {
    inbox.player = [{ id: "a", type: "update", title: "Sticky" }];
    inbox.errors.set_my_notification_state = { message: "network" };
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    await within(panel).findByText("Sticky");
    fireEvent.click(within(panel).getByRole("button", { name: "Dismiss: Sticky" }));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    expect(within(panel).getByText("Sticky")).toBeTruthy();
  });

  it("opening a row marks it read and routes by type", async () => {
    inbox.player = [
      { id: "r", type: "friend_request", title: "Request", metadata: { requester_profile_id: "p1" } },
      { id: "a", type: "friend_accepted", title: "Accepted", metadata: { addressee_profile_id: "p2" } },
      { id: "f", type: "feedback_update", title: "Update on your report", action_url: "/feedback" },
    ];
    const opened = vi.fn();
    window.addEventListener("open-friends-panel", opened);
    render(<MogzyIdentityMenu />);
    let panel = await openPanel();
    fireEvent.click(await within(panel).findByText("Request"));
    expect(opened).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(inbox.calls("set_my_notification_state")[0].args).toEqual({ _ids: ["r"], _action: "read" }));
    panel = await openPanel();
    fireEvent.click(await within(panel).findByText("Accepted"));
    expect(navigate).toHaveBeenCalledWith("/user/p2");
    panel = await openPanel();
    fireEvent.click(await within(panel).findByText("Update on your report"));
    expect(navigate).toHaveBeenCalledWith("/feedback");
    window.removeEventListener("open-friends-panel", opened);
  });
});

describe("live updates", () => {
  it("refetches on a realtime change and toasts only personal or important arrivals", async () => {
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(inbox.calls("get_my_notifications").length).toBe(1));
    inbox.player.push({ id: "n1", type: "update", title: "Routine news" });
    inbox.player.push({ id: "n2", type: "friend_request", title: "Bo sent you a friend request" });
    act(() => inbox.emit("user_notifications", "INSERT", { id: "n2" }));
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("2"));
    expect(toastFn).toHaveBeenCalledWith("Bo sent you a friend request", expect.anything());
    expect(toastFn).not.toHaveBeenCalledWith("Routine news", expect.anything());
  });

  it("converges when another tab or device changes this player's state", async () => {
    inbox.player = [{ id: "a", type: "update", title: "Seen elsewhere" }];
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("1"));
    inbox.player[0].done = true; // written by another device
    act(() => inbox.emit("user_notification_states", "INSERT", { user_id: UID }));
    await waitFor(() => expect(screen.queryByTestId("hud-unread-badge")).toBeNull());
    const filters = inbox.listeners.filter(l => l.table !== "user_notifications").map(l => l.filter);
    expect(filters.every(f => f === `user_id=eq.${UID}`)).toBe(true);
  });

  it("surfaces a failed load as an error with a retry, never a confident empty bell", async () => {
    inbox.errors.get_my_notifications = { message: "boom" };
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    await within(panel).findByTestId("notification-error");
    delete inbox.errors.get_my_notifications;
    inbox.player = [{ id: "a", type: "update", title: "Back" }];
    fireEvent.click(within(panel).getByText("Try again"));
    expect(await within(panel).findByText("Back")).toBeTruthy();
  });

  it("#146: a refused owner feed reports in its own section and never hides the owner's player notifications", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ownerCtx.authorized = true;
    inbox.player = [{ id: "a", type: "update", title: "Patch 26.21 is live" }];
    inbox.errors.admin_get_notifications = { code: "42501", message: "admin role required" };
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    expect(await within(panel).findByText("Patch 26.21 is live")).toBeTruthy();
    const adminError = await within(panel).findByTestId("hud-admin-error");
    expect(within(panel).queryByTestId("notification-error")).toBeNull();
    expect(within(adminError).getByTestId("notification-error-detail").textContent).toBe(
      "Admin session needs re-verification. (admin_get_notifications · 42501)",
    );
    delete inbox.errors.admin_get_notifications;
    fireEvent.click(within(adminError).getByText("Try again"));
    expect(await within(panel).findByTestId("hud-admin-summary")).toBeTruthy();
    expect(within(panel).queryByTestId("hud-admin-error")).toBeNull();
  });
});

describe("invitations", () => {
  it("never shows an expired invitation as actionable", async () => {
    invitesHook.invites = [{ inviteToken: "old", displayName: "Old", avatarUrl: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString() }];
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    await ready();
    expect(within(panel).queryByTestId("ccd-invite-notification")).toBeNull();
    expect(screen.queryByTestId("hud-unread-badge")).toBeNull();
  });
});

describe("before the migration (legacy fallback)", () => {
  it("falls back to the legacy tables, keeps recipient scoping, and hides lifecycle actions", async () => {
    inbox.legacy = true;
    inbox.player = [
      { id: "mine", type: "friend_request", title: "For me", target_type: "user", profile_id: "profile-1" },
      { id: "theirs", type: "friend_request", title: "For someone else", target_type: "user", profile_id: "profile-2" },
      { id: "bcast", type: "update", title: "Broadcast" },
      { id: "legacy", type: "promotion", title: "Retired type" },
      { id: "comment", type: "comment_reply", title: "Not activated" },
    ];
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    await within(panel).findByText("For me");
    expect(within(panel).getByText("Broadcast")).toBeTruthy();
    expect(within(panel).queryByText("For someone else")).toBeNull();
    expect(within(panel).queryByText("Retired type")).toBeNull();
    expect(within(panel).queryByText("Not activated")).toBeNull();
    expect(within(panel).queryByTestId("notification-dismiss")).toBeNull();
    expect(within(panel).queryByTestId("notification-clear-all")).toBeNull();
    // Explicit columns only — never `*`, which would expose sent_by_user_id.
    const cols = inbox.fromCalls.find(c => c.table === "user_notifications" && c.op === "select")?.payload as string;
    expect(cols).not.toContain("*");
    expect(cols).not.toContain("sent_by_user_id");

    fireEvent.click(within(panel).getByText("Mark all read"));
    await waitFor(() => expect(inbox.fromCalls.some(c => c.table === "user_notification_reads" && c.op === "upsert")).toBe(true));
    const upsert = inbox.fromCalls.find(c => c.table === "user_notification_reads" && c.op === "upsert")!;
    expect(upsert.opts).toEqual({ onConflict: "notification_id,user_id", ignoreDuplicates: true });
  });
});

describe("accessibility", () => {
  it("closes on Escape and returns focus to the trigger", async () => {
    render(<MogzyIdentityMenu />);
    await openPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("notification-panel")).toBeNull());
    expect(document.activeElement).toBe(trigger());
  });
});
