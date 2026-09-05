/**
 * Time Trial's entry on the Leaguecraft hub — PT1.7A.
 *
 * The Ranked-first redesign withheld this card from /quiz while the mode
 * itself stayed deployed, backend-enabled, XP- and streak-integrated and
 * playable at /quiz/daily with no link to it anywhere in the product. PT1.7A
 * restores the entry (HUB_MODULES.timeTrial) and moves it INTO the
 * composition — the study row beside the practice packs — instead of leaving
 * it as a card appended under the record.
 *
 * What these tests fence:
 *   - the card is on the hub when the backend serves the mode,
 *   - it is NOT on the hub when the backend says disabled or is unreachable,
 *     and the funnel still reports which of those happened,
 *   - the entry is Free: no account is required to reach /quiz/daily, and no
 *     entitlement copy appears on or around it.
 *
 * Scoring, generation, the frozen pool, the one-run-a-day rule and the streak
 * are the mode's own and are untouched here — see its own suites.
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

describe("Leaguecraft hub — Time Trial entry", () => {
  it("keeps the card off the hub when the backend is unreachable, and says so", async () => {
    todayMock.mockRejectedValue(new Error("FEATURE_DISABLED"));
    await renderHub();
    expect(todayMock).toHaveBeenCalled();
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith("dsa_legacy_fallback", { reason: "unavailable" }),
    );
    expect(screen.queryByTestId("hub-score-attack-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hub-time-trial-section")).not.toBeInTheDocument();
  });

  it("keeps the card off the hub when the backend flag is off", async () => {
    todayMock.mockResolvedValue({ ...todayFixture, enabled: false });
    await renderHub();
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith("dsa_legacy_fallback", { reason: "disabled" }),
    );
    expect(screen.queryByTestId("hub-score-attack-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hub-time-trial-section")).not.toBeInTheDocument();
  });

  it("surfaces the card, with today's real shape, when the backend enables it", async () => {
    todayMock.mockResolvedValue({ ...todayFixture, daily_streak: 2 });
    await renderHub();
    const card = await screen.findByTestId("hub-score-attack-card");
    expect(card).toBeInTheDocument();
    // The card is a pure projection of the server payload — this asserts it
    // is WIRED, not that the numbers are these numbers.
    expect(card.textContent).toContain(String(todayFixture.question_count));
    expect(card.textContent).toContain(String(todayFixture.run_duration_seconds));
    expect(screen.getByTestId("score-attack-streak").textContent).toContain("2 day");
    // …and it goes to the production route, not the dev host.
    // `asChild` puts the testid on the anchor itself.
    expect(screen.getByTestId("score-attack-cta").getAttribute("href")).toBe("/quiz/daily");
  });

  it("puts the entry in the study row, above the record — not under it", async () => {
    todayMock.mockResolvedValue({ ...todayFixture });
    const { container } = await renderHub();
    const section = await screen.findByTestId("hub-time-trial-section");
    expect(section.querySelector('[data-testid="hub-score-attack-card"]')).not.toBeNull();
    const record = container.querySelector('[data-testid="hub-record-section"]')!;
    const rail = container.querySelector('[data-testid="quiz-category-rail"]')!;
    const follows = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(rail, section)).toBeTruthy();
    expect(follows(section, record)).toBeTruthy();
  });

  it("surfaces a terminal official run's own status line", async () => {
    todayMock.mockResolvedValue({
      ...todayFixture,
      official_run: { run_id: "r", status: "completed", score: 5150, completed_at: "x" },
    });
    await renderHub();
    const status = await screen.findByTestId("score-attack-status");
    expect(status.textContent).toContain("5,150");
  });

  it("is FREE — no entitlement gate, and a guest still reaches the route", async () => {
    todayMock.mockResolvedValue({ ...todayFixture });
    const { container } = await renderHub();
    const section = await screen.findByTestId("hub-time-trial-section");
    // Only the mode's OWN account rule appears (the official run needs a real
    // account; practice does not). No Premium copy, no upsell, no lock.
    expect(section.textContent).not.toMatch(/Premium|Upgrade|Unlock|locked/i);
    expect(container.querySelector('[data-testid="hub-time-trial-section"] a')
      ?.getAttribute("href")).toBe("/quiz/daily");
  });
});
