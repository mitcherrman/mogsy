/**
 * MALT — the Leaguecraft lobby's role WRITE path.
 *
 * Two regressions, both traced from a click on the role stage all the way to
 * the network call and the notice it can produce:
 *
 *  1. clicking the mascot for the role the account ALREADY has must not send
 *     PUT /api/ranked/role at all. That write is rate limited to ten a minute
 *     (`role_set`), so a reader clicking the standing mascot used to spend the
 *     whole budget re-choosing a role they already had and then be answered
 *     429 "too many requests; slow down";
 *
 *  2. however many refusals a burst produces, the lobby must reuse ONE toast
 *     rather than mint an identical copy per rejection.
 *
 * The controller is faked at the hook boundary so the assertions are about the
 * page's own behaviour and not about the Ranked service.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedRole } from "@/lib/ranked-public/roles";

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
vi.mock("@/lib/backend-auth", () => ({ ensureBackendAuthToken: async () => "test-token" }));

const SETS = [
  { id: 5, name: "All Current Questions", description: "Everything", question_count: 1260 },
  { id: 2, name: "Item Knowledge", description: "Recipes", question_count: 606 },
];

vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: async () => ({ questions: [] }),
    getProgress: async () => ({ rank_name: "Bronze", attempts: 2, current_streak: 1, best_streak: 2, accuracy: 50 }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getDailyChallenge: async () => ({ ok: false }),
    getHistory: async () => ({ ok: true, results: [] }),
    startSession: async () => ({ ok: false }),
    completeSession: async () => ({}),
  },
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

// The Ranked reads the lobby also makes; none of them is under test here.
vi.mock("@/pages/quiz-ranked/useRankedProgression", () => ({
  useRankedProgression: () => ({ loadState: "unavailable" as const, progression: null }),
}));
vi.mock("@/pages/quiz-ranked/useRankedMatchHistory", () => ({
  useRankedMatchHistory: () => ({ loadState: "ready" as const, entries: [], limit: 20 }),
}));
vi.mock("@/hooks/useProfileIdentity", () => ({
  useProfileIdentity: () => ({ loading: false, displayName: null, avatarUrl: null }),
}));

/** The role write, faked at the controller boundary. */
const selectRole = vi.fn(async (_role: RankedRole) => true);
let roleState: { role: RankedRole | null; error: string | null } = { role: "top", error: null };
vi.mock("@/pages/quiz-ranked/useRankedRole", () => ({
  useRankedRole: () => ({
    loadState: "ready" as const,
    role: roleState.role,
    saving: false,
    error: roleState.error,
    selectRole,
    clearError: () => {},
  }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: Object.assign(vi.fn(), {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import QuizPage from "./Quiz";

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId("ranked-class-carousel")).toBeTruthy());
  return utils;
}

beforeEach(() => {
  selectRole.mockClear();
  selectRole.mockResolvedValue(true);
  toastError.mockClear();
  roleState = { role: "top", error: null };
  localStorage.clear?.();
});
afterEach(cleanup);

describe("Leaguecraft lobby — role write", () => {
  it("sends NOTHING when the already-selected mascot is clicked twenty-five times", async () => {
    await renderHub();
    const top = screen.getByTestId("ranked-class-slide-top");
    for (let i = 0; i < 25; i++) fireEvent.click(top);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("still writes a REAL role change exactly once", async () => {
    await renderHub();
    fireEvent.click(screen.getByTestId("ranked-class-slide-jungle"));
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(1));
    expect(selectRole).toHaveBeenLastCalledWith("jungle");
  });

  it("reuses ONE toast id for every refusal, so a burst cannot stack copies", async () => {
    roleState = { role: "top", error: "too many requests; slow down" };
    selectRole.mockResolvedValue(false);
    await renderHub();

    // Five real changes around the ring — every one refused by the service.
    for (const role of ["jungle", "mid", "adc", "support"] as const) {
      fireEvent.click(screen.getByTestId(`ranked-class-slide-${role}`));
      await waitFor(() => expect(toastError).toHaveBeenCalled());
    }

    expect(toastError.mock.calls.length).toBeGreaterThan(1);
    const ids = new Set(
      toastError.mock.calls.map(([, opts]) => (opts as { id?: string } | undefined)?.id),
    );
    // One id, and a real one — an undefined id is a fresh toast every time.
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
  });
});
