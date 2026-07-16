/**
 * State-aware activity panel: no-activity, aggregate-only, and detailed
 * history states, plus CTA consolidation and honest Combat Lab copy.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueProfileStats from "./LeagueProfileStats";
import { DEFAULT_PROFILE_CONFIG } from "@/hooks/useProfileConfig";
import type { QuizHistoryEntry, QuizProgress } from "@/lib/quiz/api";

vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: vi.fn(async () => "token"),
}));

const mocks = vi.hoisted(() => ({
  getProgress: vi.fn(),
  getCategories: vi.fn(),
  getAchievements: vi.fn(),
  getHistory: vi.fn(),
}));

vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      ...actual.quizApi,
      getProgress: mocks.getProgress,
      getCategories: mocks.getCategories,
      getAchievements: mocks.getAchievements,
      getHistory: mocks.getHistory,
    },
  };
});

const AGGREGATE_PROGRESS: QuizProgress = {
  total_xp: 120,
  total_attempts: 31,
  correct_attempts: 21,
  accuracy: 67.74,
  current_streak: 8,
  best_streak: 8,
  rank: { rank_name: "Bronze" },
};

const HISTORY: QuizHistoryEntry[] = [
  {
    session_id: 11,
    date: "2026-07-15",
    completed_at: "2026-07-15 20:11:00",
    mode: "quiz",
    category: "items",
    score: 7,
    total_questions: 10,
    accuracy: 70,
  },
];

function setApi({
  progress,
  categories = [],
  history = [],
}: {
  progress: QuizProgress;
  categories?: Array<{ category: string; accuracy: number; attempts: number }>;
  history?: QuizHistoryEntry[];
}) {
  mocks.getProgress.mockResolvedValue(progress);
  mocks.getCategories.mockResolvedValue({ categories });
  mocks.getAchievements.mockResolvedValue({ achievements: [] });
  mocks.getHistory.mockResolvedValue({
    ok: true,
    is_pro: false,
    results: history,
    total_count: history.length,
    limited: false,
    free_limit: 10,
    upsell_message: null,
  });
}

function renderStats() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LeagueProfileStats userId="u1" config={DEFAULT_PROFILE_CONFIG} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("LeagueProfileStats — activity states", () => {
  it("shows the first-use empty state only when there is truly no activity", async () => {
    setApi({ progress: { total_attempts: 0, accuracy: 0, current_streak: 0, best_streak: 0 } });
    renderStats();
    expect(await screen.findByText(/No quiz activity yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start League Quiz/ })).toBeTruthy();
    // At most two secondary suggestions.
    expect(screen.getByRole("link", { name: "Try Combat Lab" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore League Hub" })).toBeTruthy();
  });

  it("does NOT claim 'no quiz history' for a user with aggregate activity", async () => {
    setApi({
      progress: AGGREGATE_PROGRESS,
      categories: [{ category: "items", accuracy: 70, attempts: 20 }],
      history: [],
    });
    renderStats();
    expect(await screen.findByText(/detailed history is not\s+available for earlier results/i)).toBeTruthy();
    expect(screen.queryByText(/No quiz activity yet/)).toBeNull();
    expect(screen.queryByText(/No quiz history yet/)).toBeNull();
    expect(screen.getByRole("link", { name: /Continue League Quiz/ })).toBeTruthy();
  });

  it("renders the Answered metric from the backend's total_attempts", async () => {
    setApi({ progress: AGGREGATE_PROGRESS });
    renderStats();
    await waitFor(() => {
      expect(screen.getByText("Answered").parentElement?.textContent).toContain("31");
    });
  });

  it("shows compact recent activity when stored history exists", async () => {
    setApi({ progress: AGGREGATE_PROGRESS, history: HISTORY });
    renderStats();
    expect(await screen.findByText("Recent Activity")).toBeTruthy();
    expect(screen.getByText("Quiz · items")).toBeTruthy();
    expect(screen.getByText("7/10")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/lol/history");
    expect(screen.queryByText(/detailed history is not/i)).toBeNull();
  });
});

describe("LeagueProfileStats — CTA consolidation", () => {
  it("routes the primary action to /quiz and keeps a single Combat Lab entry", async () => {
    setApi({ progress: AGGREGATE_PROGRESS, history: HISTORY });
    renderStats();
    const primary = await screen.findByRole("link", { name: /Continue League Quiz/ });
    expect(primary.getAttribute("href")).toBe("/quiz");
    // Exactly one Combat Lab destination (the compact card).
    const combatLinks = screen.getAllByRole("link").filter((l) => l.getAttribute("href") === "/combat-lab");
    expect(combatLinks).toHaveLength(1);
  });

  it("uses value-focused Combat Lab copy instead of 'coming soon'", async () => {
    setApi({ progress: AGGREGATE_PROGRESS });
    renderStats();
    expect(await screen.findByText("Test champion builds and matchup scenarios.")).toBeTruthy();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("keeps Tier List and League Docs reachable in the resources row", async () => {
    setApi({ progress: AGGREGATE_PROGRESS });
    renderStats();
    expect((await screen.findByRole("link", { name: /Tier List/ })).getAttribute("href")).toBe("/lol/tier-list");
    expect(screen.getByRole("link", { name: /League Docs/ }).getAttribute("href")).toBe("/lol/docs");
  });
});
