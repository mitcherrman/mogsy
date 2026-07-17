/**
 * Quiz hub Daily entry transition: the Daily Score Attack card replaces the
 * legacy Daily Challenge card ONLY when the backend reports the new mode
 * enabled; any failure or disabled flag falls back to the legacy card.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/ads/AdSlot", () => ({ default: () => null }));
const trackMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: trackMock }));
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
  getBackendAuthHeaders: async () => ({}),
}));

const todayMock = vi.hoisted(() => vi.fn());
vi.mock("@/pages/dev/daily-score-attack/dailyScoreAttackClient", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/pages/dev/daily-score-attack/dailyScoreAttackClient")
  >();
  return { ...original, fetchToday: todayMock };
});

vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: [{ id: 1, name: "Item Build Paths", description: "", question_count: 10 }] }),
    questions: async () => ({ questions: [] }),
    getProgress: async () => ({ rank_name: "Bronze", attempts: 2, current_streak: 3, best_streak: 7, accuracy: 71 }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getDailyChallenge: async () => ({ ok: false }),
    getHistory: async () => ({ ok: false }),
    startSession: async () => ({ ok: false }),
    completeSession: async () => ({}),
  },
  resolveQuizAssetUrl: (p?: string) => p,
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

import QuizPage from "./Quiz";
import { todayFixture } from "./dev/daily-score-attack/testFixtures";

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText("Item Build Paths")).toBeTruthy());
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

describe("Quiz hub Daily entry transition", () => {
  it("shows the legacy Daily card when the feature is unavailable", async () => {
    todayMock.mockRejectedValue(new Error("FEATURE_DISABLED"));
    await renderHub();
    expect(screen.getByText("Daily Challenge")).toBeInTheDocument();
    expect(screen.queryByTestId("hub-score-attack-card")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith("dsa_legacy_fallback", { reason: "unavailable" }),
    );
  });

  it("shows the legacy Daily card when metadata reports disabled", async () => {
    todayMock.mockResolvedValue({ ...todayFixture, enabled: false });
    await renderHub();
    expect(screen.queryByTestId("hub-score-attack-card")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith("dsa_legacy_fallback", { reason: "disabled" }),
    );
  });

  it("promotes the Daily Score Attack card when enabled, hiding the legacy card", async () => {
    todayMock.mockResolvedValue({ ...todayFixture, daily_streak: 2 });
    await renderHub();
    const card = await screen.findByTestId("hub-score-attack-card");
    expect(card).toHaveTextContent("Daily Score Attack");
    expect(screen.queryByText("Daily Challenge")).not.toBeInTheDocument();
    const link = screen.getByTestId("score-attack-cta");
    expect(link.getAttribute("href")).toBe("/quiz/daily");
    expect(link.getAttribute("href")).not.toContain("/dev/");
  });

  it("reflects a terminal official run on the enabled card", async () => {
    todayMock.mockResolvedValue({
      ...todayFixture,
      official_run: { run_id: "r", status: "completed", score: 5150, completed_at: "x" },
    });
    await renderHub();
    expect(await screen.findByTestId("score-attack-status")).toHaveTextContent("5,150");
  });
});
