/**
 * MG-D — Mogzy on the Leaguecraft journey, proved through the real /quiz page.
 *
 * Two halves, and the second is as important as the first:
 *
 *   1. ROLE GUIDANCE. Mogzy introduces the role selector once, reacts to a
 *      pick by leaning toward PLAY, and leaves when the record opens. He is a
 *      bystander: the role is still written ONLY by the record's Ranked entry,
 *      PLAY still opens the record exactly as before, and he is never in the
 *      quiz runner.
 *
 *   2. SIGNUP CONVERSION. The existing guest-first policy is untouched — the
 *      same counter, the same 3 / 5 defaults, the soft nudge mid-run, the hard
 *      prompt armed at 5 and shown only AFTER completion — and the post-
 *      completion prompt is now voiced by Mogzy.
 *
 * Every dependency is faked at its boundary so the assertions are about the
 * page's own behaviour.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { createGuideStorage, type GuideStorage } from "@/components/mogzy-guide";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/ads/AdSlot", () => ({ default: () => null }));
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: track }));
vi.mock("@/hooks/useFriends", () => ({
  useFriends: () => ({ friends: [], loading: false }),
}));

const auth = vi.hoisted(() => ({
  user: { id: "g1", is_anonymous: true } as { id: string; is_anonymous: boolean } | null,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInAnonymously: vi.fn() },
    from: () => ({
      select: () => ({
        // No `quiz_onboarding_config` row: the page's own defaults apply, which
        // is exactly the production situation this pass planned against.
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
        then: (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: [] }),
      }),
    }),
  },
}));

/** The REAL counter module is faked only so the test can set the count. */
const gate = vi.hoisted(() => ({ count: 0, nudgeSeen: false }));
vi.mock("@/lib/quiz/onboarding-gate", () => ({
  hasVisitedHub: () => true,
  incrementAnonymousActions: () => ++gate.count,
  getAnonymousActionCount: () => gate.count,
  hasSoftNudgeBeenSeen: () => gate.nudgeSeen,
  markSoftNudgeSeen: () => {
    gate.nudgeSeen = true;
  },
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: async () => "test-token",
  getExistingBackendAuthToken: async () => "test-token",
}));
vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: vi.fn() }) }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: vi.fn() }) }));

const SETS = [{ id: 5, name: "All Current Questions", description: "Everything", question_count: 1260 }];
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
vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: async () => ({ questions: QUESTIONS }),
    categoryQuestions: async () => ({ questions: [] }),
    getProgress: async () => ({ rank_name: "Bronze", attempts: 2, current_streak: 1, accuracy: 50, xp: 40 }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getHistory: async () => ({
      ok: true, is_pro: false, total_count: 0, limited: false, free_limit: 10,
      upsell_message: null, results: [],
    }),
    getMissedQuestions: async () => ({ ok: true, results: [] }),
    startSession: async () => ({ ok: true, session_id: 7 }),
    completeSession: async () => ({}),
    submitAnswer: async (p: { question_id: number }) =>
      p.question_id === 11
        ? { is_correct: true, correct_answer: "Alpha", explanation: "x" }
        : { is_correct: true, correct_answer: "Gamma", explanation: "y" },
  },
  categoryLabel: (s: { category?: string; category_name?: string }) =>
    s.category_name || s.category || "Uncategorized",
  resolveQuizAssetUrl: (p?: string) => p,
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

vi.mock("@/pages/quiz-ranked/useRankedProgression", () => ({
  useRankedProgression: () => ({ loadState: "unavailable" as const, progression: null }),
}));
vi.mock("@/pages/quiz-ranked/useRankedAvailability", () => ({
  useRankedAvailability: () => ({
    open: true, state: "open" as const, reason: "test",
    nextOpenAt: null, closesAt: null, serverTime: "2026-09-21T12:00:00Z",
  }),
}));
vi.mock("@/pages/quiz-ranked/useRankedMatchHistory", () => ({
  useRankedMatchHistory: () => ({ loadState: "ready" as const, entries: [], limit: 20 }),
}));
vi.mock("@/hooks/useProfileIdentity", () => ({
  useProfileIdentity: () => ({ loading: false, displayName: null, avatarUrl: null }),
}));

const selectRole = vi.fn(async (_role: RankedRole) => true);
let roleState: { loadState: "loading" | "ready" | "unavailable"; role: RankedRole | null } = {
  loadState: "unavailable",
  role: null,
};
vi.mock("@/pages/quiz-ranked/useRankedRole", () => ({
  useRankedRole: () => ({
    loadState: roleState.loadState,
    role: roleState.role,
    saving: false,
    error: null,
    selectRole,
    readWriteError: () => null,
    clearError: () => {},
  }),
}));
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn(), dismiss: vi.fn() }),
}));

/**
 * The substrate's default store keeps an in-memory copy of everything it has
 * recorded for the life of the module — correct in a browser, where it mirrors
 * localStorage, and a leak between tests. Each test gets a fresh store instead,
 * still backed by jsdom's localStorage so the persisted key is observable.
 */
const guideStore = vi.hoisted(() => ({ current: null as GuideStorage | null }));
vi.mock("@/components/mogzy-guide", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/mogzy-guide")>();
  return {
    ...mod,
    useMogzyGuide: (options: Parameters<typeof mod.useMogzyGuide>[0]) =>
      mod.useMogzyGuide({ ...options, storage: guideStore.current ?? undefined }),
  };
});

import QuizPage from "./Quiz";

function Where() {
  const l = useLocation();
  return <span data-testid="where">{`${l.pathname}${l.search}`}</span>;
}

async function renderHub() {
  render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <Where />
      <Routes>
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/auth" element={<div data-testid="auth-route" />} />
        <Route path="/quiz/ranked" element={<div data-testid="ranked-route" />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId("ranked-class-carousel")).toBeTruthy());
}

const lobbyGuide = () => screen.queryByTestId("mogzy-guide-leaguecraft");
const liveText = () => screen.getByTestId("mogzy-guide-leaguecraft-live").textContent;
const signupGuide = () => screen.queryByTestId("mogzy-guide-leaguecraft-signup");

/** Start the catalog-wide set through History's empty-record action. */
async function startPractice() {
  const empty = await screen.findByTestId("study-history-empty");
  fireEvent.click(within(empty).getByRole("button", { name: /Start practising/ }));
  await waitFor(() => expect(screen.getByText(QUESTIONS[0].question_text)).toBeTruthy());
}

async function answerFirst() {
  fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Next question/ })).toBeTruthy());
}

beforeEach(() => {
  track.mockClear();
  selectRole.mockClear();
  auth.user = { id: "g1", is_anonymous: true };
  roleState = { loadState: "unavailable", role: null };
  gate.count = 0;
  gate.nudgeSeen = false;
  localStorage.clear();
  guideStore.current = createGuideStorage();
});
afterEach(cleanup);

describe("Leaguecraft — Mogzy's role guidance", () => {
  it("introduces the role selector to an anonymous first visit, as a bystander", async () => {
    await renderHub();
    await waitFor(() => expect(lobbyGuide()).not.toBeNull());
    expect(lobbyGuide()!.getAttribute("data-active-message")).toBe("lc-role-first");
    expect(liveText()).toBe("Start here. Pick the role you know best.");
    // The selector and PLAY are still the page's own, untouched and reachable.
    expect(screen.getByTestId("ranked-class-carousel")).toBeTruthy();
    expect(screen.getByTestId("ranked-play-gem")).toBeTruthy();
    // He is not a control.
    expect(within(lobbyGuide()!).queryByRole("button")).toBeNull();
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("is not shown at all to a visitor who has already seen it", async () => {
    localStorage.setItem("mogzy-guide:v1:leaguecraft:lc-role-first", "1");
    await renderHub();
    expect(lobbyGuide()).toBeNull();
  });

  it("waits for the account's role to settle, and stays away from a saved role", async () => {
    // A signed-in account whose role is still being read must not flash a
    // prompt that its own saved role is about to make untrue.
    auth.user = { id: "u1", is_anonymous: false };
    roleState = { loadState: "loading", role: null };
    await renderHub();
    expect(lobbyGuide()).toBeNull();

    cleanup();
    roleState = { loadState: "ready", role: "jungle" };
    await renderHub();
    expect(lobbyGuide()).toBeNull();
  });

  it("offers it to a signed-in account that has never chosen a role", async () => {
    auth.user = { id: "u1", is_anonymous: false };
    roleState = { loadState: "ready", role: null };
    await renderHub();
    await waitFor(() => expect(lobbyGuide()).not.toBeNull());
    expect(lobbyGuide()!.getAttribute("data-active-message")).toBe("lc-role-first");
  });

  it("reacts to a pick without writing the role, then leaves when PLAY opens the record", async () => {
    await renderHub();
    await waitFor(() => expect(lobbyGuide()).not.toBeNull());

    fireEvent.click(screen.getByTestId("ranked-class-next"));
    await waitFor(() => expect(lobbyGuide()!.getAttribute("data-active-message")).toBe("lc-role-picked"));
    expect(liveText()).toBe("Ready? Press Play.");
    expect(
      screen.getByTestId("mogzy-guide-leaguecraft-bubble").getAttribute("data-direction"),
    ).toBe("down");
    // Browsing is still local: nothing was written.
    expect(selectRole).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    // The record opened exactly as before, on the same route, still unwritten.
    expect(screen.getByTestId("where").textContent).toBe("/quiz");
    expect(selectRole).not.toHaveBeenCalled();
    await waitFor(() => expect(lobbyGuide()).toBeNull());
    // First-use is consumed by acting on it.
    expect(localStorage.getItem("mogzy-guide:v1:leaguecraft:lc-role-first")).toBe("1");
  });

  it("reacts to a role CHANGE on a saved role too, once", async () => {
    auth.user = { id: "u1", is_anonymous: false };
    roleState = { loadState: "ready", role: "top" };
    await renderHub();
    expect(lobbyGuide()).toBeNull();

    fireEvent.click(screen.getByTestId("ranked-class-next"));
    await waitFor(() => expect(lobbyGuide()!.getAttribute("data-active-message")).toBe("lc-role-picked"));
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("is never in the quiz runner", async () => {
    await renderHub();
    await waitFor(() => expect(lobbyGuide()).not.toBeNull());
    await startPractice();
    expect(lobbyGuide()).toBeNull();
    expect(screen.queryByTestId("mogzy-guide-leaguecraft-signup")).toBeNull();
    expect(document.querySelectorAll('[data-testid^="mogzy-guide-"][data-surface]')).toHaveLength(0);
  });
});

describe("Leaguecraft — signup conversion keeps the existing policy", () => {
  it("does not interrupt a run before the threshold, and shows no prompt at completion", async () => {
    gate.count = 0;
    await renderHub();
    await startPractice();
    await answerFirst();
    expect(gate.count).toBe(1);
    expect(screen.queryByText(/Sign up to save your XP/)).toBeNull();
    expect(signupGuide()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    fireEvent.click(await screen.findByRole("button", { name: /See results/ }));
    await waitFor(() => expect(screen.getByText("Quiz Complete")).toBeTruthy());
    expect(signupGuide()).toBeNull();
    expect(screen.queryByText(/Sign up to save your XP/)).toBeNull();
  });

  it("leaves the soft nudge structurally unchanged: same copy, mid-run, at 3 answers", async () => {
    gate.count = 2;
    await renderHub();
    await startPractice();
    await answerFirst();
    expect(gate.count).toBe(3);
    // The generic nudge, as before — NOT Mogzy, and NOT the hard prompt.
    expect(screen.getByText("Sign up to save your XP and streak to your profile.")).toBeTruthy();
    expect(signupGuide()).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep Playing as Guest" })).toBeNull();
    expect(screen.getByRole("button", { name: /Sign up/ })).toBeTruthy();
    // It is shown once per session, and the soft nudge never arms the hard one.
    fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    fireEvent.click(await screen.findByRole("button", { name: /See results/ }));
    await waitFor(() => expect(screen.getByText("Quiz Complete")).toBeTruthy());
    expect(signupGuide()).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep Playing as Guest" })).toBeNull();
  });

  it("arms at 5 but shows the prompt only AFTER completion, voiced by Mogzy", async () => {
    gate.count = 4;
    await renderHub();
    await startPractice();
    await answerFirst();
    expect(gate.count).toBe(5);
    // Armed, never mid-question.
    expect(signupGuide()).toBeNull();
    expect(screen.queryByRole("button", { name: "Create Account" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
    expect(signupGuide()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    fireEvent.click(await screen.findByRole("button", { name: /See results/ }));

    await waitFor(() => expect(signupGuide()).not.toBeNull());
    // 2/2 correct.
    expect(screen.getByTestId("mogzy-guide-leaguecraft-signup-bubble").textContent).toContain(
      "Not bad. Want me to keep track of your progress?",
    );
    // Exactly one prompt, one announcement, and the concrete value beneath it.
    expect(screen.getAllByRole("button", { name: "Create Account" })).toHaveLength(1);
    expect(screen.getAllByRole("status").filter((n) => n.textContent)).toHaveLength(1);
    expect(screen.queryByText("Sign up to save your XP and streak to your profile.")).toBeNull();
    expect(screen.getByText(/Save your score & XP/)).toBeTruthy();
    expect(screen.getByText(/Keep your streaks/)).toBeTruthy();
    // Two answers, two counted actions: 4 → 6.
    expect(track).toHaveBeenCalledWith("quiz_signup_gate_shown", {
      action_count: 6,
      returnTo: "/quiz",
      presentation: "mogzy_guide",
    });
  });

  it("Keep Playing as Guest dismisses it and leaves the results, with no second prompt", async () => {
    gate.count = 4;
    await renderHub();
    await startPractice();
    await answerFirst();
    fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    fireEvent.click(await screen.findByRole("button", { name: /See results/ }));
    await waitFor(() => expect(signupGuide()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Keep Playing as Guest" }));
    await waitFor(() => expect(signupGuide()).toBeNull());
    // The results the prompt was covering are intact and nothing re-prompts.
    expect(screen.getByText("Quiz Complete")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Play again/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create Account" })).toBeNull();
    expect(screen.queryByText("Sign up to save your XP and streak to your profile.")).toBeNull();
    expect(screen.getByTestId("where").textContent).toBe("/quiz");
  });

  it("Create Account is the existing auth round trip, returning to /quiz", async () => {
    gate.count = 4;
    await renderHub();
    await startPractice();
    await answerFirst();
    fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    fireEvent.click(await screen.findByRole("button", { name: /See results/ }));
    await waitFor(() => expect(signupGuide()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    await waitFor(() => expect(screen.getByTestId("auth-route")).toBeTruthy());
    expect(screen.getByTestId("where").textContent).toBe("/auth?mode=signup&returnTo=%2Fquiz");
  });

  it("never prompts a signed-in account", async () => {
    auth.user = { id: "u1", is_anonymous: false };
    roleState = { loadState: "ready", role: "top" };
    gate.count = 10;
    await renderHub();
    await startPractice();
    await answerFirst();
    expect(gate.count).toBe(10);
    fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
    await waitFor(() => expect(screen.getByText(QUESTIONS[1].question_text)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    fireEvent.click(await screen.findByRole("button", { name: /See results/ }));
    await waitFor(() => expect(screen.getByText("Quiz Complete")).toBeTruthy());
    expect(signupGuide()).toBeNull();
    expect(screen.queryByRole("button", { name: "Create Account" })).toBeNull();
  });
});
