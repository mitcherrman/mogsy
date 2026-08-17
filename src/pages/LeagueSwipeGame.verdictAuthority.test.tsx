/**
 * WHO IS ALLOWED TO MOVE THE FACTUAL SCOREBOARD.
 *
 * The regression these pin: score, streak and rounds were written synchronously
 * inside `handleChoose`, from `chosen.id === matchup.correctId`, BEFORE the
 * submission was even sent. The canonical verdict arrived afterwards and was
 * spent only on the reveal badge, so a round the backend judged `Incorrect`
 * revealed as incorrect on a scoreboard that had already banked the point and
 * extended the streak. The two readings could disagree because they came from
 * two different authorities.
 *
 * The property under test is therefore not "the badge is right" — Phase 4
 * already pinned that — but "the COUNTERS come from the same canonical verdict
 * the badge does, and from nothing else". A local comparison must be incapable
 * of reaching them, including in the cases where it is still good enough to
 * render.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueSwipeGame from "./LeagueSwipeGame";
import type { FactualVerdict, SwipeMatchup, SwipeRevealAggregates } from "@/lib/league-swipe/api";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Garen really does have more base HP than Ahri, so the LOCAL reading is "correct". */
const STAT_MATCHUP: SwipeMatchup = {
  prompt: "Which champion has the higher base HP?",
  left: { id: "Garen", label: "Garen", value: 690 },
  right: { id: "Ahri", label: "Ahri", value: 590 },
  correctId: "Garen",
  context: { stat: "hp", statLabel: "HP" },
};

const AGGREGATES: SwipeRevealAggregates = {
  matchupId: "m1",
  entityA: "Garen",
  entityB: "Ahri",
  votesA: 60,
  votesB: 40,
  totalVotes: 100,
  isCorrect: null,
  ratingChange: null,
  selectedRating: null,
  otherRating: null,
};

const verdict = (correct: boolean | null, correctId: string | null): FactualVerdict => ({
  category_id: "champion-hp-duel",
  correct_id: correctId,
  verified_correct: correct,
  verdict_source: correct === null ? "unverified" : "server",
  reason: null,
});

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

const pick = async (name: RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

const score = () => screen.getByTestId("swipe-score").textContent;
/** The streak span also contains the flame icon, so read just the digits. */
const streak = () => screen.getByTestId("swipe-streak").textContent?.trim();

const revealed = () => screen.queryByRole("button", { name: /Next matchup/ }) !== null;
const awaitReveal = () => waitFor(() => expect(revealed()).toBe(true));

/** Reveal → "Next matchup" deals the next attempt. */
async function advance() {
  await awaitReveal();
  fireEvent.click(screen.getByRole("button", { name: /Next matchup/ }));
  await waitFor(() => expect(revealed()).toBe(false));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordSwipeResult.mockResolvedValue(AGGREGATES);
  mocks.verifyFactualChoice.mockResolvedValue(null);
  mocks.makeStatMatchup.mockImplementation(() => STAT_MATCHUP);
  mocks.makeOpinionMatchup.mockImplementation(() => ({
    prompt: "Which champion do you like more?",
    left: { id: "Garen", label: "Garen" },
    right: { id: "Ahri", label: "Ahri" },
  }));
});
afterEach(cleanup);

describe("the canonical verdict is the only thing that scores", () => {
  it("server says correct → score and streak both increment", async () => {
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Garen"));
    renderGame("higher-base-stat");
    expect(score()).toBe("0/0");

    await pick(/Garen/);
    await awaitReveal();

    expect(score()).toBe("1/1");
    expect(streak()).toBe("1");
    expect(screen.getByText(/Correct!/)).toBeTruthy();
  });

  it("server says incorrect → the streak resets to zero", async () => {
    // Build a streak of two on canonical verdicts, then have the server reject
    // the third. A reset is only meaningful against a non-zero starting value.
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Garen"));
    renderGame("higher-base-stat");
    await pick(/Garen/);
    await awaitReveal();
    await advance();
    await pick(/Garen/);
    await waitFor(() => expect(streak()).toBe("2"));
    await advance();

    mocks.verifyFactualChoice.mockResolvedValue(verdict(false, "Ahri"));
    await pick(/Garen/);
    await awaitReveal();

    expect(streak()).toBe("0");
    // The round still counted — it was judged, just judged wrong.
    expect(score()).toBe("2/3");
  });

  it("local comparison disagrees with the server → the server wins BOTH the badge and the counters", async () => {
    // THE REGRESSION. Garen genuinely has the higher base HP, so the browser's
    // own comparison says "correct" and used to bank a point on the spot. The
    // canonical verifier says otherwise; nothing about the local reading may
    // survive into the scoreboard.
    mocks.verifyFactualChoice.mockResolvedValue(verdict(false, "Ahri"));
    renderGame("higher-base-stat");

    await pick(/Garen/);
    await awaitReveal();

    expect(screen.getByText(/Incorrect/)).toBeTruthy();
    expect(screen.queryByText(/Correct!/)).toBeNull();
    expect(score()).toBe("0/1");
    expect(streak()).toBe("0");
  });

  it("never moves the scoreboard BEFORE the verdict lands", async () => {
    // The ordering defect itself, isolated: hold the verifier open and prove the
    // counters have not moved while the submission is in flight. Passing this
    // with an optimistic local update is impossible.
    let release!: (v: FactualVerdict) => void;
    mocks.verifyFactualChoice.mockImplementation(
      () => new Promise<FactualVerdict>((resolve) => { release = resolve; }),
    );
    renderGame("higher-base-stat");
    await pick(/Garen/);

    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.verifyFactualChoice).toHaveBeenCalledTimes(1));
    // Locked and submitted, verdict outstanding: nothing scored, nothing revealed.
    expect(score()).toBe("0/0");
    expect(streak()).toBe("0");
    expect(revealed()).toBe(false);

    release(verdict(true, "Garen"));
    await awaitReveal();
    expect(score()).toBe("1/1");
    expect(streak()).toBe("1");
  });

  it("the RPC's own isCorrect echo cannot score a round either", async () => {
    // `aggregates.isCorrect` is the browser's `p_correct_entity` round-tripped
    // through the RPC, not an independent judgement. It may still feed the
    // reveal fallback, but it is not an authority and must not score.
    mocks.recordSwipeResult.mockResolvedValue({ ...AGGREGATES, isCorrect: true });
    mocks.verifyFactualChoice.mockResolvedValue(null);
    renderGame("higher-base-stat");

    await pick(/Garen/);
    await awaitReveal();

    expect(score()).toBe("0/0");
    expect(streak()).toBe("0");
  });
});

describe("unjudged answers stay neutral", () => {
  it("a declined verdict neither increments nor resets, and says the round was not scored", async () => {
    mocks.verifyFactualChoice.mockResolvedValue(verdict(null, null));
    renderGame("higher-base-stat");

    await pick(/Garen/);
    await awaitReveal();

    expect(score()).toBe("0/0");
    expect(streak()).toBe("0");
    expect(screen.getByTestId("swipe-round-unscored")).toBeTruthy();
    // Still informative: the player is not accused of being wrong.
    expect(screen.getByText(/Correct!/)).toBeTruthy();
  });

  it("an unreachable verifier does not break a streak the player earned", async () => {
    // The nastiest shape of the bug's mirror image: a network blip must not cost
    // a player their run, and must not silently extend it either.
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Garen"));
    renderGame("higher-base-stat");
    await pick(/Garen/);
    await waitFor(() => expect(streak()).toBe("1"));
    await advance();

    mocks.verifyFactualChoice.mockResolvedValue(null); // transport failure
    await pick(/Garen/);
    await awaitReveal();

    expect(streak()).toBe("1");
    expect(score()).toBe("1/1");
    expect(screen.getByTestId("swipe-round-unscored")).toBeTruthy();
  });

  it("a variant with no canonical evaluator is unscored rather than free points", async () => {
    // Base MR — the variant this rule was written for — is no longer DEALT, so
    // this drives the page with an unmapped variant directly. The behaviour still
    // has to hold: a stored MR row can be replayed, and any stat added to the
    // pool ahead of its evaluator lands here. Reaching the state through the
    // generator is what `factualCategories.test.ts` now forbids; reaching it at
    // all must still be safe.
    mocks.makeStatMatchup.mockReturnValue({
      ...STAT_MATCHUP,
      context: { stat: "magic_resist", statLabel: "Magic Resist" },
    });
    renderGame("higher-base-stat");

    await pick(/Garen/);
    await awaitReveal();

    expect(mocks.verifyFactualChoice).not.toHaveBeenCalled();
    expect(score()).toBe("0/0");
    expect(streak()).toBe("0");
    expect(screen.getByTestId("swipe-round-unscored")).toBeTruthy();
  });

  it("a scored round carries no unscored notice", async () => {
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Garen"));
    renderGame("higher-base-stat");

    await pick(/Garen/);
    await awaitReveal();

    expect(screen.queryByTestId("swipe-round-unscored")).toBeNull();
  });
});

describe("opinion rounds are outside the factual scoreboard", () => {
  it("an opinion round reaches no verifier and shows no factual counters", async () => {
    renderGame("favorite-champion");

    await pick(/Garen/);
    await awaitReveal();

    expect(mocks.verifyFactualChoice).not.toHaveBeenCalled();
    expect(screen.queryByTestId("swipe-score")).toBeNull();
    expect(screen.queryByTestId("swipe-streak")).toBeNull();
    // No correctness claim of any kind on a question that has no right answer.
    expect(screen.queryByText(/Correct!/)).toBeNull();
    expect(screen.queryByText(/Incorrect/)).toBeNull();
    expect(screen.queryByTestId("swipe-round-unscored")).toBeNull();
    expect(screen.getByText(/You chose/)).toBeTruthy();
  });

  it("opinion rounds still submit, they just do not judge", async () => {
    renderGame("favorite-champion");
    await pick(/Garen/);

    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));
    expect(mocks.recordSwipeResult.mock.calls[0][0]).toMatchObject({
      gameSlug: "favorite-champion",
      selected: "Garen",
      other: "Ahri",
    });
  });
});

describe("one tap is still one submission", () => {
  it("selecting a card submits immediately, with no confirm step", async () => {
    renderGame("higher-base-stat");
    // Before the tap the only buttons are the two cards plus the back link.
    expect(screen.queryByRole("button", { name: /confirm|submit|lock in/i })).toBeNull();

    await pick(/Garen/);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));

    // And none appears on the reveal either — "Next matchup" advances, it does
    // not commit the answer, which was committed by the tap.
    await awaitReveal();
    expect(screen.queryByRole("button", { name: /confirm|submit|lock in/i })).toBeNull();
  });

  it("a double tap scores the round once, not twice", async () => {
    // The card is disabled the moment a choice locks, but that guard reads state
    // from a closure that has not re-rendered, so a sub-frame double-fire can
    // slip through. It must not be able to double-count the streak.
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Garen"));
    renderGame("higher-base-stat");
    const garen = await screen.findByRole("button", { name: /Garen/ });
    fireEvent.click(garen);
    fireEvent.click(garen);

    await awaitReveal();
    expect(score()).toBe("1/1");
    expect(streak()).toBe("1");
  });

  it("the submission id is untouched by the new scoring path", async () => {
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Garen"));
    renderGame("higher-base-stat");

    await pick(/Garen/);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(1));
    const first = mocks.recordSwipeResult.mock.calls[0][0].clientSubmissionId as string;
    expect(first).toMatch(UUID_V4);

    // A new deal is a new attempt, exactly as before.
    await advance();
    await pick(/Garen/);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(2));
    const second = mocks.recordSwipeResult.mock.calls[1][0].clientSubmissionId as string;
    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(first);
  });
});

describe("the reveal beat", () => {
  /** The countdown bar's transition duration IS the auto-advance timer's period. */
  const countdownMs = () => {
    const bar = document.querySelector<HTMLElement>("[aria-hidden].absolute.bottom-0");
    return bar?.style.transitionDuration ?? null;
  };

  it("factual reveals hold for 1.5s, driven by the existing countdown bar", async () => {
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Garen"));
    renderGame("higher-base-stat");
    await pick(/Garen/);
    await awaitReveal();

    // Bound to autoAdvanceMs, so this pins that the bar and the timer are the
    // same system rather than two clocks that can drift apart.
    await waitFor(() => expect(countdownMs()).toBe("1500ms"));
  });

  it("deals a NEW matchup on its own after ~1500ms, with no Next click", async () => {
    // The bar reaching 100% is not the claim. The claim is that `nextMatchup`
    // actually ran: a fresh matchup was dealt and a fresh attempt identity
    // minted, unprompted. Before the stalled-timer fix this never happened at
    // all, at any duration.
    mocks.verifyFactualChoice.mockResolvedValue(verdict(true, "Garen"));
    renderGame("higher-base-stat");
    await pick(/Garen/);
    await awaitReveal();

    const dealsAtReveal = mocks.makeStatMatchup.mock.calls.length;
    const firstAttempt = mocks.recordSwipeResult.mock.calls[0][0].clientSubmissionId as string;

    // Not yet: at 600ms the old 3500ms hold would have been a sixth done, and the
    // new one is not finished either. This is the lower bound of the beat.
    await new Promise((r) => setTimeout(r, 600));
    expect(revealed()).toBe(true);
    expect(mocks.makeStatMatchup.mock.calls.length).toBe(dealsAtReveal);

    // Now: the reveal tears down and the generator is asked for another matchup.
    // The 2500ms ceiling is well inside the old 3500ms hold, so a regression to
    // the previous pacing fails here rather than passing slowly.
    await waitFor(() => expect(revealed()).toBe(false), { timeout: 2500 });
    expect(mocks.makeStatMatchup.mock.calls.length).toBeGreaterThan(dealsAtReveal);

    // And the dealt matchup is a genuinely new ATTEMPT, not a re-render of the
    // old one — answering it submits under a different identity.
    await pick(/Garen/);
    await waitFor(() => expect(mocks.recordSwipeResult).toHaveBeenCalledTimes(2));
    expect(mocks.recordSwipeResult.mock.calls[1][0].clientSubmissionId).not.toBe(firstAttempt);

    // The streak earned before the advance survived it, and the new round scored.
    expect(streak()).toBe("2");
  });

  it("opinion pacing is left alone, but it does now actually advance", async () => {
    // The stalled-timer defect was not factual-specific — it came from the pool
    // queries' unstable empty defaults, so opinion never auto-advanced either.
    // Its BEAT is deliberately untouched; only its ability to fire is restored.
    renderGame("favorite-champion");
    await pick(/Garen/);
    await awaitReveal();

    await waitFor(() => expect(countdownMs()).toBe("2500ms"));
    await new Promise((r) => setTimeout(r, 1600));
    expect(revealed()).toBe(true);
    await waitFor(() => expect(revealed()).toBe(false), { timeout: 3500 });
  });
});
