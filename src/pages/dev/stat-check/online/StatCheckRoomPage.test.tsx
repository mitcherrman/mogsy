import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "@/lib/stat-check-online/contracts";
import StatCheckRoomPage from "./StatCheckRoomPage";

const api = vi.hoisted(() => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  getRoom: vi.fn(),
  setReady: vi.fn(),
  cancelRoom: vi.fn(),
  getActiveRoom: vi.fn(),
  submitItemChoice: vi.fn(),
  submitLock: vi.fn(),
  getMatchPublic: vi.fn(),
  getMatchPrivate: vi.fn(),
  getResolvedRound: vi.fn(),
  resumeMatch: vi.fn(),
  getMatchResult: vi.fn(),
  sendPresence: vi.fn().mockResolvedValue({}),
  concede: vi.fn(),
}));

vi.mock("@/lib/stat-check-online/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stat-check-online/client")>();
  return { ...original, statCheckOnlineApi: api };
});

// The started state mounts the full Stat Check page; stub its data hooks.
vi.mock("@/hooks/useChampionBaseStats", () => ({
  useChampionBaseStats: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionSplash: () => null,
  getChampionIcon: () => null,
}));

const roomView = (overrides: Partial<RoomView> = {}): RoomView => ({
  roomId: "scr_1",
  status: "open",
  inviteCode: "ABCD2345",
  createdByYou: true,
  yourSeat: "p1",
  matchId: null,
  seats: [{ seat: "p1", ready: false, isSelf: true, displayName: "You" }],
  serverTime: "2026-07-25T12:00:00+00:00",
  ...overrides,
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/quiz/stat-check" element={<StatCheckRoomPage />} />
        <Route path="/quiz/stat-check/room/:inviteCode" element={<StatCheckRoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("StatCheckRoomPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers room creation when no live room exists, then shows the lobby", async () => {
    api.getActiveRoom.mockResolvedValue({ roomId: null, status: null, matchId: null });
    api.createRoom.mockResolvedValue({ roomId: "scr_1", inviteCode: "ABCD2345", joinPath: "/quiz/stat-check/room/ABCD2345" });
    api.getRoom.mockResolvedValue(roomView());

    renderAt("/quiz/stat-check");
    await flush();
    fireEvent.click(screen.getByTestId("sc-room-create"));
    await flush();

    expect(screen.getByTestId("sc-room-invite-code")).toHaveTextContent("ABCD2345");
    expect(screen.getByTestId("sc-room-seat-p2")).toHaveTextContent(/Waiting for opponent/i);
    expect(screen.getByTestId("sc-room-cancel")).toBeInTheDocument();
  });

  it("joins by invite code from the URL and polls the lobby", async () => {
    api.joinRoom.mockResolvedValue({ roomId: "scr_1", seat: "p2", idempotent: false });
    api.getRoom.mockResolvedValue(
      roomView({
        createdByYou: false,
        yourSeat: "p2",
        seats: [
          { seat: "p1", ready: true, isSelf: false, displayName: "Player 1" },
          { seat: "p2", ready: false, isSelf: true, displayName: "You" },
        ],
      }),
    );

    renderAt("/quiz/stat-check/room/ABCD2345");
    await flush();

    expect(api.joinRoom).toHaveBeenCalledWith("ABCD2345");
    expect(screen.getByTestId("sc-room-seat-p1")).toHaveTextContent(/Ready/);
    expect(screen.queryByTestId("sc-room-cancel")).toBeNull();
  });

  it("ready-up transitions into the started state when the server starts the match", async () => {
    api.joinRoom.mockResolvedValue({ roomId: "scr_1", seat: "p2", idempotent: true });
    api.getRoom.mockResolvedValue(
      roomView({
        createdByYou: false,
        yourSeat: "p2",
        seats: [
          { seat: "p1", ready: true, isSelf: false, displayName: "Player 1" },
          { seat: "p2", ready: false, isSelf: true, displayName: "You" },
        ],
      }),
    );
    api.setReady.mockResolvedValue(
      roomView({
        status: "active",
        matchId: "scm_9",
        createdByYou: false,
        yourSeat: "p2",
        started: true,
        seats: [
          { seat: "p1", ready: true, isSelf: false, displayName: "Player 1" },
          { seat: "p2", ready: true, isSelf: true, displayName: "You" },
        ],
      }),
    );

    api.resumeMatch.mockReturnValue(new Promise(() => {})); // match view stays connecting

    renderAt("/quiz/stat-check/room/ABCD2345");
    await flush();
    fireEvent.click(screen.getByTestId("sc-room-ready"));
    await flush();

    expect(api.setReady).toHaveBeenCalledWith("scr_1", true);
    // The started room hands off to the online match surface.
    expect(screen.getByTestId("sc-online-connecting")).toBeInTheDocument();
    expect(api.resumeMatch).toHaveBeenCalledWith("scm_9");
  });

  it("surfaces room-full and auth errors", async () => {
    const { StatCheckApiError } = await import("@/lib/stat-check-online/client");
    api.joinRoom.mockRejectedValue(new StatCheckApiError("backend", 409, "full", "SC_ROOM_FULL"));
    renderAt("/quiz/stat-check/room/ABCD2345");
    await flush();
    expect(screen.getByTestId("sc-room-error")).toHaveTextContent(/two players/i);
  });
});
