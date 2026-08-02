import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UserNotificationBell from "./UserNotificationBell";

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
  decline: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useStatCheckInvites", () => ({
  useStatCheckInvites: () => invitesHook,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

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

const invite = (token = "tok_a") => ({
  inviteToken: token,
  senderProfileId: "11111111-1111-4111-8111-111111111111",
  displayName: "Rivals",
  avatarUrl: null,
  createdAt: "2026-08-02T12:00:00+00:00",
  expiresAt: "2026-08-02T12:15:00+00:00",
});

afterEach(() => {
  invitesHook.invites = [];
  invitesHook.busyToken = null;
  vi.clearAllMocks();
});

async function openBell() {
  render(<UserNotificationBell />);
  const bell = await screen.findByRole("button");
  fireEvent.click(bell);
}

describe("UserNotificationBell — Stat Check invites", () => {
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
    invitesHook.accept.mockResolvedValue("/quiz/stat-check/room/ABCD2345");
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/quiz/stat-check/room/ABCD2345"));
    expect(invitesHook.accept).toHaveBeenCalledWith("tok_a");
  });

  it("accept failure reports and does not navigate", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue(null);
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));

    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
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
    render(<UserNotificationBell />);
    expect(await screen.findByText("2")).toBeTruthy();
  });

  it("never writes to user_notifications", async () => {
    invitesHook.invites = [invite()];
    invitesHook.accept.mockResolvedValue("/quiz/stat-check/room/ABCD2345");
    await openBell();
    fireEvent.click(await screen.findByTestId("sc-invite-accept"));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    // The only writes this component ever makes are read-receipts, and the
    // invite path makes none at all.
    expect(insert).not.toHaveBeenCalled();
  });
});
