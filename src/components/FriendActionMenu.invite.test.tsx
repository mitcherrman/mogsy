import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatCheckApiError } from "@/lib/stat-check-online/client";
import FriendActionMenu from "./FriendActionMenu";

const api = vi.hoisted(() => ({ createInvite: vi.fn() }));
vi.mock("@/lib/stat-check-online/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stat-check-online/client")>();
  return { ...original, statCheckOnlineApi: api };
});

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => navigate };
});

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

vi.mock("@/hooks/useBlocks", () => ({
  useBlocks: () => ({ blockUser: vi.fn() }),
  useReportUser: () => ({ reportUser: vi.fn() }),
}));

const P_TARGET = "22222222-2222-4222-8222-222222222222";

function open(props: Record<string, unknown> = {}) {
  render(
    <MemoryRouter>
      <FriendActionMenu targetProfileId={P_TARGET} targetName="Rivals" {...props} />
    </MemoryRouter>,
  );
  // Radix opens on pointerdown/keydown, not click, and jsdom has no
  // PointerEvent — keyboard activation is the reliable trigger here.
  fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("FriendActionMenu — Invite to Stat Check", () => {
  it("is hidden by default", async () => {
    open();
    await screen.findByText("Report");
    expect(screen.queryByTestId("invite-to-stat-check")).toBeNull();
  });

  it("is hidden for a pending request even though a friendship row exists", async () => {
    // The gate is the resolved friend status, not the presence of a row.
    open({ friendshipId: "f1", canInviteToStatCheck: false });
    await screen.findByText("Report");
    expect(screen.queryByTestId("invite-to-stat-check")).toBeNull();
  });

  it("is shown for an accepted friend", async () => {
    open({ friendshipId: "f1", canInviteToStatCheck: true });
    expect(await screen.findByTestId("invite-to-stat-check")).toBeTruthy();
  });

  it("sends the invite by profile id and navigates to the existing room route", async () => {
    api.createInvite.mockResolvedValue({
      inviteToken: "tok_a",
      roomId: "scr_1",
      inviteCode: "ABCD2345",
      expiresAt: "2026-08-02T12:15:00+00:00",
      reused: false,
      joinPath: "/quiz/stat-check/room/ABCD2345",
    });
    open({ canInviteToStatCheck: true });
    fireEvent.click(await screen.findByTestId("invite-to-stat-check"));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/quiz/stat-check/room/ABCD2345"));
    // The only argument is a profile id — never an auth user id.
    expect(api.createInvite).toHaveBeenCalledWith(P_TARGET);
    expect(toasts.success).toHaveBeenCalled();
  });

  it("reports the feature being disabled without navigating", async () => {
    api.createInvite.mockRejectedValue(new StatCheckApiError("backend", 404, "nope"));
    open({ canInviteToStatCheck: true });
    fireEvent.click(await screen.findByTestId("invite-to-stat-check"));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("Stat Check invites are not available yet"),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("surfaces a server-side friendship rejection", async () => {
    api.createInvite.mockRejectedValue(
      new StatCheckApiError("backend", 403, "no", "SC_INVITE_NOT_FRIENDS"),
    );
    open({ canInviteToStatCheck: true });
    fireEvent.click(await screen.findByTestId("invite-to-stat-check"));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("You can only invite accepted friends"),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("surfaces a server-side block rejection without naming the block", async () => {
    api.createInvite.mockRejectedValue(
      new StatCheckApiError("backend", 403, "no", "SC_INVITE_BLOCKED"),
    );
    open({ canInviteToStatCheck: true });
    fireEvent.click(await screen.findByTestId("invite-to-stat-check"));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("This invite is not available"),
    );
  });

  it("keeps Report and Block available alongside the invite", async () => {
    open({ canInviteToStatCheck: true });
    await screen.findByTestId("invite-to-stat-check");
    expect(screen.getByText("Report")).toBeTruthy();
    expect(screen.getByText("Block")).toBeTruthy();
  });
});
