/**
 * Meta Reflex (internally League Swipe) reveal integrity.
 *
 * The load-bearing property: a reveal must never present COMMUNITY data that
 * did not come from the server. The original implementation fell back to a
 * synthesised one-vote split whenever `record_league_swipe_result` failed,
 * which is visually indistinguishable from a real result — so an offline
 * client, an RPC error, or a game deactivated via `league_swipe_games.is_active`
 * all rendered a confident, fabricated community bar. That made the kill switch
 * fail OPEN.
 *
 * Correctness is a separate axis and is derived locally from the matchup, so it
 * must still reveal when the write fails.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueSwipeGame from "./LeagueSwipeGame";
import type { SwipeMatchup, SwipeRevealAggregates } from "@/lib/league-swipe/api";

const ITEM_MATCHUP: SwipeMatchup = {
  prompt: "Which item costs more?",
  left: { id: "Infinity Edge", label: "Infinity Edge", value: 3450 },
  right: { id: "Long Sword", label: "Long Sword", value: 350 },
  correctId: "Infinity Edge",
  valueUnit: "g",
};

const mocks = vi.hoisted(() => ({
  recordSwipeResult: vi.fn(),
  verifyFactualChoice: vi.fn(),
}));

vi.mock("@/lib/league-swipe/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
    "@/lib/league-swipe/api",
  );
  return {
    ...actual,
    fetchChampionNames: vi.fn(async () => []),
    fetchChampionStats: vi.fn(async () => []),
    // Two items is enough for exactly one deterministic pair.
    fetchItems: vi.fn(async () => [
      { item_name: "Infinity Edge", item_type: "legendary", cost: 3450 },
      { item_name: "Long Sword", item_type: "basic", cost: 350 },
    ]),
    makeItemCostMatchup: vi.fn(() => ITEM_MATCHUP),
    recordSwipeResult: mocks.recordSwipeResult,
    verifyFactualChoice: mocks.verifyFactualChoice,
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: null }),
  getChampionLoading: () => null,
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInAnonymously: vi.fn(async () => ({ data: {}, error: null })) } },
}));

function renderGame() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/league-swipe/item-cost-duel"]}>
        <Routes>
          <Route path="/league-swipe/:gameSlug" element={<LeagueSwipeGame />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Pick the card the matchup says is correct, and wait for the reveal. */
async function chooseCorrectCard() {
  const card = await screen.findByRole("button", { name: /Infinity Edge/ });
  fireEvent.click(card);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: backend declines to judge, so the local reading stands. Each test
  // that cares about server authority sets its own verdict.
  mocks.verifyFactualChoice.mockResolvedValue(null);
});
afterEach(cleanup);

describe("reveal integrity when the vote write fails", () => {
  it("shows no community percentages and says so, instead of fabricating a split", async () => {
    // null is exactly what recordSwipeResult returns on RPC error.
    mocks.recordSwipeResult.mockResolvedValue(null);
    renderGame();
    await chooseCorrectCard();

    await waitFor(() =>
      expect(screen.getByTestId("swipe-community-unavailable")).toBeTruthy(),
    );

    // The specific regression: a synthesised single vote used to render here.
    expect(screen.queryByText(/vote on this matchup/i)).toBeNull();
    expect(screen.queryByText(/votes on this matchup/i)).toBeNull();
    expect(screen.queryByText(/you sided with/i)).toBeNull();
    // No confident percentage anywhere on the reveal.
    expect(screen.queryByText(/100%/)).toBeNull();
    expect(screen.queryByText(/\b0%/)).toBeNull();
  });

  it("still reveals correctness, because that does not depend on the write", async () => {
    mocks.recordSwipeResult.mockResolvedValue(null);
    renderGame();
    await chooseCorrectCard();

    await waitFor(() => expect(screen.getByText(/Correct!/)).toBeTruthy());
  });
});

describe("reveal when the vote write succeeds", () => {
  const AGGREGATES: SwipeRevealAggregates = {
    matchupId: "m1",
    entityA: "Infinity Edge",
    entityB: "Long Sword",
    votesA: 75,
    votesB: 25,
    totalVotes: 100,
    isCorrect: true,
    ratingChange: null,
    selectedRating: null,
    otherRating: null,
  };

  it("renders the real community split and hides the unavailable notice", async () => {
    mocks.recordSwipeResult.mockResolvedValue(AGGREGATES);
    renderGame();
    await chooseCorrectCard();

    await waitFor(() => expect(screen.getByText(/100 votes on this matchup/)).toBeTruthy());
    expect(screen.queryByTestId("swipe-community-unavailable")).toBeNull();
    expect(screen.getByText(/you sided with 75% of players/)).toBeTruthy();
  });

  it("prefers the BACKEND verdict over the local derivation", async () => {
    // The authority chain changed in Phase 4. The Supabase RPC no longer
    // returns a verdict at all (it writes is_correct NULL by design); factual
    // truth now comes from /api/meta-reflex/factual/verify, which re-derives it
    // from canonical data. The local comparison is only a fallback.
    mocks.recordSwipeResult.mockResolvedValue({ ...AGGREGATES, isCorrect: null });
    mocks.verifyFactualChoice.mockResolvedValue({
      category_id: "item-cost-duel",
      correct_id: "Long Sword",
      verified_correct: false,
      verdict_source: "server",
      reason: null,
    });
    renderGame();
    await chooseCorrectCard();

    await waitFor(() => expect(screen.getByText(/Incorrect/)).toBeTruthy());
    expect(screen.queryByText(/Correct!/)).toBeNull();
    // And it asked about the actual pair, sending no claim of its own.
    expect(mocks.verifyFactualChoice).toHaveBeenCalledWith(
      "item-cost-duel", "Infinity Edge", "Long Sword",
    );
  });

  it("does NOT mark a player wrong when the backend declines to judge", async () => {
    // verified_correct null means "unjudgeable" (entity retired, or values
    // converged after a patch) — never "incorrect". Falling through to the
    // local reading is the only honest behaviour.
    mocks.recordSwipeResult.mockResolvedValue({ ...AGGREGATES, isCorrect: null });
    mocks.verifyFactualChoice.mockResolvedValue({
      category_id: "item-cost-duel",
      correct_id: null,
      verified_correct: null,
      verdict_source: "unverified",
      reason: "tie under current data",
    });
    renderGame();
    await chooseCorrectCard();

    await waitFor(() => expect(screen.getByText(/Correct!/)).toBeTruthy());
  });

  it("still reveals when the verify call itself fails", async () => {
    mocks.recordSwipeResult.mockResolvedValue(AGGREGATES);
    mocks.verifyFactualChoice.mockResolvedValue(null);   // transport failure
    renderGame();
    await chooseCorrectCard();

    await waitFor(() => expect(screen.getByText(/Correct!/)).toBeTruthy());
  });
});
