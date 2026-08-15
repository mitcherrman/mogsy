/**
 * Stat Duel must reach a CANONICAL evaluator, not just Item Cost Duel.
 *
 * Phase 4 wired the standalone game to the shared factual verifier by passing
 * `game.slug` as the category. That silently only ever worked for Item Cost
 * Duel, whose slug happens to equal its category id. Stat Duel's slug
 * (`higher-base-stat`) is not a category at all, so every Stat Duel answer
 * 404'd and fell back to the browser's own comparison — the exact authority the
 * feature exists to remove. These tests pin the fix.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueSwipeGame from "./LeagueSwipeGame";
import type { SwipeMatchup } from "@/lib/league-swipe/api";

const mocks = vi.hoisted(() => ({
  recordSwipeResult: vi.fn(),
  verifyFactualChoice: vi.fn(),
  makeStatMatchup: vi.fn(),
}));

vi.mock("@/lib/league-swipe/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
    "@/lib/league-swipe/api",
  );
  return {
    ...actual,
    fetchChampionNames: vi.fn(async () => []),
    fetchItems: vi.fn(async () => []),
    fetchChampionStats: vi.fn(async () => [
      { champion_name: "Garen", hp: 690, ad: 69, armor: 38, magic_resist: 32, move_speed: 340, attack_range: 175 },
      { champion_name: "Ahri", hp: 590, ad: 53, armor: 21, magic_resist: 32, move_speed: 330, attack_range: 550 },
    ]),
    makeStatMatchup: mocks.makeStatMatchup,
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

function statMatchup(stat: string): SwipeMatchup {
  return {
    prompt: `Which champion has the higher base ${stat}?`,
    left: { id: "Garen", label: "Garen", value: 690 },
    right: { id: "Ahri", label: "Ahri", value: 590 },
    correctId: "Garen",
    context: { stat, statLabel: stat },
  };
}

function renderStatDuel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/league-swipe/higher-base-stat"]}>
        <Routes>
          <Route path="/league-swipe/:gameSlug" element={<LeagueSwipeGame />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pickGaren() {
  fireEvent.click(await screen.findByRole("button", { name: /Garen/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordSwipeResult.mockResolvedValue(null);
  mocks.verifyFactualChoice.mockResolvedValue(null);
});
afterEach(cleanup);

describe("Stat Duel factual verification", () => {
  it("verifies against the stat's own category, never the game slug", async () => {
    mocks.makeStatMatchup.mockReturnValue(statMatchup("hp"));
    renderStatDuel();
    await pickGaren();

    await waitFor(() => expect(mocks.verifyFactualChoice).toHaveBeenCalled());
    expect(mocks.verifyFactualChoice).toHaveBeenCalledWith("champion-hp-duel", "Garen", "Ahri");
    expect(mocks.verifyFactualChoice).not.toHaveBeenCalledWith(
      "higher-base-stat", expect.anything(), expect.anything(),
    );
  });

  it("routes each stat to its own evaluator", async () => {
    for (const [stat, category] of [
      ["ad", "champion-ad-duel"],
      ["armor", "champion-armor-duel"],
      ["move_speed", "champion-move-speed-duel"],
      ["attack_range", "champion-attack-range-duel"],
    ] as const) {
      vi.clearAllMocks();
      mocks.recordSwipeResult.mockResolvedValue(null);
      mocks.verifyFactualChoice.mockResolvedValue(null);
      mocks.makeStatMatchup.mockReturnValue(statMatchup(stat));
      renderStatDuel();
      await pickGaren();
      await waitFor(() => expect(mocks.verifyFactualChoice).toHaveBeenCalled());
      expect(mocks.verifyFactualChoice).toHaveBeenCalledWith(category, "Garen", "Ahri");
      cleanup();
    }
  });

  it("does not call the verifier at all for base magic resist", async () => {
    // No canonical MR category exists (base MR ties on ~39% of pairs). Asking
    // anyway would 404 on every answer, which is noise, not verification.
    mocks.makeStatMatchup.mockReturnValue(statMatchup("magic_resist"));
    renderStatDuel();
    await pickGaren();

    await waitFor(() => expect(screen.getByText(/Correct!/)).toBeTruthy());
    expect(mocks.verifyFactualChoice).not.toHaveBeenCalled();
  });

  it("lets the backend overturn the local reading for a stat duel", async () => {
    mocks.makeStatMatchup.mockReturnValue(statMatchup("hp"));
    mocks.verifyFactualChoice.mockResolvedValue({
      category_id: "champion-hp-duel",
      correct_id: "Ahri",
      verified_correct: false,
      verdict_source: "server",
      reason: null,
    });
    renderStatDuel();
    await pickGaren();

    await waitFor(() => expect(screen.getByText(/Incorrect/)).toBeTruthy());
  });
});
