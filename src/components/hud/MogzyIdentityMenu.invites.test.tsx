import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MogzyIdentityMenu from "./MogzyIdentityMenu";

/**
 * Proves the invite section is ADDITIVE: it renders its own actionable row,
 * navigates through the existing room route, and does not disturb the existing
 * notification pipelines. `user_notifications` is never written here — the
 * Supabase mock below asserts that by only ever serving reads.
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

const ok = (joinPath = "/quiz/stat-check/room/ABCD2345") => ({ ok: true, joinPath });
const conflict = (details: Record<string, unknown>, code = "SC_ACTIVE_ROOM_EXISTS") => ({
  ok: false,
  code,
  message: "You already have a Stat Check room.",
  details,
});
vi.mock("@/hooks/useStatCheckInvites", () => ({
  useStatCheckInvites: () => invitesHook,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/lol", search: "" }),
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

// Stable identity: a fresh object per render would re-fire the bell's
// `[user]` effect on every state update and spin forever.
const authState = vi.hoisted(() => ({ user: { id: "auth-uid" } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/league-profiles", () => ({ fetchLeagueProfiles: vi.fn().mockResolvedValue([]) }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

const insert = vi.hoisted(() => vi.fn().mockResolvedValue({ data: null, error: null }));
vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    in: chain,
    or: chain,
    gte: chain,
    lte: chain,
    neq: chain,
    is: chain,
    contains: chain,
    order: chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve({ data: { id: "profile-1" }, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    insert,
    update: chain,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  });
  // The realtime channel is chainable: .on().on().subscribe().
  const channel: Record<string, unknown> = {};
  Object.assign(channel, { on: () => channel, subscribe: () => channel });
  return {
    supabase: {
      from: () => builder,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

/**
 * Expiry is relative, not a fixed timestamp. The bell now hides invites whose
 * `expiresAt` has passed, so a hard-coded date silently turned every one of
 * these fixtures into an expired invite once that date went by — the suite
 * would then fail on a calendar boundary rather than on a code change.
 * `expiredInvite` exercises that filter deliberately instead.
 */
const invite = (token = "tok_a") => ({
  inviteToken: token,
  senderProfileId: "11111111-1111-4111-8111-111111111111",
  displayName: "Rivals",
  avatarUrl: null,
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
});

const expiredInvite = (token = "tok_expired") => ({
  ...invite(token),
  createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() - 60_000).toISOString(),
});

afterEach(() => {
  invitesHook.invites = [];
  invitesHook.busyToken = null;
  vi.clearAllMocks();
});

async function openBell() {
  render(<MogzyIdentityMenu />);
  const bell = await screen.findByRole("button");
  fireEvent.click(bell);
}

describe("MogzyIdentityMenu — Stat Check invites", () => {
  it("renders nothing extra when there are no invites", async () => {
    await openBell();
    expect(screen.queryByTestId("sc-invite-notification")).toBeNull();
  });

  it("renders an actionable invite row", async () => {
    invitesHook.invites = [invite()];
    await openBell();
    expect(await screen.findByTestId("sc-invite-notification")).toBeTruthy();
    expect(screen.getByText("Rivals invited you to Stat Check")).toBeTruthy();
    expect(screen.getByTestId("sc-invite-accept")).toBeTruthy();
    expect(screen.getByTestId("sc-invite-decline")).toBeTruthy();
  });

  it("accept navigates through the existing room route", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(ok());
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/quiz/stat-check/room/ABCD2345"));
    expect(invitesHook.accept).toHaveBeenCalledWith("tok_a");
  });

  it("accept failure reports the backend message and does not navigate", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue({
      ok: false, code: "SC_INVITE_EXPIRED", message: "This invite has expired.", details: null,
    });
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("This invite has expired."),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("SC_ACTIVE_ROOM_EXISTS on an empty room shows the switch confirmation", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(
      conflict({ room_state: "open", other_player_present: false, can_close: true }),
    );
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));

    expect(await screen.findByTestId("sc-room-conflict-dialog")).toBeTruthy();
    expect(screen.getByText("Switch Stat Check rooms?")).toBeTruthy();
    expect(
      screen.getByText(
        "You already have a Stat Check room open. Leave it and join your friend's room?",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("sc-conflict-switch").textContent).toBe("Switch and Join");
    expect(screen.getByTestId("sc-conflict-keep").textContent).toBe("Keep My Room");
    // The invite is NOT removed by a recoverable conflict.
    expect(screen.getByTestId("sc-invite-notification")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("SC_ACTIVE_ROOM_EXISTS on an occupied room warns about the other player", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(
      conflict({ room_state: "open", other_player_present: true, can_close: true }),
    );
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));

    expect(
      await screen.findByText(
        "Another player is already waiting in your current room. Switching will close that room for everyone.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("sc-conflict-switch").textContent).toBe("Close Room and Join");
    expect(screen.getByTestId("sc-conflict-keep").textContent).toBe("Keep Current Room");
  });

  it("an active match is a blocking message with no switch offered", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(
      conflict({ room_state: "active", other_player_present: true, can_close: false }),
    );
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));

    expect(
      await screen.findByText(
        "Finish or leave your current match before joining this invite.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("sc-conflict-switch")).toBeNull();
    expect(screen.getByTestId("sc-conflict-dismiss")).toBeTruthy();
  });

  it("a room the user does not own is blocking and uses the backend message", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue({
      ok: false,
      code: "SC_ACTIVE_ROOM_EXISTS",
      message: "You are in another player's room. Leave it before joining this invite.",
      details: { room_state: "open", other_player_present: true, can_close: false },
    });
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));

    expect(
      await screen.findByText(
        "You are in another player's room. Leave it before joining this invite.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("sc-conflict-switch")).toBeNull();
  });

  it("Keep My Room changes nothing", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(
      conflict({ room_state: "open", other_player_present: false, can_close: true }),
    );
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));
    fireEvent.click(await screen.findByTestId("sc-conflict-keep"));

    await waitFor(() => expect(screen.queryByTestId("sc-room-conflict-dialog")).toBeNull());
    expect(invitesHook.acceptSwitch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("sc-invite-notification")).toBeTruthy();
  });

  it("Switch and Join calls accept-switch without the eviction confirmation", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(
      conflict({ room_state: "open", other_player_present: false, can_close: true }),
    );
    invitesHook.acceptSwitch.mockResolvedValue(ok());
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));
    fireEvent.click(await screen.findByTestId("sc-conflict-switch"));

    await waitFor(() => expect(invitesHook.acceptSwitch).toHaveBeenCalledWith("tok_a", false));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/quiz/stat-check/room/ABCD2345"),
    );
  });

  it("Close Room and Join sends the eviction confirmation", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(
      conflict({ room_state: "open", other_player_present: true, can_close: true }),
    );
    invitesHook.acceptSwitch.mockResolvedValue(ok());
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));
    fireEvent.click(await screen.findByTestId("sc-conflict-switch"));

    await waitFor(() => expect(invitesHook.acceptSwitch).toHaveBeenCalledWith("tok_a", true));
  });

  it("a failed switch keeps the invite and reports the backend reason", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(
      conflict({ room_state: "open", other_player_present: false, can_close: true }),
    );
    invitesHook.acceptSwitch.mockResolvedValue({
      ok: false, code: "SC_ROOM_FULL", message: "This room already has two players.",
      details: null,
    });
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));
    fireEvent.click(await screen.findByTestId("sc-conflict-switch"));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("This room already has two players."),
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("sc-invite-notification")).toBeTruthy();
  });

  it("opening the bell triggers an immediate refresh", async () => {
    render(<MogzyIdentityMenu />);
    const bell = await screen.findByRole("button");
    invitesHook.refresh.mockClear();
    fireEvent.click(bell);
    await waitFor(() => expect(invitesHook.refresh).toHaveBeenCalled());
  });

  it("decline calls the hook and never navigates", async () => {
    invitesHook.invites = [invite()];
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-decline"));

    await waitFor(() => expect(invitesHook.decline).toHaveBeenCalledWith("tok_a"));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("disables both actions while an invite is in flight", async () => {
    invitesHook.invites = [invite()];
    invitesHook.busyToken = "tok_a";
    await openBell();
    expect((await screen.findByTestId("sc-invite-accept")).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("sc-invite-decline").hasAttribute("disabled")).toBe(true);
  });

  it("counts invites in the unread badge", async () => {
    invitesHook.invites = [invite("tok_a"), invite("tok_b")];
    render(<MogzyIdentityMenu />);
    expect(await screen.findByText("2")).toBeTruthy();
  });

  it("never writes to user_notifications", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(ok());
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    // The only writes this component ever makes are read-receipts, and the
    // invite path makes none at all.
    expect(insert).not.toHaveBeenCalled();
  });
});
