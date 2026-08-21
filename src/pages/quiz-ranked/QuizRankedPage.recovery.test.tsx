/**
 * Reconnect regression: after a full page reload with NO in-memory match id, the
 * Ranked route must rediscover the caller's active bot match (which is never in
 * the queue) via the account-bound active-match endpoint and re-enter the same
 * live match view.
 *
 * PLAY1 changed what happens when there is NOTHING to recover. The route's
 * pre-match menu is retired, so falling through no longer means "show the
 * class-selection screen" — it means returning the player to the Leaguecraft
 * lobby with the match-entry record opened, which is the only entry that still
 * exists. The recovery half of this file is unchanged; only the fall-through
 * expectation moved.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({
  getActiveMatch: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-uuid", is_anonymous: false } }),
}));

// Stub the heavy live-match view so we only assert WHICH match id is entered.
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: ({ matchId }: { matchId: string }) => (
    <div data-testid="match-view">{matchId}</div>
  ),
}));

vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: h.getActiveMatch,
  isAborted: (e: unknown) => (e as { name?: string })?.name === "AbortError",
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";

afterEach(() => vi.clearAllMocks());

/** Reports where the route sent us, and what it asked the lobby to do. */
function LobbyProbe() {
  const location = useLocation();
  const state = location.state as { openPlay?: boolean } | null;
  return (
    <div data-testid="lobby">
      {location.pathname}
      {state?.openPlay ? " openPlay" : ""}
    </div>
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/quiz/ranked"]}>
      <Routes>
        <Route path="/quiz/ranked" element={<QuizRankedPage />} />
        <Route path="/quiz" element={<LobbyProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Ranked route reconnect after reload", () => {
  it("recovers and re-enters an active bot match", async () => {
    h.getActiveMatch.mockResolvedValue({ matchId: "rkb_dce7", isBotMatch: true });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("match-view")).toHaveTextContent("rkb_dce7"));
    expect(screen.queryByTestId("lobby")).toBeNull();
  });

  it("returns to the lobby's match-entry record when there is no active match", async () => {
    h.getActiveMatch.mockResolvedValue(null);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("lobby")).toHaveTextContent("/quiz openPlay"));
    expect(screen.queryByTestId("match-view")).toBeNull();
  });

  it("returns to the lobby if discovery fails (backend disabled)", async () => {
    h.getActiveMatch.mockRejectedValue(new Error("disabled"));
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("lobby")).toHaveTextContent("/quiz openPlay"));
    expect(screen.queryByTestId("match-view")).toBeNull();
  });
});
