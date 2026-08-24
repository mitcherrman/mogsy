/**
 * COM1-2 — the HUD's Community entry.
 *
 * The audit's P1-2 was not only "the floating button is `hidden sm:flex`". The
 * HUD had a "Friends" entry too, and it sits inside `{!LEAGUE_ONLY_MODE && …}`
 * — a hard-coded constant that is `true` in production, so that branch never
 * renders. Both doors were shut at once, which is why a phone could not reach
 * the Community panel at all.
 *
 * This suite pins the new entry OUTSIDE that guard: it must render in League
 * mode, for an ordinary signed-in user, and it must dispatch the same
 * `open-friends-panel` event the drawer already listens for — so the two
 * components stay coupled by one event name and nothing else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const navigate = vi.hoisted(() => vi.fn());
const locationState = vi.hoisted(() => ({ pathname: "/lol" }));
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: locationState.pathname, search: "" }),
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
  user: { id: "auth-uid", is_anonymous: false } as
    | null
    | { id: string; is_anonymous?: boolean },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({
  useAdminAuth: () => ({ isAuthorized: false }),
}));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { nav_tab_mode: "play" } }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = () => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain, in: chain, gte: chain, order: chain, update: chain,
      maybeSingle: () => Promise.resolve({ data: { id: "profile-1" }, error: null }),
      single: () => Promise.resolve({ data: { id: "profile-1" }, error: null }),
      limit: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    });
    return b;
  };
  const channel: Record<string, unknown> = {};
  Object.assign(channel, { on: () => channel, subscribe: () => channel });
  return {
    supabase: {
      from: () => makeBuilder(),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

import MogzyIdentityMenu from "./MogzyIdentityMenu";
import { LEAGUE_ONLY_MODE } from "@/lib/site-config";

const openPanel = () => fireEvent.click(screen.getByTestId("hud-notifications-trigger"));

beforeEach(() => {
  authState.user = { id: "auth-uid", is_anonymous: false };
  locationState.pathname = "/lol";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HUD · Community entry", () => {
  it("production really is League-only — the guard this entry sits outside of", () => {
    // If this ever flips, the legacy "Friends" entry starts rendering too and
    // the panel grows a duplicate door. Worth knowing loudly.
    expect(LEAGUE_ONLY_MODE).toBe(true);
  });

  it("renders in League mode for a signed-in user", () => {
    render(<MogzyIdentityMenu />);
    openPanel();
    expect(screen.getByTestId("hud-community-item")).toBeTruthy();
    expect(screen.getByTestId("hud-community-item").textContent).toContain("Community");
  });

  it("dispatches `open-friends-panel` — the same event the drawer listens for", () => {
    const heard = vi.fn();
    window.addEventListener("open-friends-panel", heard);
    render(<MogzyIdentityMenu />);
    openPanel();
    fireEvent.click(screen.getByTestId("hud-community-item"));
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener("open-friends-panel", heard);
  });

  it("closes the HUD panel as it opens the drawer", () => {
    render(<MogzyIdentityMenu />);
    openPanel();
    fireEvent.click(screen.getByTestId("hud-community-item"));
    // Two overlapping overlays would fight for the same taps on a phone.
    expect(screen.queryByTestId("hud-community-item")).toBeNull();
  });

  it("does not render the legacy Friends entry — it is still behind the guard", () => {
    render(<MogzyIdentityMenu />);
    openPanel();
    const items = screen.getAllByRole("button").map((b) => (b.textContent ?? "").trim());
    expect(items.filter((t) => t === "Friends")).toEqual([]);
  });
});
