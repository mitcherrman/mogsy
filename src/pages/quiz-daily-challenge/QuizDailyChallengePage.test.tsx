/**
 * DC1 Phase 5 — the arena, through the DOM.
 *
 * Every test drives the REAL page against a stubbed `fetch`, so the transport
 * contract, the parsers, the controller and the components are all exercised
 * together. What is stubbed is the network and nothing else: a payload shaped
 * differently from the backend's would fail at the boundary here exactly as it
 * would in a browser.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
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
    await screen.findByTestId("dc-arena");

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
    await screen.findByTestId("dc-arena");

    expect(screen.getByTestId("dc-card-stage")).toHaveAttribute("data-sequence", "3");
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
    expect(screen.queryByTestId("dc-arena")).not.toBeInTheDocument();
  });
});

// ── standard card ──────────────────────────────────────────────────────────

describe("standard cards", () => {
  const openRun = rawRun({ cards: [{ sequence: 1 }], cardCount: 12 });

  it("a first correct answer scores, and HOLDS on the reveal until the player moves on", async () => {
    // The backend advances past a card in the same transaction that resolves
    // it, so the run already describes card 2 when this lands. The stage stays
    // on card 1 so its explanation is actually read.
    const resolved = rawRun({
      cards: [{ sequence: 1, resolved: true, firstAttemptCorrect: true, correctIndex: 0,
        awardedScore: 100, attemptCount: 1 }, { sequence: 2 }],
      currentSequence: 2, resolvedCount: 1, score: 100,
    });
    routes = [onToday(rawToday()), onStart(openRun),
      onAnswer(rawAnswer({ score_delta: 100 }, resolved))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    fireEvent.click(await screen.findByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(screen.getByTestId("dc-player-score")).toHaveTextContent("100"));
    const stage = screen.getByTestId("dc-card-stage");
    expect(stage).toHaveAttribute("data-sequence", "1");
    expect(stage).toHaveAttribute("data-card-phase", "resolved");
    expect(screen.getByTestId("dc-reveal")).toHaveAttribute("data-first-try", "true");
    expect(screen.getByTestId("dc-reveal-explanation")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("dc-continue"));
    await waitFor(() => expect(screen.getByTestId("dc-card-stage"))
      .toHaveAttribute("data-sequence", "2"));
    // And the next card is a FRESH prompt, with the previous reveal gone.
    expect(screen.queryByTestId("dc-reveal")).not.toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByTestId("dc-beat"))
      .toHaveAttribute("data-beat-kind", "first_miss"));

    // Struck out, still visible, out of the tab order.
    const struck = screen.getByRole("button", { name: /Option B/, hidden: true });
    expect(struck).toBeDisabled();
    expect(struck).toHaveAttribute("data-choice-state", "eliminated");

    // The card is STILL PLAYABLE and the answer is nowhere on the page.
    expect(screen.getByRole("button", { name: /Option A/ })).toBeEnabled();
    expect(screen.queryByTestId("dc-reveal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dc-reveal-answer")).not.toBeInTheDocument();
    expect(screen.getByTestId("dc-card-stage")).toHaveAttribute("data-card-phase", "learning");
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

    const beat = await screen.findByTestId("dc-beat");
    expect(beat).toHaveTextContent(/missed for score/i);
    expect(beat).toHaveTextContent(/keep solving/i);
    expect(beat).toHaveAttribute("data-beat-scored", "false");
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

    await waitFor(() => expect(screen.getByTestId("dc-beat"))
      .toHaveAttribute("data-beat-kind", "learning_miss"));
    expect(screen.getAllByRole("button", { name: /Option [BC]/, hidden: true })
      .filter((b) => b.getAttribute("data-choice-state") === "eliminated")).toHaveLength(2);
    expect(screen.queryByTestId("dc-reveal-answer")).not.toBeInTheDocument();
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

    const reveal = await screen.findByTestId("dc-reveal");
    expect(reveal).toHaveAttribute("data-first-try", "false");
    expect(reveal).toHaveTextContent(/learned/i);
    // No score was recovered, and the reveal does not pretend otherwise.
    expect(screen.getByTestId("dc-player-score")).toHaveTextContent("0");
  });
});

// ── Meta Reflex ────────────────────────────────────────────────────────────

describe("Meta Reflex", () => {
  const readyReflex = rawRun({
    cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2 }],
    currentSequence: 7, cardCount: 12, resolvedCount: 6,
  });

  it("rendering a reflex card does NOT start the timer", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex)];
    renderPage();
    await screen.findByTestId("dc-reflex-gate");

    expect(screen.getByTestId("dc-card-stage"))
      .toHaveAttribute("data-card-phase", "reflex_ready");
    // No countdown, and above all no activate call from merely arriving.
    expect(screen.getByTestId("dc-timer-slot")).toBeEmptyDOMElement();
    expect(calls.some((c) => c.url.includes("/activate"))).toBe(false);
  });

  it("the options are readable but inert before the clock exists", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex)];
    renderPage();
    await screen.findByTestId("dc-reflex-gate");

    const options = screen.getAllByRole("button", { name: /Option [AB]/, hidden: true });
    expect(options).toHaveLength(2);
    options.forEach((o) => expect(o).toBeDisabled());
  });

  it("an explicit START activates and only then shows the server's window", async () => {
    const activated = rawRun({
      cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2, activated: true,
        timerEndsAt: `${DATE}T12:00:06.000000+00:00` }],
      currentSequence: 7, cardCount: 12, resolvedCount: 6,
      serverNow: `${DATE}T12:00:00.000000+00:00`,
    });
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activated)];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-reflex-start"));

    await waitFor(() => expect(screen.getByTestId("dc-card-stage"))
      .toHaveAttribute("data-card-phase", "reflex_timed"));
    expect(calls.filter((c) => c.url.includes("/activate"))).toHaveLength(1);
    expect(screen.getByTestId("dc-timer-slot")).not.toBeEmptyDOMElement();
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
    await screen.findByTestId("dc-arena");

    expect(screen.getByTestId("dc-card-stage"))
      .toHaveAttribute("data-card-phase", "learning");
    expect(screen.getByTestId("dc-timer-slot")).toBeEmptyDOMElement();
    expect(await screen.findByTestId("dc-beat"))
      .toHaveAttribute("data-beat-kind", "reflex_timeout");
    // Untimed retry is open, and the answer is still withheld.
    expect(screen.getByRole("button", { name: /Option A/ })).toBeEnabled();
    expect(screen.queryByTestId("dc-reveal-answer")).not.toBeInTheDocument();
  });

  it("the countdown speaks of a solo window, never a shared round", async () => {
    // Ranked's TimerDisplay defaults to "of M:SS shared round" and, on expiry,
    // "waiting for the round to resolve". Both describe a duel. Reusing the
    // component is right; reusing its copy would put an opponent on screen.
    const activated = rawRun({
      cards: [{ sequence: 7, kind: "meta_reflex", optionCount: 2, activated: true,
        timerEndsAt: `${DATE}T12:00:06.000000+00:00` }],
      currentSequence: 7, cardCount: 12, resolvedCount: 6,
      serverNow: `${DATE}T12:00:00.000000+00:00`,
    });
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex), onActivate(activated)];
    const { container } = renderPage();
    fireEvent.click(await screen.findByTestId("dc-reflex-start"));
    await screen.findByTestId("timer-display");

    const text = container.textContent ?? "";
    expect(text).not.toContain("shared round");
    expect(text).not.toContain("waiting for the round");
    expect(text).toContain("to answer");
  });

  it("never speaks of an opponent, anywhere on the surface", async () => {
    routes = [onToday(rawToday({ run: rawTodayRun({ current_sequence: 7 }) })),
      onRun(readyReflex)];
    const { container } = renderPage();
    await screen.findByTestId("dc-reflex-gate");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const pvp of ["opponent", "vs ", "versus", "rematch", "bot", "faster than",
      "waiting for"]) {
      expect(text).not.toContain(pvp);
    }
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

    await screen.findByTestId("dc-beat");
    expect(screen.getByTestId("dc-score-meter")).toHaveAttribute("data-fill-bp", "0");
    expect(screen.getByTestId("dc-score-meter-value")).toHaveTextContent("0 / 1250");
  });

  it("the left column names the player and their record", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({
      cards: [{ sequence: 1, resolved: true, firstAttemptCorrect: true }, { sequence: 2 }],
      currentSequence: 2, resolvedCount: 1, score: 100,
    }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));

    const panel = await screen.findByTestId("dc-player-panel");
    expect(within(panel).getByText("Mogzy")).toBeInTheDocument();
    expect(within(panel).getByTestId("dc-player-score")).toHaveTextContent("100");
    expect(within(panel).getByTestId("dc-player-record")
      .querySelectorAll("[data-mark]")).toHaveLength(1);
  });
});

// ── the strip ──────────────────────────────────────────────────────────────

describe("the run strip", () => {
  it.each([11, 12, 15])("draws exactly %i nodes", async (cardCount) => {
    routes = [onToday(rawToday({ cardCount })),
      onStart(rawRun({ cards: [{ sequence: 1 }], cardCount }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));

    const strip = await screen.findByTestId("dc-timeline");
    expect(strip).toHaveAttribute("data-node-count", String(cardCount));
    expect(strip.querySelectorAll("li")).toHaveLength(cardCount);
  });

  it("marks the Meta Reflex block distinctly", async () => {
    routes = [onToday(rawToday()), onStart(rawRun({ cards: [{ sequence: 1 }], cardCount: 12 }))];
    renderPage();
    fireEvent.click(await screen.findByTestId("dc-start"));
    await screen.findByTestId("dc-timeline");

    expect(screen.getByTestId("dc-timeline-node-7"))
      .toHaveAttribute("data-kind", "meta_reflex");
    expect(screen.getByTestId("dc-timeline-node-7")).toHaveAttribute("data-block-start", "true");
    expect(screen.getByTestId("dc-timeline-node-1")).toHaveAttribute("data-kind", "quiz");
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

    await waitFor(() => expect(screen.getByTestId("dc-card-stage"))
      .toHaveAttribute("data-sequence", "2"));
    // Corrected quietly. No scary code reaches the player.
    expect(screen.getByTestId("dc-status")).toHaveTextContent("");
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
    await screen.findByTestId("dc-arena");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));

    await waitFor(() => expect(screen.getByTestId("dc-status"))
      .toHaveTextContent(/progress is saved/i));
    // The card is still on screen — nothing was thrown away.
    expect(screen.getByTestId("dc-card-stage")).toHaveAttribute("data-sequence", "1");
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
    await screen.findByTestId("dc-arena");

    expect(screen.queryByTestId("dc-reveal")).not.toBeInTheDocument();
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
    expect(screen.queryByTestId("dc-reveal")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Option C/ }));

    const reveal = await screen.findByTestId("dc-reveal");
    expect(within(reveal).getByTestId("dc-reveal-answer")).toHaveTextContent("Option C");
    expect(within(reveal).getByTestId("dc-reveal-explanation")).toHaveTextContent(/says so/);
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
