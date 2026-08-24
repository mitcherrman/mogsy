/**
 * DC1 Phase 5 / ARENA1 Step 5 — the Daily, through the PRODUCTION arena's DOM.
 *
 * Every test drives the REAL page against a stubbed `fetch`, so the transport
 * contract, the parsers, the controller and the components are all exercised
 * together. What is stubbed is the network and nothing else: a payload shaped
 * differently from the backend's would fail at the boundary here exactly as it
 * would in a browser.
 *
 * WHY THE SELECTORS CHANGED IN STEP 5
 * ───────────────────────────────────
 * They are the ARENA'S now. `dc-card-stage`, `dc-answer-grid`, `dc-timeline`
 * and `dc-player-panel` were four components the Daily owned; the same states
 * are asserted below against `ranked-question`, `answer-grid`,
 * `ranked-round-timeline` and `combatant-daily-player` — the ones Ranked and
 * the Ranked Tutorial are asserted against. That substitution IS the phase: if
 * a Daily-only selector ever comes back, a second renderer came back with it.
 *
 * What did NOT change is a single rule. Every behaviour pinned here — one
 * scored attempt, elimination in place, no disclosure before resolution, the
 * held reveal, the solo copy — is the same assertion it was, made against the
 * canonical surface.
 *
 * WHAT ARENA1 PHASE 2 CHANGED
 * ───────────────────────────
 * The mode's PACING, and only its pacing. The Daily used to ask for a press
 * twice per card — START, to open a Meta Reflex window, and NEXT CARD, to
 * leave a resolved one — and live Ranked asks for neither. The assertions that
 * pinned those two buttons are replaced below by assertions that they do not
 * exist and that the run moves itself: one click, a brief result beat, the next
 * card. Every scoring rule underneath is untouched, and each is re-asserted
 * through the new flow rather than dropped with the control that used to
 * trigger it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { REVEAL_HOLD_LEVEL_UP_MS } from "@/lib/ranked-core/pacing";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuizDailyChallengePage from "./QuizDailyChallengePage";
import {
  DATE,
  RUN_ID,
  rawAnswer,
  rawResult,
  rawRun,
  rawToday,
  rawTodayRun,
} from "./testFixtures";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { user_metadata: { display_name: "Mogzy" } } }),
}));
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
  ensureBackendAuthToken: async () => "test-token",
}));

type Raw = Record<string, unknown>;

interface Route { match: (url: string, method: string) => boolean; body: Raw | (() => Raw); status?: number }

let routes: Route[] = [];
const calls: { url: string; method: string; body: unknown }[] = [];

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const route = routes.find((r) => r.match(url, method));
    if (!route) {
      return new Response(JSON.stringify({ detail: { code: "RUN_NOT_FOUND", message: "no" } }),
        { status: 404, headers: { "Content-Type": "application/json" } });
    }
    const body = typeof route.body === "function" ? route.body() : route.body;
    return new Response(JSON.stringify(body),
      { status: route.status ?? 200, headers: { "Content-Type": "application/json" } });
  }));
}

const onToday = (body: Raw | (() => Raw)): Route =>
  ({ match: (u, m) => u.includes("/today") && m === "GET", body });
const onStart = (body: Raw | (() => Raw)): Route =>
  ({ match: (u, m) => u.endsWith("/runs") && m === "POST", body });
const onRun = (body: Raw | (() => Raw)): Route =>
  ({ match: (u, m) => u.includes(`/runs/${RUN_ID}`) && m === "GET", body });
const onActivate = (body: Raw | (() => Raw)): Route =>
  ({ match: (u, m) => u.includes("/activate") && m === "POST", body });
const onAnswer = (body: Raw | (() => Raw), status = 200): Route =>
  ({ match: (u, m) => u.includes("/answers") && m === "POST", body, status });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/quiz/daily-challenge"]}>
      <QuizDailyChallengePage />
    </MemoryRouter>,
  );
}

/**
 * WHICH CARD THE ARENA IS SHOWING.
 *
 * From the header the arena draws, which is the only place the mode states it
 * now — and the right place: it is the same strip that says "Round 3" in
 * Ranked. The bespoke stage's `data-sequence` was an attribute on a component
 * that no longer exists.
 */
const showingCard = (n: number) =>
  expect(screen.getByTestId("ranked-header")).toHaveTextContent(`Card ${n} of`);

/** The arena's ONE reserved status line — where every Daily beat lands. */
const status = () => screen.getByTestId("submission-status");

/** The canonical answer surface's post-resolution box, or null. */
const feedback = (): HTMLElement | null =>
  document.querySelector("[data-quiz-answer-feedback]");

/** Is a clock on screen at all? The arena mounts one only when a window is open. */
const timerShown = () => screen.queryByTestId("timer-display") !== null;

/**
 * The result beat, generously. `REVEAL_HOLD_LEVEL_UP_MS` is the longer of the
 * arena's two, so waiting past it covers both; the margin is for a loaded CI
 * box, exactly as Ranked's own reveal-beat suite does it.
 */
const BEAT_TIMEOUT = REVEAL_HOLD_LEVEL_UP_MS + 2000;

/**
 * Every control the Daily must NOT offer, asserted as one sentence.
 *
 * Written against accessible names rather than test ids on purpose: a test id
 * ban only catches the button coming back with its old id, and the thing being
 * prevented is the INTERACTION, whatever it is called next time.
 */
const noManualProgressionControls = () => {
  for (const name of [/next card/i, /continue/i, /confirm/i, /lock in/i,
    /start card/i, /see results/i]) {
    expect(screen.queryByRole("button", { name }),
      `a manual progression control (${name}) is back on the Daily`).toBeNull();
  }
};

beforeEach(() => {
  routes = [];
  calls.length = 0;
  stubFetch();
});

// ── entry ──────────────────────────────────────────────────────────────────

describe("entry", () => {
  it("offers to begin when today has no run yet", async () => {
    routes = [onToday(rawToday())];
    renderPage();
    expect(await screen.findByTestId("dc-entry")).toBeInTheDocument();
    expect(screen.getByTestId("dc-start")).toBeEnabled();
    // The scoring rule is stated BEFORE the first card, not discovered on a miss.
    expect(screen.getByText(/only your first answer/i)).toBeInTheDocument();
  });

  it("starting posts an empty body — the server owns everything else", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({ cards: [{ sequence: 1 }] }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    await screen.findByTestId("ranked-match");

    const post = calls.find((c) => c.url.endsWith("/runs") && c.method === "POST");
    expect(post?.body).toBeNull();
  });

  it("RESUMES an existing run by reading it, never by re-creating it", async () => {
    routes = [
      onToday(rawToday({ run: rawTodayRun({ current_sequence: 3, resolved_count: 2 }) })),
      onRun(rawRun({
        cards: [
          { sequence: 1, resolved: true }, { sequence: 2, resolved: true }, { sequence: 3 },
        ],
        currentSequence: 3, resolvedCount: 2, score: 200,
      })),
    ];
    renderPage();
    await screen.findByTestId("ranked-match");

    showingCard(3);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("a finished day shows its result and offers no replay", async () => {
    routes = [
      onToday(rawToday({ run: rawTodayRun({ status: "completed", resumable: false }) })),
      onRun(rawRun({
        cards: [{ sequence: 1, resolved: true }],
        status: "completed", currentSequence: null, resolvedCount: 12,
        score: 1150, result: rawResult(),
      })),
    ];
    renderPage();
    await screen.findByTestId("dc-result");

    expect(screen.getByTestId("dc-result-grade")).toHaveTextContent("A");
    expect(screen.queryByTestId("dc-start")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ranked-match")).not.toBeInTheDocument();
  });
});

// ── standard card ──────────────────────────────────────────────────────────

describe("standard cards", () => {
  const openRun = rawRun({ cards: [{ sequence: 1 }], cardCount: 12 });

  /** A run whose card 1 resolved first try, already advanced to card 2. */
  const resolvedFirstTry = rawRun({
    cards: [{ sequence: 1, resolved: true, firstAttemptCorrect: true, correctIndex: 0,
      awardedScore: 100, attemptCount: 1 }, { sequence: 2 }],
    currentSequence: 2, resolvedCount: 1, score: 100,
  });

  it("ONE CLICK scores the card — there is nothing to confirm", async () => {
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ score_delta: 100 }, resolvedFirstTry))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    // The click WAS the submission: one POST, and the score moved.
    await waitFor(() =>
      expect(screen.getByTestId("hp-daily-player")).toHaveTextContent("100"));
    expect(calls.filter((c) => c.url.includes("/answers"))).toHaveLength(1);
    noManualProgressionControls();
  });

  it("holds the resolved card for a brief beat, then ADVANCES BY ITSELF", async () => {
    // The backend advances past a card in the same transaction that resolves
    // it, so the run already describes card 2 when this lands. The stage stays
    // on card 1 for the arena's result beat — and then leaves on its own.
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ score_delta: 100 }, resolvedFirstTry))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() =>
      expect(screen.getByTestId("hp-daily-player")).toHaveTextContent("100"));
    // THE BEAT: still card 1, resolved, verdict on screen — and nothing to press.
    showingCard(1);
    expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "revealed");
    expect(feedback()).toHaveAttribute("data-verdict-tone", "positive");
    expect(feedback()).toHaveTextContent("Solved first try");
    noManualProgressionControls();

    // THEN, with no further input, the next card.
    await waitFor(() => showingCard(2), { timeout: BEAT_TIMEOUT });
    expect(feedback()).toBeNull();
    expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "open");
  });

  it("a double click cannot spend a second scored attempt", async () => {
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ score_delta: 100 }, resolvedFirstTry))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    const option = await screen.findByRole("button", { name: /Option A/ });
    fireEvent.click(option);
    fireEvent.click(option);
    fireEvent.click(option);

    await waitFor(() =>
      expect(screen.getByTestId("hp-daily-player")).toHaveTextContent("100"));
    // ONE submission reached the server, for a card that has exactly one
    // scored attempt to spend.
    expect(calls.filter((c) => c.url.includes("/answers"))).toHaveLength(1);
  });

  it("the beat cannot be answered THROUGH — the run has already moved on", async () => {
    // While card 1's result is on screen the run's current card is 2. A click
    // landing here would submit against a question the player cannot see.
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ score_delta: 100 }, resolvedFirstTry))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));
    await waitFor(() =>
      expect(screen.getByTestId("hp-daily-player")).toHaveTextContent("100"));

    for (const tablet of screen.getAllByRole("button", { name: /Option [A-D]/, hidden: true })) {
      expect(tablet).toBeDisabled();
      fireEvent.click(tablet);
    }
    expect(calls.filter((c) => c.url.includes("/answers"))).toHaveLength(1);
  });

  it("a REMOUNT during the beat lands on the run's real card, advancing once", async () => {
    // The hold is presentation state and is deliberately not persisted. A
    // refresh mid-beat is a fresh read of the projection, which already
    // describes card 2 — so the player resumes there, and nothing advances a
    // second time behind them.
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 2, resolved_count: 1 }) })),
      onRun(resolvedFirstTry)];
    renderPage();
    await screen.findByTestId("ranked-match");
    await waitFor(() => showingCard(2));
    expect(feedback()).toBeNull();
    noManualProgressionControls();
  });

  it("a first wrong answer eliminates that option and does NOT reveal the answer", async () => {
    const missed = rawRun({
      cards: [{ sequence: 1, scoreLocked: true, scoreOutcome: "wrong_answer",
        eliminated: [1], attemptCount: 1 }],
      currentSequence: 1, score: 0,
    });
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ correct: false, resolved: false, score_delta: 0,
        eliminated_index: 1 }, missed))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option B/ }));

    await waitFor(() => expect(status()).toHaveTextContent(/missed for score/i));

    // Struck out, still visible, out of the tab order.
    const struck = screen.getByRole("button", { name: /Option B/, hidden: true });
    expect(struck).toBeDisabled();
    expect(struck).toHaveAttribute("data-choice-state", "eliminated");

    // The card is STILL PLAYABLE and the answer is nowhere on the page.
    expect(screen.getByRole("button", { name: /Option A/ })).toBeEnabled();
    expect(feedback()).toBeNull();
    // The grid is OPEN, not revealed: an elimination is not a resolution.
    expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "open");
    // A miss interrupts NOTHING: no result screen, no control to dismiss, and
    // above all no auto-advance — the player is still on this card.
    noManualProgressionControls();
    showingCard(1);
    await new Promise((r) => setTimeout(r, REVEAL_HOLD_LEVEL_UP_MS + 200));
    showingCard(1);
    expect(screen.getByRole("button", { name: /Option A/ })).toBeEnabled();
  });

  it("says the scored chance is spent, and says to keep going", async () => {
    const missed = rawRun({
      cards: [{ sequence: 1, scoreLocked: true, scoreOutcome: "wrong_answer",
        eliminated: [1], attemptCount: 1 }],
      currentSequence: 1,
    });
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ correct: false, resolved: false, score_delta: 0,
        eliminated_index: 1 }, missed))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option B/ }));

    await waitFor(() => expect(status()).toHaveTextContent(/missed for score/i));
    expect(status()).toHaveTextContent(/keep solving/i);
    // A miss is a COST, not a verdict: it is never announced as an error, and
    // the player's own column does not shout at them.
    expect(status()).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("outcome-daily-player")).not.toBeInTheDocument();
  });

  it("a second wrong answer is a QUIETER beat and strikes a second option", async () => {
    const twice = rawRun({
      cards: [{ sequence: 1, scoreLocked: true, scoreOutcome: "wrong_answer",
        eliminated: [1, 2], attemptCount: 2 }],
      currentSequence: 1,
    });
    routes = [onToday(rawToday()),
      onStart(rawRun({ cards: [{ sequence: 1, scoreLocked: true,
        scoreOutcome: "wrong_answer", eliminated: [1], attemptCount: 1 }] })),
      onAnswer(rawAnswer({ phase: "learning", correct: false, resolved: false,
        score_locked_now: false, score_delta: 0, eliminated_index: 2 }, twice))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option C/ }));

    // A QUIETER line: the first miss spent the scored attempt, this one spent
    // nothing, and the copy says so instead of replaying the same warning.
    await waitFor(() => expect(status()).toHaveTextContent(/not that one/i));
    expect(status()).not.toHaveTextContent(/missed for score/i);
    expect(screen.getAllByRole("button", { name: /Option [BC]/, hidden: true })
      .filter((b) => b.getAttribute("data-choice-state") === "eliminated")).toHaveLength(2);
    expect(feedback()).toBeNull();
  });

  it("EVENTUALLY solving auto-advances too, and restores no score", async () => {
    const learned = rawRun({
      cards: [{ sequence: 1, resolved: true, firstAttemptCorrect: false,
        scoreOutcome: "wrong_answer", correctIndex: 0, eliminated: [1],
        attemptCount: 2, awardedScore: 0 }, { sequence: 2 }],
      currentSequence: 2, resolvedCount: 1, score: 0,
    });
    routes = [onToday(rawToday()),
      onStart(rawRun({ cards: [{ sequence: 1, scoreLocked: true,
        scoreOutcome: "wrong_answer", eliminated: [1], attemptCount: 1 }] })),
      onAnswer(rawAnswer({ phase: "learning", correct: true, resolved: true,
        score_locked_now: false, score_delta: 0 }, learned))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(feedback()).not.toBeNull());
    // A learned card gets the SAME treatment a first-try one does: a brief
    // beat and then the next card, with nothing to acknowledge.
    noManualProgressionControls();
    await waitFor(() => showingCard(2), { timeout: BEAT_TIMEOUT });
    // No score was recovered by solving it late, and none was invented by
    // moving on automatically.
    expect(screen.getByTestId("hp-daily-player")).toHaveTextContent("0");
  });

  it("solving after a miss is LEARNED, and visibly not a first-try win", async () => {
    const learned = rawRun({
      cards: [{ sequence: 1, resolved: true, firstAttemptCorrect: false,
        scoreOutcome: "wrong_answer", correctIndex: 0, eliminated: [1],
        attemptCount: 2, awardedScore: 0 }],
      currentSequence: null, resolvedCount: 1, score: 0,
    });
    routes = [onToday(rawToday()),
      onStart(rawRun({ cards: [{ sequence: 1, scoreLocked: true,
        scoreOutcome: "wrong_answer", eliminated: [1], attemptCount: 1 }] })),
      onAnswer(rawAnswer({ phase: "learning", correct: true, resolved: true,
        score_locked_now: false, score_delta: 0 }, learned))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(feedback()).not.toBeNull());
    // NEVER "Incorrect", and never in red: the card IS solved. What it did not
    // do is score, which is exactly what the word says.
    expect(feedback()).toHaveTextContent("Learned");
    expect(feedback()).not.toHaveTextContent("Incorrect");
    expect(feedback()).toHaveAttribute("data-verdict-tone", "neutral");
    // No score was recovered, and nothing on screen pretends otherwise.
    expect(screen.getByTestId("hp-daily-player")).toHaveTextContent("0");
    expect(screen.queryByTestId("outcome-daily-player")).not.toBeInTheDocument();
  });
});

// ── Meta Reflex ────────────────────────────────────────────────────────────

/**
 * META REFLEX — a question sequence, not a mini-game (ARENA1 Phase 2 §8–§10).
 *
 * The backend contract is UNCHANGED and is the reason these tests are about
 * activation at all: a reflex card must be activated before an answer to it is
 * accepted (`META_REFLEX_NOT_ACTIVATED`), and the server stamps the deadline
 * itself. What Phase 2 removed is the BUTTON that used to ask for it. The
 * client now asks on the player's behalf, at the one moment that is honest —
 * when the card is the card on screen — and the window it opens is drawn by the
 * arena's own clock, never hidden.
 */
describe("Meta Reflex", () => {
  const readyReflex = rawRun({
    cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2 }],
    currentSequence: 7, cardCount: 12, resolvedCount: 6,
  });
  const activatedReflex = rawRun({
    cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2, activated: true,
      timerEndsAt: `${DATE}T12:00:06.000000+00:00` }],
    currentSequence: 7, cardCount: 12, resolvedCount: 6,
    serverNow: `${DATE}T12:00:00.000000+00:00`,
  });

  it("opens its own window — there is no Start control", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activatedReflex)];
    renderPage();
    await screen.findByTestId("ranked-match");

    // Reaching the card IS the activation, and the server's deadline is what
    // comes back — the client never invents one.
    await waitFor(() =>
      expect(calls.filter((c) => c.url.includes("/activate"))).toHaveLength(1));
    await waitFor(() => expect(timerShown()).toBe(true));
    noManualProgressionControls();
    expect(screen.queryByTestId("dc-reflex-gate")).not.toBeInTheDocument();
  });

  it("activates ONCE, not on every render of the same card", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activatedReflex)];
    renderPage();
    await waitFor(() => expect(timerShown()).toBe(true));
    // The page ticks its clock four times a second; none of those may re-ask.
    await new Promise((r) => setTimeout(r, 800));
    expect(calls.filter((c) => c.url.includes("/activate"))).toHaveLength(1);
  });

  it("the window is DRAWN, not hidden — the score it can cost is visible", async () => {
    // The owner's direction was to remove the mini-game ceremony, not to hide a
    // live scoring clock. Six seconds that can silently cost the card's points
    // is a hidden scoring surprise; the arena's own header clock is the same
    // instrument a Ranked round uses, and it is what the player gets.
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activatedReflex)];
    renderPage();
    await waitFor(() => expect(timerShown()).toBe(true));
    expect(screen.getByTestId("ranked-header"))
      .toContainElement(screen.getByTestId("timer-display"));
  });

  it("the card is answerable in ONE CLICK the moment the window is open", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activatedReflex)];
    renderPage();
    await waitFor(() => expect(timerShown()).toBe(true));
    expect(screen.getByRole("button", { name: /Option A/ })).toBeEnabled();
    noManualProgressionControls();
  });

  it("one reflex card leads to the next with no press in between", async () => {
    const eight = rawRun({
      cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2, activated: true,
        resolved: true, firstAttemptCorrect: true, correctIndex: 0,
        awardedScore: 100, attemptCount: 1 },
      { sequence: 8, kind: "meta_reflex", optionCount: 2 }],
      currentSequence: 8, cardCount: 12, resolvedCount: 7, score: 100,
    });
    const eightActivated = rawRun({
      cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2, activated: true,
        resolved: true, firstAttemptCorrect: true, correctIndex: 0,
        awardedScore: 100, attemptCount: 1 },
      { sequence: 8, kind: "meta_reflex", optionCount: 2, activated: true,
        timerEndsAt: `${DATE}T12:00:20.000000+00:00` }],
      currentSequence: 8, cardCount: 12, resolvedCount: 7, score: 100,
      serverNow: `${DATE}T12:00:14.000000+00:00`,
    });
    let activations = 0;
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex),
      onActivate(() => { activations += 1; return activations === 1 ? activatedReflex : eightActivated; }),
      onAnswer(rawAnswer({ score_delta: 100 }, eight))];
    renderPage();
    await waitFor(() => expect(timerShown()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));

    await waitFor(() => showingCard(8), { timeout: BEAT_TIMEOUT });
    noManualProgressionControls();
    // And card 8 opened its own window, exactly as card 7 did.
    await waitFor(() => expect(activations).toBe(2));
  });

  it("the NEXT card's clock does not start behind the previous card's beat", async () => {
    // The whole reason the Start button could be removed safely. A six-second
    // window opened while a resolved card is still on screen would be spent
    // before the player ever saw the question.
    const eight = rawRun({
      cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2, activated: true,
        resolved: true, firstAttemptCorrect: true, correctIndex: 0,
        awardedScore: 100, attemptCount: 1 },
      { sequence: 8, kind: "meta_reflex", optionCount: 2 }],
      currentSequence: 8, cardCount: 12, resolvedCount: 7, score: 100,
    });
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activatedReflex),
      onAnswer(rawAnswer({ score_delta: 100 }, eight))];
    renderPage();
    await waitFor(() => expect(timerShown()).toBe(true));
    const beforeAnswer = calls.filter((c) => c.url.includes("/activate")).length;
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));

    // DURING the beat, card 7 is still on screen and card 8 has NOT been
    // activated — the run has advanced but the player has not.
    await waitFor(() =>
      expect(screen.getByTestId("answer-grid"))
        .toHaveAttribute("data-answers-state", "revealed"));
    showingCard(7);
    expect(calls.filter((c) => c.url.includes("/activate"))).toHaveLength(beforeAnswer);
  });

  it("returns to a STANDARD card automatically at the end of the block", async () => {
    const eleven = rawRun({
      cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2, activated: true,
        resolved: true, firstAttemptCorrect: true, correctIndex: 0,
        awardedScore: 100, attemptCount: 1 },
      { sequence: 11 }],
      currentSequence: 11, cardCount: 12, resolvedCount: 11, score: 100,
    });
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activatedReflex),
      onAnswer(rawAnswer({ score_delta: 100 }, eleven))];
    renderPage();
    await waitFor(() => expect(timerShown()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));

    await waitFor(() => showingCard(11), { timeout: BEAT_TIMEOUT });
    // An ordinary card has no window, so the clock is gone — and there is
    // nothing at all to press to have got here.
    await waitFor(() => expect(timerShown()).toBe(false));
    noManualProgressionControls();
    expect(screen.getByRole("button", { name: /Option A/ })).toBeEnabled();
  });

  it("a lapsed window is reported by the SERVER, with no timer and no answer", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(rawRun({
        cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2, activated: true,
          scoreLocked: true, scoreOutcome: "timeout" }],
        currentSequence: 7, cardCount: 12, resolvedCount: 6, timeouts: 1,
      }))];
    renderPage();
    await screen.findByTestId("ranked-match");

    expect(timerShown()).toBe(false);
    await waitFor(() => expect(status()).toHaveTextContent(/window closed/i));
    // Untimed retry is open, the answer is still withheld — and an already
    // locked card is NOT re-activated, because it is no longer a ready one.
    expect(screen.getByRole("button", { name: /Option A/ })).toBeEnabled();
    expect(feedback()).toBeNull();
    expect(calls.some((c) => c.url.includes("/activate"))).toBe(false);
  });

  it("the countdown speaks of a solo window, never a shared round", async () => {
    // Ranked's TimerDisplay defaults to "of M:SS shared round" and, on expiry,
    // "waiting for the round to resolve". Both describe a duel. Reusing the
    // component is right; reusing its copy would put an opponent on screen.
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activatedReflex)];
    const { container } = renderPage();
    await screen.findByTestId("timer-display");

    const text = container.textContent ?? "";
    expect(text).not.toContain("shared round");
    expect(text).not.toContain("waiting for the round");
    expect(text).toContain("to answer");
  });

  it("never speaks of an opponent, anywhere on the surface", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activatedReflex)];
    const { container } = renderPage();
    await waitFor(() => expect(timerShown()).toBe(true));

    const text = container.textContent?.toLowerCase() ?? "";
    for (const pvp of ["opponent", "vs ", "versus", "rematch", "bot", "faster than",
      "waiting for"]) {
      expect(text).not.toContain(pvp);
    }
  });
});

/**
 * THE EXPLANATION POLICY, THROUGH THE PAGE (ARENA1 Phase 2 §6).
 *
 * The unit rules live in `explanationPolicy.test.ts`; what is pinned here is
 * that the decision actually reaches the rendered surface in both directions —
 * a mode that computed the right answer and then passed the string through
 * anyway would pass every unit test and change nothing a player sees.
 */
describe("explanations", () => {
  const openRun = rawRun({ cards: [{ sequence: 1 }], cardCount: 12 });
  const resolvedWith = (explanation: string) => rawRun({
    cards: [{ sequence: 1, resolved: true, firstAttemptCorrect: true, correctIndex: 0,
      awardedScore: 100, attemptCount: 1, explanation,
      prompt: "How much Ability Haste does Hubris give?" }, { sequence: 2 }],
    currentSequence: 2, resolvedCount: 1, score: 100,
  });

  it("omits one that only restates the question and the revealed answer", async () => {
    // The example from the phase brief. "Option A" is the revealed answer, so
    // this sentence tells a player looking at the marked tablet nothing.
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ score_delta: 100 },
        resolvedWith("Hubris gives Option A Ability Haste.")))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(feedback()).not.toBeNull());
    // The verdict beat still plays — it is the result, not filler.
    expect(feedback()).toHaveTextContent("Solved first try");
    expect(feedback()).not.toHaveTextContent(/Ability Haste/);
  });

  it("keeps one that shows a mechanic the player could not otherwise see", async () => {
    const worked = "Hubris gives 15 Ability Haste, so a 60s ultimate becomes "
      + "60 × 100 / (100 + 15) = 52.2 seconds.";
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ score_delta: 100 }, resolvedWith(worked)))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(feedback()).not.toBeNull());
    // VERBATIM. The mode filters; it never rewrites, shortens or softens.
    expect(feedback()).toHaveTextContent(worked);
  });

  it("still advances by itself when an explanation is on screen", async () => {
    const worked = "Hubris gives 15 Ability Haste, so a 60s ultimate becomes "
      + "60 × 100 / (100 + 15) = 52.2 seconds.";
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ score_delta: 100 }, resolvedWith(worked)))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(feedback()).not.toBeNull());
    noManualProgressionControls();
    await waitFor(() => showingCard(2), { timeout: BEAT_TIMEOUT });
  });
});

// ── the two columns ────────────────────────────────────────────────────────

describe("the arena columns", () => {
  it("the right column is the DAY, not a player", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({ cards: [{ sequence: 1 }], cardCount: 12 }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));

    const panel = await screen.findByTestId("dc-challenge-panel");
    expect(within(panel).getByText(/today's challenge/i)).toBeInTheDocument();
    expect(within(panel).getByText(DATE)).toBeInTheDocument();
    expect(within(panel).getByTestId("dc-cards-meter-value")).toHaveTextContent("0 / 12");
    expect(within(panel).getByTestId("dc-challenge-status")).toHaveTextContent("12 cards left");
  });

  it("a miss takes no ground; only first attempts move the score meter", async () => {
    const missed = rawRun({
      cards: [{ sequence: 1, scoreLocked: true, scoreOutcome: "wrong_answer",
        eliminated: [1], attemptCount: 1 }],
      currentSequence: 1, cardCount: 12, score: 0,
    });
    routes = [onToday(rawToday()),
      onStart(rawRun({ cards: [{ sequence: 1 }], cardCount: 12 })),
      onAnswer(rawAnswer({ correct: false, resolved: false, score_delta: 0,
        eliminated_index: 1 }, missed))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option B/ }));

    await waitFor(() => expect(status()).toHaveTextContent(/missed for score/i));
    expect(screen.getByTestId("dc-score-meter")).toHaveAttribute("data-fill-bp", "0");
    expect(screen.getByTestId("dc-score-meter-value")).toHaveTextContent("0 / 1250");
  });

  it("the left column is the CANONICAL duelist column, showing this player", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({
      cards: [{ sequence: 1, resolved: true, firstAttemptCorrect: true, awardedScore: 100 },
        { sequence: 2 }],
      currentSequence: 2, resolvedCount: 1, score: 100,
    }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));

    const panel = await screen.findByTestId("combatant-daily-player");
    expect(within(panel).getByText("Mogzy")).toBeInTheDocument();
    // The primary meter is the SCORE, and it is labelled what it is rather
    // than being passed off as health in a mode with no combat.
    expect(within(panel).getByTestId("hp-daily-player")).toHaveTextContent("100");
    expect(within(panel).getByText("Score")).toBeInTheDocument();
    expect(within(panel).queryByText("HP")).not.toBeInTheDocument();
    // The record is the canonical recent-round ledger, one row per settled card.
    expect(within(panel).getByTestId("ledger-row-daily-player-1"))
      .toHaveAttribute("data-outcome", "correct");
    // A Daily has no level or XP layer, so neither is drawn — not even empty.
    expect(panel).toHaveAttribute("data-progression", "false");
    expect(within(panel).queryByTestId("xp-daily-player")).not.toBeInTheDocument();
  });

  it("puts NO combatant in the right column — it is the day", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({ cards: [{ sequence: 1 }], cardCount: 12 }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    await screen.findByTestId("ranked-match");

    // Exactly one combatant column exists on the whole arena.
    expect(document.querySelectorAll("[data-testid^=\"combatant-\"]")).toHaveLength(1);
    expect(screen.queryByTestId("ranked-abilities")).not.toBeInTheDocument();
  });
});

// ── the strip ──────────────────────────────────────────────────────────────

describe("the run strip", () => {
  it.each([11, 12, 15])("draws exactly %i nodes", async (cardCount) => {
    routes = [onToday(rawToday({ cardCount })),
      onStart(rawRun({ cards: [{ sequence: 1 }], cardCount }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));

    const strip = await screen.findByTestId("ranked-round-timeline");
    // The finite plan IS the strip: one node per card, all of them visible,
    // and nothing sketched past the last one.
    expect(strip).toHaveAttribute("data-visible-nodes", String(cardCount));
    expect(strip.querySelectorAll("li")).toHaveLength(cardCount);
    expect(screen.queryByTestId(`timeline-node-${cardCount + 1}`)).toBeNull();
  });

  it("marks the Meta Reflex block distinctly", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({ cards: [{ sequence: 1 }], cardCount: 12 }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    await screen.findByTestId("ranked-round-timeline");

    // The canonical Meta Reflex mark, on the block the SERVER's frozen plan
    // names — the same glyph Ranked's own block gets.
    expect(screen.getByTestId("timeline-node-7"))
      .toHaveAttribute("data-segment", "meta-reflex");
    expect(screen.getByTestId("timeline-node-1")).toHaveAttribute("data-segment", "standard");
    const reflex = [7, 8, 9, 10, 11].map((n) =>
      screen.getByTestId(`timeline-node-${n}`).getAttribute("data-segment"));
    expect(reflex).toEqual(Array(5).fill("meta-reflex"));
    // Exactly ONE block, and nothing outside it claims to be one.
    expect(document.querySelectorAll('[data-segment="meta-reflex"]')).toHaveLength(5);
  });
});

// ── recovery ───────────────────────────────────────────────────────────────

describe("recovery", () => {
  it("a stale-card refusal refetches instead of showing an error", async () => {
    const moved = rawRun({
      cards: [{ sequence: 1, resolved: true }, { sequence: 2 }],
      currentSequence: 2, resolvedCount: 1, score: 100,
    });
    routes = [onToday(rawToday()),
      onStart(rawRun({ cards: [{ sequence: 1 }] })),
      onAnswer({ detail: { code: "CARD_NOT_CURRENT", message: "not current" } }, 409),
      onRun(moved)];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() => showingCard(2));
    // Corrected quietly: the board is simply right, the next card is open, and
    // no backend code reaches the player.
    expect(status()).toHaveTextContent("Choose an answer to lock it in.");
    expect(status()).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("an already-eliminated option refetches rather than erroring", async () => {
    routes = [onToday(rawToday()),
      onStart(rawRun({ cards: [{ sequence: 1 }] })),
      onAnswer({ detail: { code: "OPTION_ELIMINATED", message: "gone" } }, 409),
      onRun(rawRun({ cards: [{ sequence: 1, scoreLocked: true,
        scoreOutcome: "wrong_answer", eliminated: [0], attemptCount: 1 }] }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(
      screen.getByRole("button", { name: /Option A/, hidden: true }),
    ).toHaveAttribute("data-choice-state", "eliminated"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a network failure keeps the board and says progress is safe", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({ cards: [{ sequence: 1 }] }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    await screen.findByTestId("ranked-match");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(screen.getByTestId("submission-status"))
      .toHaveTextContent(/progress is saved/i));
    // The card is still on screen — nothing was thrown away.
    showingCard(1);
  });

  it("a completed run reached mid-answer goes to the result", async () => {
    routes = [onToday(rawToday()),
      onStart(rawRun({ cards: [{ sequence: 1 }] })),
      onAnswer({ detail: { code: "RUN_COMPLETE", message: "done" } }, 409),
      onRun(rawRun({
        cards: [{ sequence: 1, resolved: true }], status: "completed",
        currentSequence: null, resolvedCount: 12, score: 1150, result: rawResult(),
      }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    expect(await screen.findByTestId("dc-result")).toBeInTheDocument();
  });
});

// ── disclosure ─────────────────────────────────────────────────────────────

describe("disclosure", () => {
  it("an unresolved card renders no answer, no explanation, no raw payload", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({
      cards: [{ sequence: 1, scoreLocked: true, scoreOutcome: "wrong_answer",
        eliminated: [1], attemptCount: 1 }],
    }))];
    const { container } = renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    await screen.findByTestId("ranked-match");

    expect(feedback()).toBeNull();
    const html = container.innerHTML;
    for (const leak of ["correct_index", "correctIndex", "explanation", "score_lock",
      "module_payload", "question_key"]) {
      expect(html).not.toContain(leak);
    }
  });

  it("the answer appears only once the card is resolved", async () => {
    // Reached the only way it is reachable in play: by answering. Before the
    // submission the page holds an unresolved card, which carries no answer
    // field at all.
    const resolved = rawRun({
      cards: [{ sequence: 1, resolved: true, correctIndex: 2, firstAttemptCorrect: true,
        awardedScore: 100, attemptCount: 1 }, { sequence: 2 }],
      currentSequence: 2, resolvedCount: 1, score: 100,
    });
    routes = [onToday(rawToday()),
      onStart(rawRun({ cards: [{ sequence: 1 }] })),
      onAnswer(rawAnswer({ score_delta: 100 }, resolved))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    expect(feedback()).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: /Option C/ }));

    // The canonical tablets resolve, through the canonical reveal gate.
    await waitFor(() => expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-answers-state", "revealed"));
    expect(document.querySelector('[data-quiz-choice="2"]'))
      .toHaveAttribute("data-choice-state", "correct");
    expect(feedback()).toHaveTextContent(/says so/);
  });
});

// ── result ─────────────────────────────────────────────────────────────────

describe("the result", () => {
  const completed = rawRun({
    cards: [{ sequence: 1, resolved: true }],
    status: "completed", currentSequence: null, resolvedCount: 12,
    score: 1150, maxScore: 1250, firstAttemptCorrect: 11, firstAttemptMiss: 1,
    reflexCorrect: 5, reflexTotal: 5, perfectReflexBlocks: 1, timeouts: 0,
    result: rawResult(),
  });

  it("leads with the grade and the day's real performance", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ status: "completed" }) })), onRun(completed)];
    renderPage();
    await screen.findByTestId("dc-result");

    expect(screen.getByTestId("dc-result-grade")).toHaveTextContent("A");
    expect(screen.getByTestId("dc-result-score")).toHaveTextContent("1150 / 1250");
    expect(screen.getByTestId("dc-result-percent")).toHaveTextContent("92%");
    expect(screen.getByTestId("dc-result-first-try")).toHaveTextContent("11/12");
    expect(screen.getByTestId("dc-result-reflex")).toHaveTextContent("5/5");
    expect(screen.getByTestId("dc-result-perfect-reflex")).toBeInTheDocument();
  });

  it("shows the XP breakdown and the streak", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ status: "completed" }) })), onRun(completed)];
    renderPage();
    await screen.findByTestId("dc-result");

    expect(screen.getByTestId("dc-result-xp-answers")).toHaveTextContent("150");
    expect(screen.getByTestId("dc-result-xp-bonus")).toHaveTextContent("50");
    expect(screen.getByTestId("dc-result-xp-total")).toHaveTextContent("200");
    expect(screen.getByTestId("dc-result-streak")).toHaveTextContent("3 days");
  });

  it("does not tell the player they eventually got everything right", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ status: "completed" }) })), onRun(completed)];
    const { container } = renderPage();
    await screen.findByTestId("dc-result");

    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("all correct");
    expect(text).not.toContain("perfect run");
    expect(text).toContain("first try");
  });

  it("reports a completed-but-unpaid run honestly rather than as a zero", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ status: "completed" }) })),
      onRun(rawRun({
        cards: [{ sequence: 1, resolved: true }], status: "completed",
        currentSequence: null, resolvedCount: 12, score: 1150, result: null,
      }))];
    renderPage();

    expect(await screen.findByTestId("dc-finalising")).toBeInTheDocument();
    expect(screen.queryByTestId("dc-result-grade")).not.toBeInTheDocument();
  });
});
