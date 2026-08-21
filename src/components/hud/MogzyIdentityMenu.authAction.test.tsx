/**
 * AUTH1 §7–§9 — the notifications menu's account utility.
 *
 * Two decisions are pinned here:
 *  - the unread count belongs to the NOTIFICATIONS control, never to the
 *    profile portrait (the portrait means identity, full stop);
 *  - the menu ends in exactly ONE auth action — Sign Out for an account, Sign
 *    In for a guest — visually separated from the notification list so it does
 *    not read as another inbox row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const navigate = vi.hoisted(() => vi.fn());
const locationState = vi.hoisted(() => ({ pathname: "/lol", search: "" }));
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: locationState.pathname, search: locationState.search }),
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

const invitesHook = vi.hoisted(() => ({
  invites: [] as unknown[],
  busyToken: null as string | null,
  accept: vi.fn(),
  acceptSwitch: vi.fn(),
  decline: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useStatCheckInvites", () => ({ useStatCheckInvites: () => invitesHook }));

const authState = vi.hoisted(() => ({
  user: { id: "auth-uid", is_anonymous: false } as null | {
    id: string;
    is_anonymous?: boolean;
  },
  signOut: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, signOut: authState.signOut }),
}));

const qc = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock("@/lib/query-client", () => ({ queryClient: qc }));

const adminCtx = vi.hoisted(() => ({ isAuthorized: false as boolean }));
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({ useAdminAuth: () => adminCtx }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { nav_tab_mode: "play" } }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const db = vi.hoisted(() => ({
  notifications: [] as Record<string, unknown>[],
  reads: [] as { notification_id: string }[],
  roles: [] as { role: string }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const resultFor = (table: string) => {
    if (table === "user_notifications") return { data: db.notifications, error: null };
    if (table === "user_notification_reads") return { data: db.reads, error: null };
    if (table === "user_roles") return { data: db.roles, error: null };
    return { data: [], error: null };
  };
  const makeBuilder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain, in: chain, gte: chain, order: chain, update: chain,
      maybeSingle: () => Promise.resolve({ data: { id: "profile-1" }, error: null }),
      single: () => Promise.resolve({ data: { id: "profile-1" }, error: null }),
      limit: () => Promise.resolve(resultFor(table)),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(resultFor(table)),
    });
    return b;
  };
  const channel: Record<string, unknown> = {};
  Object.assign(channel, { on: () => channel, subscribe: () => channel });
  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

import MogzyIdentityMenu from "./MogzyIdentityMenu";

const notif = (over: Record<string, unknown> = {}) => ({
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

const chevron = () => screen.getByTestId("hud-notifications-trigger");
const openPanel = async () => {
  fireEvent.click(chevron());
  return await waitFor(() =>
    screen.getByTestId(
      authState.user && !authState.user.is_anonymous
        ? "notification-panel"
        : "hud-guest-panel",
    ),
  );
};

beforeEach(() => {
  authState.user = { id: "auth-uid", is_anonymous: false };
  authState.signOut = vi.fn().mockResolvedValue(undefined);
  adminCtx.isAuthorized = false;
  locationState.pathname = "/lol";
  locationState.search = "";
  db.notifications = [];
  db.reads = [];
  db.roles = [];
  invitesHook.invites = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("unread badge lives on the notifications control (AUTH1 §7)", () => {
  it("puts the count on the notifications trigger", async () => {
    db.notifications = [notif({ id: "a" })];
    render(<MogzyIdentityMenu />);
    const badge = await screen.findByTestId("hud-unread-badge");
    expect(chevron().contains(badge)).toBe(true);
    expect(badge.textContent).toBe("1");
  });

  it("leaves the profile portrait carrying no count at all", async () => {
    db.notifications = [notif({ id: "a" }), notif({ id: "b" })];
    render(<MogzyIdentityMenu />);
    await screen.findByTestId("hud-unread-badge");
    expect(screen.getByTestId("hud-profile").textContent).not.toMatch(/\d/);
  });

  it("still speaks the count through the trigger's accessible name, not the badge", async () => {
    db.notifications = [notif({ id: "a" })];
    render(<MogzyIdentityMenu />);
    await waitFor(() =>
      expect(chevron().getAttribute("aria-label")).toBe("Open notifications: 1 unread"),
    );
    const badge = screen.getByTestId("hud-unread-badge");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("authenticated menu shows Sign Out (AUTH1 §8)", () => {
  it("renders Sign Out and never Sign In", async () => {
    await (render(<MogzyIdentityMenu />), openPanel());
    expect(screen.getByTestId("hud-sign-out")).toBeTruthy();
    expect(screen.queryByTestId("hud-sign-in")).toBeNull();
  });

  it("clears the session, closes the menu, and lands on /", async () => {
    render(<MogzyIdentityMenu />);
    await openPanel();
    await waitFor(() => screen.getByTestId("hud-sign-out"));
    fireEvent.click(screen.getByTestId("hud-sign-out"));

    await waitFor(() => expect(authState.signOut).toHaveBeenCalledTimes(1));
    // No signed-in data may survive the sign-out in cache.
    expect(qc.clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
    // Menu is gone, not left hanging over the page being navigated away from.
    await waitFor(() => expect(screen.queryByTestId("notification-panel")).toBeNull());
  });

  it("clears the cache BEFORE ending the session", async () => {
    render(<MogzyIdentityMenu />);
    await openPanel();
    fireEvent.click(await screen.findByTestId("hud-sign-out"));
    await waitFor(() => expect(authState.signOut).toHaveBeenCalled());
    // Ordering matters: a clear after the session ends can re-populate from a
    // refetch fired by the un-authed render.
    expect(qc.clear.mock.invocationCallOrder[0]).toBeLessThan(
      authState.signOut.mock.invocationCallOrder[0],
    );
  });

  it("is safe against a double activation", async () => {
    render(<MogzyIdentityMenu />);
    await openPanel();
    const btn = await screen.findByTestId("hud-sign-out");
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(authState.signOut).toHaveBeenCalledTimes(1));
  });

  it("separates the auth action from the notification list with its own rule", async () => {
    db.notifications = [notif({ id: "a" })];
    render(<MogzyIdentityMenu />);
    await openPanel();
    const section = (await screen.findByTestId("hud-sign-out")).parentElement!;
    // Its own bordered block — not another row inside the inbox or the
    // Settings/Admin footer (AUTH1 §9).
    expect(section.className).toContain("border-t");
    expect(section.contains(screen.getByTestId("hud-settings-link"))).toBe(false);
  });

  it("marks Sign Out as destructive without relying on colour alone for its name", async () => {
    render(<MogzyIdentityMenu />);
    await openPanel();
    const btn = await screen.findByTestId("hud-sign-out");
    expect(btn.textContent).toContain("Sign Out");
    expect(btn.className).toContain("text-destructive");
    expect(btn.tagName).toBe("BUTTON");
  });
});

describe("anonymous menu shows Sign In (AUTH1 §8)", () => {
  beforeEach(() => {
    authState.user = { id: "anon-1", is_anonymous: true };
  });

  it("renders Sign In and never Sign Out", async () => {
    render(<MogzyIdentityMenu />);
    await openPanel();
    expect(screen.getByTestId("hud-sign-in")).toBeTruthy();
    expect(screen.queryByTestId("hud-sign-out")).toBeNull();
  });

  it("preserves the current page as returnTo, so signing in relocates nobody", async () => {
    locationState.pathname = "/quiz/ranked";
    render(<MogzyIdentityMenu />);
    await openPanel();
    expect(screen.getByTestId("hud-sign-in").getAttribute("href")).toBe(
      "/auth?returnTo=%2Fquiz%2Franked",
    );
  });

  it("keeps query parameters, which are part of where the visitor is", async () => {
    locationState.pathname = "/quiz/stat-check/room/AB12";
    locationState.search = "?spectate=1";
    render(<MogzyIdentityMenu />);
    await openPanel();
    expect(screen.getByTestId("hud-sign-in").getAttribute("href")).toBe(
      "/auth?returnTo=%2Fquiz%2Fstat-check%2Froom%2FAB12%3Fspectate%3D1",
    );
  });

  it("shows Sign In to a visitor with no session at all", async () => {
    authState.user = null;
    render(<MogzyIdentityMenu />);
    await openPanel();
    expect(screen.getByTestId("hud-sign-in")).toBeTruthy();
    expect(screen.queryByTestId("hud-sign-out")).toBeNull();
  });
});
