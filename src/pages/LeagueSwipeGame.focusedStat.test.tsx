/**
 * Playing a focused base-stat mode end to end.
 *
 * The unit tests next door pin the registry, the resolver and the builder in
 * isolation. What they cannot see is the WIRING: that the page points the pool
 * query at the mode's canonical category, sends the Supabase game slug rather
 * than the route slug, asks the verifier for the mode's own category, and lets
 * nothing but the canonical verdict move the scoreboard.
 *
 * Every one of those can break without a crash — a wrong record slug loses
 * votes while the game keeps playing, a wrong category silently un-scores every
 * round — so they are pinned at the component boundary, against the real
 * builders rather than a mocked matchup.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueSwipeGame from "./LeagueSwipeGame";
import type { FactualPool, FactualVerdict, SwipeRevealAggregates } from "@/lib/league-swipe/api";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Real base-HP values. Sion genuinely outlives Ahri, so the LOCAL comparison
 * says "correct" — which is what makes the verdict-authority assertions below
 * meaningful: when the server disagrees, the server has to win.
 */
const HP_POOL: FactualPool = {
  categoryId: "champion-hp-duel",
  prompt: "Which champion has more base health?",
  unit: " HP",
  higherWins: true,
  entities: [
    { id: "Sion", label: "Sion", value: 720, asset_path: null },
    { id: "Ahri", label: "Ahri", value: 590, asset_path: null },
  ],
};

const AD_POOL: FactualPool = {
  categoryId: "champion-ad-duel",
  prompt: "Which champion has more base attack damage?",
  unit: " AD",
  higherWins: true,
  entities: [
    { id: "Draven", label: "Draven", value: 62, asset_path: null },
    { id: "Ahri", label: "Ahri", value: 53, asset_path: null },
  ],
};

const ARMOR_POOL: FactualPool = {
  categoryId: "champion-armor-duel",
  prompt: "Which champion has more base armor?",
  unit: " armor",
  higherWins: true,
  entities: [
    { id: "Rammus", label: "Rammus", value: 40, asset_path: null },
    { id: "Ahri", label: "Ahri", value: 21, asset_path: null },
  ],
};

const POOLS: Record<string, FactualPool> = {
  "champion-hp-duel": HP_POOL,
  "champion-ad-duel": AD_POOL,
  "champion-armor-duel": ARMOR_POOL,
};

const AGGREGATES: SwipeRevealAggregates = {
  matchupId: "m1",
  entityA: "Ahri",
  entityB: "Sion",
  votesA: 30,
  votesB: 70,
  totalVotes: 100,
  isCorrect: null,
  ratingChange: null,
  selectedRating: null,
  otherRating: null,
};

const verdict = (
  correct: boolean | null,
  correctId: string | null,
  categoryId = "champion-hp-duel",
): FactualVerdict => ({
  category_id: categoryId,
  correct_id: correctId,
  verified_correct: correct,
  verdict_source: correct === null ? "unverified" : "server",
  reason: null,
});

const mocks = vi.hoisted(() => ({
  recordSwipeResult: vi.fn(),
  verifyFactualChoice: vi.fn(),
  fetchFactualPool: vi.fn(),
  fetchChampionStats: vi.fn(),
  fetchItems: vi.fn(),
  fetchChampionNames: vi.fn(),
}));

vi.mock("@/lib/league-swipe/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
    "@/lib/league-swipe/api",
  );
  return {
    ...actual,
    // NOTE: makeFactualMatchup is deliberately NOT mocked — these tests should
    // fail if the real builder stops tagging rounds with the mode's stat.
    fetchChampionNames: mocks.fetchChampionNames,
    fetchChampionStats: mocks.fetchChampionStats,
    fetchItems: mocks.fetchItems,
    fetchFactualPool: mocks.fetchFactualPool,
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

function renderGame(slug: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/league-swipe/${slug}`]}>
        <Routes>
          <Route path="/league-swipe/:gameSlug" element={<LeagueSwipeGame />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Tap whichever card is on screen for `id`. */
async function choose(id: string) {
  const card = await screen.findByRole("button", { name: new RegExp(id) });
  fireEvent.click(card);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchChampionNames.mockResolvedValue([]);
  mocks.fetchChampionStats.mockResolvedValue([]);
  mocks.fetchItems.mockResolvedValue([]);
  mocks.fetchFactualPool.mockImplementation(async (id: string) => POOLS[id]);
  mocks.recordSwipeResult.mockResolvedValue(AGGREGATES);
  mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Sion"));
});
afterEach(cleanup);

describe.each([
  ["base-hp-duel", "champion-hp-duel", "hp", "Sion", "Which champion has more base health?"],
  ["base-ad-duel", "champion-ad-duel", "ad", "Draven", "Which champion has more base attack damage?"],
  ["base-armor-duel", "champion-armor-duel", "armor", "Rammus", "Which champion has more base armor?"],
] as const)("%s", (slug, categoryId, variant, winner, prompt) => {
  beforeEach(() => {
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, winner, categoryId));
  });

  it("deals from its own canonical category and nothing else", async () => {
    renderGame(slug);
    await waitFor(() => expect(mocks.fetchFactualPool).toHaveBeenCalledWith(categoryId));
    // The wide `/api/meta/champion-stats` pool must not be reached: it carries
    // rows the verifier cannot judge (a custom champion absent from `champions`),
    // so a card drawn from it can produce a permanently unscoreable round.
    expect(mocks.fetchChampionStats).not.toHaveBeenCalled();
    expect(mocks.fetchItems).not.toHaveBeenCalled();
    // Every other category's pool stays untouched — no mixing.
    const asked = mocks.fetchFactualPool.mock.calls.map((c) => c[0]);
    expect(new Set(asked)).toEqual(new Set([categoryId]));
  });

  it("asks the canonical question for the stat", async () => {
    renderGame(slug);
    expect(await screen.findByRole("heading", { name: prompt })).toBeTruthy();
  });

  it("records under the Supabase game with the mode's stat as the variant", async () => {
    renderGame(slug);
    await screen.findByRole("heading", { name: prompt });
    await choose(winner);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalled());

    const call = mocks.recordSwipeResult.mock.calls[0][0];
    // The route slug would raise `unknown league swipe game` and drop the vote.
    expect(call.gameSlug).toBe("higher-base-stat");
    // The RPC reads the variant out of context.stat, which is what keeps the
    // three modes' community aggregates from sharing one bucket.
    expect(call.context).toMatchObject({ stat: variant });
    expect(call.clientSubmissionId).toMatch(UUID_V4);
  });

  it("verifies against its own category only", async () => {
    renderGame(slug);
    await screen.findByRole("heading", { name: prompt });
    await choose(winner);
    await waitFor(() => expect(mocks.verifyFactualChoice).toHaveBeenCalled());
    expect(mocks.verifyFactualChoice.mock.calls[0][0]).toBe(categoryId);
  });

  it("shows both canonical values on the reveal", async () => {
    renderGame(slug);
    await screen.findByRole("heading", { name: prompt });
    await choose(winner);
    await screen.findByText(/Correct!/);
    const pool = POOLS[categoryId];
    for (const e of pool.entities) {
      expect(
        screen.getAllByText(new RegExp(`${e.value}${pool.unit}`)).length,
        `${e.id} value`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("focused modes — the canonical verdict is the only scoring authority", () => {
  it("scores and extends the streak on a server-confirmed correct answer", async () => {
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Sion"));
    renderGame("base-hp-duel");
    await screen.findByRole("heading", { name: /base health/ });
    await choose("Sion");
    await waitFor(() => expect(screen.getByTestId("swipe-score").textContent).toBe("1/1"));
    expect(screen.getByTestId("swipe-streak").textContent).toContain("1");
  });

  it("resets the streak when the server says the answer was wrong, even though the local reading agrees with the player", async () => {
    // Sion really does have more base HP than Ahri, so the browser's own
    // comparison would call this correct. The server must still win.
    mocks.verifyFactualChoice
      .mockResolvedValueOnce(verdict(true, "Sion"))
      .mockResolvedValueOnce(verdict(false, "Ahri"));

    renderGame("base-hp-duel");
    await screen.findByRole("heading", { name: /base health/ });
    await choose("Sion");
    await waitFor(() => expect(screen.getByTestId("swipe-streak").textContent).toContain("1"));

    fireEvent.click(screen.getByRole("button", { name: /Next matchup/ }));
    await choose("Sion");
    await waitFor(() => expect(screen.getByTestId("swipe-streak").textContent).toContain("0"));
    // Scored, and scored wrong: the denominator moved, the numerator did not.
    expect(screen.getByTestId("swipe-score").textContent).toBe("1/2");
  });

  it("leaves score and streak untouched when the answer cannot be judged", async () => {
    mocks.verifyFactualChoice
      .mockResolvedValueOnce(verdict(true, "Sion"))
      .mockResolvedValueOnce(verdict(null, null));

    renderGame("base-hp-duel");
    await screen.findByRole("heading", { name: /base health/ });
    await choose("Sion");
    await waitFor(() => expect(screen.getByTestId("swipe-score").textContent).toBe("1/1"));

    fireEvent.click(screen.getByRole("button", { name: /Next matchup/ }));
    await choose("Sion");
    await screen.findByTestId("swipe-round-unscored");
    // Unchanged — an unjudged round is not a miss.
    expect(screen.getByTestId("swipe-score").textContent).toBe("1/1");
    expect(screen.getByTestId("swipe-streak").textContent).toContain("1");
  });

  it("does not score when the verifier is unreachable", async () => {
    mocks.verifyFactualChoice.mockResolvedValue(null);
    renderGame("base-hp-duel");
    await screen.findByRole("heading", { name: /base health/ });
    await choose("Sion");
    await screen.findByTestId("swipe-round-unscored");
    expect(screen.getByTestId("swipe-score").textContent).toBe("0/0");
    expect(screen.getByTestId("swipe-streak").textContent).toContain("0");
  });
});

describe("focused modes — submission identity", () => {
  it("submits one attempt under one id however many times the card is tapped", async () => {
    renderGame("base-hp-duel");
    await screen.findByRole("heading", { name: /base health/ });
    const card = await screen.findByRole("button", { name: /Sion/ });
    fireEvent.click(card);
    fireEvent.click(card);
    fireEvent.click(card);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalled());
    const ids = mocks.recordSwipeResult.mock.calls.map((c) => c[0].clientSubmissionId);
    expect(new Set(ids).size).toBe(1);
  });

  it("treats the same pair dealt again as a NEW attempt with a new id", async () => {
    // The identity is the attempt, never the entity pair. This two-champion pool
    // can only ever deal Sion vs Ahri, so the second round is the same pair.
    renderGame("base-hp-duel");
    await screen.findByRole("heading", { name: /base health/ });
    await choose("Sion");
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Next matchup/ }));
    await choose("Sion");
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(2));

    const [first, second] = mocks.recordSwipeResult.mock.calls.map((c) => c[0]);
    expect(first.selected).toBe(second.selected);
    expect(first.other).toBe(second.other);
    expect(first.clientSubmissionId).not.toBe(second.clientSubmissionId);
    expect(second.clientSubmissionId).toMatch(UUID_V4);
  });
});

describe("focused modes — opinion ratings stay out of it", () => {
  it("never sends an opinion game slug, so no preference or rating can move", async () => {
    // Community rankings are driven exclusively by preference rows the RPC
    // writes for `mode = 'opinion'` games. A knowledge slug cannot reach that
    // branch, so a factual answer cannot touch an entity rating.
    for (const slug of ["base-hp-duel", "base-ad-duel", "base-armor-duel"]) {
      cleanup();
      mocks.recordSwipeResult.mockClear();
      renderGame(slug);
      const card = await screen.findByRole("button", { name: /Ahri/ });
      fireEvent.click(card);
      await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalled());
      expect(mocks.recordSwipeResult.mock.calls[0][0].gameSlug).toBe("higher-base-stat");
    }
  });

  it("shows the knowledge scoreboard, not the opinion rating line", async () => {
    renderGame("base-armor-duel");
    await screen.findByRole("heading", { name: /base armor/ });
    expect(screen.getByTestId("swipe-score")).toBeTruthy();
    await choose("Rammus");
    await screen.findByText(/Correct!|Incorrect/);
    expect(screen.queryByText(/rating/i)).toBeNull();
  });
});

describe("focused modes — base MR cannot leak in", () => {
  it("never asks for a base-MR pool or a base-MR verdict", async () => {
    for (const slug of ["base-hp-duel", "base-ad-duel", "base-armor-duel"]) {
      cleanup();
      vi.clearAllMocks();
      mocks.fetchFactualPool.mockImplementation(async (id: string) => POOLS[id]);
      mocks.recordSwipeResult.mockResolvedValue(AGGREGATES);
      mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Ahri"));

      renderGame(slug);
      const card = await screen.findByRole("button", { name: /Ahri/ });
      fireEvent.click(card);
      await waitFor(() => expect(mocks.verifyFactualChoice).toHaveBeenCalled());

      const pools = mocks.fetchFactualPool.mock.calls.map((c) => c[0]);
      const categories = mocks.verifyFactualChoice.mock.calls.map((c) => c[0]);
      const variants = mocks.recordSwipeResult.mock.calls.map((c) => c[0].context?.stat);
      expect(pools.join()).not.toContain("magic-resist");
      expect(categories.join()).not.toContain("magic-resist");
      expect(variants).not.toContain("magic_resist");
    }
  });
});
