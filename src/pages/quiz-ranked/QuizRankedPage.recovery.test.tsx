/**
 * Reconnect regression: after a full page reload with NO in-memory match id, the
 * Ranked page must rediscover the caller's active bot match (which is never in
 * the queue) via the account-bound active-match endpoint and re-enter the same
 * live match view — not drop the user back to the class-selection menu.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

// Queue sits idle at class-selection (no queued/matched match).
vi.mock("./useRankedQueue", () => ({
  useRankedQueue: () => ({
    state: "selecting_class", status: null, matchId: null,
    selectedClass: "tank", unavailableReason: null, error: null,
    setSelectedClass: vi.fn(), join: vi.fn(), cancel: vi.fn(),
  }),
}));

vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: h.getActiveMatch,
  createBotMatch: vi.fn(),
  getMatchHistory: vi.fn().mockResolvedValue({ entries: [], count: 0 }),
  isAborted: (e: unknown) => (e as { name?: string })?.name === "AbortError",
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";

afterEach(() => vi.clearAllMocks());

function renderPage() {
  return render(<MemoryRouter><QuizRankedPage /></MemoryRouter>);
}

describe("Ranked page reconnect after reload", () => {
  it("recovers and re-enters an active bot match", async () => {
    h.getActiveMatch.mockResolvedValue({ matchId: "rkb_dce7", isBotMatch: true });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("match-view")).toHaveTextContent("rkb_dce7"));
    expect(screen.queryByTestId("ranked-class-select")).toBeNull();
  });

  it("falls through to the menu when there is no active match", async () => {
    h.getActiveMatch.mockResolvedValue(null);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-class-select")).toBeInTheDocument());
    expect(screen.queryByTestId("match-view")).toBeNull();
  });

  it("falls through to the menu if discovery fails (backend disabled)", async () => {
    h.getActiveMatch.mockRejectedValue(new Error("disabled"));
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-class-select")).toBeInTheDocument());
    expect(screen.queryByTestId("match-view")).toBeNull();
  });
});
