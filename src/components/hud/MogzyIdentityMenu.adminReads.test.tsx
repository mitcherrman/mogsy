import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MogzyIdentityMenu from "./MogzyIdentityMenu";

/**
 * Per-admin read state in the HUD identity menu's admin section (NOT1 Phase 2B).
 *
 * Before this phase the admin section derived "read" from
 * admin_notifications.is_read, a single global boolean — the first admin to
 * open a moderation notification marked it read for every other admin, who
 * then never saw it. Read state now comes from admin_notification_reads,
 * scoped to the reader's auth uid.
 *
 * This is a re-port: the approved Phase 2 logic was written against
 * UserNotificationBell, which the MALT HUD consolidation replaced with this
 * component. The semantics under test are unchanged.
 *
 * The Supabase double below stores receipts in one shared table and filters
 * them by the `admin_user_id` the component actually passed, so "admin A's read
 * leaked to admin B" is a failure the double can express rather than one it
 * papers over.
 */

const invitesHook = vi.hoisted(() => ({
  invites: [] as unknown[],
  disabled: false,
  busyToken: null as string | null,
  accept: vi.fn(),
  acceptSwitch: vi.fn(),
  decline: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useStatCheckInvites", () => ({
  useStatCheckInvites: () => invitesHook,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/lol" }),
  Link: ({
    to,
    children,
    onClick,
    ...rest
  }: Record<string, unknown> & {
    to: string;
    children?: unknown;
    onClick?: (e: { preventDefault: () => void }) => void;
  }) => (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
    >
      {children as never}
    </a>
  ),
}));

const adminCtx = vi.hoisted(() => ({ isAuthorized: true as boolean }));
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({ useAdminAuth: () => adminCtx }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { nav_tab_mode: "play" } }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; is_anonymous?: boolean; created_at?: string },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), toasts) }));

type AdminRow = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  created_at: string;
  metadata: unknown;
};
type Receipt = { notification_id: string; admin_user_id: string };

const db = vi.hoisted(() => ({
  adminNotifs: [] as Record<string, unknown>[],
  /** Shared across every admin. Reads are filtered by admin_user_id, exactly
   *  as the RLS SELECT policy does. */
  adminReads: [] as { notification_id: string; admin_user_id: string }[],
  roles: [] as { role: string }[],
  upsertCalls: [] as { table: string; rows: unknown; opts: unknown }[],
  updateCalls: [] as { table: string; values: unknown }[],
  adminUpsertError: null as { message: string } | null,
  adminReadsSelectError: null as { message: string } | null,
  /** Every postgres_changes handler the component registered, by table. */
  realtime: {} as Record<string, ((payload: { new: unknown }) => void)[]>,
  subscriptions: [] as { table: string; event: string; filter?: string }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    const chain = () => b;

    const result = () => {
      if (table === "admin_notifications") return { data: db.adminNotifs, error: null };
      if (table === "admin_notification_reads") {
        return {
          data: db.adminReads.filter(r => r.admin_user_id === filters.admin_user_id),
          error: db.adminReadsSelectError,
        };
      }
      if (table === "user_roles") return { data: db.roles, error: null };
      // user_notifications / user_notification_reads: empty but healthy, so the
      // admin section is the only thing this suite is measuring.
      return { data: [], error: null };
    };

    Object.assign(b, {
      select: chain,
      order: chain,
      gte: chain,
      in: chain,
      // Recorded, never honoured: any surviving `.update({ is_read: true })`
      // must show up as a failure rather than quietly work.
      update: (values: unknown) => { db.updateCalls.push({ table, values }); return b; },
      eq: (col: string, val: unknown) => { filters[col] = val; return b; },
      limit: () => Promise.resolve(result()),
      maybeSingle: () => Promise.resolve({ data: { id: "profile-1" }, error: null }),
      upsert: (rowsIn: Receipt[], opts: unknown) => {
        db.upsertCalls.push({ table, rows: rowsIn, opts });
        if (table === "admin_notification_reads" && db.adminUpsertError) {
          return Promise.resolve({ data: null, error: db.adminUpsertError });
        }
        for (const r of rowsIn) {
          // Mirrors UNIQUE(notification_id, admin_user_id) + ignoreDuplicates.
          const dup = db.adminReads.some(
            x => x.notification_id === r.notification_id && x.admin_user_id === r.admin_user_id,
          );
          if (!dup) db.adminReads.push({ ...r });
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

/** `over` is deliberately loose: one test passes a stray `is_read` to prove the
 *  component ignores it, and that column is no longer part of AdminRow. */
const adminNotif = (
  over: Partial<AdminRow> & Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: "an1",
  type: "image_report",
  title: "Image reported",
  message: "someone reported an image",
  created_at: new Date().toISOString(),
  metadata: {},
  ...over,
});

const signInAs = (uid: string) => {
  authState.user = { id: uid, is_anonymous: false };
};

beforeEach(() => {
  signInAs(ADMIN_A);
  db.adminNotifs = [];
  db.adminReads = [];
  db.roles = [{ role: "admin" }];
  db.upsertCalls = [];
  db.updateCalls = [];
  db.adminUpsertError = null;
  db.adminReadsSelectError = null;
  db.realtime = {};
  db.subscriptions = [];
});

afterEach(() => {
  invitesHook.invites = [];
  vi.clearAllMocks();
});

async function openBell() {
  const view = render(<MogzyIdentityMenu />);
  const bell = await screen.findByTestId("hud-notifications-trigger");
  fireEvent.click(bell);
  return { bell, view };
}

/** Render as `uid` from scratch, the way a second admin's browser would. */
async function openBellAs(uid: string) {
  signInAs(uid);
  db.realtime = {};
  db.subscriptions = [];
  return openBell();
}

const label = (bell: HTMLElement) => bell.getAttribute("aria-label") ?? "";

describe("HUD admin notifications — unread is derived per admin", () => {
  it("counts an admin notification with no receipt as unread", async () => {
    db.adminNotifs = [adminNotif()];
    const { bell } = await openBell();
    await waitFor(() => expect(label(bell)).toContain("1 unread"));
  });

  it("counts it as read once THIS admin has a receipt", async () => {
    db.adminNotifs = [adminNotif()];
    db.adminReads = [{ notification_id: "an1", admin_user_id: ADMIN_A }];
    const { bell } = await openBell();
    await screen.findByText("Image reported");
    expect(label(bell)).toBe("Open notifications");
  });

  it("ignores another admin's receipt entirely", async () => {
    db.adminNotifs = [adminNotif()];
    db.adminReads = [{ notification_id: "an1", admin_user_id: ADMIN_B }];
    const { bell } = await openBell();
    await waitFor(() => expect(label(bell)).toContain("1 unread"));
  });

  it("never reads admin_notifications.is_read for read state", async () => {
    // is_read is now the moderator-request disposition. A row that is globally
    // dispositioned must still be unread for an admin who has no receipt.
    db.adminNotifs = [adminNotif({ id: "an1", is_read: true })];
    const { bell } = await openBell();
    await waitFor(() => expect(label(bell)).toContain("1 unread"));
  });

  it("styles the row from the receipt, not from is_read", async () => {
    db.adminNotifs = [adminNotif({ id: "an1", is_read: true })];
    await openBell();
    const row = await screen.findByTestId("hud-admin-notification-an1");
    expect(row.getAttribute("data-read")).toBe("false");
  });

  it("shows no admin section at all to a non-admin", async () => {
    db.roles = [{ role: "user" }];
    db.adminNotifs = [adminNotif()];
    const { bell } = await openBell();
    await screen.findByText("No notifications yet");
    expect(label(bell)).toBe("Open notifications");
  });
});

describe("HUD admin notifications — one admin's read does not reach another", () => {
  it("admin A opening a notification leaves it unread for admin B", async () => {
    db.adminNotifs = [adminNotif()];

    const a = await openBell();
    fireEvent.click(await screen.findByText("Image reported"));
    await waitFor(() => expect(label(a.bell)).toBe("Open notifications"));
    expect(db.adminReads).toEqual([{ notification_id: "an1", admin_user_id: ADMIN_A }]);
    a.view.unmount();

    const b = await openBellAs(ADMIN_B);
    await waitFor(() => expect(label(b.bell)).toContain("1 unread"));
  });

  it("admin A's Mark all read leaves admin B's count untouched", async () => {
    db.adminNotifs = [adminNotif({ id: "an1" }), adminNotif({ id: "an2", title: "Comment reported" })];

    const a = await openBell();
    await waitFor(() => expect(label(a.bell)).toContain("2 unread"));
    fireEvent.click(await screen.findByText("Mark all read"));
    await waitFor(() => expect(label(a.bell)).toBe("Open notifications"));
    expect(db.adminReads.every(r => r.admin_user_id === ADMIN_A)).toBe(true);
    a.view.unmount();

    const b = await openBellAs(ADMIN_B);
    await waitFor(() => expect(label(b.bell)).toContain("2 unread"));
  });

  it("writes a receipt only for the acting admin, never for anyone else", async () => {
    db.adminNotifs = [adminNotif()];
    await openBell();
    fireEvent.click(await screen.findByText("Image reported"));
    await waitFor(() => expect(db.upsertCalls.length).toBe(1));
    expect(db.upsertCalls[0]).toMatchObject({
      table: "admin_notification_reads",
      rows: [{ notification_id: "an1", admin_user_id: ADMIN_A }],
    });
  });

  it("never writes admin_notifications.is_read to record a read", async () => {
    db.adminNotifs = [adminNotif()];
    await openBell();
    fireEvent.click(await screen.findByText("Image reported"));
    await waitFor(() => expect(db.upsertCalls.length).toBe(1));
    expect(db.updateCalls.filter(c => c.table === "admin_notifications")).toEqual([]);
  });
});

describe("HUD admin notifications — read state survives a remount", () => {
  it("re-derives read from the receipt table on a fresh mount", async () => {
    db.adminNotifs = [adminNotif()];
    const a = await openBell();
    fireEvent.click(await screen.findByText("Image reported"));
    await waitFor(() => expect(label(a.bell)).toBe("Open notifications"));
    a.view.unmount();

    // Same admin, new browser session: the receipt is the only thing carried
    // over, and it has to be enough.
    const again = await openBellAs(ADMIN_A);
    await screen.findByText("Image reported");
    expect(label(again.bell)).toBe("Open notifications");
  });
});

describe("HUD admin notifications — Mark all read covers the admin section", () => {
  it("clears admin notifications too, so the badge can reach zero", async () => {
    // It previously cleared only user_notifications, leaving an admin pressing
    // "Mark all read" with a badge that would not go away.
    db.adminNotifs = [adminNotif()];
    const { bell } = await openBell();
    await waitFor(() => expect(label(bell)).toContain("1 unread"));

    fireEvent.click(await screen.findByText("Mark all read"));

    await waitFor(() => expect(label(bell)).toBe("Open notifications"));
    expect(db.adminReads).toEqual([{ notification_id: "an1", admin_user_id: ADMIN_A }]);
  });
});

describe("HUD admin notifications — write failures and duplicates", () => {
  it("rolls the row back to unread when the receipt insert fails", async () => {
    db.adminNotifs = [adminNotif()];
    const { bell } = await openBell();
    await screen.findByText("Image reported");

    db.adminUpsertError = { message: "rls rejected" };
    fireEvent.click(screen.getByText("Image reported"));

    await waitFor(() => expect(label(bell)).toContain("1 unread"));
    expect(db.adminReads).toEqual([]);
  });

  it("keeps Mark all read honest when the receipt insert fails", async () => {
    db.adminNotifs = [adminNotif()];
    const { bell } = await openBell();
    await screen.findByText("Mark all read");

    db.adminUpsertError = { message: "rls rejected" };
    fireEvent.click(screen.getByText("Mark all read"));

    await waitFor(() => expect(label(bell)).toContain("1 unread"));
    expect(toasts.error).toHaveBeenCalled();
  });

  it("uses a conflict-tolerant upsert so concurrent marks cannot collide", async () => {
    db.adminNotifs = [adminNotif()];
    await openBell();
    fireEvent.click(await screen.findByText("Image reported"));
    await waitFor(() => expect(db.upsertCalls.length).toBe(1));
    expect(db.upsertCalls[0].opts).toMatchObject({
      onConflict: "notification_id,admin_user_id",
      ignoreDuplicates: true,
    });
  });

  it("is idempotent: marking an already-read row writes nothing new", async () => {
    db.adminNotifs = [adminNotif()];
    db.adminReads = [{ notification_id: "an1", admin_user_id: ADMIN_A }];
    await openBell();
    fireEvent.click(await screen.findByText("Image reported"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin"));
    expect(db.upsertCalls).toEqual([]);
    expect(db.adminReads).toHaveLength(1);
  });

  it("surfaces a failed receipt SELECT as the panel's error state", async () => {
    // Not knowing the read state has to look different from knowing everything
    // is read, or a broken policy reads as a clean inbox.
    db.adminNotifs = [adminNotif()];
    db.adminReadsSelectError = { message: "permission denied" };
    await openBell();
    expect(await screen.findByTestId("notification-error")).toBeTruthy();
  });
});

describe("HUD admin notifications — realtime", () => {
  it("a newly arrived notification starts unread even for an admin who has read everything else", async () => {
    db.adminNotifs = [adminNotif()];
    db.adminReads = [{ notification_id: "an1", admin_user_id: ADMIN_A }];
    const { bell } = await openBell();
    await waitFor(() => expect(label(bell)).toBe("Open notifications"));

    act(() => {
      db.realtime["admin_notifications"].forEach(h =>
        h({ new: adminNotif({ id: "an2", title: "Fresh report" }) }),
      );
    });

    await waitFor(() => expect(label(bell)).toContain("1 unread"));
    expect(await screen.findByText("Fresh report")).toBeTruthy();
  });

  it("reconciles a receipt written by another tab without a refetch", async () => {
    db.adminNotifs = [adminNotif()];
    const { bell } = await openBell();
    await waitFor(() => expect(label(bell)).toContain("1 unread"));

    // What the admin notifications page's write looks like arriving here.
    act(() => {
      db.realtime["admin_notification_reads"].forEach(h =>
        h({ new: { notification_id: "an1", admin_user_id: ADMIN_A } }),
      );
    });

    await waitFor(() => expect(label(bell)).toBe("Open notifications"));
  });

  it("scopes the receipt subscription to this admin's own uid", async () => {
    db.adminNotifs = [adminNotif()];
    await openBell();
    await screen.findByText("Image reported");
    const sub = db.subscriptions.find(s => s.table === "admin_notification_reads");
    expect(sub).toMatchObject({ event: "INSERT", filter: `admin_user_id=eq.${ADMIN_A}` });
  });
});
