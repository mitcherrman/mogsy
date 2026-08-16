/**
 * Where the client submission id is ATTACHED, and when it rotates.
 *
 * The identity belongs to the dealt attempt, not to the entity pair: replaying
 * the same two entities later is a new question and must be a new attempt. These
 * tests pin that boundary, because the upcoming auto-submit slice (tap a card →
 * lock, reveal, auto-advance) removes the confirm step and makes the boundary
 * the only thing standing between a stray double-fire and a duplicated vote.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueSwipeGame from "./LeagueSwipeGame";
import type { SwipeMatchup } from "@/lib/league-swipe/api";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const mocks = vi.hoisted(() => ({
  recordSwipeResult: vi.fn(),
  verifyFactualChoice: vi.fn(),
  makeStatMatchup: vi.fn(),
  makeOpinionMatchup: vi.fn(),
}));

vi.mock("@/lib/league-swipe/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
    "@/lib/league-swipe/api",
  );
  return {
    ...actual,
    fetchItems: vi.fn(async () => []),
    fetchChampionNames: vi.fn(async () => ["Garen", "Ahri"]),
    fetchChampionStats: vi.fn(async () => [
      { champion_name: "Garen", hp: 690, ad: 69, armor: 38, magic_resist: 32, move_speed: 340, attack_range: 175 },
      { champion_name: "Ahri", hp: 590, ad: 53, armor: 21, magic_resist: 32, move_speed: 330, attack_range: 550 },
    ]),
    makeStatMatchup: mocks.makeStatMatchup,
    makeOpinionMatchup: mocks.makeOpinionMatchup,
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

/** The SAME pair every time — so any id change is the deal, never the entities. */
function statMatchup(): SwipeMatchup {
  return {
    prompt: "Which champion has the higher base HP?",
    left: { id: "Garen", label: "Garen", value: 690 },
    right: { id: "Ahri", label: "Ahri", value: 590 },
    correctId: "Garen",
    context: { stat: "hp", statLabel: "HP" },
  };
}

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

const submittedIds = () =>
  mocks.recordSwipeResult.mock.calls.map((c) => c[0].clientSubmissionId as string);

async function pick(name: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name }));
}

/** Reveal → "Next matchup" deals a new attempt. */
async function advance() {
  await waitFor(() => expect(screen.getByRole("button", { name: /Next matchup/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Next matchup/ }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /Next matchup/ })).toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordSwipeResult.mockResolvedValue(null);
  mocks.verifyFactualChoice.mockResolvedValue(null);
  mocks.makeStatMatchup.mockImplementation(statMatchup);
  mocks.makeOpinionMatchup.mockImplementation(() => ({
    prompt: "Which champion do you like more?",
    left: { id: "Garen", label: "Garen" },
    right: { id: "Ahri", label: "Ahri" },
  }));
});
afterEach(cleanup);

describe("one logical submission carries one client submission id", () => {
  it("sends exactly one submission, with a valid UUID, for one click", async () => {
    renderGame("higher-base-stat");
    await pick(/Garen/);

    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));
    expect(submittedIds()[0]).toMatch(UUID_V4);
  });

  it("refuses a second click on the same dealt attempt", async () => {
    // First line of defence: the card is disabled the moment a choice locks, so
    // no second id is ever minted. The RPC short-circuit is the second line, for
    // the sub-frame double-fire this guard cannot see (see the api-level suite).
    renderGame("higher-base-stat");
    const garen = await screen.findByRole("button", { name: /Garen/ });
    fireEvent.click(garen);
    fireEvent.click(garen);
    fireEvent.click(await screen.findByRole("button", { name: /Ahri/ }));

    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));
  });

  it("a retry of the same attempt reuses the captured id", async () => {
    // What a future retry/offline-queue path must do: re-send the id it captured
    // at submit time, rather than reading the ref back (auto-advance rotates it).
    renderGame("higher-base-stat");
    await pick(/Garen/);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));

    const submitted = mocks.recordSwipeResult.mock.calls[0][0];
    await mocks.recordSwipeResult(submitted);

    const ids = submittedIds();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });
});

describe("the id rotates per ATTEMPT, not per entity pair", () => {
  it("advancing to the next matchup mints a different id", async () => {
    renderGame("higher-base-stat");
    await pick(/Garen/);
    await advance();
    await pick(/Garen/);

    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(2));
    const [first, second] = submittedIds();
    expect(second).not.toBe(first);
    expect(second).toMatch(UUID_V4);
  });

  it("seeing the SAME entity pair again is a new attempt with a new id", async () => {
    // makeStatMatchup returns Garen vs Ahri every time, so these three rounds are
    // the identical pair. Three deals must still be three distinct attempts —
    // idempotency must never collapse legitimate practice repeats.
    renderGame("higher-base-stat");
    for (let round = 0; round < 3; round += 1) {
      await pick(/Garen/);
      await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(round + 1));
      if (round < 2) await advance();
    }

    const ids = submittedIds();
    const pairs = mocks.recordSwipeResult.mock.calls.map((c) => `${c[0].selected}|${c[0].other}`);
    expect(new Set(pairs).size).toBe(1); // same pair every round
    expect(new Set(ids).size).toBe(3); // three distinct attempts
  });

  it("dev forcePair dealing one pair repeatedly still mints a new id per deal", async () => {
    // `?forcePair=` short-circuits the anti-repeat so the same pair is dealt on
    // consecutive rounds on purpose. That must not make them one attempt.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/league-swipe/higher-base-stat?forcePair=Garen,Ahri"]}>
          <Routes>
            <Route path="/league-swipe/:gameSlug" element={<LeagueSwipeGame />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await pick(/Garen/);
    await advance();
    await pick(/Ahri/);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(2));

    const ids = submittedIds();
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("existing semantics are untouched", () => {
  it("factual: still verifies against the canonical category and reveals its verdict", async () => {
    mocks.verifyFactualChoice.mockResolvedValue({
      category_id: "champion-hp-duel",
      correct_id: "Ahri",
      verified_correct: false,
      verdict_source: "server",
      reason: null,
    });
    renderGame("higher-base-stat");
    await pick(/Garen/);

    await waitFor(() => expect(screen.getByText(/Incorrect/)).toBeTruthy());
    expect(mocks.verifyFactualChoice).toHaveBeenCalledWith("champion-hp-duel", "Garen", "Ahri");
  });

  it("factual: the submission carries no correctness claim beyond what it always did", async () => {
    renderGame("higher-base-stat");
    await pick(/Garen/);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));

    expect(mocks.recordSwipeResult.mock.calls[0][0]).toMatchObject({
      gameSlug: "higher-base-stat",
      selected: "Garen",
      other: "Ahri",
      correct: "Garen",
      context: { stat: "hp", statLabel: "HP" },
    });
  });

  it("opinion: preference submissions are unchanged apart from the new id", async () => {
    renderGame("favorite-champion");
    await pick(/Garen/);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));

    const args = mocks.recordSwipeResult.mock.calls[0][0];
    expect(args).toMatchObject({
      gameSlug: "favorite-champion",
      selected: "Garen",
      other: "Ahri",
    });
    expect(args.correct).toBeUndefined();
    expect(args.clientSubmissionId).toMatch(UUID_V4);
    // Opinion games have no factual truth and must never reach a verifier.
    expect(mocks.verifyFactualChoice).not.toHaveBeenCalled();
  });

  it("opinion: revoting the same pair later is a new attempt, so the RPC decides the semantics", async () => {
    // Preference semantics (same vote = no-op, changed vote = moved) live in the
    // RPC and are driven by the voter+pair, not by the submission id. A new id
    // per attempt is what keeps the RPC ABLE to see the second vote at all.
    renderGame("favorite-champion");
    await pick(/Garen/);
    await advance();
    await pick(/Ahri/);

    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(2));
    const ids = submittedIds();
    expect(ids[0]).not.toBe(ids[1]);
    expect(mocks.recordSwipeResult.mock.calls[1][0].selected).toBe("Ahri");
  });
});
