/**
 * Quiz Hub hierarchy: combined Ranked hero first (with the absorbed progress
 * strip), then the Daily Challenge + Recent Quiz Results pair, then the
 * practice-category grid — with existing daily/ranked/category actions intact.
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

const SETS = [
  { id: 1, name: "Item Build Paths", description: "Recipes", question_count: 120 },
  { id: 2, name: "Champion Ability Cooldowns", description: "Timers", question_count: 80 },
];

const HISTORY = {
  ok: true,
  is_pro: false,
  total_count: 12,
  limited: false,
  free_limit: 10,
  upsell_message: null,
  results: [
    { session_id: 3, date: "2026-07-16", completed_at: "2026-07-16 10:00:00", mode: "standard", category: "Item Knowledge", score: 8, total_questions: 10, accuracy: 80 },
    { session_id: 2, date: "2026-07-15", completed_at: "2026-07-15 09:00:00", mode: "daily", category: null, score: 3, total_questions: 5, accuracy: 60 },
    { session_id: 1, date: "2026-07-14", completed_at: "2026-07-14 08:00:00", mode: "standard", category: "Champion Basics", score: 2, total_questions: 10, accuracy: 20 },
  ],
};

const questionsMock = vi.fn(async () => ({ questions: [] }));
const historyMock = vi.fn(async () => HISTORY);
vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: (...args: unknown[]) => questionsMock(...(args as [])),
    getProgress: async () => ({
      rank_name: "Bronze",
      attempts: 2,
      current_streak: 3,
      best_streak: 7,
      accuracy: 71.2,
    }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getDailyChallenge: async () => ({ ok: false }),
    getHistory: () => historyMock(),
    startSession: async () => ({ ok: false }),
    completeSession: async () => ({}),
  },
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText("Item Build Paths")).toBeTruthy());
  return utils;
}

import QuizPage from "./Quiz";

beforeEach(() => {
  questionsMock.mockClear();
  historyMock.mockClear();
  historyMock.mockResolvedValue(HISTORY);
  localStorage.clear();
});
afterEach(cleanup);

describe("Quiz Hub hierarchy", () => {
  it("orders Ranked hero → Daily/History row → practice categories", async () => {
    const { container } = await renderHub();
    const rankedSection = container.querySelector('[data-testid="hub-ranked-section"]')!;
    const pairRow = container.querySelector('[data-testid="hub-daily-history-row"]')!;
    const practice = container.querySelector('[data-testid="hub-practice-section"]')!;
    expect(rankedSection).not.toBeNull();
    expect(pairRow).not.toBeNull();
    expect(practice).not.toBeNull();
    expect(
      rankedSection.compareDocumentPosition(pairRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      pairRow.compareDocumentPosition(practice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(rankedSection.querySelector('[data-testid="ranked-hero"]')).not.toBeNull();
    // The standalone Current Progress card is gone.
    expect(container.querySelector('[data-testid="current-progress-card"]')).toBeNull();
  });

  it("the Ranked hero absorbs the compact progress stats + profile link", async () => {
    const { container } = await renderHub();
    const hero = container.querySelector('[data-testid="ranked-hero"]')!;
    const strip = hero.querySelector('[data-testid="hero-stat-strip"]')!;
    expect(strip).not.toBeNull();
    expect(strip.textContent).toContain("Current streak");
    expect(strip.textContent).toContain("Best streak");
    expect(strip.textContent).toContain("71%"); // rounded accuracy
    expect(strip.textContent).not.toContain("71.2");
    expect(strip.textContent).toContain("Answered");
    const profileLink = hero.querySelector('a[href="/profile"]');
    expect(profileLink?.textContent).toMatch(/View full profile/);
  });

  it("renders Daily Challenge and Recent Quiz Results side by side (responsive grid)", async () => {
    const { container } = await renderHub();
    const row = container.querySelector('[data-testid="hub-daily-history-row"]') as HTMLElement;
    expect(row.className).toContain("grid-cols-1");
    expect(row.className).toContain("md:grid-cols-2");
    expect(screen.getByText("Daily Challenge")).toBeTruthy();
    const card = row.querySelector('[data-testid="recent-results-card"]')!;
    expect(card).not.toBeNull();
    // Daily first, history second in DOM (mobile stacking order).
    expect(row.textContent!.indexOf("Daily Challenge")).toBeLessThan(
      row.textContent!.indexOf("Recent Quiz Results"),
    );
  });

  it("Recent Quiz Results uses the real provided history data + real route", async () => {
    const { container } = await renderHub();
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="history-row"]').length).toBe(3),
    );
    const rows = container.querySelectorAll('[data-testid="history-row"]');
    expect(rows[0].textContent).toContain("Item Knowledge");
    expect(rows[0].textContent).toContain("8/10");
    expect(rows[0].textContent).toContain("80%");
    expect(rows[1].textContent).toContain("Daily");
    expect(rows[2].textContent).toContain("2/10");
    const link = screen.getByRole("link", { name: /View full history/ });
    expect(link.getAttribute("href")).toBe("/lol/history");
  });

  it("shows the honest empty state when there is no history", async () => {
    historyMock.mockResolvedValue({ ...HISTORY, results: [], total_count: 0 });
    const { container } = await renderHub();
    await waitFor(() =>
      expect(container.querySelector('[data-testid="history-empty"]')).not.toBeNull(),
    );
    expect(screen.getByText("No quiz results yet")).toBeTruthy();
    expect(screen.getByText("Play your first quiz to begin your history.")).toBeTruthy();
    // Its Play Ranked CTA drives the same queue action.
    fireEvent.click(screen.getByRole("button", { name: /Play Ranked/ }));
    await waitFor(() => expect(questionsMock).toHaveBeenCalled());
  });

  it("shows unranked placement wording (2 attempts → Placement 2/5)", async () => {
    await renderHub();
    expect(screen.getByRole("heading", { name: "Placement Series" })).toBeTruthy();
    expect(screen.getAllByText("Unranked").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Complete your placement matches to establish your starting rank."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Play Placement/ })).toBeTruthy();
  });

  it("keeps practice heading + category navigation working", async () => {
    await renderHub();
    expect(screen.getByText("Practice Your Knowledge")).toBeTruthy();
    expect(screen.getByText("Train specific topics before your next ranked match.")).toBeTruthy();
    fireEvent.click(screen.getByText("Item Build Paths"));
    await waitFor(() =>
      expect(questionsMock).toHaveBeenCalledWith("Item Build Paths", 10),
    );
  });

  it("Ranked CTA still starts a quiz set (no regression)", async () => {
    await renderHub();
    fireEvent.click(screen.getByRole("button", { name: /Play Placement/ }));
    await waitFor(() => expect(questionsMock).toHaveBeenCalled());
  });

  it("Daily Challenge action is now labeled Play Daily", async () => {
    await renderHub();
    expect(screen.getByRole("button", { name: /Play Daily/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Play Now$/ })).toBeNull();
  });
});
