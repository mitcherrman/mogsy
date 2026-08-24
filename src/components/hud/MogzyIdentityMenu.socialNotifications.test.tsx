/**
 * COM1-2B / D — the friend-acceptance notification, end to end on the client.
 *
 * A sends B a request; B accepts; `notify_on_friendship_change` writes a
 * `friend_accepted` row addressed to A. What is tested here is A's half:
 *
 *   * the row arrives over realtime and appears WITHOUT a page reload,
 *   * the unread count moves,
 *   * the title names B, and no auth uid appears anywhere in the panel,
 *   * clicking it resolves through the PUBLIC profile id, not an auth id,
 *   * a reconnect catches up what the socket missed and does not double-list
 *     anything it already had.
 *
 * The last one is the reason `.subscribe()` now takes a status callback:
 * Realtime does not replay events from while the socket was down, so a
 * notification that arrived in that window stayed invisible until reload.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Handler = (payload: { new: Row }) => void;

const invitesHook = vi.hoisted(() => ({
  invites: [] as unknown[],
  disabled: false,
  busyToken: null as string | null,
  accept: vi.fn(),
  acceptSwitch: vi.fn(),
  decline: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useStatCheckInvites", () => ({ useStatCheckInvites: () => invitesHook }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/lol", search: "" }),
  Link: ({ to, children, ...rest }: Record<string, unknown> & { to: string; children?: unknown }) => (
    <a href={to} {...rest}>{children as never}</a>
  ),
}));

vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({
  useAdminAuth: () => ({ isAuthorized: false }),
}));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { nav_tab_mode: "play" } }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));

const authState = vi.hoisted(() => ({
  user: { id: "auth-A", is_anonymous: false, created_at: "2026-01-01T00:00:00Z" } as
    | null
    | { id: string; is_anonymous?: boolean; created_at?: string },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const db = vi.hoisted(() => ({
  notifications: [] as Row[],
  reads: [] as { notification_id: string }[],
  /** Handlers registered per table, and the subscribe-status callbacks. */
  handlers: {} as Record<string, Handler[]>,
  statusCallbacks: [] as ((s: string) => void)[],
  loads: 0,
}));

vi.mock("@/integrations/supabase/client", () => {
  const resultFor = (table: string) => {
    if (table === "user_notifications") {
      db.loads += 1;
      return { data: db.notifications, error: null };
    }
    if (table === "user_notification_reads") return { data: db.reads, error: null };
    return { data: [], error: null };
  };
  const makeBuilder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain, in: chain, gte: chain, order: chain, update: chain,
      maybeSingle: () => Promise.resolve({ data: { id: "profile-A" }, error: null }),
      single: () => Promise.resolve({ data: { id: "profile-A" }, error: null }),
      limit: () => Promise.resolve(resultFor(table)),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(resultFor(table)),
    });
    return b;
  };
  const channel: Record<string, unknown> = {};
  Object.assign(channel, {
    on: (_e: string, config: { table: string }, handler: Handler) => {
      (db.handlers[config.table] ||= []).push(handler);
      return channel;
    },
    subscribe: (cb?: (s: string) => void) => {
      if (cb) db.statusCallbacks.push(cb);
      return channel;
    },
  });
  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

import MogzyIdentityMenu from "./MogzyIdentityMenu";

/** What `notify_on_friendship_change` writes when B accepts A's request. */
const ACCEPTED = (over: Row = {}): Row => ({
  id: "n-accepted",
  title: "Vayne accepted your friend request",
  message: null,
  type: "friend_accepted",
  image_url: null,
  created_at: "2026-08-24T10:00:00Z",
  target_type: "user",
  profile_id: "profile-A",
  // The public profile id — NOT auth.users.id. COM1-1 removed the auth id from
  // these rows entirely; the click destination has always come from metadata.
  metadata: { friendship_id: "f-1", addressee_profile_id: "profile-B" },
  action_url: null,
  ...over,
});

beforeEach(() => {
  authState.user = { id: "auth-A", is_anonymous: false, created_at: "2026-01-01T00:00:00Z" };
  db.notifications = [];
  db.reads = [];
  db.handlers = {};
  db.statusCallbacks = [];
  db.loads = 0;
});

afterEach(() => vi.clearAllMocks());

const fire = (row: Row) =>
  act(() => {
    (db.handlers["user_notifications"] || []).forEach((h) => h({ new: row }));
  });

/** Replay a websocket (re)connection. */
const reconnect = (status = "SUBSCRIBED") =>
  act(() => {
    db.statusCallbacks.forEach((cb) => cb(status));
  });

async function mountBell() {
  render(<MogzyIdentityMenu />);
  return screen.findByRole("button", { name: /notifications/i });
}

describe("A learns that B accepted, without reloading", () => {
  it("streams the acceptance in and moves the unread count", async () => {
    const bell = await mountBell();
    await waitFor(() => expect(db.handlers["user_notifications"]?.length).toBeGreaterThan(0));
    expect(screen.queryByTestId("hud-unread-badge")).toBeNull();

    fire(ACCEPTED());

    await waitFor(() =>
      expect(screen.getByTestId("hud-unread-badge").textContent).toBe("1"),
    );
    fireEvent.click(bell);
    expect(screen.getByText("Vayne accepted your friend request")).toBeTruthy();
  });

  it("names the other player and never shows an auth uid", async () => {
    db.notifications = [ACCEPTED()];
    const bell = await mountBell();
    fireEvent.click(bell);

    const panel = await screen.findByTestId("notification-panel");
    expect(panel.textContent).toContain("Vayne accepted your friend request");
    // Neither party's auth subject may appear in a rendered social notification.
    expect(panel.textContent).not.toContain("auth-A");
    expect(panel.textContent).not.toContain("auth-B");
  });

  it("resolves the click through the PUBLIC profile id", async () => {
    db.notifications = [ACCEPTED()];
    const bell = await mountBell();
    fireEvent.click(bell);

    fireEvent.click(await screen.findByText("Vayne accepted your friend request"));
    expect(navigate).toHaveBeenCalledWith("/user/profile-B");
  });

  it("still routes an incoming REQUEST to the Community drawer", async () => {
    const opened = vi.fn();
    window.addEventListener("open-friends-panel", opened);
    db.notifications = [
      ACCEPTED({
        id: "n-request",
        type: "friend_request",
        title: "Vayne sent you a friend request",
        metadata: { friendship_id: "f-2", requester_profile_id: "profile-B" },
      }),
    ];
    const bell = await mountBell();
    fireEvent.click(bell);

    fireEvent.click(await screen.findByText("Vayne sent you a friend request"));
    expect(opened).toHaveBeenCalled();
    window.removeEventListener("open-friends-panel", opened);
  });
});

describe("the reconnect gap", () => {
  it("re-reads on every SUBSCRIBED transition, because realtime does not replay", async () => {
    await mountBell();
    await waitFor(() => expect(db.statusCallbacks.length).toBeGreaterThan(0));
    const loadsBefore = db.loads;

    // Something arrived while the socket was down; the client was never told.
    db.notifications = [ACCEPTED()];
    reconnect();

    await waitFor(() => expect(db.loads).toBeGreaterThan(loadsBefore));
    expect(await screen.findByTestId("hud-unread-badge")).toBeTruthy();
  });

  it("ignores every other subscription status", async () => {
    await mountBell();
    await waitFor(() => expect(db.statusCallbacks.length).toBeGreaterThan(0));
    const loadsBefore = db.loads;

    ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].forEach((s) => reconnect(s));
    expect(db.loads).toBe(loadsBefore);
  });

  it("does not double-list a notification the stream already delivered", async () => {
    const bell = await mountBell();
    await waitFor(() => expect(db.handlers["user_notifications"]?.length).toBeGreaterThan(0));

    fire(ACCEPTED());
    await waitFor(() =>
      expect(screen.getByTestId("hud-unread-badge").textContent).toBe("1"),
    );

    // The catch-up read returns the SAME row. A list that appended rather than
    // replaced would show it twice and count it twice.
    db.notifications = [ACCEPTED()];
    reconnect();

    await waitFor(() => expect(db.loads).toBeGreaterThan(1));
    expect(screen.getByTestId("hud-unread-badge").textContent).toBe("1");
    fireEvent.click(bell);
    expect(screen.getAllByText("Vayne accepted your friend request")).toHaveLength(1);
  });

  it("keeps a read notification read across the catch-up", async () => {
    db.notifications = [ACCEPTED()];
    db.reads = [{ notification_id: "n-accepted" }];
    await mountBell();
    await waitFor(() => expect(db.statusCallbacks.length).toBeGreaterThan(0));

    reconnect();
    await waitFor(() => expect(db.loads).toBeGreaterThan(1));
    // Read state comes from user_notification_reads in the same load — a
    // reconnect must not resurrect a badge the user already cleared.
    expect(screen.queryByTestId("hud-unread-badge")).toBeNull();
  });
});
