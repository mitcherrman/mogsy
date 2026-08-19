import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MogzyIdentityMenu from "./MogzyIdentityMenu";

/**
 * Covers the persistent user-notification path: who sees the bell, which types
 * it renders, and how it behaves when a query or a write fails.
 *
 * The Stat Check invite section has its own suite
 * (MogzyIdentityMenu.invites.test.tsx) and is stubbed empty here.
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
  // jsdom has no navigation, and the real <Link> preventDefaults anyway — so
  // does this, or every asserted click logs a "navigation not implemented".
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

// The identity menu's footer carries the admin entry point under the real
// `useAdminAuth` contract. Default: not an admin — the admin case has its own
// suite in MogzyIdentityMenu.identity.test.tsx.
const adminCtx = vi.hoisted(() => ({ isAuthorized: false as boolean }));
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({ useAdminAuth: () => adminCtx }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { nav_tab_mode: "play" } }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));

// Stable object identity: a fresh one per render would re-fire the bell's
// effect on every state update and spin forever.
const authState = vi.hoisted(() => ({
  user: null as null | { id: string; is_anonymous?: boolean; created_at?: string },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), toasts) }));

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  notifications: [] as Record<string, unknown>[],
  reads: [] as { notification_id: string }[],
  roles: [] as { role: string }[],
  profile: { id: "profile-1" } as { id: string } | null,
  notifError: null as { message: string } | null,
  readsError: null as { message: string } | null,
  upsertError: null as { message: string } | null,
  tablesTouched: [] as string[],
  upsertCalls: [] as { table: string; rows: unknown; opts: unknown }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const resultFor = (table: string) => {
    if (table === "user_notifications") return { data: db.notifications, error: db.notifError };
    if (table === "user_notification_reads") return { data: db.reads, error: db.readsError };
    if (table === "user_roles") return { data: db.roles, error: null };
    return { data: [], error: null };
  };
  const makeBuilder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain, in: chain, gte: chain, order: chain, update: chain,
      maybeSingle: () => Promise.resolve({ data: db.profile, error: null }),
      single: () => Promise.resolve({ data: db.profile, error: null }),
      limit: () => Promise.resolve(resultFor(table)),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: (rows: unknown, opts: unknown) => {
        db.upsertCalls.push({ table, rows, opts });
        return Promise.resolve({ data: null, error: db.upsertError });
      },
      then: (resolve: (v: unknown) => unknown) => resolve(resultFor(table)),
    });
    return b;
  };
  const channel: Record<string, unknown> = {};
  Object.assign(channel, { on: () => channel, subscribe: () => channel });
  return {
    supabase: {
      from: (table: string) => { db.tablesTouched.push(table); return makeBuilder(table); },
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

const notif = (over: Row = {}): Row => ({
  id: "n1",
  title: "A notification",
  message: null,
  type: "general",
  image_url: null,
  created_at: new Date().toISOString(),
  target_type: "all",
  profile_id: null,
  metadata: {},
  action_url: null,
  ...over,
});

beforeEach(() => {
  authState.user = { id: "auth-uid", is_anonymous: false };
  db.notifications = [];
  db.reads = [];
  db.roles = [];
  db.profile = { id: "profile-1" };
  db.notifError = null;
  db.readsError = null;
  db.upsertError = null;
  db.tablesTouched = [];
  db.upsertCalls = [];
});

afterEach(() => {
  invitesHook.invites = [];
  vi.clearAllMocks();
});

const trigger = () => screen.queryByRole("button", { name: /notifications/i });

async function openBell() {
  render(<MogzyIdentityMenu />);
  const bell = await screen.findByRole("button", { name: /notifications/i });
  fireEvent.click(bell);
  return bell;
}

describe("MogzyIdentityMenu — visibility", () => {
  it("gives a signed-out visitor no notifications inbox", async () => {
    // The cluster itself still renders — the portrait and the guest panel are
    // how a visitor reaches Profile and Settings. What a guest must never get
    // is a notifications surface: they cannot receive anything in one.
    authState.user = null;
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(trigger()).toBeNull());
    expect(screen.queryByTestId("notification-panel")).toBeNull();
    expect(screen.getByTestId("hud-profile")).toBeTruthy();
  });

  it("gives an anonymous session no notifications inbox either", async () => {
    // Anonymous users are `authenticated` to Supabase, so a bare `!user` check
    // would let them through to an inbox they can never receive anything in.
    authState.user = { id: "anon-uid", is_anonymous: true };
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(trigger()).toBeNull());
    expect(screen.queryByTestId("notification-panel")).toBeNull();
  });

  it("renders for a normal authenticated account", async () => {
    render(<MogzyIdentityMenu />);
    expect(await screen.findByRole("button", { name: /notifications/i })).toBeTruthy();
  });
});

describe("MogzyIdentityMenu — type eligibility", () => {
  it("shows a friend_request", async () => {
    db.notifications = [notif({ id: "fr", type: "friend_request", title: "Ash sent you a friend request", target_type: "user", profile_id: "profile-1" })];
    await openBell();
    expect(await screen.findByText("Ash sent you a friend request")).toBeTruthy();
  });

  it("shows a friend_accepted", async () => {
    db.notifications = [notif({ id: "fa", type: "friend_accepted", title: "Ash accepted your friend request", target_type: "user", profile_id: "profile-1" })];
    await openBell();
    expect(await screen.findByText("Ash accepted your friend request")).toBeTruthy();
  });

  it("shows a general system announcement", async () => {
    db.notifications = [notif({ id: "g", type: "general", title: "Patch 26.15 is live" })];
    await openBell();
    expect(await screen.findByText("Patch 26.15 is live")).toBeTruthy();
  });

  it("suppresses comment_reply on purpose", async () => {
    db.notifications = [notif({ id: "cr", type: "comment_reply", title: "Ash replied to your comment" })];
    await openBell();
    await screen.findByText("No notifications yet");
    expect(screen.queryByText("Ash replied to your comment")).toBeNull();
  });

  it("suppresses comment_reaction on purpose", async () => {
    db.notifications = [notif({ id: "cx", type: "comment_reaction", title: "Ash reacted to your comment" })];
    await openBell();
    await screen.findByText("No notifications yet");
    expect(screen.queryByText("Ash reacted to your comment")).toBeNull();
  });

  it("drops an unknown type without crashing, and still renders known ones", async () => {
    db.notifications = [
      notif({ id: "u", type: "some_future_type_from_a_newer_migration", title: "From the future" }),
      notif({ id: "g", type: "general", title: "Known announcement" }),
    ];
    await openBell();
    expect(await screen.findByText("Known announcement")).toBeTruthy();
    expect(screen.queryByText("From the future")).toBeNull();
  });

  it("hides another user's targeted notification even when RLS returned it", async () => {
    // Admins can read every row. Recipient scoping has to exist client-side too.
    db.notifications = [notif({ id: "other", type: "friend_request", title: "Someone else's request", target_type: "user", profile_id: "not-my-profile" })];
    await openBell();
    await screen.findByText("No notifications yet");
    expect(screen.queryByText("Someone else's request")).toBeNull();
  });
});

describe("MogzyIdentityMenu — single source of truth for friendships", () => {
  it("never queries the friendships table, and renders one row per event", async () => {
    db.notifications = [notif({ id: "fr", type: "friend_request", title: "Ash sent you a friend request", target_type: "user", profile_id: "profile-1" })];
    await openBell();
    await screen.findByText("Ash sent you a friend request");
    // The bell used to render a second copy of the same event from a direct
    // `friendships` query alongside the persisted notification row.
    expect(db.tablesTouched).not.toContain("friendships");
    expect(screen.getAllByText("Ash sent you a friend request")).toHaveLength(1);
  });
});

describe("MogzyIdentityMenu — failure handling", () => {
  it("leaves the loading state and offers a retry when the load fails", async () => {
    db.notifError = { message: "network down" };
    await openBell();
    expect(await screen.findByTestId("notification-error")).toBeTruthy();
    expect(screen.queryByTestId("notification-loading")).toBeNull();
  });

  it("does not leave a row looking read when the write failed", async () => {
    db.notifications = [notif({ id: "g", type: "general", title: "Read me" })];
    const bell = await openBell();
    const row = await screen.findByText("Read me");
    expect(bell.getAttribute("aria-label")).toContain("1 unread");

    db.upsertError = { message: "write rejected" };
    fireEvent.click(row);

    // Optimistically marked, then rolled back once the write came back failed.
    await waitFor(() => expect(bell.getAttribute("aria-label")).toContain("1 unread"));
    expect(db.upsertCalls.length).toBe(1);
  });

  it("keeps a row read when the write succeeds", async () => {
    db.notifications = [notif({ id: "g", type: "general", title: "Read me" })];
    const bell = await openBell();
    fireEvent.click(await screen.findByText("Read me"));
    await waitFor(() => expect(bell.getAttribute("aria-label")).toBe("Open notifications"));
  });

  it("uses a conflict-tolerant upsert so mark-one and mark-all cannot collide", async () => {
    db.notifications = [notif({ id: "g", type: "general", title: "Read me" })];
    await openBell();
    fireEvent.click(await screen.findByText("Read me"));
    await waitFor(() => expect(db.upsertCalls.length).toBe(1));
    expect(db.upsertCalls[0].opts).toMatchObject({
      onConflict: "notification_id,user_id",
      ignoreDuplicates: true,
    });
  });
});

describe("MogzyIdentityMenu — accessibility", () => {
  it("exposes a labelled, expandable popup trigger", async () => {
    db.notifications = [notif({ id: "g", type: "general", title: "Hello" })];
    render(<MogzyIdentityMenu />);
    const bell = await screen.findByRole("button", { name: /notifications/i });

    expect(bell.getAttribute("aria-haspopup")).toBe("dialog");
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(bell.getAttribute("aria-label")).toContain("1 unread"));

    fireEvent.click(bell);
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("notification-panel").getAttribute("role")).toBe("dialog");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const bell = await openBell();
    expect(screen.getByTestId("notification-panel")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByTestId("notification-panel")).toBeNull());
    expect(document.activeElement).toBe(bell);
    expect(bell.getAttribute("aria-expanded")).toBe("false");
  });

  it("describes pending invitations separately from unread items", async () => {
    db.notifications = [notif({ id: "g", type: "general", title: "Hello" })];
    invitesHook.invites = [{
      inviteToken: "tok",
      senderProfileId: "p2",
      displayName: "Rivals",
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }];
    render(<MogzyIdentityMenu />);
    const bell = await screen.findByRole("button", { name: /notifications/i });
    await waitFor(() =>
      expect(bell.getAttribute("aria-label")).toBe("Open notifications: 1 unread, 1 pending invitation"),
    );
  });
});

describe("MogzyIdentityMenu — Mark all read vs actionable invites", () => {
  it("clears unread items but leaves a pending invitation actionable", async () => {
    db.notifications = [notif({ id: "g", type: "general", title: "Hello" })];
    invitesHook.invites = [{
      inviteToken: "tok",
      senderProfileId: "p2",
      displayName: "Rivals",
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }];
    const bell = await openBell();

    fireEvent.click(await screen.findByText("Mark all read"));

    // The informational item is cleared; the invite is not, and the label says so
    // rather than leaving a badge that "Mark all read" appears unable to clear.
    await waitFor(() =>
      expect(bell.getAttribute("aria-label")).toBe("Open notifications: 1 pending invitation"),
    );
    expect(screen.getByTestId("sc-invite-notification")).toBeTruthy();
    expect(screen.queryByText("Mark all read")).toBeNull();
  });

  it("hides an invitation whose expiry has already passed", async () => {
    invitesHook.invites = [{
      inviteToken: "tok_dead",
      senderProfileId: "p2",
      displayName: "Rivals",
      avatarUrl: null,
      createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    }];
    await openBell();
    await screen.findByText("No notifications yet");
    expect(screen.queryByTestId("sc-invite-notification")).toBeNull();
  });
});
