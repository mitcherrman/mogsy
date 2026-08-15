/**
 * Stats page: an UNJUDGED factual answer must never look like a wrong one.
 *
 * `verifiedCorrect` has three states, not two. The previous renderer used a
 * plain `r.is_correct ? ✓ : ✗`, so a null — meaning "could not be checked
 * against current data" — rendered as a red X. With derive-on-read that null is
 * routine (a retired item, a stat with no evaluator, an unreachable backend),
 * so the two-state render would start telling players they got questions wrong
 * because the data moved.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueSwipeStats from "./LeagueSwipeStats";
import type { SwipeFactualAccuracy, SwipeOwnResult } from "@/lib/league-swipe/api";

const mocks = vi.hoisted(() => ({
  fetchSwipeStats: vi.fn(),
  fetchMyRecentResults: vi.fn(),
  fetchTopRatings: vi.fn(),
  fetchFactualCommunityAccuracy: vi.fn(),
}));

vi.mock("@/lib/league-swipe/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
    "@/lib/league-swipe/api",
  );
  return { ...actual, ...mocks };
});
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

const EMPTY_STATS = {
  totals: {
    swipes: 140, opinionVotes: 0, knowledgeAnswers: 140,
    // The dead fields the page must ignore: SQL computes them from the
    // always-NULL is_correct column.
    correct: 0, incorrect: 0, accuracy: null,
    avgResponseMs: 1200, uniqueMatchups: 2,
  },
  perGame: [
    { slug: "item-cost-duel", title: "Item Cost Duel", mode: "knowledge" as const, swipes: 100, accuracy: null },
  ],
  mostMissed: [],
  mostVoted: [], closest: [], blowouts: [],
};

const ACCURACY: SwipeFactualAccuracy = {
  attempts: 140, correct: 50, accuracy: 35.7, judgedPairs: 2, unjudgedPairs: 0,
  truncated: false,
  perGame: { "item-cost-duel": 20 },
  mostMissed: [{ game: "item-cost-duel", entityA: "Axiom Arc", entityB: "Chempunk Chainsword", correct: "Chempunk Chainsword", missCount: 80 }],
};

function result(over: Partial<SwipeOwnResult>): SwipeOwnResult {
  return {
    selectedEntity: "Axiom Arc", otherEntity: "Chempunk Chainsword",
    variant: "cost", responseTimeMs: 1500, createdAt: "2026-08-14T00:00:00Z",
    gameSlug: "item-cost-duel", gameTitle: "Item Cost Duel",
    verifiedCorrect: null, correctEntity: null, ...over,
  };
}

function renderStats() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><LeagueSwipeStats /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchSwipeStats.mockResolvedValue(EMPTY_STATS);
  mocks.fetchTopRatings.mockResolvedValue([]);
  mocks.fetchFactualCommunityAccuracy.mockResolvedValue(ACCURACY);
  mocks.fetchMyRecentResults.mockResolvedValue([]);
});
afterEach(cleanup);

describe("your recent answers", () => {
  it("marks an unjudged answer neutrally, not as incorrect", async () => {
    mocks.fetchMyRecentResults.mockResolvedValue([result({ verifiedCorrect: null })]);
    renderStats();

    await waitFor(() => expect(screen.getByTestId("swipe-result-unjudged")).toBeTruthy());
    expect(screen.getByTestId("swipe-result-unjudged").getAttribute("aria-label")).toBe("Not checked");
  });

  it("distinguishes all three states", async () => {
    mocks.fetchMyRecentResults.mockResolvedValue([
      result({ selectedEntity: "Right", verifiedCorrect: true }),
      result({ selectedEntity: "Wrong", verifiedCorrect: false }),
      result({ selectedEntity: "Unknown", verifiedCorrect: null }),
    ]);
    renderStats();

    await waitFor(() => expect(screen.getByText("Right")).toBeTruthy());
    expect(screen.getAllByTestId("swipe-result-unjudged")).toHaveLength(1);
  });
});

describe("community accuracy is derived, not read from the dead RPC fields", () => {
  it("shows the derived accuracy even though stats.totals.accuracy is null", async () => {
    renderStats();
    await waitFor(() => expect(screen.getByText("35.7%")).toBeTruthy());
  });

  it("shows derived per-game accuracy", async () => {
    renderStats();
    await waitFor(() => expect(screen.getByText(/20% community accuracy/)).toBeTruthy());
  });

  it("shows most-missed from the derived source, not the always-empty RPC field", async () => {
    renderStats();
    await waitFor(() => expect(screen.getByText(/Axiom Arc vs Chempunk Chainsword/)).toBeTruthy());
    expect(screen.getByText(/Answer: Chempunk Chainsword/)).toBeTruthy();
    expect(screen.queryByText(/Nothing missed yet/)).toBeNull();
  });

  it("renders a dash rather than 0% when nothing can be judged", async () => {
    mocks.fetchFactualCommunityAccuracy.mockResolvedValue({ ...ACCURACY, accuracy: null, mostMissed: [] });
    renderStats();
    await waitFor(() => expect(screen.getByText(/Nothing missed yet/)).toBeTruthy());
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("says so when the aggregate was capped", async () => {
    mocks.fetchFactualCommunityAccuracy.mockResolvedValue({ ...ACCURACY, truncated: true, judgedPairs: 400 });
    renderStats();
    await waitFor(() => expect(screen.getByText(/400 most-played matchups/)).toBeTruthy());
  });
});
