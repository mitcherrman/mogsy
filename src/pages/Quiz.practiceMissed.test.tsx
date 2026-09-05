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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
}));
vi.mock("@/pages/dev/daily-score-attack/dailyScoreAttackClient", () => ({
  fetchToday: async () => {
    throw new Error("disabled in this suite");
  },
}));

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
    getHistory: async () => ({ ok: false }),
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

/** Start a pack, answer both questions, and land on the results screen. */
async function playASessionWithOneMiss() {
  render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId("leaguecraft-workspace")).toBeTruthy());

  fireEvent.click(screen.getByTestId("practice-tile"));
  await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Next question/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Next question/ }));

  await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /See results/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /See results/ }));

  await waitFor(() => expect(screen.getByText("Quiz Complete")).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear?.();
});
afterEach(cleanup);

describe("Practice — remediating the run you just played", () => {
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
    await waitFor(() => expect(screen.getByRole("button", { name: /See results/ })).toBeTruthy());

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
