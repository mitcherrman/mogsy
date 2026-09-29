import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChampionCardDuelApiError } from "@/lib/champion-card-duel-online/client";
import FriendActionMenu from "./FriendActionMenu";

const api = vi.hoisted(() => ({ createInvite: vi.fn() }));
vi.mock("@/lib/champion-card-duel-online/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/champion-card-duel-online/client")>();
  return { ...original, championCardDuelOnlineApi: api };
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

describe("FriendActionMenu — Invite to Champion Card Duel", () => {
  it("is hidden by default", async () => {
    open();
    await screen.findByText("Report");
    expect(screen.queryByTestId("invite-to-champion-card-duel")).toBeNull();
  });

  it("is hidden for a pending request even though a friendship row exists", async () => {
    // The gate is the resolved friend status, not the presence of a row.
    open({ friendshipId: "f1", canInviteToChampionCardDuel: false });
    await screen.findByText("Report");
    expect(screen.queryByTestId("invite-to-champion-card-duel")).toBeNull();
  });

  it("is shown for an accepted friend", async () => {
    open({ friendshipId: "f1", canInviteToChampionCardDuel: true });
    expect(await screen.findByTestId("invite-to-champion-card-duel")).toBeTruthy();
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
    open({ canInviteToChampionCardDuel: true });
    fireEvent.click(await screen.findByTestId("invite-to-champion-card-duel"));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/quiz/stat-check/room/ABCD2345"));
    // The only argument is a profile id — never an auth user id.
    expect(api.createInvite).toHaveBeenCalledWith(P_TARGET);
    expect(toasts.success).toHaveBeenCalled();
  });

  it("reports the feature being disabled without navigating", async () => {
    api.createInvite.mockRejectedValue(new ChampionCardDuelApiError("backend", 404, "nope"));
    open({ canInviteToChampionCardDuel: true });
    fireEvent.click(await screen.findByTestId("invite-to-champion-card-duel"));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("Champion Card Duel invites are not available yet"),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("surfaces a server-side friendship rejection", async () => {
    api.createInvite.mockRejectedValue(
      new ChampionCardDuelApiError("backend", 403, "no", "SC_INVITE_NOT_FRIENDS"),
    );
    open({ canInviteToChampionCardDuel: true });
    fireEvent.click(await screen.findByTestId("invite-to-champion-card-duel"));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("You can only invite accepted friends"),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("surfaces a server-side block rejection without naming the block", async () => {
    api.createInvite.mockRejectedValue(
      new ChampionCardDuelApiError("backend", 403, "no", "SC_INVITE_BLOCKED"),
    );
    open({ canInviteToChampionCardDuel: true });
    fireEvent.click(await screen.findByTestId("invite-to-champion-card-duel"));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("This invite is not available"),
    );
  });

  it("keeps Report and Block available alongside the invite", async () => {
    open({ canInviteToChampionCardDuel: true });
    await screen.findByTestId("invite-to-champion-card-duel");
    expect(screen.getByText("Report")).toBeTruthy();
    expect(screen.getByText("Block")).toBeTruthy();
  });
});
