import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MogzyIdentityMenu from "./MogzyIdentityMenu";
import { inbox } from "@/test/notifications/inboxServer";

/**
 * Notifications 2.0 (#92) — the admin section of the HUD bell.
 *
 * Preserved from NOT1 Phase 2: admin read state is PER ADMIN and never comes
 * from admin_notifications.is_read. In v2 the server scopes every read and
 * write to auth.uid(); the client never names an admin. The bell and the admin
 * page read the same per-admin state, so they agree without a reload.
 */

vi.mock("@/hooks/useChampionCardDuelInvites", () => ({
  useChampionCardDuelInvites: () => ({ invites: [], busyToken: null, accept: vi.fn(), acceptSwitch: vi.fn(), decline: vi.fn(), refresh: vi.fn() }),
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
const ownerCtx = vi.hoisted(() => ({ authorized: true, needsMfa: false }));
vi.mock("@/hooks/useOwnerAuth", () => ({
  useOwnerAuth: () => ({ isOwner: ownerCtx.authorized || ownerCtx.needsMfa, authorized: ownerCtx.authorized, loading: false }),
}));
vi.mock("@/hooks/useAppSettings", () => ({ useAppSettings: () => ({ settings: {} }) }));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: vi.fn() }) }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
const authState = vi.hoisted(() => ({ user: { id: "admin-a", is_anonymous: false } as null | { id: string; is_anonymous?: boolean }, signOut: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastFn }));
vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("@/test/notifications/inboxServer")).inbox.client,
}));

beforeEach(() => {
  inbox.reset();
  authState.user = { id: "admin-a", is_anonymous: false };
  ownerCtx.authorized = true;
  ownerCtx.needsMfa = false;
  inbox.admin = [
    {
      id: "q1", type: "feedback", category: "action", priority: "high", title: "New feedback: Wrong answer",
      subject_type: "feedback", subject_id: "fb-1", metadata: { feedback: { entry_intent: "question_report" } },
    },
    { id: "c1", type: "comment_report", category: "action", priority: "critical", title: "Comment auto-hidden", subject_type: "comment", subject_id: "cm-1", occurrence_count: 6 },
    { id: "s1", type: "feedback", category: "community", title: "New feedback: idea", is_read: true },
  ];
});
afterEach(() => vi.clearAllMocks());

const openPanel = async () => {
  fireEvent.click(screen.getByTestId("hud-notifications-trigger"));
  return screen.findByTestId("notification-panel");
};

describe("HUD admin section", () => {
  it("shows the Action Required counters and its top items, critical first", async () => {
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    const summary = await within(panel).findByTestId("hud-admin-summary");
    expect(summary.textContent).toMatch(/2 need action/);
    expect(summary.textContent).toMatch(/1 critical/);
    expect(summary.getAttribute("href")).toBe("/admin/operations?section=notifications");
    const rows = within(panel).getAllByTestId(/^hud-admin-notification-/);
    expect(rows[0].getAttribute("data-testid")).toBe("hud-admin-notification-c1");
    expect(rows[0].textContent).toMatch(/×6/);
    expect(inbox.calls("admin_get_notifications")[0].args).toMatchObject({ _tab: "action" });
  });

  it("badges this admin's unread active items, and nothing done or resolved", async () => {
    inbox.admin.push({ id: "old", type: "system_notice", category: "platform", title: "Done", done: true });
    inbox.admin.push({ id: "res", type: "comment_report", category: "action", title: "Resolved", resolved_at: "2026-10-01T00:00:00Z" });
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("2"));
  });

  it("opens the exact record a row is about, leaving read-marking to the record view", async () => {
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    fireEvent.click(await within(panel).findByTestId("hud-admin-notification-q1"));
    expect(navigate).toHaveBeenCalledWith("/admin/users?section=moderation&view=feedback&focus=fb-1&from_notification=q1");
    // Read is recorded by the destination once the record has opened; a click
    // that lands on a deleted record must not mark it read.
    expect(inbox.calls("admin_set_notification_state")).toHaveLength(0);
    for (const c of inbox.rpcCalls) expect(JSON.stringify(c.args)).not.toContain("admin-a");
  });

  it("sends a comment report to its comment and a system notice to its own permalink", async () => {
    inbox.admin.push({ id: "p9", type: "system_notice", category: "action", priority: "critical", title: "Patch ingest failed" });
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    fireEvent.click(await within(panel).findByTestId("hud-admin-notification-c1"));
    expect(navigate).toHaveBeenLastCalledWith("/admin/users?section=moderation&view=comments&focus=cm-1&from_notification=c1");
    const again = await openPanel();
    fireEvent.click(await within(again).findByTestId("hud-admin-notification-p9"));
    expect(navigate).toHaveBeenLastCalledWith("/admin/operations?section=notifications&notification=p9");
  });

  it("Mark all read clears both sections, and reading never resolves a report", async () => {
    inbox.player = [{ id: "p", type: "update", title: "News" }];
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("3"));
    const panel = await openPanel();
    fireEvent.click(within(panel).getByText("Mark all read"));
    await waitFor(() => expect(screen.queryByTestId("hud-unread-badge")).toBeNull());
    expect(inbox.calls("admin_set_notification_state")[0].args).toEqual({ _ids: null, _action: "read", _tab: "all" });
    expect(within(panel).getByTestId("hud-admin-summary").textContent).toMatch(/2 need action/);
  });

  it("never reads admin_notifications.is_read for read state", async () => {
    render(<MogzyIdentityMenu />);
    await openPanel();
    await waitFor(() => expect(inbox.calls("admin_notification_counts").length).toBeGreaterThan(0));
    expect(inbox.fromCalls.filter(c => c.table === "admin_notifications")).toEqual([]);
  });

  it("scopes its receipt and state subscriptions to this admin and converges on another tab's read", async () => {
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(screen.getByTestId("hud-unread-badge").textContent).toBe("2"));
    for (const l of inbox.listeners.filter(x => x.table.startsWith("admin_notification_"))) {
      expect(l.filter).toBe("admin_user_id=eq.admin-a");
    }
    inbox.admin.forEach(r => (r.is_read = true)); // read on the admin page in another tab
    act(() => inbox.emit("admin_notification_reads", "INSERT", { admin_user_id: "admin-a" }));
    await waitFor(() => expect(screen.queryByTestId("hud-unread-badge")).toBeNull());
  });

  it("toasts a newly arrived admin notification", async () => {
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(inbox.calls("admin_notification_counts").length).toBeGreaterThan(0));
    act(() => inbox.emit("admin_notifications", "INSERT", { id: "x", title: "User reported", message: "Reason: spam" }));
    expect(toastFn).toHaveBeenCalledWith("User reported", expect.objectContaining({ description: "Reason: spam" }));
  });

  it("gives a non-owner, or the owner still needing MFA, no admin feed at all", async () => {
    ownerCtx.authorized = false;
    ownerCtx.needsMfa = true;
    render(<MogzyIdentityMenu />);
    const panel = await openPanel();
    await waitFor(() => expect(inbox.calls("get_my_notifications").length).toBeGreaterThan(0));
    expect(within(panel).queryByTestId("hud-admin-section")).toBeNull();
    expect(inbox.rpcCalls.some(c => c.name.startsWith("admin_"))).toBe(false);
  });

  it("legacy fallback: reads receipts for this admin only and never is_read", async () => {
    inbox.legacy = true;
    inbox.legacyAdminReads = [{ notification_id: "q1", admin_user_id: "someone-else" }];
    render(<MogzyIdentityMenu />);
    await openPanel();
    await waitFor(() => expect(inbox.fromCalls.some(c => c.table === "admin_notifications")).toBe(true));
    const cols = inbox.fromCalls.find(c => c.table === "admin_notifications" && c.op === "select")!.payload as string;
    expect(cols).not.toContain("is_read");
  });
});
