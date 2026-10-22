/**
 * PT1.7A — the bounded Free remediation loop.
 *
 * "Practise the ones you missed" replays the questions from the run that just
 * ended, from the answers already in memory. What these tests fence is the
 * BOUNDARY as much as the feature:
 *
 *   FREE, HERE          the questions from THIS session, offered once, on the
 *                       screen that already lists them. No endpoint, no bank.
 *   PREMIUM, ELSEWHERE  `GET /api/quiz/missed-questions` — every wrong answer
 *                       you have ever given, across sessions, on demand. Its
 *                       gate is untouched, and this loop must never call it.
 *
 * It must also not mutate ownership: OWNED is Ranked's
 * `ranked_question_discoveries` ledger and Practice has never written to it.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const NativeRequest = globalThis.Request;
class RouterTestRequest {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | null;
  readonly headers: Headers;
  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input);
    this.method = init.method ?? "GET";
    this.signal = init.signal ?? null;
    this.headers = new Headers(init.headers);
  }
}

beforeAll(() => {
  globalThis.Request = RouterTestRequest as unknown as typeof Request;
});
afterAll(() => {
  globalThis.Request = NativeRequest;
});

const sfx = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfx }));

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/ads/AdSlot", () => ({ default: () => null }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", is_anonymous: false } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInAnonymously: vi.fn() },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
        then: (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: [] }),
      }),
    }),
  },
}));
vi.mock("@/lib/quiz/onboarding-gate", () => ({
  hasVisitedHub: () => true,
  incrementAnonymousActions: () => 0,
  getAnonymousActionCount: () => 0,
  hasSoftNudgeBeenSeen: () => true,
  markSoftNudgeSeen: () => {},
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: async () => "test-token",
  getExistingBackendAuthToken: async () => "test-token",
}));

/**
 * PM2 — the reveal advances by itself after a hold of seconds. These page
 * tests do not wait out real time: the timer hook is replaced by one that
 * records what the arena asked for, and `advanceReveal()` plays the timer's
 * part — firing the page's own advance for the reveal on stage. The timer
 * itself is fenced in `PracticeArena.pm2.test.tsx`.
 */
type AutoAdvanceArgs = { revealKey: string | null; holdMs: number | null; paused: boolean; onAdvance: () => void };
const autoAdvance = vi.hoisted(() => ({ latest: null as AutoAdvanceArgs | null }));
vi.mock("@/components/quiz/practice-arena/usePracticeAutoAdvance", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/quiz/practice-arena/usePracticeAutoAdvance")>();
  return {
    ...real,
    usePracticeAutoAdvance: (args: AutoAdvanceArgs) => { autoAdvance.latest = args; },
  };
});

const SETS = [
  { id: 3, name: "Champion Basics", description: "Kits", question_count: 522 },
];

const QUESTIONS = [
  {
    id: 11,
    category: "Champion Base Stats",
    question_text: "Which champion has the highest base health at level 1?",
    format: "multiple_choice",
    choices: ["Alpha", "Beta"],
    difficulty: 2,
  },
  {
    id: 12,
    category: "Champion Resources",
    question_text: "Which champion is manaless?",
    format: "multiple_choice",
    choices: ["Gamma", "Delta"],
    difficulty: 2,
  },
];

const questionsMock = vi.fn(async () => ({ questions: QUESTIONS }));
const startSessionMock = vi.fn(async (_payload: { mode?: string; category?: string }) => ({
  ok: true,
  session_id: 7,
}));
const submitAnswerMock = vi.fn(async (payload: { question_id: number }) =>
  // Question 11 is answered WRONG, question 12 right.
  payload.question_id === 11
    ? { is_correct: false, correct_answer: "Beta", explanation: "Beta has more." }
    : { is_correct: true, correct_answer: "Gamma", explanation: "Gamma is manaless." },
);
const missedQuestionsMock = vi.fn(async () => ({ ok: true, results: [] }));

vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: () => questionsMock(),
    categoryQuestions: async () => ({ questions: [] }),
    getProgress: async () => ({ rank_name: "Bronze", attempts: 2, accuracy: 50 }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    // An empty record, so History's one empty-state action is on the page:
    // HUB7 took the Practice Packs off the hub, and that action is the
    // lobby's remaining in-place door into a set-based Practice session.
    getHistory: async () => ({
      ok: true, is_pro: false, total_count: 0, limited: false, free_limit: 10,
      upsell_message: null, results: [],
    }),
    getMissedQuestions: () => missedQuestionsMock(),
    startSession: (payload: { mode?: string; category?: string }) => startSessionMock(payload),
    completeSession: async () => ({}),
    submitAnswer: (payload: { question_id: number }) => submitAnswerMock(payload),
  },
  categoryLabel: (s: { category?: string; category_name?: string }) =>
    s.category_name || s.category || "Uncategorized",
  resolveQuizAssetUrl: (p?: string) => p,
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

import QuizPage from "./Quiz";
import {
  ReportableQuestionProvider,
  useReportableQuestion,
} from "@/lib/feedback/reportable-question";
import type { ReportableQuestionSnapshot } from "@/lib/feedback/report-context";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}{location.search}{location.hash}</div>;
}

function mountDataRouter(initialEntries = ["/origin", "/quiz"], initialIndex = 1) {
  const router = createMemoryRouter([
    { path: "/quiz", element: <QuizPage /> },
    { path: "*", element: <LocationProbe /> },
  ], { initialEntries, initialIndex });
  render(<RouterProvider router={router} />);
  return router;
}

async function startActiveDataPractice() {
  const router = mountDataRouter();
  await waitFor(() => expect(screen.getByTestId("leaguecraft-workspace")).toBeTruthy());
  await startSetPractice();
  await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());
  return router;
}

/** Start the catalog-wide set through History's empty-record action. */
async function startSetPractice() {
  const empty = await screen.findByTestId("study-history-empty");
  fireEvent.click(within(empty).getByRole("button", { name: /Start practising/ }));
}

/** Wait for a graded reveal with a pending auto-advance, then let it fire. */
async function advanceReveal() {
  await waitFor(() => expect(autoAdvance.latest?.revealKey ?? null).not.toBeNull());
  act(() => { autoAdvance.latest!.onAdvance(); });
}

/** Start a pack, answer both questions, and land on the results screen. */
async function playASessionWithOneMiss() {
  render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId("leaguecraft-workspace")).toBeTruthy());

  await startSetPractice();
  await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
  await advanceReveal();

  await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
  await advanceReveal();

  await waitFor(() => expect(screen.getByText("Quiz Complete")).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear?.();
  autoAdvance.latest = null;
});
afterEach(cleanup);

describe("Practice — remediating the run you just played", () => {
  it("sounds start, answer lock/result, and completion once at their owning actions", async () => {
    await playASessionWithOneMiss();
    expect(sfx.play.mock.calls).toEqual([
      ["leaguecraft.quiz.start"],
      ["leaguecraft.answer.lock", { eventId: expect.stringMatching(/:0:11:lock$/) }],
      ["leaguecraft.answer.incorrect", { eventId: expect.stringMatching(/:0:11:result$/) }],
      ["leaguecraft.answer.lock", { eventId: expect.stringMatching(/:1:12:lock$/) }],
      ["leaguecraft.answer.correct", { eventId: expect.stringMatching(/:1:12:result$/) }],
      ["leaguecraft.quiz.complete", { eventId: expect.stringMatching(/:complete$/) }],
    ]);
  });

  it("sounds answer lock but no result when grading has no server authority", async () => {
    submitAnswerMock.mockRejectedValueOnce(new Error("offline"));
    render(
      <MemoryRouter initialEntries={["/quiz"]}>
        <QuizPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("leaguecraft-workspace")).toBeTruthy());
    await startSetPractice();
    await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await waitFor(() => expect(screen.getByText("Answer not verified")).toBeTruthy());

    expect(sfx.play.mock.calls.filter(([event]) => event === "leaguecraft.answer.lock")).toHaveLength(1);
    expect(sfx.play).not.toHaveBeenCalledWith("leaguecraft.answer.correct", expect.anything());
    expect(sfx.play).not.toHaveBeenCalledWith("leaguecraft.answer.incorrect", expect.anything());
  });

  it("offers the misses from this session, counted", async () => {
    await playASessionWithOneMiss();
    const cta = screen.getByTestId("practice-missed-cta");
    expect(cta.textContent).toContain("1");
    expect(cta.textContent).toMatch(/missed/i);
  });

  it("replays ONLY the missed questions, and asks the server for nothing", async () => {
    await playASessionWithOneMiss();
    questionsMock.mockClear();

    fireEvent.click(screen.getByTestId("practice-missed-cta"));

    // Back in the runner, on the question that was wrong…
    await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());
    // …and only that one: it is the last question, so the first answer ends
    // the run rather than advancing to the one that was already correct.
    expect(screen.queryByText(QUESTIONS[1].question_text)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    await advanceReveal();
    await waitFor(() => expect(screen.getByText("Quiz Complete")).toBeTruthy());

    // No refetch: the replay is served from the answers already in memory.
    expect(questionsMock).not.toHaveBeenCalled();
  });

  it("never touches the Premium missed bank", async () => {
    await playASessionWithOneMiss();
    fireEvent.click(screen.getByTestId("practice-missed-cta"));
    await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());
    expect(missedQuestionsMock).not.toHaveBeenCalled();
  });

  it("records the replay as its own study session, named for what it is", async () => {
    await playASessionWithOneMiss();
    startSessionMock.mockClear();
    fireEvent.click(screen.getByTestId("practice-missed-cta"));
    await waitFor(() => expect(startSessionMock).toHaveBeenCalled());
    expect(startSessionMock.mock.calls[0][0]).toMatchObject({ mode: "practice_missed" });
  });

  it("grades the replay through the ordinary attempt path — no local grading", async () => {
    // The replay must not carry the revealed answer forward and score itself:
    // it posts to the same endpoint any other Practice answer does.
    await playASessionWithOneMiss();
    submitAnswerMock.mockClear();
    fireEvent.click(screen.getByTestId("practice-missed-cta"));
    await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());
    // The correct answer is not sitting in the DOM before it is answered.
    expect(screen.queryByText("Beta has more.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    await waitFor(() => expect(submitAnswerMock).toHaveBeenCalledTimes(1));
    expect(submitAnswerMock.mock.calls[0][0]).toMatchObject({ question_id: 11 });
  });

  it("offers nothing to remediate after a clean run", async () => {
    submitAnswerMock.mockImplementation(async () => ({
      is_correct: true,
      correct_answer: "Alpha",
      explanation: "",
    }));
    await playASessionWithOneMiss();
    expect(screen.queryByTestId("practice-missed-cta")).toBeNull();
    expect(screen.getByRole("button", { name: /Play again/ })).toBeTruthy();
  });
});

describe("Practice — NAV1-P1 exit safety", () => {
  it("keeps the exact POP on Stay, then proceeds it on Leave without resurrecting the run", async () => {
    const router = await startActiveDataPractice();

    await act(() => router.navigate(-1));
    expect(await screen.findAllByRole("alertdialog", { name: "Leave practice?" })).toHaveLength(1);
    expect(router.state.location.pathname).toBe("/quiz");
    expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stay in Practice" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/quiz");

    await act(() => router.navigate(-1));
    fireEvent.click(await screen.findByRole("button", { name: "Leave Practice" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/origin"));
    expect(router.state.historyAction).toBe("POP");

    await act(() => router.navigate(1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz"));
    expect(screen.queryByText(QUESTIONS[0].question_text)).toBeNull();
    expect(await screen.findByTestId("leaguecraft-workspace")).toBeTruthy();
  });

  it("guards header and same-route hash/search departures, but not terminal result", async () => {
    const router = await startActiveDataPractice();
    // PM2: the way back is in Practice's one header row, at every width.
    const backLinks = screen.getAllByRole("link", { name: "Back to League hub" });
    expect(backLinks).toHaveLength(1);
    expect(backLinks.every((l) => l.getAttribute("href") === "/lol")).toBe(true);
    fireEvent.click(backLinks[0]);
    expect(await screen.findAllByRole("alertdialog", { name: "Leave practice?" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Stay in Practice" }));

    await act(() => router.navigate("/quiz?play=1#history"));
    expect(await screen.findByRole("alertdialog", { name: "Leave practice?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay in Practice" }));
    expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe("/quiz");
  });

  it("installs beforeunload only for an unfinished run", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    await startActiveDataPractice();
    expect(add.mock.calls.some(([name]) => name === "beforeunload")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await advanceReveal();
    fireEvent.click(await screen.findByRole("button", { name: /Gamma/ }));
    await advanceReveal();
    await screen.findByText("Quiz Complete");
    expect(remove.mock.calls.some(([name]) => name === "beforeunload")).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });

  it("resets terminal result and enters HUB4 Review through SPA navigation", async () => {
    submitAnswerMock.mockImplementation(async (payload: { question_id: number }) => ({
      is_correct: true,
      correct_answer: payload.question_id === 11 ? "Alpha" : "Gamma",
      explanation: "Correct.",
    }));
    const router = await startActiveDataPractice();
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await advanceReveal();
    fireEvent.click(await screen.findByRole("button", { name: /Gamma/ }));
    await advanceReveal();
    await screen.findByText("Quiz Complete");

    fireEvent.click(screen.getByRole("button", { name: "Review your questions" }));
    await waitFor(() => expect(router.state.location.pathname + router.state.location.hash).toBe("/quiz#history"));
    expect(screen.queryByText("Quiz Complete")).toBeNull();
    expect(await screen.findByText("Owned & Missed")).toBeTruthy();
    expect(screen.queryByRole("alertdialog", { name: "Leave practice?" })).toBeNull();
  });

  it("PM1: runs in the canonical arena and keeps Practice's own report identity", async () => {
    submitAnswerMock.mockImplementation(async (payload: { question_id: number }) =>
      payload.question_id === 11
        ? { is_correct: false, correct_answer: "Beta", explanation: "Beta has more." }
        : { is_correct: true, correct_answer: "Gamma", explanation: "Gamma is manaless." });
    let snapshot: ReportableQuestionSnapshot | null = null;
    function Probe() {
      snapshot = useReportableQuestion();
      return null;
    }
    render(
      <ReportableQuestionProvider>
        <MemoryRouter initialEntries={["/quiz"]}>
          <QuizPage />
        </MemoryRouter>
        <Probe />
      </ReportableQuestionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("leaguecraft-workspace")).toBeTruthy());
    await startSetPractice();
    await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());

    // The modern Ranked presentation, not the legacy card.
    expect(screen.getByTestId("practice-arena")).toBeTruthy();
    expect(screen.getByTestId("ranked-question").className).toContain("ranked-question-stage");
    expect(screen.getByTestId("ranked-header-title").textContent).toContain("Question 1 / 2");
    // …with no Ranked game state anywhere in it.
    expect(screen.queryByTestId("timer-value")).toBeNull();
    expect(screen.queryByText(/opponent|forfeit|matchmaking/i)).toBeNull();

    // The arena publishes nothing; Practice's richer snapshot is the one live.
    await waitFor(() => expect(snapshot?.staticQuestionId).toBe(11));
    expect(snapshot?.mode).toBe("Practice");
    expect(snapshot?.canonicalAnswer ?? null).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await screen.findByTestId("practice-explanation");
    expect(screen.queryByRole("button", { name: /Next question|See results/ })).toBeNull();
    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
    expect(submitAnswerMock.mock.calls[0][0]).toMatchObject({ question_id: 11, selected_answer: "Alpha", session_id: 7 });
    await waitFor(() => expect(snapshot?.canonicalAnswer).toBe("Beta"));
    expect(screen.getByTestId("practice-explanation").textContent).toBe("Beta has more.");
  });
});

describe("Practice — PM2 automatic advance", () => {
  it("advances exactly once per question, even if the advance fires twice", async () => {
    await startActiveDataPractice();
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await waitFor(() => expect(autoAdvance.latest?.revealKey ?? null).not.toBeNull());
    const fire = autoAdvance.latest!.onAdvance;
    act(() => { fire(); fire(); });
    // Question 2 — not past the end of a two-question run, not the results.
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
    expect(screen.queryByText("Quiz Complete")).toBeNull();
    expect(screen.getByTestId("ranked-header-title").textContent).toContain("Question 2 / 2");
  });

  it("enters the results exactly once from the final answer", async () => {
    const { trackFunnelEvent } = await import("@/lib/funnel-analytics");
    await startActiveDataPractice();
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await advanceReveal();
    fireEvent.click(await screen.findByRole("button", { name: /Gamma/ }));
    await waitFor(() => expect(autoAdvance.latest?.revealKey ?? null).not.toBeNull());
    const fire = autoAdvance.latest!.onAdvance;
    act(() => { fire(); fire(); });
    await screen.findByText("Quiz Complete");
    expect(vi.mocked(trackFunnelEvent).mock.calls.filter(([name]) => name === "quiz_completed")).toHaveLength(1);
    expect(sfx.play.mock.calls.filter(([event]) => event === "leaguecraft.quiz.complete")).toHaveLength(1);
  });

  it("never auto-advances an unverified answer; Try again resubmits the same answer", async () => {
    submitAnswerMock.mockRejectedValueOnce(new Error("offline"));
    await startActiveDataPractice();
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await screen.findByText("Answer not verified");
    expect(autoAdvance.latest?.revealKey ?? null).toBeNull();
    expect(document.querySelector("[data-practice-reveal-footer]")?.getAttribute("data-verdict-tone")).toBe("neutral");

    fireEvent.click(screen.getByTestId("practice-retry-answer"));
    await waitFor(() => expect(document.querySelector("[data-practice-reveal-footer]")?.getAttribute("data-verdict-tone")).toBe("negative"));
    expect(submitAnswerMock).toHaveBeenCalledTimes(2);
    expect(submitAnswerMock.mock.calls[1][0]).toMatchObject({ question_id: 11, selected_answer: "Alpha" });
    // The retry is not a second lock-in.
    expect(sfx.play.mock.calls.filter(([event]) => event === "leaguecraft.answer.lock")).toHaveLength(1);
    await advanceReveal();
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
  });

  it("Skip leaves an unverified question ungraded", async () => {
    submitAnswerMock.mockRejectedValueOnce(new Error("offline"));
    await startActiveDataPractice();
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    fireEvent.click(await screen.findByTestId("practice-skip"));
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
  });

  it("submits once however many times an answer is pressed", async () => {
    let resolve!: (v: unknown) => void;
    submitAnswerMock.mockImplementationOnce(() => new Promise((r) => { resolve = r; }) as never);
    await startActiveDataPractice();
    const alpha = screen.getByRole("button", { name: /Alpha/ });
    fireEvent.click(alpha);
    fireEvent.click(alpha);
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ is_correct: false, correct_answer: "Beta", explanation: "" }); });
    await waitFor(() => expect(document.querySelector("[data-practice-reveal-footer]")?.getAttribute("data-verdict-tone")).toBe("negative"));
    expect(submitAnswerMock).toHaveBeenCalledTimes(1);
  });

  it("drops a grade that arrives after the player has left the run", async () => {
    const { trackFunnelEvent } = await import("@/lib/funnel-analytics");
    let resolve!: (v: unknown) => void;
    submitAnswerMock.mockImplementationOnce(() => new Promise((r) => { resolve = r; }) as never);
    const router = await startActiveDataPractice();
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await act(() => router.navigate(-1));
    fireEvent.click(await screen.findByRole("button", { name: "Leave Practice" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/origin"));
    await act(async () => { resolve({ is_correct: true, correct_answer: "Alpha", explanation: "" }); });
    expect(vi.mocked(trackFunnelEvent).mock.calls.some(([name]) => name === "quiz_question_answered")).toBe(false);
    expect(sfx.play).not.toHaveBeenCalledWith("leaguecraft.answer.correct", expect.anything());
  });
});
