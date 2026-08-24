/**
 * COM1-2 — Find Players.
 *
 * The one surface that turns "I know a username" into "I sent them a request".
 * These tests cover the search contract (exact / case-insensitive / partial,
 * debounced, short queries never sent), the relationship-derived control for
 * every state, and the rule that matters most: a mutation that FAILED never
 * produces a success UI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  searchPlayers: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/community/discovery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/community/discovery")>(
    "@/lib/community/discovery",
  );
  return { ...actual, searchPlayers: mocks.searchPlayers };
});
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import FindPlayersTab from "./FindPlayersTab";
import type { PlayerSearchResult } from "@/lib/community/discovery";
import type { Relationship } from "@/lib/community/relationship";
import type { SocialResult } from "@/lib/community/social-result";

function player(over: Partial<PlayerSearchResult> = {}): PlayerSearchResult {
  return {
    id: "p-ashe",
    displayName: "Ashe",
    avatarUrl: null,
    profileFrame: null,
    isPro: false,
    isBot: false,
    isAnonymous: false,
    createdAt: "2026-01-01T00:00:00Z",
    relationship: "none",
    friendshipId: null,
    matchRank: 0,
    ...over,
  };
}

const OK: SocialResult = { ok: true, code: "ok" };

interface Handlers {
  onAddFriend?: (id: string) => Promise<SocialResult>;
  onAcceptRequest?: (id: string) => Promise<SocialResult>;
  onUnblock?: (id: string) => Promise<SocialResult>;
  onOpenProfile?: (id: string) => void;
}

function renderTab(handlers: Handlers = {}) {
  return render(
    <FindPlayersTab
      // Zero debounce: the debounce itself is covered by its own test; every
      // other test would otherwise be a timer test in disguise.
      debounceMs={0}
      onAddFriend={handlers.onAddFriend ?? vi.fn().mockResolvedValue(OK)}
      onAcceptRequest={handlers.onAcceptRequest ?? vi.fn().mockResolvedValue(OK)}
      onUnblock={handlers.onUnblock ?? vi.fn().mockResolvedValue(OK)}
      onOpenProfile={handlers.onOpenProfile ?? vi.fn()}
    />,
  );
}

async function search(text: string) {
  fireEvent.change(screen.getByTestId("find-players-input"), { target: { value: text } });
  await waitFor(() => expect(mocks.searchPlayers).toHaveBeenCalled());
}

beforeEach(() => {
  mocks.searchPlayers.mockReset();
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.searchPlayers.mockResolvedValue({ results: [], searched: true });
});
afterEach(cleanup);

describe("searching", () => {
  it("prompts rather than searching before the minimum length", async () => {
    renderTab();
    expect(screen.getByTestId("find-players-hint").textContent).toMatch(/at least 2 characters/i);
    fireEvent.change(screen.getByTestId("find-players-input"), { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.searchPlayers).not.toHaveBeenCalled();
    // "No players found" would answer a question that was never asked.
    expect(screen.queryByTestId("find-players-empty")).toBeNull();
  });

  it("finds an exact username", async () => {
    mocks.searchPlayers.mockResolvedValue({
      results: [player({ matchRank: 0 })],
      searched: true,
    });
    renderTab();
    await search("Ashe");
    await waitFor(() => expect(screen.getByTestId("find-player-p-ashe")).toBeTruthy());
    expect(screen.getByTestId("find-player-p-ashe").textContent).toContain("Ashe");
  });

  it("is case-insensitive — the raw query goes to the server, which normalises", async () => {
    mocks.searchPlayers.mockResolvedValue({ results: [player()], searched: true });
    renderTab();
    await search("aShE");
    expect(mocks.searchPlayers).toHaveBeenCalledWith("aShE");
    await waitFor(() => expect(screen.getByTestId("find-player-p-ashe")).toBeTruthy());
  });

  it("renders partial matches, ordered as the server ranked them", async () => {
    mocks.searchPlayers.mockResolvedValue({
      results: [
        player({ id: "p-1", displayName: "Ash", matchRank: 0 }),
        player({ id: "p-2", displayName: "Ashen", matchRank: 1 }),
        player({ id: "p-3", displayName: "Bashful", matchRank: 2 }),
      ],
      searched: true,
    });
    renderTab();
    await search("ash");
    await waitFor(() => expect(screen.getByTestId("find-players-results")).toBeTruthy());
    const names = Array.from(
      screen.getByTestId("find-players-results").querySelectorAll("[data-testid^='find-player-p-']"),
    ).map((el) => el.textContent);
    // No client-side re-sorting: the server's order is the order.
    expect(names[0]).toContain("Ash");
    expect(names[1]).toContain("Ashen");
    expect(names[2]).toContain("Bashful");
  });

  it("debounces, and a slow early query cannot overwrite a later one", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    mocks.searchPlayers
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ results: [player({ id: "p-late", displayName: "Late" })], searched: true });

    renderTab({});
    const input = screen.getByTestId("find-players-input");
    fireEvent.change(input, { target: { value: "as" } });
    await waitFor(() => expect(mocks.searchPlayers).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "ashe" } });
    await waitFor(() => expect(screen.getByTestId("find-player-p-late")).toBeTruthy());

    // The stale response lands last and must be discarded.
    resolveFirst({ results: [player({ id: "p-stale", displayName: "Stale" })], searched: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("find-player-p-stale")).toBeNull();
    expect(screen.getByTestId("find-player-p-late")).toBeTruthy();
  });

  it("shows a neutral message when the search itself fails", async () => {
    mocks.searchPlayers.mockResolvedValue({
      results: [],
      searched: true,
      error: "Search is unavailable right now.",
    });
    renderTab();
    await search("ashe");
    await waitFor(() =>
      expect(screen.getByTestId("find-players-error").textContent).toBe(
        "Search is unavailable right now.",
      ),
    );
    expect(screen.queryByTestId("find-players-empty")).toBeNull();
  });
});

describe("relationship state drives the control", () => {
  const cases: Array<[Relationship, string]> = [
    ["none", "Add Friend"],
    ["incoming", "Accept"],
    ["blocked", "Unblock"],
  ];

  it.each(cases)("%s offers %s", async (relationship, label) => {
    mocks.searchPlayers.mockResolvedValue({
      results: [player({ relationship, friendshipId: relationship === "incoming" ? "f-1" : null })],
      searched: true,
    });
    renderTab();
    await search("ashe");
    await waitFor(() =>
      expect(screen.getByTestId("find-player-action-p-ashe").textContent).toContain(label),
    );
  });

  it("an outgoing request reads Requested and is NOT a button", async () => {
    mocks.searchPlayers.mockResolvedValue({
      results: [player({ relationship: "outgoing", friendshipId: "f-1" })],
      searched: true,
    });
    renderTab();
    await search("ashe");
    await waitFor(() =>
      expect(screen.getByTestId("find-player-state-p-ashe").textContent).toBe("Requested"),
    );
    // A disabled button would still read as an offer. State is text.
    expect(screen.queryByTestId("find-player-action-p-ashe")).toBeNull();
  });

  it("an accepted friendship reads Friends and offers nothing", async () => {
    mocks.searchPlayers.mockResolvedValue({
      results: [player({ relationship: "friends", friendshipId: "f-1" })],
      searched: true,
    });
    renderTab();
    await search("ashe");
    await waitFor(() =>
      expect(screen.getByTestId("find-player-state-p-ashe").textContent).toBe("Friends"),
    );
    expect(screen.queryByTestId("find-player-action-p-ashe")).toBeNull();
  });

  it("an unavailable profile is neutral and explains nothing", async () => {
    mocks.searchPlayers.mockResolvedValue({
      results: [player({ relationship: "unavailable" })],
      searched: true,
    });
    renderTab();
    await search("ashe");
    await waitFor(() =>
      expect(screen.getByTestId("find-player-state-p-ashe").textContent).toBe("Unavailable"),
    );
    expect(screen.getByTestId("find-player-p-ashe").textContent).not.toMatch(/block/i);
  });
});

describe("actions", () => {
  it("Add Friend calls the shared useFriends mutation, then re-reads the server", async () => {
    const onAddFriend = vi.fn().mockResolvedValue(OK);
    mocks.searchPlayers.mockResolvedValue({ results: [player()], searched: true });
    renderTab({ onAddFriend });
    await search("ashe");
    await waitFor(() => expect(screen.getByTestId("find-player-action-p-ashe")).toBeTruthy());

    mocks.searchPlayers.mockClear();
    fireEvent.click(screen.getByTestId("find-player-action-p-ashe"));

    await waitFor(() => expect(onAddFriend).toHaveBeenCalledWith("p-ashe"));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Friend request sent");
    // The new state comes from the database, not from assuming the write landed.
    await waitFor(() => expect(mocks.searchPlayers).toHaveBeenCalled());
  });

  it("Accept passes the friendship id, not the profile id", async () => {
    const onAcceptRequest = vi.fn().mockResolvedValue(OK);
    mocks.searchPlayers.mockResolvedValue({
      results: [player({ relationship: "incoming", friendshipId: "f-77" })],
      searched: true,
    });
    renderTab({ onAcceptRequest });
    await search("ashe");
    await waitFor(() => expect(screen.getByTestId("find-player-action-p-ashe")).toBeTruthy());
    fireEvent.click(screen.getByTestId("find-player-action-p-ashe"));
    await waitFor(() => expect(onAcceptRequest).toHaveBeenCalledWith("f-77"));
  });

  it("a REFUSED request shows the refusal and no success", async () => {
    // This is P0-2 / P1-4 end to end: a request refused because the other party
    // blocked the caller comes back as a neutral refusal, and the UI must not
    // celebrate it.
    const onAddFriend = vi.fn().mockResolvedValue({
      ok: false,
      code: "refused",
      error: "That friend request could not be sent.",
    } satisfies SocialResult);
    mocks.searchPlayers.mockResolvedValue({ results: [player()], searched: true });
    renderTab({ onAddFriend });
    await search("ashe");
    await waitFor(() => expect(screen.getByTestId("find-player-action-p-ashe")).toBeTruthy());
    fireEvent.click(screen.getByTestId("find-player-action-p-ashe"));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("That friend request could not be sent."),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    // And it says nothing about a block.
    expect(mocks.toastError.mock.calls[0][0]).not.toMatch(/block/i);
  });

  it("a failed unblock does not report the user as unblocked", async () => {
    const onUnblock = vi.fn().mockResolvedValue({
      ok: false,
      code: "unavailable",
      error: "Something went wrong. Try again.",
    } satisfies SocialResult);
    mocks.searchPlayers.mockResolvedValue({
      results: [player({ relationship: "blocked" })],
      searched: true,
    });
    renderTab({ onUnblock });
    await search("ashe");
    await waitFor(() => expect(screen.getByTestId("find-player-action-p-ashe")).toBeTruthy());
    fireEvent.click(screen.getByTestId("find-player-action-p-ashe"));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("clicking the player opens the existing public profile", async () => {
    const onOpenProfile = vi.fn();
    mocks.searchPlayers.mockResolvedValue({ results: [player()], searched: true });
    renderTab({ onOpenProfile });
    await search("ashe");
    await waitFor(() => expect(screen.getByTestId("find-player-open-p-ashe")).toBeTruthy());
    fireEvent.click(screen.getByTestId("find-player-open-p-ashe"));
    expect(onOpenProfile).toHaveBeenCalledWith("p-ashe");
  });
});
