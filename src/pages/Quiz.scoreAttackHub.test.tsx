/**
 * Daily-mode entries on the Leaguecraft hub.
 *
 * The Ranked-first redesign withholds BOTH daily surfaces from /quiz — the
 * Daily Score Attack ("Time Trial") card and the legacy Daily Challenge card
 * it replaces — because neither serves the play → review → practice → play
 * loop the page is built around. Nothing was deleted: the availability probe
 * still runs (so the funnel keeps reporting which mode the backend serves),
 * Time Trial is still playable at /quiz/daily, and both cards still exist and
 * are covered by their own component tests. Flip HUB_MODULES.timeTrial /
 * .dailyChallenge in Quiz.tsx to bring either card back to the hub.
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
      // PLAY1: `useAppSettings` reads the whole app_settings table with a
      // bare `.select(...).then(...)` to resolve global platform policy. No
      // rows -> the fail-safe defaults, which is all three PLAY entries
      // visible.
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
  // The set name used to be the "hub is up" signal, via the practice tiles.
  // That panel is withheld now, so it waits on the Leaguecraft Record.
  await waitFor(() => expect(screen.getByTestId("leaguecraft-workspace")).toBeTruthy());
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Optional-call: in this repo's vitest/jsdom environment `localStorage`
  // is a bare object with no Storage methods, and an unguarded call throws
  // in `beforeEach` — which silently errored out every test in this file
  // before the redesign. Guarding here keeps the reset when the environment
  // provides one, without touching the shared setup other suites rely on.
  localStorage.clear?.();
});
afterEach(cleanup);

describe("Leaguecraft hub — daily modes withheld", () => {
  it("still probes daily-mode availability and reports an unavailable backend", async () => {
    todayMock.mockRejectedValue(new Error("FEATURE_DISABLED"));
    await renderHub();
    expect(todayMock).toHaveBeenCalled();
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith("dsa_legacy_fallback", { reason: "unavailable" }),
    );
    expect(screen.queryByText("Daily Challenge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hub-score-attack-card")).not.toBeInTheDocument();
  });

  it("still reports a disabled backend flag", async () => {
    todayMock.mockResolvedValue({ ...todayFixture, enabled: false });
    await renderHub();
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith("dsa_legacy_fallback", { reason: "disabled" }),
    );
    expect(screen.queryByTestId("hub-score-attack-card")).not.toBeInTheDocument();
  });

  it("keeps the Time Trial card off the hub even when the backend enables it", async () => {
    todayMock.mockResolvedValue({ ...todayFixture, daily_streak: 2 });
    await renderHub();
    expect(screen.queryByTestId("hub-score-attack-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("score-attack-cta")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily Challenge")).not.toBeInTheDocument();
    // The Ranked-first loop occupies the space the daily pair used to hold.
    expect(screen.getByTestId("hub-ranked-section")).toBeInTheDocument();
    // The Practice panel is withheld; the Leaguecraft Record is what fills
    // the lower half of the lobby now.
    expect(screen.getByTestId("hub-record-section")).toBeInTheDocument();
  });

  it("does not surface a terminal official run on the hub either", async () => {
    todayMock.mockResolvedValue({
      ...todayFixture,
      official_run: { run_id: "r", status: "completed", score: 5150, completed_at: "x" },
    });
    await renderHub();
    expect(screen.queryByTestId("score-attack-status")).not.toBeInTheDocument();
  });
});
