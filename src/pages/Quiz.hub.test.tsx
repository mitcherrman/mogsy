/**
 * Leaguecraft hub (/quiz) — the Ranked-first one-page composition.
 *
 * Hierarchy under test: compact Leaguecraft header → the dominant Ranked hero
 * (with the absorbed progress strip) → one short secondary row of Recent
 * Studies and a demoted Practice panel, with Mastery as a link inside it. The modes withheld from this page (Time Trial / Daily, Stat
 * Check, Knowledge Breakdown, Achievements) must be absent from the hub while
 * their routes stay live elsewhere — see HUB_MODULES in Quiz.tsx.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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

// Mirrors the shape the backend actually serves at /api/quiz/sets, including
// the catalog-wide set the "Practice Questions" primary action opens.
const SETS = [
  { id: 5, name: "All Current Questions", description: "Everything", question_count: 1260 },
  { id: 2, name: "Item Knowledge", description: "Recipes", question_count: 606 },
  { id: 3, name: "Champion Basics", description: "Kits", question_count: 522 },
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

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
      <LocationProbe />
    </MemoryRouter>,
  );
  // Wait on the practice tiles, not on a set name: category names such as
  // "Item Knowledge" legitimately appear in the history rows too.
  await waitFor(() =>
    expect(utils.container.querySelectorAll('[data-testid="practice-tile"]').length).toBe(
      SETS.length,
    ),
  );
  return utils;
}

import QuizPage from "./Quiz";

beforeEach(() => {
  questionsMock.mockClear();
  historyMock.mockClear();
  historyMock.mockResolvedValue(HISTORY);
  // Optional-call: in this repo's vitest/jsdom environment `localStorage`
  // is a bare object with no Storage methods, and an unguarded call throws
  // in `beforeEach` — which silently errored out every test in this file
  // before the redesign. Guarding here keeps the reset when the environment
  // provides one, without touching the shared setup other suites rely on.
  localStorage.clear?.();
});
afterEach(cleanup);

describe("Leaguecraft hub — header", () => {
  it("is compact: back control, wordmark, and tagline on one row", async () => {
    await renderHub();
    expect(screen.getByRole("heading", { name: "LEAGUECRAFT", level: 1 })).toBeTruthy();
    expect(screen.getByText("Study. Practice. Ascend.")).toBeTruthy();
    const back = screen.getByLabelText("Back to League hub");
    expect(back.getAttribute("href")).toBe("/lol");
    // The tutorial entry survives the redesign as a header utility, not a
    // full-width promotion.
    expect(screen.getByTestId("replay-tutorial-link").getAttribute("href")).toBe("/quiz/tutorial");
  });
});

describe("Leaguecraft hub — hierarchy", () => {
  it("orders Ranked hero → Recent Studies → the demoted Practice panel", async () => {
    const { container } = await renderHub();
    const ranked = container.querySelector('[data-testid="hub-ranked-section"]')!;
    const recent = container.querySelector('[data-testid="hub-recent-section"]')!;
    const practice = container.querySelector('[data-testid="hub-practice-section"]')!;
    for (const el of [ranked, recent, practice]) expect(el).not.toBeNull();
    const follows = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(ranked, recent)).toBeTruthy();
    expect(follows(recent, practice)).toBeTruthy();
    expect(ranked.querySelector('[data-testid="ranked-hero"]')).not.toBeNull();
    // Mastery no longer gets a band of its own: it lives inside the study
    // panel, below Practice, as the quietest link on the page.
    expect(container.querySelector('[data-testid="hub-mastery-section"]')).toBeNull();
    expect(practice.querySelector('[data-testid="hub-mastery-link"]')).not.toBeNull();
  });

  it("the Ranked hero keeps the compact progress stats + profile link", async () => {
    const { container } = await renderHub();
    const hero = container.querySelector('[data-testid="ranked-hero"]')!;
    const strip = hero.querySelector('[data-testid="hero-stat-strip"]')!;
    expect(strip.textContent).toContain("Current streak");
    expect(strip.textContent).toContain("Best streak");
    expect(strip.textContent).toContain("71%"); // rounded accuracy
    expect(strip.textContent).not.toContain("71.2");
    expect(strip.textContent).toContain("Answered");
    expect(hero.querySelector('a[href="/profile"]')?.textContent).toMatch(/View full profile/);
  });

  it("shows unranked placement wording (2 attempts → Placement 2/5)", async () => {
    await renderHub();
    expect(screen.getByRole("heading", { name: "Placement Series" })).toBeTruthy();
    expect(screen.getAllByText("Unranked").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Complete your placement matches to establish your starting rank."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Play$/ })).toBeTruthy();
  });

  it("the Ranked CTA still reaches the Ranked flow", async () => {
    await renderHub();
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/quiz/ranked"),
    );
  });
});

describe("Leaguecraft hub — Practice for Ranked", () => {
  it("states its purpose and offers one primary action", async () => {
    await renderHub();
    expect(screen.getByRole("heading", { name: /Practice for Ranked/i })).toBeTruthy();
    expect(screen.getByText("Sharpen the knowledge used in Ranked.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("practice-primary-cta"));
    await waitFor(() =>
      expect(questionsMock).toHaveBeenCalledWith("All Current Questions", 10),
    );
  });

  it("keeps every category compact, with its real question count and start action", async () => {
    const { container } = await renderHub();
    const tiles = Array.from(container.querySelectorAll('[data-testid="practice-tile"]'));
    expect(tiles.length).toBe(SETS.length);
    // Real counts from the catalog, not invented numbers.
    const tileText = container.querySelector('[data-testid="practice-tiles"]')!.textContent!;
    expect(tileText).toContain("1,260 Q");
    expect(tileText).toContain("606 Q");
    const championTile = tiles.find((t) => t.textContent?.includes("Champion Basics"))!;
    fireEvent.click(championTile);
    await waitFor(() => expect(questionsMock).toHaveBeenCalledWith("Champion Basics", 10));
  });
});

describe("Leaguecraft hub — Recent Studies", () => {
  it("uses the real history data and the real history route", async () => {
    const { container } = await renderHub();
    expect(screen.getByRole("heading", { name: /Recent Studies/i })).toBeTruthy();
    expect(screen.getByText("How am I doing?")).toBeTruthy();
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="history-row"]').length).toBe(3),
    );
    const rows = container.querySelectorAll('[data-testid="history-row"]');
    expect(rows[0].textContent).toContain("Item Knowledge");
    expect(rows[0].textContent).toContain("8/10");
    expect(rows[0].textContent).toContain("80%");
    expect(rows[1].textContent).toContain("Daily");
    expect(rows[2].textContent).toContain("2/10");
    expect(
      screen.getByRole("link", { name: /View full history/ }).getAttribute("href"),
    ).toBe("/lol/history");
  });

  it("shows the honest empty state, whose CTA drives the Ranked flow", async () => {
    historyMock.mockResolvedValue({ ...HISTORY, results: [], total_count: 0 });
    const { container } = await renderHub();
    await waitFor(() =>
      expect(container.querySelector('[data-testid="history-empty"]')).not.toBeNull(),
    );
    expect(screen.getByText("No quiz results yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Play Ranked/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/quiz/ranked"),
    );
  });
});

describe("Leaguecraft hub — Mastery", () => {
  it("keeps Mastery as one quiet strip that still links to the journeys", async () => {
    await renderHub();
    expect(screen.getByTestId("hub-mastery-link").getAttribute("href")).toBe("/quiz/mastery");
  });
});

describe("Leaguecraft hub — modes withheld from this page", () => {
  it("does not surface Time Trial, Daily, Stat Check, Knowledge Breakdown or Achievements", async () => {
    const { container } = await renderHub();
    expect(container.querySelector('[data-testid="hub-score-attack-card"]')).toBeNull();
    expect(screen.queryByText("Daily Challenge")).toBeNull();
    expect(container.querySelector('[data-testid="hub-stat-check-link"]')).toBeNull();
    expect(screen.queryByText("Knowledge Breakdown")).toBeNull();
    expect(screen.queryByText("Achievements")).toBeNull();
    // …and the page is not simply empty in their place: the Ranked-first loop
    // is fully present.
    expect(container.querySelector('[data-testid="ranked-hero"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="hub-practice-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="hub-recent-section"]')).not.toBeNull();
  });

  it("keeps the diagnostics entry available for testing", async () => {
    await renderHub();
    expect(
      screen.getByRole("link", { name: /Diagnostics/ }).getAttribute("href"),
    ).toBe("/quiz/diagnostics");
  });
});
