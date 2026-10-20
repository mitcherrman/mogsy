import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminNotifications from "./AdminNotifications";
import { inbox } from "@/test/notifications/inboxServer";

/**
 * Notifications 2.0 (#92) — the admin inbox page.
 *
 * Read (seen, per admin), Done (cleared from MY inbox, per admin) and Resolved
 * (the underlying report was handled, shared) are three different things, and
 * this page must never let one stand in for another. Unresolved Action
 * Required work cannot be marked done; it links to its record instead.
 */

const authState = vi.hoisted(() => ({ user: { id: "admin-a" } as null | { id: string } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastFn }));
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, onClick, ...rest }: Record<string, unknown> & { to: string; children?: unknown; onClick?: (e: unknown) => void }) => (
    <a href={to} {...rest} onClick={e => { e.preventDefault(); onClick?.(e); }}>
      {children as never}
    </a>
  ),
}));
vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("@/test/notifications/inboxServer")).inbox.client,
}));

const question = {
  id: "q1",
  type: "feedback",
  category: "action" as const,
  priority: "high" as const,
  title: "New feedback: Wrong answer",
  message: "The answer key is wrong",
  subject_type: "feedback",
  subject_id: "fb-1",
  created_at: "2026-10-19T10:00:00.000Z",
  metadata: {
    feedback_id: "fb-1",
    feedback: {
      entry_intent: "question_report",
      reason: "incorrect_answer",
      question_prompt: "Which item gives 40 AD?",
      selected_answer: "Long Sword",
      canonical_answer: "Pickaxe",
      has_evidence: true,
      status: "in-progress",
    },
  },
};

beforeEach(() => {
  inbox.reset();
  authState.user = { id: "admin-a" };
  inbox.admin = [
    structuredClone(question),
    { id: "c1", type: "comment_report", category: "action", priority: "critical", title: "Comment auto-hidden", subject_type: "comment", subject_id: "cm-1", occurrence_count: 6, created_at: "2026-10-18T10:00:00.000Z" },
    { id: "s1", type: "feedback", category: "community", priority: "normal", title: "New feedback: dark mode please", subject_type: "feedback", subject_id: "fb-2", created_at: "2026-10-17T10:00:00.000Z" },
    { id: "s2", type: "feedback", category: "community", priority: "normal", title: "New feedback: more modes", subject_type: "feedback", subject_id: "fb-3", created_at: "2026-10-16T10:00:00.000Z", is_read: true },
    { id: "p1", type: "system_notice", category: "platform", priority: "low", title: "Nightly job ran", created_at: "2026-10-15T10:00:00.000Z" },
    { id: "r1", type: "user_report", category: "action", priority: "high", title: "Old report", subject_type: "user_report", subject_id: "ur-1", resolved_at: "2026-10-10T00:00:00Z", resolution: "resolved_report" },
  ];
});
afterEach(() => vi.clearAllMocks());

const row = (id: string) => screen.getByTestId(`admin-notification-${id}`);
const tab = (id: string) => screen.getByTestId(`admin-notif-tab-${id}`);

describe("organisation and counters", () => {
  it("opens on Action Required, critical first, with separate unresolved and unread counts", async () => {
    const onReadChange = vi.fn();
    render(<AdminNotifications onReadChange={onReadChange} />);
    await screen.findByTestId("admin-notification-c1");
    const ids = screen.getAllByTestId(/^admin-notification-[a-z]\d$/).map(e => e.getAttribute("data-testid"));
    expect(ids).toEqual(["admin-notification-c1", "admin-notification-q1"]);
    expect(screen.getByTestId("admin-notification-summary").textContent).toMatch(/2 unresolved · 1 critical · 4 unread/);
    expect(tab("action").getAttribute("aria-selected")).toBe("true");
    expect(within(tab("action")).getByLabelText(/2 unresolved, 2 unread/)).toBeTruthy();
    expect(within(tab("community")).getByText("2")).toBeTruthy();
    await waitFor(() => expect(onReadChange).toHaveBeenLastCalledWith(4));
  });

  it("shows a question report's question, problem, answers, evidence and live review status", async () => {
    render(<AdminNotifications />);
    const q = await screen.findByTestId("admin-notification-q1");
    const digest = within(q).getByTestId("admin-notification-feedback");
    expect(digest.textContent).toMatch(/Question report/);
    expect(digest.textContent).toMatch(/Incorrect answer/);
    expect(digest.textContent).toMatch(/Which item gives 40 AD\?/);
    expect(digest.textContent).toMatch(/Long Sword/);
    expect(digest.textContent).toMatch(/Pickaxe/);
    expect(digest.textContent).toMatch(/Evidence attached/);
    expect(digest.textContent).toMatch(/Review: In progress/);
    const link = within(q).getByRole("link", { name: /Open feedback/ });
    expect(link.getAttribute("href")).toBe("/admin/users?section=moderation&view=feedback&focus=fb-1");
  });

  it("shows a deduplicated report's occurrence count", async () => {
    render(<AdminNotifications />);
    expect(within(await screen.findByTestId("admin-notification-c1")).getByText("×6 reports")).toBeTruthy();
  });
});

describe("read, done and resolved stay distinct", () => {
  it("will not mark unresolved Action Required work done, and reading does not resolve it", async () => {
    render(<AdminNotifications />);
    const q = await screen.findByTestId("admin-notification-q1");
    const done = within(q).getByRole("button", { name: /Done/ }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(done.title).toMatch(/Resolve the underlying item first/);
    fireEvent.click(within(q).getByRole("button", { name: /Mark read/ }));
    await waitFor(() => expect(row("q1").getAttribute("data-read")).toBe("true"));
    expect(row("q1").getAttribute("data-state")).toBe("active");
    expect(inbox.calls("admin_set_notification_state")[0].args).toEqual({ _ids: ["q1"], _action: "read", _tab: null });
  });

  it("opening the record marks it read for this admin", async () => {
    render(<AdminNotifications />);
    const q = await screen.findByTestId("admin-notification-q1");
    fireEvent.click(within(q).getByRole("link", { name: /Open feedback/ }));
    await waitFor(() => expect(inbox.calls("admin_set_notification_state").length).toBe(1));
  });

  it("Done moves a community item to Completed, where it can be moved back", async () => {
    render(<AdminNotifications />);
    await screen.findByTestId("admin-notification-c1");
    fireEvent.click(tab("community"));
    const s1 = await screen.findByTestId("admin-notification-s1");
    fireEvent.click(within(s1).getByRole("button", { name: /Done/ }));
    await waitFor(() => expect(screen.queryByTestId("admin-notification-s1")).toBeNull());
    fireEvent.click(tab("completed"));
    const back = await screen.findByTestId("admin-notification-s1");
    expect(back.getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("admin-notification-r1").textContent).toMatch(/Report resolved/);
    fireEvent.click(within(back).getByRole("button", { name: /Move to inbox/ }));
    await waitFor(() => expect(screen.queryByTestId("admin-notification-s1")).toBeNull());
    expect(inbox.calls("admin_set_notification_state").map(c => c.args._action)).toEqual(["done", "undone"]);
  });

  it("offers Resolve only where the inbox owns the resolution, and confirms it is shared", async () => {
    render(<AdminNotifications />);
    const q = await screen.findByTestId("admin-notification-q1");
    expect(within(q).queryByRole("button", { name: /Resolve/ })).toBeNull();
    const c = row("c1");
    fireEvent.click(within(c).getByRole("button", { name: /Resolve/ }));
    expect(within(c).getByRole("group", { name: "Resolve for every admin" })).toBeTruthy();
    fireEvent.click(within(c).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByTestId("admin-notification-c1")).toBeNull());
    expect(inbox.calls("admin_resolve_notifications")[0].args).toEqual({ _ids: ["c1"], _resolution: "dismissed" });
    fireEvent.click(tab("completed"));
    const resolved = await screen.findByTestId("admin-notification-c1");
    expect(resolved.textContent).toMatch(/Dismissed/);
    fireEvent.click(within(resolved).getByRole("button", { name: /Reopen/ }));
    await waitFor(() => expect(inbox.calls("admin_reopen_notification").length).toBe(1));
  });
});

describe("bulk actions", () => {
  it("applies Mark read and Done to the selection, keeping unresolved action work", async () => {
    render(<AdminNotifications />);
    await screen.findByTestId("admin-notification-c1");
    fireEvent.click(screen.getByLabelText("Select all shown"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("admin-notification-toolbar")).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(toastFn.info).toHaveBeenCalledWith(expect.stringMatching(/2 unresolved action items kept/)));
    expect(screen.getByTestId("admin-notification-c1")).toBeTruthy();
    expect(screen.getByTestId("admin-notification-q1")).toBeTruthy();
  });

  it("Clear all on a routine tab clears it for this admin", async () => {
    render(<AdminNotifications />);
    await screen.findByTestId("admin-notification-c1");
    fireEvent.click(tab("platform"));
    await screen.findByTestId("admin-notification-p1");
    fireEvent.click(screen.getByRole("button", { name: /Clear all/ }));
    await screen.findByTestId("admin-notifications-empty");
    expect(inbox.calls("admin_set_notification_state").at(-1)!.args).toEqual({ _ids: null, _action: "done", _tab: "platform" });
  });

  it("does not offer Clear all on Action Required", async () => {
    render(<AdminNotifications />);
    await screen.findByTestId("admin-notification-c1");
    expect(screen.queryByRole("button", { name: /Clear all/ })).toBeNull();
  });
});

describe("history, pagination and sync", () => {
  it("pages with the server's keyset cursor and never duplicates a row", async () => {
    inbox.admin = Array.from({ length: 45 }, (_, i) => ({
      id: `n${String(i).padStart(2, "0")}`,
      type: "feedback",
      category: "community" as const,
      title: `Feedback ${i}`,
      created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    }));
    render(<AdminNotifications />);
    await screen.findByTestId("admin-notifications-empty");
    fireEvent.click(tab("community"));
    await screen.findByText("Feedback 44");
    expect(screen.getAllByText(/^Feedback \d+$/)).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Feedback 0");
    expect(screen.getAllByText(/^Feedback \d+$/)).toHaveLength(45);
    const last = inbox.calls("admin_get_notifications").at(-1)!.args;
    expect(last).toMatchObject({ _tab: "community", _cursor_id: "n15", _cursor_rank: 0 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("refreshes when a notification changes anywhere (resolution, dedupe bump, another admin's tab)", async () => {
    render(<AdminNotifications />);
    await screen.findByTestId("admin-notification-q1");
    inbox.admin[0].resolved_at = "2026-10-19T12:00:00Z"; // feedback marked completed in AdminFeedback
    act(() => inbox.emit("admin_notifications", "UPDATE", { id: "q1" }));
    await waitFor(() => expect(screen.queryByTestId("admin-notification-q1")).toBeNull());
  });

  it("shows an error with a retry rather than an empty inbox", async () => {
    inbox.errors.admin_get_notifications = { message: "boom" };
    render(<AdminNotifications />);
    await screen.findByTestId("admin-notifications-error");
    delete inbox.errors.admin_get_notifications;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("admin-notification-q1");
  });
});

describe("before the migration (legacy fallback)", () => {
  it("lists recent rows read-only, with per-admin receipts, and explains why", async () => {
    inbox.legacy = true;
    render(<AdminNotifications />);
    expect(await screen.findByRole("status")).toHaveTextContent(/database migration is applied/);
    // Without the v2 digest the legacy path classifies by type alone: the
    // comment report is Action Required, the feedback row is Community.
    const c = await screen.findByTestId("admin-notification-c1");
    expect(screen.queryByTestId("admin-notification-q1")).toBeNull();
    expect(within(c).queryByRole("button", { name: /Done/ })).toBeNull();
    expect(within(c).queryByRole("button", { name: /Save/ })).toBeNull();
    fireEvent.click(within(c).getByRole("button", { name: /Mark read/ }));
    await waitFor(() => expect(inbox.fromCalls.some(c2 => c2.table === "admin_notification_reads" && c2.op === "upsert")).toBe(true));
    const up = inbox.fromCalls.find(c2 => c2.table === "admin_notification_reads" && c2.op === "upsert")!;
    expect(up.payload).toEqual([{ notification_id: "c1", admin_user_id: "admin-a" }]);
    expect(inbox.fromCalls.some(c => c.table === "admin_notifications" && c.op === "update")).toBe(false);
  });
});
