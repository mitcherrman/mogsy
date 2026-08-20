import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminNotifications from "./AdminNotifications";

/**
 * Per-admin read state on the admin notifications page (NOT1 Phase 2).
 *
 * The page used to flip admin_notifications.is_read, so "Read" and "Mark all
 * read" cleared the row for every admin at once. Both now write a receipt into
 * admin_notification_reads for the acting admin only.
 *
 * The double keeps one shared receipts array and filters it by the
 * `admin_user_id` the component passed, mirroring the RLS SELECT policy, so a
 * leak between admins shows up as a test failure rather than being hidden.
 */

const authState = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), toasts) }));

type Receipt = { notification_id: string; admin_user_id: string };

const db = vi.hoisted(() => ({
  notifications: [] as Record<string, unknown>[],
  reads: [] as { notification_id: string; admin_user_id: string }[],
  upsertCalls: [] as { table: string; rows: unknown; opts: unknown }[],
  upsertError: null as { message: string } | null,
  updateCalls: [] as { table: string; patch: unknown }[],
  selectedColumns: [] as { table: string; columns: string }[],
  realtime: {} as Record<string, ((payload: { new: unknown }) => void)[]>,
  subscriptions: [] as { table: string; event: string; filter?: string }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    const chain = () => b;

    const rows = (): unknown[] => {
      if (table === "admin_notifications") return db.notifications;
      if (table === "admin_notification_reads") {
        return db.reads.filter(r => r.admin_user_id === filters.admin_user_id);
      }
      return [];
    };
    const result = () => ({ data: rows(), error: null });

    Object.assign(b, {
      select: (columns: string) => { db.selectedColumns.push({ table, columns }); return b; },
      order: chain,
      in: chain,
      eq: (col: string, val: unknown) => { filters[col] = val; return b; },
      update: (patch: unknown) => { db.updateCalls.push({ table, patch }); return b; },
      limit: () => Promise.resolve(result()),
      upsert: (rowsIn: Receipt[], opts: unknown) => {
        db.upsertCalls.push({ table, rows: rowsIn, opts });
        if (db.upsertError) return Promise.resolve({ data: null, error: db.upsertError });
        for (const r of rowsIn) {
          const dup = db.reads.some(
            x => x.notification_id === r.notification_id && x.admin_user_id === r.admin_user_id,
          );
          if (!dup) db.reads.push({ ...r });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (v: unknown) => unknown) => resolve(result()),
    });
    return b;
  };

  const makeChannel = () => {
    const channel: Record<string, unknown> = {};
    Object.assign(channel, {
      on: (
        _event: string,
        cfg: { table: string; event: string; filter?: string },
        handler: (p: { new: unknown }) => void,
      ) => {
        (db.realtime[cfg.table] ||= []).push(handler);
        db.subscriptions.push({ table: cfg.table, event: cfg.event, filter: cfg.filter });
        return channel;
      },
      subscribe: () => channel,
    });
    return channel;
  };

  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      channel: () => makeChannel(),
      removeChannel: vi.fn(),
    },
  };
});

const ADMIN_A = "admin-a-uid";
const ADMIN_B = "admin-b-uid";

const notif = (over: Record<string, unknown> = {}) => ({
  id: "an1",
  type: "image_report",
  title: "Image reported",
  message: "a user reported an image",
  metadata: {},
  created_at: new Date().toISOString(),
  ...over,
});

const resetChannels = () => {
  db.realtime = {};
  db.subscriptions = [];
};

beforeEach(() => {
  authState.user = { id: ADMIN_A };
  db.notifications = [];
  db.reads = [];
  db.upsertCalls = [];
  db.upsertError = null;
  db.updateCalls = [];
  db.selectedColumns = [];
  resetChannels();
});

afterEach(() => vi.clearAllMocks());

async function renderPage(onReadChange?: (n: number) => void) {
  const view = render(<AdminNotifications onReadChange={onReadChange} />);
  await screen.findByText("Notifications");
  return view;
}

const rowFor = (id: string) => screen.getByTestId(`admin-notification-${id}`);
const isRead = (id: string) => rowFor(id).getAttribute("data-read") === "true";

describe("AdminNotifications — unread is derived per admin", () => {
  it("shows a notification with no receipt as unread", async () => {
    db.notifications = [notif()];
    await renderPage();
    await waitFor(() => expect(isRead("an1")).toBe(false));
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("shows it as read once THIS admin has a receipt", async () => {
    db.notifications = [notif()];
    db.reads = [{ notification_id: "an1", admin_user_id: ADMIN_A }];
    await renderPage();
    await waitFor(() => expect(isRead("an1")).toBe(true));
    expect(screen.queryByText("Read")).toBeNull();
  });

  it("ignores a receipt belonging to another admin", async () => {
    db.notifications = [notif()];
    db.reads = [{ notification_id: "an1", admin_user_id: ADMIN_B }];
    await renderPage();
    await waitFor(() => expect(isRead("an1")).toBe(false));
  });

  it("never selects or writes admin_notifications.is_read", async () => {
    // is_read survives only as the moderator-request disposition, owned by
    // AdminModeratorConfig. This page must not read or touch it.
    db.notifications = [notif()];
    await renderPage();
    fireEvent.click(await screen.findByText("Read"));
    await waitFor(() => expect(db.upsertCalls.length).toBe(1));

    const selected = db.selectedColumns.filter(s => s.table === "admin_notifications");
    expect(selected.every(s => !s.columns.includes("is_read"))).toBe(true);
    expect(db.updateCalls).toEqual([]);
  });

  it("reports the per-admin unread count to the parent badge", async () => {
    const onReadChange = vi.fn();
    db.notifications = [notif({ id: "an1" }), notif({ id: "an2", title: "Comment reported" })];
    db.reads = [{ notification_id: "an1", admin_user_id: ADMIN_B }];  // another admin's
    await renderPage(onReadChange);
    await waitFor(() => expect(onReadChange).toHaveBeenLastCalledWith(2));

    fireEvent.click(screen.getAllByText("Read")[0]);
    await waitFor(() => expect(onReadChange).toHaveBeenLastCalledWith(1));
  });
});

describe("AdminNotifications — one admin's read does not reach another", () => {
  it("marking one read writes a receipt for the acting admin only", async () => {
    db.notifications = [notif()];
    await renderPage();
    fireEvent.click(await screen.findByText("Read"));
    await waitFor(() => expect(db.reads).toEqual([
      { notification_id: "an1", admin_user_id: ADMIN_A },
    ]));
  });

  it("leaves the row unread for admin B after admin A read it", async () => {
    db.notifications = [notif()];
    const a = await renderPage();
    fireEvent.click(await screen.findByText("Read"));
    await waitFor(() => expect(isRead("an1")).toBe(true));
    a.unmount();

    authState.user = { id: ADMIN_B };
    resetChannels();
    await renderPage();
    await waitFor(() => expect(isRead("an1")).toBe(false));
  });

  it("mark-all applies only to the current admin", async () => {
    db.notifications = [notif({ id: "an1" }), notif({ id: "an2", title: "Comment reported" })];
    const a = await renderPage();
    fireEvent.click(await screen.findByText("Mark all read"));
    await waitFor(() => expect(isRead("an1") && isRead("an2")).toBe(true));
    expect(db.reads.every(r => r.admin_user_id === ADMIN_A)).toBe(true);
    a.unmount();

    authState.user = { id: ADMIN_B };
    resetChannels();
    const onReadChange = vi.fn();
    await renderPage(onReadChange);
    await waitFor(() => expect(onReadChange).toHaveBeenLastCalledWith(2));
  });
});

describe("AdminNotifications — write failures and duplicates", () => {
  it("rolls back to unread when the receipt insert fails", async () => {
    db.notifications = [notif()];
    await renderPage();
    db.upsertError = { message: "rls rejected" };
    fireEvent.click(await screen.findByText("Read"));
    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(isRead("an1")).toBe(false);
    expect(db.reads).toEqual([]);
  });

  it("rolls mark-all back when the receipt insert fails", async () => {
    db.notifications = [notif({ id: "an1" }), notif({ id: "an2", title: "Comment reported" })];
    await renderPage();
    db.upsertError = { message: "rls rejected" };
    fireEvent.click(await screen.findByText("Mark all read"));
    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(isRead("an1")).toBe(false);
    expect(isRead("an2")).toBe(false);
  });

  it("uses a conflict-tolerant upsert, so the bell and this page cannot collide", async () => {
    db.notifications = [notif()];
    await renderPage();
    fireEvent.click(await screen.findByText("Read"));
    await waitFor(() => expect(db.upsertCalls.length).toBe(1));
    expect(db.upsertCalls[0]).toMatchObject({
      table: "admin_notification_reads",
      opts: { onConflict: "notification_id,admin_user_id", ignoreDuplicates: true },
    });
  });

  it("is idempotent: an already-read row is not written again", async () => {
    db.notifications = [notif()];
    db.reads = [{ notification_id: "an1", admin_user_id: ADMIN_A }];
    await renderPage();
    await waitFor(() => expect(isRead("an1")).toBe(true));
    // Mark all read is not even offered when nothing is unread.
    expect(screen.queryByText("Mark all read")).toBeNull();
    expect(db.upsertCalls).toEqual([]);
    expect(db.reads).toHaveLength(1);
  });
});

describe("AdminNotifications — realtime", () => {
  it("a newly arrived notification is unread for this admin", async () => {
    db.notifications = [notif()];
    db.reads = [{ notification_id: "an1", admin_user_id: ADMIN_A }];
    const onReadChange = vi.fn();
    await renderPage(onReadChange);
    await waitFor(() => expect(onReadChange).toHaveBeenLastCalledWith(0));

    act(() => {
      db.realtime["admin_notifications"].forEach(h =>
        h({ new: notif({ id: "an2", title: "Fresh report" }) }),
      );
    });

    await waitFor(() => expect(onReadChange).toHaveBeenLastCalledWith(1));
    expect(isRead("an2")).toBe(false);
  });

  it("reconciles a receipt written in another tab", async () => {
    db.notifications = [notif()];
    await renderPage();
    await waitFor(() => expect(isRead("an1")).toBe(false));

    act(() => {
      db.realtime["admin_notification_reads"].forEach(h =>
        h({ new: { notification_id: "an1", admin_user_id: ADMIN_A } }),
      );
    });

    await waitFor(() => expect(isRead("an1")).toBe(true));
  });

  it("scopes the receipt subscription to this admin's own uid", async () => {
    db.notifications = [notif()];
    await renderPage();
    const sub = db.subscriptions.find(s => s.table === "admin_notification_reads");
    expect(sub).toMatchObject({ event: "INSERT", filter: `admin_user_id=eq.${ADMIN_A}` });
  });
});
